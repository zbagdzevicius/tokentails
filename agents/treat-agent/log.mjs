// log: one JSON line per round. Observation hash, decision, rationale, and the tx hash or revert reason.
// Default directory: treat-agent/runs/ (gitignored). Override with TREAT_AGENT_LOG_DIR.
// The RPC URL is never written (it can carry an API key); nothing secret is in an observation.

import { appendFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs');

const replacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

/** Stable JSON: object keys sorted, so the same observation always hashes the same. */
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value, replacer);
}

export const hashObservation = (obs) => 'sha256:' + createHash('sha256').update(canonical(obs)).digest('hex');

export function entry({ obs, decision, meta, result, flags }) {
  return {
    ts: new Date().toISOString(),
    chainId: obs.chainId,
    spender: obs.spender.address,
    observationHash: hashObservation(obs),
    snapshot: {
      remainingTodayUsdc: obs.spender.remainingTodayUsdc,
      perTxCapUsdc: obs.spender.perTxCapUsdc,
      floatUsdc: obs.spender.floatUsdc,
      unmatchedPublicGifts: obs.last24h.unmatchedPublicGifts.length,
      publicGiftsUsdc: obs.last24h.publicGiftsUsdc,
    },
    flags,
    model: meta?.model,
    decision: decision && {
      action: decision.action,
      amountUsdc: decision.amountUsdc,
      proposedUsdc: decision.proposedUsdc,
      clamped: decision.clamped || false,
      memo: decision.memo,
    },
    rationale: decision?.rationale,
    result: result && {
      mode: result.mode,
      status: result.status,
      txHash: result.txHash,
      revert: result.revert,
      error: result.error,
      command: result.mode === 'dry-run' ? result.command : undefined,
    },
  };
}

export async function writeLog(record, { dir = process.env.TREAT_AGENT_LOG_DIR || DEFAULT_DIR, file = 'decisions.jsonl' } = {}) {
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  await appendFile(target, JSON.stringify(record, replacer) + '\n');
  return target;
}
