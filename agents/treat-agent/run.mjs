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

//
// Match desk (MATCH-DESK.md): <file> is a desk.json (tt.match-desk.desk/v2, several sponsors, one vault
// each) or an old sponsor.json (v1, one sponsor). --desk is an alias of --sponsor.
//   node run.mjs --sponsor <file> [--rpc <url>] [--once] [--interval <s>]
//                [--fork | --send] [--keystore <name>]
//                [--demo-overcap [--vault <sponsorId>] [--overcap-kind auto|tx|day] [--mined-revert]]
//                [--witness-only] [--release <sha256 prefix>] [--ack-orphan <tx hash>]
// Exit codes (match desk): 0 ok (holds and expected refusals included), 1 unexpected revert / failed
// send / mismatch, 2 usage, policy or guard refusal, 3 Messages API error, 4 the over-cap demo did not
// refuse as expected.
// Env (match desk): MATCH_DESK_DIR, MATCH_DESK_API, MATCH_DESK_CALL_GAP_MS, CONFIRM_MAINNET, TREAT_AGENT_FAKE_WRONG.

import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  makeRpc, observe, previewToTreasury, observeMatchDesk, withGap, callGapMs, getLogsChunked, ORPHAN_ACKS,
} from './observe.mjs';
import { decide, decideMatch, matchCodeHold, DecisionError, ApiError } from './decide.mjs';
import {
  act, actMatch, actOvercap, overcapPlan, sendGates, isLocalRpc, toRaw,
} from './act.mjs';
import { ERRORS, formatUnits, formatMicro, microToRaw } from './lib/abi.mjs';
import { entry, writeLog, hashObservation } from './log.mjs';
import { fakeFetch, makeFakeFetch } from './lib/fake-llm.mjs';
import { loadDesk, deskFromSponsor, GuardError } from './lib/policy.mjs';
import {
  buildReceiptBody, newEnvelope, saveEnvelope, setStatus, deskStateDir, demoMemo, readJson, writeJson,
} from './lib/receipt.mjs';
import { readAgentGifts, witnessOf } from './lib/witness.mjs';

const USAGE = [
  'usage: node run.mjs --rpc <url> --spender <addr> [--fork] [--demo-overcap] [--once] [--interval <s>] [--keystore <name>]',
  '       node run.mjs --sponsor <desk.json|sponsor.json> [--rpc <url>] [--once] [--interval <s>] [--fork | --send] [--keystore <name>]',
  '                    [--demo-overcap [--vault <sponsorId>] [--overcap-kind auto|tx|day] [--mined-revert]] [--witness-only] [--release <sha256>]',
  '                    [--ack-orphan <tx hash>]',
].join('\n');

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
    if (result.status === 'success') lines.push(`local fork tx (not on any explorer): ${result.txHash} (success)`);
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

// ================================================================== match desk

export const DEFAULT_RPC = Object.freeze({ 5042: 'https://rpc.mainnet.arc.io', 5042002: 'https://rpc.testnet.arc.io' });
export const EXPLORER = Object.freeze({ 5042: 'https://explorer.arc.io', 5042002: 'https://explorer.testnet.arc.io' });
export const EXIT = Object.freeze({ OK: 0, FAILED: 1, GUARD: 2, API: 3, DEMO: 4 });

/**
 * One match-desk round: observe every vault (with witness) -> code holds -> decide -> allocation and
 * checker -> receipt -> act on the chosen vault -> log.
 * opts: { desk | (sponsor, policyHash), rpc, rpcDisplay, mode: 'dry-run'|'fork'|'send', keystore, once,
 *         demoOvercap, vault, overcapKind, minedRevert, witnessOnly, release, ackOrphan, now }
 * deps: { rpcFetch, httpFetch, llmFetch, execImpl, spawnImpl, logDir, stateBase, statementFile, api, env }
 * Returns { code, obs, decision, result, record, file, meta, envelope, dir }. Guard refusals throw GuardError.
 */
