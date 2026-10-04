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

export function batchLog({ batchId, payer, amount, memo, native = true, tx, block = 100 }) {
  return {
    address: SPLIT,
    topics: [native ? TOPIC.NativeDisbursementBatch : TOPIC.DisbursementBatch, '0x' + w(batchId), '0x' + addrWord(payer)],
    data: encodeWithString([amount, amount, 0, 1], memo),
    transactionHash: tx,
    blockNumber: '0x' + block.toString(16),
  };
}

/** A fetch() that answers JSON-RPC like a node with one CappedSpender (native mode) and a split. */
export function stubRpc({ chainId = 31337, remaining = 10n ** 17n, spent = 0n, perTx = 5n * 10n ** 16n, daily = 10n ** 17n, float = 10n ** 18n, paused = false, native = true, logs = [], toTreasury = 0n } = {}) {
  const calls = [];
  const answer = (method, params) => {
    calls.push(method);
    switch (method) {
      case 'eth_chainId': return '0x' + chainId.toString(16);
      case 'eth_getBlockByNumber': {
        const tag = params[0];
        if (tag === 'latest') return { number: '0x' + (200_000).toString(16), timestamp: '0x' + (1_791_000_000).toString(16) };
        const n = Number(BigInt(tag));
        return { number: tag, timestamp: '0x' + (1_791_000_000 - (200_000 - n) / 2).toString(16) }; // 0.5 s blocks
      }
      case 'eth_call': {
        const { to, data } = params[0];
        const t = to.toLowerCase();
        if (t === SPENDER) {
          switch (data) {
            case SEL.native: return '0x' + w(native ? 1 : 0);
            case SEL.split: return '0x' + addrWord(SPLIT);
            case SEL.agent: return '0x' + addrWord(AGENT);
            case SEL.token: return '0x' + addrWord(TOKEN);
            case SEL.perTxCap: return '0x' + w(perTx);
            case SEL.dailyCap: return '0x' + w(daily);
            case SEL.remainingToday: return '0x' + w(remaining);
            case SEL.spentToday: return '0x' + w(spent);
            case SEL.floatBalance: return '0x' + w(float);
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
