#!/usr/bin/env node
// Browser check of the client's /shelter-payouts page and the receipt page against the TESTNET
// deployments. It:
//   1. backs up client/public/shelter-payouts/deployments.json (to out/deployments.json.bak) and
//      writes a temporary one with the testnet entries of tracks/a-build/deployments.json;
//   2. starts `npx next dev -p 3100` in client/ with NEXT_PUBLIC_BE_URL=http://localhost:3105
//      (refuses if port 3100 is busy, unless --reuse-server);
//   3. loads /shelter-payouts with Playwright (from catnip-heist/node_modules), waits for payout rows,
//      checks the Arc testnet card lists the e2e gift (out/e2e-result.json), and loads
//      /shelter-payouts/receipt?chain=5042002&tx=<hash> for the e2e transactions;
//   4. screenshots to out/, prints a PASS/FAIL table, stops the dev server and restores the file
//      (also on Ctrl-C and on errors).
//
// Usage: node funding/e2e/payouts-check.mjs [--reuse-server] [--headed]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import {
  ARC_TESTNET, CLIENT, DEFAULT_BE_URL, OUT, REPO, assertTestnet, atomicCopy, atomicWrite, errMsg, loadTestnetDeployments, sha256,
} from './lib.mjs';

const argv = new Set(process.argv.slice(2));
const PORT = Number(process.env.E2E_CLIENT_PORT || 3100);
const ORIGIN = `http://localhost:${PORT}`;
const BE_URL = process.env.E2E_BE_URL || DEFAULT_BE_URL;
const TARGET = join(CLIENT, 'public', 'shelter-payouts', 'deployments.json');
const BACKUP = join(OUT, 'deployments.json.bak');
/** sha256 of the testnet list this run wrote to TARGET; lets a later run tell its own write from a newer edit. */
const MARK = join(OUT, 'deployments.json.written');
const ROW_TIMEOUT_MS = Number(process.env.E2E_ROW_TIMEOUT_MS || 180_000);

const { chromium } = createRequire(join(REPO, 'catnip-heist', 'package.json'))('playwright');

const results = [];
const record = (step, ok, detail) => {
  results.push({ step, result: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail });
  console.log(`[${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}] ${step}: ${detail}`);
  return ok;
};
const short = (v) => `${v.slice(0, 6)}…${v.slice(-4)}`;

let server = null;
let browser = null;
let restored = true;

const fileSha = (path) => (existsSync(path) ? sha256(readFileSync(path)) : null);
const rmQuiet = (path) => { try { rmSync(path, { force: true }); } catch { /* best effort */ } };

/**
 * Puts the original file back. Order: atomic copy BACKUP -> TARGET, then drop MARK, then BACKUP. A
 * crash at any point leaves BACKUP in place, and recoverStale() finishes the job on the next run.
 */
function restore() {
  if (restored) return;
  if (existsSync(BACKUP)) {
    atomicCopy(BACKUP, TARGET);
    rmQuiet(MARK);
    rmQuiet(BACKUP);
    console.log('restored client/public/shelter-payouts/deployments.json');
  }
  restored = true;
}

/**
 * A backup left by a crashed run. Restore it only when TARGET is still exactly what that run wrote
 * (or already the original); if someone changed TARGET since (a mainnet ingest, a manual edit),
 * stop and leave both files, instead of overwriting newer content with a stale copy.
 */
function recoverStale() {
  rmQuiet(`${TARGET}.e2e-tmp`);
  if (!existsSync(BACKUP)) { rmQuiet(MARK); return; }
  const current = fileSha(TARGET);
  const written = existsSync(MARK) ? readFileSync(MARK, 'utf8').trim() : null;
  if (current !== null && current === fileSha(BACKUP)) {
    rmQuiet(MARK); rmQuiet(BACKUP);
    return;
  }
  if (current === null || (written && current === written)) {
    restored = false;
    restore();
    return;
  }
  throw new Error(
    'client/public/shelter-payouts/deployments.json changed after a crashed run left out/deployments.json.bak; ' +
      'compare the two by hand, keep the right one, then delete out/deployments.json.bak and out/deployments.json.written'
  );
}

function stopServer() {
  if (!server?.pid) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
  server = null;
}

async function cleanup() {
  if (browser) await browser.close().catch(() => undefined);
  browser = null;
  stopServer();
  restore();
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { cleanup().catch(() => undefined).finally(() => process.exit(130)); });
}
process.on('exit', () => {
  stopServer();
  try { restore(); } catch (e) { console.error(`could not restore deployments.json (${errMsg(e)}); the original is in out/deployments.json.bak`); }
});

