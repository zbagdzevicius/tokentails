#!/usr/bin/env node
// Treat agent CLI: observe -> decide (Claude) -> act (cast) -> log.
//
//   node run.mjs --rpc <url> --spender <addr> [--fork] [--demo-overcap] [--once]
//                [--interval <seconds>] [--keystore <name>] [--router <addr>] [--hours <n>]
//
// --rpc may be omitted when TREAT_AGENT_RPC is set; then printed commands show "$TREAT_AGENT_RPC"
// instead of the URL (a provider URL can carry an API key).
// Without --fork every gift is a DRY RUN: the cast command is printed for the founder to run.
// Env: ANTHROPIC_API_KEY (or TREAT_AGENT_FAKE_LLM=1), TREAT_AGENT_ROUTER, TREAT_AGENT_NEEDS,
//      TREAT_AGENT_LOG_DIR, TREAT_AGENT_MODEL, TREAT_AGENT_CAMPAIGN_END, TREAT_AGENT_TT_SENDERS,
//      TREAT_AGENT_MATCH_ROUTER, TREAT_AGENT_NO_FALLBACK.

import { parseArgs } from 'node:util';
import { makeRpc, observe, previewToTreasury } from './observe.mjs';
import { decide, DecisionError, ApiError } from './decide.mjs';
import { act, isLocalRpc, toRaw } from './act.mjs';
import { ERRORS, formatUnits } from './lib/abi.mjs';
import { entry, writeLog } from './log.mjs';
import { fakeFetch } from './lib/fake-llm.mjs';

const USAGE = 'usage: node run.mjs --rpc <url> --spender <addr> [--fork] [--demo-overcap] [--once] [--interval <s>] [--keystore <name>]';

export async function round(opts, deps = {}) {
  const rpcFetch = deps.rpcFetch || globalThis.fetch;
  const rpc = makeRpc(opts.rpc, { fetchImpl: rpcFetch });
  const obs = await observe({ rpc, spender: opts.spender, router: opts.router, hours: opts.hours });

  const fake = process.env.TREAT_AGENT_FAKE_LLM === '1';
  const llmFetch = deps.llmFetch || (fake ? fakeFetch : globalThis.fetch);
  let decision;
  let meta;
  try {
    ({ decision, meta } = await decide(obs, {
      fetchImpl: llmFetch,
      apiKey: fake ? 'fake' : process.env.ANTHROPIC_API_KEY,
      demoOvercap: opts.demoOvercap,
    }));
  } catch (e) {
    if (!(e instanceof DecisionError)) throw e;
    const api = e instanceof ApiError;
    decision = { action: 'hold', rationale: `${api ? 'API error' : 'Rejected model output'}: ${e.message}` };
    meta = { rejected: true, apiError: api, status: api ? e.status : undefined };
  }

  // Rounding dust on a multi-shelter split would reach the treasury and CappedSpender would revert with
  // TreasuryShare: check split.preview first and hold instead of spending gas on a sure revert.
  // Skipped in demo rounds, where the over-cap refusal is the point.
  if (decision.action === 'give' && !opts.demoOvercap) {
    const raw = toRaw(decision.amountUsdc, obs.spender.unitDecimals);
    const toTreasury = await previewToTreasury(rpc, obs.split.address, raw);
    if (toTreasury !== 0n) {
      decision = {
        action: 'hold',
        rationale: `${decision.rationale} (Held: ${formatUnits(raw, obs.spender.unitDecimals)} USDC would leave ${toTreasury} raw units of rounding dust for the split's treasury, which the contract refuses; pick an amount that splits evenly.)`,
        proposedUsdc: decision.amountUsdc,
        heldForDust: true,
      };
    }
  }

  const result = await act(decision, {
    spender: opts.spender,
    rpc: opts.rpc,
    rpcDisplay: opts.rpcDisplay,
    unitDecimals: obs.spender.unitDecimals,
    keystore: opts.keystore,
    fork: opts.fork,
    from: obs.spender.agent,
    execImpl: deps.execImpl,
  });
  const record = entry({ obs, decision, meta, result, flags: { fork: opts.fork, demoOvercap: opts.demoOvercap, fakeLlm: fake } });
  const file = await writeLog(record, deps.logDir ? { dir: deps.logDir } : undefined);
  return { obs, decision, result, record, file, meta };
}

