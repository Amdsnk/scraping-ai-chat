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

// Function to scrape data from a page
async function scrapePageData(url, pageNum) {
  console.log(`🔍 Scraping page ${pageNum} from URL: ${url}`)

  // Extract the base URL without any existing parameters
  const baseUrl = url.split("?")[0]

  // For this specific website, construct the pagination URL
  const pageUrl = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`

  console.log(`Attempting to fetch: ${pageUrl}`)

  try {
    const response = await fetch(pageUrl)

    if (!response.ok) {
      console.error(`Failed to fetch page ${pageNum}: ${response.status} ${response.statusText}`)
      return { data: [], hasMorePages: false }
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Check if we have a table with data
    const tables = $("table")
    if (tables.length === 0) {
      console.log(`No table found on page ${pageNum}`)
      return { data: [], hasMorePages: false }
    }

    // Parse the page
    const pageData = []
    $("table tr").each((index, element) => {
      if (index === 0) return // Skip header row

      const columns = $(element).find("td")
      if (columns.length >= 3) {
        pageData.push({
          name: $(columns[0]).text().trim() || "-",
          phone: $(columns[1]).text().trim() || "-",
          location: $(columns[2]).text().trim() || "-",
        })
      }
    })

    // Check if there are more pages by looking for pagination links
    // This is specific to the website structure
    const paginationLinks = $(".page-numbers")
    const hasMorePages =
      paginationLinks.length > 0 &&
      paginationLinks.filter((i, el) => {
        const text = $(el).text().trim()
        return !isNaN(Number.parseInt(text)) && Number.parseInt(text) > pageNum
      }).length > 0

    console.log(`Found ${pageData.length} items on page ${pageNum}, hasMorePages: ${hasMorePages}`)
    return { data: pageData, hasMorePages }
  } catch (error) {
    console.error(`Error scraping page ${pageNum}:`, error)
    return { data: [], hasMorePages: false }
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
      session = {
        messages: [],
        scrapedData: null,
        currentPage: 1,
        lastUrl: null,
        allScrapedData: [],
        pageData: {}, // Store data by page number
      }
      sessions.set(newSessionId, session)
    }

    // Store the URL in the session
    const targetUrl = url || session.lastUrl
    if (targetUrl) {
      session.lastUrl = targetUrl
    } else {
      return res.status(400).json({
        error: "No URL provided and no previous URL in session",
      })
    }

    // Initialize scraped results array
    let scrapedResults = []

    // For page range requests, we'll only return data from the requested pages
    if (pageRange && pageRange.start && pageRange.end) {
      console.log(`🔍 Scraping pages ${pageRange.start} to ${pageRange.end}`)

      // Validate page range
      if (pageRange.start < 1) {
        pageRange.start = 1
      }

      if (pageRange.end < pageRange.start) {
        pageRange.end = pageRange.start
      }

      if (pageRange.end - pageRange.start > 5) {
        // Limit to reasonable range to prevent abuse
        pageRange.end = pageRange.start + 5
      }

      // Initialize page data storage if needed
      if (!session.pageData) {
        session.pageData = {}
      }

      // Scrape each page in the range
      for (let page = pageRange.start; page <= pageRange.end; page++) {
        // Check if we already have data for this page
        if (!session.pageData[page]) {
          const { data: pageData, hasMorePages } = await scrapePageData(targetUrl, page)

          if (pageData.length > 0) {
            // Store this page's data separately
            session.pageData[page] = pageData

            // If we've reached the end of available pages, break
            if (!hasMorePages && page < pageRange.end) {
              console.log(`No more pages available after page ${page}`)
              break
            }
          } else {
            // If no data on this page, we might have reached the end
            console.log(`No data found on page ${page}, might be the last page`)
            break
          }

          // Add a small delay to avoid overwhelming the server
          await new Promise((resolve) => setTimeout(resolve, 500))
        } else {
          console.log(`Using cached data for page ${page}`)
        }
      }

      // Combine only the requested pages into the results
      scrapedResults = []
      for (let page = pageRange.start; page <= pageRange.end; page++) {
        if (session.pageData[page]) {
          scrapedResults = [...scrapedResults, ...session.pageData[page]]
        }
      }

      // Update the session's current page and scraped data
      session.currentPage = pageRange.end
      session.scrapedData = scrapedResults

      console.log(`Combined ${scrapedResults.length} items from pages ${pageRange.start} to ${pageRange.end}`)
    }
    // Handle single page or next page request
    else if (pagination) {
      // For pagination requests, increment the page number
      session.currentPage = session.currentPage + 1

      // Initialize page data storage if needed
      if (!session.pageData) {
        session.pageData = {}
      }

      // Check if we already have data for this page
      if (!session.pageData[session.currentPage]) {
        const { data: pageData, hasMorePages } = await scrapePageData(targetUrl, session.currentPage)

        if (pageData.length > 0) {
          // Store this page's data separately
          session.pageData[session.currentPage] = pageData
        } else {
          return res.status(404).json({
            error: `No more data found on page ${session.currentPage}. You might have reached the end of the results.`,
          })
        }
      } else {
        console.log(`Using cached data for page ${session.currentPage}`)
      }

      // Combine all pages up to the current page
      scrapedResults = []
      for (let page = 1; page <= session.currentPage; page++) {
        if (session.pageData[page]) {
          scrapedResults = [...scrapedResults, ...session.pageData[page]]
        }
      }

      // Update the session's scraped data
      session.scrapedData = scrapedResults

      console.log(`Combined ${scrapedResults.length} items from pages 1 to ${session.currentPage}`)
    }
    // Initial request without pagination
    else {
      // For initial requests, just get page 1
      session.currentPage = 1

      // Initialize page data storage
      session.pageData = {}

      const { data: pageData } = await scrapePageData(targetUrl, 1)

      if (pageData.length > 0) {
        // Store this page's data separately
        session.pageData[1] = pageData
        scrapedResults = pageData
        session.scrapedData = scrapedResults
      } else {
        return res.status(404).json({
          error: "No breeder information found on the provided URL. Please check the URL and try again.",
        })
      }

      console.log(`Found ${scrapedResults.length} items on page 1`)
    }

    // If no data was found, return an error
    if (scrapedResults.length === 0) {
      return res.status(404).json({
        error: "No breeder information found. Please check the URL and try again.",
      })
    }

    // Store the scraped content in the database
    try {
      const { error: upsertError } = await supabase.from("scraped_content").upsert([
        {
          url: targetUrl,
          content: JSON.stringify(scrapedResults),
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

    return res.json({
      message: pageRange
        ? `Pages ${pageRange.start} to ${pageRange.end} scraped successfully`
        : `Page ${session.currentPage} scraped successfully`,
      results: scrapedResults,
      sessionId: newSessionId,
      pageRange: pageRange,
      page: session.currentPage,
      totalItems: scrapedResults.length,
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
