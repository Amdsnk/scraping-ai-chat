"use client"

import type React from "react"
import { useState } from "react"
import type { Message } from "../types/chat"

const ChatComponent: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      // Simulating API call
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      })

      if (!response.ok) throw new Error("Failed to send message")

      const data = await response.json()
      setMessages((prev) => [...prev, { role: "user", content: input }, { role: "assistant", content: data.message }])
      setInput("")
    } catch (error) {
      console.error("Error sending message:", error)
      setError(error instanceof Error ? error.message : "An unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-4 h-80 overflow-y-auto border rounded p-2">
        {messages.map((message, index) => (
          <div key={index} className={`mb-2 ${message.role === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block p-2 rounded ${message.role === "user" ? "bg-blue-100" : "bg-gray-100"}`}>
              {message.content}
            </span>
          </div>
        ))}
      </div>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <form onSubmit={handleSubmit} className="flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-grow border rounded-l px-2 py-1"
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-1 rounded-r" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  )
}

export default ChatComponent
