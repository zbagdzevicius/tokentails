// Match desk policy files: strict validation.
// - desk.json (schema tt.match-desk.desk/v2): several sponsors, one CappedSpender vault each, one agent.
// - sponsor.json (schema tt.match-desk.sponsor/v1): the old one-sponsor file, normalised into a one-sponsor desk.
// Every amount is a decimal string parsed to micro-USDC bigint; floats never carry money.
// Any failure throws PolicyError, and run.mjs exits 2. See MATCH-DESK.md, "desk.json".

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonical } from '../log.mjs';
import { parseMicro } from './abi.mjs';

export const SPONSOR_SCHEMA = 'tt.match-desk.sponsor/v1';
/** Arc mainnet, Arc testnet, and a plain local anvil (31337, never a live chain). */
export const SPONSOR_CHAIN_IDS = Object.freeze([5042, 5042002, 31337]);
/** Gift kinds a sponsor may match. router-flush is never eligible: whoever flushes first sets its memo, so its donor is unknown. */
export const GIFT_KINDS = Object.freeze(['public', 'x402', 'router-native', 'router-authorization']);
/** pink-paw-wallet: the shelter's wallet since 2026-10-16 (Token Tails keeps a recovery backup). The other two stay for old desk files and fixtures. */
export const CUSTODY = Object.freeze(['held-by-token-tails', 'held-by-shelter', 'pink-paw-wallet']);

