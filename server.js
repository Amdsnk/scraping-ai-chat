import express from "express"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright"
import dotenv from "dotenv"
import cors from "cors"
import OpenAI from "openai"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

const logMemoryUsage = () => {
  const used = process.memoryUsage();
  console.log(`Memory usage: ${Math.round(used.rss / 1024 / 1024)}MB`);
};

// Call this periodically or before heavy operations
logMemoryUsage();

// Improved CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "https://scraping-ai-chat.vercel.app",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Enable credentials (cookies, authorization headers)
}

app.use(cors(corsOptions))
app.use(express.json())

// Initialize clients with error handling
const supabase = createClient(process.env.SUPABASE_URL || "https://hjcvkrxwdmfkgvjwynxm.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqY3Zrcnh3ZG1ma2d2and5bnhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTAyMTMwMywiZXhwIjoyMDU2NTk3MzAzfQ.HjIYUIrTDYMR-dq3LR9UD8iuXFU71xLdWOAhTe1nB0Y")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "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",
})

async function scrapeWebsite(url, pages = 1) {
  const browser = await chromium.launch({
    // Add headless browser options for better performance in production
    headless: true,
    args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  let allResults = []

  try {
    for (let currentPage = 1; currentPage <= pages; currentPage++) {
      const pageUrl = currentPage === 1 ? url : `${url}?page=${currentPage}`
      await page.goto(pageUrl, { waitUntil: "networkidle" })

      await page.waitForSelector(".breeder-card", { timeout: 10000 })

      // Extract data from the page
      const pageResults = await page.evaluate(() => {
        const breeders = []
        const cards = document.querySelectorAll(".breeder-card")

        cards.forEach((card) => {
          const nameElement = card.querySelector(".breeder-name")
          const phoneElement = card.querySelector(".breeder-phone")
          const locationElement = card.querySelector(".breeder-location")

          breeders.push({
            name: nameElement ? nameElement.textContent.trim() : "-",
            phone: phoneElement ? phoneElement.textContent.trim() : "-",
            location: locationElement ? locationElement.textContent.trim() : "-",
          })
        })

        return breeders
      })

      allResults = [...allResults, ...pageResults]

      // Check if there's a next page
      const hasNextPage = await page.evaluate((currentPage) => {
        const paginationLinks = document.querySelectorAll(".pagination a")
        for (const link of paginationLinks) {
          if (link.textContent.includes(String(currentPage + 1))) {
            return true
          }
        }
        return false
      }, currentPage)

      if (!hasNextPage && currentPage < pages) {
        break
      }
    }
  } catch (error) {
    console.error("Scraping error:", error)
  } finally {
    await browser.close()
  }

  return allResults
}

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the AI Web Scraping Chat API",
    endpoints: {
      chat: "/api/chat",
    },
    version: "1.0.0",
    status: "online",
  })
})

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body

    if (!message) {
      return res.status(400).json({ error: "Message is required" })
    }

    // Get or create session
    let session
    if (sessionId) {
      const { data: existingSession, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single()

      if (sessionError && sessionError.code !== "PGRST116") {
        throw sessionError
      }

      if (existingSession) {
        session = existingSession
      } else {
        const { data: newSession, error } = await supabase
          .from("sessions")
          .insert({ messages: [], results: [] })
          .select()
          .single()

        if (error) throw error
        session = newSession
      }
    } else {
      const { data: newSession, error } = await supabase
        .from("sessions")
        .insert({ messages: [], results: [] })
        .select()
        .single()

      if (error) throw error
      session = newSession
    }

    // Initialize messages array if it doesn't exist
    if (!session.messages) {
      session.messages = []
    }

    // Initialize results array if it doesn't exist
    if (!session.results) {
      session.results = []
    }

    // Add user message to session
    session.messages.push({ role: "user", content: message })

    // Check if the message is a scraping request
    let response
    if (message.toLowerCase().includes("from the url")) {
      // Extract URL and page count
      const url = message.match(/https?:\/\/[^\s]+/)?.[0] || "https://herefordsondemand.com/find-a-breeder/"
      const pageMatch = message.match(/page\s+(\d+)\s+until\s+(\d+)/i)
      const pages = pageMatch ? Number.parseInt(pageMatch[2]) : 1

      // Scrape the website
      const scrapingResults = await scrapeWebsite(url, pages)
      session.results = scrapingResults

      // Process with AI
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
            role: "user",
            content: `The user asked: "${message}". I've scraped the website and found ${scrapingResults.length} breeders. Please provide a helpful response summarizing what I found.`,
          },
        ],
      })

      response = aiResponse.choices[0].message.content
    } else {
      // Regular chat message
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          ...session.messages.slice(-5), // Include recent conversation history
          {
            role: "user",
            content: `Based on the conversation history and available data, please provide a helpful response to: "${message}".`,
          },
        ],
      })

      response = aiResponse.choices[0].message.content
    }

    // Add AI response to session
    session.messages.push({ role: "assistant", content: response })

    // Update session in Supabase
    const { error } = await supabase
      .from("sessions")
      .update({
        messages: session.messages,
        results: session.results,
      })
      .eq("id", session.id)

    if (error) throw error

    // Send response
    res.json({
      text: response,
      results: session.results,
      sessionId: session.id,
    })
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Something went wrong!", details: err.message })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", message: "The requested resource does not exist." })
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`CORS configured for: ${corsOptions.origin}`)
})

