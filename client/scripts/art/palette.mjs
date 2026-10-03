/**
 * The art palette (plan G7 bullet 1): F3 tokens plus ramps derived from the landing hero, written
 * to `client/art/palette.json` (the pipeline's source of truth) and `client/art/palette.gpl` (GIMP /
 * Aseprite / Krita swatches for the artist).
 *
 * - `tokens`: every colour in `client/design/tokens.ts` (night, gold, ink, states, dusk, parchment).
 * - `hero`: k-means (k = 12, deterministic init) over the hero layers in OKLab; each chromatic
 *   centre becomes a 9-step ramp with hue-shifted shadows (toward violet) and lights (toward gold),
 *   the landing's own lighting. Near-identical hues are merged.
 * - `sprig`: the G8 catnip sprig colours, so the redrawn catnip tile is in palette.
 * - `looks`: per plate set (decision #50: a palette pass per family) a 12-step ramp at the set's hue
 *   and 24 sky shades clustered from the hero sky after that set's grade.
 *
 * - `bridges`: ramps across hue gaps wider than 60 degrees (grass, water, ice), at a calm chroma.
 *
 * A look's palette is `tokens + neutral + hero + bridges + sprig + looks[set]`, at most 256 colours, so every
 * plate and night sheet can ship as an indexed PNG.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { oklabToOklch, oklabToRgb, oklchToOklab, rgbToHex, rgbToOklab } from "./lib/color.mjs";
import { readRgba, resizeNearest } from "./lib/raster.mjs";
import { plateGrade } from "./lib/plates.mjs";
import { PLATE_SETS } from "./looks.mjs";

export const HERO_SOURCES = ["public/landing/hero-bg.webp", "public/landing/hero-ground.webp"];

export async function loadTokens(clientDir) {
  const tokensPath = join(clientDir, "design", "tokens.ts");
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const text = String(warning?.message ?? warning);
    const code = typeof rest[0] === "object" ? rest[0]?.code : rest[1];
    if (code === "MODULE_TYPELESS_PACKAGE_JSON" || /type stripping|Reparsing as ES module/i.test(text)) return;
    return emitWarning.call(process, warning, ...rest);
  };
  try {
    return await import(pathToFileURL(tokensPath).href);
  } catch (error) {
    const require = createRequire(import.meta.url);
    let jiti;
    try {
      jiti = require("jiti");
    } catch {
      throw error;
    }
    return jiti(import.meta.url, { interopDefault: true })(tokensPath);
  } finally {
    process.emitWarning = emitWarning;
  }
}

/** A seeded mulberry32, so the k-means init and therefore the palette are reproducible. */
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function kmeans(points, k, iterations = 24) {
  const rand = rng(0x7a11);
  // k-means++ init with the seeded generator.
  const centres = [points[Math.floor(rand() * points.length)]];
  const d2 = new Float64Array(points.length).fill(Infinity);
  while (centres.length < k) {
    const last = centres[centres.length - 1];
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const d = (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2 + (p[2] - last[2]) ** 2;
      if (d < d2[i]) d2[i] = d;
      sum += d2[i];
    }
    let pick = rand() * sum;
    let idx = 0;
    while (idx < points.length - 1 && (pick -= d2[idx]) > 0) idx++;
    centres.push(points[idx]);
  }
  let cs = centres.map((c) => [...c]);
  for (let it = 0; it < iterations; it++) {
    const acc = cs.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < cs.length; j++) {
        const c = cs[j];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      const a = acc[best];
      a[0] += p[0];
      a[1] += p[1];
      a[2] += p[2];
      a[3]++;
    }
    cs = acc.map((a, j) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : cs[j]));
  }
  return cs;
}

/** A ramp at one hue (9 steps by default): dark shadows lean violet, lights lean gold (the hero's lighting). */
export function ramp(hue, chroma, steps = 9) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Denser at the dark end, where night skies and shadows live (smooth gradients quantise
    // without visible bands).
    const L = 0.07 + 0.85 * t ** 1.45;
    const shaped = chroma * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)));
    const towardViolet = (1 - t) * 0.22;
    const towardGold = t * 0.16;
    const h = mixHue(mixHue(hue, 285, towardViolet), 75, towardGold);
    out.push(rgbToHex(oklabToRgb(oklchToOklab([L, shaped, h]))));
  }
  return out;
}

