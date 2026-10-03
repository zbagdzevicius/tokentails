#!/usr/bin/env node
/**
 * Checks the served meta of the public pages (plan G14 "Icons and meta", F12).
 *
 *   node scripts/check-meta.mjs                         against http://localhost:3001
 *   node scripts/check-meta.mjs --base http://localhost:3000 [--json] [--fetch-og]
 *
 * Run it against `next start` (or `next dev`). For every page in PAGES it fetches the HTML without
 * following redirects and checks:
 * - 200, no redirect (`/heist` is a Next host page now, no longer a 302 to a static file);
 * - one icon family: exactly the `_document` icon links, nothing else with `rel=icon`;
 * - one manifest link and one night theme-color (#0b0820);
 * - one canonical, equal to the expected path on the site origin (never with `?ref=`), and
 *   `og:url` equal to it;
 * - absolute `og:title`, `og:description`, `og:image` with a 1200x630 `og:image:width/height`;
 * - no `@undefined`, `https:/` without the second slash, or an unreplaced `%VITE_` anywhere.
 * Then the manifest (night colours, PNG icons that exist at their declared size, a maskable entry,
 * `start_url: /game`), `favicon.ico` (16 and 32 frames) and the Heist build's own HTML
 * (`/heist-game/index.html`: description, canonical to `/heist`, the shared icons).
 *
 * `--fetch-og` also downloads each `og:image` and reads its real size. It is off by default
 * because the origin in the tags is production (the CDN), which a local run must not depend on.
 *
 * Exit 0 when everything passes, 1 otherwise. The checks are exported for the unit test.
 */
import { fileURLToPath } from "node:url";

export const NIGHT = "#0b0820";
export const OG_SIZE = { width: 1200, height: 630 };

/** The icon links `_document` renders (pages/_document.js ICON_LINKS), as `rel href` pairs. */
export const ICON_FAMILY = [
  "icon /favicon.ico",
  "icon /icons/icon-32.png",
  "icon /icons/icon-192.png",
  "apple-touch-icon /icons/apple-touch-icon.png",
];

/**
 * The pages and what their canonical must be. `request` may add a query the canonical must drop.
 * `noindex` pages have no canonical.
 */
export const PAGES = [
  { request: "/", canonical: "/" },
  { request: "/game?ref=check-meta", canonical: "/game" },
  { request: "/heist", canonical: "/heist" },
  { request: "/packs", canonical: "/packs" },
  { request: "/shelter-payouts", canonical: "/shelter-payouts" },
  { request: "/impact", canonical: "/impact" },
];

const BAD_STRINGS = [
  { label: "@undefined", test: (html) => html.includes("@undefined") },
  { label: "https:/ (missing slash)", test: (html) => /https?:\/(?!\/)/.test(html) },
  { label: "%VITE_", test: (html) => html.includes("%VITE_") },
];

// ---- parsing ---------------------------------------------------------------------------------

