#!/usr/bin/env node
// Writes src/data/snapshot.json: the bundled fallback of GET /shelter/payouts?network=mainnet
// (public on-chain ShelterSplit payouts to Pink Paw). Owner: L-DATA.
//
// Usage: node scripts/snapshot.mjs [--api https://api.tokentails.com]
// The memo is reduced to a source label (`sourceOf`): raw memos such as "motored:user-51" are
// never bundled. Amounts stay integer strings at 18 decimals (amount18), exactly as the index
// returns them; USD conversion happens at runtime in src/data (one rule, one place).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argApi = process.argv.indexOf('--api');
const API = (argApi > 0 ? process.argv[argApi + 1] : 'https://api.tokentails.com').replace(/\/+$/, '');

/** `tt:rave:<16 hex>` (Tempo: trailing NULs tolerated) → the public order id `rv_<16 hex>`, else null. */
export function raveOrderIdOf(memo) {
  const m = /^tt:rave:([0-9a-f]{16})$/.exec(String(memo || '').replace(/\u0000+$/, '').trim().toLowerCase());
  return m ? `rv_${m[1]}` : null;
}

/** Memo → public source label. Keep in sync with src/data (sourceOf). */
export function sourceOf(memo) {
  const m = String(memo || '').trim();
  if (m.startsWith('tt:rave:')) return 'rave';
  if (m.startsWith('tt:page:') || m.startsWith('tt:treat:')) return 'treat';
  if (m.startsWith('tt:heist:')) return 'heist';
  if (m.startsWith('tt:wallet')) return 'wallet';
  if (m.startsWith('tt:cat:')) return 'adoption';
  if (m.startsWith('tt:match:')) return 'match';
  if (m.startsWith('tt:paws:')) return 'paws';
  if (m.startsWith('motored:')) return 'partner';
  if (/first payout/i.test(m)) return 'proof';
  if (/campaign/i.test(m)) return 'campaign';
  return 'gift';
}

async function main() {
  const events = [];
  let cursor = null;
  let meta = null;
  for (let page = 0; page < 50; page++) {
    const url = `${API}/shelter/payouts?network=mainnet&limit=2000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const body = await res.json();
    meta ??= body;
    events.push(...body.events);
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  if (!meta) throw new Error('no data');
  const out = {
    asOf: meta.generatedAt,
    source: `${API}/shelter/payouts?network=mainnet`,
    note: 'Bundled fallback of the public payout index. Regenerate with `npm run snapshot`.',
    totals: meta.totals,
    count: meta.count,
    // Per split: how far the index had read when the snapshot was taken (for "as of" and staleness).
    contracts: (meta.contracts || []).map((c) => ({
      chainId: c.chainId,
      symbol: c.symbol,
      indexedThrough: c.indexedThrough,
      lastRunFailed: !!c.lastRunFailed,
      count: c.count,
    })),
    events: events.map((e) => ({
      chainId: e.chainId,
      contract: e.contract,
      txHash: e.txHash,
      logIndex: e.logIndex,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      kind: e.kind,
      symbol: e.symbol,
      amount18: e.amount18,
      source: sourceOf(e.memo),
      // The only memo content kept: the public rave order id (names come from GET /rave/cats).
      ...(raveOrderIdOf(e.memo) ? { raveOrderId: raveOrderIdOf(e.memo) } : {}),
    })),
  };
  if (out.events.length !== meta.count) {
    throw new Error(`index lists ${meta.count} events but ${out.events.length} were read`);
  }
  const file = join(ROOT, 'src', 'data', 'snapshot.json');
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${file}: ${out.events.length} payouts, as of ${out.asOf}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
