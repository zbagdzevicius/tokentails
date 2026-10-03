#!/usr/bin/env node
// End-to-end check of the shelter gift and x402 flows against the LOCAL backend (start-local.sh)
// and Arc TESTNET (5042002). Refuses any non-testnet chain ID and any non-localhost database.
//
// Steps:
//   a  read the testnet deployments (tracks/a-build/deployments.json, network testnet), check the
//      RPC chain ID, the contract code and Pink Paw's registration on the Arc ShelterSplit
//   b  GET  /shelter/donate/status            -> enabled, Arc testnet, same split address
//   c  Firebase custom token for uid e2e-tester -> ID token (Identity Toolkit signInWithCustomToken)
//      POST /shelter/donate (accesstoken: fb<idToken>) -> 200 + txHash; the receipt on Arc testnet
//      has a NativeDisbursed log to the Pink Paw wallet
//   d  a second POST the same UTC day          -> 429
//   e  GET  /shelter/agent/cat-card            -> 402 + accepts[0]; the agent wallet pays
//      donate('x402:<nonce>'); the retry with X-PAYMENT -> 200 + card + X-PAYMENT-RESPONSE;
//      replaying the same X-PAYMENT            -> not 200
//   f  PASS/FAIL table; public results (tx hashes only) to out/e2e-result.json
//
// Secrets: FB_PRIVATE_KEY is parsed from backend/.env inside this process (dotenv.parse, so nothing
// else from that file enters process.env); the agent key comes from `cast wallet private-key`.
// Neither, nor any Firebase token, is ever printed (lib.mjs scrub()).
//
// Flags:
//   --keep-donations       do not clear the e2e user's earlier gift rows in the local DB first
//   --delete-firebase-user delete the e2e-tester Firebase Auth user at the end
//   --delete-firebase-user-only  only delete that user; run nothing else
//   --skip-x402            run a-d only
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARC_TESTNET, BACKEND, CLIENT, DEFAULT_BE_URL, DEFAULT_MONGO_URI, E2E_EMAIL, E2E_UID, OUT, WALLETS,
  arcTestnetSplit, assertLocalMongoUri, assertTestnet, ensureE2eUser, errMsg, keystoreKey,
  loadTestnetDeployments, registerSecret, requireBackend, scrub, withLocalDb,
} from './lib.mjs';

const { Contract, Interface, JsonRpcProvider, Wallet, formatEther, getAddress, getBigInt } = requireBackend('ethers');

const argv = new Set(process.argv.slice(2));
const BE = process.env.E2E_BE_URL || DEFAULT_BE_URL;
const MONGO_URI = process.env.E2E_MONGODB_URI || DEFAULT_MONGO_URI;
const RPC = process.env.E2E_ARC_RPC || 'https://rpc.testnet.arc.io';
const PRICE_WEI = getBigInt(process.env.E2E_X402_PRICE_WEI || '10000000000000000');
const MAX_PAY_WEI = getBigInt('100000000000000000'); // never pay more than 0.1 testnet USDC per card
const RECEIPT_TIMEOUT_MS = 180_000;
/** host:port of a local Firebase Auth emulator. When set, nothing touches the real Firebase project. */
const FB_EMULATOR = (process.env.E2E_FIREBASE_AUTH_EMULATOR || '').trim();

const SPLIT_ABI = [
  'function donate(string memo) payable returns (uint256)',
  'function getShelter(address wallet) view returns (tuple(address wallet, uint16 bps, bool active, string name))',
  'function paused() view returns (bool)',
  'event NativeDisbursed(address indexed shelter, uint256 amount, string memo)',
];
const splitIface = new Interface(SPLIT_ABI);
const NATIVE_DISBURSED = splitIface.getEvent('NativeDisbursed').topicHash;

const results = [];
const record = (step, ok, detail) => {
  results.push({ step, result: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail: scrub(detail) });
  console.log(`[${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}] ${step}: ${scrub(detail)}`);
  return ok;
};
const pub = { startedAt: new Date().toISOString(), chainId: ARC_TESTNET };

function assertLocalUrl(url, what = 'backend URL') {
  const u = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error(`refusing ${what} ${url}: not localhost`);
}