const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Attributes of one start tag (`<meta a="b" c>`), lower-cased names, decoded values. */
export function parseAttributes(tag) {
  const attrs = {};
  const re = /([^\s=/<>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<\s*[a-z0-9-]+/i, "").replace(/\/?>$/, "");
  let m;
  while ((m = re.exec(body))) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Every `<meta>` and `<link>` in the document head (the part before `</head>`). */
export function parseHead(html) {
  const end = html.search(/<\/head>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const tags = (name) => [...head.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => parseAttributes(m[0]));
  const titles = [...head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => decode(m[1]));
  return { metas: tags("meta"), links: tags("link"), titles };
}

const relsOf = (link) => (link.rel || "").toLowerCase().split(/\s+/).filter(Boolean);
const isIconRel = (link) => relsOf(link).some((r) => r === "icon" || r === "apple-touch-icon" || r === "mask-icon");

/** `content` of the metas with `name` or `property` equal to `key`. */
export function metaValues(head, key) {
  return head.metas.filter((m) => m.name === key || m.property === key).map((m) => m.content ?? "");
}

// ---- checks ----------------------------------------------------------------------------------

/**
 * Checks one page's HTML. `origin` is the site origin the canonical must use (taken from the
 * landing's canonical when not given, so a staging origin works too).
 */
export function checkPageHtml(html, { canonical, origin, noindex = false } = {}) {
  const errors = [];
  const head = parseHead(html);

  const icons = head.links.filter(isIconRel).map((l) => `${relsOf(l).filter((r) => r !== "shortcut").join(" ")} ${l.href}`);
  const extra = icons.filter((i) => !ICON_FAMILY.includes(i));
  const missing = ICON_FAMILY.filter((i) => !icons.includes(i));
  if (extra.length) errors.push(`icon links outside the shared family: ${extra.join(", ")}`);
  if (missing.length) errors.push(`missing icon links: ${missing.join(", ")}`);
  if (icons.length !== new Set(icons).size) errors.push("duplicate icon links");

  const manifests = head.links.filter((l) => relsOf(l).includes("manifest"));
  if (manifests.length !== 1 || manifests[0].href !== "/manifest.webmanifest") {
    errors.push(`expected one manifest link to /manifest.webmanifest, got ${manifests.map((l) => l.href).join(", ") || "none"}`);
  }

  const themes = metaValues(head, "theme-color");
  if (themes.length !== 1 || themes[0].toLowerCase() !== NIGHT) {
    errors.push(`expected one theme-color ${NIGHT}, got ${themes.join(", ") || "none"}`);
  }

  if (head.titles.length !== 1 || !head.titles[0].trim()) errors.push(`expected one title, got ${head.titles.length}`);

  const canonicals = head.links.filter((l) => relsOf(l).includes("canonical")).map((l) => l.href);
  const ogUrl = metaValues(head, "og:url");
  if (noindex) {
    if (canonicals.length) errors.push("a noindex page has a canonical");
  } else {
    if (canonicals.length !== 1) {
      errors.push(`expected one canonical, got ${canonicals.length}`);
    } else {
      const href = canonicals[0];
      let url = null;
      try {
        url = new URL(href);
      } catch {
        errors.push(`canonical is not an absolute URL: ${href}`);
      }
      if (url) {
        if (url.search) errors.push(`canonical carries a query: ${href}`);
        if (canonical && url.pathname !== canonical) errors.push(`canonical path ${url.pathname}, expected ${canonical}`);
        if (origin && url.origin !== origin) errors.push(`canonical origin ${url.origin}, expected ${origin}`);
      }
      if (ogUrl.length !== 1 || ogUrl[0] !== href) errors.push(`og:url ${ogUrl.join(", ") || "missing"} differs from the canonical ${href}`);
    }
  }

  for (const key of ["og:title", "og:description", "og:image"]) {
    const values = metaValues(head, key);
    if (values.length !== 1 || !values[0].trim()) errors.push(`expected one ${key}, got ${values.length}`);
  }
  const image = metaValues(head, "og:image")[0];
  if (image && !/^https?:\/\/[^/]/.test(image)) errors.push(`og:image is not absolute: ${image}`);
  const width = metaValues(head, "og:image:width")[0];
  const height = metaValues(head, "og:image:height")[0];
  if (width !== String(OG_SIZE.width) || height !== String(OG_SIZE.height)) {
    errors.push(`og:image is ${width || "?"}x${height || "?"}, expected ${OG_SIZE.width}x${OG_SIZE.height}`);
  }

  for (const bad of BAD_STRINGS) {
    if (bad.test(html)) errors.push(`contains ${bad.label}`);
  }
  return { errors, head, canonical: canonicals[0] ?? null, ogImage: image ?? null };
}

/** Width and height of a PNG (IHDR) or JPEG (SOFn), or null. */
export function imageSize(buffer) {
  const b = Buffer.from(buffer);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { type: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const length = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: "image/jpeg", width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + length;
    }
  }
  return null;
}

/** The frame sizes inside an `.ico`, or null when it is not one. */
export function icoSizes(buffer) {
  const b = Buffer.from(buffer);
  if (b.length < 6 || b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) return null;
  const count = b.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    if (at + 16 > b.length) return null;
    sizes.push(b[at] || 256);
  }
  return sizes;
}

/**
 * Checks the parsed manifest. `iconInfo(src)` returns `{ status, type, width, height }` for an
 * icon (or null to skip the file checks).
 */
export async function checkManifest(manifest, iconInfo = null) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["manifest is not JSON"];
  if (!manifest.name) errors.push("manifest has no name");
  if (manifest.start_url !== "/game") errors.push(`start_url ${manifest.start_url}, expected /game`);
  for (const key of ["theme_color", "background_color"]) {
    if ((manifest[key] || "").toLowerCase() !== NIGHT) errors.push(`${key} ${manifest[key]}, expected ${NIGHT}`);
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  if (!icons.length) errors.push("manifest has no icons");
  const purposes = (icon) => (icon.purpose || "any").split(/\s+/);
  if (!icons.some((i) => purposes(i).includes("maskable"))) errors.push("no maskable icon");
  for (const size of ["192x192", "512x512"]) {
    if (!icons.some((i) => i.sizes === size && purposes(i).includes("any"))) errors.push(`no ${size} any icon`);
  }
  if (icons.some((i) => purposes(i).includes("any") && purposes(i).includes("maskable"))) {
    errors.push('an icon is both "any" and "maskable" (a padded icon looks small, an unpadded one gets cropped)');
  }
  for (const icon of icons) {
    if (icon.type !== "image/png" || !/\.png$/i.test(icon.src || "")) errors.push(`icon ${icon.src} is not typed and named PNG`);
    if (!iconInfo) continue;
    const info = await iconInfo(icon.src);
    if (!info) continue;
    if (info.status !== 200) {
      errors.push(`icon ${icon.src} answers ${info.status}`);
      continue;
    }
    if (info.type !== "image/png") errors.push(`icon ${icon.src} is not a PNG file`);
    if (`${info.width}x${info.height}` !== icon.sizes) errors.push(`icon ${icon.src} is ${info.width}x${info.height}, declared ${icon.sizes}`);
  }
  return errors;
}

/** Checks the Heist build's own HTML (direct loads of `/heist-game/index.html`). */
export function checkHeistBuildHtml(html) {
  const errors = [];
  const head = parseHead(html);
  if (!metaValues(head, "description")[0]) errors.push("heist-game: no description");
  const canonical = head.links.filter((l) => relsOf(l).includes("canonical")).map((l) => l.href);
  if (canonical.length !== 1 || !/^https:\/\/[^/]+\/heist$/.test(canonical[0])) {
    errors.push(`heist-game: canonical ${canonical.join(", ") || "missing"}, expected https://<site>/heist`);
  }
  const icons = head.links.filter(isIconRel).map((l) => l.href);
  if (!icons.length || icons.some((href) => !/^\/(favicon\.ico|icons\/)/.test(href))) {
    errors.push(`heist-game: icons are not the shared set: ${icons.join(", ") || "none"}`);
  }
  for (const bad of BAD_STRINGS) {
    if (bad.test(html)) errors.push(`heist-game: contains ${bad.label}`);
  }
  return errors;
}

// ---- runner ----------------------------------------------------------------------------------

async function fetchRaw(url) {
  const response = await fetch(url, { redirect: "manual", headers: { "user-agent": "tokentails-check-meta" } });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, location: response.headers.get("location"), body };
}

