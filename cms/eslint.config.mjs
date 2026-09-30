import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // Images here are backend uploads and cat/card art served from hosts
      // that are not in images.remotePatterns, blob: previews in the upload
      // dropzone, and card layers sized purely by CSS (w-full/h-auto,
      // pixelated sprites). next/image needs known hosts and explicit
      // dimensions, so plain <img> is the right element for this admin tool.
      // Same setting as client/eslint.config.mjs.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Jest suites load modules through the Jest registry on purpose:
    // require() inside jest.mock factories (which may not reference imports),
    // after jest.resetModules() to re-read env-dependent module state, and
    // lazily so module-level code (e.g. getAuth() in FirebaseAuthContext)
    // runs after the mock variables it closes over are initialised. Static
    // imports would be hoisted above that setup.
    files: ["__tests__/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Standalone CommonJS Node CLI (`node resize.js`), not app code.
    files: ["public/flags/resize.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