export async function matchRound(opts, deps = {}) {
  const env = deps.env || process.env;
  const desk = opts.desk || deskFromSponsor(opts.sponsor, opts.policyHash);
  const mode = opts.mode || 'dry-run';
  const now = opts.now ?? Date.now();
  const missing = desk.sponsors.filter((v) => !v.spender.address || v.spender.deployBlock === null);
  if (missing.length) {
    throw new GuardError(`the desk file has no vault address or deploy block yet for ${missing.map((v) => v.sponsor.id).join(', ')} (init state): deploy, then paste both`);
  }
  if (mode === 'fork' && !isLocalRpc(opts.rpc)) throw new GuardError('--fork only talks to a local anvil fork (localhost / 127.0.0.1).');
  if (mode === 'fork' && desk.chainId === 5042) {
    throw new GuardError('--fork with a mainnet desk file (chainId 5042). Rehearse on mainnet state with an Arc testnet chain id: '
      + '`anvil --fork-url https://rpc.mainnet.arc.io --chain-id 5042002` and a copy of the desk file with chainId 5042002 '
      + '(eligible.chains too). Keep its excludedSenders, so the run shows the exclusion. Native-mode deploys need an Arc chain id, so not 31337.');
  }
  if (mode === 'send') {
    const why = sendGates({ rpc: opts.rpc, once: opts.once, keystore: opts.keystore, env });
    if (why) throw new GuardError(why);
  }
  if (opts.vault && !desk.sponsors.some((v) => v.sponsor.id === opts.vault)) {
    throw new GuardError(`--vault ${opts.vault}: no such sponsor on this desk (${desk.sponsors.map((v) => v.sponsor.id).join(', ')})`);
  }
  const rpc = withGap(makeRpc(opts.rpc, { fetchImpl: deps.rpcFetch || globalThis.fetch }), callGapMs(desk.chainId, env));
  if (mode === 'send') {
    const chainId = Number(BigInt(await rpc('eth_chainId')));
    const why = sendGates({ rpc: opts.rpc, chainId, sponsorChainId: desk.chainId, once: opts.once, keystore: opts.keystore, env });
    if (why) throw new GuardError(why);
  }
  const chunk = Number(env.TREAT_AGENT_LOG_CHUNK) || 10_000;
  const dir = deskStateDir(deps.stateBase || env.MATCH_DESK_DIR, desk.chainId, desk.sponsors.map((v) => v.spender.address));
  const obs = await observeMatchDesk({
    rpc, desk, now, dir, chunk,
    fetchImpl: deps.httpFetch || globalThis.fetch,
    api: deps.api ?? env.MATCH_DESK_API ?? undefined,
    ttSenders: env.TREAT_AGENT_TT_SENDERS || '',
    mode,
    ...(deps.statementFile ? { statementFile: deps.statementFile } : {}),
  });
  const md = obs.matchDesk;
  const unit = md.caps.unitDecimals;
  const witnessLog = { reconciled: md.witness.reconciled, failed: md.witness.failed, orphans: md.witness.orphans };
  if (opts.witnessOnly) return { code: EXIT.OK, obs, witnessOnly: true, dir };
  if (opts.release) return releaseUnknown({ obs, dir, sha: opts.release, now });
  if (opts.ackOrphan) return ackOrphan({ obs, dir, tx: opts.ackOrphan, now });

  const fake = env.TREAT_AGENT_FAKE_LLM === '1';
  const vaultById = (id) => desk.sponsors.find((v) => v.sponsor.id === id);
  const sponsorById = (id) => md.sponsors.find((s) => s.id === id);
  const actFor = (s) => ({
    spender: s.spender.address, rpc: opts.rpc, rpcDisplay: opts.rpcDisplay, keystore: opts.keystore,
    from: s.spender.agent, execImpl: deps.execImpl, spawnImpl: deps.spawnImpl,
  });
  const finish = async ({ decision, meta, result, code, envelope = null, flag = null, checker = null, sponsorId = null }) => {
    const sid = sponsorId || envelope?.receipt?.sponsor || decision.sponsorId || null;
    const record = entry({
      obs, decision, meta, result: result || { mode: 'none' },
      flags: { mode, demoOvercap: !!opts.demoOvercap, fakeLlm: fake },
      matchDesk: {
        sponsor: sid || md.sponsor.id,
        vault: sid ? sponsorById(sid)?.spender.address ?? null : null,
        policyHash: sid ? sponsorById(sid)?.policyHash ?? md.policyHash : md.policyHash,
        receiptSha256: envelope?.sha256 || null, memo: envelope?.memo || decision.memo || null,
        checker: checker || decision.checker || null, flag, witness: witnessLog,
      },
    });
    const file = await writeLog(record, deps.logDir ? { dir: deps.logDir } : undefined);
    return { code, obs, decision, result: result || { mode: 'none' }, record, file, meta, envelope, dir };
  };

  // ---- over-cap demonstration on one named vault: code picks the amount; no model call, no receipt.
  if (opts.demoOvercap) {
    let kind = opts.overcapKind || 'auto';
    if (opts.minedRevert) {
      // A mined 'day' demo is a real give(perTx) that relies on the daily cap to revert: if 00:00 UTC
      // passes before it is mined, it pays out unchecked. 2 x perTx always reverts (perTxCap is immutable).
      if (kind === 'day') throw new GuardError('--mined-revert only goes with --overcap-kind tx (2 x the per-gift cap always reverts); use the day demo as a simulation');
      kind = 'tx';
    }
    const s = sponsorById(opts.vault || md.sponsors[0].id);
    const plan = overcapPlan(s.capsRaw, kind);
    const memo = demoMemo(s.id);
    const result = await actOvercap({ plan, memo, mode, minedRevert: !!opts.minedRevert, ...actFor(s) });
    const decision = {
      action: 'demo-overcap', memo, sponsorId: s.id, amountUsdc: formatUnits(plan.amountRaw, unit),
      rationale: `Deliberate test of the on-chain cap (${plan.kind}) on the ${s.name} vault: the contract must refuse with ${plan.expect.name}.`,
    };
    const ok = result.status === 'refused-as-expected' || result.status === 'printed';
    return finish({ decision, meta: { model: null }, result, code: ok ? EXIT.OK : EXIT.DEMO, sponsorId: s.id });
  }

  // ---- decide (code holds first: no model call, no API cost)
  let decision;
  let meta = { model: null };
  const hold = matchCodeHold(obs);
  if (hold) {
    decision = { action: 'hold', rationale: `Held by code: ${hold}.`, codeHold: true };
  } else {
    const llmFetch = deps.llmFetch || (fake ? makeFakeFetch({ wrong: env.TREAT_AGENT_FAKE_WRONG === '1' }) : globalThis.fetch);
    try {
      ({ decision, meta } = await decideMatch(obs, { fetchImpl: llmFetch, apiKey: fake ? 'fake' : env.ANTHROPIC_API_KEY }));
    } catch (e) {
      if (!(e instanceof DecisionError)) throw e;
      const api = e instanceof ApiError;
      decision = { action: 'hold', rejected: !api, rationale: `${api ? 'API error' : 'Rejected model output'}: ${e.message}` };
      meta = { rejected: true, apiError: api, status: api ? e.status : undefined };
    }
  }
  if (meta?.apiError) return finish({ decision, meta, code: EXIT.API });

  if (decision.action === 'flag') {
    let result = { mode: 'none', status: 'flagged' };
    if (decision.kind === 'farming') {
      const file = path.join(dir, 'flagged.json');
      const flagged = await readJson(file, {});
      const at = new Date(now).toISOString();
      for (const id of decision.giftIds) flagged[id] = { kind: 'farming', at, rationale: decision.rationale };
      await writeJson(file, flagged);
      result = { mode: 'none', status: 'flagged', excluded: decision.giftIds.length };
    }
    return finish({ decision, meta, result, code: EXIT.OK, flag: { kind: decision.kind, giftIds: decision.giftIds } });
  }

  if (decision.action === 'propose_refund') {
    const s = sponsorById(decision.sponsorId || md.sponsors[0].id);
    const owner = vaultById(s.id).spender.owner || s.spender.owner;
    const proposal = {
      at: new Date(now).toISOString(),
      sponsor: s.id,
      vault: s.spender.address,
      floatUsdc: formatMicro(s.caps.floatMicro),
      owner,
      // Never sent by the agent: withdraw is owner-only and pays only the owner (that sponsor).
      command: `cast send ${s.spender.address} 'withdraw(address)' ${owner} --rpc-url ${opts.rpcDisplay || '"$TREAT_AGENT_RPC"'} --account <sponsor-keystore>`,
      rationale: decision.rationale,
    };
    await writeJson(path.join(dir, 'refund-proposal.json'), proposal);
    return finish({ decision, meta, result: { mode: 'none', status: 'refund-proposed', command: proposal.command }, code: EXIT.OK, flag: { kind: 'refund', sponsor: s.id }, sponsorId: s.id });
  }

  if (decision.action !== 'match') return finish({ decision, meta, code: EXIT.OK });

  // ---- a checked match from the vault the allocation rule picked: dust guard, write-ahead receipt, idempotency, act.
  const s = sponsorById(decision.sponsorId);
  const vault = vaultById(decision.sponsorId);
  const amountRaw = microToRaw(decision.amountMicro, unit);
  const toTreasury = await previewToTreasury(rpc, desk.split, amountRaw);
  if (toTreasury !== 0n) {
    decision = {
      ...decision, action: 'hold', heldForDust: true,
      rationale: `${decision.rationale} (Held: ${decision.amountUsdc} USDC would leave ${toTreasury} raw units of rounding dust for the split's treasury, which the contract refuses.)`,
    };
    return finish({ decision, meta, code: EXIT.OK });
  }
  const body = buildReceiptBody({ sponsor: vault, policyHash: vault.policyHash, check: decision.check, unitDecimals: unit });
  const envelope = newEnvelope({
    body, sponsorId: s.id, mode, now,
    decision: { model: meta?.model || null, rationale: decision.rationale, observationHash: hashObservation(obs), checker: decision.checker },
  });
  decision.memo = envelope.memo;
  await saveEnvelope(dir, envelope); // write-ahead: planned before any send

  if (mode === 'dry-run') {
    const result = await actMatch({ amountRaw, memo: envelope.memo, mode, ...actFor(s) });
    return finish({ decision, meta, result, code: EXIT.OK, envelope });
  }

  // Idempotency: an AgentGift with this memo already on the chosen vault means this exact match already went out.
  const head = await rpc('eth_getBlockByNumber', ['latest', false]);
  const events = await readAgentGifts({
    getLogs: (f) => getLogsChunked(rpc, { ...f, chunk }), spender: s.spender.address,
    fromBlock: s.spender.deployBlock, toBlock: Number(BigInt(head.number)),
  });
  const dup = events.find((e) => e.memo === envelope.memo);
  if (dup) {
    if (dup.amountRaw === envelope.receipt.amountRaw) {
      // The event is the truth: the envelope is reconciled; the round records that it skipped the send.
      setStatus(envelope, 'reconciled', { witness: witnessOf(dup, now), tx: { hash: dup.tx, block: dup.block, status: 'success' }, skipped: 'duplicate' }, now);
      await saveEnvelope(dir, envelope);
      return finish({ decision, meta, result: { mode, status: 'skipped-duplicate', txHash: dup.tx }, code: EXIT.OK, envelope });
    }
    setStatus(envelope, 'mismatch', { witness: { ...witnessOf(dup, now), reconciledAt: null } }, now);
    await saveEnvelope(dir, envelope);
    return finish({ decision, meta, result: { mode, status: 'mismatch', txHash: dup.tx, error: 'an AgentGift with this memo has a different amount' }, code: EXIT.FAILED, envelope });
  }

  const result = await actMatch({ amountRaw, memo: envelope.memo, mode, ...actFor(s) });
  let code = EXIT.OK;
  if (result.status === 'success') {
    setStatus(envelope, 'sent', { tx: { hash: result.txHash, block: result.block ?? null, status: 'success' } }, now);
  } else if (result.txHash) {
    setStatus(envelope, result.status === 'reverted' ? 'failed' : 'sent', { tx: { hash: result.txHash, block: result.block ?? null, status: result.status } }, now);
    code = EXIT.FAILED;
  } else if (result.status === 'not-sent' || (result.status === 'reverted' && result.revert)) {
    // cast never started, or the pre-send simulation reverted with a decoded error: nothing was
    // broadcast, so the gifts become eligible again.
    setStatus(envelope, 'failed', { tx: { hash: null, block: null, status: 'not-sent' } }, now);
    code = EXIT.FAILED;
  } else {
    // Unknown outcome (cast exited non-zero or printed no receipt): the tx may still land. The receipt
    // stays committed ('sent', no hash) and blocks its gifts and budget until the witness sees its memo,
    // or a human who checked the agent's address on the explorer runs --release.
    setStatus(envelope, 'sent', { tx: { hash: null, block: null, status: 'unknown' } }, now);
    code = EXIT.FAILED;
  }
  await saveEnvelope(dir, envelope);
  return finish({ decision, meta, result, code, envelope });
}

