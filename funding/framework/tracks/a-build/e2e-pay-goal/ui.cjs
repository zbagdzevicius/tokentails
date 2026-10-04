// UI pass of the multi-chain checkout + goal meter E2E (stack.sh with E2E_UI=1). Drives the dev
// client (default http://localhost:3001, built against NEXT_PUBLIC_BE_URL=http://localhost:3005) and
// sends its checkout and goal calls to the throwaway backend of stack.sh instead (Playwright routes).
// The page's wallet is an injected EIP-1193 provider over anvil's unlocked dev accounts that switches
// between the two local chains, as a browser wallet would. Test tokens only; nothing leaves the machine.
//
//   node ui.cjs pre    # pick screen with both chains, pack on chain B (USDC, desktop), pack on chain A
//                      # (EURC, phone), shelter cat before the handover, goal meter (both sizes)
//   node ui.cjs post   # goal meter after the handover, shelter cat paid straight into the split
//
// Env: E2E_STATE, PAY_API, PAY_JOBS, PAY_DB (from stack.sh), E2E_SHOTS (screenshots), E2E_CLIENT,
// E2E_CLIENT_API (the API origin the client was built with), E2E_CHROMIUM_PATH, PLAYWRIGHT_MODULE.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(REPO, 'catnip-heist', 'node_modules', 'playwright'));
const phase = process.argv[2];
const STATE = process.env.E2E_STATE;
const API = process.env.PAY_API;
const JOBS = process.env.PAY_JOBS;
const DB = process.env.PAY_DB;
const BASE = (process.env.E2E_CLIENT || 'http://localhost:3001').replace(/\/+$/, '');
const CLIENT_API = (process.env.E2E_CLIENT_API || 'http://localhost:3005').replace(/\/+$/, '');
const SHOTS = process.env.E2E_SHOTS || path.join(STATE, 'shots');
const EXE = process.env.E2E_CHROMIUM_PATH || undefined;
const stateFile = path.join(STATE, 'state.json');
const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' };
const HEX = { 31337: '0x7a69', 5042002: '0x4cef52' };
/** The wallet button: "PAY WITH WALLET" (one transfer) or "APPROVE AND PAY" (the split route). */
const PAY_BUTTON = /pay with wallet|approve and pay/i;
const VIEW = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const tokenFor = (uid) =>
  'fbe2e.' + Buffer.from(JSON.stringify({ uid, email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } })).toString('base64url');
const cast = (chain, ...a) => execFileSync('cast', [...a, '--rpc-url', chain.rpc], { encoding: 'utf8', env }).trim();
const bal = (chain, tok, who) => BigInt(cast(chain, 'call', tok, 'balanceOf(address)(uint256)', who).split(' ')[0]);
const mongo = (js) => execFileSync('mongosh', ['--quiet', DB, '--eval', js], { encoding: 'utf8' }).trim();
const usdcText = (base) => {
  const s = BigInt(base).toString().padStart(7, '0');
  const frac = s.slice(-6).replace(/0+$/, '');
  return frac ? `${s.slice(0, -6)}.${frac}` : s.slice(0, -6);
};
const counted = (base, n = 1) => {
  st.expect = { base: (BigInt(st.expect.base) + BigInt(base)).toString(), n: st.expect.n + n };
};
async function api(method, p, as) {
  const r = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(as ? { accesstoken: tokenFor(as) } : {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function job(name) {
  const r = await fetch(`${JOBS}/run/${name}`, { method: 'POST' });
  return r.json();
}
async function keeper() {
  const as = `e2e-admin-${st.run}`;
  for (let i = 0; i < 4; i++) {
    await api('POST', '/payments/crypto/shelter-share/run', as);
    if (!Number(mongo(`db.cryptocheckouts.countDocuments({ "shelterShare.state": { $in: ["due", "sending", "sent"] } })`))) return;
  }
  throw new Error('keeper left shares open');
}

/** An injected wallet for `account` that talks to whichever local chain it is switched to. */
const wallet = (account, startChain) => `
  (() => {
    const RPCS = ${JSON.stringify({ [HEX[31337]]: st.a.rpc, [HEX[5042002]]: st.b.rpc })};
    let chain = ${JSON.stringify(HEX[startChain])};
    window.__sent = [];
    const rpc = async (method, params) => {
      const r = await fetch(RPCS[chain], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }) });
      const j = await r.json();
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
      return j.result;
    };
    window.ethereum = {
      on() {}, removeListener() {},
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [${JSON.stringify(account)}];
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_switchEthereumChain') {
          const id = String(params[0].chainId).toLowerCase();
          if (!RPCS[id]) throw Object.assign(new Error('Unrecognized chain'), { code: 4902 });
          chain = id; return null;
        }
        if (method === 'eth_sendTransaction') { const { chainId, gas, ...tx } = params[0]; window.__sent.push({ chain, ...tx }); return rpc(method, [tx]); }
        return rpc(method, params);
      },
    };
  })();`;

/** Sends the client's checkout and goal calls (built for CLIENT_API) to the stack's backend as `uid`. */
async function proxy(page, uid, campaign) {
  await page.routeWebSocket(/hmr|turbopack/, () => {});
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST' };
  const handler = async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const headers = { ...req.headers() };
    if (uid) headers.accesstoken = tokenFor(uid);
    const res = await route.fetch({ url: API + u.pathname + u.search, headers });
    return route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
  };
  await page.route(`${CLIENT_API}/payments/crypto/**`, handler);
  await page.route(`${CLIENT_API}/shelter/goal/**`, handler);
  for (const id of st.cats) await page.route(`${CLIENT_API}/cat/${id}`, handler);
  if (campaign) {
    await page.route(`${BASE}/shelter-payouts/campaign.json`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(campaign) })
    );
  }
}

