"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Send, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type Message = {
  role: "user" | "assistant"
  content: string
}

type BreederData = {
  name: string
  phone: string
  location: string
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "https://scraping-ai-chat-production.up.railway.app" // Default fallback

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [results, setResults] = useState<BreederData[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = { role: "user" as const, content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setError(null)

    try {
      const urlRegex = /(https?:\/\/[^\s]+)/g
      const urls = input.match(urlRegex) || []
      const isPaginationRequest =
        input.toLowerCase().includes("next page") ||
        input.toLowerCase().includes("more results") ||
        (input.toLowerCase().includes("page") && /\d+/.test(input))

      let currentResults = results // Store current results

      // Handle scraping if needed
      if (
        (urls.length > 0 &&
          (input.toLowerCase().includes("get") ||
            input.toLowerCase().includes("extract") ||
            input.toLowerCase().includes("scrape") ||
            input.toLowerCase().includes("find"))) ||
        isPaginationRequest
      ) {
        console.log("Sending scrape request for:", isPaginationRequest ? "pagination" : urls[0])
        const scrapeResponse = await fetch(`${API_URL}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: urls[0] || undefined,
            pagination: isPaginationRequest,
            sessionId,
          }),
        })

        if (!scrapeResponse.ok) {
          const errorText = await scrapeResponse.text()
          console.error("Scrape request failed:", errorText)
          throw new Error(`Scraping failed: ${errorText}`)
        }

        const scrapeData = await scrapeResponse.json()
        console.log("Scrape response:", scrapeData)
        if (scrapeData.results && Array.isArray(scrapeData.results)) {
          currentResults = scrapeData.results // Update current results
          setResults(currentResults)
        }
        if (scrapeData.sessionId) {
          setSessionId(scrapeData.sessionId)
        }
      }

      // Send chat request with the most up-to-date results
      console.log("Sending request to API:", {
        message: userMessage.content,
        sessionId,
        scrapedData: currentResults,
      })

      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          scrapedData: currentResults, // Use current results instead of state
        }),
      })

      if (!response.ok) {
        throw new Error(`Chat request failed: ${await response.text()}`)
      }

      const data = await response.json()
      console.log("Received response from API:", data)

      if (data.error) {
        throw new Error(data.error)
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.content || "No response from AI" }])
      if (data.sessionId) {
        setSessionId(data.sessionId)
      }
    } catch (error) {
      console.error("Error:", error)
      setError(error instanceof Error ? error.message : "An unknown error occurred")
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, there was an error. Please try again." }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto max-w-6xl flex-1 flex flex-col">
        <h1 className="text-2xl font-bold text-center mb-6">AI Web Scraping Chat</h1>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          <Card className="md:col-span-2 flex flex-col">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-4 pr-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <p>Start a conversation by sending a message.</p>
                      <p className="text-sm mt-2">Try: "From the URL, get all breeder's name, phone, and location."</p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <form onSubmit={handleSubmit} className="flex w-full space-x-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </CardFooter>
          </Card>

          <Card className="md:col-span-1 flex flex-col">
            <CardHeader>
              <CardTitle>Scraped Data</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <Tabs defaultValue="table">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="table">Table</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="table" className="h-[60vh] overflow-auto">
                  {results.length > 0 ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Location</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.phone}</TableCell>
                              <TableCell>{item.location}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="mt-4 flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setInput("Show me the next page of results")
                            handleSubmit(new Event("submit") as any)
                          }}
                          disabled={isLoading}
                        >
                          Load More Results
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      <p>No data available yet.</p>
                      <p className="text-sm mt-2">Ask the AI to scrape a website to see results here.</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="json" className="h-[60vh]">
                  <ScrollArea className="h-full">
                    <pre className="text-xs p-4 bg-muted rounded-md">
                      {results.length > 0 ? JSON.stringify(results, null, 2) : "No data available yet."}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter>
              <div className="text-sm text-muted-foreground">
                {results.length > 0 ? `${results.length} items found` : "No data available"}
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
