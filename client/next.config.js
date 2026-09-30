// Capacitor builds (`npm run build:app`, env from .env.app) ship a static
// export in out/. Web builds keep the Node server for ISR and redirects.
const isApp = !!process.env.NEXT_PUBLIC_IS_APP;

/** @type {import('next').NextConfig} */
const nextConfig = {
  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
  output: isApp ? "export" : undefined,
  transpilePackages: ["@creit.tech/stellar-wallets-kit"],
  // Not supported under output: "export", so app builds skip them;
  // pages/gaming.tsx covers /gaming client-side there.
  ...(isApp
    ? {}
    : {
        async redirects() {
          return [
            { source: "/gaming", destination: "/", permanent: true },
            // Legacy /catbassadors game shell; the same game runs at /game.
            { source: "/catbassadors", destination: "/game", permanent: true },
          ];
        },
      }),
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
