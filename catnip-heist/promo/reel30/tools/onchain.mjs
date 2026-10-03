// On-chain surfaces: the Heist's "Sent to shelters" modal and win screen, and the client's
// /shelter-payouts and /shelter-payouts/give pages. Every token ticker and wallet address is
// blurred in place (REDACT below); chain names never render here (no deployments yet), but are
// blurred too if they ever appear. Usage: node onchain.mjs [heist] [web] [stills]
import { launch, boot } from './common.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const CLIPS = path.join(ROOT, 'assets/clips');
const ST = path.join(CLIPS, 'stills');
fs.mkdirSync(ST, { recursive: true });
const WEB = process.env.CLIENT_URL || 'http://localhost:3001';
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

// Wraps every ticker / address / chain-name match in a blurred span (text only, layout kept).
const REDACT = () => {
  const re = /\b(USDC|EURC|pathUSD|ETH|AVAX|MON|Arc(?: Testnet)?|Tempo(?: Testnet)?|Arbitrum(?: One| Sepolia)?|Avalanche(?: C-Chain| Fuji)?|Base|Monad|Stellar|XLM|Soroban|Bybit)\b|0x[0-9a-fA-F]{3,}[…\.]*[0-9a-fA-F]*/g;
  if (!document.getElementById('rd-css')) { const s = document.createElement('style'); s.id = 'rd-css'; s.textContent = '.rd-blur{filter:blur(9px)!important;-webkit-filter:blur(9px)!important;display:inline-block}nextjs-portal{display:none!important}'; document.head.appendChild(s); }
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = []; let n;
  while ((n = walk.nextNode())) { if (n.parentElement?.closest('.rd-blur,script,style')) continue; re.lastIndex = 0; if (re.test(n.nodeValue)) hits.push(n); }
  for (const t of hits) {
    const frag = document.createDocumentFragment(); let last = 0; re.lastIndex = 0; let m; const v = t.nodeValue;
    while ((m = re.exec(v))) { frag.append(v.slice(last, m.index)); const sp = document.createElement('span'); sp.className = 'rd-blur'; sp.textContent = m[0]; frag.append(sp); last = m.index + m[0].length; }
    frag.append(v.slice(last)); t.replaceWith(frag);
  }
  return hits.length;
};
const seq = async (page, name, frames, each) => {
  const dir = path.join(CLIPS, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (let f = 1; f <= frames; f++) { if (each) await each(f); await page.evaluate(REDACT); await page.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 }); }
};
const texts = {};

if (want('heist')) {
  // 1. Modal opening over the title screen (deterministic: fake clock, 30 fps).
  let { browser, page } = await launch();
  await boot(page);
  await page.clock.install({ time: 3_000_000 });
  await page.clock.runFor(3000);
  await page.evaluate(REDACT);
  await page.screenshot({ path: path.join(ST, 'title.jpg'), type: 'jpeg', quality: 92 });
  texts.title = await page.evaluate(() => document.querySelector('.ch-ui')?.innerText);
  await page.evaluate(() => window.__heist.app.ui.showPayouts());
  await page.clock.runFor(1);
  await seq(page, 'oc-payouts-open', 60, async () => { await page.clock.runFor(1000 / 30); });
  await page.clock.runFor(4000);
  await page.evaluate(REDACT);
  await page.screenshot({ path: path.join(ST, 'oc-payouts-modal.jpg'), type: 'jpeg', quality: 92 });
  texts.payoutsModal = await page.evaluate(() => document.querySelector('.ch-pay')?.innerText);
  await browser.close();

  // 2. Win screen of a live (not replay) heist-05 run: "You rescued Juniper!" + rail line + stars.
  ({ browser, page } = await launch());
  await boot(page);
  await page.evaluate(() => { try { window.__heist.resetProgress(); } catch {} });
  await page.evaluate(async () => {
    const j = await (await fetch('/src/levels/heist-05.solution.json')).json();
    window.__heist.freeze(true);
    await window.__heist.start(j.catIds, 'heist-05');
    window.__heist.freeze(true);
    try { if (window.__heist.briefOpen()) window.__heist.closeBrief(); } catch {}
    window.__runs = j.runs;
  });
  await page.clock.install({ time: 4_000_000 });
  await page.clock.runFor(500);
  await page.evaluate(() => window.__heist.feed(window.__runs));
  await page.evaluate(() => window.__heist.freeze(false));
  // Let the win celebration play to the results screen, then film the screen arriving.
  let k = 0; while ((await page.evaluate(() => window.__heist.screen())) !== 'results' && k++ < 300) await page.clock.runFor(1000 / 30);
  console.log('results after', k, 'frames');
  await seq(page, 'oc-results-rescue', 90, async () => { await page.clock.runFor(1000 / 30); });
  await page.clock.runFor(3000);
  await page.evaluate(REDACT);
  await page.screenshot({ path: path.join(ST, 'oc-results.jpg'), type: 'jpeg', quality: 92 });
  texts.results = await page.evaluate(() => document.querySelector('.ch-ui')?.innerText);
  await browser.close();
}

if (want('web')) {
  const { browser, page } = await launch();
  for (const [name, url, scrollTo] of [['oc-web-payouts', '/shelter-payouts', '.'], ['oc-web-give', '/shelter-payouts/give?from=heist&cat=Juniper', null]]) {
    await page.goto(WEB + url, { timeout: 120000 });
    await page.waitForTimeout(7000);
    texts[name] = await page.evaluate(() => document.body.innerText);
    await page.evaluate(REDACT);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ST, name + '-top.jpg'), type: 'jpeg', quality: 92 });
    await page.screenshot({ path: path.join(ST, name + '-full.jpg'), type: 'jpeg', quality: 90, fullPage: true });
    const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    // Slow eased scroll from the top to ~ the showcase card (real-time page animations keep running).
    const target = Math.min(H, name === 'oc-web-payouts' ? 780 : Math.max(0, H));
    await seq(page, name, 90, async (f) => { const e = 0.5 - 0.5 * Math.cos(Math.PI * (f - 1) / 89); await page.evaluate((y) => scrollTo(0, y), Math.round(target * e)); await page.waitForTimeout(25); });
    await page.evaluate((y) => scrollTo(0, y), target);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ST, name + '-mid.jpg'), type: 'jpeg', quality: 92 });
  }
  await browser.close();
}
fs.writeFileSync(path.join(import.meta.dirname, 'onchain-text.json'), JSON.stringify(texts, null, 1));
console.log(JSON.stringify(texts, null, 1));