/**
 * --release <sha256 prefix>: a human's call that a 'sent' receipt with no tx hash (unknown outcome) never
 * went out. Only after this round's witness found no AgentGift with its memo. It becomes 'failed', so its
 * gifts are eligible again; if the tx lands later after all, the witness still reconciles it by memo.
 */
export async function releaseUnknown({ obs, dir, sha, now }) {
  const want = String(sha || '').toLowerCase();
  if (!/^[0-9a-f]{8,64}$/.test(want)) throw new GuardError('--release needs a receipt sha256 (at least 8 hex characters)');
  const hits = (obs.envelopes || []).filter((e) => e.sha256.startsWith(want));
  if (hits.length !== 1) throw new GuardError(`--release ${want}: ${hits.length} receipts match`);
  const env = hits[0];
  // A --send receipt still 'planned' is the same unknown outcome (the process died while cast ran).
  const unknown = !env.tx?.hash && (env.status === 'sent' || (env.status === 'planned' && env.mode === 'send'));
  if (!unknown) {
    throw new GuardError(`--release only clears a 'sent' receipt with no tx hash (or a --send receipt still 'planned'); ${env.sha256.slice(0, 8)} is '${env.status}'${env.tx?.hash ? ` with tx ${env.tx.hash}` : ''}`);
  }
  setStatus(env, 'failed', { tx: { ...env.tx, status: 'released' }, released: { at: new Date(now).toISOString() } }, now);
  await saveEnvelope(dir, env);
  return { code: EXIT.OK, obs, released: env, dir };
}