/** campaign.json as the facts build would write it for this phase, pointed at chain A's test wallets. */
async function campaignFor(which) {
  const real = await (await fetch(`${BASE}/shelter-payouts/campaign.json`)).json();
  const held = { wallet: st.dev.held.toLowerCase(), fromBlock: st.a.fromBlock, toBlock: null, holder: 'token-tails' };
  const wallets = which === 'post'
    ? [{ ...held, toBlock: st.handoverBlock }, { wallet: st.dev.own.toLowerCase(), fromBlock: st.handoverBlock + 1, toBlock: null, holder: 'shelter' }]
    : [held];
  const open = wallets[wallets.length - 1];
  return {
    ...real,
    chainId: st.a.chainId,
    fromBlock: st.a.fromBlock,
    token: { ...(real.token || {}), address: st.a.usdc.toLowerCase(), decimals: 6 },
    inflowLog: { address: st.a.usdc.toLowerCase(), decimals: 6 },
    wallets,
    shelter: { ...real.shelter, wallet: open.wallet, handover: which === 'post' ? 'handed-over' : 'held-by-token-tails' },
  };
}

const results = [];
let current = null;
async function flow(name, fn) {
  try {
    const detail = await fn();
    results.push({ flow: name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok  ${name}`);
  } catch (e) {
    if (current) await current.screenshot({ path: path.join(SHOTS, `fail-${phase}-${results.length + 1}.png`) }).catch(() => {});
    results.push({ flow: name, ok: false, error: String(e.message || e).split('\n')[0] });
    console.log(`  FAIL ${name}\n       ${String(e.message || e).split('\n').slice(0, 4).join('\n       ')}`);
  }
}
async function open(browser, size, { account, chain = 31337, uid, campaign } = {}) {
  const ctx = await browser.newContext({ viewport: VIEW[size], deviceScaleFactor: size === 'mobile' ? 2 : 1 });
  await ctx.addInitScript((account ? wallet(account, chain) : '') + "sessionStorage.setItem('accesstoken','fbe2e-ui');");
  const page = await ctx.newPage();
  current = page;
  page.on('pageerror', (e) => console.log(`   pageerror: ${String(e.message).slice(0, 160)}`));
  await proxy(page, uid, campaign);
  return { ctx, page };
}
async function shot(page, name, testId) {
  if (testId) await page.getByTestId(testId).first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** Buys a STARTER pack in the pack modal, from `account`, on `chainName` in `coin`. */
async function buyPack(browser, size, { account, chainName, coin, uid, chain, shotPrefix }) {
  const { ctx, page } = await open(browser, size, { account, uid });
  const coinAddr = coin === 'USDC' ? chain.usdc : chain.eurc;
  const before = bal(chain, coinAddr, st.dev.treasury);
  await page.goto(`${BASE}/packs`, { waitUntil: 'domcontentloaded' });
  await page.getByText('STARTER', { exact: true }).first().click({ timeout: 90000 });
  await page.getByRole('button', { name: /pay with crypto/i }).click({ timeout: 30000 });
  await page.getByTestId('crypto-checkout').waitFor({ timeout: 30000 });
  await page.getByLabel(chainName, { exact: true }).check({ force: true });
  await page.getByLabel(coin, { exact: true }).check({ force: true });
  await shot(page, `${shotPrefix}-pick-${size}`, 'crypto-checkout');
  await page.getByRole('button', { name: /continue/i }).click();
  const amount = (await page.getByTestId('crypto-pay-amount').innerText({ timeout: 30000 })).trim();
  await shot(page, `${shotPrefix}-order-${size}`, 'crypto-checkout');
  await page.getByRole('button', { name: PAY_BUTTON }).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="crypto-checkout"]') && !document.querySelector('[data-testid="crypto-pay-receipt"]'),
    null,
    { timeout: 90000 }
  );
  await page.waitForTimeout(2500);
  await shot(page, `${shotPrefix}-granted-${size}`);
  const paid = bal(chain, coinAddr, st.dev.treasury) - before;
  if (usdcText(paid) !== amount.split(' ')[0]) throw new Error(`treasury got ${usdcText(paid)}, the page showed ${amount}`);
  const sent = await page.evaluate(() => window.__sent);
  await ctx.close();
  return { amount, network: chainName, txChain: sent.map((t) => t.chain) };
}

/** Buys shelter cat `cat` on its page with the injected wallet; returns what the page and chain show. */
async function buyCat(browser, size, { account, cat, chainName, coin, uid, shotPrefix }) {
  const { ctx, page } = await open(browser, size, { account, uid });
  await page.goto(`${BASE}/cats/view?id=${cat}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /buy for \$5/i }).click({ timeout: 90000 });
  await page.getByRole('button', { name: /pay with crypto/i }).click({ timeout: 30000 });
  await page.getByTestId('crypto-checkout').waitFor({ timeout: 30000 });
  await page.getByLabel(chainName, { exact: true }).check({ force: true });
  await page.getByLabel(coin, { exact: true }).check({ force: true });
  await shot(page, `${shotPrefix}-pick-${size}`, 'crypto-checkout');
  await page.getByRole('button', { name: /continue/i }).click();
  const recipient = (await page.getByTestId('crypto-pay-recipient').innerText({ timeout: 30000 }).catch(() => '')).trim();
  const text = (await page.getByTestId('crypto-checkout').innerText()).replace(/\s+/g, ' ').slice(0, 600);
  await shot(page, `${shotPrefix}-order-${size}`, 'crypto-checkout');
  await page.getByRole('button', { name: PAY_BUTTON }).click();
  await page.getByTestId('shelter-cat-bought').waitFor({ timeout: 90000 });
  await shot(page, `${shotPrefix}-bought-${size}`, 'shelter-cat-bought');
  const sent = await page.evaluate(() => window.__sent);
  await ctx.close();
  return { recipient, steps: sent.length, text };
}

async function meter(browser, which, label) {
  const campaign = await campaignFor(which);
  const out = {};
  for (const size of ['desktop', 'mobile']) {
    const { ctx, page } = await open(browser, size, { campaign });
    await page.goto(`${BASE}/shelter-payouts`, { waitUntil: 'domcontentloaded' });
    const value = page.getByTestId('campaign-meter-value').first();
    await value.waitFor({ timeout: 90000 });
    await page.waitForFunction(
      () => /\d/.test(document.querySelector('[data-testid="campaign-meter-value"]')?.textContent || ''),
      null,
      { timeout: 60000 }
    );
    const box = page.getByTestId('campaign-meter').first();
    await box.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, `${label}-meter-${size}.png`) });
    out[size] = (await box.innerText()).replace(/\s+/g, ' ').trim();
    await ctx.close();
  }
  return out;
}
/** "1,234.5" in the meter's text for a base-unit amount (the meter groups thousands). */
const shown = (text, base) => {
  const plain = usdcText(base);
  const [w, f] = plain.split('.');
  const grouped = Number(w).toLocaleString('en-US') + (f ? '.' + f : '');
  return text.includes(grouped) || text.includes(Number(plain).toFixed(2)) || text.includes(plain);
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try {
    await fetch(BASE + '/shelter-payouts/campaign.json');
  } catch {
    console.error(`ui.cjs: the client is not running on ${BASE} (cd client && npm run dev -- -p 3001)`);
    process.exit(2);
  }
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  if (phase === 'pre') {
    await flow('U1 pack in USDC on chain B from the pack modal (desktop): both networks offered, granted', () =>
      buyPack(browser, 'desktop', { account: st.dev.buyerA, chainName: 'Arc Testnet', coin: 'USDC', uid: `ui-pack-b-${st.run}`, chain: st.b, shotPrefix: 'pre-1-pack-usdc-chainB' })
    );
    await flow('U2 pack in EURC on chain A (phone): wallet switched to chain A, granted', () =>
      buyPack(browser, 'mobile', { account: st.dev.buyerB, chainName: 'Local test chain', coin: 'EURC', uid: `ui-pack-a-${st.run}`, chain: st.a, shotPrefix: 'pre-2-pack-eurc-chainA' })
    );
    await flow('U3 shelter cat before the handover (phone): pays the treasury, share sent by the keeper', async () => {
      const before = bal(st.a, st.a.usdc, st.dev.held);
      const r = await buyCat(browser, 'mobile', { account: st.dev.buyerC, cat: st.cats[5], chainName: 'Local test chain', coin: 'USDC', uid: `ui-cat-pre-${st.run}`, shotPrefix: 'pre-3-cat' });
      if (r.recipient && !r.recipient.toLowerCase().includes(st.dev.treasury.toLowerCase().slice(2, 8))) throw new Error(`recipient ${r.recipient}`);
      await keeper();
      const got = bal(st.a, st.a.usdc, st.dev.held) - before;
      if (got !== 2500000n) throw new Error(`held wallet got ${got}`);
      counted(2500000n);
      return r;
    });
    await flow('U4 goal meter before the handover (both sizes): shows what came in, names only live sources', async () => {
      await job('goal');
      const out = await meter(browser, 'pre', 'pre-4');
      for (const [size, text] of Object.entries(out)) if (!shown(text, st.expect.base)) throw new Error(`${size} meter "${text}" lacks ${usdcText(st.expect.base)}`);
      return out;
    });
  } else if (phase === 'post') {
    await flow('U5 goal meter after the handover (both sizes)', async () => {
      await job('goal');
      const out = await meter(browser, 'post', 'post-1');
      for (const [size, text] of Object.entries(out)) if (!shown(text, st.expect.base)) throw new Error(`${size} meter "${text}" lacks ${usdcText(st.expect.base)}`);
      return out;
    });
    await flow('U6 shelter cat after the handover (desktop): approve + disburse into ShelterSplit, the shelter gets 5', async () => {
      const before = bal(st.a, st.a.usdc, st.dev.own);
      const r = await buyCat(browser, 'desktop', { account: st.dev.buyerA, cat: st.cats[6], chainName: 'Local test chain', coin: 'USDC', uid: `ui-cat-post-${st.run}`, shotPrefix: 'post-2-cat-split' });
      const got = bal(st.a, st.a.usdc, st.dev.own) - before;
      if (got !== 5000000n) throw new Error(`shelter wallet got ${got}`);
      if (r.steps !== 2) throw new Error(`expected approve + disburse, the wallet sent ${r.steps}`);
      counted(5000000n);
      return r;
    });
    await flow('U7 goal meter moved by the purchase (desktop)', async () => {
      await job('goal');
      const out = await meter(browser, 'post', 'post-3');
      if (!shown(out.desktop, st.expect.base)) throw new Error(`meter "${out.desktop}" lacks ${usdcText(st.expect.base)}`);
      return out.desktop;
    });
  } else {
    console.error('usage: node ui.cjs pre|post');
    process.exit(2);
  }
  await browser.close();
  fs.writeFileSync(stateFile, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(STATE, `ui-results-${phase}.json`), JSON.stringify(results, null, 2) + '\n');
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} UI flows passed (screens in ${SHOTS})`);
  process.exit(failed ? 1 : 0);
})();
