// decide: ask Claude whether and how much of Token Tails' own float to give right now.
// Raw HTTP to the Claude Messages API via fetch (this package has no dependencies by design).
// The model proposes; this file validates strictly; the contract (CappedSpender) has the last word.

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
  const body = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: SYSTEM,
    tools: TOOLS,
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: user }],
  };
  if (useFallback()) body.fallbacks = 'default';
  return body;
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
  if (!apiKey) throw new DecisionError('ANTHROPIC_API_KEY is not set (or use TREAT_AGENT_FAKE_LLM=1 for the offline stub)');
  const body = buildRequest(obs, { demoOvercap });
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
  if (msg.stop_reason === 'refusal') {
    return { decision: { action: 'hold', rationale: 'The model declined this round; holding.' }, meta };
  }
  if (msg.stop_reason === 'max_tokens') throw new DecisionError('model hit max_tokens before deciding');
  const toolUses = (msg.content || []).filter((b) => b.type === 'tool_use');
  if (toolUses.length !== 1) throw new DecisionError(`expected exactly one tool call, got ${toolUses.length}`);
  return { decision: validateDecision(toolUses[0], obs, { demoOvercap }), meta };
}
