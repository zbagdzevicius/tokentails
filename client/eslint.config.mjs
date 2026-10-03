import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { builtinRules } from "eslint/use-at-your-own-risk";

// Matches a boxicons class: `bx`, `bxs-*`, `bxl-*`, `bx-*` as a whole word.
const BOXICON_CLASS = String.raw`/(^|\s)bx(\s|$)|(^|[\s"'])bx[slx]?-[a-z]/`;
const BOXICON_MESSAGE =
  "boxicons is never loaded, so `bx` classes render nothing. Use <PixelIcon name=\"...\" /> from components/shared/PixelIcon.";

// Typography (plan F4). Text styling goes through the type roles: `ttText`/`ttStyle` in Phaser,
// `ttCanvasFont` on a 2D canvas, the Tailwind font utilities in the DOM. Raw family strings are
// how undeclared faces ("Pixelify Sans", proxima-nova, Arial Black, monospace) crept in (G12).
// tailwind.config.ts maps the font utilities onto the same families, and scripts/sync-fonts.mjs
// writes the @font-face rules, so both are exempt too.
const TYPOGRAPHY_DIRS = [
  "components/typography/**",
  "components/Phaser/typography/**",
  "design/**",
  "tailwind.config.ts",
  "scripts/sync-fonts.mjs",
];
const FONT_MESSAGE =
  "Pick a type role instead of a raw font (plan F4): ttText/ttStyle in Phaser, ttCanvasFont(role, size) for a 2D canvas, Tailwind font-* classes in the DOM.";
// CSS written as a string (`"font-family: x"` in a style string, an `injectStyle` block).
const CSS_FONT_FAMILY = String.raw`/font-family\s*:/`;
// Tailwind arbitrary families (`font-['Pixelify_Sans']`, `font-[Arial]`) and `font-mono`, the old
// G14 monospace grep. The `code` role (system mono) is for tx hashes only; such a call site keeps
// its `font-mono` with an eslint-disable comment that says so.
const TW_RAW_FONT = String.raw`/(^|[\s:])font-(\[(?!\d)|mono(?![\w-]))/`;
const MONO_MESSAGE =
  "Raw font class (plan F4, G14): use a Tailwind brand font-* class. Monospace is the `code` role, for tx hashes only.";
const FONT_SYNTAX = [
  { selector: "Property[key.name='fontFamily']", message: FONT_MESSAGE },
  { selector: "Property[key.value='fontFamily']", message: FONT_MESSAGE },
  // A kebab-case key: CSS-in-JS objects, `element.style` maps, theme objects.
  { selector: "Property[key.value='font-family']", message: FONT_MESSAGE },
  { selector: `Literal[value=${CSS_FONT_FAMILY}]`, message: FONT_MESSAGE },
  { selector: `TemplateElement[value.raw=${CSS_FONT_FAMILY}]`, message: FONT_MESSAGE },
  { selector: `Literal[value=${TW_RAW_FONT}]`, message: MONO_MESSAGE },
  { selector: `TemplateElement[value.raw=${TW_RAW_FONT}]`, message: MONO_MESSAGE },
  { selector: "Property[key.name='font']", message: FONT_MESSAGE },
  { selector: "Property[key.value='font']", message: FONT_MESSAGE },
  { selector: "CallExpression[callee.property.name='setFontFamily']", message: FONT_MESSAGE },
  { selector: "CallExpression[callee.property.name='setFont']", message: FONT_MESSAGE },
  // `ctx.font = ttCanvasFont(role, size)` is the sanctioned 2D canvas path (plan F4), so it passes.
  {
    selector:
      "AssignmentExpression[left.type='MemberExpression'][left.property.name='font']:not([right.type='CallExpression'][right.callee.name='ttCanvasFont'])",
    message: FONT_MESSAGE,
  },
];

// A second instance of the core `no-restricted-syntax` rule, so the font selectors and the boxicons
// selectors (same core rule) are configured separately. Both are errors since task 7b.
const ttPlugin = {
  rules: { "no-raw-font": builtinRules.get("no-restricted-syntax") },
};

const eslintConfig = [
  // Global ignores. In flat config, `ignores` only applies globally when it
  // is the sole key of its object; next to `rules` it just scopes that block.
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-*/**",
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
      "public/heist-game/**",
      // Playwright output, including the cached QA copy of the Heist bundle
      // that e2e/heist-host.spec.ts builds into test-results/heist-game-qa.
      "test-results/**",
      "playwright-report/**",
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
    // boxicons is not loaded anywhere, so a `bx` class renders an empty icon
    // (plan F3.6). Use <PixelIcon name="..." /> instead. The codemod scripts
    // and this rule's own fixture test mention the classes on purpose.
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    ignores: ["scripts/codemods/**", "__test__/eslint-rules.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=${BOXICON_CLASS}]`,
          message: BOXICON_MESSAGE,
        },
        {
          selector: `TemplateElement[value.raw=${BOXICON_CLASS}]`,
          message: BOXICON_MESSAGE,
        },
      ],
    },
  },
  {
    // components/typography and design are imported by the landing and by SSR, so they must never
    // pull in Phaser (plan F4 SSR isolation). The Phaser half lives in components/Phaser/typography.
    files: ["components/typography/**/*.{js,jsx,mjs,ts,tsx}", "design/**/*.{js,jsx,mjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "phaser", message: "No Phaser in components/typography or design (plan F4)." }],
          patterns: [
            {
              group: ["phaser/*", "**/components/Phaser/**", "@/components/Phaser/**", "../Phaser/**"],
              message: "No Phaser in components/typography or design (plan F4).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    // The typography tests build font strings and fake Text styles on purpose. The ShelterSplit
    // Rail widget (public/rail) is embedded on other sites inside a shadow root, where the brand
    // faces are not loaded, so it uses the system UI stack.
    ignores: [...TYPOGRAPHY_DIRS, "__test__/eslint-typography.test.ts", "__test__/typography-*.test.ts", "public/rail/**"],
    plugins: { tt: ttPlugin },
    rules: {
      "tt/no-raw-font": ["error", ...FONT_SYNTAX],
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
