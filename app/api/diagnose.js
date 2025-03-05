export default async function handler(req, res) {
  try {
    // Check environment variables
    const envStatus = {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      apiUrl: process.env.API_URL || "Not set",
      nodeEnv: process.env.NODE_ENV,
    }

    // Test OpenAI connection (minimal request to avoid charges)
    let openaiStatus = "Not tested"
    if (process.env.OPENAI_API_KEY) {
      try {
        const { Configuration, OpenAIApi } = require("openai")
        const configuration = new Configuration({
          apiKey: process.env.OPENAI_API_KEY,
        })
        const openai = new OpenAIApi(configuration)

        // Make a minimal models list request instead of a completion
        const models = await openai.listModels()
        openaiStatus = models.data ? "Connected successfully" : "Connected but no data returned"
      } catch (error) {
        openaiStatus = `Error: ${error.message}`
      }
    }

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      environment: envStatus,
      openai: openaiStatus,
      // Add any other diagnostic info here
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

