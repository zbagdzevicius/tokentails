// observe: read-only JSON-RPC reads that tell the agent what is happening.
// - CappedSpender state: caps, what is left today, the float, the split it pays;
// - ShelterSplit payouts over the last 24 h (DisbursementBatch + NativeDisbursementBatch), sorted into
//   public gifts (which the agent may match), and Token Tails' own money (agent gifts, matches, treats);
// - DonateRouter gifts over the same window when TREAT_AGENT_ROUTER is set;
// - the campaign goal (client/public/shelter-payouts/campaign.json, read-only) and its end date;
// - an optional needs list (needs.example.json is a DEMO list, flagged demo: true).
// Nothing here signs or sends anything.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SEL, TOPIC, uintAt, boolAt, addressAt, stringAt, topicAddress, topicUint, formatUnits, toUsdc,
} from './lib/abi.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const CAMPAIGN_FILE = path.join(REPO, 'client/public/shelter-payouts/campaign.json');
export const FACTS_FILE = path.join(REPO, 'client/public/facts/facts.json');
export const NEEDS_EXAMPLE = path.join(HERE, 'needs.example.json');


// ------------------------------------------------------------------ JSON-RPC

export function makeRpc(url, { fetchImpl = globalThis.fetch } = {}) {
  let id = 0;
  return async function rpc(method, params = []) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
    return body.result;
  };
}

const call = (rpc, to, data) => rpc('eth_call', [{ to, data }, 'latest']);

// ------------------------------------------------------------------ memo classes

/** Chains where native mode is allowed: Arc mainnet and testnet (native coin = USDC, 18 decimals) and a
 * plain local anvil (31337). On any other chain the native coin is ETH, MON, AVAX..., not USDC. */
export const NATIVE_USDC_CHAIN_IDS = new Set([5042, 5042002, 31337]);

/** Payers whose tt:* memos are trusted: the spender itself plus TREAT_AGENT_TT_SENDERS (comma-separated,
 * the backend treat and match hot wallets). Anyone can write any memo, so a tt:* memo from anyone else is
 * public money and never counts as a Token Tails gift or a match. */
export function trustedSenders(spender, list = process.env.TREAT_AGENT_TT_SENDERS || '') {
  const out = new Set();
  if (spender) out.add(spender.toLowerCase());
  for (const a of String(list).split(',')) {
    const t = a.trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(t)) out.add(t);
  }
  return out;
}

/**
 * Who the money in a payout batch belongs to, from its memo and payer:
 * - agent:     CappedSpender gifts (paid by the spender, or tt:agent:... from a trusted payer) - Token Tails' money
 * - match:     backend 1:1 matches (tt:match:<8 hex of the donor tx>, trusted payer)        - Token Tails' money
 * - treat:     sponsored treats (tt:<source>:<8 hex>, trusted payer)                         - Token Tails' money
 * - x402:      agent payments for a cat card (x402:<nonce>)                                  - public money
 * - public:    everything else, including tt:* memos from an untrusted payer                 - public money
 * `trusted` is a Set of lowercase addresses (see trustedSenders); the spender always counts.
 */
export function classify(memo, payer, spender, trusted = trustedSenders(spender)) {
  const m = memo || '';
  const p = (payer || '').toLowerCase();
  if (spender && p === spender.toLowerCase()) return 'agent';
  if (m.startsWith('tt:') && trusted.has(p)) {
    if (m.startsWith('tt:agent:')) return 'agent';
    if (m.startsWith('tt:match:')) return 'match';
    return 'treat';
  }
  if (m.startsWith('x402:')) return 'x402';
  return 'public';
}

/** The 8-hex tx prefixes already matched, from tt:agent:match-<8 hex> / tt:match:<8 hex> memos.
 * Pass batches ({memo, payer}) and the trusted set: memos from any other payer are ignored, so a stranger
 * cannot mark a real gift as matched. Plain strings are accepted (all trusted) for callers that pre-filter. */
export function matchedPrefixes(items, trusted = null) {
  const out = new Set();
  for (const it of items) {
    const memo = typeof it === 'string' ? it : it?.memo;
    if (typeof it !== 'string' && trusted && !trusted.has((it?.payer || '').toLowerCase())) continue;
    const hit = /^tt:(?:agent:match-|match:)([0-9a-f]{8})/.exec(memo || '');
    if (hit) out.add(hit[1]);
  }
  return out;
}

/** ShelterSplit.preview(amount)'s third return value: what would go to the split's treasury. */
export async function previewToTreasury(rpc, split, amountRaw) {
  const data = SEL.preview + amountRaw.toString(16).padStart(64, '0');
  return uintAt(await call(rpc, split, data), 2);
}

// ------------------------------------------------------------------ logs

async function getLogsChunked(rpc, { address, topics, fromBlock, toBlock, chunk }) {
  // Providers cap the block range per query (and an anvil fork forwards to its upstream). On a
  // range error the chunk halves and the same window is retried, down to 100 blocks.
  const out = [];
  let size = chunk;
  for (let start = fromBlock; start <= toBlock;) {
    const end = Math.min(toBlock, start + size - 1);
    try {
      const logs = await rpc('eth_getLogs', [{
        address, topics, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16),
      }]);
      out.push(...logs);
      start = end + 1;
    } catch (e) {
      if (size <= 100 || !/range|limit|too (large|many)|exceed/i.test(e.message)) throw e;
      size = Math.floor(size / 2);
    }
  }
  return out;
}

