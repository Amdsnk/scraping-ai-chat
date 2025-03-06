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

// Update the scrapeBreederPage function to better handle pagination
async function scrapeBreederPage(url, pageNum) {
  try {
    // For this specific website, construct the pagination URL
    // First page doesn't need a page parameter
    const baseUrl = url.split("?")[0] // Remove any existing query parameters
    const pageUrl = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`

    console.log(`Scraping page ${pageNum} from: ${pageUrl}`)

    const response = await fetch(pageUrl, {
      timeout: 10000, // 10 second timeout
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch page ${pageNum}: ${response.status} ${response.statusText}`)
      return { data: [], hasMorePages: false, totalEntries: 0 }
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract total entries from the page
    const showingText = $("body")
      .text()
      .match(/Showing .* of (\d+) entries/)
    const totalEntries = showingText ? Number.parseInt(showingText[1]) : 0
    const entriesPerPage = 25 // This website shows 25 entries per page

    // Extract data from the table
    const breeders = []
    $("table tr").each((index, element) => {
      // Skip header row
      if (index === 0) return

      const columns = $(element).find("td")
      if (columns.length >= 3) {
        const name = $(columns[0]).text().trim() || "-"
        const phone = $(columns[1]).text().trim() || "-"
        const location = $(columns[2]).text().trim() || "-"

        // Create a unique ID from the data to help with deduplication
        const uniqueId = `${name}-${phone}-${location}`.toLowerCase().replace(/\s+/g, "")

        breeders.push({
          id: uniqueId,
          name,
          phone,
          location,
        })
      }
    })

    // Check if there are more pages
    const currentEntries = (pageNum - 1) * entriesPerPage + breeders.length
    const hasMorePages = currentEntries < totalEntries

    console.log(`Found ${breeders.length} breeders on page ${pageNum}, total entries: ${totalEntries}`)
    return {
      data: breeders,
      hasMorePages,
      totalEntries,
      entriesPerPage,
    }
  } catch (error) {
    console.error(`Error scraping page ${pageNum}:`, error)
    return { data: [], hasMorePages: false, totalEntries: 0, entriesPerPage: 25 }
  }
}

