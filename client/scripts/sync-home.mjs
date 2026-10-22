#!/usr/bin/env node
/**
 * Builds the web home page (public/home, served at "/" by next.config.js) from the static
 * Play-to-Save landing (docs/CLIENT.md "Home page (/)").
 *
 *   node scripts/sync-home.mjs <landing dir>     e.g. ../landing-poc/v16c1
 *
 * The landing is one self-contained index.html that reads its media from its own media/ folder
 * and from sibling landing folders (../v12/media, ../v14/media, ../v15/media), plus community
 * reel clips from the pitch deck site. This script:
 * - copies only the media files the page references into public/home/media/ (own files at the
 *   top, sibling folders under v12/, v14/, v15/, reel clips under reels/), after emptying
 *   public/home, so no stale file stays behind;
 * - rewrites every media path to an absolute /home/media/... path (the page is served at "/",
 *   so relative paths would resolve against the site root);
 * - makes tokentails.com links same-origin (canonical, og: and twitter: tags stay absolute);
 * - swaps the single favicon link for the shared icon family and manifest of pages/_document.js
 *   (scripts/check-meta.mjs checks both);
 * - points the live data reads (/api/*.json on the landing-poc deploy) at api.tokentails.com;
 * - fails on the wallet button layout Stripe rejects (overflow never needs maxRows 0);
 * - strips HTML comments and the block comments in <style> and <script> (dev notes that name internal
 *   files and plans; they never reach visitors);
 * - turns off the click beacon (POST /api/evt is a landing-poc Vercel function with no
 *   tokentails.com counterpart), so the page sends nothing and logs nothing.
 * It fails when a referenced file is missing or a known pattern was not found, so a changed
 * landing cannot ship half rewritten.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/home");
const BASE = "/home/media/";
const REEL_ORIGIN = "https://token-tails-pitch.vercel.app/deck-assets/videos/";
const SIBLINGS = ["v12", "v14", "v15"];
const API = "https://api.tokentails.com";
/**
 * The landing's same-origin data paths (landing-poc/vercel.json rewrites) and the API routes behind them.
 * tokentails.com calls the API straight from the browser instead: the API allows https://tokentails.com
 * (CORS, a plain GET with no preflight) and throttles per visitor IP, which a server-side proxy would
 * collapse into the proxy's few addresses.
 */
export const API_PATHS = Object.freeze({
  "/api/goal.json": `${API}/shelter/goal/C-001`,
  "/api/gallery.json": `${API}/shelter/rozine-pedute/gallery`,
  "/api/rave-status.json": `${API}/rave/status`,
  "/api/club-status.json": `${API}/club/status`,
  "/api/impact.json": `${API}/impact`,
  "/api/treats.json": `${API}/shelter/donate/status`,
});

/** The icon family and manifest pages/_document.js renders on every Next page. */
const ICON_HEAD = [
  '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">',
  '<link rel="icon" href="/icons/icon-32.png" type="image/png" sizes="32x32">',
  '<link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">',
  '<link rel="manifest" href="/manifest.webmanifest">',
].join("\n");

const fail = (message) => {
  console.error(`sync-home: ${message}`);
  process.exit(1);
};

/** Replaces exactly `count` matches (or at least one when count is omitted), else fails. */
function must(html, pattern, replacement, label, count) {
  const hits = html.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"));
  const n = hits ? hits.length : 0;
  if (n === 0 || (count !== undefined && n !== count)) fail(`${label}: expected ${count ?? "1+"} match(es), found ${n}`);
  return html.replace(pattern, replacement);
}

/** Every local media path the page uses, as written in the source (relative to the landing dir). */
export function referencedMedia(html) {
  const found = new Set();
  for (const m of html.matchAll(/['"(=](\.\.\/v1\d\/media\/[^'"\s)]+|media\/[^'"\s)]+)/g)) found.add(m[1]);
  // Game tabs: M = ../v12/media/, V = ../v15/media/ (M+'heist-loop.mp4').
  for (const m of html.matchAll(/\b([MV])\+'([^']+)'(?!\+)/g)) {
    found.add((m[1] === "M" ? "../v12/media/" : "../v15/media/") + m[2]);
  }
  // Curated cats: M+'t/'+c.img+'.webp' and M+'t/'+c.art+'.webp'.
  for (const m of html.matchAll(/img:'([\w-]+)',art:'([\w-]+)'/g)) {
    found.add(`../v12/media/t/${m[1]}.webp`);
    found.add(`../v12/media/t/${m[2]}.webp`);
  }
  // Hero wall thumbs: 'media/t/'+id+'.webp' for every id in TH.
  const th = /var TH=\{\};'([\d,]+)'/.exec(html);
  if (!th) fail("hero thumb list (var TH) not found");
  for (const id of th[1].split(",")) found.add(`media/t/${id}.webp`);
  return [...found].filter((p) => !p.endsWith("/")).sort();
}

