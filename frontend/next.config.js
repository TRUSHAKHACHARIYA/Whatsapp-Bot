/** @type {import('next').NextConfig} */
const useMockApi = process.env.NEXT_PUBLIC_MOCK_API === "true";

const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudflare.com" },
      { protocol: "https", hostname: "**.r2.dev" },
    ],
  },
  async rewrites() {
    if (useMockApi) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
