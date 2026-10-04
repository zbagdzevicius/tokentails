import { createRequire } from "node:module";
import path from "node:path"; import fs from "node:fs";
const here = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(path.resolve(here, "../../../../client/package.json"));
const { chromium } = require("playwright");
const DEV = "http://localhost:3001";
const TX = "0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d";
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const hide = "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}";
async function ctxPage() { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); return [c, await c.newPage()]; }
// 1. Arbitrum Sepolia receipt
{ const [c, p] = await ctxPage();
  await p.goto(`${DEV}/shelter-payouts/receipt?chain=421614&tx=${TX}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(9000);
  await p.addStyleTag({ content: hide });
  await p.screenshot({ path: "shots/receipt-arb.png" });
  console.log(await p.evaluate(() => document.body.innerText.slice(0, 900)));
  await c.close(); }
// 2. testnet proof: find the Arbitrum card
{ const [c, p] = await ctxPage();
  await p.goto(`${DEV}/shelter-payouts`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(6000);
  await p.addStyleTag({ content: hide + " header,[data-testid=site-header]{visibility:hidden!important}" });
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(120); }
  const sec = p.locator('[data-testid="testnet-proof"]').first();
  await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(2000);
  await sec.screenshot({ path: "shots/testnet-proof-section.png" });
  const card = p.locator('[data-testid="testnet-proof"] h3, [data-testid="testnet-proof"] h4').filter({ hasText: /Arbitrum Sepolia/i });
  console.log("arb headings", await card.count());
  await p.screenshot({ path: "shots/payouts-top.png", fullPage: false, clip: undefined });
  await c.close(); }
// 3. payouts page top (live)
{ const [c, p] = await ctxPage();
  await p.goto(`${DEV}/shelter-payouts`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(6000);
  await p.addStyleTag({ content: hide }); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
  await p.screenshot({ path: "shots/payouts-top.png" });
  await c.close(); }
await browser.close();
