import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server for the Google Cloud image (cms/Dockerfile); Vercel builds it the same way.
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com'
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com'
      }
    ]
  }
};

export default nextConfig;
