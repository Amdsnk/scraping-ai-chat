import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Get the backend URL from environment variables
    const backendUrl = process.env.API_URL || "https://scraping-ai-chat-production.up.railway.app"

    console.log("Sending scrape request to backend:", url)

    // Make a direct request to the backend
    const response = await fetch(`${backendUrl}/api/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Backend scraping error:", errorData)
      return NextResponse.json(
        { error: "Error from scraping service", details: errorData },
        { status: response.status },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error("Error in scrape route:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

