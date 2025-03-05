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

// Chat endpoint - handle both GET and POST
app.all("/api/chat", async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ message: "Chat API is ready" })
  } else if (req.method === "POST") {
    try {
      console.log("Received request body:", JSON.stringify(req.body, null, 2))

      let { message, sessionId } = req.body

      // Create a new session if it doesn't exist
      if (!sessionId || !sessions.has(sessionId)) {
        sessionId = uuidv4()
        sessions.set(sessionId, { messages: [], scrapedData: null })
      }

      const session = sessions.get(sessionId)

      // Add user message to session
      session.messages.push({ role: "user", content: message })

      let scrapedDataContext = ""
      if (session.scrapedData) {
        scrapedDataContext = `Previously scraped data:\n${JSON.stringify(session.scrapedData, null, 2)}\n\n`
      }

      // Check if the message contains a filtering request
      const filterMatch = message.match(/filter\s+data\s+that\s+have\s+(\w+)\s+(\w+.*)/i)
      if (filterMatch && session.scrapedData) {
        const [, filterKey, filterValue] = filterMatch
        const filteredData = filterData(session.scrapedData, { [filterKey.toLowerCase()]: filterValue })
        scrapedDataContext = `Filtered data:\n${JSON.stringify(filteredData, null, 2)}\n\n`
      }

      const systemMessage = {
        role: "system",
        content: `You are an AI assistant that helps users understand web content and filter scraped data. 
        ${scrapedDataContext}
        When answering questions, use the scraped or filtered data provided above. If the user asks to filter data, explain the filtering process and results.
        If you don't have specific information, you can say so, but don't claim you can't access the data - it has already been provided to you.`,
      }

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [systemMessage, ...session.messages],
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

// Scrape endpoint
app.post("/api/scrape", async (req, res) => {
  try {
    console.log("Received scrape request:", req.body)
    const { url, sessionId } = req.body

    if (!url) {
      return res.status(400).json({ error: "URL is required" })
    }

    // Check if we already have this URL in the database
    const { data: existingData, error: dbError } = await supabase
      .from("scraped_content")
      .select("*")
      .eq("url", url)
      .single()

    if (dbError && dbError.code !== "PGRST116") {
      console.error("❌ Supabase error:", dbError)
      return res.status(500).json({ error: "Database error", details: dbError })
    }

    let scrapedData
    if (existingData) {
      console.log("✅ Found existing data for URL:", url)
      scrapedData = JSON.parse(existingData.content)
    } else {
      // If not in database, scrape the URL
      console.log("🔍 Scraping URL:", url)
      const response = await fetch(url)
      const html = await response.text()

      // Parse the HTML and extract breeder information
      const $ = cheerio.load(html)
      scrapedData = []

      $("table tr").each((index, element) => {
        if (index === 0) return // Skip header row

        const columns = $(element).find("td")
        if (columns.length >= 3) {
          scrapedData.push({
            name: $(columns[0]).text().trim(),
            phone: $(columns[1]).text().trim(),
            location: $(columns[2]).text().trim(),
          })
        }
      })

      // Store the scraped content in the database
      const { error: insertError } = await supabase
        .from("scraped_content")
        .insert([{ url, content: JSON.stringify(scrapedData), scraped_at: new Date().toISOString() }])

      if (insertError) {
        console.error("❌ Error storing scraped content:", insertError)
      }
    }

    // Update session with scraped data
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)
      session.scrapedData = scrapedData
    }

    return res.json({
      message: "URL scraped successfully",
      results: scrapedData,
      sessionId,
    })
  } catch (error) {
    console.error("❌ Error processing scrape request:", error)
    res.status(500).json({
      error: "An error occurred while processing your request",
      details: error.message,
    })
  }
})

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`)
})