async function http(method, path, { headers = {}, body } = {}) {
  const res = await fetch(BE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
const describe = (r) => `HTTP ${r.status}${r.json?.code ? ` ${r.json.code}` : ''}${r.json?.message ? ` ${typeof r.json.message === 'string' ? r.json.message : JSON.stringify(r.json.message)}` : r.json?.error ? ` ${r.json.error}` : r.json ? '' : ` ${r.text.slice(0, 120)}`}`;

/** NativeDisbursed logs from `split` in a receipt, decoded. */
function nativeDisbursed(receipt, split) {
  const out = [];
  for (const log of receipt?.logs || []) {
    if (log.address.toLowerCase() !== split.toLowerCase() || log.topics[0] !== NATIVE_DISBURSED) continue;
    const p = splitIface.parseLog({ topics: [...log.topics], data: log.data });
    out.push({ shelter: getAddress(p.args.shelter), amount: p.args.amount, memo: p.args.memo });
  }
  return out;
}

// ---------------------------------------------------------------- Firebase

function firebaseApp() {
  const admin = requireBackend('firebase-admin');
  // The non-secret service-account fields live in backend/src/app.module.ts; read them from there.
  const mod = readFileSync(join(BACKEND, 'src', 'app.module.ts'), 'utf8');
  const projectId = mod.match(/project_id:\s*'([^']+)'/)?.[1];
  const clientEmail = mod.match(/client_email:\s*'([^']+)'/)?.[1];
  if (!projectId || !clientEmail) throw new Error('could not read project_id/client_email from backend/src/app.module.ts');

  if (FB_EMULATOR) {
    // Emulator mode: no credential, no backend/.env read, no write to the real project. The backend
    // must get the same FIREBASE_AUTH_EMULATOR_HOST (start-local.sh passes it through).
    assertLocalUrl(`http://${FB_EMULATOR}`, 'Firebase Auth emulator');
    process.env.FIREBASE_AUTH_EMULATOR_HOST = FB_EMULATOR;
    const app = admin.initializeApp({ projectId }, 'tt-e2e');
    return { app, auth: app.auth(), emulator: true };
  }
  // A stray FIREBASE_AUTH_EMULATOR_HOST in the shell would split this process from the backend.
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

  const dotenv = requireBackend('dotenv');
  let parsed;
  try { parsed = dotenv.parse(readFileSync(join(BACKEND, '.env'))); } catch { throw new Error('backend/.env could not be read by the e2e process'); }
  // Same transform as app.module.ts, so the Admin credential is byte-for-byte the backend's.
  const privateKey = (parsed.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  parsed = null;
  if (!privateKey) throw new Error('FB_PRIVATE_KEY is not set in backend/.env');
  registerSecret(privateKey);

  const app = admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId }, 'tt-e2e');
  return { app, auth: app.auth(), emulator: false };
}

async function firebaseIdToken() {
  const { app, auth, emulator } = firebaseApp();
  try {
    let u = null;
    try { u = await auth.getUser(E2E_UID); } catch (e) { if (e?.code !== 'auth/user-not-found') throw e; }
    if (!u) await auth.createUser({ uid: E2E_UID, email: E2E_EMAIL, emailVerified: true, displayName: 'E2E Tester' });
    else if (u.email !== E2E_EMAIL.toLowerCase() || !u.emailVerified) await auth.updateUser(E2E_UID, { email: E2E_EMAIL, emailVerified: true });

    // The ID token from signInWithCustomToken has sign_in_provider 'custom' and carries the user
    // record's email and email_verified, which AuthStrategy.validate and resolveRegistered require.
    const custom = registerSecret(await auth.createCustomToken(E2E_UID));
    let apiKey = 'e2e-emulator';
    if (!emulator) {
      const src = readFileSync(join(CLIENT, 'context', 'FirebaseAuthContext.tsx'), 'utf8');
      apiKey = registerSecret(src.match(/apiKey:\s*["']([^"']+)["']/)?.[1] || '');
      if (!apiKey) throw new Error('web API key not found in client/context/FirebaseAuthContext.tsx');
    }
    const base = emulator ? `http://${FB_EMULATOR}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
    const headers = { 'content-type': 'application/json' };
    if (process.env.E2E_FIREBASE_REFERER) headers.referer = process.env.E2E_FIREBASE_REFERER;
    const res = await fetch(`${base}/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.refreshToken) registerSecret(body.refreshToken);
    if (body.idToken) registerSecret(body.idToken);
    if (!res.ok || !body.idToken) throw new Error(`signInWithCustomToken: HTTP ${res.status} ${body?.error?.message || ''}`);
    return { idToken: body.idToken, auth, app, emulator };
  } catch (e) {
    await app.delete().catch(() => undefined);
    throw e;
  }
}

// ---------------------------------------------------------------- steps