/** Decode a ShelterSplit (Native)DisbursementBatch log. */
export function decodeBatch(log, { tokenDecimals }) {
  const nativeEvent = log.topics[0] === TOPIC.NativeDisbursementBatch;
  const decimals = nativeEvent ? 18 : tokenDecimals;
  const d = log.data;
  return {
    batchId: topicUint(log.topics[1]).toString(),
    payer: topicAddress(log.topics[2]),
    amountUsdc: toUsdc(uintAt(d, 0), decimals),
    toSheltersUsdc: toUsdc(uintAt(d, 1), decimals),
    toTreasuryUsdc: toUsdc(uintAt(d, 2), decimals),
    memo: stringAt(d, 4),
    native: nativeEvent,
    tx: log.transactionHash,
    block: Number(BigInt(log.blockNumber)),
  };
}

/** Decode a DonateRouter RouterDonation log (path 1 = native, 18 decimals; else token units). */
export function decodeRouterDonation(log, { tokenDecimals }) {
  const d = log.data;
  const pathId = Number(uintAt(d, 1));
  const decimals = pathId === 1 ? 18 : tokenDecimals;
  return {
    donor: topicAddress(log.topics[1]),
    batchId: topicUint(log.topics[2]).toString(),
    amountUsdc: toUsdc(uintAt(d, 0), decimals),
    path: ['authorization', 'native', 'flush'][pathId] || `path-${pathId}`,
    // A flush memo is set by whoever calls flush first: never attribute it.
    memo: pathId === 2 ? '' : stringAt(d, 2),
    tx: log.transactionHash,
  };
}

// ------------------------------------------------------------------ campaign

export async function readCampaign({ campaignFile = CAMPAIGN_FILE, factsFile = FACTS_FILE, now = Date.now() } = {}) {
  const c = JSON.parse(await readFile(campaignFile, 'utf8'));
  let endDate = process.env.TREAT_AGENT_CAMPAIGN_END || null;
  if (!endDate) {
    try {
      const facts = JSON.parse(await readFile(factsFile, 'utf8'));
      endDate = facts.facts.find((f) => f.key === 'campaign')?.goal?.endDate || null;
    } catch { /* optional */ }
  }
  const daysLeft = endDate ? Math.max(0, Math.ceil((Date.parse(endDate + 'T23:59:59Z') - now) / 86_400_000)) : null;
  return {
    name: c.name,
    goalUsdc: Number(c.goalUsdc),
    startDate: c.startDate,
    endDate,
    daysLeft,
    chainId: c.chainId,
    fromBlock: c.fromBlock,
    shelter: { name: c.shelter?.name, wallet: c.shelter?.wallet, handover: c.shelter?.handover },
  };
}

export async function readNeeds(file) {
  if (!file) return null;
  const n = JSON.parse(await readFile(file, 'utf8'));
  return { demo: n.demo === true, note: n.note || '', items: Array.isArray(n.items) ? n.items : [] };
}

// ------------------------------------------------------------------ observe

