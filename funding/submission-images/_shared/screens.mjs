#!/usr/bin/env node
/**
 * Takes the common screenshots into ./screens at 1440x900 (desktop) and 390x844 (phone, 3x DPR
 * scaled to 2x to keep files small). Re-run any time:  node screens.mjs [name-filter]
 * Live pages come from https://tokentails.com; working-tree-only pages from the dev server on
 * http://localhost:3001 (another session's server: this script only reads it).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../client/package.json"));
const { chromium } = require("playwright");
const out = path.join(here, "screens");
fs.mkdirSync(out, { recursive: true });

const LIVE = "https://tokentails.com";
const DEV = "http://localhost:3001";
const ARC_PROOF_TX = "0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a";

// name, url, options: full (full page), wait (ms), sel (scroll element into view and shoot viewport)
const SHOTS = [
  ["live-landing", `${LIVE}/`, {}],
  ["live-heist", `${LIVE}/heist`, { wait: 6000 }],
  ["live-heist-payouts", `${LIVE}/heist?payouts`, { wait: 6000 }],
  ["live-shelter-payouts", `${LIVE}/shelter-payouts`, { full: true, wait: 4000 }],
  ["dev-shelter-payouts", `${DEV}/shelter-payouts`, { full: true, wait: 6000 }],
  ["dev-testnet-proof", `${DEV}/shelter-payouts`, { sel: '[data-testid="testnet-proof"]', wait: 6000 }],
  ["live-give", `${LIVE}/shelter-payouts/give`, { wait: 4000 }],
  ["dev-give", `${DEV}/shelter-payouts/give`, { wait: 6000 }],
  ["dev-give-full", `${DEV}/shelter-payouts/give`, { full: true, wait: 6000 }],
  ["dev-chain-picker", `${DEV}/shelter-payouts/give`, { sel: '[data-testid="wallet-network"]', wait: 6000 }],
  ["dev-receipt-arc-testnet", `${DEV}/shelter-payouts/receipt?chain=5042002&tx=${ARC_PROOF_TX}`, { wait: 9000 }],
];
const SIZES = [
  { tag: "1440", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { tag: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const filter = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
for (const [name, url, o] of SHOTS) {
  if (filter && !name.includes(filter)) continue;
  for (const s of SIZES) {
    const ctx = await browser.newContext({ ...s, tag: undefined, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    const file = path.join(out, `${name}-${s.tag}.png`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(o.wait ?? 3000);
      // hide the Next.js dev-tools badge on dev-server shots
      await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}" }).catch(() => {});
      if (o.full) {
        // walk the page so lazy sections mount, then return to the top
        const h = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < h; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(150); }
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200);
      }
      if (o.sel) {
        const el = page.locator(o.sel).first();
        if (!(await el.count())) { console.log(`SKIP ${name}-${s.tag}: ${o.sel} not found`); await ctx.close(); continue; }
        await page.addStyleTag({ content: "header,[data-testid=site-header]{visibility:hidden!important}" }).catch(() => {});
        await el.scrollIntoViewIfNeeded();
        const top = await el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
        await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 40)), top); await page.waitForTimeout(900);
      }
      await page.screenshot({ path: file, fullPage: !!o.full });
      console.log(`${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    } catch (e) { console.log(`FAIL ${name}-${s.tag}: ${e.message.split("\n")[0]}`); }
    await ctx.close();
  }
}
await browser.close();
