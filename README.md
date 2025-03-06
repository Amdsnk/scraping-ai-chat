# AI Web Scraping Chat

A powerful web application that combines AI with web scraping capabilities to extract, analyze, and interact with data from websites. This project allows users to scrape data from websites and use natural language to analyze and filter the results.

![AI Web Scraping Chat Screenshot](https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-mCVOWVpsT6tAAYkwJwSIRb5JKNeCTV.png)
Walkthrough: 

## Features

- **Conversational Web Scraping**: Ask the AI to extract data from websites using natural language
- **Pagination Support**: Request specific page ranges (e.g., "scrape pages 1 to 3")
- **Data Analysis**: AI-powered analysis of scraped data
- **Data Filtering**: Filter scraped data based on various criteria
- **Real-time Updates**: See scraping progress in real-time
- **Data Visualization**: View scraped data in table or JSON format
- **Session Management**: Maintain context across conversations

## Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, Node.js
- **AI**: OpenAI GPT-4o via AI SDK
- **Database**: Supabase
- **Web Scraping**: Cheerio
- **Deployment**: Vercel (frontend), Railway (backend)

## Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Supabase account and project

## Environment Variables

### Frontend (Next.js)

Create a `.env.local` file in the root directory with the following variables:
NEXT_PUBLIC_API_URL=[http://localhost:8080](http://localhost:8080)
API_URL=[http://localhost:8080](http://localhost:8080)

### Backend (Express)

Create a `.env` file in the root directory with the following variables:
PORT=8080
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

## Installation

### Frontend (Next.js)

1. Clone the repository
   ```bash
   git clone https://github.com/Amdsnk/scraping-ai-chat.git
   cd scraping-ai-chat

2. Install dependencies
   npm install

3. Run the development server
   npm run dev

4. Open http://localhost:3000 in your browser

### Backend (Express)

1. Navigate to the server directory (if you're using a monorepo setup)
   cd server

2. Install dependencies
   npm install

3. Start the server
   node server.js

## API Documentation

The application provides two main API endpoints:

### 1. `/api/chat` - Chat API

Processes user messages and returns AI responses.

**Request:**

- Method: `POST`
- Content-Type: `application/json`
- Body:
  {
  "message": "String - User's message",
  "sessionId": "String (optional) - Session identifier",
  "scrapedData": "Array (optional) - Previously scraped data",
  "isFollowUp": "Boolean (optional) - Whether this is a follow-up to a scrape request",
  "originalQuery": "String (optional) - Original query for follow-up requests"
}

**Response:**

- Status: `200 OK`
- Body:
  {
  "content": "String - AI response",
  "role": "assistant",
  "sessionId": "String - Session identifier"
}

### 2. `/api/scrape` - Web Scraping API

Scrapes data from a specified URL.

**Request:**

- Method: `POST`
- Content-Type: `application/json`
- Body:
  {
  "url": "String - URL to scrape",
  "pagination": "Boolean (optional) - Whether this is a pagination request",
  "pageRange": "Object (optional) - Page range to scrape { start: number, end: number }",
  "sessionId": "String (optional) - Session identifier"
}

**Response:**

- Status: `200 OK`
- Body:
  {
  "message": "String - Success message",
  "results": "Array - Scraped data",
  "sessionId": "String - Session identifier",
  "pageRange": "Object (optional) - Page range that was scraped",
  "page": "Number - Current page number",
  "totalItems": "Number - Total number of items scraped"
}

 ## Usage Examples

### Basic Chat

Simply type a message in the chat input to interact with the AI assistant.

### Scraping a Website

To scrape a website, enter a message like: Get breeder information from https://herefordsondemand.com/find-a-breeder-detail/84050/

### Pagination

To get more results from the same website: Show me the next page of results

Or to get a specific range of pages: Scrape pages 1 to 3 from the URL

### Filtering Data

To filter the scraped data: Filter results by location Texas

## Project Structure

scraping-ai-chat/
├── app/                    # Next.js app directory
│   ├── api/                # API routes
│   │   ├── chat/           # Chat API endpoint
│   │   └── scrape/         # Scrape API endpoint
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page component
├── components/             # React components
│   ├── ChatComponent.tsx   # Chat interface component
│   ├── WebScraper.tsx      # Web scraper component
│   └── theme-provider.tsx  # Theme provider for light/dark mode
├── ai-service.js           # AI processing service
├── server.js               # Express backend server
├── next.config.js          # Next.js configuration
└── tailwind.config.js      # Tailwind CSS configuration
```

Thought for 5 seconds```markdown project="AI Web Scraping Chat" file="README.md"
...
```

NEXT_PUBLIC_API_URL=[http://localhost:8080](http://localhost:8080)
API_URL=[http://localhost:8080](http://localhost:8080)

```plaintext

### Backend (Express)

Create a `.env` file in the root directory with the following variables:

```

PORT=8080
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

```plaintext

## Installation

### Frontend (Next.js)

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/ai-web-scraping-chat.git
   cd ai-web-scraping-chat
```

2. Install dependencies

```shellscript
npm install
```


3. Run the development server

```shellscript
npm run dev
```


4. Open [http://localhost:3000](http://localhost:3000) in your browser


### Backend (Express)

1. Navigate to the server directory (if you're using a monorepo setup)

```shellscript
cd server
```


2. Install dependencies

```shellscript
npm install
```


3. Start the server

```shellscript
node server.js
```




## API Documentation

The application provides two main API endpoints:

### 1. `/api/chat` - Chat API

Processes user messages and returns AI responses.

**Request:**

- Method: `POST`
- Content-Type: `application/json`
- Body:

```json
{
  "message": "String - User's message",
  "sessionId": "String (optional) - Session identifier",
  "scrapedData": "Array (optional) - Previously scraped data",
  "isFollowUp": "Boolean (optional) - Whether this is a follow-up to a scrape request",
  "originalQuery": "String (optional) - Original query for follow-up requests"
}
```




**Response:**

- Status: `200 OK`
- Body:

```json
{
  "content": "String - AI response",
  "role": "assistant",
  "sessionId": "String - Session identifier"
}
```




### 2. `/api/scrape` - Web Scraping API

Scrapes data from a specified URL.

**Request:**

- Method: `POST`
- Content-Type: `application/json`
- Body:

```json
{
  "url": "String - URL to scrape",
  "pagination": "Boolean (optional) - Whether this is a pagination request",
  "pageRange": "Object (optional) - Page range to scrape { start: number, end: number }",
  "sessionId": "String (optional) - Session identifier"
}
```




**Response:**

- Status: `200 OK`
- Body:

```json
{
  "message": "String - Success message",
  "results": "Array - Scraped data",
  "sessionId": "String - Session identifier",
  "pageRange": "Object (optional) - Page range that was scraped",
  "page": "Number - Current page number",
  "totalItems": "Number - Total number of items scraped"
}
```




## Usage Examples

### Basic Chat

Simply type a message in the chat input to interact with the AI assistant.

### Scraping a Website

To scrape a website, enter a message like:

```plaintext
Get breeder information from https://herefordsondemand.com/find-a-breeder-detail/84050/
```

### Pagination

To get more results from the same website:

```plaintext
Show me the next page of results
```

Or to get a specific range of pages:

```plaintext
Scrape pages 1 to 3 from the URL
```

### Filtering Data

To filter the scraped data:

```plaintext
Filter results by location Texas
```

## Project Structure

```plaintext
scraping-ai-chat/
├── app/                    # Next.js app directory         
│   ├── api/                # API routes          
│   │   ├── chat/           # Chat API endpoint      
│   │   └── scrape/         # Scrape API endpoint       
│   ├── globals.css         # Global styles     
│   ├── layout.tsx          # Root layout    
│   └── page.tsx            # Main page component     
├── components/             # React components  
│   ├── ui/                
│   ├── ChatComponent.tsx   # Chat interface component
│   ├── WebScraper.tsx      # Web scraper component
│   └── theme-provider.tsx  
├── hooks/
│   ├── use-mobile.tsx     
│   └── use-toast.ts       
├── lib/
│   └── utils.ts           
├── public/                
├── styles/
│   └── globals.css        
├── .dockerignore          
├── .gitattributes         
├── Dockerfile             
├── README.md              
├── ai-service.js            # AI processing service  
├── components.json        
├── next.config.js           # Next.js configuration
├── package-lock.json      
├── package.json           
├── postcss.config.mjs     
├── railway.toml           
├── server.js                 # Express backend server       
└── tailwind.config.js        # Tailwind CSS configuration
```

## Deployment

### Frontend (Vercel)

1. Push your code to a GitHub repository
2. Import the project in Vercel
3. Set the required environment variables
4. Deploy


### Backend (Railway)

1. Create a new project in Railway
2. Connect your GitHub repository
3. Set the required environment variables
4. Deploy


## Rate Limiting

The API implements rate limiting to prevent abuse:

- 3 requests per minute per IP address


## Security Considerations

- The application only scrapes publicly available information
- User sessions are managed securely
- API requests are validated and sanitized
- CORS is configured to only allow requests from authorized origins


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Next.js](https://nextjs.org/)
- [OpenAI](https://openai.com/)
- [Supabase](https://supabase.io/)
- [Cheerio](https://cheerio.js.org/)
- [shadcn/ui](https://ui.shadcn.com/)
