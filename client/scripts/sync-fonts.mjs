#!/usr/bin/env node
/**
 * Self-hosted brand fonts (plan F4). One pipeline for every face the client, the CMS and Catnip
 * Heist use, so nothing loads from fonts.googleapis.com or fonts.gstatic.com.
 *
 *   node scripts/sync-fonts.mjs          copy the faces and write the generated files
 *   node scripts/sync-fonts.mjs --check  exit 1 if any copy or generated file drifted (CI)
 *
 * Sources are the pinned Fontsource packages in client/package.json (devDependencies). For each
 * target it writes:
 *
 * - the woff2 files and the OFL licence of every family, into the target's `public/fonts/`;
 * - our own `@font-face` rules (family names unchanged, `font-display: swap`, the Fontsource
 *   `unicode-range` per subset) plus metric-matched fallback faces (`"<Family> Fallback"`, a local
 *   Arial scaled with `size-adjust` and the ascent, descent and line-gap overrides computed from
 *   @capsizecss/metrics), as SCSS (client, CMS) or as a TypeScript module (Heist, client manifest).
 *
 * Subsets: latin and latin-ext for the brand faces (Lithuanian shelter names need latin-ext; the
 * browser fetches latin-ext only when a page shows such a character). Roboto 500 is latin only: it
 * is used for the "Continue with Google" label (G9).
 *
 * Pixelify Sans is deliberately not synced (decision #92): its labels move to the `label` role.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(clientRoot, "..");
const require = createRequire(import.meta.url);

/**
 * The fallback every metric override is computed against (present on macOS, iOS and Windows):
 * Arial for regular faces, Arial Bold for bold ones (Arial Bold is 7.7% wider than Arial, so a bold
 * face scaled against regular Arial lands that much too wide). Liberation Sans (Linux) is metric
 * compatible with Arial in both weights and shares the same face.
 *
 * Android (and the Capacitor Android app) has no Arial, only Roboto. The ascent, descent and
 * line-gap overrides replace the local font's own metrics, so only `size-adjust` depends on which
 * local font is picked. Regular Roboto is within 0.3% of regular Arial (911 vs 913 per 2048), so
 * the regular faces list Roboto too. Roboto Bold is 5.8% narrower than Arial Bold (926 vs 983), so
 * whenever the drift passes `MAX_ANDROID_SIZE_DRIFT` the face drops Roboto and a second family,
 * `"<Family> Fallback Android"`, carries Roboto with its own `size-adjust`. Its sources fail
 * everywhere Arial exists, and where the first family's sources all fail (Android) the browser
 * falls through to the next family in the stack, so the stack lists both.
 */
const FALLBACK_METRICS = { regular: "arial", bold: "arial/700" };
const ANDROID_METRICS = { regular: "roboto", bold: "roboto/700" };
const MAX_ANDROID_SIZE_DRIFT = 0.01;
const FALLBACK_LOCAL = {
  regular: ['local("Arial")', 'local("ArialMT")', 'local("Liberation Sans")'],
  bold: ['local("Arial Bold")', 'local("Arial-BoldMT")', 'local("Liberation Sans Bold")'],
};
const ANDROID_LOCAL = { regular: ['local("Roboto")'], bold: ['local("Roboto Bold")'] };
const ANDROID_SUFFIX = " Android";

/**
 * Families. `faces` are the (weight, style) pairs we ship; `file(subset, face)` names the Fontsource
 * file; `metrics(face)` names the @capsizecss/metrics entry used for its fallback face. A variable
 * face may instead list `fallbackFaces(face)`: one fallback face per weight band, each with the
 * metrics of a weight in that band (one local Arial cannot match 400 and 800 Nunito at once).
 */
