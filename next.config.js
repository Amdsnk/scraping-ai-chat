// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://scraping-ai-chat-production.up.railway.app/",
      },
    ]
  },
}

export default nextConfig
