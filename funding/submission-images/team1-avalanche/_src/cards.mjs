import { createRequire } from "node:module";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(path.resolve(here, "../../../../client/package.json"));
const { chromium } = require("playwright");
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("http://localhost:3001/shelter-payouts", { waitUntil: "domcontentloaded" });
await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(7000);
await p.addStyleTag({ content: "nextjs-portal,[data-next-badge-root]{display:none!important}" });
const sec = p.locator('[data-testid="testnet-proof"]').first();
await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
const n = await sec.evaluate((s) => {
  const ok = (e) => /^avalanche fuji testnet/i.test(e.textContent.trim()) && /total paid/i.test(e.textContent);
  const all = [...s.querySelectorAll("*")].filter(ok);
  const min = all.filter((e) => ![...e.querySelectorAll("*")].some(ok));
  min.forEach((e, i) => e.setAttribute("data-fuji", i));
  return min.length;
});
console.log("cards", n);
for (let i = 0; i < n; i++) { const el = p.locator(`[data-fuji="${i}"]`); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await el.screenshot({ path: `screens/fuji-card-${i}.png` }); }
await b.close();
