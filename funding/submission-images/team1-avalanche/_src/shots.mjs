import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const here = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(path.resolve(here, "../../../../client/package.json"));
const { chromium } = require("playwright");
const out = path.join(here, "screens");
const DEV = "http://localhost:3001";
const USDC_TX = "0x4170387155b296e140924ed6a9289688dc4801dbab6372d8117ee42f9c256f02";
const EURC_TX = "0xa0a985544ae6c97ec63c7581f404ff97962a3a14a1113e6de7459a80ea806efa";
const only = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const HIDE = "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}";
async function shot(name, url, vp, fn) {
  if (only && !name.includes(only)) return;
  const ctx = await browser.newContext(vp);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(7000);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await fn(page, path.join(out, name + ".png"));
  console.log(name, (fs.statSync(path.join(out, name + ".png")).size / 1024).toFixed(0), "KB");
  await ctx.close();
}
const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// Avalanche Fuji card(s) in the testnet proof grid
await shot("fuji-card", `${DEV}/shelter-payouts`, desk, async (page, f) => {
  const sec = page.locator('[data-testid="testnet-proof"]').first();
  await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500);
  const cards = sec.locator("text=/Avalanche Fuji/i");
  console.log("fuji matches", await cards.count());
  // pick the card element: nearest ancestor that looks like a card
  const handle = await sec.evaluateHandle((s) => {
    const els = [...s.querySelectorAll("*")].filter((n) => /avalanche fuji/i.test(n.textContent || "") && n.children.length < 40);
    // smallest element containing heading + amount
    const cands = els.filter((n) => /total paid/i.test(n.textContent) && !/arc testnet/i.test(n.textContent));
    cands.sort((a, b) => a.textContent.length - b.textContent.length);
    return cands[0];
  });
  const el = handle.asElement();
  if (!el) throw new Error("no fuji card");
  await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
  await el.screenshot({ path: f });
});
await shot("fuji-proof-section", `${DEV}/shelter-payouts`, desk, async (page, f) => {
  await page.addStyleTag({ content: "header,[data-testid=site-header]{visibility:hidden!important}" });
  const sec = page.locator('[data-testid="testnet-proof"]').first();
  await sec.scrollIntoViewIfNeeded();
  const top = await sec.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y - 40), top); await page.waitForTimeout(1000);
  await page.screenshot({ path: f, fullPage: false });
});
await shot("receipt-fuji-usdc-phone", `${DEV}/shelter-payouts/receipt?chain=43113&tx=${USDC_TX}`, phone, async (page, f) => page.screenshot({ path: f }));
await shot("receipt-fuji-usdc-desk", `${DEV}/shelter-payouts/receipt?chain=43113&tx=${USDC_TX}`, desk, async (page, f) => page.screenshot({ path: f }));
await shot("receipt-fuji-eurc-phone", `${DEV}/shelter-payouts/receipt?chain=43113&tx=${EURC_TX}`, phone, async (page, f) => page.screenshot({ path: f }));
await shot("receipt-1920", `${DEV}/shelter-payouts/receipt?chain=43113&tx=${USDC_TX}`, { viewport: { width: 1920, height: 1080 } }, async (page, f) => page.screenshot({ path: f }));
await browser.close();
