import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Get the backend URL from environment variables
    const backendUrl = process.env.API_URL || "https://scraping-ai-chat-production.up.railway.app"

    console.log(
      "Sending request to backend:",
      JSON.stringify(
        {
          message: body.message,
          urls: body.urls || [],
          sessionId: body.sessionId,
        },
        null,
        2,
      ),
    )

    // Make a direct request to the backend
    const response = await fetch(`${backendUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: body.message,
        urls: body.urls || [],
        sessionId: body.sessionId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Backend error:", errorData)
      return NextResponse.json({ error: "Error from backend service", details: errorData }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error("Error in chat route:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}