const FAMILIES = {
  "passion-one": {
    family: "Passion One",
    pkg: "@fontsource/passion-one",
    // 400 is kept although F4 lists 700 and 900: most of the landing renders Passion One at 400
    // (font-primary with no weight), and dropping it would swap every such label to a faux weight.
    faces: [
      { weight: 400, style: "normal" },
      { weight: 700, style: "normal" },
      { weight: 900, style: "normal" },
    ],
    subsets: ["latin", "latin-ext"],
    file: (subset, face) => `passion-one-${subset}-${face.weight}-${face.style}.woff2`,
    metrics: (face) => (face.weight === 400 ? "passionOne" : `passionOne/${face.weight}`),
    fallback: true,
  },
  "bebas-neue": {
    family: "Bebas Neue",
    pkg: "@fontsource/bebas-neue",
    faces: [{ weight: 400, style: "normal" }],
    subsets: ["latin", "latin-ext"],
    file: (subset, face) => `bebas-neue-${subset}-${face.weight}-${face.style}.woff2`,
    metrics: () => "bebasNeue",
    fallback: true,
  },
  nunito: {
    family: "Nunito",
    pkg: "@fontsource-variable/nunito",
    variable: true,
    faces: [
      { weight: "200 1000", style: "normal" },
      { weight: "200 1000", style: "italic" },
    ],
    subsets: ["latin", "latin-ext"],
    file: (subset, face) => `nunito-${subset}-wght-${face.style}.woff2`,
    // Bands follow the weights the roles use: body 400, caption 700, hint 800. Bold bands render
    // Arial Bold, measured against the Nunito weight in the middle of the band.
    fallbackFaces: (face) => {
      const suffix = face.style === "italic" ? "italic" : "";
      return [
        { weight: "200 599", metrics: face.style === "italic" ? "nunito/italic" : "nunito", bold: false },
        { weight: "600 749", metrics: `nunito/700${suffix}`, bold: true },
        { weight: "750 1000", metrics: `nunito/800${suffix}`, bold: true },
      ];
    },
    fallback: true,
  },
  roboto: {
    family: "Roboto",
    pkg: "@fontsource/roboto",
    faces: [{ weight: 500, style: "normal" }],
    subsets: ["latin"],
    file: (subset, face) => `roboto-${subset}-${face.weight}-${face.style}.woff2`,
    metrics: () => "roboto",
    // Android ships Roboto itself; elsewhere a late Roboto only affects one button label.
    fallback: false,
  },
};

/**
 * Faces preloaded by `client/pages/_document.js`: the three brand faces the game roles need first
 * (title Passion One 900, hud and label Bebas Neue, caption and hint Nunito), latin subset only.
 */
const PRELOAD = [
  ["passion-one", { weight: 900, style: "normal" }],
  ["bebas-neue", { weight: 400, style: "normal" }],
  ["nunito", { weight: "200 1000", style: "normal" }],
];

/** Where each copy goes. `pick` limits families and faces per target. */
const TARGETS = [
  {
    name: "client",
    fontsDir: join(clientRoot, "public", "fonts"),
    urlBase: "/fonts/",
    families: ["passion-one", "bebas-neue", "nunito", "roboto"],
    scss: join(clientRoot, "styles", "fonts.generated.scss"),
    manifest: join(clientRoot, "components", "typography", "fonts.generated.ts"),
  },
  {
    // Decision #83: the CMS drops Google Fonts too. It uses the display faces (font-primary,
    // font-secondary) and upright Nunito (font-tertiary on the cat cards); no italic anywhere.
    name: "cms",
    fontsDir: join(repoRoot, "cms", "public", "fonts"),
    urlBase: "/fonts/",
    families: ["passion-one", "bebas-neue", "nunito"],
    pickFace: (id, face) => id !== "nunito" || face.style === "normal",
    scss: join(repoRoot, "cms", "styles", "fonts.generated.scss"),
    // The CMS headings and nav use Passion One 400 and Bebas Neue; `cms/pages/_document.tsx`
    // preloads their latin files from this module.
    preload: [
      ["passion-one", { weight: 400, style: "normal" }],
      ["bebas-neue", { weight: 400, style: "normal" }],
    ],
    preloadModule: join(repoRoot, "cms", "styles", "fonts.preload.generated.ts"),
  },
  {
    // Decision #85: Heist secondary text moves from system-ui to Nunito. Upright only.
    name: "heist",
    fontsDir: join(repoRoot, "catnip-heist", "public", "fonts"),
    families: ["nunito"],
    pickFace: (id, face) => id !== "nunito" || face.style === "normal",
    heistModule: join(repoRoot, "catnip-heist", "src", "ui", "fonts.generated.ts"),
  },
];

const HEADER_LINES = [
  "GENERATED by client/scripts/sync-fonts.mjs from the pinned Fontsource packages. Do not edit.",
  "Run `npm run fonts:sync` in client/ after changing the font packages or the script.",
];

// ---------------------------------------------------------------------------------------------
// Building the expected outputs
// ---------------------------------------------------------------------------------------------

function pkgDir(pkg) {
  return dirname(require.resolve(`${pkg}/package.json`));
}

function pkgVersion(pkg) {
  return JSON.parse(readFileSync(join(pkgDir(pkg), "package.json"), "utf8")).version;
}

function unicodeRanges(pkg) {
  return JSON.parse(readFileSync(join(pkgDir(pkg), "unicode.json"), "utf8"));
}