export const LABEL_RELATED = "related-party sponsor (founder's company)";
export const LABEL_SELF = 'self-sponsor (Token Tails founder)';
export const LABEL_PLAIN = 'sponsor';
export const LABEL_OPERATOR = "operator's own money";
export const DESK_SCHEMA = 'tt.match-desk.desk/v2';
/** At most this many sponsors (vaults) on one desk: observe reads every vault each round. */
export const MAX_SPONSORS = 8;

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
  // Token Tails putting in its own money (the operator): never a plain or outside sponsor either.
  if (s?.relatedParty && (s?.id === 'tokentails' || /^operator\b/i.test(rel))) return LABEL_OPERATOR;
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
  const tt = s?.id === 'tokentails' || /token\s*tails/i.test(String(s?.name || ''));
  if (tt && s?.relatedParty !== true) {
    return "Token Tails is the operator: its own money must be relatedParty true (label: operator's own money)";
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

// ================================================================== desk.json (tt.match-desk.desk/v2)

/** Desk-wide policy keys (shared by every sponsor) and per-sponsor keys. */
export const DESK_POLICY_KEYS = Object.freeze([
  'perDonorDailyMaxUsdc', 'minGiftUsdc', 'maxGiftAgeHours', 'eligible', 'excludedSenders', 'farming', 'plannedTtlMinutes',
]);
export const SPONSOR_POLICY_KEYS = Object.freeze(['ratioBps', 'perGiftMaxUsdc', 'budgetUsdc', 'validFrom', 'pace', 'refund']);

/**
 * The policy hash a desk sponsor's receipts carry: sha256 hex of canonical({ policy, sponsor }), where
 * `policy` is the desk's shared policy object and `sponsor` that sponsor's entry, both exactly as written
 * (raw strings), without the operational `paused` switch (pausing a sponsor for a round is not a policy
 * change). Another sponsor's entry never changes it. A v1 sponsor.json keeps policyHashOf(policy).
 */
export function deskPolicyHashOf(sharedPolicy, entry) {
  const { paused: _paused, ...terms } = entry || {};
  return createHash('sha256').update(canonical({ policy: sharedPolicy, sponsor: terms })).digest('hex');
}

/** Allocation order: the highest priority first, then the lowest id. */
export const byPriority = (a, b) => b.priority - a.priority || (a.sponsor.id < b.sponsor.id ? -1 : a.sponsor.id > b.sponsor.id ? 1 : 0);

const deskFail = (msg) => {
  throw new PolicyError(`desk.json: ${msg}`);
};

/**
 * Normalise a validated v1 sponsor (validateSponsor) into a one-sponsor desk. Its policy hash stays
 * policyHashOf(policy), so receipts and memos written before the desk existed keep their hashes.
 */
export function deskFromSponsor(sponsor, policyHash = sponsor.policyRaw ? policyHashOf(sponsor.policyRaw) : null) {
  const vault = { ...sponsor, priority: 0, paused: false, policyHash };
  return {
    schema: sponsor.schema,
    v1: true,
    chainId: sponsor.chainId,
    split: sponsor.split,
    router: sponsor.router,
    shelter: sponsor.shelter,
    agent: sponsor.spender.agent,
    policy: sponsor.policy,
    sponsors: [vault],
  };
}

/**
 * Validate a parsed desk.json; returns the normalised desk:
 * { schema, v1: false, chainId, split, router, shelter, agent, policy (shared, normalised), policyRaw,
 *   sponsors: [vault] in allocation order }. Each vault has the v1 sponsor shape (sponsor, chainId,
 * spender {address, deployBlock, owner, agent}, split, router, shelter, policy with every field) plus
 * priority, paused and policyHash, so the per-vault code paths stay the same.
 */
export function validateDesk(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) deskFail('the file must be an object');
  if (raw.schema !== DESK_SCHEMA) deskFail(`schema must be exactly ${DESK_SCHEMA} (or ${SPONSOR_SCHEMA} for a one-sponsor file)`);
  const shared = raw.policy;
  if (!shared || typeof shared !== 'object' || Array.isArray(shared)) deskFail('policy must be an object');
  for (const k of SPONSOR_POLICY_KEYS) if (Object.hasOwn(shared, k)) deskFail(`policy.${k} is per sponsor: move it into each sponsors[] entry`);
  if (raw.agent !== null && (typeof raw.agent !== 'string' || !ADDR.test(raw.agent))) deskFail('agent must be a 0x address or null (one agent for every vault)');
  const agent = raw.agent ? raw.agent.toLowerCase() : null;
  if (!Array.isArray(raw.sponsors) || raw.sponsors.length < 1 || raw.sponsors.length > MAX_SPONSORS) deskFail(`sponsors must list 1…${MAX_SPONSORS} sponsors`);

  const vaults = raw.sponsors.map((e, i) => {
    const where = `sponsors[${i}]${e && typeof e.id === 'string' ? ` (${e.id})` : ''}`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) deskFail(`${where} must be an object`);
    const sp = e.spender;
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) deskFail(`${where}.spender must be an object`);
    if (Object.hasOwn(sp, 'agent')) deskFail(`${where}.spender.agent: the agent is desk-wide (top-level "agent")`);
    if (!Number.isSafeInteger(e.priority) || e.priority < 0 || e.priority > 1000) deskFail(`${where}.priority must be an integer 0…1000 (higher is matched first)`);
    if (e.paused !== undefined && typeof e.paused !== 'boolean') deskFail(`${where}.paused must be true or false`);
    // Reuse the v1 validator: one sponsor's view of the desk is exactly a v1 sponsor.json.
    const v1 = {
      schema: SPONSOR_SCHEMA,
      sponsor: { id: e.id, name: e.name, relatedParty: e.relatedParty, ...(e.relation !== undefined ? { relation: e.relation } : {}) },
      chainId: raw.chainId,
      spender: { address: sp.address ?? null, deployBlock: sp.deployBlock ?? null, owner: sp.owner ?? null, agent },
      split: raw.split,
      router: raw.router,
      shelter: raw.shelter,
      policy: { ...shared, ...Object.fromEntries(SPONSOR_POLICY_KEYS.map((k) => [k, e[k]])) },
    };
    let vault;
    try {
      vault = validateSponsor(v1);
    } catch (err) {
      if (!(err instanceof PolicyError)) throw err;
      deskFail(`${where}: ${err.message.replace(/^sponsor\.json: /, '')}`);
    }
    return { ...vault, priority: e.priority, paused: e.paused === true, policyHash: deskPolicyHashOf(shared, e) };
  });

  const ids = new Set();
  const spenders = new Set();
  for (const v of vaults) {
    if (ids.has(v.sponsor.id)) deskFail(`sponsor id ${v.sponsor.id} is listed twice`);
    ids.add(v.sponsor.id);
    const a = v.spender.address;
    if (a) {
      if (spenders.has(a)) deskFail(`vault ${a} is listed for two sponsors (one vault per sponsor)`);
      spenders.add(a);
    }
    if (agent && (v.spender.owner === agent || a === agent)) deskFail(`${v.sponsor.id}: the agent must not be a vault owner or a vault`);
    if (a && v.spender.owner === a) deskFail(`${v.sponsor.id}: a vault cannot own itself`);
  }
  vaults.sort(byPriority);
  const first = vaults[0];
  const validFromMs = Math.min(...vaults.map((v) => v.policy.validFromMs));
  return {
    schema: DESK_SCHEMA,
    v1: false,
    chainId: first.chainId,
    split: first.split,
    router: first.router,
    shelter: first.shelter,
    agent,
    policy: { ...first.policy, validFromMs },
    policyRaw: shared,
    sponsors: vaults,
  };
}

/** Parse either schema into a desk. */
export function deskOf(raw) {
  if (raw && raw.schema === SPONSOR_SCHEMA) {
    const sponsor = validateSponsor(raw);
    return deskFromSponsor(sponsor, policyHashOf(raw.policy));
  }
  return validateDesk(raw);
}

/** Read, parse and validate a desk.json (v2) or a sponsor.json (v1). Returns { desk }. */
export async function loadDesk(file) {
  let raw;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    throw new PolicyError(`desk.json: cannot read ${path_(file)}: ${e.message}`);
  }
  return { desk: deskOf(raw) };
}

/** Every vault address on the desk (lowercase; null while a vault is not deployed). */
export const deskVaults = (desk) => desk.sponsors.map((v) => v.spender.address);

/** The vault (normalised sponsor) with this id, or null. */
export const vaultOf = (desk, id) => desk.sponsors.find((v) => v.sponsor.id === id) || null;
