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

    // Check if we need to scrape first
    const urls = body.urls || []
    if (
      urls.length > 0 &&
      (body.message.toLowerCase().includes("get") ||
        body.message.toLowerCase().includes("extract") ||
        body.message.toLowerCase().includes("scrape") ||
        body.message.toLowerCase().includes("find"))
    ) {
      try {
        // Try to scrape the URL first
        await fetch(`${backendUrl}/api/scrape`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: urls[0] }),
        })
        // We don't need to wait for the response here as the backend will store it
        // and use it in the chat response
      } catch (scrapeError) {
        console.error("Error pre-scraping URL:", scrapeError)
        // Continue with the chat request even if scraping fails
      }
    }

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
    let errorMessage = "Internal server error"
    let errorDetails = {}

    if (error instanceof Error) {
      errorMessage = error.message
      errorDetails = { name: error.name, stack: error.stack }
    }

    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 })
  }
}
