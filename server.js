import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cors from "cors";
import OpenAI from "openai";
import fetch from "node-fetch";

// ✅ Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Utility logger
const log = (message, ...args) => {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
};

log("🔍 Environment variables loaded");
setTimeout(() => log("🔧 ENV VARIABLES:", process.env), 1000); // Wait for .env to load

// ✅ CORS Configuration
const allowedOrigins = [
  "https://scraping-ai-chat.vercel.app",
  "http://localhost:3000", // ✅ Allow local development
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
      callback(null, true);
    } else {
      log("⛔ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

// ✅ Initialize Supabase
let supabase;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  log("✅ Supabase client initialized successfully");
} catch (error) {
  log("❌ Error initializing Supabase:", error);
}

// ✅ Initialize OpenAI
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing.");
  }
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  log("✅ OpenAI client initialized successfully");
} catch (error) {
  log("❌ Error initializing OpenAI:", error);
}

// ✅ Middleware for logging requests
app.use((req, res, next) => {
  log(`📩 Request received: ${req.method} ${req.url}`, {
    origin: req.headers.origin,
    "user-agent": req.headers["user-agent"],
  });
  next();
});

// ✅ Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// ✅ Default API Response
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the AI Web Scraping Chat API",
    endpoints: { chat: "/api/chat", health: "/health" },
    version: "1.0.0",
    status: "online",
  });
});

// ✅ FIX: Avoid Infinite Proxy Loop in `/api/chat`
app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.API_URL) {
      throw new Error("API_URL is missing in environment variables.");
    }

    const proxyUrl = process.env.API_URL.includes("scraping-ai-chat-production.up.railway.app")
      ? "https://scraping-ai-chat-production.up.railway.app"
      : `${process.env.API_URL}/api/chat`;

    log("🔍 Proxying request to:", proxyUrl);
    log("📨 Request body:", req.body);

    const nextResponse = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "node-fetch", // ✅ Fix for API compatibility
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body: JSON.stringify(req.body),
    });

    log("📩 Response status:", nextResponse.status);

    if (!nextResponse.ok) {
      const errorText = await nextResponse.text();
      log(`❌ Upstream error: ${nextResponse.status} - ${errorText}`);
      return res.status(nextResponse.status).json({ error: "Upstream error", details: errorText });
    }

    const data = await nextResponse.json();
    log("📩 Response from Next.js API:", data);

    return res.status(200).json(data);
  } catch (error) {
    log("❌ Proxy error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// ✅ Global error handling middleware
app.use((err, req, res, next) => {
  log("❌ Error caught in middleware:", err);
  res.status(500).json({ error: "Something went wrong!", details: err.message });
});

// ✅ 404 handler
app.use((req, res) => {
  log("⚠️ 404 - Not Found:", req.originalUrl);
  res.status(404).json({ error: "Not Found", message: "The requested resource does not exist." });
});

// ✅ Start server
app.listen(port, "0.0.0.0", () => {
  log(`🚀 Server is running on http://0.0.0.0:${port}`);
});

// ✅ Graceful error handling
process.on("uncaughtException", (error) => {
  log("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  log("⚠️ Unhandled Rejection at:", promise, "reason:", reason);
});
