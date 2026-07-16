/** @type {import('next').NextConfig} */
const apiTarget = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const wsTarget = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: apiTarget,
    NEXT_PUBLIC_WS_URL: wsTarget,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