async function loadMetrics(name) {
  const mod = await import(pathToFileURL(require.resolve(`@capsizecss/metrics/${name}`)).href);
  return mod.default ?? mod;
}

const pct = (value) => `${(value * 100).toFixed(2)}%`;

/** Capsize-style overrides: scale the fallback so its average glyph width matches the face. */
function fallbackOverrides(metrics, fallback) {
  const targetAvg = metrics.xWidthAvg / metrics.unitsPerEm;
  const fallbackAvg = fallback.xWidthAvg / fallback.unitsPerEm;
  const sizeAdjust = targetAvg / fallbackAvg;
  return {
    sizeAdjust: pct(sizeAdjust),
    ascent: pct(metrics.ascent / metrics.unitsPerEm / sizeAdjust),
    descent: pct(Math.abs(metrics.descent) / metrics.unitsPerEm / sizeAdjust),
    lineGap: pct(metrics.lineGap / metrics.unitsPerEm / sizeAdjust),
  };
}

const isBold = (weight) => (typeof weight === "number" ? weight >= 600 : parseInt(String(weight), 10) >= 600);

/** The fallback bands of one shipped face: `{ weight, metrics, bold }`. */
function fallbackBands(def, face) {
  if (def.fallbackFaces) return def.fallbackFaces(face);
  return [{ weight: face.weight, metrics: def.metrics(face), bold: isBold(face.weight) }];
}

async function collectFaces(target) {
  const faces = [];
  const fallbacks = [];
  const base = {
    regular: await loadMetrics(FALLBACK_METRICS.regular),
    bold: await loadMetrics(FALLBACK_METRICS.bold),
  };
  const android = {
    regular: await loadMetrics(ANDROID_METRICS.regular),
    bold: await loadMetrics(ANDROID_METRICS.bold),
  };
  for (const id of target.families) {
    const def = FAMILIES[id];
    const ranges = unicodeRanges(def.pkg);
    for (const face of def.faces) {
      if (target.pickFace && !target.pickFace(id, face)) continue;
      for (const subset of def.subsets) {
        if (!ranges[subset]) throw new Error(`${def.pkg} has no ${subset} unicode range`);
        const file = def.file(subset, face);
        const source = join(pkgDir(def.pkg), "files", file);
        if (!existsSync(source)) throw new Error(`Missing ${relative(clientRoot, source)}`);
        const version = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 10);
        faces.push({ id, family: def.family, variable: !!def.variable, ...face, subset, file, version, source, unicodeRange: ranges[subset] });
      }
      if (!def.fallback) continue;
      for (const band of fallbackBands(def, face)) {
        const kind = band.bold ? "bold" : "regular";
        const faceMetrics = await loadMetrics(band.metrics);
        const overrides = fallbackOverrides(faceMetrics, base[kind]);
        const androidOverrides = fallbackOverrides(faceMetrics, android[kind]);
        const drift = Math.abs(parseFloat(androidOverrides.sizeAdjust) / parseFloat(overrides.sizeAdjust) - 1);
        const ownAndroid = drift > MAX_ANDROID_SIZE_DRIFT;
        const common = { weight: band.weight, style: face.style, metrics: band.metrics, base: FALLBACK_METRICS[kind] };
        fallbacks.push({
          family: `${def.family} Fallback`,
          ...common,
          src: ownAndroid ? FALLBACK_LOCAL[kind] : [...FALLBACK_LOCAL[kind], ...ANDROID_LOCAL[kind]],
          ...overrides,
        });
        if (ownAndroid) {
          fallbacks.push({
            family: `${def.family} Fallback${ANDROID_SUFFIX}`,
            ...common,
            base: ANDROID_METRICS[kind],
            src: ANDROID_LOCAL[kind],
            ...androidOverrides,
          });
        }
      }
    }
  }
  return { faces, fallbacks };
}

/** Brand family -> its fallback families, in stack order (the Android one only when needed). */
function fallbackFamilies(fallbacks) {
  const out = {};
  for (const fb of fallbacks) {
    const brand = fb.family.replace(/ Fallback( Android)?$/, "");
    out[brand] = out[brand] ?? [];
    if (!out[brand].includes(fb.family)) out[brand].push(fb.family);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.length - b.length);
  return out;
}

/**
 * The URL of a shipped file: `<base><file>?v=<content hash>`. File names stay stable (tests, the
 * Heist CDN copy and the e2e checks name them), while the query changes whenever the bytes do, so a
 * font update never serves a stale cached copy and the files can be cached long-term.
 */
const fontUrl = (base, face) => `${base}${face.file}?v=${face.version}`;

