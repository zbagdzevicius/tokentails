#!/usr/bin/env node
// statement: builds the public Sponsor Match Desk statement (statement.json + a self-contained
// index.html) from the receipt envelopes the agent wrote. See MATCH-DESK.md, "Statement".
//
// - Every envelope's sha256 is re-checked against canonical(receipt body); a failing one is excluded
//   and listed with its reason. Only `reconciled` receipts count toward the totals.
// - Output is deterministic: sorted keys and rows, generatedAt from --now or the newest updatedAt.
// - Read-only. --verify-onchain re-reads AgentGift events over RPC; nothing is ever signed or sent.
// - No RPC URL, file path or private link is written into either file.
//
// This file does not import the agent's receipt libs (lib/receipt.mjs etc.): it re-implements the
// hash check with log.mjs canonical() and node:crypto, so a statement can be checked independently.
// Only the public sponsor label comes from lib/policy.mjs, so the agent and the page never disagree.

import { readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { canonical } from './log.mjs';
import { renderHtml } from './lib/statement-html.mjs';
import { sponsorLabel, relatedPartyProblem, LABEL_SELF } from './lib/policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const PUBLIC_OUT = path.join(REPO, 'client/public/match-desk');
export const DEFAULT_STATE_DIR = path.join(HERE, 'runs', 'match-desk');

export const SPONSOR_SCHEMA = 'tt.match-desk.sponsor/v1';
// keccak256("AgentGift(uint256,uint256,string,uint256)") as pinned in lib/abi.mjs (TOPIC.AgentGift).
export const AGENT_GIFT_TOPIC = '0x5936d115a5d03a0687def57892742e7dfee0d3f44321c5b5506b60d8a96fd4cf';

export const CHAINS = Object.freeze({
  5042: { id: 5042, name: 'Arc', explorer: 'https://explorer.arc.io' },
  5042002: { id: 5042002, name: 'Arc Testnet', explorer: 'https://explorer.testnet.arc.io' },
  31337: { id: 31337, name: 'Local anvil fork', explorer: null },
});

export const STATUSES = ['planned', 'sent', 'reconciled', 'failed', 'expired', 'skipped-duplicate', 'mismatch'];
const INPUT_MODES = new Set(['send', 'fork']);
const USAGE = 'usage: node statement.mjs --sponsor <sponsor.json> [--receipts <dir>] [--out <dir>] [--now <ISO>] [--rpc <url> --verify-onchain]';

export class UsageError extends Error {}

// ------------------------------------------------------------------ small helpers

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const lowerAddr = (a) => (typeof a === 'string' && ADDR.test(a) ? a.toLowerCase() : null);
const isDigits = (s) => typeof s === 'string' && /^\d+$/.test(s);

/** Micro-USDC (bigint or digit string) -> decimal USDC string, e.g. 50000n -> "0.05", 0n -> "0". */
export function microToUsdc(micro) {
  const v = BigInt(micro);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const frac = (a % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + (a / 1000000n).toString() + (frac ? '.' + frac : '');
}

export const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Deep copy with object keys sorted, so JSON.stringify output does not depend on insertion order. */
export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

export function ratioLabel(bps) {
  const n = Number(bps);
  if (!Number.isInteger(n) || n < 1 || n > 10000) return 'invalid';
  const w = Math.floor(n / 10000);
  const f = String(n % 10000).padStart(4, '0').replace(/0+$/, '');
  return `${w}${f ? '.' + f : ''}:1`;
}

// ------------------------------------------------------------------ sponsor and honest copy

// The public label lives in lib/policy.mjs (one implementation for the agent and the statement).
export { sponsorLabel };

/** Minimal checks the statement depends on. lib/policy.mjs (the agent) validates the full file. */
export function checkSponsor(file) {
  if (!file || file.schema !== SPONSOR_SCHEMA) throw new UsageError(`sponsor file: schema must be ${SPONSOR_SCHEMA}`);
  const s = file.sponsor || {};
  if (!/^[a-z0-9-]{1,24}$/.test(s.id || '')) throw new UsageError('sponsor file: sponsor.id must match ^[a-z0-9-]{1,24}$');
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) throw new UsageError('sponsor file: sponsor.name');
  if (typeof s.relatedParty !== 'boolean') throw new UsageError('sponsor file: sponsor.relatedParty must be a boolean');
  if (s.relatedParty && !String(s.relation || '').trim()) throw new UsageError('sponsor file: relation is required for a related party');
  const rp = relatedPartyProblem(s);
  if (rp) throw new UsageError(`sponsor file: ${rp}`);
  if (!CHAINS[file.chainId]) throw new UsageError(`sponsor file: chainId ${file.chainId} is not 5042, 5042002 or 31337`);
  if (!lowerAddr(file.split)) throw new UsageError('sponsor file: split must be an address');
  if (!file.shelter || !lowerAddr(file.shelter.wallet)) throw new UsageError('sponsor file: shelter.wallet must be an address');
  if (!['held-by-token-tails', 'held-by-shelter'].includes(file.shelter.custody)) {
    throw new UsageError('sponsor file: shelter.custody must be held-by-token-tails or held-by-shelter');
  }
  if (!file.policy || typeof file.policy !== 'object') throw new UsageError('sponsor file: policy is missing');
  const sp = file.spender || {};
  for (const k of ['address', 'owner', 'agent']) {
    if (sp[k] != null && !lowerAddr(sp[k])) throw new UsageError(`sponsor file: spender.${k} must be an address or null`);
  }
  return file;
}

/** The eight honest-copy sentences (MATCH-DESK.md, "Honest copy"), built from the sponsor and custody. */
export function disclosures(file) {
  const s = file.sponsor;
  const label = sponsorLabel(s);
  const shelter = file.shelter.name || 'the shelter';
  const sponsorLine = label === LABEL_SELF
    ? `The sponsor is the Token Tails founder: a self-sponsor (Token Tails founder). It is not an outside or independent sponsor.`
    : s.relatedParty
      ? `${s.name} is a ${label}. It is not an outside or independent sponsor.`
      : `${s.name} is the sponsor.`;
  const custodyLine = file.shelter.custody === 'held-by-shelter'
    ? `The wallet of ${shelter} is held by the shelter itself. Matched money reaches that wallet.`
    : `The wallet of ${shelter} is still held by Token Tails until the handover. Matched money reaches that wallet. The shelter does not control it yet.`;
  return [
    sponsorLine,
    custodyLine,
    'The contract caps each gift and each UTC calendar day. The day resets at 00:00 UTC, so up to 2x the daily cap can go out across midnight.',
    "The agent's code enforces the per-donor limit. The contract does not.",
    'This statement is not a tax receipt.',
    "We use USDC on Arc (Arc's native coin). We do not use Circle Wallets, Paymaster or Gateway.",
    'Claude proposes. Code recomputes the amount and refuses a proposal that differs. The contract has the last word.',
    'A match counts only once its AgentGift event has been read back from the chain (reconciled).',
  ];
}

// ------------------------------------------------------------------ envelopes

/**
 * Re-checks one envelope against this sponsor. Returns null when it is fine, else the reason it is
 * excluded. The hash is checked first, so a tampered body always reads "hash mismatch".
 */
export function envelopeProblem(env, file) {
  const body = env?.receipt;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'missing receipt body';
  if (typeof env.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(env.sha256)) return 'missing sha256';
  if (sha256Hex(canonical(body)) !== env.sha256) return 'hash mismatch';
  const bad = unsafeValue(body);
  if (bad) return `bad body: ${bad}`;
  if (body.type !== 'tt.match-desk.receipt' || body.v !== 1) return 'bad body: type or version';
  if (body.sponsor !== file.sponsor.id) return 'sponsor mismatch';
  if (env.memo !== `tt:agent:m:${body.sponsor}:${env.sha256.slice(0, 8)}`) return 'memo mismatch';
  if (!STATUSES.includes(env.status)) return `unknown status: ${env.status}`;
  if (!Array.isArray(body.gifts) || body.gifts.length === 0 || body.gifts.length > 10) return 'bad body: gifts';
  for (const k of ['amountMicro', 'uncappedMicro', 'amountRaw']) if (!isDigits(body[k])) return `bad body: ${k}`;
  let sum = 0n;
  const ids = new Set();
  for (const g of body.gifts) {
    if (!g || !isDigits(g.giftMicro) || !isDigits(g.matchMicro)) return 'bad body: gift amounts';
    if (ids.has(g.id)) return 'bad body: duplicate gift';
    ids.add(g.id);
    sum += BigInt(g.matchMicro);
  }
  if (sum !== BigInt(body.amountMicro)) return 'amount mismatch: gifts do not add up';
  if (BigInt(body.amountMicro) > BigInt(body.uncappedMicro)) return 'amount mismatch: above uncapped';
  const dec = body.unitDecimals;
  if (!Number.isInteger(dec) || dec < 6 || dec > 36) return 'bad body: unitDecimals';
  if (BigInt(body.amountMicro) * 10n ** BigInt(dec - 6) !== BigInt(body.amountRaw)) return 'amount mismatch: raw units';
  return null;
}

/** Only strings, safe integers, booleans, null, arrays and objects; addresses lowercase. */
function unsafeValue(v, where = 'body') {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') {
    if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) && v !== v.toLowerCase()) return `${where} not lowercase`;
    return null;
  }
  if (typeof v === 'number') return Number.isSafeInteger(v) ? null : `${where} is not a safe integer`;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = unsafeValue(v[i], `${where}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === 'object') {
    for (const k of Object.keys(v)) {
      const r = unsafeValue(v[k], `${where}.${k}`);
      if (r) return r;
    }
    return null;
  }
  return `${where} has type ${typeof v}`;
}

/** Envelopes belong to this statement when they are for this chain and spender. Others are skipped silently. */
export function belongs(env, file) {
  const body = env?.receipt;
  const spender = lowerAddr(file.spender?.address);
  if (!spender || !body) return false;
  return body.chainId === file.chainId && String(body.spender || '').toLowerCase() === spender;
}

/**
 * Input modes: `send` and `fork`. A dry-run envelope is a printed command; it is included only once it is
 * `reconciled`, i.e. the founder ran the command by hand and the witness read the AgentGift back.
 */
export const isInput = (env) => INPUT_MODES.has(env?.mode) || (env?.mode === 'dry-run' && env?.status === 'reconciled');

export async function loadEnvelopes(dir) {
  let names;
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const n of names) {
    const raw = await readFile(path.join(dir, n), 'utf8');
    try {
      out.push(JSON.parse(raw));
    } catch {
      out.push({ __unreadable: n });
    }
  }
  return out;
}

/** Redacts links (except the explorer and tokentails.com) from free text such as the model rationale. */
function redactLinks(text, explorer) {
  if (typeof text !== 'string') return text;
  return text.replace(/https?:\/\/[^\s"'<>)]+/g, (u) =>
    (explorer && u.startsWith(explorer + '/')) || /^https:\/\/(www\.)?tokentails\.com(\/|$)/.test(u) ? u : '[link removed]');
}

// ------------------------------------------------------------------ build

const dayOf = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(iso) ? iso.slice(0, 10) : null);

/** The day a reconciled match is booked on: the block time when the witness has it, else when it was read back. */
function matchDay(env) {
  const w = env.witness || {};
  if (Number.isSafeInteger(w.blockTime)) return new Date(w.blockTime * 1000).toISOString().slice(0, 10);
  return dayOf(w.blockTimeIso) || dayOf(w.reconciledAt) || dayOf(env.updatedAt) || 'unknown';
}

/**
 * Pure: sponsor file + envelopes (+ optional on-chain check) -> the statement object.
 * `onchain`: null (not checked) or { events: [{memo, tx, amountRaw}] } from AgentGift logs.
 */
export function buildStatement({ file, envelopes, now = null, onchain = null }) {
  checkSponsor(file);
  const chain = CHAINS[file.chainId];
  const policy = file.policy;
  const ttlMs = (Number.isInteger(policy.plannedTtlMinutes) ? policy.plannedTtlMinutes : 30) * 60_000;

  const excluded = [];
  const seen = new Set();
  const accepted = [];
  for (const env of envelopes) {
    if (env?.__unreadable) {
      excluded.push({ sha256: null, reason: `unreadable file ${path.basename(env.__unreadable)}` });
      continue;
    }
    if (!belongs(env, file) || !isInput(env)) continue;
    const problem = envelopeProblem(env, file);
    if (problem) {
      excluded.push({ sha256: typeof env.sha256 === 'string' ? env.sha256 : null, reason: problem });
      continue;
    }
    if (seen.has(env.sha256)) continue; // the same receipt twice (a copied file): identical body, keep one
    seen.add(env.sha256);
    accepted.push(env);
  }

  const generatedAt = now
    || accepted.map((e) => e.updatedAt).filter((t) => typeof t === 'string').sort().pop()
    || null;
  const nowMs = generatedAt ? Date.parse(generatedAt) : null;

  // On-chain cross-check: a reconciled receipt counts only when an AgentGift with its memo, tx and amount exists.
  const unverified = new Set();
  if (onchain) {
    for (const env of accepted) {
      if (env.status !== 'reconciled') continue;
      const tx = String(env.witness?.tx || env.tx?.hash || '').toLowerCase();
      const hit = onchain.events.some((ev) => ev.memo === env.memo
        && ev.amountRaw === env.receipt.amountRaw && (!tx || ev.tx === tx));
      if (!hit) {
        unverified.add(env.sha256);
        excluded.push({ sha256: env.sha256, reason: 'not counted: no matching AgentGift event on-chain (memo, tx, amount)' });
      }
    }
  }

  let reconciledMicro = 0n;
  let pendingMicro = 0n;
  let giftsMicro = 0n;
  let receiptsCounted = 0;
  const giftIds = new Set();
  const donors = new Set();
  const days = new Map();
  for (const env of accepted) {
    const amt = BigInt(env.receipt.amountMicro);
    if (env.status === 'reconciled' && !unverified.has(env.sha256)) {
      reconciledMicro += amt;
      receiptsCounted++;
      for (const g of env.receipt.gifts) {
        if (BigInt(g.matchMicro) === 0n || giftIds.has(g.id)) continue;
        giftIds.add(g.id);
        giftsMicro += BigInt(g.giftMicro);
        if (g.donor) donors.add(String(g.donor).toLowerCase());
      }
      const d = matchDay(env);
      const row = days.get(d) || { micro: 0n, receipts: 0 };
      row.micro += amt;
      row.receipts++;
      days.set(d, row);
    } else if (env.status === 'sent') {
      pendingMicro += amt;
    } else if (env.status === 'planned' && nowMs != null && nowMs - Date.parse(env.createdAt) <= ttlMs) {
      pendingMicro += amt;
    }
  }

  const receipts = accepted
    .slice()
    .sort((a, b) => (String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) || a.sha256.localeCompare(b.sha256))
    .map((env) => {
      const copy = JSON.parse(JSON.stringify(env));
      if (copy.decision && typeof copy.decision.rationale === 'string') {
        copy.decision.rationale = redactLinks(copy.decision.rationale, chain.explorer);
      }
      return copy;
    });

  excluded.sort((a, b) => String(a.sha256).localeCompare(String(b.sha256)) || a.reason.localeCompare(b.reason));

  const statement = {
    type: 'tt.match-desk.statement',
    v: 1,
    generatedAt,
    chain: { id: chain.id, name: chain.name, explorer: chain.explorer },
    sponsor: {
      id: file.sponsor.id,
      name: file.sponsor.name,
      relatedParty: file.sponsor.relatedParty,
      label: sponsorLabel(file.sponsor),
    },
    shelter: { name: file.shelter.name, wallet: lowerAddr(file.shelter.wallet), custody: file.shelter.custody },
    contract: {
      spender: lowerAddr(file.spender?.address),
      split: lowerAddr(file.split),
      owner: lowerAddr(file.spender?.owner),
      agent: lowerAddr(file.spender?.agent),
    },
    policy: {
      ratio: ratioLabel(policy.ratioBps),
      perGiftMaxUsdc: policy.perGiftMaxUsdc ?? null,
      perDonorDailyMaxUsdc: policy.perDonorDailyMaxUsdc ?? null,
      budgetUsdc: policy.budgetUsdc ?? null,
      policySha256: sha256Hex(canonical(policy)),
    },
    totals: {
      reconciledUsdc: microToUsdc(reconciledMicro),
      pendingUsdc: microToUsdc(pendingMicro),
      receipts: receiptsCounted,
      giftsMatched: giftIds.size,
      donors: donors.size,
      giftsMatchedUsdc: microToUsdc(giftsMicro),
    },
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([day, r]) => ({ day, reconciledUsdc: microToUsdc(r.micro), receipts: r.receipts })),
    receipts,
    excluded,
    verifiedOnchain: Boolean(onchain),
    disclosures: disclosures(file),
    notTaxReceipt: true,
  };
  return sortKeys(statement);
}

export const serializeStatement = (st) => JSON.stringify(st, null, 2) + '\n';

// ------------------------------------------------------------------ on-chain check (read-only)

function makeRpc(url, fetchImpl) {
  let id = 0;
  return async (method, params = []) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
    return body.result;
  };
}

/** Decode an AgentGift log: data = amount (word 0), memo offset (word 1), spentToday (word 2). */
export function decodeAgentGift(log) {
  const h = String(log.data || '').replace(/^0x/, '');
  const w = (i) => h.slice(i * 64, (i + 1) * 64);
  const amount = BigInt('0x' + w(0));
  const off = Number(BigInt('0x' + w(1))) * 2;
  const len = Number(BigInt('0x' + h.slice(off, off + 64)));
  const memo = Buffer.from(h.slice(off + 64, off + 64 + len * 2), 'hex').toString('utf8');
  return { memo, amountRaw: amount.toString(), tx: String(log.transactionHash || '').toLowerCase() };
}

export async function readAgentGifts({ rpcUrl, file, fetchImpl = globalThis.fetch, chunk = 10_000, gapMs }) {
  const rpc = makeRpc(rpcUrl, fetchImpl);
  const gap = gapMs ?? (file.chainId === 5042 ? 500 : 0);
  const pause = () => (gap ? new Promise((r) => setTimeout(r, gap)) : null);
  const chainId = Number(await rpc('eth_chainId'));
  if (chainId !== file.chainId) throw new UsageError(`RPC chain ${chainId} is not the sponsor file's chain ${file.chainId}`);
  const spender = lowerAddr(file.spender?.address);
  const from = Number(file.spender?.deployBlock);
  if (!spender || !Number.isSafeInteger(from)) throw new UsageError('--verify-onchain needs spender.address and spender.deployBlock');
  await pause();
  const head = Number(await rpc('eth_blockNumber'));
  const events = [];
  let size = chunk;
  for (let start = from; start <= head;) {
    const end = Math.min(head, start + size - 1);
    await pause();
    try {
      const logs = await rpc('eth_getLogs', [{
        address: spender, topics: [AGENT_GIFT_TOPIC],
        fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16),
      }]);
      for (const l of logs) events.push(decodeAgentGift(l));
      start = end + 1;
    } catch (e) {
      if (size <= 100 || !/range|limit|too (large|many)|exceed/i.test(e.message)) throw e;
      size = Math.floor(size / 2);
    }
  }
  return { events };
}

