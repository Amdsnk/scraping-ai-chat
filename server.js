import express from "express"
import cors from "cors"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import dotenv from "dotenv"

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

// Middleware
app.use(express.json())
app.use(
  cors({
    origin: ["https://scraping-ai-chat.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  }),
)

// Health check endpoint
app.get("/health", (req, res) => {
  console.log("📩 Request received: GET /health", {
    origin: req.headers.origin,
    "user-agent": req.headers["user-agent"],
  })
  res.status(200).json({ status: "ok" })
})

// Chat endpoint - FIXED to handle the request directly instead of proxying
app.post("/api/chat", async (req, res) => {
  console.log("📩 Request received: POST /api/chat", {
    origin: req.headers.origin,
    "user-agent": req.headers["user-agent"],
  })

  try {
    const { messages, urls } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid request. Messages array is required." })
    }

    // Process the chat request directly here
    // Fetch data from Supabase if needed
    let contextData = []

    if (urls && urls.length > 0) {
      const { data, error } = await supabase.from("scraped_content").select("*").in("url", urls)

      if (error) {
        console.error("❌ Supabase error:", error)
      } else if (data) {
        contextData = data
      }
    }

    // Format context for OpenAI
    const context = contextData.map((item) => `URL: ${item.url}\nContent: ${item.content}`).join("\n\n")

    // Prepare system message with context
    const systemMessage = {
      role: "system",
      content: `You are an AI assistant that helps users understand web content. ${
        context
          ? `Here is the content from the URLs provided:\n\n${context}`
          : "No specific web content has been provided."
      }`,
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [systemMessage, ...messages],
      stream: false,
    })

    res.json(completion.choices[0].message)
  } catch (error) {
    console.error("❌ Error processing chat request:", error)
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
