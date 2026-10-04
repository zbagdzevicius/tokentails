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

function tool(name, input) {
  return { type: 'tool_use', id: 'toolu_fake', name, input };
}

/** A fetch() that answers Messages API requests locally. */
export async function fakeFetch(_url, init) {
  const body = JSON.parse(init.body);
  const text = body.messages[0].content;
  const json = text.slice(text.indexOf('{'), text.indexOf('\n\nDecide now'));
  const facts = JSON.parse(json);
  const demo = text.includes('DEMONSTRATION ROUND');
  const block = fakePolicy(facts, { demo });
  const msg = { id: 'msg_fake', type: 'message', role: 'assistant', model: 'fake-llm', stop_reason: 'tool_use', content: [block] };
  return { ok: true, status: 200, json: async () => msg, text: async () => JSON.stringify(msg) };
}
