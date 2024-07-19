/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // https://nextjs.org/docs/messages/next-image-unconfigured-host
    // If you are using an older version of Next.js prior to 12.3.0, you can use images.domains instead:
    // domains: ["armadillo-space.fra1.cdn.digitaloceanspaces.com"],
    // pats: "https://armadillo-space.fra1.cdn.digitaloceanspaces.com/",
    // unoptimized: true,
    // loader: 'custom',
    // loaderFile: './optimize-images.js',
    // Add the protocol, hostname, port, and pathname to the images.remotePatterns config in next.config.js:
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
        port: "",
        pathname: "/**",
      },
    ],
    deviceSizes: [240, 320, 400, 480, 600, 640, 720, 1000, 1200],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3005/:path*", // Proxy to Backend
      },
    ];
  },
};

module.exports = nextConfig;
