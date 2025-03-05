import express from "express"
import cors from "cors"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import dotenv from "dotenv"
import rateLimit from "express-rate-limit"

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

// Chat endpoint - handle both GET and POST
app.all("/api/chat", async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ message: "Chat API is ready" })
  } else if (req.method === "POST") {
    try {
      console.log("Received request body:", JSON.stringify(req.body, null, 2))

      let messages
      if (req.body.message) {
        messages = [{ role: "user", content: req.body.message }]
      } else if (req.body.messages && Array.isArray(req.body.messages)) {
        messages = req.body.messages
      } else {
        return res.status(400).json({
          error: "Invalid request. Either a message string or messages array is required.",
          receivedBody: req.body,
        })
      }

      const urls = req.body.urls || []

      // Process the chat request
      let contextData = []

      if (urls.length > 0) {
        const { data, error } = await supabase.from("scraped_content").select("*").in("url", urls)
        if (error) {
          console.error("❌ Supabase error:", error)
        } else if (data) {
          contextData = data
        }
      }

      const context = contextData.map((item) => `URL: ${item.url}\nContent: ${item.content}`).join("\n\n")

      const systemMessage = {
        role: "system",
        content: `You are an AI assistant that helps users understand web content. ${
          context
            ? `Here is the content from the URLs provided:\n\n${context}`
            : "No specific web content has been provided."
        }`,
      }

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [systemMessage, ...messages],
          stream: false,
        })
        res.json(completion.choices[0].message)
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
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: "URL is required" })
    }

    // Your scraping logic here
    // ...

    // For now, let's return a mock response
    res.json({
      message: "URL scraped successfully",
      results: [{ name: "Example Breeder", phone: "123-456-7890", location: "Example City, State" }],
    })
  } catch (error) {
    console.error("❌ Error processing scrape request:", error)
    res.status(500).json({
      error: "An error occurred while processing your request",
      details: error.message,
    })
  }
})

// Helper function to extract breeder information from HTML content
function extractBreederInfo(html, url) {
  try {
    // This is a simple extraction example - in a real app, you'd use a proper HTML parser
    // For demonstration purposes, we'll use regex patterns to extract information

    const nameRegex = /<h1[^>]*>(.*?)<\/h1>/gi
    const phoneRegex = /($$\d{3}$$\s*\d{3}-\d{4}|\d{3}-\d{3}-\d{4})/g
    const locationRegex = /<address[^>]*>(.*?)<\/address>/gis

    // Extract matches
    const nameMatches = [...html.matchAll(nameRegex)].map((match) => match[1].trim())
    const phoneMatches = html.match(phoneRegex) || []
    const locationMatches = [...html.matchAll(locationRegex)].map((match) =>
      match[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )

    // If we couldn't find structured data, try a more generic approach
    if (!nameMatches.length || !phoneMatches.length || !locationMatches.length) {
      // Use OpenAI to extract the information
      return extractWithAI(html, url)
    }

    // Combine the extracted information
    const results = []
    const maxItems = Math.max(nameMatches.length, phoneMatches.length, locationMatches.length)

    for (let i = 0; i < maxItems; i++) {
      results.push({
        name: nameMatches[i % nameMatches.length] || "Unknown",
        phone: phoneMatches[i % phoneMatches.length] || "Unknown",
        location: locationMatches[i % locationMatches.length] || "Unknown",
      })
    }

    return results
  } catch (error) {
    console.error("❌ Error extracting breeder info:", error)
    return []
  }
}

// Helper function to extract information using AI
async function extractWithAI(html, url) {
  try {
    // Simplify the HTML to reduce token usage
    const simplifiedHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .substring(0, 10000) // Limit to 10,000 characters

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a data extraction assistant. Extract breeder information from the provided HTML content.
          Return ONLY a JSON array with objects containing name, phone, and location properties.
          Format: [{"name": "Breeder Name", "phone": "123-456-7890", "location": "City, State"}]
          If you can't find the information, return an empty array.`,
        },
        {
          role: "user",
          content: `Extract breeder information from this URL: ${url}\n\nHTML Content: ${simplifiedHtml}`,
        },
      ],
      temperature: 0.3,
    })

    const responseText = completion.choices[0].message.content

    // Try to parse the JSON response
    try {
      // Extract JSON array from the response
      const jsonMatch = responseText.match(/\[\s*\{.*\}\s*\]/s)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return []
    } catch (parseError) {
      console.error("❌ Error parsing AI response:", parseError)
      return []
    }
  } catch (error) {
    console.error("❌ Error using AI for extraction:", error)
    return []
  }
}

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`)
})
