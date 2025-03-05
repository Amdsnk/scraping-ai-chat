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

// ✅ CORS Configuration
const allowedOrigins = [
  "https://scraping-ai-chat.vercel.app",
  "http://localhost:3000", // ✅ Allow local development
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
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
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  log("✅ Supabase client initialized successfully");
} else {
  console.error("❌ Supabase environment variables are missing.");
}

// ✅ Initialize OpenAI
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  log("✅ OpenAI client initialized successfully");
} else {
  console.error("❌ OpenAI API key is missing.");
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

// ✅ Chat API Route (Fixed Proxy Handling)
import AbortController from "abort-controller";

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.API_URL) {
      throw new Error("API_URL is missing in environment variables.");
    }

    const apiBaseUrl = process.env.API_URL.replace(/^https:/, "http:");
    const proxyUrl = `${apiBaseUrl}/api/chat`;
    log("🔍 Proxying request to:", proxyUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

    const nextResponse = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "node-fetch",
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    clearTimeout(timeout); // Clear timeout if request succeeds

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
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Rejection at:", promise, "reason:", reason);
});