/**
 * --ack-orphan <tx>: a human's call that an orphan (an AgentGift with our memo and no local receipt)
 * has been checked, so it no longer holds matching. It is recorded in the state dir with the time.
 * It does not tell the agent which gifts that tx matched: restoring the original state dir is better.
 */
export async function ackOrphan({ obs, dir, tx, now }) {
  const want = String(tx || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(want)) throw new GuardError('--ack-orphan needs a full tx hash (0x + 64 hex characters)');
  const hit = (obs.matchDesk.witness.orphans || []).find((o) => o.tx === want);
  if (!hit) throw new GuardError(`--ack-orphan ${want}: this round's witness found no orphan AgentGift in that tx`);
  const file = path.join(dir, ORPHAN_ACKS);
  const acks = await readJson(file, {});
  acks[want] = { memo: hit.memo, at: new Date(now).toISOString() };
  await writeJson(file, acks);
  return { code: EXIT.OK, obs, ackedOrphan: { tx: want, memo: hit.memo }, dir };
}

/** A tx link only for a real send on a public chain; a fork hash exists only on the local anvil. */
export function txRef(mode, chainId, hash) {
  if (mode === 'fork') return `${hash} (local fork tx, not on any explorer)`;
  return EXPLORER[chainId] ? `${hash} ${EXPLORER[chainId]}/tx/${hash}` : hash;
}

