import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cors from "cors";
import OpenAI from "openai";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

console.log("ENV VARIABLES:", process.env);
console.log("API_URL:", process.env.API_URL); // Debugging

const log = (message, ...args) => {
  console.log(new Date().toISOString(), message, ...args);
};

const logMemoryUsage = () => {
  const used = process.memoryUsage();
  log(`Memory usage: ${Math.round(used.rss / 1024 / 1024)}MB`);
};

log("Environment variables:", Object.keys(process.env));
log("PORT:", port);

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = ["https://scraping-ai-chat.vercel.app"];
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
      callback(null, true);
    } else {
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

let supabase;
try {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  log("✅ Supabase client initialized successfully");
} catch (error) {
  log("❌ Error initializing Supabase client:", error);
}

let openai;
try {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  log("✅ OpenAI client initialized successfully");
} catch (error) {
  log("❌ Error initializing OpenAI client:", error);
}

app.use((req, res, next) => {
  log("📩 Request received:", {
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    "user-agent": req.headers["user-agent"],
  });
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Default API Response
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the AI Web Scraping Chat API",
    endpoints: { chat: "/api/chat", health: "/health" },
    version: "1.0.0",
    status: "online",
  });
});

// Proxy /api/chat requests to Next.js API
app.use("/api/chat", async (req, res) => {
  try {
    if (!process.env.API_URL) {
      throw new Error("API_URL is not defined in environment variables.");
    }

    console.log("🔍 Proxying request to:", `${process.env.API_URL}/api/chat`);
    console.log("📨 Request body:", req.body);

    const nextResponse = await fetch(`${process.env.API_URL}/api/chat`, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body: req.method !== "GET" ? JSON.stringify(req.body) : null,
    });

    const data = await nextResponse.json();
    console.log("📩 Response from Next.js API:", data);

    res.json(data);
  } catch (error) {
    console.error("❌ Proxy error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  log("❌ Error caught in middleware:", err);
  res.status(500).json({ error: "Something went wrong!", details: err.message });
});

// 404 handler
app.use((req, res) => {
  log("⚠️ 404 - Not Found:", req.originalUrl);
  res.status(404).json({ error: "Not Found", message: "The requested resource does not exist." });
});

// Start server
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${port}`);
});

// Graceful error handling
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Rejection at:", promise, "reason:", reason);
});
