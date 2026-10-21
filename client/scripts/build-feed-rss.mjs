// Writes public/feed/rss.xml (the blog's RSS 2.0 feed) from client/content/feed after the web build
// (`npm run build` postbuild, next to next-sitemap). Generated, gitignored; app builds skip it.
// lib/feed/engine.ts is TypeScript that Node loads through type stripping (Node >= 22.18).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRss, loadFeed } from "../lib/feed/engine.ts";

export function writeFeedRss({ root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), origin } = {}) {
  let site = "https://tokentails.com";
  try {
    site = new URL(origin || process.env.NEXT_PUBLIC_DOMAIN || site).origin;
  } catch {}
  const { articles } = loadFeed(join(root, "content", "feed"));
  const out = join(root, "public", "feed", "rss.xml");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buildRss(articles, site));
  return { out, count: articles.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NEXT_PUBLIC_IS_APP) {
    console.log("feed rss: app build, skipped");
  } else {
    const { out, count } = writeFeedRss();
    console.log(`feed rss: ${count} article(s) -> ${out}`);
  }
}
