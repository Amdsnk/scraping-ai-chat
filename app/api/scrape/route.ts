import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, pagination, pageRange, sessionId } = body

    if (!url && !pagination) {
      return NextResponse.json({ error: "URL is required for initial scraping" }, { status: 400 })
    }

    // Get the backend URL from environment variables
    const backendUrl = process.env.API_URL || "https://scraping-ai-chat-production.up.railway.app"

    console.log("Sending scrape request to backend:", url || "pagination request")

    // Make a direct request to the backend
    const response = await fetch(`${backendUrl}/api/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, pagination, pageRange, sessionId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Backend scraping error:", errorText)
      return NextResponse.json(
        { error: "Error from scraping service", details: errorText },
        { status: response.status },
      )
    }

    const data = await response.json()
    console.log("Received scrape response from backend:", JSON.stringify(data, null, 2))
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error("Error in scrape route:", error)
    let errorMessage = "Internal server error"
    let errorDetails = {}

    if (error instanceof Error) {
      errorMessage = error.message
      errorDetails = { name: error.name, stack: error.stack }
    }

    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 })
  }
}
