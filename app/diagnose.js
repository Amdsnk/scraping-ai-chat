"use client"

import { useState, useEffect } from "react"

export default function DiagnosePage() {
  const [diagnosticData, setDiagnosticData] = useState(null)
  const [testPrompt, setTestPrompt] = useState("Write a short poem about debugging")
  const [testResponse, setTestResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function runDiagnostics() {
      try {
        setLoading(true)
        const res = await fetch("/api/diagnose")
        const data = await res.json()
        setDiagnosticData(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    runDiagnostics()
  }, [])

  async function testGeneration() {
    try {
      setTestLoading(true)
      setTestResponse(null)

      console.log("Sending test prompt:", testPrompt)

      // Test the actual generation endpoint
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: testPrompt }),
      })

      console.log("Response status:", res.status)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `API returned ${res.status}`)
      }

      const data = await res.json()
      console.log("Response data:", data)

      setTestResponse({
        success: true,
        data: data,
        text: data.text || data.response || JSON.stringify(data),
      })
    } catch (err) {
      console.error("Test error:", err)
      setTestResponse({
        success: false,
        error: err.message,
      })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">API Diagnostics</h1>

      {loading ? (
        <p>Loading diagnostics...</p>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-md mb-6">Error: {error}</div>
      ) : diagnosticData ? (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">System Status</h2>
          <div className="bg-gray-50 p-4 rounded-md overflow-auto">
            <pre>{JSON.stringify(diagnosticData, null, 2)}</pre>
          </div>
        </div>
      ) : null}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Test Generation</h2>
        <div className="space-y-4">
          <div>
            <label className="block mb-2">Test Prompt:</label>
            <textarea
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              className="w-full p-2 border rounded-md"
              rows={3}
            />
          </div>

          <button
            onClick={testGeneration}
            disabled={testLoading || !testPrompt.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
          >
            {testLoading ? "Testing..." : "Test Generation"}
          </button>

          {testResponse && (
            <div className={`p-4 rounded-md ${testResponse.success ? "bg-green-50" : "bg-red-50"}`}>
              <h3 className="font-medium mb-2">{testResponse.success ? "Success" : "Error"}:</h3>
              {testResponse.success ? (
                <div className="whitespace-pre-wrap">{testResponse.text}</div>
              ) : (
                <div className="text-red-600">{testResponse.error}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-500">
        <h3 className="font-medium mb-1">Troubleshooting Tips:</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Check that your OpenAI API key is valid and has sufficient credits</li>
          <li>Verify that your API routes are correctly implemented</li>
          <li>Ensure your frontend is correctly handling the API response</li>
          <li>Check browser console for any JavaScript errors</li>
          <li>Verify network requests in the browser's Network tab</li>
        </ul>
      </div>
    </div>
  )
}