/** Community reel ids: the IG table, one poster (.jpg) and one clip (.mp4) each. */
export function reelIds(html) {
  const table = /var IG=\[([\s\S]*?)\n\s*\];/.exec(html);
  if (!table) fail("community reel table (var IG) not found");
  return [...table[1].matchAll(/\['([\w-]+)'/g)].map((m) => m[1]);
}

/** Where a source path lands under public/home. */
const target = (p) => {
  const sib = /^\.\.\/(v1\d)\/media\/(.+)$/.exec(p);
  return sib ? join("media", sib[1], sib[2]) : p;
};

/**
 * Drops HTML comments and the block comments inside <style> and <script>. Line comments stay (a `//` can sit
 * in a URL or regex). The page has no block-comment marker inside a string or regex; one would be cut here.
 */
export function stripComments(html) {
  return html
    .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/g, (_, open, _tag, body, close) => open + body.replace(/\/\*[\s\S]*?\*\//g, "") + close)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function rewriteHtml(html) {
  for (const v of SIBLINGS) html = html.split(`../${v}/media/`).join(`${BASE}${v}/`);
  html = must(html, /(['"(])media\//g, `$1${BASE}`, "own media paths");
  html = must(html, /var B='https:\/\/token-tails-pitch\.vercel\.app\/deck-assets\/videos\/'/, `var B='${BASE}reels/'`, "reel origin", 1);
  html = must(html, /var API_EVT='\/api\/evt\/'/, "var API_EVT=''", "beacon endpoint", 1);
  html = must(html, /function track\(evt,cta\)\{/, "function track(evt,cta){if(!API_EVT)return;", "beacon guard", 1);
  html = must(html, /<link rel="icon" href="[^"]*">/, ICON_HEAD, "favicon link", 1);
  for (const [path, url] of Object.entries(API_PATHS)) html = html.split(`'${path}'`).join(`'${url}'`);
  if (/['"]\/api\//.test(html)) fail("a same-origin /api/ path is left in the page (add it to API_PATHS)");
  // Stripe throws on overflow 'never' unless maxRows is 0 ("only supported when options.layout.maxRows is 0"),
  // and the Apple Pay / Google Pay buttons then never mount.
  if (/overflow:'never'/.test(html) && !/maxRows:0,overflow:'never'/.test(html)) fail("wallet layout: overflow 'never' needs maxRows:0");
  html = stripComments(html);
  // Same-origin links and assets; the tags that must name the production origin stay absolute.
  html = html
    .split("\n")
    .map((line) => (/<meta |rel="canonical"/.test(line) ? line : line.split("https://tokentails.com/").join("/")))
    .join("\n");
  html = html.replace(/(['"])https:\/\/tokentails\.com(['"])/g, "$1/$2");
  return html;
}

async function main() {
  const src = process.argv[2];
  if (!src) fail("usage: node scripts/sync-home.mjs <landing dir> (for example ../landing-poc/v16c1)");
  const dir = resolve(src);
  const page = join(dir, "index.html");
  if (!existsSync(page)) fail(`${page} not found`);
  const html = readFileSync(page, "utf8");

  const media = referencedMedia(html);
  const missing = media.filter((p) => !existsSync(resolve(dir, p)));
  if (missing.length) fail(`missing media:\n  ${missing.join("\n  ")}`);

  rmSync(OUT, { recursive: true, force: true });
  let bytes = 0;
  for (const p of media) {
    const to = join(OUT, target(p));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(resolve(dir, p), to);
    bytes += statSync(to).size;
  }

  const ids = reelIds(html);
  mkdirSync(join(OUT, "media", "reels"), { recursive: true });
  for (const id of ids) {
    for (const ext of ["jpg", "mp4"]) {
      const name = `reel-${id}.${ext}`;
      const res = await fetch(REEL_ORIGIN + name);
      if (!res.ok) fail(`${REEL_ORIGIN}${name}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(OUT, "media", "reels", name), buf);
      bytes += buf.length;
    }
  }

  const out = rewriteHtml(html);
  if (/\.\.\/v1\d\/media|token-tails-pitch\.vercel\.app/.test(out)) fail("a relative sibling path or the pitch origin is left in the page");
  writeFileSync(join(OUT, "index.html"), out);
  bytes += Buffer.byteLength(out);
  const files = media.length + ids.length * 2 + 1;
  console.log(`sync-home: wrote ${files} files, ${(bytes / 1e6).toFixed(1)} MB, to ${OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