// Update the scrape endpoint to handle interactive pages
app.post("/api/scrape", async (req, res) => {
  try {
    console.log("Received scrape request:", req.body)
    const { url, pagination, pageRange, sessionId } = req.body

    // Get or create session
    let session
    let newSessionId = sessionId
    if (sessionId && sessions.has(sessionId)) {
      session = sessions.get(sessionId)
    } else {
      newSessionId = uuidv4()
      session = { messages: [], scrapedData: null, currentPage: 1, lastUrl: null }
      sessions.set(newSessionId, session)
    }

    // Store the URL in the session
    const targetUrl = url || session.lastUrl
    if (!targetUrl) {
      return res.status(400).json({
        error: "No URL provided and no previous URL in session",
      })
    }
    session.lastUrl = targetUrl

    // Initialize results array
    let results = []

    // Then update the scrape endpoint to handle page ranges correctly
    // Replace the page range handling section in the /api/scrape endpoint with this:

    // Handle page range requests (e.g., "page 1 to 2")
    if (pageRange && pageRange.start && pageRange.end) {
      console.log(`Processing page range request: pages ${pageRange.start} to ${pageRange.end}`)

      // Validate page range
      const start = Math.max(1, pageRange.start)
      const end = Math.min(start + 5, pageRange.end) // Limit to 5 pages max

      // Use a Map to deduplicate results
      const resultsMap = new Map()
      let totalEntries = 0
      let entriesPerPage = 25

      // Scrape each page in the range
      for (let page = start; page <= end; page++) {
        const {
          data: pageData,
          hasMorePages,
          totalEntries: total,
          entriesPerPage: perPage,
        } = await scrapeBreederPage(targetUrl, page)

        if (pageData.length === 0) {
          console.log(`No data found on page ${page}, stopping pagination`)
          break
        }

        // Update our pagination info
        totalEntries = total
        entriesPerPage = perPage

        // Add to results map for deduplication
        pageData.forEach((item) => {
          if (item.id && !resultsMap.has(item.id)) {
            resultsMap.set(item.id, item)
          }
        })

        // If we've reached the end of available pages, break
        if (!hasMorePages && page < end) {
          console.log(`No more pages available after page ${page}`)
          break
        }

        // Add a small delay between requests
        if (page < end) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      // Convert map back to array and remove the temporary ID field
      results = Array.from(resultsMap.values())
        .map((item) => {
          const { id, ...rest } = item
          return rest
        })
        // Limit results to the expected number of entries for the requested pages
        .slice(0, (end - start + 1) * entriesPerPage)

      session.currentPage = end
      console.log(`Returning ${results.length} results for pages ${start} to ${end}`)
    }
    // Handle "next page" requests
    else if (pagination) {
      const nextPage = session.currentPage + 1
      console.log(`Processing pagination request for page ${nextPage}`)

      const { data: pageData, hasMorePages } = await scrapeBreederPage(targetUrl, nextPage)

      if (pageData.length === 0) {
        return res.status(404).json({
          error: `No more data found on page ${nextPage}. You might have reached the end of the results.`,
        })
      }

      // If we already have data, combine it with the new data (with deduplication)
      if (session.scrapedData && Array.isArray(session.scrapedData)) {
        // Create a map of existing items by a unique key
        const existingItems = new Map()
        session.scrapedData.forEach((item) => {
          const uniqueId = `${item.name}-${item.phone}-${item.location}`.toLowerCase().replace(/\s+/g, "")
          existingItems.set(uniqueId, item)
        })

        // Add new items, avoiding duplicates
        pageData.forEach((item) => {
          if (item.id && !existingItems.has(item.id)) {
            const { id, ...rest } = item
            existingItems.set(item.id, rest)
          }
        })

        results = Array.from(existingItems.values())
      } else {
        // Just use the new data if we don't have existing data
        results = pageData.map((item) => {
          const { id, ...rest } = item
          return rest
        })
      }

      session.currentPage = nextPage
    }
    // Initial request (just page 1)
    else {
      console.log(`Processing initial request for page 1`)

      const { data: pageData } = await scrapeBreederPage(targetUrl, 1)

      if (pageData.length === 0) {
        return res.status(404).json({
          error: "No breeder information found on the provided URL. Please check the URL and try again.",
        })
      }

      // Remove the temporary ID field
      results = pageData.map((item) => {
        const { id, ...rest } = item
        return rest
      })

      session.currentPage = 1
    }

    // Update session data
    session.scrapedData = results

    // Store the scraped content in the database
    try {
      const { error: upsertError } = await supabase.from("scraped_content").upsert([
        {
          url: targetUrl,
          content: JSON.stringify(results),
          scraped_at: new Date().toISOString(),
          page_count: pageRange ? pageRange.end - pageRange.start + 1 : session.currentPage,
        },
      ])

      if (upsertError) {
        console.error("❌ Error storing scraped content:", upsertError)
      }
    } catch (dbError) {
      console.error("Database storage error:", dbError)
      // Continue even if database storage fails
    }

    // Return the results
    return res.json({
      message: pageRange
        ? `Pages ${pageRange.start} to ${pageRange.end} scraped successfully`
        : `Page ${session.currentPage} scraped successfully`,
      results: results,
      sessionId: newSessionId,
      pageRange: pageRange,
      page: session.currentPage,
      totalItems: results.length,
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

      let { message, sessionId, scrapedData, isFollowUp, originalQuery } = req.body

      // Create a new session if it doesn't exist
      let newSessionId = sessionId
      if (!sessionId || !sessions.has(sessionId)) {
        newSessionId = uuidv4()
        sessions.set(newSessionId, { messages: [], scrapedData: null, currentPage: 1, lastUrl: null })
      }

      const session = sessions.get(newSessionId)

      // Update session with the latest scraped data
      if (scrapedData && Array.isArray(scrapedData)) {
        session.scrapedData = scrapedData
      }

      // For follow-up requests, use the original query for better context
      if (isFollowUp && originalQuery) {
        console.log("Follow-up analysis request for original query:", originalQuery)
        message = originalQuery
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

        scrapedDataContext = `You have access to the following scraped data (${processedData.length} items). DO NOT say you don't have access to this data or that you will analyze it in the next response - provide a complete analysis now:\n${JSON.stringify(processedData.slice(0, 20), null, 2)}\n\n`

        if (processedData.length > 20) {
          scrapedDataContext += `Note: This is a sample of the data. There are ${processedData.length} total items.\n\n`
        }

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

      // Customize the system message for follow-up requests
      let systemPrompt = ""
      if (isFollowUp) {
        systemPrompt = `You are an AI assistant that helps users analyze scraped data. 
        ${scrapedDataContext}
        
        IMPORTANT: The user has just scraped this data and is waiting for your analysis. 
        DO NOT say you will analyze the data in the next response. 
        You MUST provide a complete analysis now based on their original query: "${originalQuery}".
        
        Your analysis should include:
        1. A summary of what was scraped (number of items, types of data)
        2. Key information extracted from the data
        3. Sample entries that showcase the data
        4. Suggestions for what the user might want to do with this data`
      } else {
        systemPrompt = `You are an AI assistant that helps users understand web content and analyze scraped data. 
        ${scrapedDataContext}
        Instructions:
        1. Always use the scraped or filtered data provided above when answering questions.
        2. If the user asks to scrape a new URL, inform them that the data will be scraped and you'll analyze it in the next response.
        3. For filtering requests, explain the filtering process and show the matching results with their details.
        4. Always replace empty values with '-' in your responses.
        5. When reporting on scraped or filtered data, always include specific examples from the data.
        6. If asked for more results or the next page, instruct the user to ask for "next page", "more results", or "scrape page X to Y".
        
        Format your responses like this:
        1. Acknowledge the user's request
        2. Provide a summary of the data or action taken
        3. Show specific examples or details from the data
        4. Offer suggestions for further analysis or actions the user can take`
      }

      const systemMessage = {
        role: "system",
        content: systemPrompt,
      }

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [systemMessage, ...session.messages.slice(-5)], // Only use the last 5 messages to save tokens
          stream: false,
        })

        const aiResponse = completion.choices[0].message
        session.messages.push(aiResponse)

        res.json({ ...aiResponse, sessionId: newSessionId })
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
