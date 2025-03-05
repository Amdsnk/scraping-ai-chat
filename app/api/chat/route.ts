import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Get the backend URL from environment variables
    const backendUrl = process.env.API_URL || "https://scraping-ai-chat-production.up.railway.app"

    console.log("Received request body:", JSON.stringify(body, null, 2))

    // Check if we need to scrape first
    const urls = body.urls || []
    if (
      urls.length > 0 &&
      (body.message.toLowerCase().includes("get") ||
        body.message.toLowerCase().includes("extract") ||
        body.message.toLowerCase().includes("scrape") ||
        body.message.toLowerCase().includes("find")) &&
      !body.isFollowUp // Skip scraping for follow-up analysis
    ) {
      try {
        console.log("Attempting to scrape URL:", urls[0])
        // Try to scrape the URL first
        const scrapeResponse = await fetch(`${backendUrl}/api/scrape`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: urls[0] }),
        })

        if (!scrapeResponse.ok) {
          console.error("Scrape request failed:", await scrapeResponse.text())
        } else {
          console.log("Scrape successful")
        }
      } catch (scrapeError) {
        console.error("Error pre-scraping URL:", scrapeError)
      }
    }

    console.log(
      "Sending request to backend:",
      JSON.stringify(
        {
          message: body.message,
          urls: body.urls || [],
          sessionId: body.sessionId,
          isFollowUp: body.isFollowUp || false,
          originalQuery: body.originalQuery || null,
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
        scrapedData: body.scrapedData,
        isFollowUp: body.isFollowUp || false,
        originalQuery: body.originalQuery || null,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Backend error:", errorText)
      return NextResponse.json({ error: "Error from backend service", details: errorText }, { status: response.status })
    }

    const data = await response.json()
    console.log("Received response from backend:", JSON.stringify(data, null, 2))
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
