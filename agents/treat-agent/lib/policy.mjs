// Match desk policy file (sponsor.json, schema tt.match-desk.sponsor/v1): strict validation.
// Every amount is a decimal string parsed to micro-USDC bigint; floats never carry money.
// Any failure throws PolicyError, and run.mjs exits 2. See MATCH-DESK.md, "sponsor.json".

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonical } from '../log.mjs';
import { parseMicro } from './abi.mjs';

export const SPONSOR_SCHEMA = 'tt.match-desk.sponsor/v1';
/** Arc mainnet, Arc testnet, and a plain local anvil (31337, never a live chain). */
export const SPONSOR_CHAIN_IDS = Object.freeze([5042, 5042002, 31337]);
/** Gift kinds a sponsor may match. router-flush is never eligible: whoever flushes first sets its memo, so its donor is unknown. */
export const GIFT_KINDS = Object.freeze(['public', 'x402', 'router-native', 'router-authorization']);
export const CUSTODY = Object.freeze(['held-by-token-tails', 'held-by-shelter']);

export const LABEL_RELATED = "related-party sponsor (founder's company)";
export const LABEL_SELF = 'self-sponsor (Token Tails founder)';
export const LABEL_PLAIN = 'sponsor';

/** A guard or policy refusal: run.mjs exits 2. */
export class GuardError extends Error {}
export class PolicyError extends GuardError {}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = (msg) => {
  throw new PolicyError(`sponsor.json: ${msg}`);
};

/**
 * The public label, the only implementation (statement.mjs imports it). A related party is never called
 * an outside or independent sponsor. The founder funding the vault personally (id "self", or relation
 * "self…", "founder" or "Token Tails founder") is a self-sponsor; Motored.lt (the founder's company) is
 * a related-party sponsor.
 */
export function sponsorLabel(s) {
  const rel = String(s?.relation || '').trim();
  if (s?.id === 'self' || /^self/i.test(rel) || /^(token tails )?founder$/i.test(rel)) return LABEL_SELF;
  if (s?.relatedParty) return !rel || rel === "founder's company" ? LABEL_RELATED : `related-party sponsor (${rel})`;
  return LABEL_PLAIN;
}

/**
 * Motored.lt is the founder's company: it may never be published as a plain "sponsor". Returns the
 * reason a sponsor block is refused, or null.
 */
export function relatedPartyProblem(s) {
  const motored = s?.id === 'motored' || /motored/i.test(String(s?.name || ''));
  if (motored && s?.relatedParty !== true) {
    return "Motored.lt is the founder's company: sponsor.relatedParty must be true (label: related-party sponsor (founder's company))";
  }
  return null;
}

function addr(v, name, { nullable = false } = {}) {
  if (v === null && nullable) return null;
  if (typeof v !== 'string' || !ADDR.test(v)) fail(`${name} must be a 0x address${nullable ? ' or null' : ''}`);
  return v.toLowerCase();
}

function micro(v, name, { min = 0n } = {}) {
  let m;
  try {
    m = parseMicro(v);
  } catch {
    fail(`${name} must be a decimal string with at most 6 decimals (got ${JSON.stringify(v)})`);
  }
  if (m < min) fail(`${name} must be at least ${min} micro-USDC`);
  return m;
}

function int(v, name, lo, hi) {
  if (!Number.isSafeInteger(v) || v < lo || v > hi) fail(`${name} must be an integer ${lo}…${hi}`);
  return v;
}

function day(v, name) {
  if (typeof v !== 'string' || !DAY.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) fail(`${name} must be YYYY-MM-DD`);
  return v;
}

