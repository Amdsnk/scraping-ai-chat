import express from "express"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright"
import dotenv from "dotenv"
import cors from "cors"
import OpenAI from "openai"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080

// Enhanced logging function
const log = (message, ...args) => {
  console.log(new Date().toISOString(), message, ...args)
}

const logMemoryUsage = () => {
  const used = process.memoryUsage()
  log(`Memory usage: ${Math.round(used.rss / 1024 / 1024)}MB`)
}

// Call this periodically or before heavy operations
logMemoryUsage()

// Log all environment variables (be careful with sensitive information)
log("Environment variables:", process.env)

// Improved CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "https://scraping-ai-chat.vercel.app",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}

app.use(cors(corsOptions))
app.use(express.json({ limit: "10mb" }))

// Initialize clients with error handling
let supabase
try {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  log("Supabase client initialized successfully")
} catch (error) {
  log("Error initializing Supabase client:", error)
}

let openai
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  log("OpenAI client initialized successfully")
} catch (error) {
  log("Error initializing OpenAI client:", error)
}

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  log("Health check requested")
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() })
})

// Root route
app.get("/", (req, res) => {
  log("Root route accessed")
  res.json({
    message: "Welcome to the AI Web Scraping Chat API",
    endpoints: {
      chat: "/api/chat",
      health: "/health",
    },
    version: "1.0.0",
    status: "online",
  })
})

async function scrapeWebsite(url, pages = 1) {
  log(`Starting scrape of ${url} for ${pages} pages`)
  logMemoryUsage()

  let browser = null
  let context = null
  let page = null
  let allResults = []
  let timeout = null

  try {
    // Set a timeout for the entire scraping operation
    const scrapePromise = new Promise(async (resolve, reject) => {
      try {
        // Playwright browser launch with Railway-compatible options
        browser = await chromium.launch({
          headless: true,
          args: [
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--single-process",
            "--no-zygote",
            "--disable-extensions",
          ],
        })

        context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          viewport: { width: 1280, height: 720 },
        })

        page = await context.newPage()

        // Set navigation timeout
        page.setDefaultNavigationTimeout(30000)

        for (let currentPage = 1; currentPage <= pages; currentPage++) {
          log(`Scraping page ${currentPage} of ${pages}`)

          const pageUrl = currentPage === 1 ? url : `${url}?page=${currentPage}`
          await page.goto(pageUrl, { waitUntil: "networkidle" })

          try {
            // Wait for selector with a reasonable timeout
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
            log(`Found ${pageResults.length} results on page ${currentPage}`)

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
              log(`No more pages found after page ${currentPage}`)
              break
            }
          } catch (pageError) {
            console.error(`Error on page ${currentPage}:`, pageError.message)
            // Continue to next page even if current page fails
            continue
          }
        }

        resolve(allResults)
      } catch (error) {
        reject(error)
      }
    })

    // Set a timeout for the entire scraping operation
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error("Scraping timed out after 60 seconds"))
      }, 60000) // 60 second timeout
    })

    // Race between scraping and timeout
    allResults = await Promise.race([scrapePromise, timeoutPromise])
  } catch (error) {
    console.error("Scraping error:", error.message)
    // Return empty array instead of failing completely
    allResults = []
  } finally {
    // Clear timeout if it exists
    if (timeout) clearTimeout(timeout)

    // Close browser resources
    if (page) await page.close().catch((e) => console.error("Error closing page:", e.message))
    if (context) await context.close().catch((e) => console.error("Error closing context:", e.message))
    if (browser) await browser.close().catch((e) => console.error("Error closing browser:", e.message))

    logMemoryUsage()
    log(`Scraping completed with ${allResults.length} total results`)
  }

  return allResults
}

app.post("/api/chat", async (req, res) => {
  try {
    log("Received chat request")
    logMemoryUsage()

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
        console.error("Session error:", sessionError)
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

        if (error) {
          console.error("New session error:", error)
          throw error
        }
        session = newSession
      }
    } else {
      const { data: newSession, error } = await supabase
        .from("sessions")
        .insert({ messages: [], results: [] })
        .select()
        .single()

      if (error) {
        console.error("New session error:", error)
        throw error
      }
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
      log("Processing scraping request")

      // Extract URL and page count
      const url = message.match(/https?:\/\/[^\s]+/)?.[0] || "https://herefordsondemand.com/find-a-breeder/"
      const pageMatch = message.match(/page\s+(\d+)\s+until\s+(\d+)/i)
      const pages = pageMatch ? Number.parseInt(pageMatch[2]) : 1

      log(`Scraping URL: ${url}, Pages: ${pages}`)

      try {
        // Scrape the website with a timeout
        const scrapingPromise = scrapeWebsite(url, pages)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Scraping operation timed out")), 90000) // 90 second timeout
        })

        const scrapingResults = await Promise.race([scrapingPromise, timeoutPromise])
        session.results = scrapingResults

        log(`Scraping completed with ${scrapingResults.length} results`)

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
          max_tokens: 500,
        })

        response = aiResponse.choices[0].message.content
      } catch (scrapingError) {
        console.error("Scraping operation failed:", scrapingError.message)

        // Fallback response if scraping fails
        const aiResponse = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            {
              role: "user",
              content: `The user asked: "${message}". I tried to scrape the website but encountered an error: ${scrapingError.message}. Please provide a helpful response explaining the issue and suggesting alternatives.`,
            },
          ],
          max_tokens: 500,
        })

        response = aiResponse.choices[0].message.content
        session.results = []
      }
    } else {
      // Regular chat message
      log("Processing regular chat message")

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          ...session.messages.slice(-5), // Include recent conversation history
        ],
        max_tokens: 500,
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

    if (error) {
      console.error("Session update error:", error)
      throw error
    }

    // Send response
    res.json({
      text: response,
      results: session.results,
      sessionId: session.id,
    })

    logMemoryUsage()
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: "Internal server error", details: error.message })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  log("Error caught in middleware:", err)
  res.status(500).json({ error: "Something went wrong!", details: err.message })
})

// 404 handler
app.use((req, res) => {
  log("404 - Not Found:", req.originalUrl)
  res.status(404).json({ error: "Not Found", message: "The requested resource does not exist." })
})

// Start the server
const server = app.listen(PORT, "0.0.0.0", () => {
  log(`Server running on http://0.0.0.0:${PORT}`)
  log(`CORS configured for: ${corsOptions.origin}`)
  logMemoryUsage()
})

// Handle server errors
server.on("error", (error) => {
  log("Server error:", error)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  log("SIGTERM signal received: closing HTTP server")
  server.close(() => {
    log("HTTP server closed")
  })
})
