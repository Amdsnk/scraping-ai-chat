import { NextResponse } from "next/server";
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { Configuration, OpenAIApi } from 'openai-edge';

export const runtime = 'edge';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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
];

// In-memory session storage for preview
const sessions = new Map();

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Get or create session
    let session;
    if (sessionId && sessions.has(sessionId)) {
      session = sessions.get(sessionId);
    } else {
      const newSessionId = Math.random().toString(36).substring(2, 15);
      session = {
        id: newSessionId,
        messages: [],
        results: [],
        createdAt: new Date(),
      };
      sessions.set(newSessionId, session);
    }

    // Add user message to session
    session.messages.push({ role: "user", content: message });

    // Process the message
    let results = session.results;

    // Check if the message is a scraping request
    if (message.toLowerCase().includes("from the url")) {
      results = [...mockBreeders];

      // Check if pagination is requested
      if (message.toLowerCase().includes("page 1 until 3")) {
        const extraMockData = mockBreeders.map((breeder) => ({
          ...breeder,
          name: breeder.name + " Jr.",
          location: breeder.location.replace("ND", "SD"),
        }));
        results = [...results, ...extraMockData];
      }
    } else if (message.toLowerCase().includes("filter")) {
      // Handle filtering requests
      if (message.toLowerCase().includes("mott nd")) {
        results = results.filter((item) => item.location && item.location.toUpperCase().includes("MOTT ND"));
      }
    }

    // Generate AI response
    const response = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...session.messages,
        { role: 'user', content: `Based on the user's request: "${message}", and the available data of ${results.length} breeders, provide a helpful response.` }
      ],
      stream: true,
    });

    const stream = OpenAIStream(response);

    // Update session in storage
    session.results = results;
    sessions.set(session.id, session);

    return new StreamingTextResponse(stream, {
      headers: { 'X-Session-Id': session.id }
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
