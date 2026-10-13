// Read-only context from the public Token Tails API (fail-soft). The chain is the truth; these three
// endpoints add timestamps, a cross-check, a split-address hard stop and the backend matcher's state.
// MATCH_DESK_API (default https://api.tokentails.com); "off" skips all three. See MATCH-DESK.md, "HTTP".

export const DEFAULT_API = 'https://api.tokentails.com';
export const TIMEOUT_MS = 10_000;
export const STALE_AFTER_S = 15 * 60;

/** 5042 -> mainnet, 5042002 -> testnet, anything else (a local anvil) -> local. */
export const networkFor = (chainId) => (chainId === 5042 ? 'mainnet' : chainId === 5042002 ? 'testnet' : 'local');

async function getJson(fetchImpl, url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : e.message);
  } finally {
    clearTimeout(timer);
  }
}

const off = (why) => ({
  off: true,
  payouts: { ok: false, error: why },
  donateStatus: { ok: false, error: why },
  match: { ok: false, error: why },
});

/** Normalize GET /shelter/payouts. `timestamps` maps lowercase txHash -> unix seconds. */
export function parsePayouts(body, { split, nowS }) {
  const contracts = Array.isArray(body?.contracts) ? body.contracts : [];
  const c = contracts.find((x) => String(x.contract || '').toLowerCase() === split) || contracts[0] || null;
  const through = c?.indexedThrough || {};
  const timestamps = {};
  const txs = [];
  for (const e of Array.isArray(body?.events) ? body.events : []) {
    if (typeof e?.txHash !== 'string') continue;
    const tx = e.txHash.toLowerCase();
    txs.push(tx);
    if (Number.isSafeInteger(e.timestamp)) timestamps[tx] = e.timestamp;
  }
  const time = Number.isSafeInteger(through.time) ? through.time : null;
  return {
    ok: true,
    indexedThrough: { block: Number.isSafeInteger(through.block) ? through.block : null, time },
    lastRunFailed: !!c?.lastRunFailed,
    stale: time === null || nowS - time > STALE_AFTER_S,
    timestamps,
    txs,
  };
}

/** Normalize GET /shelter/donate/status for `chainId`. splitMatches: null when the backend names no split. */
export function parseDonateStatus(body, { chainId, split }) {
  const chains = Array.isArray(body?.chains) ? body.chains : [];
  let c = chains.find((x) => x?.chainId === chainId) || null;
  if (!c && body?.chainId === chainId) c = body;
  if (!c) return { ok: true, listed: false, enabled: null, railState: null, splitAddress: null, treatsLeftToday: null, splitMatches: null };
  const splitAddress = typeof c.splitAddress === 'string' ? c.splitAddress.toLowerCase() : null;
  return {
    ok: true,
    listed: true,
    enabled: c.enabled ?? null,
    railState: c.railState ?? null,
    splitAddress,
    treatsLeftToday: c.treatsLeftToday ?? null,
    splitMatches: splitAddress ? splitAddress === split : null,
  };
}

export function parseMatchStatus(body) {
  const state = body?.state;
  if (!['off', 'live', 'exhausted', 'awaiting-handover'].includes(state)) throw new Error(`unknown match state ${JSON.stringify(state)}`);
  return { ok: true, state, perGift: body.perGift ?? null, dailyLeft: body.dailyLeft ?? null };
}

/**
 * Read the three endpoints. Never throws: each failure is { ok: false, error }.
 * @returns { off?, payouts, donateStatus, match }
 */
export async function readBackend({ api = process.env.MATCH_DESK_API || DEFAULT_API, chainId, split, fetchImpl = globalThis.fetch, now = Date.now(), timeoutMs = TIMEOUT_MS }) {
  if (!api || api === 'off') return off('MATCH_DESK_API=off');
  const network = networkFor(chainId);
  if (network === 'local') return off('local chain: the API indexes Arc only');
  const base = api.replace(/\/+$/, '');
  const s = split.toLowerCase();
  const q = new URLSearchParams({ network, chainId: String(chainId), address: s, limit: '500' });
  const nowS = Math.floor(now / 1000);
  const soft = (p) => p.catch((e) => ({ ok: false, error: String(e.message || e).slice(0, 200) }));
  const [payouts, donateStatus, match] = await Promise.all([
    soft(getJson(fetchImpl, `${base}/shelter/payouts?${q}`, timeoutMs).then((b) => parsePayouts(b, { split: s, nowS }))),
    soft(getJson(fetchImpl, `${base}/shelter/donate/status`, timeoutMs).then((b) => parseDonateStatus(b, { chainId, split: s }))),
    soft(getJson(fetchImpl, `${base}/shelter/match/status?chainId=${chainId}`, timeoutMs).then(parseMatchStatus)),
  ]);
  return { payouts, donateStatus, match };
}

/** Router gifts are excluded unless the backend matcher is known to be off for this chain. */
export const routerBlocked = (backend) => !(backend.match?.ok && backend.match.state === 'off');

/** The donate-status hard stop: the backend names a different split for this chain. */
export const splitMismatch = (backend) => backend.donateStatus?.ok === true && backend.donateStatus.splitMatches === false;
