import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tokentails.app",
  appName: "Token Tails",
  webDir: "out",
  server: {
    androidScheme: "http",
    cleartext: true,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com", "apple.com"],
    },
  },
};

export default config;