function cssFontFace(face, url) {
  const format = face.variable ? `format("woff2-variations"), url("${url}") format("woff2")` : 'format("woff2")';
  return [
    "@font-face {",
    `  font-family: "${face.family}";`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    "  font-display: swap;",
    `  src: url("${url}") ${format};`,
    `  unicode-range: ${face.unicodeRange};`,
    "}",
  ].join("\n");
}

function cssFallbackFace(fb) {
  return [
    `/* ${fb.metrics} on ${fb.base} */`,
    "@font-face {",
    `  font-family: "${fb.family}";`,
    `  font-style: ${fb.style};`,
    `  font-weight: ${fb.weight};`,
    `  src: ${fb.src.join(", ")};`,
    `  size-adjust: ${fb.sizeAdjust};`,
    `  ascent-override: ${fb.ascent};`,
    `  descent-override: ${fb.descent};`,
    `  line-gap-override: ${fb.lineGap};`,
    "}",
  ].join("\n");
}

function scssFile(target, faces, fallbacks) {
  const blocks = [
    `// ${HEADER_LINES[0]}\n// ${HEADER_LINES[1]}`,
    "// Brand faces, self-hosted (plan F4). Family names match the old Google Fonts ones.",
    ...faces.map((f) => `/* ${f.file.replace(/\.woff2$/, "")} */\n${cssFontFace(f, fontUrl(target.urlBase, f))}`),
    '// Metric-matched fallbacks: list "<Family> Fallback" (and "<Family> Fallback Android" where it\n// exists) right after the family in a stack so the swap to the brand face does not shift the layout.',
    ...fallbacks.map(cssFallbackFace),
  ];
  return `${blocks.join("\n\n")}\n`;
}

const json = (value) => JSON.stringify(value);

function versions(target) {
  const out = {};
  for (const id of target.families) out[FAMILIES[id].pkg] = pkgVersion(FAMILIES[id].pkg);
  out["@capsizecss/metrics"] = pkgVersion("@capsizecss/metrics");
  return out;
}

/** Versioned URLs of the latin files of `list` ([family id, face] pairs). */
function preloadUrls(target, faces, list) {
  return list.map(([id, face]) => {
    const match = faces.find(
      (f) => f.id === id && f.subset === "latin" && String(f.weight) === String(face.weight) && f.style === face.style,
    );
    if (!match) throw new Error(`Preload face ${id} ${face.weight} ${face.style} is not synced for ${target.name}`);
    return fontUrl(target.urlBase, match);
  });
}

function preloadModule(target, faces) {
  return [
    `/**\n * ${HEADER_LINES[0]}\n * ${HEADER_LINES[1]}\n */`,
    "",
    "/** Latin files `_document` preloads, with the same `?v=` URLs as the `@font-face` rules. */",
    `export const PRELOAD_FONT_FILES: ReadonlyArray<string> = ${json(preloadUrls(target, faces, target.preload))};`,
    "",
  ].join("\n");
}

function clientManifest(target, faces, fallbacks) {
  const preload = preloadUrls(target, faces, PRELOAD);
  const rows = faces.map(
    (f) =>
      `  { family: ${json(f.family)}, weight: ${json(f.weight)}, style: ${json(f.style)}, subset: ${json(f.subset)}, file: ${json(fontUrl(target.urlBase, f))} },`,
  );
  return [
    `/**\n * ${HEADER_LINES[0]}\n * ${HEADER_LINES[1]}\n *\n * Pure data (no imports) so design/tokens.ts, _document and the loader can all read it.\n */`,
    "",
    "export interface FontFileEntry {",
    "  family: string;",
    "  /** A number for static faces, a `min max` range for variable ones. */",
    "  weight: number | string;",
    '  style: "normal" | "italic";',
    '  subset: "latin" | "latin-ext";',
    "  /** Absolute URL, served from client/public/fonts, with a `?v=` content hash. */",
    "  file: string;",
    "}",
    "",
    "/** Every self-hosted face declared in styles/fonts.generated.scss. */",
    "export const FONT_FILES: ReadonlyArray<FontFileEntry> = [",
    ...rows,
    "];",
    "",
    "/**",
    " * Brand family -> its metric-matched fallback families, in stack order (declared in the same",
    ' * SCSS). The first is Arial-based; a second, "<Family> Fallback Android", carries Roboto where',
    " * Roboto's width differs from Arial's (the bold faces).",
    " */",
    `export const FALLBACK_FAMILIES: Readonly<Record<string, ReadonlyArray<string>>> = ${json(fallbackFamilies(fallbacks))};`,
    "",
    "/** The three brand faces `_document` preloads (latin subset). */",
    `export const PRELOAD_FONT_FILES: ReadonlyArray<string> = ${json(preload)};`,
    "",
    "/** Package versions the files were copied from. */",
    `export const FONT_SOURCE_VERSIONS: Readonly<Record<string, string>> = ${json(versions(target))};`,
    "",
  ].join("\n");
}

