/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
      destination: "https://scraping-ai-chat-production.up.railway.app/api/:path*",
      },
    ];
  },
};

export default nextConfig;
