// Witness: read CappedSpender AgentGift events back from the chain and move receipts along
// planned/sent (and failed/expired, if the memo lands late) -> reconciled | mismatch | failed | expired. A printed dry-run command the founder ran by
// hand reconciles too, because matching is by memo. See MATCH-DESK.md, "Witness".

import { TOPIC, uintAt, stringAt, topicUint } from './abi.mjs';
import { setStatus, sponsorMemoPrefix } from './receipt.mjs';

/** Decode a CappedSpender AgentGift(uint256 indexed batchId, uint256 amount, string memo, uint256 spentToday). */
export function decodeAgentGift(log) {
  const d = log.data;
  return {
    batchId: topicUint(log.topics[1]).toString(),
    amountRaw: uintAt(d, 0).toString(),
    memo: stringAt(d, 1),
    spentTodayRaw: uintAt(d, 2).toString(),
    tx: String(log.transactionHash).toLowerCase(),
    block: Number(BigInt(log.blockNumber)),
    logIndex: Number(BigInt(log.logIndex ?? 0)),
  };
}

/** AgentGift events of `spender` from `fromBlock` to `toBlock`, oldest first. `getLogs` is the chunked reader. */
export async function readAgentGifts({ getLogs, spender, fromBlock, toBlock }) {
  const logs = await getLogs({ address: spender, topics: [TOPIC.AgentGift], fromBlock, toBlock });
  return logs
    .filter((l) => l.topics?.[0] === TOPIC.AgentGift)
    .map(decodeAgentGift)
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

export const witnessOf = (ev, now) => ({
  tx: ev.tx,
  block: ev.block,
  logIndex: ev.logIndex,
  batchId: ev.batchId,
  amountRaw: ev.amountRaw,
  spentTodayRaw: ev.spentTodayRaw,
  reconciledAt: new Date(now).toISOString(),
});

/** First event per memo (oldest). */
export function eventsByMemo(events) {
  const m = new Map();
  for (const e of events) if (!m.has(e.memo)) m.set(e.memo, e);
  return m;
}

/**
 * Apply the chain's AgentGift events to the envelopes (mutates them).
 * @param o.envelopes    receipts (any mode)
 * @param o.events       decoded AgentGift events
 * @param o.sponsorId    for orphan detection (tt:agent:m:<id>:...)
 * @param o.now          ms
 * @param o.ttlMinutes   plannedTtlMinutes
 * @param o.getTxReceipt async (hash) => receipt | null   (eth_getTransactionReceipt)
 * @returns { changed: envelope[], summary: { reconciled, failed, expired, orphans, collisions, stuck } }
 */
export async function witness({ envelopes, events, sponsorId, now = Date.now(), ttlMinutes, getTxReceipt }) {
  const byMemo = eventsByMemo(events);
  const summary = { reconciled: [], failed: [], expired: [], orphans: [], collisions: [], stuck: [] };
  const changed = [];
  const ttlMs = ttlMinutes * 60_000;

  for (const env of envelopes) {
    // expired is included: a dry-run command run by hand after the TTL still reconciles (truth wins).
    // failed is included: a send whose outcome looked failed (or a released unknown send) can still land
    // later, and then it must be reconciled, not left invisible.
    if (!['planned', 'sent', 'expired', 'failed'].includes(env.status)) continue;
    const ev = byMemo.get(env.memo);
    if (ev) {
      if (ev.amountRaw === env.receipt.amountRaw) {
        setStatus(env, 'reconciled', { witness: witnessOf(ev, now), tx: { hash: ev.tx, block: ev.block, status: 'success' } }, now);
        summary.reconciled.push(env.sha256);
      } else {
        setStatus(env, 'mismatch', { witness: { ...witnessOf(ev, now), reconciledAt: null } }, now);
        summary.collisions.push(env.sha256);
      }
      changed.push(env);
      continue;
    }
    if (env.status === 'failed') continue;
    if (env.status === 'sent' && !env.tx?.hash) {
      // cast exited without a tx hash (timeout, Ctrl-C, keystore prompt): the tx may or may not be out.
      // Its gifts stay blocked until the memo shows up or a human releases it (run.mjs --release).
      if (now - Date.parse(env.updatedAt) > ttlMs) summary.stuck.push(env.sha256);
      continue;
    }
    if (env.status === 'sent' && env.tx?.hash) {
      const rc = getTxReceipt ? await getTxReceipt(env.tx.hash) : null;
      if (rc && (rc.status === '0x0' || rc.status === 0 || rc.status === '0')) {
        setStatus(env, 'failed', { tx: { ...env.tx, block: rc.blockNumber ? Number(BigInt(rc.blockNumber)) : env.tx.block, status: 'reverted' } }, now);
        summary.failed.push(env.sha256);
        changed.push(env);
      } else if (!rc && now - Date.parse(env.updatedAt) > ttlMs) {
        // Never re-plan these gifts: the tx may still land. A human looks at it.
        summary.stuck.push(env.sha256);
      }
      continue;
    }
    if (env.status === 'planned' && env.mode === 'send' && !env.tx?.hash && now - Date.parse(env.createdAt) > ttlMs) {
      // A real send whose process died before it recorded the outcome (Ctrl-C reaches node and cast
      // together): the tx may be out. It becomes 'sent' with an unknown outcome, never 'expired', so its
      // gifts stay blocked until the memo shows up or a human runs --release.
      setStatus(env, 'sent', { tx: { hash: null, block: null, status: 'unknown' } }, now);
      summary.stuck.push(env.sha256);
      changed.push(env);
      continue;
    }
    if (env.status === 'planned' && !env.tx?.hash && now - Date.parse(env.createdAt) > ttlMs) {
      setStatus(env, 'expired', {}, now);
      summary.expired.push(env.sha256);
      changed.push(env);
    }
  }

  const known = new Set(envelopes.map((e) => e.memo));
  const prefix = sponsorMemoPrefix(sponsorId);
  for (const ev of events) {
    if (ev.memo.startsWith(prefix) && !known.has(ev.memo)) summary.orphans.push({ memo: ev.memo, tx: ev.tx });
  }
  return { changed, summary };
}
