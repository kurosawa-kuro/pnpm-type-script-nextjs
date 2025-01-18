import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drrqxf7gq2h3o.cloudfront.net',
        port: '',
        pathname: '/**',
      },
    ],
    domains: ['drrqxf7gq2h3o.cloudfront.net'],
    unoptimized: true
  },
};

export default nextConfig;
