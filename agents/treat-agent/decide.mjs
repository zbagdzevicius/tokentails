// decide: ask Claude whether and how much of Token Tails' own float to give right now.
// Raw HTTP to the Claude Messages API via fetch (this package has no dependencies by design).
// The model proposes; this file validates strictly; the contract (CappedSpender) has the last word.
// Two modes: the treat agent (give_treat / hold) and the sponsor match desk (match_gift / hold / flag /
// propose_refund, with the amount checker in lib/checker.mjs).

import { expectedMatch, checkProposal, theRule, donorKeyOf } from './lib/checker.mjs';
import { formatMicro } from './lib/abi.mjs';

export const MODEL = process.env.TREAT_AGENT_MODEL || 'claude-opus-5-5';
export const API_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';
// Server-side refusal fallback, "default" form: Anthropic routes a declined request to a fallback model.
// TREAT_AGENT_NO_FALLBACK=1 drops the beta header and the `fallbacks` field (if the API ever rejects them).
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const useFallback = () => process.env.TREAT_AGENT_NO_FALLBACK !== '1';
// Demo rounds may pass an over-cap amount to the contract, but never more than this many per-gift caps.
export const DEMO_MAX_CAPS = 10;

export const MEMO_SUFFIX_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_RATIONALE = 600;

export const TOOLS = [
  {
    name: 'give_treat',
    description:
      "Give part of Token Tails' own treat float to the shelter through the CappedSpender contract. " +
      'Use it to match a fresh public gift or to keep the campaign on pace. amount_usdc is in USDC ' +
      '(at most 6 decimals) and must not exceed remaining_today_usdc or per_gift_cap_usdc. memo_suffix is ' +
      'lowercase letters, digits and dashes, at most 40 characters; for a match use match-<txPrefix> ' +
      'with the 8-hex txPrefix of the gift you match. rationale is one or two plain sentences.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        amount_usdc: { type: 'number' },
        memo_suffix: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['amount_usdc', 'memo_suffix', 'rationale'],
      additionalProperties: false,
    },
  },
  {
    name: 'hold',
    description: 'Give nothing this round. rationale is one or two plain sentences on why.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { rationale: { type: 'string' } },
      required: ['rationale'],
      additionalProperties: false,
    },
  },
];

export const SYSTEM = [
  "You decide small gifts from Token Tails' own treat float to an animal shelter. The money is Token Tails' own,",
  'never donor money. A smart contract (CappedSpender) enforces a per-gift cap and a per-day cap and pays',
  'only the shelter wallets registered on the split; anything above the caps is refused on-chain, so stay inside them.',
  '',
  'Each round you get an observation as JSON. Call exactly one tool: give_treat or hold.',
  'Policy:',
  '1. Prefer matching fresh public gifts 1:1: pick an unmatched public gift and give the same amount, capped by',
  '   per_gift_cap_usdc and remaining_today_usdc. Use memo_suffix match-<txPrefix>. Never match a gift twice.',
  "2. Otherwise pace toward the campaign goal: about needed_per_day_usdc a day, spread over the day's rounds,",
  '   never more than remaining_today_usdc. If the float is low, give less so it lasts.',
  '3. Hold when remaining_today_usdc is 0, the split is paused, or a gift would add nothing useful.',
  '4. Never exceed remaining_today_usdc or per_gift_cap_usdc.',
  '5. A needs list flagged demo:true is an example, not the shelter\'s real needs: never claim otherwise.',
  'Explain your reason in rationale, in plain words a donor could read.',
].join('\n');

/** The compact facts the model sees (snake_case, numbers in USDC). */
export function promptFacts(obs) {
  return {
    chain_id: obs.chainId,
    test_money: obs.campaign && !obs.campaign.sameChain,
    per_gift_cap_usdc: obs.spender.perTxCapUsdc,
    daily_cap_usdc: obs.spender.dailyCapUsdc,
    spent_today_usdc: obs.spender.spentTodayUsdc,
    remaining_today_usdc: obs.spender.remainingTodayUsdc,
    float_usdc: obs.spender.floatUsdc,
    split_paused: obs.split.paused,
    last_24h: {
      public_gifts_usdc: obs.last24h.publicGiftsUsdc,
      token_tails_usdc: obs.last24h.tokenTailsUsdc,
      unmatched_public_gifts: obs.last24h.unmatchedPublicGifts.slice(0, 20).map((g) => ({
        tx_prefix: g.txPrefix, amount_usdc: g.amountUsdc, kind: g.kind,
      })),
    },
    campaign: {
      name: obs.campaign.name,
      goal_usdc: obs.campaign.goalUsdc,
      end_date: obs.campaign.endDate,
      days_left: obs.campaign.daysLeft,
      needed_per_day_usdc: obs.campaign.neededPerDayUsdc,
      shelter: obs.campaign.shelter?.name,
      note: obs.campaign.note,
    },
    needs: obs.needs,
  };
}