// ------------------------------------------------------------------ output path guard

async function resolveReal(p) {
  const abs = path.resolve(p);
  try {
    return await realpath(abs);
  } catch {
    return abs;
  }
}

/**
 * The public page only ever shows Arc mainnet: fork envelopes, chain 31337 and Arc testnet (5042002)
 * never go to client/public/match-desk. A fork statement also needs an explicit --out.
 */
export async function checkOut({ out, outGiven, file, envelopes }) {
  const forky = file.chainId === 31337 || envelopes.some((e) => belongs(e, file) && e?.mode === 'fork');
  if (forky && !outGiven) throw new UsageError('a fork statement (mode fork or chain 31337) needs an explicit --out outside client/public/match-desk');
  const target = await resolveReal(out);
  const pub = await resolveReal(PUBLIC_OUT);
  const isPublic = target === pub || target.startsWith(pub + path.sep);
  if (!isPublic) return;
  if (forky) throw new UsageError('refusing to write a fork statement (mode fork or chain 31337) into client/public/match-desk');
  if (file.chainId !== 5042) {
    throw new UsageError(`refusing to write a chain ${file.chainId} statement into client/public/match-desk (Arc mainnet 5042 only); pass --out <dir>`);
  }
}

/** The output dir for the console: relative when it is inside the current directory, else absolute. */
export function displayDir(dir, cwd = process.cwd()) {
  const abs = path.resolve(cwd, dir);
  const rel = path.relative(cwd, abs);
  if (!rel) return '.';
  return rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel;
}