export function describeMatch(r) {
  const md = r.obs.matchDesk;
  const u = (m) => formatMicro(m);
  const counts = {};
  for (const g of md.gifts) counts[g.status] = (counts[g.status] || 0) + 1;
  const sponsors = md.sponsors || [];
  const lines = [
    sponsors.length > 1
      ? `match desk · ${sponsors.length} vaults, one agent ${md.spender.agent} · chain ${md.chainId} (${md.network})`
      : `match desk · ${md.sponsor.name} (${md.sponsor.label}) · chain ${md.chainId} (${md.network})`,
  ];
  for (const s of sponsors) {
    lines.push(
      `${s.name} (${s.label}), priority ${s.priority}${s.unavailable ? ` · unavailable: ${s.unavailable}` : ''}`,
      `  vault ${s.spender.address} · agent ${s.spender.agent} · owner ${s.spender.owner}`,
      `  caps: ${u(s.caps.perTxMicro)} USDC per gift, ${u(s.caps.dailyMicro)} per UTC day (up to 2x across midnight) · left today ${u(s.caps.remainingTodayMicro)} · float ${u(s.caps.floatMicro)}`,
      `  budget ${u(s.budget.budgetMicro)} · committed ${u(s.budget.committedMicro)} · left ${u(s.budget.leftMicro)} · pace ${s.pace.status}`,
    );
  }
  lines.push(
    `gifts: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}${md.farmingSignals.length ? ` · ${md.farmingSignals.length} farming signal(s)` : ''}`,
    `api: payouts ${md.backend.payouts.ok ? (md.backend.payouts.stale ? 'stale' : 'ok') : 'n/a'} · donate-status ${md.backend.donateStatus.ok ? 'ok' : 'n/a'} · backend match ${md.backend.match.state ?? 'n/a'}${md.backend.routerBlocked ? ' (router gifts excluded)' : ''}`,
    `witness: ${md.witness.reconciled.length} reconciled, ${md.witness.failed.length} failed, ${md.witness.expired.length} expired, ${md.witness.orphans.length} orphan(s), ${md.witness.collisions.length} mismatch(es)${md.witness.stuck.length ? `, ${md.witness.stuck.length} sent without a receipt yet` : ''}${md.witness.imported ? ` · ${md.witness.imported} receipt(s) read from an earlier state dir` : ''}`,
  );
  for (const o of md.witness.orphans) {
    lines.push(`orphan: ${o.memo} in tx ${o.tx}${o.acked ? ' (acknowledged)' : ' has no local receipt: matching holds until it is acknowledged (--ack-orphan)'}`);
  }
  if (r.witnessOnly) return lines.concat(witnessTable(r.obs.envelopes)).join('\n');
  if (r.ackedOrphan) {
    return lines.concat(`acknowledged orphan ${r.ackedOrphan.memo} (tx ${r.ackedOrphan.tx}); matching may resume. `
      + 'Its gifts stay unknown to this state dir, so check them against the published statement.').join('\n');
  }
  if (r.released) {
    return lines.concat(`released: receipt ${r.released.sha256} (${r.released.memo}) is now failed; its gifts are eligible again. `
      + 'If its tx lands after all, the witness reconciles it by memo.').join('\n');
  }
  const d = r.decision;
  const from = (id) => {
    const s = sponsors.find((x) => x.id === id);
    return s ? ` from the ${s.name} vault ${s.spender.address}` : '';
  };
  if (d.action === 'match') lines.push(`decision: MATCH ${d.amountUsdc} USDC for ${d.giftIds.join(', ')}${from(d.sponsorId)} · memo ${d.memo}`);
  else if (d.action === 'flag') lines.push(`decision: FLAG ${d.kind}${d.giftIds.length ? ` (${d.giftIds.length} gift(s))` : ''}`);
  else if (d.action === 'propose_refund') lines.push(`decision: PROPOSE REFUND${from(d.sponsorId)} (its owner runs it; the agent never does)`);
  else if (d.action === 'demo-overcap') lines.push(`decision: OVER-CAP DEMO ${d.amountUsdc} USDC${from(d.sponsorId)}, memo ${d.memo}`);
  else lines.push(`decision: HOLD${d.rejected ? ' (rejected)' : ''}`);
  lines.push(`why: ${d.rationale}`);
  const res = r.result;
  if (res.mode === 'dry-run' && res.command) lines.push('dry run, the founder runs:', '  ' + res.command);
  if (res.minedCommand) lines.push('or, to mine the failed tx so it shows on the explorer:', '  ' + res.minedCommand);
  if (res.status === 'refund-proposed') lines.push('the owner runs:', '  ' + res.command);
  if (res.status === 'refused-as-expected') lines.push(`refused as expected${res.simulated ? ' (simulation: cast call, nothing mined)' : ''}: ${formatRevert(res.revert, md.caps.unitDecimals)} USDC${res.txHash ? ` · tx ${txRef(res.mode, md.chainId, res.txHash)}` : ''}`);
  else if (res.status === 'unexpected') lines.push(`OVER-CAP DEMO FAILED: expected ${formatRevert(res.expected, md.caps.unitDecimals)}, got ${res.revert ? formatRevert(res.revert, md.caps.unitDecimals) : 'no refusal'}`);
  else if (res.mode === 'fork' || res.mode === 'send') {
    if (res.status === 'success') lines.push(`${res.mode} tx (success): ${txRef(res.mode, md.chainId, res.txHash)}`);
    else if (res.status === 'skipped-duplicate') lines.push(`skipped: this match is already on-chain (${res.txHash})`);
    else if (res.status) lines.push(`${res.mode} ${res.status.toUpperCase()}: ${res.revert ? `${formatRevert(res.revert, md.caps.unitDecimals)} USDC` : res.error || ''}`);
    if (res.status === 'unknown' && r.envelope) {
      lines.push(`the receipt stays 'sent' (no tx hash) and blocks its gifts until the witness sees memo ${r.envelope.memo}.`,
        `run --witness-only later; if the agent's address on the explorer shows no such tx, release it: --release ${r.envelope.sha256.slice(0, 12)}`);
    }
  }
  if (r.envelope) lines.push(`receipt: ${r.envelope.status} ${r.envelope.sha256}`);
  if (r.meta?.apiError) lines.push('Messages API call failed (see why); set TREAT_AGENT_NO_FALLBACK=1 if the API rejected the fallback beta.');
  if (r.file) lines.push(`log: ${r.file}`);
  return lines.join('\n');
}

