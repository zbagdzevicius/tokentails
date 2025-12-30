/** @type {import('next').NextConfig} */
const nextConfig = {
  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
  output: undefined,
  // output: "export",
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
