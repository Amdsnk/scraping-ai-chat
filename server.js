import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cors from "cors";
import OpenAI from "openai";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

console.log("🔧 ENV VARIABLES:", process.env);
console.log("📡 API_URL:", process.env.API_URL); // Debugging

const log = (message, ...args) => {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
};

const logMemoryUsage = () => {
  const used = process.memoryUsage();
  log(`📊 Memory usage: ${Math.round(used.rss / 1024 / 1024)}MB`);
};

log("🔍 Environment variables:", Object.keys(process.env));
log("🚀 PORT:", port);

// ✅ CORS FIX: Allow requests from specific domains & handle missing origins
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = ["https://scraping-ai-chat.vercel.app"];
    
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
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  log("✅ Supabase client initialized successfully");
} catch (error) {
  log("❌ Error initializing Supabase:", error);
}

// ✅ Initialize OpenAI
let openai;
try {
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

// ✅ Health check
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

// ✅ FIXED: Proper Route Handler for `/api/chat`
app.post("/api/chat", async (req, res) => {
  try {
    const proxyUrl = `${process.env.API_URL}/api/chat`;

    log("🔍 Proxying request to:", proxyUrl);
    log("📨 Request body:", req.body);

    const nextResponse = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body: JSON.stringify(req.body),
    });

    log("📩 Response status:", nextResponse.status);

    if (!nextResponse.ok) {
      const errorText = await nextResponse.text();
      throw new Error(`Upstream error: ${nextResponse.statusText} - ${errorText}`);
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
