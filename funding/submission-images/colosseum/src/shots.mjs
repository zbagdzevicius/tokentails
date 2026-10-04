import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire("/Users/zygimantasbagdzevicius/me/tokentails-app/client/package.json");
const { chromium } = require("playwright");
const DEV = "http://localhost:3001";
const out = path.resolve("screens");
const R = (c, t) => `${DEV}/shelter-payouts/receipt?chain=${c}&tx=${t}`;
const SHOTS = [
  ["receipt-tempo-1440", R(42431, "0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d"), {}],
  ["receipt-tempo-390", R(42431, "0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d"), { m: 1 }],
  ["receipt-arb-390", R(421614, "0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d"), { m: 1 }],
  ["receipt-rh-390", R(46630, "0x276c904ce4b5862e8cd72b3e561ea9ea2bfc26428844c5035817726c5a84aa23"), { m: 1 }],
  ["receipt-base-390", R(84532, "0x26a7b0135627bd743046a56fdd69a93b1a830472702f241d48bd7790efacc5fb"), { m: 1 }],
  ["proof-section", `${DEV}/shelter-payouts`, { el: '[data-testid="testnet-proof"]' }],
];
const b = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
for (const [n, url, o] of SHOTS) {
  const ctx = await b.newContext(o.m ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: o.el ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(9000);
  await p.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}" });
  if (o.el) { const e = p.locator(o.el).first(); await e.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500); await e.screenshot({ path: `${out}/${n}.png` }); }
  else await p.screenshot({ path: `${out}/${n}.png` });
  console.log(n);
  await ctx.close();
}
await b.close();
