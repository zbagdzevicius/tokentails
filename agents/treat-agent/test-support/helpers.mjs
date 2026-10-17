// Test helpers: ABI encoding for hand-built payloads and a stub JSON-RPC endpoint.
import { SEL, TOPIC } from '../lib/abi.mjs';

export const w = (v) => BigInt(v).toString(16).padStart(64, '0');
export const addrWord = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** ABI-encode (uint256..., string) where the string is the last head slot. */
export function encodeWithString(uints, str) {
  const heads = uints.map(w);
  const offset = (uints.length + 1) * 32;
  const bytes = Buffer.from(str, 'utf8');
  const padded = bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0');
  return '0x' + heads.join('') + w(offset) + w(bytes.length) + padded;
}

export const SPENDER = '0x' + 'c0'.repeat(20);
export const SPLIT = '0x' + '5a'.repeat(20);
export const AGENT = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
export const TOKEN = '0x3600000000000000000000000000000000000000';
export const DONOR = '0x' + 'd0'.repeat(20);
export const OWNER = '0x' + '0e'.repeat(20);
export const ROUTER = '0x' + 'ab'.repeat(20);
/** The stub head: block 200000 at 2026-10-03T04:00:00Z, 0.5 s blocks. */
export const HEAD_BLOCK = 200_000;
export const HEAD_TS = 1_791_000_000;
export const NOW_MS = HEAD_TS * 1000;
/** A distinct tx hash whose 8-hex prefix differs per n (old-style match memos key on that prefix). */
export const txh = (n) => '0x' + BigInt(n).toString(16).padStart(8, '0') + '0'.repeat(56);

export function batchLog({ batchId, payer, amount, memo, native = true, tx, block = 100, logIndex = 0 }) {
  return {
    logIndex: '0x' + logIndex.toString(16),
    address: SPLIT,
    topics: [native ? TOPIC.NativeDisbursementBatch : TOPIC.DisbursementBatch, '0x' + w(batchId), '0x' + addrWord(payer)],
    data: encodeWithString([amount, amount, 0, 1], memo),
    transactionHash: tx,
    blockNumber: '0x' + block.toString(16),
  };
}

/** A CappedSpender AgentGift log (on `spender`, default SPENDER). */
export function agentGiftLog({ batchId = 1, amount, memo, spent = amount, tx, block = 199_900, logIndex = 1, spender = SPENDER }) {
  return {
    address: spender,
    topics: [TOPIC.AgentGift, '0x' + w(batchId)],
    data: '0x' + w(amount) + w(96) + w(spent) + encodeWithString([], memo).slice(2 + 64),
    transactionHash: tx,
    blockNumber: '0x' + block.toString(16),
    logIndex: '0x' + logIndex.toString(16),
  };
}

/** A DonateRouter RouterDonation log (path 0 authorization, 1 native, 2 flush). */
export function routerLog({ donor, batchId, amount, path = 1, memo = '', tx, block }) {
  return {
    address: ROUTER,
    topics: [TOPIC.RouterDonation, '0x' + addrWord(donor), '0x' + w(batchId), '0x' + w(0)],
    data: encodeWithString([amount, path], memo),
    transactionHash: tx,
    blockNumber: '0x' + block.toString(16),
    logIndex: '0x0',
  };
}

