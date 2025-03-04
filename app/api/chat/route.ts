import { type NextRequest, NextResponse } from "next/server"
import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { Configuration, OpenAIApi } from 'openai-edge'
import { NextResponse } from 'next/server'

// Mock data for preview purposes
const mockBreeders = [
  { name: "John Smith", phone: "555-123-4567", location: "MOTT ND" },
  { name: "Sarah Johnson", phone: "555-987-6543", location: "BISMARCK ND" },
  { name: "Michael Williams", phone: "555-456-7890", location: "MOTT ND" },
  { name: "Emily Davis", phone: "555-789-0123", location: "FARGO ND" },
  { name: "Robert Brown", phone: "555-234-5678", location: "MINOT ND" },
  { name: "Jennifer Wilson", phone: "555-345-6789", location: "MOTT ND" },
  { name: "David Miller", phone: "555-567-8901", location: "GRAND FORKS ND" },
  { name: "Lisa Moore", phone: "555-678-9012", location: "WILLISTON ND" },
  { name: "James Taylor", phone: "555-890-1234", location: "DICKINSON ND" },
  { name: "Patricia Anderson", phone: "555-901-2345", location: "JAMESTOWN ND" },
]

// In-memory session storage for preview
const sessions = new Map()

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Replace generateText with OpenAI API call
  const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }))

  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: message }
    ],
    stream: true,
  })

  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
};

    // Get or create session
    let session
    if (sessionId) {
      session = sessions.get(sessionId)
      if (!session) {
        // Create a new session with a random ID if the provided one doesn't exist
        const newSessionId = Math.random().toString(36).substring(2, 15)
        session = {
          id: newSessionId,
          messages: [],
          results: [],
          createdAt: new Date(),
        }
        sessions.set(newSessionId, session)
      }
    } else {
      // Create a new session with a random ID
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
    let aiResponse
    let results = session.results

    // Check if the message is a scraping request
    if (message.toLowerCase().includes("from the url")) {
      // For preview, use mock data
      results = [...mockBreeders]

      // Check if pagination is requested
      if (message.toLowerCase().includes("page 1 until 3")) {
        // Simulate pagination by adding more mock data
        const extraMockData = mockBreeders.map((breeder) => ({
          ...breeder,
          name: breeder.name + " Jr.",
          location: breeder.location.replace("ND", "SD"),
        }))
        results = [...results, ...extraMockData]
      }

      // Generate AI response
      aiResponse = await generateText({
        model: openai("gpt-4o"),
        prompt: `The user asked: "${message}". I've scraped the website and found ${results.length} breeders. Please provide a helpful response summarizing what I found.`,
      })
    } else if (message.toLowerCase().includes("filter")) {
      // Handle filtering requests
      if (message.toLowerCase().includes("mott nd")) {
        results = results.filter((item) => item.location && item.location.toUpperCase().includes("MOTT ND"))
      }

      // Generate AI response
      aiResponse = await generateText({
        model: openai("gpt-4o"),
        prompt: `The user asked: "${message}". I've filtered the data and found ${results.length} breeders matching the criteria. Please provide a helpful response summarizing the filtered results.`,
      })

      // Use the AI response text
      aiResponse = { text: aiResponse.text }
    } else {
      // Regular chat message
      aiResponse = await generateText({
        model: openai("gpt-4o"),
        prompt: `The user asked: "${message}". Based on the conversation history and available data, please provide a helpful response.`,
      })
    }

    // Add AI response to session
    session.messages.push({ role: "assistant", content: aiResponse.text })
    session.results = results

    // Update session in storage
    sessions.set(session.id, session)

    // Send response
    return Response.json({
      text: aiResponse.text,
      results: results,
      sessionId: session.id,
    })
  } catch (error) {
    console.error("API error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

