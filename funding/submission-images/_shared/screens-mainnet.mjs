#!/usr/bin/env node
/**
 * Retakes the post-mainnet screenshots of the LIVE site into ./screens/mainnet (gitignored), at 2x.
 *   node screens-mainnet.mjs
 * Read-only: it only opens public pages. Arc's public RPC is sometimes busy, so the payouts page is
 * retried until the hero reads "9 PAYOUTS ON 7 CHAINS"; update EXPECT when the count grows.
 * Files: payouts-top, perchain, feed, fund, give-top, give-tall, heist-payouts-{1440,390},
 * card-<chain>-mainnet (one per-chain card), rcard-<key> (receipt card), receipt-<key>-390 (phone),
 * receipt-arc-1440.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../client/package.json"));
const { chromium } = require("playwright");
const D = path.join(here, "screens/mainnet");
fs.mkdirSync(D, { recursive: true });
const L = "https://tokentails.com";
const EXPECT = /9 PAYOUTS ON 7 CHAINS/i;
// proof payouts from client/public/shelter-payouts/deployments.json (+ the Tempo campaign-memo payout)
const R = {
  arc: [5042, "0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d"],
  "arc-eurc": [5042, "0x56d7f37ba0608f7c610d45e4c1bca9d961218aa49f99fbcd095f635b9c62481f"],
  tempo: [4217, "0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5"],
  arb: [42161, "0x74f1eaf7fe3494608f1e80d92afc27c1035b8eaf34e3bd190695f1da46929216"],
  base: [8453, "0x130fdcc6987ddefb95d787c1bd2da3d210ee844cdbc339c7b59e0949a401da3d"],
  rh: [4663, "0x4902093822e89d56b49b1168f7c0bf702f0a2cf9b578fe54eb8efdb3a49ad377"],
  avax: [43114, "0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7"],
  monad: [143, "0xd5502f608d776bd2286da096d666f4073d2b5872dcffc575bde95e3b537999f5"],
};
const receipt = (c, t) => `${L}/shelter-payouts/receipt?chain=${c}&tx=${t}`;
const go = (p, u) => p.goto(u, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
const walk = async (p) => { const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 700) { await p.evaluate((v) => scrollTo(0, v), y); await p.waitForTimeout(150); } };

const b = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const desk = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await desk.newPage();

let ok = false;
for (let i = 0; i < 5 && !ok; i++) {
  await go(p, `${L}/shelter-payouts`);
  ok = await p.waitForFunction((re) => new RegExp(re, "i").test(document.body.innerText), EXPECT.source, { timeout: 40000 }).then(() => true, () => false);
}
if (!ok) console.warn("WARN: payouts page never showed", EXPECT, "- totals may be partial");
await walk(p); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2500);
await p.screenshot({ path: `${D}/payouts-top.png` });
for (const [name, re] of [["perchain", /One contract, every chain/i], ["feed", /Every treat, on the record/i], ["fund", /Pink Paw rescue fund/i]]) {
  const s = p.getByText(re).first().locator("xpath=ancestor::section[1]");
  await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await s.screenshot({ path: `${D}/${name}.png` });
}
const sec = await p.getByText(/One contract, every chain/i).first().locator("xpath=ancestor::section[1]").elementHandle();
for (const n of ["Arc mainnet", "Base mainnet", "Arbitrum One mainnet", "Robinhood Chain mainnet", "Avalanche C-Chain mainnet", "Monad mainnet", "Arc mainnet EURC", "Tempo mainnet"]) {
  const box = await p.evaluate(([s, n]) => {
    const e0 = [...s.querySelectorAll("*")].find((e) => !e.children.length && e.textContent.trim().toLowerCase() === n.toLowerCase());
    let e = e0; while (e && e.getBoundingClientRect().height < 250) e = e.parentElement;
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  }, [sec, n]);
  if (box) await p.screenshot({ path: `${D}/card-${n.toLowerCase().replace(/ /g, "-")}.png`, clip: box, fullPage: true });
}

await go(p, `${L}/shelter-payouts/give`); await p.waitForTimeout(8000);
await p.screenshot({ path: `${D}/give-top.png` });
await p.screenshot({ path: `${D}/give-tall.png`, clip: { x: 0, y: 0, width: 1440, height: 1500 }, fullPage: true });
await go(p, `${L}/heist?payouts`); await p.waitForTimeout(9000);
await p.screenshot({ path: `${D}/heist-payouts-1440.png` });

const m = await phone.newPage();
await go(m, `${L}/heist?payouts`); await m.waitForTimeout(9000);
await m.screenshot({ path: `${D}/heist-payouts-390.png` });
for (const [k, [c, t]] of Object.entries(R)) {
  for (let i = 0; i < 3; i++) {
    await go(p, receipt(c, t)); await p.waitForTimeout(5000);
    const card = p.locator("[data-testid=receipt-card]").first();
    if ((await card.count()) && /CONFIRMED/i.test(await card.innerText())) {
      await card.screenshot({ path: `${D}/rcard-${k}.png` });
      if (k === "arc") await p.screenshot({ path: `${D}/receipt-arc-1440.png` });
      break;
    }
  }
  await go(m, receipt(c, t)); await m.waitForTimeout(7000);
  await m.screenshot({ path: `${D}/receipt-${k}-390.png` });
  console.log("receipt", k);
}
await b.close();
console.log("done ->", D);