export function witnessTable(envelopes = []) {
  const rows = [...envelopes].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  if (!rows.length) return ['receipts: none'];
  return ['receipts:', ...rows.map((e) => `  ${e.status.padEnd(17)} ${e.mode.padEnd(7)} ${String(e.receipt.sponsor).padEnd(12)} ${formatMicro(e.receipt.amountMicro).padStart(9)} USDC  ${e.memo}  ${e.tx?.hash || '-'}`)];
}

async function mainMatch(values) {
  let desk;
  try {
    ({ desk } = await loadDesk(values.sponsor || values.desk));
  } catch (e) {
    console.error(e.message);
    return EXIT.GUARD;
  }
  if (values.fork && values.send) {
    console.error('--fork and --send are exclusive');
    return EXIT.GUARD;
  }
  const rpc = values.rpc || process.env.TREAT_AGENT_RPC || DEFAULT_RPC[desk.chainId];
  if (!rpc) {
    console.error('--rpc is required for chain ' + desk.chainId);
    return EXIT.GUARD;
  }
  const fromEnv = !values.rpc && !!process.env.TREAT_AGENT_RPC;
  const opts = {
    desk, rpc,
    rpcDisplay: !fromEnv && isPlainRpc(rpc) ? rpc : '"$TREAT_AGENT_RPC"',
    mode: values.fork ? 'fork' : values.send ? 'send' : 'dry-run',
    keystore: values.keystore || process.env.TREAT_AGENT_KEYSTORE || '<keystore>',
    once: values.once,
    demoOvercap: values['demo-overcap'],
    vault: values.vault || null,
    overcapKind: values['overcap-kind'] || 'auto',
    minedRevert: values['mined-revert'],
    witnessOnly: values['witness-only'],
    release: values.release || null,
    ackOrphan: values['ack-orphan'] || null,
  };
  if (opts.vault && !opts.demoOvercap) {
    console.error('--vault only goes with --demo-overcap (matches use the vault the allocation rule picks)');
    return EXIT.GUARD;
  }
  const intervalMs = Math.max(60, Number(values.interval)) * 1000;
  for (;;) {
    let r;
    try {
      r = await matchRound(opts);
    } catch (e) {
      if (e instanceof GuardError) {
        console.error(`refused: ${e.message}`);
        return EXIT.GUARD;
      }
      throw e;
    }
    console.log(describeMatch(r));
    if (values.once || opts.demoOvercap || opts.witnessOnly || opts.release || opts.ackOrphan || r.code !== EXIT.OK) return r.code;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      rpc: { type: 'string' },
      sponsor: { type: 'string' },
      desk: { type: 'string' },
      vault: { type: 'string' },
      send: { type: 'boolean', default: false },
      'overcap-kind': { type: 'string' },
      'mined-revert': { type: 'boolean', default: false },
      'witness-only': { type: 'boolean', default: false },
      release: { type: 'string' },
      'ack-orphan': { type: 'string' },
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
  if (values.sponsor || values.desk) return mainMatch(values);
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