export async function observe({
  rpc, spender, router = process.env.TREAT_AGENT_ROUTER || null, hours = 24, chunk = Number(process.env.TREAT_AGENT_LOG_CHUNK) || 50_000,
  campaignFile, factsFile, needsFile = process.env.TREAT_AGENT_NEEDS || NEEDS_EXAMPLE, now = Date.now(),
  ttSenders = process.env.TREAT_AGENT_TT_SENDERS || '',
  matchRouter = process.env.TREAT_AGENT_MATCH_ROUTER === '1',
}) {
  const chainId = Number(BigInt(await rpc('eth_chainId')));
  const head = await rpc('eth_getBlockByNumber', ['latest', false]);
  const toBlock = Number(BigInt(head.number));
  const headTs = Number(BigInt(head.timestamp));

  // Spender state.
  const native = boolAt(await call(rpc, spender, SEL.native), 0);
  const split = addressAt(await call(rpc, spender, SEL.split), 0);
  const agent = addressAt(await call(rpc, spender, SEL.agent), 0);
  if (native && !NATIVE_USDC_CHAIN_IDS.has(chainId)) {
    // Native mode outside Arc would give ETH/MON/AVAX while every number here says USDC.
    throw new Error(`native-mode spender on chain ${chainId}: native mode is Arc only (${[...NATIVE_USDC_CHAIN_IDS].join(', ')}), where the native coin is USDC`);
  }
  let tokenDecimals = 6;
  let token = null;
  if (!native) {
    token = addressAt(await call(rpc, spender, SEL.token), 0);
    tokenDecimals = Number(uintAt(await call(rpc, token, SEL.decimals), 0));
  } else {
    // The split's payout token, for decoding its ERC-20 batches (6 decimals on Arc's USDC view).
    try {
      const t = addressAt(await call(rpc, split, SEL.token), 0);
      tokenDecimals = Number(uintAt(await call(rpc, t, SEL.decimals), 0));
    } catch { /* keep 6 */ }
  }
  const unit = native ? 18 : tokenDecimals;
  const u = async (sel) => uintAt(await call(rpc, spender, sel), 0);
  const [perTx, daily, remaining, spent, float] = await Promise.all([
    u(SEL.perTxCap), u(SEL.dailyCap), u(SEL.remainingToday), u(SEL.spentToday), u(SEL.floatBalance),
  ]);
  const paused = boolAt(await call(rpc, split, SEL.paused), 0);

  // Block window covering `hours`, estimated from the block rate over the last 1000 blocks.
  const back = Math.min(1000, toBlock);
  const past = await rpc('eth_getBlockByNumber', ['0x' + (toBlock - back).toString(16), false]);
  const secsPerBlock = back > 0 ? Math.max(0.05, (headTs - Number(BigInt(past.timestamp))) / back) : 1;
  const fromBlock = Math.max(0, toBlock - Math.ceil((hours * 3600) / secsPerBlock));

  const batchLogs = await getLogsChunked(rpc, {
    address: split,
    topics: [[TOPIC.DisbursementBatch, TOPIC.NativeDisbursementBatch]],
    fromBlock, toBlock, chunk,
  });
  const batches = batchLogs.map((l) => decodeBatch(l, { tokenDecimals }));
  const trusted = trustedSenders(spender, ttSenders);
  const matched = matchedPrefixes(batches, trusted);

  let routerGifts = [];
  if (router) {
    const logs = await getLogsChunked(rpc, { address: router, topics: [TOPIC.RouterDonation], fromBlock, toBlock, chunk });
    routerGifts = logs.map((l) => decodeRouterDonation(l, { tokenDecimals }));
  }
  const routerByTx = new Map(routerGifts.map((g) => [g.tx, g]));

  const totals = { public: 0, x402: 0, agent: 0, match: 0, treat: 0 };
  const publicGifts = [];
  for (const b of batches) {
    const kind = classify(b.memo, b.payer, spender, trusted);
    totals[kind] = round6(totals[kind] + b.toSheltersUsdc);
    if (kind === 'public' || kind === 'x402') {
      const r = routerByTx.get(b.tx);
      publicGifts.push({
        tx: b.tx,
        txPrefix: b.tx.slice(2, 10).toLowerCase(),
        amountUsdc: b.toSheltersUsdc,
        kind: r ? `router-${r.path}` : kind,
        block: b.block,
        matched: matched.has(b.tx.slice(2, 10).toLowerCase()),
      });
    }
  }

  const campaign = await readCampaign({ campaignFile, factsFile, now });
  const needs = await readNeeds(needsFile).catch(() => null);

  return {
    at: new Date(now).toISOString(),
    chainId,
    window: { hours, fromBlock, toBlock, secsPerBlock: round6(secsPerBlock) },
    spender: {
      address: spender.toLowerCase(),
      agent,
      native,
      unitDecimals: unit,
      token,
      perTxCapUsdc: toUsdc(perTx, unit),
      dailyCapUsdc: toUsdc(daily, unit),
      spentTodayUsdc: toUsdc(spent, unit),
      remainingTodayUsdc: toUsdc(remaining, unit),
      floatUsdc: toUsdc(float, unit),
      raw: { perTx: perTx.toString(), daily: daily.toString(), remaining: remaining.toString(), float: float.toString() },
    },
    split: { address: split, paused },
    trustedTtSenders: trusted.size,
    last24h: {
      publicGiftsUsdc: round6(totals.public + totals.x402),
      tokenTailsUsdc: round6(totals.agent + totals.match + totals.treat),
      agentGiftsUsdc: totals.agent,
      matchesUsdc: totals.match,
      treatsUsdc: totals.treat,
      publicGifts,
      // Newest first: the agent matches the freshest gift. Router gifts are matched by the backend's
      // ShelterMatchService (SHELTER_MATCH_ENABLED), so the agent skips them unless
      // TREAT_AGENT_MATCH_ROUTER=1 (run only one matcher, or a gift is matched twice).
      unmatchedPublicGifts: publicGifts
        .filter((g) => !g.matched && (matchRouter || !g.kind.startsWith('router-')))
        .sort((a, b) => b.block - a.block),
      routerMatchedByBackend: !matchRouter,
      routerGifts: routerGifts.length,
    },
    campaign: {
      ...campaign,
      sameChain: campaign.chainId === chainId,
      neededPerDayUsdc: campaign.daysLeft ? round6(campaign.goalUsdc / campaign.daysLeft) : null,
      note: campaign.chainId === chainId
        ? 'Campaign chain: the 24 h totals above count toward the goal.'
        : `The campaign goal is tracked on chain ${campaign.chainId}; this run reads chain ${chainId} (test USDC, no real money), so its totals do not count toward the goal.`,
    },
    needs,
  };
}

export const round6 = (x) => Math.round(x * 1e6) / 1e6;
export { formatUnits };
