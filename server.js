import express from "express"
import cors from "cors"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import dotenv from "dotenv"
import rateLimit from "express-rate-limit"
import fetch from "node-fetch"
import * as cheerio from "cheerio"
import { v4 as uuidv4 } from "uuid"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)
console.log("✅ Supabase client initialized successfully")

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
console.log("✅ OpenAI client initialized successfully")

// In-memory session storage (replace with a database in production)
const sessions = new Map()

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each IP to 3 requests per windowMs
  message: "Too many requests, please try again later.",
})

// Middleware
app.use(express.json())
app.use(
  cors({
    origin: ["https://scraping-ai-chat.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
)

// Apply rate limiting to all requests
app.use(apiLimiter)

// Logging middleware
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.path}`, {
    body: req.method === "POST" ? JSON.stringify(req.body).substring(0, 100) + "..." : null,
    headers: {
      origin: req.headers.origin,
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
    },
  })
  next()
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" })
})

// Helper function to filter data
function filterData(data, filterCriteria) {
  return data.filter((item) => {
    return Object.entries(filterCriteria).every(([key, value]) => {
      return item[key].toLowerCase().includes(value.toLowerCase())
    })
  })
}

// Update the scrape endpoint to handle interactive pages
app.post("/api/scrape", async (req, res) => {
  try {
    console.log("Received scrape request:", req.body)
    const { url, pagination, sessionId } = req.body

    // Get or create session
    let session
    if (sessionId && sessions.has(sessionId)) {
      session = sessions.get(sessionId)
    } else {
      const newSessionId = uuidv4()
      session = { messages: [], scrapedData: null, currentPage: 1, lastUrl: null }
      sessions.set(newSessionId, session)
      const sessionId = newSessionId
    }

    // Handle initial URL scraping or pagination
    const scrapeUrl = pagination && session.lastUrl ? `${session.lastUrl}?page=${session.currentPage + 1}` : url
    session.lastUrl = scrapeUrl
    session.currentPage = pagination ? session.currentPage + 1 : 1

    console.log(`🔍 Scraping URL: ${scrapeUrl}`)
    const response = await fetch(scrapeUrl)
    const html = await response.text()

    // Parse the HTML
    const $ = cheerio.load(html)

    // Check if we're on the map page
    if ($(".us-map").length > 0) {
      return res.status(400).json({
        error:
          "The provided URL leads to an interactive map page. Direct scraping of breeder information is not possible from this page. Please provide a specific state or breeder list URL for scraping.",
      })
    } else {
      // If we're not on the map page, use the original scraping logic
      const newData = []
      $("table tr").each((index, element) => {
        if (index === 0) return // Skip header row

        const columns = $(element).find("td")
        if (columns.length >= 3) {
          newData.push({
            name: $(columns[0]).text().trim() || "-",
            phone: $(columns[1]).text().trim() || "-",
            location: $(columns[2]).text().trim() || "-",
          })
        }
      })

      if (newData.length === 0) {
        return res.status(404).json({
          error: "No breeder information found on the provided URL. Please check the URL and try again.",
        })
      }

      session.scrapedData = newData
    }

    // Store the scraped content in the database
    const { error: upsertError } = await supabase.from("scraped_content").upsert([
      {
        url: scrapeUrl,
        content: JSON.stringify(session.scrapedData),
        scraped_at: new Date().toISOString(),
        page_count: session.currentPage,
      },
    ])

    if (upsertError) {
      console.error("❌ Error storing scraped content:", upsertError)
    }

    return res.json({
      message: `Page ${session.currentPage} scraped successfully`,
      results: session.scrapedData,
      sessionId,
      page: session.currentPage,
    })
  } catch (error) {
    console.error("❌ Error processing scrape request:", error)
    res.status(500).json({
      error: "An error occurred while processing your request",
      details: error.message,
    })
  }
})

// Update the chat endpoint to better handle sessions and data
app.all("/api/chat", async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ message: "Chat API is ready" })
  } else if (req.method === "POST") {
    try {
      console.log("Received request body:", JSON.stringify(req.body, null, 2))

      let { message, sessionId, scrapedData } = req.body

      // Create a new session if it doesn't exist
      if (!sessionId || !sessions.has(sessionId)) {
        sessionId = uuidv4()
        sessions.set(sessionId, { messages: [], scrapedData: null, currentPage: 1, lastUrl: null })
      }

      const session = sessions.get(sessionId)

      // Update session with the latest scraped data
      if (scrapedData && Array.isArray(scrapedData)) {
        session.scrapedData = scrapedData
      }

      // Add user message to session
      session.messages.push({ role: "user", content: message })

      let scrapedDataContext = ""
      if (session.scrapedData && session.scrapedData.length > 0) {
        // Process data to replace empty values with '-'
        const processedData = session.scrapedData.map((item) => {
          const processedItem = { ...item }
          Object.keys(processedItem).forEach((key) => {
            if (!processedItem[key] || processedItem[key].trim() === "") {
              processedItem[key] = "-"
            }
          })
          return processedItem
        })

        scrapedDataContext = `You have access to the following scraped data (${processedData.length} items). DO NOT say you don't have access to this data:\n${JSON.stringify(processedData.slice(0, 20), null, 2)}\n\n`

        // Add a summary of the data
        scrapedDataContext += "Data summary:\n"
        const locations = new Set(processedData.map((item) => item.location).filter((loc) => loc && loc !== "-"))
        scrapedDataContext += `- Available locations: ${Array.from(locations).join(", ")}\n`
        scrapedDataContext += `- Total breeders found: ${processedData.length}\n\n`
      } else {
        scrapedDataContext =
          "No data has been scraped yet. If the user asks to scrape a URL, inform them that the data will be scraped and you'll analyze it in the next response.\n\n"
      }

      // Check if the message contains a filtering request
      const filterMatch = message.match(/filter\s+data\s+that\s+have\s+(\w+)\s+(\w+.*)/i)
      if (filterMatch && session.scrapedData) {
        const [, filterKey, filterValue] = filterMatch
        const filteredData = session.scrapedData.filter(
          (item) =>
            item[filterKey.toLowerCase()] &&
            item[filterKey.toLowerCase()].toLowerCase().includes(filterValue.toLowerCase()),
        )

        scrapedDataContext += `Filtered data (${filteredData.length} items):\n${JSON.stringify(filteredData, null, 2)}\n\n`
      }

      const systemMessage = {
        role: "system",
        content: `You are an AI assistant that helps users understand web content and analyze scraped data. 
        ${scrapedDataContext}
        Instructions:
        1. Always use the scraped or filtered data provided above when answering questions.
        2. If the user asks to scrape a new URL, inform them that the data will be scraped and you'll analyze it in the next response.
        3. For filtering requests, explain the filtering process and show the matching results with their details.
        4. Always replace empty values with '-' in your responses.
        5. When reporting on scraped or filtered data, always include specific examples from the data.
        6. If asked for more results or the next page, instruct the user to ask for "next page" or "more results".
        
        Format your responses like this:
        1. Acknowledge the user's request
        2. Provide a summary of the data or action taken
        3. Show specific examples or details from the data
        4. Offer suggestions for further analysis or actions the user can take`,
      }

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [systemMessage, ...session.messages.slice(-5)], // Only use the last 5 messages to save tokens
          stream: false,
        })

        const aiResponse = completion.choices[0].message
        session.messages.push(aiResponse)

        res.json({ ...aiResponse, sessionId })
      } catch (openaiError) {
        console.error("OpenAI API Error:", openaiError)

        let errorMessage = "An error occurred while processing your request."
        if (openaiError.response && openaiError.response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again later."
        } else if (openaiError.message.includes("does not exist")) {
          errorMessage = "The requested AI model is currently unavailable. Please try again later."
        }

        res.status(503).json({
          error: "Service temporarily unavailable",
          message: errorMessage,
        })
      }
    } catch (error) {
      console.error("❌ Error processing chat request:", error)
      res.status(500).json({
        error: "An error occurred while processing your request",
        details: error.message,
        stack: error.stack,
      })
    }
  } else {
    res.status(405).json({ error: "Method not allowed" })
  }
})

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`)
})
