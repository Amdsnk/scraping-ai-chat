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
    // Build context from previous conversation and available data
    const context = buildContext(sessionData)

    // Generate AI response using the AI SDK
    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt: `
        ${context}
        
        User query: ${query}
        
        Please respond to the user query based on the available data. 
        If the query requires filtering or processing the data, please do so and explain the results.
        If the query is about scraping a website, explain what data will be extracted.
      `,
    })

    // Process the results based on the query
    const processedResults = processResults(query, sessionData.results || [])

    return {
      text,
      results: processedResults,
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

  // Add previous messages
  if (sessionData.messages && sessionData.messages.length > 0) {
    context += "Previous conversation:\n"
    sessionData.messages.forEach((msg) => {
      context += `${msg.role === "user" ? "User" : "AI"}: ${msg.content}\n`
    })
    context += "\n"
  }

  // Add available data
  if (sessionData.results && sessionData.results.length > 0) {
    context += "Available data from scraping:\n"
    // Limit the amount of data to avoid token limits
    const sampleSize = Math.min(sessionData.results.length, 10)
    context += `Total items: ${sessionData.results.length}\n`
    context += `Sample of ${sampleSize} items:\n`
    context += JSON.stringify(sessionData.results.slice(0, sampleSize), null, 2)
    context += "\n"
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
    // Extract filter criteria
    const locationMatch = query.match(/location\s+(\w+\s+\w+)/i)
    const nameMatch = query.match(/name\s+(\w+)/i)
    const phoneMatch = query.match(/phone\s+(\w+)/i)

    const filters = {}

    if (locationMatch) filters.location = locationMatch[1]
    if (nameMatch) filters.name = nameMatch[1]
    if (phoneMatch) filters.phone = phoneMatch[1]

    // Apply filters
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

