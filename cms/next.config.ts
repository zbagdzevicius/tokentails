import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server for the Google Cloud image (cms/Dockerfile). Vercel (VERCEL=1 at build time) keeps Next's
  // default output, as before the migration.
  output: process.env.VERCEL ? undefined : 'standalone',
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