export function buildRequest(obs, { demoOvercap = false } = {}) {
  const facts = promptFacts(obs);
  let user = 'Observation:\n' + JSON.stringify(facts, null, 2) + '\n\nDecide now: call give_treat or hold.';
  if (demoOvercap) {
    user +=
      '\n\nDEMONSTRATION ROUND: we are filming how the contract refuses an over-cap gift. For this round only,' +
      ` call give_treat with amount_usdc ${round6(facts.per_gift_cap_usdc * 2)} (twice the per-gift cap) and` +
      ' memo_suffix demo-overcap, and say in rationale that this is a deliberate test of the on-chain cap.';
  }
  return baseBody(SYSTEM, TOOLS, user);
}

export class DecisionError extends Error {}
/** The Messages API itself failed (non-2xx): not a model decision, so `--once` exits non-zero. */
export class ApiError extends DecisionError {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Strict validation of the model's tool call, then bounds:
 * - unknown tool, extra or missing keys, wrong types, bad memo suffix, empty rationale -> DecisionError;
 * - amount above min(remaining today, per-gift cap, float) is CLAMPED (and flagged), unless demoOvercap,
 *   where the over-cap proposal passes through so the contract's refusal can be shown;
 * - a clamp to zero becomes a hold.
 */
export function validateDecision(toolUse, obs, { demoOvercap = false } = {}) {
  if (!toolUse || toolUse.type !== 'tool_use') throw new DecisionError('model did not call a tool');
  const input = toolUse.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DecisionError('tool input is not an object');
  const rationale = input.rationale;
  if (typeof rationale !== 'string' || !rationale.trim()) throw new DecisionError('rationale missing');
  const why = rationale.trim().slice(0, MAX_RATIONALE);

  if (toolUse.name === 'hold') {
    expectKeys(input, ['rationale']);
    return { action: 'hold', rationale: why };
  }
  if (toolUse.name !== 'give_treat') throw new DecisionError(`unknown tool ${toolUse.name}`);
  expectKeys(input, ['amount_usdc', 'memo_suffix', 'rationale']);
  const amount = input.amount_usdc;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new DecisionError('amount_usdc must be a positive number');
  }
  if (typeof input.memo_suffix !== 'string' || !MEMO_SUFFIX_RE.test(input.memo_suffix)) {
    throw new DecisionError('memo_suffix must be lowercase letters, digits and dashes (max 40)');
  }
  const proposed = round6(amount);
  if (proposed <= 0) throw new DecisionError('amount_usdc rounds to zero');

  const s = obs.spender;
  const limit = round6(Math.min(s.remainingTodayUsdc, s.perTxCapUsdc, s.floatUsdc));
  let final = proposed;
  let clamped = false;
  if (!demoOvercap && proposed > limit) {
    final = limit;
    clamped = true;
  }
  const demoMax = round6(s.perTxCapUsdc * DEMO_MAX_CAPS);
  if (demoOvercap && proposed > demoMax) {
    // Keeps the demo amount a plain decimal (no 1e+21 notation) while still far over the cap.
    final = demoMax;
    clamped = true;
  }
  if (final <= 0) {
    return { action: 'hold', rationale: `${why} (Held: nothing left to give within today's cap.)`, proposedUsdc: proposed, clamped };
  }
  return {
    action: 'give',
    amountUsdc: final,
    proposedUsdc: proposed,
    clamped,
    memo: 'tt:agent:' + input.memo_suffix,
    rationale: why,
    overCap: proposed > s.perTxCapUsdc || proposed > s.remainingTodayUsdc,
  };
}

