import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"

/**
 * Processes a user query with AI and returns a response
 * @param {string} query - The user's query
 * @param {Object} sessionData - Data from the current session
 * @returns {Object} - AI response with text and processed results
 */
export async function processQuery(query, sessionData) {
  try {
    // Check if the query contains a URL
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = query.match(urlRegex) || []

    let scrapedData = sessionData.results || []
    let responseText = ""
    const isPaginationRequest =
      query.toLowerCase().includes("next page") ||
      query.toLowerCase().includes("more results") ||
      (query.toLowerCase().includes("page") && /\d+/.test(query))

    // Check for page range requests (e.g., "page 1 to 2" or "pages 1-3")
    const pageRangeMatch = query.match(/page[s]?\s+(\d+)\s*(?:to|-)\s*(\d+)/i)
    const pageRange = pageRangeMatch
      ? { start: Number.parseInt(pageRangeMatch[1]), end: Number.parseInt(pageRangeMatch[2]) }
      : null

    // If the query contains URLs and is asking to scrape/extract data
    if (
      (urls.length > 0 &&
        (query.toLowerCase().includes("get") ||
          query.toLowerCase().includes("extract") ||
          query.toLowerCase().includes("scrape") ||
          query.toLowerCase().includes("find"))) ||
      isPaginationRequest
    ) {
      // First, try to scrape the URLs if they're not already in the results
      try {
        console.log("Attempting to scrape URL or pagination:", isPaginationRequest ? "pagination request" : urls[0])
        // Make a request to the scrape API
        const response = await fetch(`/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: urls[0] || sessionData.lastUrl,
            pagination: isPaginationRequest,
            pageRange: pageRange,
            sessionId: sessionData.sessionId,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          console.log("Scrape response:", data)
          if (data.results && Array.isArray(data.results)) {
            scrapedData = data.results
            console.log("Scraped data:", scrapedData)
          }
        } else {
          console.error("Scrape request failed:", await response.text())
        }
      } catch (error) {
        console.error("Error scraping URL:", error)
      }
    }

    // Check for filtering requests
    if (query.toLowerCase().includes("filter")) {
      scrapedData = processResults(query, sessionData.results || [])
    }

    // Process data to replace empty values with '-'
    scrapedData = scrapedData.map((item) => {
      const processedItem = { ...item }
      Object.keys(processedItem).forEach((key) => {
        if (!processedItem[key] || processedItem[key].trim() === "") {
          processedItem[key] = "-"
        }
      })
      return processedItem
    })

    // Build context from previous conversation and available data
    const context = buildContext({
      ...sessionData,
      results: scrapedData,
    })

    // Generate AI response using the AI SDK
    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt: `
        ${context}
        
        User query: ${query}
        
        Please respond to the user query based on the available data. 
        If the query requires filtering or processing the data, please do so and explain the results.
        If the data has been scraped, analyze and present the information in a helpful way.
        If no data is available yet, suggest how the user might proceed.
        IMPORTANT: DO NOT say you don't have access to the data. The data has already been scraped and is available to you in the context.
      `,
    })

    responseText = text

    return {
      text: responseText,
      results: scrapedData,
    }
  } catch (error) {
    console.error("AI processing error:", error)
    return {
      text: "Sorry, I encountered an error processing your request.",
      results: sessionData.results || [],
    }
  }
}

/**
 * Builds context from session data for the AI
 * @param {Object} sessionData - Data from the current session
 * @returns {string} - Context string for the AI
 */
function buildContext(sessionData) {
  let context = ""

  // Add previous messages (limit to last 5 for token management)
  if (sessionData.messages && sessionData.messages.length > 0) {
    context += "Previous conversation:\n"
    const recentMessages = sessionData.messages.slice(-5)
    recentMessages.forEach((msg) => {
      context += `${msg.role === "user" ? "User" : "AI"}: ${msg.content}\n`
    })
    context += "\n"
  }

  // Add available data with more detailed information
  if (sessionData.results && sessionData.results.length > 0) {
    context += "Available data from scraping:\n"
    // Limit the amount of data to avoid token limits
    const sampleSize = Math.min(sessionData.results.length, 20)
    context += `Total items: ${sessionData.results.length}\n`
    context += `Sample of ${sampleSize} items:\n`
    context += JSON.stringify(sessionData.results.slice(0, sampleSize), null, 2)
    context += "\n"

    // Add a summary of the data
    context += "Data summary:\n"
    const locations = new Set(sessionData.results.map((item) => item.location).filter((loc) => loc && loc !== "-"))
    context += `- Locations: ${Array.from(locations).join(", ")}\n`
    context += `- Total breeders: ${sessionData.results.length}\n\n`
  }

  return context
}

/**
 * Processes results based on the user query
 * @param {string} query - The user's query
 * @param {Array} results - Current results
 * @returns {Array} - Processed results
 */
function processResults(query, results) {
  if (!results || results.length === 0) {
    return []
  }

  // Check for filtering requests
  if (query.toLowerCase().includes("filter")) {
    // Extract filter criteria with improved regex
    const locationMatch = query.match(/location\s+([A-Za-z0-9\s]+)/i)
    const nameMatch = query.match(/name\s+([A-Za-z0-9\s]+)/i)
    const phoneMatch = query.match(/phone\s+([A-Za-z0-9\s\-$$$$]+)/i)

    const filters = {}

    if (locationMatch) filters.location = locationMatch[1].trim()
    if (nameMatch) filters.name = nameMatch[1].trim()
    if (phoneMatch) filters.phone = phoneMatch[1].trim()

    // Apply filters with more flexible matching
    if (Object.keys(filters).length > 0) {
      return results.filter((item) => {
        return Object.entries(filters).every(([field, value]) => {
          return item[field] && item[field].toLowerCase().includes(value.toLowerCase())
        })
      })
    }
  }

  // Return original results if no processing needed
  return results
}
