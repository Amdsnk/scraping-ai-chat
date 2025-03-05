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

// Update the scrape endpoint to support pagination
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

    // Parse the HTML and extract breeder information
    const $ = cheerio.load(html)
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

    // Update session with scraped data
    if (!session.scrapedData) {
      session.scrapedData = []
    }
    session.scrapedData = pagination ? [...session.scrapedData, ...newData] : newData

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
        scrapedDataContext = `Previously scraped data (${session.scrapedData.length} items):\n${JSON.stringify(session.scrapedData.slice(0, 20), null, 2)}\n\n`

        // Add a summary of the data
        scrapedDataContext += "Data summary:\n"
        const locations = new Set(session.scrapedData.map((item) => item.location).filter((loc) => loc && loc !== "-"))
        scrapedDataContext += `- Locations: ${Array.from(locations).join(", ")}\n`
        scrapedDataContext += `- Total breeders: ${session.scrapedData.length}\n\n`
      } else {
        scrapedDataContext = "No data has been scraped yet.\n\n"
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

        scrapedDataContext = `Filtered data (${filteredData.length} items):\n${JSON.stringify(filteredData.slice(0, 20), null, 2)}\n\n`
      }

      const systemMessage = {
        role: "system",
        content: `You are an AI assistant that helps users understand web content and filter scraped data. 
        ${scrapedDataContext}
        When answering questions, use the scraped or filtered data provided above. If the user asks to filter data, explain the filtering process and results.
        IMPORTANT: DO NOT say you don't have access to the data. The data has already been scraped and is available to you.
        If no data has been scraped yet, inform the user and suggest they try scraping a URL first.
        If the user asks for the next page or more results, tell them you can fetch more data by asking for "next page" or "more results".
        Always replace empty values with '-' in your responses.
        When reporting on scraped or filtered data, always include the actual values, even if they are '-'.`,
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
