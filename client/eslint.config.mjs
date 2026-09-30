import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Global ignores. In flat config, `ignores` only applies globally when it
  // is the sole key of its object; next to `rules` it just scopes that block.
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      // Capacitor native projects. Their web folders hold copies of the
      // exported Next bundle (gitignored build output), not source.
      "android/**",
      "ios/**",
      // Catnip Heist's Vite bundle, written by `npm run build:client` in
      // catnip-heist/. Its source is linted there.
      "public/heist/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Standalone CommonJS scripts run directly with `node`, where `require`
    // is the module system rather than a style choice.
    files: ["scripts/**/*.js", "public/flags/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      "react/display-name": "off",
      "@next/next/no-img-element": "off",
      "jsx-a11y/alt-text": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default eslintConfig;
