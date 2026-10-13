// Offline stand-in for the Messages API (TREAT_AGENT_FAKE_LLM=1). It answers with the same response
// shape as the real API, so decide.mjs runs its full parse-and-validate path. The policy is a plain,
// deterministic version of the system prompt: match the oldest unmatched public gift 1:1, otherwise pace
// toward the goal, hold when nothing is left; in a demonstration round it proposes twice the cap.

export function fakePolicy(facts, { demo }) {
  if (demo) {
    const amount = Math.round(facts.per_gift_cap_usdc * 2 * 1e6) / 1e6;
    return tool('give_treat', {
      amount_usdc: amount,
      memo_suffix: 'demo-overcap',
      rationale: 'Deliberate test: proposing twice the per-gift cap to show the contract refusing it.',
    });
  }
  const room = Math.min(facts.remaining_today_usdc, facts.per_gift_cap_usdc, facts.float_usdc);
  if (facts.split_paused || room <= 0) {
    return tool('hold', { rationale: "Nothing to give: today's cap is used up, the float is empty or the split is paused." });
  }
  const gift = facts.last_24h.unmatched_public_gifts[0];
  if (gift) {
    const amount = Math.min(gift.amount_usdc, room);
    return tool('give_treat', {
      amount_usdc: Math.round(amount * 1e6) / 1e6,
      memo_suffix: `match-${gift.tx_prefix}`,
      rationale: `Matching a fresh ${gift.amount_usdc} USDC public gift 1:1, within today's cap.`,
    });
  }
  const pace = facts.campaign.needed_per_day_usdc || room;
  const amount = Math.min(room, Math.max(0.01, Math.round((pace / 4) * 1e6) / 1e6));
  return tool('give_treat', {
    amount_usdc: Math.round(amount * 1e6) / 1e6,
    memo_suffix: 'pace',
    rationale: `No new public gift to match; a small gift keeps ${facts.campaign.name} on pace for its goal.`,
  });
}

/**
 * Match-desk stand-in. Deterministic:
 * - TREAT_AGENT_FAKE_WRONG=1: match the newest eligible gift with match_if_alone + 0.000001 USDC, so the
 *   checker rejection can be shown (tests, fork demo);
 * - else match the newest eligible gift that is not in a farming signal, alone, with match_if_alone_usdc;
 * - else flag farming when a signal lists eligible gifts;
 * - else hold.
 */
export function fakeMatchPolicy(facts, { wrong = false } = {}) {
  const gifts = facts.eligible_gifts.filter((g) => g.match_if_alone_usdc !== '0');
  if (wrong && gifts[0]) {
    const g = gifts[0];
    return tool('match_gift', {
      gift_ids: [g.gift_id],
      amount_usdc: addMicro(g.match_if_alone_usdc, 1n),
      rationale: `Matching a fresh ${g.gift_usdc} USDC gift (deliberately off by 0.000001 USDC to show the checker).`,
    });
  }
  const farmed = new Set(facts.farming_signals.flatMap((f) => f.gift_ids));
  const g = gifts.find((x) => !farmed.has(x.gift_id));
  if (g) {
    return tool('match_gift', {
      gift_ids: [g.gift_id],
      amount_usdc: g.match_if_alone_usdc,
      rationale: `Matching a fresh ${g.gift_usdc} USDC public gift ${facts.ratio}, within the sponsor's limits.`,
    });
  }
  const f = facts.farming_signals.find((x) => x.gift_ids.length);
  if (f) {
    return tool('flag', { kind: 'farming', gift_ids: f.gift_ids, rationale: `Possible farming: ${f.reason} from ${f.donor_short}. Not matching these.` });
  }
  return tool('hold', { rationale: 'No eligible gift to match right now.' });
}

/** "0.02" + 1 micro -> "0.020001" (exact decimal arithmetic). */
function addMicro(usdc, micro) {
  const [w, f = ''] = usdc.split('.');
  const total = BigInt(w) * 1_000_000n + BigInt((f + '000000').slice(0, 6)) + micro;
  const frac = (total % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (total / 1_000_000n).toString() + (frac ? '.' + frac : '');
}

function tool(name, input) {
  return { type: 'tool_use', id: 'toolu_fake', name, input };
}

/** A fetch() that answers Messages API requests locally. */
export const fakeFetch = (url, init) => makeFakeFetch({ wrong: process.env.TREAT_AGENT_FAKE_WRONG === '1' })(url, init);

/** fakeFetch with an explicit match-desk "wrong amount" switch (TREAT_AGENT_FAKE_WRONG). */
export const makeFakeFetch = ({ wrong = false } = {}) => async (_url, init) => {
  const body = JSON.parse(init.body);
  const text = body.messages[0].content;
  const json = text.slice(text.indexOf('{'), text.indexOf('\n\nDecide now'));
  const facts = JSON.parse(json);
  const demo = text.includes('DEMONSTRATION ROUND');
  const block = Array.isArray(facts.eligible_gifts)
    ? fakeMatchPolicy(facts, { wrong })
    : fakePolicy(facts, { demo });
  const msg = { id: 'msg_fake', type: 'message', role: 'assistant', model: 'fake-llm', stop_reason: 'tool_use', content: [block] };
  return { ok: true, status: 200, json: async () => msg, text: async () => JSON.stringify(msg) };
};
