"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Search } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

type ScrapedData = {
  name: string
  phone: string
  location: string
}

export default function WebScraper({ onDataScraped }: { onDataScraped: (data: ScrapedData[]) => void }) {
  const [url, setUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleScrape = async () => {
    if (!url.trim() || !url.startsWith("http")) {
      setError("Please enter a valid URL")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to scrape the website")
      }

      const data = await response.json()

      if (data.results && Array.isArray(data.results)) {
        onDataScraped(data.results)
      } else {
        setError("No data found on this page")
      }
    } catch (error) {
      console.error("Error scraping website:", error)
      setError(error instanceof Error ? error.message : "An error occurred while scraping the website")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Web Scraper</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL"
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleScrape} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isLoading ? "Scraping..." : "Scrape"}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-muted-foreground">
            <p>Enter a URL to scrape breeder information (name, phone, location).</p>
            <p>Example: https://herefordsondemand.com/find-a-breeder-detail/84050/</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Note: Only scrapes publicly available information. Use responsibly.
      </CardFooter>
    </Card>
  )
}