/** Revert args in USDC where they are amounts (all CappedSpender error args are amounts in spender units). */
export function formatRevert(revert, unitDecimals) {
  if (!revert) return '';
  const known = Object.values(ERRORS).some((d) => d.name === revert.name);
  const args = Object.values(revert.args || {}).map((v) => (known ? formatUnits(BigInt(v), unitDecimals) : v));
  return `${revert.name}(${args.join(', ')})`;
}

export function describe({ obs, decision, result, file, meta }) {
  const s = obs.spender;
  const lines = [
    `chain ${obs.chainId} · spender ${s.address} · agent ${s.agent}`,
    `caps: ${s.perTxCapUsdc} USDC per gift, ${s.dailyCapUsdc} per day · left today ${s.remainingTodayUsdc} · float ${s.floatUsdc}`,
    `last ${obs.window.hours} h: public gifts ${obs.last24h.publicGiftsUsdc} USDC (${obs.last24h.unmatchedPublicGifts.length} unmatched) · Token Tails ${obs.last24h.tokenTailsUsdc} USDC`,
    `campaign: ${obs.campaign.name}, goal ${obs.campaign.goalUsdc} USDC, ${obs.campaign.daysLeft ?? '?'} days left${obs.campaign.sameChain ? '' : ' (test USDC on this chain, no real money)'}`,
  ];
  if (decision.action === 'give') {
    const clamp = decision.clamped ? ` (model proposed ${decision.proposedUsdc}, clamped to the caps)` : '';
    lines.push(`decision: GIVE ${decision.amountUsdc} USDC, memo ${decision.memo}${clamp}`);
  } else {
    lines.push('decision: HOLD');
  }
  lines.push(`why: ${decision.rationale}`);
  if (result.mode === 'dry-run') lines.push('dry run, the founder runs:', '  ' + result.command);
  if (result.mode === 'fork') {
    if (result.status === 'success') lines.push(`fork tx: ${result.txHash} (success)`);
    else lines.push(`fork tx REFUSED: ${result.revert ? `${formatRevert(result.revert, s.unitDecimals)} USDC` : result.error}`);
  }
  if (meta?.apiError) lines.push('Messages API call failed (see why); set TREAT_AGENT_NO_FALLBACK=1 if the API rejected the fallback beta.');
  lines.push(`log: ${file}`);
  return lines.join('\n');
}

/** A URL with no path, query or credentials is safe to print; anything else may carry an API key. */
export function isPlainRpc(url) {
  try {
    const u = new URL(url);
    return !u.username && !u.password && !u.search && (u.pathname === '/' || u.pathname === '');
  } catch {
    return false;
  }
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      rpc: { type: 'string' },
      spender: { type: 'string' },
      fork: { type: 'boolean', default: false },
      'demo-overcap': { type: 'boolean', default: false },
      once: { type: 'boolean', default: false },
      interval: { type: 'string', default: '3600' },
      keystore: { type: 'string' },
      router: { type: 'string' },
      hours: { type: 'string', default: '24' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const rpc = values.rpc || process.env.TREAT_AGENT_RPC;
  if (!rpc || !values.spender) {
    console.error(USAGE);
    return 2;
  }
  if (values.fork && !isLocalRpc(rpc)) {
    console.error('--fork only talks to a local anvil fork (localhost / 127.0.0.1).');
    return 2;
  }
  const opts = {
    rpc,
    rpcDisplay: values.rpc && isPlainRpc(rpc) ? rpc : '"$TREAT_AGENT_RPC"',
    spender: values.spender,
    fork: values.fork,
    demoOvercap: values['demo-overcap'],
    keystore: values.keystore || process.env.TREAT_AGENT_KEYSTORE || '<keystore>',
    router: values.router || process.env.TREAT_AGENT_ROUTER || null,
    hours: Number(values.hours),
  };
  if (opts.rpcDisplay === '"$TREAT_AGENT_RPC"' && !process.env.TREAT_AGENT_RPC) {
    console.error('note: printed commands use "$TREAT_AGENT_RPC" (the --rpc URL may carry a key); export TREAT_AGENT_RPC=<url> before running them.');
  }
  const intervalMs = Math.max(60, Number(values.interval)) * 1000;
  for (;;) {
    const r = await round(opts);
    console.log(describe(r));
    if (values.once || opts.demoOvercap) {
      // A failed API call is not a decision: fail loudly so a recording never shows a silent hold.
      if (r.meta?.apiError) return 3;
      return r.result.status === 'reverted' && !opts.demoOvercap ? 1 : 0;
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
