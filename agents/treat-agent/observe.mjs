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
  SEL, TOPIC, uintAt, boolAt, addressAt, stringAt, topicAddress, topicUint, formatUnits, toUsdc, rawToMicro, formatMicro,
} from './lib/abi.mjs';
import { GuardError } from './lib/policy.mjs';
import { readBackend, routerBlocked, splitMismatch, DEFAULT_API } from './lib/backend.mjs';
import { loadEnvelopes, loadPublished, saveEnvelope, readJson, PUBLISHED_STATEMENT } from './lib/receipt.mjs';
import { readAgentGifts, witness } from './lib/witness.mjs';
import { donorKeyOf } from './lib/checker.mjs';

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
    if (body.error) {
      // Keep revert data in the message: decodeRevert() reads the error selector from it.
      const data = typeof body.error.data === 'string' ? ` (data ${body.error.data})` : '';
      throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}${data}`);
    }
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

export async function getLogsChunked(rpc, { address, topics, fromBlock, toBlock, chunk }) {
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
    logIndex: Number(BigInt(log.logIndex ?? 0)),
    toSheltersRaw: uintAt(d, 1).toString(),
    decimals,
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

// ------------------------------------------------------------------ shared reads

/** CappedSpender state: mode, split, agent, units and the raw caps (bigint). */
export async function readSpenderState(rpc, spender, chainId) {
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
  return { native, split, agent, token, tokenDecimals, unit, perTx, daily, remaining, spent, float };
}

/** Block window covering `hours`, estimated from the block rate over the last 1000 blocks. */
export async function blockWindow(rpc, { toBlock, headTs, hours }) {
  const back = Math.min(1000, toBlock);
  const past = await rpc('eth_getBlockByNumber', ['0x' + (toBlock - back).toString(16), false]);
  const secsPerBlock = back > 0 ? Math.max(0.05, (headTs - Number(BigInt(past.timestamp))) / back) : 1;
  const fromBlock = Math.max(0, toBlock - Math.ceil((hours * 3600) / secsPerBlock));
  return { secsPerBlock, fromBlock };
}

/** Space RPC calls at least `ms` apart (Arc mainnet's public RPC answers about 2 calls a second). */
export function withGap(rpc, ms) {
  if (!ms) return rpc;
  let chain = Promise.resolve();
  let last = 0;
  return (method, params) => {
    const p = chain.then(async () => {
      const wait = last + ms - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return rpc(method, params);
    });
    chain = p.catch(() => {});
    return p;
  };
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

  const { native, split, agent, token, tokenDecimals, unit, perTx, daily, remaining, spent, float } = await readSpenderState(rpc, spender, chainId);
  const paused = boolAt(await call(rpc, split, SEL.paused), 0);
  const { secsPerBlock, fromBlock } = await blockWindow(rpc, { toBlock, headTs, hours });

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

// ------------------------------------------------------------------ match desk (MATCH-DESK.md, "Observe additions")

const DAY_MS = 86_400_000;
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayIndex = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / DAY_MS);

/** Default gap between RPC calls: 500 ms on Arc mainnet's public RPC, 0 elsewhere. */
export function callGapMs(chainId, env = process.env) {
  const v = env.MATCH_DESK_CALL_GAP_MS;
  if (v !== undefined && v !== '' && Number.isFinite(Number(v))) return Math.max(0, Number(v));
  return chainId === 5042 ? 500 : 0;
}

/**
 * Receipts that hold money or gifts: reconciled, sent (a tx hash, or an unknown outcome: hash null),
 * mismatch (money moved), planned --send receipts (unknown outcome, no TTL), and other planned ones
 * within the TTL. `mode` is the current round's mode: a dry-run
 * receipt blocks its gifts only for other dry runs, so a --send or --fork round right after a dry run is
 * not held. A printed command the founder ran by hand is still caught: the same gifts give the same
 * memo, which the witness and the on-chain idempotency check both read.
 */
export function isCommitted(env, now, ttlMinutes, mode = 'dry-run') {
  if (['reconciled', 'sent', 'mismatch'].includes(env.status)) return true;
  if (env.status === 'planned') {
    // A --send receipt still 'planned' means the process died while cast ran (Ctrl-C kills both): the
    // outcome is unknown, so it stays committed past the TTL, like 'sent' with no hash, until the
    // witness sees its memo or a human runs --release.
    if (env.mode === 'send') return true;
    if (env.mode === 'dry-run' && mode !== 'dry-run') return false;
    return now - Date.parse(env.createdAt) <= ttlMinutes * 60_000;
  }
  return false;
}

/** File in the state dir: { "<orphan tx>": { memo, at } } written by run.mjs --ack-orphan. */
export const ORPHAN_ACKS = 'orphan-acks.json';

/** Memo prefixes that mark Token Tails' own money (agent gifts, backend matches). Never matched, whoever paid. */
export const TT_INTERNAL_MEMO = /^tt:(?:agent|match):/;

/**
 * Observe for the match desk. Reuses the treat-agent reads and returns the old observation shape plus
 * obs.matchDesk. Witness runs here (before decide) and saves the receipts it moves.
 * Throws GuardError (run.mjs exits 2) when the chain, split, agent or owner differ from sponsor.json.
 */
export async function observeMatchDesk({
  rpc, sponsor, policyHash, now = Date.now(), fetchImpl = globalThis.fetch, dir = null,
  api = process.env.MATCH_DESK_API ?? DEFAULT_API, ttSenders = process.env.TREAT_AGENT_TT_SENDERS || '',
  chunk = Number(process.env.TREAT_AGENT_LOG_CHUNK) || 50_000, statementFile = PUBLISHED_STATEMENT,
  campaignFile, factsFile, mode = 'dry-run',
}) {
  const S = sponsor;
  const P = S.policy;
  const spender = S.spender.address;
  if (!spender || S.spender.deployBlock === null) {
    throw new GuardError('sponsor.json has no spender address or deploy block yet (init state): deploy, then paste both');
  }
  const chainId = Number(BigInt(await rpc('eth_chainId')));
  if (chainId !== S.chainId) throw new GuardError(`eth_chainId ${chainId} != sponsor.json chainId ${S.chainId}`);
  const head = await rpc('eth_getBlockByNumber', ['latest', false]);
  const toBlock = Number(BigInt(head.number));
  const headTs = Number(BigInt(head.timestamp));

  const st = await readSpenderState(rpc, spender, chainId);
  const owner = addressAt(await call(rpc, spender, SEL.owner), 0);
  if (st.split.toLowerCase() !== S.split) throw new GuardError(`on-chain split ${st.split} != sponsor.json split ${S.split}`);
  if (S.spender.agent && st.agent.toLowerCase() !== S.spender.agent) throw new GuardError(`on-chain agent ${st.agent} != sponsor.json agent ${S.spender.agent}`);
  if (S.spender.owner && owner.toLowerCase() !== S.spender.owner) throw new GuardError(`on-chain owner ${owner} != sponsor.json owner ${S.spender.owner}`);
  const paused = boolAt(await call(rpc, S.split, SEL.paused), 0);

  // Window: maxGiftAgeHours (plus a margin for the block-time estimate), never before validFrom.
  // The exact age and validFrom checks run on block timestamps below.
  const { secsPerBlock, fromBlock: ageFrom } = await blockWindow(rpc, { toBlock, headTs, hours: P.maxGiftAgeHours * 1.1 + 0.1 });
  const validFromS = Math.floor(P.validFromMs / 1000);
  const sinceValid = Math.max(0, toBlock - Math.ceil(Math.max(0, headTs - validFromS) / secsPerBlock * 1.1) - 10);
  const fromBlock = Math.max(ageFrom, sinceValid);

  const backend = await readBackend({ api, chainId, split: S.split, fetchImpl, now });
  const getLogs = (f) => getLogsChunked(rpc, { ...f, chunk });

  const batches = (await getLogs({ address: S.split, topics: [[TOPIC.DisbursementBatch, TOPIC.NativeDisbursementBatch]], fromBlock, toBlock }))
    .map((l) => decodeBatch(l, { tokenDecimals: st.tokenDecimals }));
  const routerByKey = new Map();
  if (S.router) {
    const logs = await getLogs({ address: S.router, topics: [TOPIC.RouterDonation], fromBlock, toBlock });
    for (const r of logs.map((l) => decodeRouterDonation(l, { tokenDecimals: st.tokenDecimals }))) {
      routerByKey.set(`${r.tx.toLowerCase()}|${r.batchId}`, r);
    }
  }
  const agentGifts = await readAgentGifts({ getLogs, spender, fromBlock: S.spender.deployBlock, toBlock });

  // Receipts: local state, plus anything already published for this spender.
  const local = dir ? await loadEnvelopes(dir) : { envelopes: [], bad: [] };
  const bySha = new Map(local.envelopes.map((e) => [e.sha256, e]));
  for (const e of await loadPublished(statementFile, spender)) if (!bySha.has(e.sha256)) bySha.set(e.sha256, e);
  const envelopes = [...bySha.values()].filter((e) => e.receipt.spender === spender && e.receipt.chainId === chainId);
  const w = await witness({
    envelopes, events: agentGifts, sponsorId: S.sponsor.id, now, ttlMinutes: P.plannedTtlMinutes,
    getTxReceipt: (h) => rpc('eth_getTransactionReceipt', [h]),
  });
  if (dir) for (const e of w.changed) await saveEnvelope(dir, e);
  const flagged = dir ? await readJson(path.join(dir, 'flagged.json'), {}) : {};
  // Orphans (our memo on-chain, no receipt here) are reported and hold every match until a human
  // acknowledges each one (run.mjs --ack-orphan <tx>): their gifts are unknown and could be matched twice.
  const orphanAcks = dir ? await readJson(path.join(dir, ORPHAN_ACKS), {}) : {};
  const orphans = w.summary.orphans.map((o) => ({ ...o, acked: Object.hasOwn(orphanAcks, o.tx) }));

  // What the receipts already hold.
  const ttl = P.plannedTtlMinutes;
  const today = utcDay(now);
  const giftState = new Map();
  const donorUsedMicro = {};
  let committedMicro = 0n;
  let matchedTodayMicro = 0n;
  for (const e of envelopes) {
    if (!isCommitted(e, now, ttl, mode)) continue;
    committedMicro += BigInt(e.receipt.amountMicro);
    const pending = e.status === 'planned';
    for (const g of e.receipt.gifts) {
      if (giftState.get(g.id) !== 'matched') giftState.set(g.id, pending ? 'pending' : 'matched');
      const key = `${donorKeyOf(g)}|${g.day}`;
      donorUsedMicro[key] = (donorUsedMicro[key] || 0n) + BigInt(g.matchMicro);
      if (g.day === today) matchedTodayMicro += BigInt(g.matchMicro);
    }
  }

  // Gifts (RPC is the truth; the index only supplies timestamps).
  const trusted = trustedSenders(spender, ttSenders);
  const oldMatched = matchedPrefixes(batches, trusted);
  const blockTs = new Map();
  const tsOf = async (b) => {
    const fromIndex = backend.payouts?.ok ? backend.payouts.timestamps[b.tx.toLowerCase()] : undefined;
    if (Number.isSafeInteger(fromIndex)) return fromIndex;
    if (!blockTs.has(b.block)) {
      const blk = await rpc('eth_getBlockByNumber', ['0x' + b.block.toString(16), false]);
      blockTs.set(b.block, Number(BigInt(blk.timestamp)));
    }
    return blockTs.get(b.block);
  };
  // Never matched: the policy's list, the vault, its agent and owner (the sponsor), the split, the router,
  // and the shelter wallet itself (Token Tails still holds it until the handover; matching it is circular).
  const excluded = new Set([
    ...P.excludedSenders, spender, st.agent.toLowerCase(), owner.toLowerCase(), S.split, S.shelter.wallet.toLowerCase(),
    ...(S.router ? [S.router] : []),
  ]);
  const blockRouter = routerBlocked(backend);
  const totals = { public: 0n, x402: 0n, agent: 0n, match: 0n, treat: 0n };
  const gifts = [];
  for (const b of batches) {
    const base = classify(b.memo, b.payer, spender, trusted);
    const micro = rawToMicro(b.toSheltersRaw, b.decimals);
    totals[base] += micro;
    if (base === 'agent' || base === 'match') continue;
    const tx = b.tx.toLowerCase();
    let kind = base;
    let donor = b.payer.toLowerCase();
    if (S.router && donor === S.router) {
      // The router is never the donor: RouterDonation.donor is. Without one (a flush) the donor is unknown.
      const r = routerByKey.get(`${tx}|${b.batchId}`);
      kind = r ? `router-${r.path}` : 'router-flush';
      donor = r && r.path !== 'flush' ? r.donor.toLowerCase() : null;
    }
    const ts = await tsOf(b);
    const g = {
      id: `${tx}:${b.logIndex}`, tx, logIndex: b.logIndex, block: b.block, ts, day: utcDay(ts * 1000), batchId: b.batchId,
      kind, donor, giftMicro: micro, memo: b.memo, status: 'eligible',
    };
    const kindOn = kind === 'treat' ? P.eligible.matchTreats : P.eligible.kinds.has(kind);
    if (giftState.has(g.id)) g.status = giftState.get(g.id);
    else if (oldMatched.has(tx.slice(2, 10))) g.status = 'matched';
    // A tt:agent: / tt:match: memo from an untrusted payer is public money (classify), but it is never
    // matched: it may be Token Tails' own agent money from a payer not listed in TREAT_AGENT_TT_SENDERS,
    // and a stranger who writes that memo only opts out of matching.
    else if (TT_INTERNAL_MEMO.test(b.memo || '')) g.status = 'tt-internal';
    else if (flagged[g.id]) g.status = 'flagged';
    else if (ts < validFromS || now / 1000 - ts > P.maxGiftAgeHours * 3600) g.status = 'too-old';
    else if (!kindOn) g.status = 'kind-off';
    else if (kind.startsWith('router-') && blockRouter) g.status = 'router-backend';
    else if (kind !== 'treat' && (!donor || excluded.has(donor))) g.status = 'excluded-sender';
    else if (kind !== 'treat' && P.eligible.senders !== 'any' && !P.eligible.senders.has(donor)) g.status = 'not-allowlisted';
    else if (micro < P.minGiftMicro) g.status = 'too-small';
    gifts.push(g);
  }
  gifts.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);

  // Farming: more than maxGiftsPerDonorDay gifts from one donor in a UTC day, or >= 3 gifts of exactly minGift.
  const groups = new Map();
  for (const g of gifts) {
    if (!g.donor || g.kind === 'treat') continue;
    const k = `${g.donor}|${g.day}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }
  const farmingSignals = [];
  for (const [k, list] of groups) {
    const [donor, day] = k.split('|');
    const atMin = list.filter((g) => g.giftMicro === P.minGiftMicro).length;
    let reason = null;
    if (list.length > P.farming.maxGiftsPerDonorDay) reason = `${list.length} gifts in one UTC day (more than ${P.farming.maxGiftsPerDonorDay})`;
    else if (atMin >= 3) reason = `${atMin} gifts of exactly the minimum ${formatMicro(P.minGiftMicro)} USDC`;
    if (!reason) continue;
    farmingSignals.push({
      donor, day, gifts: list.length, totalMicro: list.reduce((a, g) => a + g.giftMicro, 0n), reason,
      giftIds: list.filter((g) => g.status === 'eligible').map((g) => g.id),
    });
  }
  farmingSignals.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.donor < b.donor ? -1 : 1));

  // Index cross-check: RPC gifts that a fresh index lacks (informational).
  const p = backend.payouts;
  const indexed = p?.ok ? new Set(p.txs) : null;
  const missing = indexed && !p.stale && p.indexedThrough.block !== null
    ? gifts.filter((g) => g.block <= p.indexedThrough.block && !indexed.has(g.tx)).map((g) => g.id)
    : [];

  const toMicro = (raw) => rawToMicro(raw, st.unit);
  const caps = {
    perTxMicro: toMicro(st.perTx), dailyMicro: toMicro(st.daily), remainingTodayMicro: toMicro(st.remaining),
    floatMicro: toMicro(st.float), unitDecimals: st.unit,
  };
  const leftMicro = P.budgetMicro > committedMicro ? P.budgetMicro - committedMicro : 0n;

  // Pace: cumulative commitments against a straight line from pace.from to pace.to.
  let pace = { from: P.pace.from, to: P.pace.to, daysLeft: 0, targetPerDayMicro: 0n, matchedTodayMicro, status: 'n/a' };
  if (today >= P.pace.from && today <= P.pace.to) {
    const total = dayIndex(P.pace.to) - dayIndex(P.pace.from) + 1;
    const elapsed = dayIndex(today) - dayIndex(P.pace.from) + 1;
    const daysLeft = dayIndex(P.pace.to) - dayIndex(today) + 1;
    const expected = (P.budgetMicro * BigInt(elapsed)) / BigInt(total);
    let status = 'on';
    if (committedMicro > expected + P.perGiftMaxMicro) status = 'ahead';
    else if (committedMicro + P.perGiftMaxMicro < expected) status = 'behind';
    pace = { ...pace, daysLeft, targetPerDayMicro: leftMicro / BigInt(daysLeft), status };
  }

  const network = chainId === 5042 ? 'mainnet' : chainId === 5042002 ? 'testnet' : 'local';
  const matchDesk = {
    sponsor: { id: S.sponsor.id, name: S.sponsor.name, relatedParty: S.sponsor.relatedParty, label: S.sponsor.label },
    policyHash,
    chainId,
    network,
    spender: { address: spender, owner: owner.toLowerCase(), agent: st.agent.toLowerCase(), deployBlock: S.spender.deployBlock },
    split: { address: S.split, paused },
    caps,
    capsRaw: { perTx: st.perTx, daily: st.daily, remaining: st.remaining, spent: st.spent, float: st.float },
    policy: {
      ratioBps: P.ratioBps, perGiftMaxMicro: P.perGiftMaxMicro, perDonorDailyMaxMicro: P.perDonorDailyMaxMicro,
      treatsDailyMaxMicro: P.eligible.treatsDailyMaxMicro, minGiftMicro: P.minGiftMicro,
    },
    budget: { budgetMicro: P.budgetMicro, committedMicro, leftMicro },
    gifts,
    donorUsedMicro,
    farmingSignals,
    pace,
    floatLow: caps.floatMicro < P.pace.floatLowMicro || caps.floatMicro < P.perGiftMaxMicro,
    refundAllowed: now > Date.parse(P.refund.after + 'T23:59:59.999Z'),
    backend: {
      payouts: { ok: !!p?.ok, stale: p?.ok ? p.stale : null, missing, ...(p?.ok ? {} : { error: p?.error }) },
      donateStatus: {
        ok: !!backend.donateStatus?.ok, railState: backend.donateStatus?.railState ?? null,
        splitMatches: backend.donateStatus?.splitMatches ?? null, ...(backend.donateStatus?.ok ? {} : { error: backend.donateStatus?.error }),
      },
      match: { ok: !!backend.match?.ok, state: backend.match?.state ?? null, ...(backend.match?.ok ? {} : { error: backend.match?.error }) },
      splitMismatch: splitMismatch(backend),
      routerBlocked: blockRouter,
    },
    witness: {
      reconciled: w.summary.reconciled, failed: w.summary.failed, expired: w.summary.expired,
      orphans, collisions: w.summary.collisions, stuck: w.summary.stuck,
      badLocalReceipts: local.bad.map((b) => b.file),
    },
  };

  const unit = st.unit;
  const usdc = (m) => Number(formatMicro(m));
  const pub = gifts.filter((g) => g.kind !== 'treat');
  const publicGifts = pub.map((g) => ({
    tx: g.tx, txPrefix: g.tx.slice(2, 10), amountUsdc: usdc(g.giftMicro), kind: g.kind, block: g.block, matched: g.status === 'matched' || g.status === 'pending',
  }));
  let campaign = null;
  try {
    const c = await readCampaign({ campaignFile, factsFile, now });
    campaign = { ...c, sameChain: c.chainId === chainId };
  } catch { /* optional context */ }

  const obs = {
    at: new Date(now).toISOString(),
    chainId,
    window: { hours: P.maxGiftAgeHours, fromBlock, toBlock, secsPerBlock: round6(secsPerBlock) },
    spender: {
      address: spender,
      agent: st.agent,
      native: st.native,
      unitDecimals: unit,
      token: st.token,
      perTxCapUsdc: toUsdc(st.perTx, unit),
      dailyCapUsdc: toUsdc(st.daily, unit),
      spentTodayUsdc: toUsdc(st.spent, unit),
      remainingTodayUsdc: toUsdc(st.remaining, unit),
      floatUsdc: toUsdc(st.float, unit),
      raw: { perTx: st.perTx.toString(), daily: st.daily.toString(), remaining: st.remaining.toString(), float: st.float.toString() },
    },
    split: { address: S.split, paused },
    trustedTtSenders: trusted.size,
    last24h: {
      publicGiftsUsdc: usdc(totals.public + totals.x402),
      tokenTailsUsdc: usdc(totals.agent + totals.match + totals.treat),
      agentGiftsUsdc: usdc(totals.agent),
      matchesUsdc: usdc(totals.match),
      treatsUsdc: usdc(totals.treat),
      publicGifts,
      unmatchedPublicGifts: publicGifts.filter((_, i) => pub[i].status === 'eligible'),
      routerMatchedByBackend: blockRouter,
      routerGifts: routerByKey.size,
    },
    campaign,
    needs: null,
    matchDesk,
  };
  // Not part of the observation hash: the receipts this round read (run.mjs needs them for idempotency).
  Object.defineProperty(obs, 'envelopes', { value: envelopes, enumerable: false });
  return obs;
}
