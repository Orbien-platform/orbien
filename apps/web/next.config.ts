import type { NextConfig } from "next";

const backendUrl = process.env.API_BACKEND_URL ?? "http://localhost:3000/api";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