async function deleteFirebaseUserOnly() {
  const { app, auth } = firebaseApp();
  try {
    await auth.deleteUser(E2E_UID);
    record('firebase cleanup', true, `deleted Firebase user ${E2E_UID}`);
  } catch (e) {
    record('firebase cleanup', e?.code === 'auth/user-not-found' ? true : false, e?.code === 'auth/user-not-found' ? 'no such user' : errMsg(e));
  } finally {
    await app.delete().catch(() => undefined);
  }
}

async function main() {
  if (argv.has('--delete-firebase-user-only')) return deleteFirebaseUserOnly();
  assertLocalUrl(BE);
  assertLocalMongoUri(MONGO_URI);
  mkdirSync(OUT, { recursive: true });

  // (a) deployments, chain and contract
  let split, provider;
  try {
    const list = loadTestnetDeployments();
    list.forEach((d) => assertTestnet(d.chainId, `deployment ${d.chain}`));
    const dep = arcTestnetSplit(list);
    if (!dep) throw new Error('no Arc testnet ShelterSplit in deployments.json (deploy-testnet wave, then a:ingest --network testnet)');
    split = getAddress(dep.address);
    provider = new JsonRpcProvider(RPC);
    const net = await provider.getNetwork();
    assertTestnet(net.chainId, 'RPC chain');
    if (Number(net.chainId) !== ARC_TESTNET) throw new Error(`RPC is chain ${net.chainId}, expected ${ARC_TESTNET}`);
    const code = await provider.getCode(split);
    if (!code || code === '0x') throw new Error(`no code at ${split}`);
    const c = new Contract(split, SPLIT_ABI, provider);
    if (await c.paused()) throw new Error('ShelterSplit is paused');
    let shelter = null;
    try { shelter = await c.getShelter(WALLETS.pinkpaw); } catch { /* UnknownShelter */ }
    if (!shelter || !shelter.active) throw new Error(`Pink Paw ${WALLETS.pinkpaw} is not an active shelter on ${split} (register it: see README)`);
    if (!argv.has('--skip-x402') && Number(shelter.bps) < 10000) {
      throw new Error(`Pink Paw has ${shelter.bps} bps on ${split}; the x402 step needs 10000 (the treasury share emits no NativeDisbursed, so the backend would count less than the price). Fix the registration or pass --skip-x402`);
    }
    pub.split = split;
    pub.testnetDeployments = list.map((d) => ({ chain: d.chain, chainId: d.chainId, address: d.address, ...(d.token ? { token: d.token } : {}) }));
    record('a deployments', true, `${list.length} testnet deployment(s); Arc split ${split}; Pink Paw bps ${shelter.bps}`);
    pub.pinkPawBps = Number(shelter.bps);
  } catch (e) {
    record('a deployments', false, errMsg(e));
    return;
  }

  // (b) status
  try {
    const r = await http('GET', '/shelter/donate/status');
    const s = r.json || {};
    const problems = [];
    if (r.status !== 200) problems.push(describe(r));
    if (s.enabled !== true) problems.push(`enabled=${s.enabled} railState=${s.railState}`);
    if (Number(s.chainId) !== ARC_TESTNET) problems.push(`chainId=${s.chainId}`);
    if (String(s.splitAddress || '').toLowerCase() !== split.toLowerCase()) problems.push(`splitAddress=${s.splitAddress}, deployments say ${split}`);
    if (!record('b status', !problems.length, problems.length ? problems.join('; ') : `live, ${s.treatsLeftToday}/${s.giftsPerDayCap} gifts left today`)) return;
  } catch (e) {
    record('b status', false, `${errMsg(e)} (is start-local.sh running?)`);
    return;
  }

  // (b) the backend must use the same throwaway DB this script seeds. Proof: an unpaid cat-card
  // request makes the backend store a fresh x402 nonce; that nonce must show up in the local DB.
  // Nothing is paid and no user is created. Runs before Firebase, so a backend on 3105 that is not
  // the start-local.sh one (another DB) is refused before any user write.
  try {
    const r = await http('GET', '/shelter/agent/cat-card');
    const nonce = r.json?.accepts?.[0]?.extra?.nonce;
    if (r.status !== 402 || !/^[0-9a-f]{32}$/.test(nonce || '')) {
      throw new Error(`${describe(r)}${r.status === 503 ? ' (run seed.mjs first; start-local.sh enables x402)' : ''}`);
    }
    const seen = await withLocalDb(MONGO_URI, (db) => db.collection('x402nonces').findOne({ nonce }));
    if (!seen) throw new Error(`the backend on ${BE} did not write to ${MONGO_URI}: it is not the start-local.sh backend; refusing`);
    if (!record('b local db', true, `backend writes to ${MONGO_URI} (x402 nonce seen)`)) return;
  } catch (e) {
    record('b local db', false, errMsg(e));
    return;
  }

  // (c) Firebase token, local user, donate, receipt
  let idToken, fb;
  try {
    fb = await firebaseIdToken();
    idToken = fb.idToken;
    await withLocalDb(MONGO_URI, async (db) => {
      const userId = await ensureE2eUser(db);
      if (!argv.has('--keep-donations')) await db.collection('shelterdonations').deleteMany({ user: userId });
    });
    pub.firebase = fb.emulator ? 'emulator' : 'production project';
    record('c firebase', true, `ID token for uid ${E2E_UID} from the ${pub.firebase} (not shown); local user ready`);
  } catch (e) {
    record('c firebase', false, errMsg(e));
  }

  let donated = false;
  if (idToken) {
    try {
      const r = await http('POST', '/shelter/donate', { headers: { accesstoken: 'fb' + idToken }, body: { source: 'page' } });
      const tx = r.json?.txHash;
      if (r.status !== 200 || !/^0x[0-9a-fA-F]{64}$/.test(tx || '')) {
        record('c donate', false, describe(r));
      } else {
        donated = true;
        pub.donateTx = tx;
        record('c donate', true, `200, tx ${tx}`);
        const receipt = await provider.waitForTransaction(tx, 1, RECEIPT_TIMEOUT_MS);
        const logs = nativeDisbursed(receipt, split);
        const toPinkPaw = logs.filter((l) => l.shelter.toLowerCase() === WALLETS.pinkpaw.toLowerCase() && /^tt:page:[0-9a-f]{8}$/.test(l.memo));
        record('c receipt', receipt?.status === 1 && toPinkPaw.length > 0,
          receipt ? `status ${receipt.status}, block ${receipt.blockNumber}, ${toPinkPaw.length ? `NativeDisbursed ${formatEther(toPinkPaw[0].amount)} USDC to Pink Paw, memo ${toPinkPaw[0].memo}` : `no NativeDisbursed to Pink Paw (${logs.length} NativeDisbursed log(s))`}` : 'no receipt');
      }
    } catch (e) {
      record('c donate', false, errMsg(e));
    }
  } else {
    record('c donate', null, 'no ID token');
  }

  // (d) second gift the same UTC day
  if (donated) {
    try {
      const r = await http('POST', '/shelter/donate', { headers: { accesstoken: 'fb' + idToken }, body: { source: 'page' } });
      record('d second donate', r.status === 429 && r.json?.code === 'DONATE_ALREADY_TODAY', describe(r));
    } catch (e) {
      record('d second donate', false, errMsg(e));
    }
  } else {
    record('d second donate', null, 'first gift did not go through');
  }

  // (e) x402 cat card
  if (argv.has('--skip-x402')) {
    record('e x402', null, '--skip-x402');
  } else {
    await x402(split, provider);
  }

  if (fb) {
    if (argv.has('--delete-firebase-user')) {
      try { await fb.auth.deleteUser(E2E_UID); console.log(`deleted Firebase user ${E2E_UID}`); } catch (e) { console.log(`could not delete Firebase user: ${errMsg(e)}`); }
    }
    await fb.app.delete().catch(() => undefined);
  }
}

