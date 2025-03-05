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
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
)

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
        // Handle single message format
        messages = [{ role: "user", content: req.body.message }]
      } else if (req.body.messages && Array.isArray(req.body.messages)) {
        // Handle array of messages format
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
        model: "gpt-4",
        messages: [systemMessage, ...messages],
        stream: false,
      })

      res.json(completion.choices[0].message)
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