// ------------------------------------------------------------------ CLI

export function receiptsDirFor(file, env = process.env) {
  const spender = lowerAddr(file.spender?.address);
  if (!spender) return null;
  return path.join(env.MATCH_DESK_DIR || DEFAULT_STATE_DIR, `${file.chainId}-${spender}`, 'receipts');
}

export async function generate({ sponsorFile, receipts, out, now, rpc, verifyOnchain, fetchImpl, log = console.log }) {
  let file;
  try {
    file = JSON.parse(await readFile(sponsorFile, 'utf8'));
  } catch (e) {
    throw new UsageError(`cannot read the sponsor file: ${e.message}`);
  }
  checkSponsor(file);
  if (now != null && Number.isNaN(Date.parse(now))) throw new UsageError('--now must be an ISO date');
  const dir = receipts || receiptsDirFor(file);
  const envelopes = dir ? await loadEnvelopes(dir) : [];
  const outDir = out || PUBLIC_OUT;
  await checkOut({ out: outDir, outGiven: Boolean(out), file, envelopes });
  let onchain = null;
  if (verifyOnchain) {
    if (!rpc) throw new UsageError('--verify-onchain needs --rpc <url>');
    onchain = await readAgentGifts({ rpcUrl: rpc, file, fetchImpl });
  }
  const st = buildStatement({ file, envelopes, now: now ? new Date(now).toISOString() : null, onchain });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'statement.json'), serializeStatement(st));
  await writeFile(path.join(outDir, 'index.html'), renderHtml(st));
  log(`statement: ${st.receipts.length} receipt(s), ${st.totals.receipts} reconciled = ${st.totals.reconciledUsdc} USDC, `
    + `${st.totals.pendingUsdc} USDC pending, ${st.excluded.length} excluded${onchain ? ', checked on-chain' : ''}`);
  for (const x of st.excluded) log(`  excluded ${x.sha256 ? x.sha256.slice(0, 12) : '(no hash)'}: ${x.reason}`);
  log(`wrote statement.json and index.html to ${displayDir(outDir)}`);
  return st;
}

async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        sponsor: { type: 'string' },
        receipts: { type: 'string' },
        out: { type: 'string' },
        now: { type: 'string' },
        rpc: { type: 'string' },
        'verify-onchain': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }));
  } catch (e) {
    console.error(e.message + '\n' + USAGE);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.sponsor) {
    console.error(USAGE);
    return 2;
  }
  try {
    await generate({
      sponsorFile: values.sponsor, receipts: values.receipts, out: values.out, now: values.now,
      rpc: values.rpc, verifyOnchain: values['verify-onchain'],
    });
    return 0;
  } catch (e) {
    console.error(`statement: ${e.message}`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e);
    process.exit(1);
  });
}
