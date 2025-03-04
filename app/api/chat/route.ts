import { NextResponse } from "next/server"
import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Define the BreederData type
type BreederData = {
  name: string
  phone: string
  location: string
}

// Mock data for preview purposes
const mockBreeders: BreederData[] = [
  { name: "John Smith", phone: "555-123-4567", location: "MOTT ND" },
  { name: "Sarah Johnson", phone: "555-987-6543", location: "BISMARCK ND" },
  // ... (rest of the mock data)
]

// Define the Session type
type Session = {
  id: string
  messages: { role: "system" | "user" | "assistant"; content: string }[]
  results: BreederData[]
  createdAt: Date
}

// In-memory session storage for preview
const sessions = new Map<string, Session>()

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Get or create session
    let session: Session
    if (sessionId && sessions.has(sessionId)) {
      session = sessions.get(sessionId)!
    } else {
      const newSessionId = Math.random().toString(36).substring(2, 15)
      session = {
        id: newSessionId,
        messages: [],
        results: [],
        createdAt: new Date(),
      }
      sessions.set(newSessionId, session)
    }

    // Add user message to session
    session.messages.push({ role: "user", content: message })

    // Process the message
    let results = session.results

    // Check if the message is a scraping request
    if (message.toLowerCase().includes("from the url")) {
      results = [...mockBreeders]

      // Check if pagination is requested
      if (message.toLowerCase().includes("page 1 until 3")) {
        const extraMockData = mockBreeders.map((breeder) => ({
          ...breeder,
          name: breeder.name + " Jr.",
          location: breeder.location.replace("ND", "SD"),
        }))
        results = [...results, ...extraMockData]
      }
    } else if (message.toLowerCase().includes("filter")) {
      // Handle filtering requests
      if (message.toLowerCase().includes("mott nd")) {
        results = results.filter(
          (item: BreederData) => item.location && item.location.toUpperCase().includes("MOTT ND"),
        )
      }
    }

    // Generate AI response
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        ...session.messages,
        {
          role: "user",
          content: `Based on the user's request: "${message}", and the available data of ${results.length} breeders, provide a helpful response.`,
        },
      ],
      stream: true,
    })

    // Fix for type compatibility with the AI package
    // Create a proper Response object that the OpenAIStream can handle
    const stream = OpenAIStream(response as any)

    // Update session in storage
    session.results = results
    sessions.set(session.id, session)

    return new StreamingTextResponse(stream, {
      headers: { "X-Session-Id": session.id },
    })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