/** A fetch() that answers JSON-RPC like a node with one CappedSpender (native mode) and a split. */
export function stubRpc({ chainId = 31337, remaining = 10n ** 17n, spent = 0n, perTx = 5n * 10n ** 16n, daily = 10n ** 17n, float = 10n ** 18n, paused = false, native = true, logs = [], toTreasury = 0n, owner = OWNER, split = SPLIT, agent = AGENT, txReceipts = {}, vaults = {} } = {}) {
  const calls = [];
  // More CappedSpender vaults (a multi-sponsor desk): { <address>: { remaining, spent, perTx, daily, float, owner, agent, split } }.
  // Missing fields default to the main vault's values.
  const extra = new Map(Object.entries(vaults).map(([a, v]) => [a.toLowerCase(), v]));
  const answer = (method, params) => {
    calls.push(method);
    switch (method) {
      case 'eth_chainId': return '0x' + chainId.toString(16);
      case 'eth_getBlockByNumber': {
        const tag = params[0];
        if (tag === 'latest') return { number: '0x' + (200_000).toString(16), timestamp: '0x' + (1_791_000_000).toString(16) };
        const n = Number(BigInt(tag));
        return { number: tag, timestamp: '0x' + Math.floor(1_791_000_000 - (200_000 - n) / 2).toString(16) }; // 0.5 s blocks
      }
      case 'eth_call': {
        const { to, data } = params[0];
        const t = to.toLowerCase();
        if (t === SPENDER || extra.has(t)) {
          const v = { native, split, agent, owner, perTx, daily, remaining, spent, float, ...(extra.get(t) || {}) };
          switch (data) {
            case SEL.native: return '0x' + w(v.native ? 1 : 0);
            case SEL.split: return '0x' + addrWord(v.split);
            case SEL.agent: return '0x' + addrWord(v.agent);
            case SEL.owner: return '0x' + addrWord(v.owner);
            case SEL.token: return '0x' + addrWord(TOKEN);
            case SEL.perTxCap: return '0x' + w(v.perTx);
            case SEL.dailyCap: return '0x' + w(v.daily);
            case SEL.remainingToday: return '0x' + w(v.remaining);
            case SEL.spentToday: return '0x' + w(v.spent);
            case SEL.floatBalance: return '0x' + w(v.float);
          }
        }
        if (t === SPLIT && data === SEL.paused) return '0x' + w(paused ? 1 : 0);
        if (t === SPLIT && data.startsWith(SEL.preview)) return '0x' + w(0x60) + w(0x80) + w(toTreasury) + w(0) + w(0);
        if (t === SPLIT && data === SEL.token) return '0x' + addrWord(TOKEN);
        if (t === TOKEN && data === SEL.decimals) return '0x' + w(6);
        throw new Error(`unexpected eth_call ${to} ${data}`);
      }
      case 'eth_getLogs': {
        const f = params[0];
        const from = Number(BigInt(f.fromBlock));
        const to = Number(BigInt(f.toBlock));
        const topics = [].concat(f.topics[0]);
        return logs.filter((l) => l.address.toLowerCase() === f.address.toLowerCase() && topics.includes(l.topics[0]) && Number(BigInt(l.blockNumber)) >= from && Number(BigInt(l.blockNumber)) <= to);
      }
      case 'eth_getTransactionReceipt': return txReceipts[params[0]] ?? null;
      default: throw new Error(`unexpected ${method}`);
    }
  };
  const fetchImpl = async (_url, init) => {
    const req = JSON.parse(init.body);
    let result;
    try {
      result = answer(req.method, req.params);
    } catch (e) {
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: req.id, error: { message: e.message } }) };
    }
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: req.id, result }) };
  };
  return { fetchImpl, calls };
}