/** Runs every check against a server; returns `{ ok, results }`. */
export async function runCheckMeta({ base, fetchOg = false, fetcher = fetchRaw } = {}) {
  const root = base.replace(/\/+$/, "");
  const results = [];
  let origin = null;

  for (const page of PAGES) {
    const res = await fetcher(`${root}${page.request}`);
    const errors = [];
    if (res.status !== 200) {
      errors.push(`status ${res.status}${res.location ? ` -> ${res.location}` : ""} (expected 200, no redirect)`);
      results.push({ target: page.request, errors });
      continue;
    }
    const html = res.body.toString("utf8");
    const checked = checkPageHtml(html, { canonical: page.canonical, origin });
    if (!origin && checked.canonical) {
      try {
        origin = new URL(checked.canonical).origin;
      } catch {
        // reported by checkPageHtml
      }
    }
    errors.push(...checked.errors);
    if (fetchOg && checked.ogImage) {
      try {
        const img = await fetcher(checked.ogImage);
        const size = img.status === 200 ? imageSize(img.body) : null;
        if (!size) errors.push(`og:image ${checked.ogImage} answers ${img.status} or is not an image`);
        else if (size.width !== OG_SIZE.width || size.height !== OG_SIZE.height) {
          errors.push(`og:image file is ${size.width}x${size.height}`);
        }
      } catch (error) {
        errors.push(`og:image ${checked.ogImage} failed: ${error.message}`);
      }
    }
    results.push({ target: page.request, errors });
  }

  const manifestRes = await fetcher(`${root}/manifest.webmanifest`);
  let manifest = null;
  try {
    manifest = JSON.parse(manifestRes.body.toString("utf8"));
  } catch {
    // reported below
  }
  const manifestErrors =
    manifestRes.status !== 200
      ? [`manifest answers ${manifestRes.status}`]
      : await checkManifest(manifest, async (src) => {
          const res = await fetcher(new URL(src, `${root}/manifest.webmanifest`).href);
          const size = res.status === 200 ? imageSize(res.body) : null;
          return { status: res.status, type: size?.type ?? null, width: size?.width, height: size?.height };
        });
  results.push({ target: "/manifest.webmanifest", errors: manifestErrors });

  const ico = await fetcher(`${root}/favicon.ico`);
  const sizes = ico.status === 200 ? icoSizes(ico.body) : null;
  const icoErrors = [];
  if (!sizes) icoErrors.push(`favicon.ico answers ${ico.status} or is not an icon`);
  else if (!sizes.includes(16) || !sizes.includes(32)) icoErrors.push(`favicon.ico frames ${sizes.join(", ")}, needs 16 and 32`);
  results.push({ target: "/favicon.ico", errors: icoErrors });

  const heist = await fetcher(`${root}/heist-game/index.html`);
  results.push({
    target: "/heist-game/index.html",
    errors: heist.status === 200 ? checkHeistBuildHtml(heist.body.toString("utf8")) : [`answers ${heist.status}`],
  });

  return { ok: results.every((r) => r.errors.length === 0), results };
}

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const base = argValue("--base", process.env.CHECK_META_BASE || "http://localhost:3001");
  const json = process.argv.includes("--json");
  const report = await runCheckMeta({ base, fetchOg: process.argv.includes("--fetch-og") });
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    for (const r of report.results) {
      if (r.errors.length) {
        console.error(`FAIL ${r.target}`);
        r.errors.forEach((e) => console.error(`  - ${e}`));
      } else {
        console.log(`ok   ${r.target}`);
      }
    }
    console.log(report.ok ? "check-meta: all pages pass" : "check-meta: failures above");
  }
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`check-meta: ${error.message}`);
    process.exit(1);
  });
}
