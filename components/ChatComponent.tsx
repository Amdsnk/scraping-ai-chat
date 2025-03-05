"use client"

import { useState, useEffect } from "react"

interface Message {
  role: "user" | "assistant"
  content: string
}

export function ChatComponent() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendMessage = async () => {
    if (input.trim() === "" || isLoading || cooldown > 0) return

    const newMessage: Message = { role: "user", content: input }
    setMessages([...messages, newMessage])
    setInput("")
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          urls: [], // Add URLs here if needed
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "An error occurred while processing your request")
      }

      const data = await response.json()
      setMessages((prevMessages) => [...prevMessages, { role: "assistant", content: data.content }])
      setCooldown(20) // Set a 20-second cooldown between requests
    } catch (error) {
      console.error("Error sending message:", error)
      setError(error.message)
      setMessages((prevMessages) => [...prevMessages, { role: "assistant", content: error.message }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            {message.content}
          </div>
        ))}
        {isLoading && <div className="message assistant">Loading...</div>}
        {error && <div className="error-message">{error}</div>}
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading || cooldown > 0}
        />
        <button onClick={sendMessage} disabled={isLoading || cooldown > 0}>
          {isLoading ? "Sending..." : cooldown > 0 ? `Wait ${cooldown}s` : "Send"}
        </button>
      </div>
    </div>
  )
}
