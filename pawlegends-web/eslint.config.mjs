import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { builtinRules } from "eslint/use-at-your-own-risk";

// Typography (client plan F4): text styling goes through the type roles (Tailwind font utilities in the DOM), never a
// raw family string. The same rule as client/eslint.config.mjs; design/, the generated font list and the Tailwind
// theme declare the families, so they are exempt.
const TYPOGRAPHY_DIRS = ["components/typography/**", "design/**", "tailwind.config.ts"];
const FONT_MESSAGE = "Pick a type role instead of a raw font: Tailwind font-* classes in the DOM.";
const CSS_FONT_FAMILY = String.raw`/font-family\s*:/`;
const TW_RAW_FONT = String.raw`/(^|[\s:])font-(\[(?!\d)|mono(?![\w-]))/`;
const FONT_SYNTAX = [
  { selector: "Property[key.name='fontFamily']", message: FONT_MESSAGE },
  { selector: "Property[key.value='fontFamily']", message: FONT_MESSAGE },
  { selector: "Property[key.value='font-family']", message: FONT_MESSAGE },
  { selector: `Literal[value=${CSS_FONT_FAMILY}]`, message: FONT_MESSAGE },
  { selector: `TemplateElement[value.raw=${CSS_FONT_FAMILY}]`, message: FONT_MESSAGE },
  { selector: `Literal[value=${TW_RAW_FONT}]`, message: FONT_MESSAGE },
  { selector: `TemplateElement[value.raw=${TW_RAW_FONT}]`, message: FONT_MESSAGE },
  { selector: "Property[key.name='font']", message: FONT_MESSAGE },
  { selector: "Property[key.value='font']", message: FONT_MESSAGE },
];
// A second instance of the core `no-restricted-syntax` rule, as in client.
const ttPlugin = { rules: { "no-raw-font": builtinRules.get("no-restricted-syntax") } };

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-*/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
      // Pawlegends' Vite bundle, written by `npm run build:client` in pawlegends/. Its source is checked there.
      "public/pawlegends-game/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    ignores: TYPOGRAPHY_DIRS,
    plugins: { tt: ttPlugin },
    rules: { "tt/no-raw-font": ["error", ...FONT_SYNTAX] },
  },
  {
    // The same relaxations as client/eslint.config.mjs (the code here was copied from client).
    rules: {
      "react/display-name": "off",
      "@next/next/no-img-element": "off",
      "jsx-a11y/alt-text": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default eslintConfig;