function heistModule(faces, fallbacks) {
  const nunitoStack = (fallbackFamilies(fallbacks).Nunito ?? []).map((f) => `'${f}'`).join(", ");
  const faceCss = faces.map((f) => cssFontFace(f, fontUrl("${fontsBase}", f)));
  const fallbackCss = fallbacks.map(cssFallbackFace);
  const css = [...faceCss, ...fallbackCss].join("\n");
  return [
    `/**\n * ${HEADER_LINES[0]}\n * ${HEADER_LINES[1]}\n *\n * Catnip Heist copy of the brand body face (decision #85: secondary text in Nunito instead of\n * system-ui). The woff2 files live in catnip-heist/public/fonts/.\n */`,
    "",
    "/** Font files shipped in public/fonts/ (relative to that directory). */",
    `export const HEIST_FONT_FILES: ReadonlyArray<string> = ${json(faces.map((f) => f.file))};`,
    "",
    "/** The stack for Heist secondary text: Nunito, then its metric-matched fallback. */",
    `export const HEIST_BODY_FONT = ${json(`'Nunito', ${nunitoStack}, ui-rounded, system-ui, sans-serif`)};`,
    "",
    "/**",
    " * The `@font-face` rules, with URLs under `fontsBase` (a directory URL ending in `/`, for example",
    " * `fonts/` for the relative dev and CDN builds, or `${DEPLOY_BASE}fonts/`).",
    " */",
    "export function heistFontFaceCss(fontsBase: string): string {",
    "  return `" + css.replace(/`/g, "\\`") + "`;",
    "}",
    "",
  ].join("\n");
}

function licenceName(id) {
  return `LICENSE-${id}.txt`;
}

async function expectedOutputs() {
  /** @type {Map<string, Buffer | string>} absolute path -> contents */
  const files = new Map();
  /** directories we own entirely; anything else in them is stale */
  const ownedDirs = [];
  for (const target of TARGETS) {
    const { faces, fallbacks } = await collectFaces(target);
    ownedDirs.push(target.fontsDir);
    for (const face of faces) files.set(join(target.fontsDir, face.file), readFileSync(face.source));
    for (const id of new Set(faces.map((f) => f.id))) {
      const licence = readFileSync(join(pkgDir(FAMILIES[id].pkg), "LICENSE"));
      files.set(join(target.fontsDir, licenceName(id)), licence);
    }
    if (target.scss) files.set(target.scss, scssFile(target, faces, fallbacks));
    if (target.manifest) files.set(target.manifest, clientManifest(target, faces, fallbacks));
    if (target.heistModule) files.set(target.heistModule, heistModule(faces, fallbacks));
    if (target.preloadModule) files.set(target.preloadModule, preloadModule(target, faces));
  }
  return { files, ownedDirs };
}

// ---------------------------------------------------------------------------------------------
// Write or check
// ---------------------------------------------------------------------------------------------

const same = (path, contents) => {
  if (!existsSync(path)) return false;
  const current = readFileSync(path);
  return Buffer.isBuffer(contents) ? current.equals(contents) : current.toString("utf8") === contents;
};

const show = (path) => relative(repoRoot, path);

async function main() {
  const check = process.argv.includes("--check");
  const { files, ownedDirs } = await expectedOutputs();

  const drift = [];
  for (const [path, contents] of files) {
    if (!same(path, contents)) drift.push(existsSync(path) ? `changed  ${show(path)}` : `missing  ${show(path)}`);
  }
  const stale = [];
  for (const dir of ownedDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!files.has(path)) stale.push(path);
    }
  }
  drift.push(...stale.map((path) => `stale    ${show(path)}`));

  if (check) {
    if (drift.length) {
      console.error(`Fonts are out of date (${drift.length}):\n  ${drift.join("\n  ")}\nRun: npm run fonts:sync`);
      process.exit(1);
    }
    console.log(`Fonts are up to date (${files.size} files).`);
    return;
  }

  for (const [path, contents] of files) {
    if (same(path, contents)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  for (const path of stale) rmSync(path);
  console.log(drift.length ? `Synced fonts:\n  ${drift.join("\n  ")}` : `Fonts already up to date (${files.size} files).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
