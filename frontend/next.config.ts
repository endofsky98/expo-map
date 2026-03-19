import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '3.36.108.114',
        port: '8008',
      },
    ],
  },
};

export default nextConfig;