async function x402(split, provider) {
  let accept;
  try {
    const r = await http('GET', '/shelter/agent/cat-card');
    accept = r.json?.accepts?.[0];
    const problems = [];
    if (r.status !== 402) problems.push(describe(r));
    if (!accept) problems.push('no accepts[0]');
    else {
      if (accept.scheme !== 'onchain-receipt') problems.push(`scheme ${accept.scheme}`);
      if (accept.network !== `eip155:${ARC_TESTNET}`) problems.push(`network ${accept.network}`);
      if (accept.asset !== 'native') problems.push(`asset ${accept.asset}`);
      if (String(accept.payTo).toLowerCase() !== split.toLowerCase()) problems.push(`payTo ${accept.payTo} is not the testnet split ${split}`);
      if (!/^[0-9a-f]{32}$/.test(accept.extra?.nonce || '') || accept.extra?.memo !== `x402:${accept.extra?.nonce}`) problems.push('bad nonce/memo');
      const amount = getBigInt(accept.maxAmountRequired || '0');
      if (amount !== PRICE_WEI) problems.push(`maxAmountRequired ${amount} != ${PRICE_WEI}`);
      if (amount <= 0n || amount > MAX_PAY_WEI) problems.push(`price ${amount} outside the e2e cap`);
    }
    if (!record('e 402 challenge', !problems.length, problems.length ? problems.join('; ') : `402, price ${formatEther(getBigInt(accept.maxAmountRequired))} USDC, nonce ${accept.extra.nonce}`)) return;
  } catch (e) {
    record('e 402 challenge', false, errMsg(e));
    return;
  }

  let header;
  try {
    assertTestnet(Number(accept.network.split(':')[1]), 'x402 network');
    const key = keystoreKey('agent', WALLETS.agent);
    const wallet = new Wallet(key, provider);
    const value = getBigInt(accept.maxAmountRequired);
    const bal = await provider.getBalance(wallet.address);
    if (bal <= value) throw new Error(`agent ${wallet.address} holds ${formatEther(bal)} USDC; fund it from the faucet`);
    const c = new Contract(split, SPLIT_ABI, wallet);
    const tx = await c.donate(accept.extra.memo, { value });
    pub.x402Tx = tx.hash;
    const receipt = await provider.waitForTransaction(tx.hash, 1, RECEIPT_TIMEOUT_MS);
    const paid = nativeDisbursed(receipt, split).filter((l) => l.memo === accept.extra.memo).reduce((s, l) => s + l.amount, 0n);
    if (receipt?.status !== 1) throw new Error(`payment tx ${tx.hash} status ${receipt?.status}`);
    record('e agent payment', paid >= value, `tx ${tx.hash}, NativeDisbursed with memo ${formatEther(paid)} USDC`);
    header = Buffer.from(JSON.stringify({
      x402Version: 1,
      scheme: accept.scheme,
      network: accept.network,
      payload: { txHash: tx.hash, nonce: accept.extra.nonce },
    })).toString('base64');
  } catch (e) {
    record('e agent payment', false, errMsg(e));
    return;
  }

  try {
    let r;
    for (let i = 0; i < 6; i++) {
      r = await http('GET', '/shelter/agent/cat-card', { headers: { 'x-payment': header } });
      if (!(r.status === 402 && /retry shortly/.test(r.json?.error || ''))) break;
      await new Promise((ok) => setTimeout(ok, 5000));
    }
    const resp = r.headers.get('x-payment-response');
    let decoded = null;
    try { decoded = JSON.parse(Buffer.from(resp || '', 'base64').toString('utf8')); } catch { /* bad header */ }
    const ok = r.status === 200 && typeof r.json?.name === 'string' && decoded?.success === true
      && String(decoded.txHash).toLowerCase() === pub.x402Tx.toLowerCase();
    pub.card = r.json && r.status === 200 ? { name: r.json.name, shelterName: r.json.shelterName ?? null } : null;
    record('e paid card', ok, r.status === 200 ? `200, card "${r.json?.name}" (${r.json?.shelterName ?? 'no shelter'}), X-PAYMENT-RESPONSE ${decoded ? 'ok' : 'missing'}` : describe(r));
  } catch (e) {
    record('e paid card', false, errMsg(e));
  }

  try {
    const r = await http('GET', '/shelter/agent/cat-card', { headers: { 'x-payment': header } });
    // The nonce is consumed (usedAt set), so the backend answers a fresh 402 naming it.
    record('e replay', r.status === 402 && /already used/.test(r.json?.error || ''), describe(r));
  } catch (e) {
    record('e replay', false, errMsg(e));
  }
}

function table() {
  const w1 = Math.max(4, ...results.map((r) => r.step.length));
  console.log('\n' + 'STEP'.padEnd(w1) + '  RESULT  DETAIL');
  for (const r of results) console.log(`${r.step.padEnd(w1)}  ${r.result.padEnd(6)}  ${r.detail}`);
  const failed = results.filter((r) => r.result === 'FAIL').length;
  console.log(`\n${failed ? `FAIL: ${failed} step(s) failed` : 'PASS: every step passed'}`);
  pub.finishedAt = new Date().toISOString();
  pub.results = results;
  writeFileSync(join(OUT, 'e2e-result.json'), JSON.stringify(pub, null, 2) + '\n');
  console.log(`results (public tx hashes only): ${join(OUT, 'e2e-result.json')}`);
  return failed;
}

main()
  .catch((e) => record('harness', false, errMsg(e)))
  .finally(() => {
    const failed = table();
    process.exit(failed ? 1 : 0);
  });