function mixHue(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

function hueDistance(a, b) {
  return Math.abs(((b - a + 540) % 360) - 180);
}

export async function buildPalette(clientDir) {
  const tokens = await loadTokens(clientDir);
  const tokenColours = {};
  for (const [name, hex] of Object.entries(tokens.TT_COLORS)) tokenColours[name] = hex.toLowerCase();

  // Hero sampling at a fixed 344 x 192 grid (nearest), opaque pixels only.
  const points = [];
  for (const rel of HERO_SOURCES) {
    const img = resizeNearest(await readRgba(join(clientDir, rel)), 344, 192);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 200) continue;
      points.push(rgbToOklab([img.data[i], img.data[i + 1], img.data[i + 2]]));
    }
  }
  const centres = kmeans(points, 20)
    .map((lab) => oklabToOklch(lab))
    .filter(([, C]) => C >= 0.025)
    .sort((a, b) => a[2] - b[2]);
  const heroHues = [];
  for (const [, C, h] of centres) {
    const near = heroHues.find((x) => hueDistance(x.h, h) < 16);
    if (near) near.C = Math.max(near.C, C);
    else heroHues.push({ h, C });
  }
  const hero = {};
  for (const { h, C } of heroHues) hero[`hue-${Math.round(h)}`] = ramp(h, Math.min(0.16, Math.max(0.06, C)));

  // Bridges: the hero is violet and ember, so world hues it lacks (grass, water, ice) get ramps at
  // evenly spaced hues across every gap wider than 60 degrees, at a calm night chroma. Without them
  // a green tile would snap to violet and lose its identity.
  const bridges = {};
  const hues = heroHues.map((x) => x.h).sort((a, b) => a - b);
  for (let i = 0; i < hues.length; i++) {
    const from = hues[i];
    const to = i + 1 < hues.length ? hues[i + 1] : hues[0] + 360;
    const gap = to - from;
    if (gap <= 60) continue;
    const parts = Math.ceil(gap / 60);
    for (let j = 1; j < parts; j++) {
      const h = (from + (gap * j) / parts) % 360;
      bridges[`hue-${Math.round(h)}`] = ramp(h, 0.09);
    }
  }

  const neutral = ramp(285, 0.025, 12);

  const sprigFile = join(clientDir, "art", "catnip", "palette.json");
  const sprig = Object.values(JSON.parse(readFileSync(sprigFile, "utf8")).colors).map((h) => String(h).toLowerCase());

  // Each set's palette pass: its own 12-step ramp, plus 24 sky shades clustered from the hero sky
  // after that set's grade, so night gradients quantise without hard bands.
  const sky = resizeNearest(await readRgba(join(clientDir, HERO_SOURCES[0])), 344, 192);
  const looks = {};
  for (const [id, set] of Object.entries(PLATE_SETS)) {
    const grade = plateGrade(set, "sky");
    const pts = [];
    for (let y = 0; y < Math.floor(sky.height * 0.75); y++) {
      for (let x = 0; x < sky.width; x++) {
        const i = (y * sky.width + x) * 4;
        pts.push(rgbToOklab(grade([sky.data[i], sky.data[i + 1], sky.data[i + 2]])));
      }
    }
    const shades = kmeans(pts, 24)
      .sort((a, b) => a[0] - b[0])
      .map((lab) => rgbToHex(oklabToRgb(lab)));
    looks[id] = { ramp: ramp(set.hue, 0.11, 12), sky: [...new Set(shades)] };
  }

  return {
    comment:
      "Generated by client/scripts/art/build.mjs --palette from client/design/tokens.ts and the landing hero (plan G7). Do not hand-edit; change the tokens or the look catalogue (scripts/art/looks.mjs) and rebuild.",
    version: 1,
    sources: { tokens: "client/design/tokens.ts", hero: HERO_SOURCES.map((p) => `client/${p}`), sprig: "client/art/catnip/palette.json" },
    tokens: tokenColours,
    neutral,
    hero,
    bridges,
    sprig,
    looks,
    rules: {
      collidableContrastMin: 3,
      hazardContrastMin: 3,
      plateEdgeSsimMin: 0.85,
      platePaletteHard: true,
      tilePaletteHard: true,
      maxColoursPerLook: 256,
    },
  };
}

/** Every colour a look may use (deduplicated, lowercase). */
export function lookPalette(palette, setId) {
  const all = [
    ...Object.values(palette.tokens),
    ...palette.neutral,
    ...Object.values(palette.hero).flat(),
    ...Object.values(palette.bridges ?? {}).flat(),
    ...palette.sprig,
    ...(palette.looks[setId]?.ramp ?? []),
    ...(palette.looks[setId]?.sky ?? []),
  ].map((h) => h.toLowerCase());
  return [...new Set(all)];
}

/** GIMP palette text. */
export function toGpl(palette) {
  const lines = ["GIMP Palette", "Name: Token Tails night (G7)", "Columns: 7", "#", "# Generated by client/scripts/art/build.mjs --palette. Do not hand-edit."];
  const row = (hex, name) => {
    const v = parseInt(hex.slice(1), 16);
    lines.push(`${String((v >> 16) & 255).padStart(3)} ${String((v >> 8) & 255).padStart(3)} ${String(v & 255).padStart(3)}\t${name}`);
  };
  for (const [name, hex] of Object.entries(palette.tokens)) row(hex, `tt-${name}`);
  palette.neutral.forEach((hex, i) => row(hex, `neutral-${i}`));
  for (const [name, hexes] of Object.entries(palette.hero)) hexes.forEach((hex, i) => row(hex, `hero-${name}-${i}`));
  for (const [name, hexes] of Object.entries(palette.bridges ?? {})) hexes.forEach((hex, i) => row(hex, `bridge-${name}-${i}`));
  palette.sprig.forEach((hex, i) => row(hex, `sprig-${i}`));
  for (const [name, look] of Object.entries(palette.looks)) {
    look.ramp.forEach((hex, i) => row(hex, `look-${name}-${i}`));
    look.sky.forEach((hex, i) => row(hex, `look-${name}-sky-${i}`));
  }
  return `${lines.join("\n")}\n`;
}
