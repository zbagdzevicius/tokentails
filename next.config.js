/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    esmExternals: "loose", // Enable ESM external support in loose mode
  },
  output: undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
        port: "",
        pathname: "/**",
      },
    ],
    loader: "custom",
    loaderFile: "loader.js",
    deviceSizes: [240, 320, 400, 480, 600, 640, 720, 1000, 1200],
  },
};

module.exports = nextConfig;
