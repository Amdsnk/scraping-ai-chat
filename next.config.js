/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: "/api/chat",
        destination: "https://scraping-ai-chat-production.up.railway.app/api/chat",
      },
    ];
  },
};

export default nextConfig;
