import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, validateDecision, buildRequest, DecisionError, MODEL } from '../decide.mjs';
import { fakeFetch } from '../lib/fake-llm.mjs';
import { llmReply, obsFixture } from '../test-support/helpers.mjs';

test('valid give_treat passes through with the tt:agent: memo', async () => {
  const { decision, meta } = await decide(obsFixture(), {
    apiKey: 'k',
    fetchImpl: llmReply('give_treat', { amount_usdc: 0.02, memo_suffix: 'match-abcdef01', rationale: 'Matching a fresh gift.' }),
  });
  assert.equal(decision.action, 'give');
  assert.equal(decision.amountUsdc, 0.02);
  assert.equal(decision.memo, 'tt:agent:match-abcdef01');
  assert.equal(decision.clamped, false);
  assert.equal(meta.model, 'claude-opus-5-5');
});

test('request shape: model, adaptive thinking, strict tools, auto tool choice, refusal fallback', async () => {
  await decide(obsFixture(), { apiKey: 'k', fetchImpl: llmReply('hold', { rationale: 'x' }) });
  const body = llmReply.lastBody;
  assert.equal(body.model, MODEL);
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.tool_choice.type, 'auto');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.tools.map((t) => t.name), ['give_treat', 'hold']);
  assert.ok(body.tools.every((t) => t.strict === true && t.input_schema.additionalProperties === false));
  assert.equal(llmReply.lastHeaders['anthropic-version'], '2023-06-01');
  assert.equal(llmReply.lastHeaders['x-api-key'], 'k');
  assert.match(body.messages[0].content, /"remaining_today_usdc": 0.1/);
});

test('hold is accepted', async () => {
  const { decision } = await decide(obsFixture(), { apiKey: 'k', fetchImpl: llmReply('hold', { rationale: 'Budget spent.' }) });
  assert.deepEqual(decision, { action: 'hold', rationale: 'Budget spent.' });
});

test('malformed output is rejected', () => {
  const obs = obsFixture();
  const bad = [
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: '0.02', memo_suffix: 'x', rationale: 'r' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: -1, memo_suffix: 'x', rationale: 'r' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: Number.NaN, memo_suffix: 'x', rationale: 'r' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: 0.01, memo_suffix: 'Bad Memo!', rationale: 'r' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: 0.01, memo_suffix: 'x'.repeat(41), rationale: 'r' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: 0.01, memo_suffix: 'ok', rationale: '' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: 0.01, memo_suffix: 'ok', rationale: 'r', to: '0xdead' } },
    { type: 'tool_use', name: 'give_treat', input: { amount_usdc: 0.0000001, memo_suffix: 'ok', rationale: 'r' } },
    { type: 'tool_use', name: 'send_anywhere', input: { rationale: 'r' } },
    { type: 'tool_use', name: 'hold', input: { rationale: 'r', amount_usdc: 1 } },
    { type: 'text', text: 'I would give 0.02' },
    null,
  ];
  for (const b of bad) assert.throws(() => validateDecision(b, obs), DecisionError, JSON.stringify(b));
});

test('two tool calls, refusal and max_tokens are handled', async () => {
  const two = async () => ({ ok: true, json: async () => ({ stop_reason: 'tool_use', content: [
    { type: 'tool_use', name: 'hold', input: { rationale: 'a' } },
    { type: 'tool_use', name: 'hold', input: { rationale: 'b' } },
  ] }) });
  await assert.rejects(decide(obsFixture(), { apiKey: 'k', fetchImpl: two }), /exactly one tool call/);
  const refusal = async () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) });
  const { decision } = await decide(obsFixture(), { apiKey: 'k', fetchImpl: refusal });
  assert.equal(decision.action, 'hold');
  const cut = async () => ({ ok: true, json: async () => ({ stop_reason: 'max_tokens', content: [] }) });
  await assert.rejects(decide(obsFixture(), { apiKey: 'k', fetchImpl: cut }), /max_tokens/);
  const http = async () => ({ ok: false, status: 529, text: async () => 'overloaded' });
  await assert.rejects(decide(obsFixture(), { apiKey: 'k', fetchImpl: http }), /HTTP 529/);
  await assert.rejects(decide(obsFixture(), { apiKey: '', fetchImpl: http }), /ANTHROPIC_API_KEY/);
});

