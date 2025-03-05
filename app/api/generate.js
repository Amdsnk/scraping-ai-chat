export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { prompt } = req.body

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" })
    }

    // Log to help debug
    console.log("Received prompt:", prompt)
    console.log("API Key exists:", !!process.env.OPENAI_API_KEY)

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key is not configured" })
    }

    // Using the AI SDK for simplicity and reliability
    const { Configuration, OpenAIApi } = require("openai")
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })
    const openai = new OpenAIApi(configuration)

    const completion = await openai.createCompletion({
      model: "text-davinci-003", // or gpt-3.5-turbo if you're using chat completions
      prompt: prompt,
      max_tokens: 500,
      temperature: 0.7,
    })

    console.log("Response received from OpenAI")

    if (!completion.data || !completion.data.choices || completion.data.choices.length === 0) {
      console.error("Unexpected response structure:", completion.data)
      return res.status(500).json({ error: "Unexpected response from OpenAI" })
    }

    return res.status(200).json({
      text: completion.data.choices[0].text,
      usage: completion.data.usage,
    })
  } catch (error) {
    console.error("Error in API route:", error)

    // Provide more detailed error information
    const errorMessage = error.response?.data?.error?.message || error.message
    const statusCode = error.response?.status || 500

    return res.status(statusCode).json({
      error: "An error occurred during your request.",
      details: errorMessage,
    })
  }
}