/** A Messages API response with one tool_use block. */
export function llmReply(name, input, extra = {}) {
  const msg = { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_1', name, input }], ...extra };
  return async (_url, init) => {
    llmReply.lastBody = JSON.parse(init.body);
    llmReply.lastHeaders = init.headers;
    return { ok: true, status: 200, json: async () => msg, text: async () => JSON.stringify(msg) };
  };
}

/** A minimal observation for decide() tests. */
export function obsFixture(over = {}) {
  return {
    chainId: 31337,
    spender: { address: SPENDER, agent: AGENT, native: true, unitDecimals: 18, perTxCapUsdc: 0.05, dailyCapUsdc: 0.1, spentTodayUsdc: 0, remainingTodayUsdc: 0.1, floatUsdc: 1, ...(over.spender || {}) },
    split: { address: SPLIT, paused: false },
    window: { hours: 24, fromBlock: 0, toBlock: 1, secsPerBlock: 0.5 },
    last24h: { publicGiftsUsdc: 0.02, tokenTailsUsdc: 0, agentGiftsUsdc: 0, matchesUsdc: 0, treatsUsdc: 0, publicGifts: [], unmatchedPublicGifts: [{ tx: '0xabcdef0100', txPrefix: 'abcdef01', amountUsdc: 0.02, kind: 'public', matched: false }], routerGifts: 0, ...(over.last24h || {}) },
    campaign: { name: 'Pink Paw autumn rescue', goalUsdc: 90, endDate: '2027-01-31', daysLeft: 120, sameChain: false, neededPerDayUsdc: 0.75, note: 'test USDC', shelter: { name: 'Pink Paw' } },
    needs: { demo: true, note: 'demo', items: [] },
  };
}

/** A valid sponsor.json object for the stub chain (31337), with overrides merged into policy/eligible. */
export function sponsorRaw({ policy = {}, eligible = {}, ...top } = {}) {
  return {
    schema: 'tt.match-desk.sponsor/v1',
    sponsor: { id: 'motored', name: 'Motored.lt', relatedParty: true, relation: "founder's company" },
    chainId: 31337,
    spender: { address: SPENDER, deployBlock: 150_000, owner: OWNER, agent: AGENT },
    split: SPLIT,
    router: null,
    shelter: { name: 'Pink Paw (Rožinė pėdutė)', wallet: '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37', custody: 'held-by-token-tails' },
    policy: {
      ratioBps: 10000,
      perGiftMaxUsdc: '0.05',
      perDonorDailyMaxUsdc: '0.05',
      budgetUsdc: '1.00',
      minGiftUsdc: '0.01',
      maxGiftAgeHours: 48,
      validFrom: '2026-10-01T00:00:00Z',
      eligible: { chains: [31337], kinds: ['public', 'router-native', 'router-authorization'], senders: 'any', matchTreats: false, treatsDailyMaxUsdc: '0', ...eligible },
      excludedSenders: ['0x7b136b872bEad1dAE557d1286f125B7A8A197C9A'],
      farming: { maxGiftsPerDonorDay: 5 },
      pace: { from: '2026-10-01', to: '2026-10-31', floatLowUsdc: '0.10' },
      refund: { after: '2026-11-15', to: 'owner' },
      plannedTtlMinutes: 30,
      ...policy,
    },
    ...top,
  };
}

/** A fetch() for the three read endpoints. routes: { payouts, donate, match } -> body | { status } | 'throw'. */
export function httpStub(routes = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers });
    const u = new URL(url);
    const key = u.pathname.endsWith('/payouts') ? 'payouts' : u.pathname.endsWith('/donate/status') ? 'donate' : u.pathname.endsWith('/match/status') ? 'match' : null;
    const r = routes[key];
    if (r === undefined || r === 'throw') throw new Error('connect ECONNREFUSED');
    if (r && typeof r.status === 'number') return { ok: false, status: r.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { fetchImpl, seen };
}

export const SPENDER_B = '0x' + 'c1'.repeat(20);
export const OWNER_B = '0x' + '0f'.repeat(20);

/**
 * A valid desk.json (tt.match-desk.desk/v2) for the stub chain (31337) with two sponsors: motored
 * (SPENDER, OWNER, priority 20) and tokentails (SPENDER_B, OWNER_B, priority 10). `a` / `b` patch each
 * sponsor entry; `policy` patches the shared policy.
 */
export function deskRaw({ a = {}, b = {}, policy = {}, ...top } = {}) {
  const entry = (over) => ({
    ratioBps: 10000,
    perGiftMaxUsdc: '0.05',
    budgetUsdc: '1.00',
    validFrom: '2026-10-01T00:00:00Z',
    pace: { from: '2026-10-01', to: '2026-10-31', floatLowUsdc: '0.10' },
    refund: { after: '2026-11-15', to: 'owner' },
    ...over,
  });
  return {
    schema: 'tt.match-desk.desk/v2',
    chainId: 31337,
    split: SPLIT,
    router: null,
    shelter: { name: 'Pink Paw (Rožinė pėdutė)', wallet: '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37', custody: 'held-by-token-tails' },
    agent: AGENT,
    policy: {
      perDonorDailyMaxUsdc: '0.05',
      minGiftUsdc: '0.01',
      maxGiftAgeHours: 48,
      eligible: { chains: [31337], kinds: ['public', 'router-native', 'router-authorization'], senders: 'any', matchTreats: false, treatsDailyMaxUsdc: '0' },
      excludedSenders: ['0x7b136b872bEad1dAE557d1286f125B7A8A197C9A'],
      farming: { maxGiftsPerDonorDay: 5 },
      plannedTtlMinutes: 30,
      ...policy,
    },
    sponsors: [
      entry({ id: 'motored', name: 'Motored.lt', relatedParty: true, relation: "founder's company", spender: { address: SPENDER, deployBlock: 150_000, owner: OWNER }, priority: 20, ...a }),
      entry({ id: 'tokentails', name: 'Token Tails', relatedParty: true, relation: "operator (Token Tails' own money)", spender: { address: SPENDER_B, deployBlock: 150_000, owner: OWNER_B }, priority: 10, ...b }),
    ],
    ...top,
  };
}