test('over-cap proposals are clamped to min(remaining today, per-gift cap, float)', () => {
  const tu = (amount) => ({ type: 'tool_use', name: 'give_treat', input: { amount_usdc: amount, memo_suffix: 'pace', rationale: 'r' } });
  let d = validateDecision(tu(0.5), obsFixture());
  assert.equal(d.amountUsdc, 0.05);
  assert.equal(d.proposedUsdc, 0.5);
  assert.equal(d.clamped, true);
  d = validateDecision(tu(0.05), obsFixture({ spender: { remainingTodayUsdc: 0.03 } }));
  assert.equal(d.amountUsdc, 0.03);
  d = validateDecision(tu(0.05), obsFixture({ spender: { floatUsdc: 0.01 } }));
  assert.equal(d.amountUsdc, 0.01);
  d = validateDecision(tu(0.05), obsFixture({ spender: { remainingTodayUsdc: 0 } }));
  assert.equal(d.action, 'hold');
});

test('--demo-overcap lets the over-cap proposal through so the contract can refuse it', () => {
  const tu = { type: 'tool_use', name: 'give_treat', input: { amount_usdc: 0.1, memo_suffix: 'demo-overcap', rationale: 'test' } };
  const d = validateDecision(tu, obsFixture(), { demoOvercap: true });
  assert.equal(d.amountUsdc, 0.1);
  assert.equal(d.clamped, false);
  assert.equal(d.overCap, true);
  assert.match(buildRequest(obsFixture(), { demoOvercap: true }).messages[0].content, /DEMONSTRATION ROUND/);
  assert.doesNotMatch(buildRequest(obsFixture()).messages[0].content, /DEMONSTRATION ROUND/);
});

test('the offline stub follows the same path: match first, then demo over-cap', async () => {
  let r = await decide(obsFixture(), { apiKey: 'fake', fetchImpl: fakeFetch });
  assert.equal(r.decision.memo, 'tt:agent:match-abcdef01');
  assert.equal(r.decision.amountUsdc, 0.02);
  r = await decide(obsFixture(), { apiKey: 'fake', fetchImpl: fakeFetch, demoOvercap: true });
  assert.equal(r.decision.amountUsdc, 0.1);
  r = await decide(obsFixture({ last24h: { unmatchedPublicGifts: [] } }), { apiKey: 'fake', fetchImpl: fakeFetch });
  assert.equal(r.decision.memo, 'tt:agent:pace');
  assert.ok(r.decision.amountUsdc <= 0.05);
});

test('TREAT_AGENT_NO_FALLBACK=1 drops the fallback field and its beta header', async () => {
  process.env.TREAT_AGENT_NO_FALLBACK = '1';
  try {
    await decide(obsFixture(), { apiKey: 'k', fetchImpl: llmReply('hold', { rationale: 'x' }) });
    assert.equal(llmReply.lastBody.fallbacks, undefined);
    assert.equal(llmReply.lastHeaders['anthropic-beta'], undefined);
  } finally {
    delete process.env.TREAT_AGENT_NO_FALLBACK;
  }
  await decide(obsFixture(), { apiKey: 'k', fetchImpl: llmReply('hold', { rationale: 'x' }) });
  assert.equal(llmReply.lastHeaders['anthropic-beta'], 'server-side-fallback-2026-07-01');
});

test('a non-2xx API response is an ApiError with its status', async () => {
  const { ApiError } = await import('../decide.mjs');
  await assert.rejects(
    decide(obsFixture(), { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'nope' }) }),
    (e) => e instanceof ApiError && e instanceof DecisionError && e.status === 400,
  );
});

test('demo over-cap proposals are bounded to 10 per-gift caps (no exponent notation)', () => {
  const d = validateDecision({ type: 'tool_use', name: 'give_treat', input: { amount_usdc: 1e22, memo_suffix: 'demo-overcap', rationale: 'test' } }, obsFixture(), { demoOvercap: true });
  assert.equal(d.amountUsdc, 0.5);
  assert.equal(d.clamped, true);
  assert.equal(d.overCap, true);
});
