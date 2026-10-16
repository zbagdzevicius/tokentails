#!/usr/bin/env node
// statement: builds the public Match Desk statement (statement.json + a self-contained index.html) from
// the receipt envelopes the agent wrote, for a whole desk: one section per sponsor (its vault, what it
// funded, matched and has left) plus the desk total paid to the shelter wallet. Reads a desk.json (v2)
// or an old one-sponsor sponsor.json (v1). See MATCH-DESK.md, "Statement".
//
// - Every envelope's sha256 is re-checked against canonical(receipt body); a failing one is excluded
//   and listed with its reason. Only `reconciled` receipts count toward the totals.
// - Output is deterministic: sorted keys and rows, generatedAt from --now or the newest updatedAt.
// - Read-only. --verify-onchain re-reads AgentGift events over RPC; nothing is ever signed or sent.
// - No RPC URL, file path or private link is written into either file.
//
// The hash check is re-implemented here with log.mjs canonical() and node:crypto, so a statement can be
// checked independently of the agent's receipt code. The public labels and the policy hash come from
// lib/policy.mjs and the state-dir layout from lib/receipt.mjs, so the agent and the page never disagree.

import { readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { canonical } from './log.mjs';
import { renderHtml } from './lib/statement-html.mjs';
import {
  sponsorLabel, relatedPartyProblem, LABEL_SELF, LABEL_OPERATOR, DESK_SCHEMA, deskPolicyHashOf, byPriority, CUSTODY,
} from './lib/policy.mjs';
import { deskStateDir, siblingDirs, stateDir } from './lib/receipt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const PUBLIC_OUT = path.join(REPO, 'client/public/match-desk');
export const DEFAULT_STATE_DIR = path.join(HERE, 'runs', 'match-desk');

export const SPONSOR_SCHEMA = 'tt.match-desk.sponsor/v1';
// keccak256 topics as pinned in lib/abi.mjs (TOPIC.AgentGift, TOPIC.Funded, TOPIC.Withdrawn).
export const AGENT_GIFT_TOPIC = '0x5936d115a5d03a0687def57892742e7dfee0d3f44321c5b5506b60d8a96fd4cf';
export const FUNDED_TOPIC = '0x5af8184bef8e4b45eb9f6ed7734d04da38ced226495548f46e0c8ff8d7d9a524';
export const WITHDRAWN_TOPIC = '0x7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d5';
const FLOAT_BALANCE = '0xf2c70ada'; // floatBalance()

export const CHAINS = Object.freeze({
  5042: { id: 5042, name: 'Arc', explorer: 'https://explorer.arc.io' },
  5042002: { id: 5042002, name: 'Arc Testnet', explorer: 'https://explorer.testnet.arc.io' },
  31337: { id: 31337, name: 'Local anvil fork', explorer: null },
});

export const STATUSES = ['planned', 'sent', 'reconciled', 'failed', 'expired', 'skipped-duplicate', 'mismatch'];
const INPUT_MODES = new Set(['send', 'fork']);
const USAGE = 'usage: node statement.mjs --sponsor <desk.json|sponsor.json> [--receipts <dir>] [--out <dir>] [--now <ISO>] [--rpc <url> --verify-onchain]';

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

function checkSponsorEntry(sp, where) {
  if (!/^[a-z0-9-]{1,24}$/.test(sp.id || '')) throw new UsageError(`${where}: sponsor.id must match ^[a-z0-9-]{1,24}$`);
  if (typeof sp.name !== 'string' || !sp.name.trim() || sp.name.length > 80) throw new UsageError(`${where}: sponsor.name`);
  if (typeof sp.relatedParty !== 'boolean') throw new UsageError(`${where}: sponsor.relatedParty must be a boolean`);
  if (sp.relatedParty && !String(sp.relation || '').trim()) throw new UsageError(`${where}: relation is required for a related party`);
  const rp = relatedPartyProblem(sp);
  if (rp) throw new UsageError(`${where}: ${rp}`);
}

/**
 * The statement's view of a desk.json (v2) or a sponsor.json (v1): minimal checks the statement depends on
 * (lib/policy.mjs validates the full file for the agent). Returns
 * { v1, chainId, split, shelter, agent, sharedPolicy, ttlMinutes, sponsors: [{ id, name, relatedParty, relation,
 *   label, priority, spender: {address, deployBlock, owner}, ratioBps, perGiftMaxUsdc, budgetUsdc, perDonorDailyMaxUsdc,
 *   policySha256 }] } with sponsors in allocation order.
 */
export function deskView(file) {
  if (!file || (file.schema !== SPONSOR_SCHEMA && file.schema !== DESK_SCHEMA)) {
    throw new UsageError(`sponsor file: schema must be ${DESK_SCHEMA} or ${SPONSOR_SCHEMA}`);
  }
  if (!CHAINS[file.chainId]) throw new UsageError(`sponsor file: chainId ${file.chainId} is not 5042, 5042002 or 31337`);
  if (!lowerAddr(file.split)) throw new UsageError('sponsor file: split must be an address');
  if (!file.shelter || !lowerAddr(file.shelter.wallet)) throw new UsageError('sponsor file: shelter.wallet must be an address');
  if (!CUSTODY.includes(file.shelter.custody)) {
    throw new UsageError(`sponsor file: shelter.custody must be ${CUSTODY.join(', ')}`);
  }
  if (!file.policy || typeof file.policy !== 'object') throw new UsageError('sponsor file: policy is missing');
  const addrOrNull = (v, name) => {
    if (v != null && !lowerAddr(v)) throw new UsageError(`sponsor file: ${name} must be an address or null`);
    return lowerAddr(v);
  };
  const ttl = Number.isInteger(file.policy.plannedTtlMinutes) ? file.policy.plannedTtlMinutes : 30;
  const base = { chainId: file.chainId, split: lowerAddr(file.split), shelter: file.shelter, sharedPolicy: file.policy, ttlMinutes: ttl };
  if (file.schema === SPONSOR_SCHEMA) {
    const s = file.sponsor || {};
    checkSponsorEntry(s, 'sponsor file');
    const sp = file.spender || {};
    const p = file.policy;
    return {
      ...base,
      v1: true,
      agent: addrOrNull(sp.agent, 'spender.agent'),
      sponsors: [{
        id: s.id, name: s.name, relatedParty: s.relatedParty, relation: s.relation || null, label: sponsorLabel(s), priority: 0,
        spender: { address: addrOrNull(sp.address, 'spender.address'), deployBlock: sp.deployBlock ?? null, owner: addrOrNull(sp.owner, 'spender.owner') },
        ratioBps: p.ratioBps, perGiftMaxUsdc: p.perGiftMaxUsdc ?? null, budgetUsdc: p.budgetUsdc ?? null,
        perDonorDailyMaxUsdc: p.perDonorDailyMaxUsdc ?? null,
        policySha256: sha256Hex(canonical(p)),
      }],
    };
  }
  if (!Array.isArray(file.sponsors) || !file.sponsors.length) throw new UsageError('sponsor file: sponsors must list at least one sponsor');
  const ids = new Set();
  const sponsors = file.sponsors.map((e, i) => {
    checkSponsorEntry(e || {}, `sponsor file: sponsors[${i}]`);
    if (ids.has(e.id)) throw new UsageError(`sponsor file: sponsor id ${e.id} is listed twice`);
    ids.add(e.id);
    const sp = e.spender || {};
    return {
      id: e.id, name: e.name, relatedParty: e.relatedParty, relation: e.relation || null, label: sponsorLabel(e),
      priority: Number.isSafeInteger(e.priority) ? e.priority : 0,
      spender: { address: addrOrNull(sp.address, `sponsors[${i}].spender.address`), deployBlock: sp.deployBlock ?? null, owner: addrOrNull(sp.owner, `sponsors[${i}].spender.owner`) },
      ratioBps: e.ratioBps, perGiftMaxUsdc: e.perGiftMaxUsdc ?? null, budgetUsdc: e.budgetUsdc ?? null,
      perDonorDailyMaxUsdc: file.policy.perDonorDailyMaxUsdc ?? null,
      policySha256: deskPolicyHashOf(file.policy, e),
    };
  });
  sponsors.sort((a, b) => byPriority({ priority: a.priority, sponsor: a }, { priority: b.priority, sponsor: b }));
  return { ...base, v1: false, agent: addrOrNull(file.agent, 'agent'), sponsors };
}

/** Minimal checks the statement depends on (both schemas); returns the file. */
export function checkSponsor(file) {
  deskView(file);
  return file;
}

const view = (file) => (file && file.__view) || deskView(file);

/** How the page names a sponsor in a sentence: "Motored.lt, a related-party sponsor (…)" or "Token Tails, with the operator's own money". */
export const whoIs = (s) => (s.label === LABEL_OPERATOR ? `${s.name}, with the ${s.label}` : `${s.name}, a ${s.label}`);

function sponsorLine(s, many) {
  const label = s.label;
  if (label === LABEL_SELF) return 'The sponsor is the Token Tails founder: a self-sponsor (Token Tails founder). It is not an outside or independent sponsor.';
  if (label === LABEL_OPERATOR) return `${s.name} runs this desk and matches with its own money (${label}). It is not an outside or independent sponsor.`;
  if (s.relatedParty) return `${s.name} is a ${label}. It is not an outside or independent sponsor.`;
  return many ? `${s.name} is a sponsor.` : `${s.name} is the sponsor.`;
}

/**
 * The honest-copy sentences (MATCH-DESK.md, "Honest copy"), built from the sponsors and custody: one
 * sponsor line per sponsor, then custody and the rest. A desk with several sponsors adds how one match
 * is paid by one vault.
 */
export function disclosures(file) {
  const d = view(file);
  const shelter = d.shelter.name || 'the shelter';
  const many = d.sponsors.length > 1;
  const custodyLine = d.shelter.custody === 'pink-paw-wallet'
    ? `Matched money goes to the wallet of ${shelter}.`
    : d.shelter.custody === 'held-by-shelter'
    ? `The wallet of ${shelter} is held by the shelter itself. Matched money reaches that wallet.`
    : `The wallet of ${shelter} is still held by Token Tails until the handover. Matched money reaches that wallet. The shelter does not control it yet.`;
  return [
    ...d.sponsors.map((s) => sponsorLine(s, many)),
    custodyLine,
    ...(many ? ["Each company's money sits in its own capped vault, and only that company can fund it or take back what is left. One AI agent can spend from every vault, only through ShelterSplit to the shelter wallet. Code picks which vault pays each match; one match is paid by one vault."] : []),
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
 * Re-checks one envelope against this desk. Returns null when it is fine, else the reason it is
 * excluded. The hash is checked first, so a tampered body always reads "hash mismatch".
 */
export function envelopeProblem(env, file) {
  const d = view(file);
  const body = env?.receipt;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'missing receipt body';
  if (typeof env.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(env.sha256)) return 'missing sha256';
  if (sha256Hex(canonical(body)) !== env.sha256) return 'hash mismatch';
  const bad = unsafeValue(body);
  if (bad) return `bad body: ${bad}`;
  if (body.type !== 'tt.match-desk.receipt' || body.v !== 1) return 'bad body: type or version';
  const owner = d.sponsors.find((s) => s.spender.address && s.spender.address === String(body.spender).toLowerCase());
  if (!owner || body.sponsor !== owner.id) return 'sponsor mismatch';
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

/** Envelopes belong to this statement when they are for this chain and one of the desk's vaults. Others are skipped silently. */
export function belongs(env, file) {
  const d = view(file);
  const body = env?.receipt;
  if (!body) return false;
  const spender = String(body.spender || '').toLowerCase();
  return body.chainId === d.chainId && d.sponsors.some((s) => s.spender.address && s.spender.address === spender);
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

const newTally = () => ({ reconciledMicro: 0n, pendingMicro: 0n, giftsMicro: 0n, receipts: 0, giftIds: new Set(), donors: new Set() });
const tallyOut = (t) => ({
  reconciledUsdc: microToUsdc(t.reconciledMicro),
  pendingUsdc: microToUsdc(t.pendingMicro),
  receipts: t.receipts,
  giftsMatched: t.giftIds.size,
  donors: t.donors.size,
  giftsMatchedUsdc: microToUsdc(t.giftsMicro),
});
const rawToUsdc = (raw, dec) => microToUsdc(BigInt(raw) / 10n ** BigInt(Math.max(0, dec - 6)));

/**
 * Pure: desk (or sponsor) file + envelopes (+ optional on-chain reads) -> the statement object.
 * `onchain`: null (not checked) or { events: [{memo, tx, amountRaw, spender?}], vaults?: { <spender>:
 * { fundedRaw, withdrawnRaw, floatRaw, givenRaw, unitDecimals } } } from AgentGift, Funded and Withdrawn
 * logs and floatBalance().
 */
export function buildStatement({ file, envelopes, now = null, onchain = null }) {
  const d = deskView(file);
  const f = { ...file, __view: d };
  const chain = CHAINS[d.chainId];
  const ttlMs = d.ttlMinutes * 60_000;

  const excluded = [];
  const seen = new Set();
  const accepted = [];
  for (const env of envelopes) {
    if (env?.__unreadable) {
      excluded.push({ sha256: null, reason: `unreadable file ${path.basename(env.__unreadable)}` });
      continue;
    }
    if (!belongs(env, f) || !isInput(env)) continue;
    const problem = envelopeProblem(env, f);
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

  // On-chain cross-check: a reconciled receipt counts only when an AgentGift with its memo, tx and amount
  // exists (on its own vault, when the event names one).
  const unverified = new Set();
  if (onchain) {
    for (const env of accepted) {
      if (env.status !== 'reconciled') continue;
      const tx = String(env.witness?.tx || env.tx?.hash || '').toLowerCase();
      const hit = onchain.events.some((ev) => ev.memo === env.memo
        && ev.amountRaw === env.receipt.amountRaw && (!tx || ev.tx === tx)
        && (!ev.spender || ev.spender === env.receipt.spender));
      if (!hit) {
        unverified.add(env.sha256);
        excluded.push({ sha256: env.sha256, reason: 'not counted: no matching AgentGift event on-chain (memo, tx, amount)' });
      }
    }
  }

  const desk = newTally();
  const per = new Map(d.sponsors.map((s) => [s.id, newTally()]));
  const days = new Map();
  for (const env of accepted) {
    const amt = BigInt(env.receipt.amountMicro);
    const mine = per.get(env.receipt.sponsor);
    if (env.status === 'reconciled' && !unverified.has(env.sha256)) {
      for (const t of [desk, mine]) {
        t.reconciledMicro += amt;
        t.receipts++;
        for (const g of env.receipt.gifts) {
          if (BigInt(g.matchMicro) === 0n || t.giftIds.has(g.id)) continue;
          t.giftIds.add(g.id);
          t.giftsMicro += BigInt(g.giftMicro);
          if (g.donor) t.donors.add(String(g.donor).toLowerCase());
        }
      }
      const day = matchDay(env);
      const row = days.get(day) || { micro: 0n, receipts: 0 };
      row.micro += amt;
      row.receipts++;
      days.set(day, row);
    } else if (env.status === 'sent' || (env.status === 'planned' && nowMs != null && nowMs - Date.parse(env.createdAt) <= ttlMs)) {
      desk.pendingMicro += amt;
      mine.pendingMicro += amt;
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

  // Funded, withdrawn, given and float left come only from the chain (--rpc --verify-onchain); else null.
  let fundedMicro = 0n;
  let floatMicro = 0n;
  let haveFlows = Boolean(onchain?.vaults);
  const sponsors = d.sponsors.map((s) => {
    const fl = s.spender.address ? onchain?.vaults?.[s.spender.address] : null;
    let flows = null;
    if (fl) {
      const dec = fl.unitDecimals ?? 18;
      flows = {
        fundedUsdc: rawToUsdc(fl.fundedRaw, dec),
        withdrawnUsdc: rawToUsdc(fl.withdrawnRaw, dec),
        givenUsdc: rawToUsdc(fl.givenRaw, dec),
        floatLeftUsdc: fl.floatRaw == null ? null : rawToUsdc(fl.floatRaw, dec),
      };
      fundedMicro += BigInt(fl.fundedRaw) / 10n ** BigInt(Math.max(0, dec - 6));
      if (fl.floatRaw == null) haveFlows = false;
      else floatMicro += BigInt(fl.floatRaw) / 10n ** BigInt(Math.max(0, dec - 6));
    } else if (s.spender.address) {
      haveFlows = false;
    }
    return {
      id: s.id,
      name: s.name,
      relatedParty: s.relatedParty,
      label: s.label,
      priority: s.priority,
      vault: { spender: s.spender.address, owner: s.spender.owner, deployBlock: Number.isSafeInteger(s.spender.deployBlock) ? s.spender.deployBlock : null },
      policy: {
        ratio: ratioLabel(s.ratioBps),
        perGiftMaxUsdc: s.perGiftMaxUsdc,
        budgetUsdc: s.budgetUsdc,
        policySha256: s.policySha256,
      },
      totals: tallyOut(per.get(s.id)),
      onchain: flows,
    };
  });
  const anyVault = d.sponsors.some((s) => s.spender.address);

  const statement = {
    type: 'tt.match-desk.statement',
    v: 2,
    generatedAt,
    chain: { id: chain.id, name: chain.name, explorer: chain.explorer },
    sponsors,
    shelter: { name: d.shelter.name, wallet: lowerAddr(d.shelter.wallet), custody: d.shelter.custody },
    contract: { split: d.split, agent: d.agent },
    policy: { perDonorDailyMaxUsdc: d.sponsors[0].perDonorDailyMaxUsdc, allocation: 'highest priority first, then lowest id; one vault per match' },
    totals: {
      ...tallyOut(desk),
      // Every reconciled match went through ShelterSplit to the shelter's entry: this is what the desk paid the shelter wallet.
      paidToShelterUsdc: microToUsdc(desk.reconciledMicro),
      fundedUsdc: anyVault && haveFlows ? microToUsdc(fundedMicro) : null,
      floatLeftUsdc: anyVault && haveFlows ? microToUsdc(floatMicro) : null,
    },
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([day, r]) => ({ day, reconciledUsdc: microToUsdc(r.micro), receipts: r.receipts })),
    receipts,
    excluded,
    verifiedOnchain: Boolean(onchain),
    disclosures: disclosures(f),
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

/** A Funded / Withdrawn log's amount (data word 0). */
const amountOf = (log) => BigInt('0x' + (String(log.data || '').replace(/^0x/, '').slice(0, 64) || '0'));

/**
 * Read-only: per vault, AgentGift, Funded and Withdrawn logs from its deploy block, and floatBalance().
 * Returns { events: [{memo, amountRaw, tx, spender}], vaults: { <spender>: {fundedRaw, withdrawnRaw, givenRaw, floatRaw, unitDecimals} } }.
 */
export async function readAgentGifts({ rpcUrl, file, fetchImpl = globalThis.fetch, chunk = 10_000, gapMs }) {
  const d = deskView(file);
  const rpc = makeRpc(rpcUrl, fetchImpl);
  const gap = gapMs ?? (d.chainId === 5042 ? 500 : 0);
  const pause = () => (gap ? new Promise((r) => setTimeout(r, gap)) : null);
  const chainId = Number(await rpc('eth_chainId'));
  if (chainId !== d.chainId) throw new UsageError(`RPC chain ${chainId} is not the sponsor file's chain ${d.chainId}`);
  const deployed = d.sponsors.filter((s) => s.spender.address);
  if (!deployed.length || deployed.some((s) => !Number.isSafeInteger(Number(s.spender.deployBlock)) || s.spender.deployBlock === null)) {
    throw new UsageError('--verify-onchain needs spender.address and spender.deployBlock');
  }
  await pause();
  const head = Number(await rpc('eth_blockNumber'));
  const events = [];
  const vaults = {};
  const logsOf = async (address, topics, from) => {
    const out = [];
    let size = chunk;
    for (let start = from; start <= head;) {
      const end = Math.min(head, start + size - 1);
      await pause();
      try {
        out.push(...await rpc('eth_getLogs', [{ address, topics, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16) }]));
        start = end + 1;
      } catch (e) {
        if (size <= 100 || !/range|limit|too (large|many)|exceed/i.test(e.message)) throw e;
        size = Math.floor(size / 2);
      }
    }
    return out;
  };
  for (const s of deployed) {
    const spender = s.spender.address;
    const from = Number(s.spender.deployBlock);
    let givenRaw = 0n;
    for (const l of await logsOf(spender, [AGENT_GIFT_TOPIC], from)) {
      const ev = { ...decodeAgentGift(l), spender };
      givenRaw += BigInt(ev.amountRaw);
      events.push(ev);
    }
    let fundedRaw = 0n;
    let withdrawnRaw = 0n;
    for (const l of await logsOf(spender, [[FUNDED_TOPIC, WITHDRAWN_TOPIC]], from)) {
      if (l.topics?.[0] === FUNDED_TOPIC) fundedRaw += amountOf(l);
      else if (l.topics?.[0] === WITHDRAWN_TOPIC) withdrawnRaw += amountOf(l);
    }
    await pause();
    let floatRaw = null;
    try {
      floatRaw = BigInt(await rpc('eth_call', [{ to: spender, data: FLOAT_BALANCE }, 'latest'])).toString();
    } catch { /* unknown: the page says "not read" */ }
    // Native USDC on Arc: 18 decimals (the runbook's vaults are native mode).
    vaults[spender] = { fundedRaw: fundedRaw.toString(), withdrawnRaw: withdrawnRaw.toString(), givenRaw: givenRaw.toString(), floatRaw, unitDecimals: 18 };
  }
  return { events, vaults };
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

/**
 * The receipt directories of this desk: its own state dir, then every earlier layout of the same vaults
 * (v1 <chainId>-<vault> dirs and other desk dirs on the chain). The first copy of a receipt wins.
 */
export async function receiptsDirsFor(file, env = process.env) {
  const d = deskView(file);
  const vaults = d.sponsors.map((s) => s.spender.address).filter(Boolean);
  if (!vaults.length) return [];
  const base = env.MATCH_DESK_DIR || DEFAULT_STATE_DIR;
  const own = deskStateDir(base, d.chainId, vaults);
  const dirs = [own, ...vaults.map((a) => stateDir(base, d.chainId, a))];
  for (const sib of await siblingDirs(own)) if (!dirs.includes(sib)) dirs.push(sib);
  return dirs.map((x) => path.join(x, 'receipts'));
}

/** Back-compat: the first receipts directory (this desk's own). */
export function receiptsDirFor(file, env = process.env) {
  const d = deskView(file);
  const vaults = d.sponsors.map((s) => s.spender.address).filter(Boolean);
  if (!vaults.length) return null;
  return path.join(deskStateDir(env.MATCH_DESK_DIR || DEFAULT_STATE_DIR, d.chainId, vaults), 'receipts');
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
  const dirs = receipts ? [receipts] : await receiptsDirsFor(file);
  const envelopes = [];
  for (const dir of dirs) envelopes.push(...await loadEnvelopes(dir));
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
  log(`statement: ${st.receipts.length} receipt(s), ${st.totals.receipts} reconciled = ${st.totals.reconciledUsdc} USDC paid to the shelter wallet, `
    + `${st.totals.pendingUsdc} USDC pending, ${st.excluded.length} excluded${onchain ? ', checked on-chain' : ''}`);
  for (const sp of st.sponsors) {
    const oc = sp.onchain;
    log(`  ${sp.id}: ${sp.totals.receipts} reconciled = ${sp.totals.reconciledUsdc} USDC${oc ? ` · funded ${oc.fundedUsdc} · float left ${oc.floatLeftUsdc}` : ''}`);
  }
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
        desk: { type: 'string' },
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
  if (!values.sponsor && !values.desk) {
    console.error(USAGE);
    return 2;
  }
  try {
    await generate({
      sponsorFile: values.sponsor || values.desk, receipts: values.receipts, out: values.out, now: values.now,
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
