import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/fill",
        destination: "http://127.0.0.1:8000/api/fill",
      },
    ];
  },
};

export default nextConfig;