const portOpen = (port) => new Promise((ok) => {
  const s = createConnection({ port, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); ok(true); });
  s.once('error', () => ok(false));
});

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* not up yet */ }
    if (server && server.exitCode !== null) return false;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return false;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const be = new URL(BE_URL);
  if (!['localhost', '127.0.0.1'].includes(be.hostname)) throw new Error(`refusing NEXT_PUBLIC_BE_URL ${BE_URL}: not localhost`);

  // A backup left by a crashed run is the original file: put it back first (see recoverStale).
  recoverStale();

  const list = loadTestnetDeployments();
  list.forEach((d) => assertTestnet(d.chainId, `deployment ${d.chain}`));
  if (!list.length) throw new Error('no testnet deployments recorded; deploy, then a:ingest --network testnet');
  const publicList = list.map(({ contract, chain, network, chainId, address, tx, token, proofTxs, fromBlock }) => ({
    contract, chain, network, chainId, address,
    ...(tx ? { tx } : {}), ...(token ? { token } : {}), ...(proofTxs ? { proofTxs } : {}), ...(fromBlock != null ? { fromBlock } : {}),
  }));
  const e2e = existsSync(join(OUT, 'e2e-result.json')) ? JSON.parse(readFileSync(join(OUT, 'e2e-result.json'), 'utf8')) : {};

  // Order matters for crash safety: the backup is complete (atomic) before MARK, and MARK names the
  // new content before TARGET changes, so every crash point is recoverable by recoverStale().
  const body = JSON.stringify(publicList, null, 2) + '\n';
  atomicCopy(TARGET, BACKUP);
  restored = false;
  atomicWrite(MARK, sha256(body) + '\n');
  atomicWrite(TARGET, body);
  record('deployments.json', true, `${publicList.length} testnet entr${publicList.length === 1 ? 'y' : 'ies'} written (original backed up)`);

  if (await portOpen(PORT)) {
    if (!argv.has('--reuse-server')) throw new Error(`port ${PORT} is busy; stop that server or pass --reuse-server`);
    console.log(`reusing the server on ${ORIGIN} (its NEXT_PUBLIC_BE_URL is whatever it was started with)`);
  } else {
    const log = openSync(join(OUT, 'next-dev.log'), 'w');
    server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
      cwd: CLIENT,
      env: { ...process.env, NEXT_PUBLIC_BE_URL: BE_URL, PORT: String(PORT) },
      stdio: ['ignore', log, log],
      detached: true,
    });
    console.log(`next dev pid ${server.pid} on ${ORIGIN} (log ${join(OUT, 'next-dev.log')})`);
  }
  if (!(await waitFor(`${ORIGIN}/shelter-payouts`, 240_000))) throw new Error(`client did not come up on ${ORIGIN}; see out/next-dev.log`);

  browser = await chromium.launch({ ...({ headless: !argv.has('--headed') } || {}), ...(process.env.E2E_CHROME_CHANNEL ? { channel: process.env.E2E_CHROME_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  // Payouts page
  try {
    await page.goto(`${ORIGIN}/shelter-payouts`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForSelector('[data-testid="payouts-totals"]', { timeout: 120_000 });
    const rows = page.locator('#shelter-payouts table tbody tr');
    await rows.first().waitFor({ timeout: ROW_TIMEOUT_MS });
    // Let slower chains finish.
    await page.waitForFunction(() => !document.body.innerText.includes('Reading payouts from the chain'), null, { timeout: ROW_TIMEOUT_MS }).catch(() => undefined);
    const count = await rows.count();
    record('payout rows', count > 0, `${count} row(s) on the page`);

    const errors = await page.locator('#shelter-payouts [role="alert"]').allInnerTexts();
    record('chain reads', errors.length === 0, errors.length ? errors.map((t) => t.slice(0, 120)).join(' | ') : 'every deployment card loaded');

    const arcCard = page.locator('section', { has: page.locator('h3', { hasText: 'Arc Testnet' }) });
    if (e2e.donateTx) {
      const hit = await arcCard.locator('tbody tr', { hasText: short(e2e.donateTx) }).count();
      record('e2e gift row', hit > 0, hit ? `Arc testnet card lists ${short(e2e.donateTx)}` : `no row for ${short(e2e.donateTx)} on the Arc testnet card`);
    } else {
      record('e2e gift row', null, 'no donateTx in out/e2e-result.json (run e2e.mjs first)');
    }
    await page.screenshot({ path: join(OUT, 'payouts.png'), fullPage: true });
    console.log(`screenshot ${join(OUT, 'payouts.png')}`);
  } catch (e) {
    await page.screenshot({ path: join(OUT, 'payouts-failed.png'), fullPage: true }).catch(() => undefined);
    record('payout rows', false, errMsg(e));
  }

  // Receipt pages
  const receipts = [['donate', e2e.donateTx], ['x402', e2e.x402Tx]].filter(([, tx]) => tx);
  if (!receipts.length) record('receipt', null, 'no tx hashes in out/e2e-result.json');
  for (const [label, tx] of receipts) {
    try {
      assertTestnet(ARC_TESTNET);
      await page.goto(`${ORIGIN}/shelter-payouts/receipt?chain=${ARC_TESTNET}&tx=${tx}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.getByText(/Confirmed|Failed/).first().waitFor({ timeout: 120_000 });
      const box = page.locator('#shelter-receipt');
      const confirmed = await box.getByText('Confirmed').count();
      const payouts = await box.locator('ul li').count();
      const unlisted = await box.getByText('did not come from a listed ShelterSplit contract').count();
      await page.screenshot({ path: join(OUT, `receipt-${label}.png`), fullPage: true });
      record(`receipt ${label}`, confirmed > 0 && payouts > 0 && unlisted === 0,
        `${confirmed ? 'confirmed' : 'not confirmed'}, ${payouts} payout(s), ${unlisted} unlisted; screenshot out/receipt-${label}.png`);
    } catch (e) {
      await page.screenshot({ path: join(OUT, `receipt-${label}-failed.png`), fullPage: true }).catch(() => undefined);
      record(`receipt ${label}`, false, errMsg(e));
    }
  }
  if (consoleErrors.length) console.log(`browser console errors (${consoleErrors.length}): ${consoleErrors.slice(0, 5).join(' | ')}`);
}

main()
  .catch((e) => record('harness', false, errMsg(e)))
  .finally(async () => {
    await cleanup();
    const w = Math.max(4, ...results.map((r) => r.step.length));
    console.log('\n' + 'STEP'.padEnd(w) + '  RESULT  DETAIL');
    for (const r of results) console.log(`${r.step.padEnd(w)}  ${r.result.padEnd(6)}  ${r.detail}`);
    const failed = results.filter((r) => r.result === 'FAIL').length;
    console.log(`\n${failed ? `FAIL: ${failed} step(s) failed` : 'PASS: every step passed'}`);
    process.exit(failed ? 1 : 0);
  });
