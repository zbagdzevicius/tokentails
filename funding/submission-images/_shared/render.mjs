#!/usr/bin/env node
/**
 * Render an HTML page (or the brand template with a JSON spec) to a PNG/JPG at exact pixel size.
 *
 * Uses the Playwright already installed in client/node_modules (Chrome channel, falls back to the
 * bundled Chromium). Fonts load from ./fonts via @font-face in brand.css.
 *
 * Usage
 *   node render.mjs page.html out.png 1200 630                 # any HTML file
 *   node render.mjs page.html out.png 512 512 --transparent    # keep alpha (page must not paint a bg)
 *   node render.mjs page.html out.jpg 1920 1080 --quality 88   # JPG by extension
 *   node render.mjs --spec banner.json out.png                 # template.html filled from a JSON spec
 *   node render.mjs "logo.html?mark=cat&bg=night" logos/x.png 1024 1024  # query strings pass through
 *   node render.mjs --url https://tokentails.com shot.png 1440 900 [--full] [--wait 2500]
 *
 * Spec JSON (all optional except w/h), read by template.html as window.SPEC:
 *   { "w":1200, "h":630, "kicker":"Arc Microgrants", "title":"Token Tails",
 *     "subtitle":"Play cat games. Fund real shelters.", "badge":"Testnet proof",
 *     "bg":"assets/hero-await.webp", "art":"screens/live-landing-1440.png",
 *     "artMode":"device|card|full|none", "logo":true, "footer":"tokentails.com",
 *     "align":"left|center", "accent":"#ffcc55", "dim":0.55 }
 * Relative paths in a spec resolve from this _shared folder; absolute paths work too.
 */
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const require = createRequire(path.join(repo, "client/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--quality", "--wait", "--spec", "--url", "--scale"].includes(args[i - 1])));

async function launch() {
  try { return await chromium.launch({ channel: "chrome" }); }
  catch { return await chromium.launch(); }
}

async function main() {
  const browser = await launch();
  const quality = Number(opt("--quality", 90));
  const scale = Number(opt("--scale", 1));
  let out, w, h, target, spec;

  if (flag("--spec")) {
    const specPath = path.resolve(opt("--spec"));
    spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    spec.base = pathToFileURL(path.dirname(specPath) + "/").href;
    spec.shared = pathToFileURL(here + "/").href;
    out = pos[0]; w = spec.w; h = spec.h;
    target = pathToFileURL(path.join(here, "template.html")).href;
  } else if (flag("--url")) {
    target = opt("--url"); [out, w, h] = [pos[0], +pos[1], +pos[2]];
  } else {
    const [file, query] = pos[0].split("?");
    target = pathToFileURL(path.resolve(file)).href + (query ? "?" + query : ""); [out, w, h] = [pos[1], +pos[2], +pos[3]];
  }
  if (!out || !w || !h) { console.error("usage: see header of render.mjs"); process.exit(2); }

  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale,
    isMobile: flag("--mobile"), hasTouch: flag("--mobile") });
  const page = await ctx.newPage();
  if (spec) await page.addInitScript((s) => { window.SPEC = s; }, spec);
  await page.goto(target, { waitUntil: flag("--url") ? "networkidle" : "load", timeout: 90000 }).catch((e) => console.warn("goto:", e.message));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  if (spec) { await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 }).catch(() => console.warn("fit timeout"));
    const fit = await page.evaluate(() => window.__fit); if (fit && fit.n) console.log(`text scaled to ${(fit.t / fit.u * 100).toFixed(0)}%`); }
  await page.waitForTimeout(Number(opt("--wait", flag("--url") ? 2500 : 300)));
  const jpg = /\.jpe?g$/i.test(out);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out, fullPage: flag("--full"), omitBackground: flag("--transparent"),
    type: jpg ? "jpeg" : "png", ...(jpg ? { quality } : {}) });
  await browser.close();
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`${out} ${w}x${h}${scale !== 1 ? "@" + scale + "x" : ""} ${kb} KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
