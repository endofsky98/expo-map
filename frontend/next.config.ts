import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    '/**': ['./node_modules/@swc/helpers/**', './node_modules/@next/env/**'],
  },
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