function expectKeys(obj, keys) {
  const got = Object.keys(obj).sort().join(',');
  const want = [...keys].sort().join(',');
  if (got !== want) throw new DecisionError(`tool input keys ${got} != ${want}`);
}

export const round6 = (x) => Math.round(x * 1e6) / 1e6;

/** Calls the Messages API and returns a validated decision plus request metadata for the log. */
export async function decide(obs, { fetchImpl = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY, demoOvercap = false } = {}) {
  const { msg, meta, toolUse } = await callMessages(buildRequest(obs, { demoOvercap }), { fetchImpl, apiKey });
  if (msg.stop_reason === 'refusal') {
    return { decision: { action: 'hold', rationale: 'The model declined this round; holding.' }, meta };
  }
  return { decision: validateDecision(toolUse, obs, { demoOvercap }), meta };
}

/** One Messages API call; returns the message, log metadata and its single tool_use block (none on refusal). */
async function callMessages(body, { fetchImpl, apiKey }) {
  if (!apiKey) throw new DecisionError('ANTHROPIC_API_KEY is not set (or use TREAT_AGENT_FAKE_LLM=1 for the offline stub)');
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (body.fallbacks) headers['anthropic-beta'] = FALLBACK_BETA;
  const res = await fetchImpl(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(`Messages API HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  const msg = await res.json();
  const meta = { model: msg.model || body.model, stopReason: msg.stop_reason, id: msg.id };
  if (msg.stop_reason === 'refusal') return { msg, meta, toolUse: null };
  if (msg.stop_reason === 'max_tokens') throw new DecisionError('model hit max_tokens before deciding');
  const toolUses = (msg.content || []).filter((b) => b.type === 'tool_use');
  if (toolUses.length !== 1) throw new DecisionError(`expected exactly one tool call, got ${toolUses.length}`);
  return { msg, meta, toolUse: toolUses[0] };
}

function baseBody(system, tools, user) {
  const body = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system,
    tools,
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: user }],
  };
  if (useFallback()) body.fallbacks = 'default';
  return body;
}

// ================================================================== match desk (MATCH-DESK.md, "Decide")

const strictTool = (name, description, properties) => ({
  name,
  description,
  strict: true,
  input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
});
const RATIONALE = { type: 'string' };
const GIFT_IDS = { type: 'array', items: { type: 'string' } };

export const TOOLS_MATCH = [
  strictTool(
    'match_gift',
    "Match one or more eligible public gifts from the sponsor's vault. gift_ids: 1 to 10 distinct gift_id values from " +
      'eligible_gifts. amount_usdc: a decimal string with at most 6 decimals that equals the_rule exactly (code recomputes it ' +
      'and rejects any other amount; nothing is sent then). rationale: one or two plain sentences a donor could read.',
    { gift_ids: GIFT_IDS, amount_usdc: { type: 'string' }, rationale: RATIONALE },
  ),
  strictTool('hold', 'Match nothing this round. rationale: one or two plain sentences on why.', { rationale: RATIONALE }),
  strictTool(
    'flag',
    'Tell the sponsor about something; no money moves. kind farming: gift_ids lists the eligible gifts that look like ' +
      'farming (required, they are then excluded until a human clears them). kind pace or float_low: gift_ids may be empty.',
    { kind: { type: 'string', enum: ['farming', 'pace', 'float_low'] }, gift_ids: GIFT_IDS, rationale: RATIONALE },
  ),
  strictTool(
    'propose_refund',
    'Propose that the owner (the sponsor) withdraws the unused float to itself. Only when refund_allowed is true. ' +
      'The agent never sends it; the owner runs the printed command.',
    { rationale: RATIONALE },
  ),
];

export const SYSTEM_MATCH = [
  "You run a sponsor's match desk for an animal shelter. A sponsor put USDC into a CappedSpender vault on Arc; you decide",
  'which fresh public gifts to the shelter it matches. The money is the sponsor\'s, never a donor\'s.',
  'The sponsor may be a related party (see sponsor_label): describe it exactly with that label, never as independent.',
  '',
  'Each round you get an observation as JSON. Call exactly one tool: match_gift, hold, flag or propose_refund.',
  'Rules:',
  '1. Only gifts listed in eligible_gifts can be matched. Prefer the newest; one gift alone is usually best.',
  '2. amount_usdc must follow the_rule exactly. For a single gift it is that gift\'s match_if_alone_usdc. Code recomputes',
  '   the amount and rejects anything else, so never round, guess or add.',
  '3. If farming_signals lists gifts (many tiny gifts from one donor in a day), flag them as farming instead of matching them.',
  '4. Flag pace when pace.status is ahead or behind in a way the sponsor should know; flag float_low when float_low is true',
  '   and nothing else needs doing.',
  '5. propose_refund only when refund_allowed is true and the campaign is over.',
  '6. Otherwise hold. Code, not you, enforces the per-donor limit; the contract enforces the per-gift and daily caps.',
  'Explain your reason in rationale, in plain words a donor could read.',
].join('\n');

const usd = (m) => formatMicro(m);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);

/** The compact facts the model sees (snake_case, decimal-string USDC). */
export function promptFactsMatch(obs) {
  const md = obs.matchDesk;
  const now = Date.parse(obs.at);
  const p = md.policy;
  const eligible = md.gifts.filter((g) => g.status === 'eligible').slice(0, 20);
  return {
    chain_id: md.chainId,
    network: md.network,
    sponsor_label: `${md.sponsor.name}, ${md.sponsor.label}`,
    ratio: p.ratioBps === 10000 ? '1:1' : `${p.ratioBps / 10000}:1`,
    per_gift_max_usdc: usd(p.perGiftMaxMicro),
    per_donor_daily_max_usdc: usd(p.perDonorDailyMaxMicro),
    budget_left_usdc: usd(md.budget.leftMicro),
    per_tx_cap_usdc: usd(md.caps.perTxMicro),
    remaining_today_usdc: usd(md.caps.remainingTodayMicro),
    float_usdc: usd(md.caps.floatMicro),
    float_low: md.floatLow,
    pace: {
      from: md.pace.from, to: md.pace.to, days_left: md.pace.daysLeft, status: md.pace.status,
      target_per_day_usdc: usd(md.pace.targetPerDayMicro), matched_today_usdc: usd(md.pace.matchedTodayMicro),
    },
    refund_allowed: md.refundAllowed,
    eligible_gifts: eligible.map((g) => {
      const alone = expectedMatch([g.id], md);
      const key = donorKeyOf(g);
      const cap = key === 'treats' ? p.treatsDailyMaxMicro : p.perDonorDailyMaxMicro;
      const used = BigInt(md.donorUsedMicro[`${key}|${g.day}`] || 0n);
      return {
        gift_id: g.id,
        donor_short: g.kind === 'treat' ? 'treats' : short(g.donor),
        kind: g.kind,
        gift_usdc: usd(g.giftMicro),
        donor_room_usdc: usd(cap > used ? cap - used : 0n),
        match_if_alone_usdc: alone.ok ? usd(alone.amountMicro) : '0',
        age_minutes: Math.max(0, Math.floor((now - g.ts * 1000) / 60_000)),
      };
    }),
    farming_signals: md.farmingSignals.map((f) => ({
      donor_short: short(f.donor), day: f.day, gifts: f.gifts, total_usdc: usd(f.totalMicro), reason: f.reason, gift_ids: f.giftIds,
    })),
    the_rule: theRule(md),
  };
}

export function buildRequestMatch(obs) {
  const facts = promptFactsMatch(obs);
  const user = 'Observation:\n' + JSON.stringify(facts, null, 2) + '\n\nDecide now: call match_gift, hold, flag or propose_refund.';
  return baseBody(SYSTEM_MATCH, TOOLS_MATCH, user);
}

/** Holds that need no model call (and no API cost). Returns the reason, or null. */
export function matchCodeHold(obs) {
  const md = obs.matchDesk;
  if (md.backend.splitMismatch) return 'the backend names a different ShelterSplit for this chain than sponsor.json (hard stop)';
  const orphan = (md.witness?.orphans || []).find((o) => !o.acked);
  if (orphan) {
    return `an AgentGift with our memo ${orphan.memo} (tx ${orphan.tx}) has no local receipt, so the gifts it matched are unknown `
      + 'and a retry could match them twice. Run from the state dir that made it (MATCH_DESK_DIR), or, once you have checked '
      + `that tx, acknowledge it with --ack-orphan ${orphan.tx}`;
  }
  if (md.split.paused) return 'the split is paused';
  if (md.caps.remainingTodayMicro === 0n) return "today's on-chain cap is used up (it resets at 00:00 UTC)";
  if (md.caps.floatMicro === 0n) return 'the vault float is empty';
  if (md.budget.leftMicro === 0n) return "the sponsor's budget is used up";
  if (!md.gifts.some((g) => g.status === 'eligible') && !md.refundAllowed && !md.floatLow) return 'no eligible gift to match';
  return null;
}

const strArray = (v, name) => {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new DecisionError(`${name} must be an array of strings`);
  return v;
};

/**
 * Strict validation of a match-desk tool call, then the amount checker.
 * Format problems throw DecisionError (run.mjs holds with meta.rejected). A checker disagreement is a hold
 * with rejected: true and checker { ok: false, expectedMicro, proposedMicro } - the amount is never corrected.
 */
export function validateMatchDecision(toolUse, obs) {
  if (!toolUse || toolUse.type !== 'tool_use') throw new DecisionError('model did not call a tool');
  const input = toolUse.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DecisionError('tool input is not an object');
  if (typeof input.rationale !== 'string' || !input.rationale.trim()) throw new DecisionError('rationale missing');
  const why = input.rationale.trim().slice(0, MAX_RATIONALE);
  const md = obs.matchDesk;

  switch (toolUse.name) {
    case 'hold':
      expectKeys(input, ['rationale']);
      return { action: 'hold', rationale: why };
    case 'propose_refund':
      expectKeys(input, ['rationale']);
      if (!md.refundAllowed) throw new DecisionError('propose_refund before policy.refund.after');
      return { action: 'propose_refund', rationale: why };
    case 'flag': {
      expectKeys(input, ['kind', 'gift_ids', 'rationale']);
      if (!['farming', 'pace', 'float_low'].includes(input.kind)) throw new DecisionError('flag kind must be farming, pace or float_low');
      const ids = strArray(input.gift_ids, 'gift_ids');
      if (input.kind === 'farming') {
        if (!ids.length) throw new DecisionError('flag farming needs gift_ids');
        for (const id of ids) {
          const g = md.gifts.find((x) => x.id === id);
          if (!g || g.status !== 'eligible') throw new DecisionError(`flag farming: ${id} is not an eligible gift`);
        }
      }
      return { action: 'flag', kind: input.kind, giftIds: [...new Set(ids)], rationale: why };
    }
    case 'match_gift': {
      expectKeys(input, ['gift_ids', 'amount_usdc', 'rationale']);
      const ids = strArray(input.gift_ids, 'gift_ids');
      if (typeof input.amount_usdc !== 'string') throw new DecisionError('amount_usdc must be a decimal string');
      const check = expectedMatch(ids, md);
      if (!check.ok) {
        return {
          action: 'hold', rejected: true, modelRationale: why, proposedUsdc: input.amount_usdc,
          rationale: `Checker rejected: ${check.reason}`,
          checker: { ok: false, reason: check.reason, expectedMicro: null, proposedMicro: null },
        };
      }
      const cmp = checkProposal(input.amount_usdc, check.amountMicro);
      if (!cmp.ok) {
        return {
          action: 'hold', rejected: true, modelRationale: why, proposedUsdc: input.amount_usdc,
          rationale: `Checker rejected: model proposed ${input.amount_usdc} USDC, policy gives ${usd(check.amountMicro)} USDC for ${ids.join(', ')}`,
          checker: cmp,
        };
      }
      return {
        action: 'match', giftIds: ids, amountMicro: check.amountMicro, amountUsdc: usd(check.amountMicro),
        proposedUsdc: input.amount_usdc, check, checker: cmp, rationale: why,
      };
    }
    default:
      throw new DecisionError(`unknown tool ${toolUse.name}`);
  }
}

/** Calls the Messages API in match-desk mode and returns a checked decision plus metadata. */
export async function decideMatch(obs, { fetchImpl = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  const { msg, meta, toolUse } = await callMessages(buildRequestMatch(obs), { fetchImpl, apiKey });
  if (msg.stop_reason === 'refusal') return { decision: { action: 'hold', rationale: 'The model declined this round; holding.' }, meta };
  return { decision: validateMatchDecision(toolUse, obs), meta };
}
