import express from "express"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import cors from "cors"
import OpenAI from "openai"

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// Enhanced logging function
const log = (message, ...args) => {
  console.log(new Date().toISOString(), message, ...args)
}

const logMemoryUsage = () => {
  const used = process.memoryUsage()
  log(`Memory usage: ${Math.round(used.rss / 1024 / 1024)}MB`)
}

// Log all environment variables (be careful with sensitive information)
log("Environment variables:", Object.keys(process.env))
log("PORT:", port)

// Improved CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://scraping-ai-chat.vercel.app",
      "https://scraping-ai-chat-git-main-amdsnk-9d866dcd.vercel.app",
    ]
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith(".vercel.app")) {
      callback(null, true)
    } else {
      callback(new Error("Not allowed by CORS"))
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
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

// Middleware to log requests
app.use((req, res, next) => {
  log("Request received:", {
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    "user-agent": req.headers["user-agent"],
  })
  next()
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() })
})

// Root route
app.get("/", (req, res) => {
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

// Chat API route
app.post("/api/chat", async (req, res) => {
  try {
    log("Received chat request")
    logMemoryUsage()

    const { message, sessionId } = req.body

    if (!message) {
      return res.status(400).json({ error: "Message is required" })
    }

    // Your existing chat logic here
    // ...

    // For now, let's just send a simple response
    res.json({
      text: "This is a test response from the server.",
      sessionId: sessionId || "test-session",
    })
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${port}`)
})

// Error handling for uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  // Application specific logging, throwing an error, or other logic here
})