function obj(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${name} must be an object`);
  return v;
}

/** sha256 hex of canonical(policy), the policy object exactly as written (raw strings). */
export const policyHashOf = (policy) => createHash('sha256').update(canonical(policy)).digest('hex');

/** Validate a parsed sponsor.json; returns the normalized sponsor (addresses lowercase, amounts micro bigint). */
export function validateSponsor(raw) {
  obj(raw, 'the file');
  if (raw.schema !== SPONSOR_SCHEMA) fail(`schema must be exactly ${SPONSOR_SCHEMA}`);

  const s = obj(raw.sponsor, 'sponsor');
  if (typeof s.id !== 'string' || !/^[a-z0-9-]{1,24}$/.test(s.id)) fail('sponsor.id must match ^[a-z0-9-]{1,24}$ (it goes into the memo)');
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) fail('sponsor.name must be non-empty, at most 80 characters');
  if (typeof s.relatedParty !== 'boolean') fail('sponsor.relatedParty must be true or false');
  if (s.relatedParty && (typeof s.relation !== 'string' || !s.relation.trim())) fail('sponsor.relation is required when relatedParty is true');
  const rp = relatedPartyProblem(s);
  if (rp) fail(rp);
  const sponsor = { id: s.id, name: s.name, relatedParty: s.relatedParty, relation: s.relation || null };
  sponsor.label = sponsorLabel(sponsor);

  if (!SPONSOR_CHAIN_IDS.includes(raw.chainId)) fail(`chainId must be one of ${SPONSOR_CHAIN_IDS.join(', ')}`);
  const sp = obj(raw.spender, 'spender');
  if (sp.deployBlock !== null && (!Number.isSafeInteger(sp.deployBlock) || sp.deployBlock < 0)) fail('spender.deployBlock must be a block number or null');
  const spender = {
    address: addr(sp.address, 'spender.address', { nullable: true }),
    deployBlock: sp.deployBlock,
    owner: addr(sp.owner, 'spender.owner', { nullable: true }),
    agent: addr(sp.agent, 'spender.agent', { nullable: true }),
  };
  const split = addr(raw.split, 'split');
  const router = addr(raw.router, 'router', { nullable: true });
  const sh = obj(raw.shelter, 'shelter');
  if (typeof sh.name !== 'string' || !sh.name.trim()) fail('shelter.name must be non-empty');
  if (!CUSTODY.includes(sh.custody)) fail(`shelter.custody must be ${CUSTODY.join(' or ')}`);
  const shelter = { name: sh.name, wallet: addr(sh.wallet, 'shelter.wallet'), custody: sh.custody };

  const p = obj(raw.policy, 'policy');
  if (!Number.isSafeInteger(p.ratioBps) || p.ratioBps < 1 || p.ratioBps > 10000) fail('policy.ratioBps must be an integer 1…10000 (no more than 1:1)');
  const budgetMicro = micro(p.budgetUsdc, 'policy.budgetUsdc', { min: 1n });
  const perGiftMaxMicro = micro(p.perGiftMaxUsdc, 'policy.perGiftMaxUsdc', { min: 1n });
  if (perGiftMaxMicro > budgetMicro) fail('policy.perGiftMaxUsdc must not exceed policy.budgetUsdc');
  const perDonorDailyMaxMicro = micro(p.perDonorDailyMaxUsdc, 'policy.perDonorDailyMaxUsdc', { min: 1n });
  const minGiftMicro = micro(p.minGiftUsdc, 'policy.minGiftUsdc', { min: 1n });
  const maxGiftAgeHours = int(p.maxGiftAgeHours, 'policy.maxGiftAgeHours', 1, 168);
  if (typeof p.validFrom !== 'string' || Number.isNaN(Date.parse(p.validFrom))) fail('policy.validFrom must be an ISO date-time');

  const e = obj(p.eligible, 'policy.eligible');
  if (!Array.isArray(e.chains) || !e.chains.length || !e.chains.every((c) => SPONSOR_CHAIN_IDS.includes(c))) fail('policy.eligible.chains must list sponsor chain ids');
  if (!e.chains.includes(raw.chainId)) fail(`policy.eligible.chains must include chainId ${raw.chainId}`);
  if (!Array.isArray(e.kinds) || !e.kinds.every((k) => GIFT_KINDS.includes(k)) || new Set(e.kinds).size !== e.kinds.length) {
    fail(`policy.eligible.kinds must be a subset of ${GIFT_KINDS.join(', ')} (router-flush is never eligible: its donor is unknown)`);
  }
  let senders = 'any';
  if (e.senders !== 'any') {
    if (!Array.isArray(e.senders) || !e.senders.length) fail('policy.eligible.senders must be "any" or a non-empty address list');
    senders = new Set(e.senders.map((a, i) => addr(a, `policy.eligible.senders[${i}]`)));
  }
  if (typeof e.matchTreats !== 'boolean') fail('policy.eligible.matchTreats must be true or false');
  const treatsDailyMaxMicro = micro(e.treatsDailyMaxUsdc, 'policy.eligible.treatsDailyMaxUsdc');
  if (e.matchTreats && treatsDailyMaxMicro === 0n) fail('policy.eligible.treatsDailyMaxUsdc must be > 0 when matchTreats is true');

  if (!Array.isArray(p.excludedSenders)) fail('policy.excludedSenders must be an address list');
  const excludedSenders = new Set(p.excludedSenders.map((a, i) => addr(a, `policy.excludedSenders[${i}]`)));

  const f = obj(p.farming, 'policy.farming');
  const maxGiftsPerDonorDay = int(f.maxGiftsPerDonorDay, 'policy.farming.maxGiftsPerDonorDay', 1, 1000);
  const pc = obj(p.pace, 'policy.pace');
  const from = day(pc.from, 'policy.pace.from');
  const to = day(pc.to, 'policy.pace.to');
  if (!(from < to)) fail('policy.pace.from must be before policy.pace.to');
  const floatLowMicro = micro(pc.floatLowUsdc, 'policy.pace.floatLowUsdc');
  const r = obj(p.refund, 'policy.refund');
  const after = day(r.after, 'policy.refund.after');
  if (r.to !== 'owner') fail('policy.refund.to must be exactly "owner" (CappedSpender.withdraw pays only the owner)');
  const plannedTtlMinutes = int(p.plannedTtlMinutes, 'policy.plannedTtlMinutes', 1, 1440);

  return {
    schema: SPONSOR_SCHEMA,
    sponsor,
    chainId: raw.chainId,
    spender,
    split,
    router,
    shelter,
    policyRaw: p,
    policy: {
      ratioBps: p.ratioBps,
      perGiftMaxMicro,
      perDonorDailyMaxMicro,
      budgetMicro,
      minGiftMicro,
      maxGiftAgeHours,
      validFromMs: Date.parse(p.validFrom),
      eligible: { chains: [...e.chains], kinds: new Set(e.kinds), senders, matchTreats: e.matchTreats, treatsDailyMaxMicro },
      excludedSenders,
      farming: { maxGiftsPerDonorDay },
      pace: { from, to, floatLowMicro },
      refund: { after, to: 'owner' },
      plannedTtlMinutes,
    },
  };
}

/** Read, parse and validate sponsor.json. Returns { sponsor, policyHash }. */
export async function loadSponsor(file) {
  let raw;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    throw new PolicyError(`sponsor.json: cannot read ${path_(file)}: ${e.message}`);
  }
  const sponsor = validateSponsor(raw);
  return { sponsor, policyHash: policyHashOf(raw.policy) };
}

const path_ = (f) => String(f).split('/').slice(-1)[0];
