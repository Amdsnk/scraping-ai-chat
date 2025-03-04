import { NextResponse } from "next/server"
import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const runtime = "edge"

export async function POST(req: Request) {
  try {
    console.log("Received request to /api/chat")
    const { message, sessionId } = await req.json()
    console.log("Received message:", message, "sessionId:", sessionId)

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OpenAI API key not configured, please follow instructions in README.md",
        },
        { status: 500 },
      )
    }

    if (!message) {
      return NextResponse.json({ error: "No message in the request" }, { status: 400 })
    }

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant. Answer the user's questions to the best of your ability.",
        },
        { role: "user", content: message },
      ],
    })

    const stream = OpenAIStream(response)

    console.log("Sending response")
    return new StreamingTextResponse(stream, {
      headers: { "X-Session-Id": sessionId || "new-session" },
    })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: "API is working" })
}
