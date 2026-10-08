// The Token Tails payout index (GET /shelter/payouts) as an optional source for readTotals and the
// widget: totals up to indexedThrough, then only newer blocks from the chain. Mocks only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { INDEX_STALE_MS, TOPICS, indexedTotals, readPayoutIndex, readTotals } from "../src/sdk.mjs";

const SPLIT = "0x1111111111111111111111111111111111111111";
const SHELTER = "0x2222222222222222222222222222222222222222";
const API = "https://api.test";
const NOW = Date.parse("2026-10-08T12:00:00Z");
const T = Math.floor(NOW / 1000);
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const amountData = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0") + (64).toString(16).padStart(64, "0") + "0".repeat(64);
const log = (topic, n, block) => ({ address: SPLIT, topics: [topic, "0x" + "0".repeat(24) + SHELTER.slice(2)], data: amountData(n), transactionHash: "0x" + "ab".repeat(32), blockNumber: "0x" + block.toString(16) });

const indexBody = (chainId, time, totals) => ({
  network: "mainnet",
  contracts: [{ chainId, contract: SPLIT, count: totals.reduce((n, t) => n + t.count, 0), indexedThrough: { block: 1000, time, at: null }, totals }],
  events: [],
  nextCursor: null,
});

function fake(indexAnswer) {
  const calls = [];
  const fetchFn = async (url, init) => {
    if (String(url).startsWith(API)) {
      calls.push({ url });
      return indexAnswer();
    }
    const body = JSON.parse(init.body);
    calls.push({ url, method: body.method, params: body.params });
    if (body.method === "eth_getTransactionReceipt") return json(200, { result: { blockNumber: "0x64" } });
    if (body.method === "eth_blockNumber") return json(200, { result: "0x3f0" });
    return json(200, { result: [log(TOPICS.Disbursed, 3_000_000, 1005)] });
  };
  return { calls, fetchFn };
}

test("readTotals takes the index's totals and reads only the blocks after indexedThrough", async () => {
  const { calls, fetchFn } = fake(() =>
    json(200, indexBody(5042, T - 60, [
      { symbol: "USDC", kind: "token", amount: "1000000", decimals: 6, amount18: "1000000000000000000", count: 1 },
      { symbol: "USDC", kind: "native", amount: "2000000000000000000", decimals: 18, amount18: "2000000000000000000", count: 2 },
    ]))
  );
  const totals = await readTotals([{ chainId: 5042, address: SPLIT, tx: "0x" + "cd".repeat(32), network: "mainnet" }], fetchFn, { index: API, now: NOW });
  const row = totals.byDeployment[0];
  assert.equal(row.source, "index");
  assert.equal(row.indexedThrough, 1000);
  assert.equal(row.payouts, 4);
  assert.equal(row.tokenUnits, 4_000_000n);
  assert.equal(row.nativeWei, 2n * 10n ** 18n);
  assert.equal(totals.byCoin.USDC, 6n * 10n ** 18n);
  const getLogs = calls.filter((c) => c.method === "eth_getLogs");
  assert.equal(getLogs.length, 1);
  assert.equal(getLogs[0].params[0].fromBlock, "0x3e9");
  assert.equal(calls.some((c) => c.method === "eth_getTransactionReceipt"), false);
  assert.match(calls.find((c) => c.url.startsWith(API)).url, /network=mainnet/);
});

for (const [label, answer] of [
  ["stale", () => json(200, indexBody(42161, T - INDEX_STALE_MS / 1000 - 60, []))],
  ["refused", () => json(409, { code: "PAYOUTS_NOT_INDEXED" })],
  ["unreachable", () => Promise.reject(new TypeError("fetch failed"))],
]) {
  test(`readTotals reads the chain from the deploy block when the index is ${label}`, async () => {
    const { calls, fetchFn } = fake(answer);
    const totals = await readTotals([{ chainId: 42161, address: SPLIT, tx: "0x" + "cd".repeat(32) }], fetchFn, { index: API, now: NOW });
    assert.equal(totals.byDeployment[0].source, "chain");
    assert.equal(totals.byDeployment[0].tokenUnits, 3_000_000n);
    assert.equal(calls.find((c) => c.method === "eth_getLogs").params[0].fromBlock, "0x64");
  });
}

test("readTotals without an index never calls a backend", async () => {
  const { calls, fetchFn } = fake(() => json(500, {}));
  await readTotals([{ chainId: 42161, address: SPLIT, fromBlock: 5 }], fetchFn);
  assert.equal(calls.some((c) => c.url.startsWith(API)), false);
});

test("readPayoutIndex accepts the base URL or the endpoint URL, and indexedTotals refuses malformed totals", async () => {
  const urls = [];
  const fetchFn = async (url) => (urls.push(url), json(200, indexBody(5042, T, [])));
  assert.ok(await readPayoutIndex(API + "/", { fetchFn }));
  assert.ok(await readPayoutIndex(API + "/shelter/payouts", { fetchFn, network: "testnet" }));
  assert.deepEqual(urls, [`${API}/shelter/payouts?network=mainnet&limit=1`, `${API}/shelter/payouts?network=testnet&limit=1`]);
  assert.equal(await readPayoutIndex("", { fetchFn }), null);
  const bad = indexBody(5042, T, [{ kind: "token", amount: "1e6", count: 1 }]);
  assert.equal(indexedTotals(bad, 5042, SPLIT, NOW), null);
  assert.equal(indexedTotals(indexBody(5042, T, []), 5042, SPLIT.toUpperCase().replace("0X", "0x"), NOW).through, 1000);
});

test("the widget's readIndexed sums the index (native only where the gas coin is USDC) and drops a stale one", async () => {
  const src = readFileSync(new URL("../src/widget.js", import.meta.url), "utf8");
  let answer = null;
  const seen = [];
  const sandbox = { TextEncoder, TextDecoder, BigInt, Date: { now: () => NOW }, fetch: async (url) => (seen.push(url), json(200, answer)) };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  const rail = sandbox.ShelterRail;
  const totals = [
    { kind: "token", amount: "1000000", amount18: "1000000000000000000", count: 1 },
    { kind: "native", amount: "500000000000000000", amount18: "500000000000000000", count: 1 },
  ];
  answer = indexBody(42161, T - 30, totals);
  const arb = await rail.readIndexed(API, "mainnet", 42161, SPLIT, true);
  assert.equal(arb.total, 10n ** 18n);
  assert.equal(arb.through, 1000);
  assert.match(seen[0], /\/shelter\/payouts\?network=mainnet&chainId=42161&address=0x1{40}&limit=1$/);
  answer = indexBody(42161, T - 30, totals);
  assert.equal((await rail.readIndexed(API, "mainnet", 42161, SPLIT, false)).total, 15n * 10n ** 17n);
  answer = indexBody(42161, T - INDEX_STALE_MS / 1000 - 1, totals);
  assert.equal(await rail.readIndexed(API, "mainnet", 42161, SPLIT, true), null);
  assert.equal(rail.readOptions({ index: "javascript:alert(1)" }).index, null);
  assert.equal(rail.readOptions({ index: API }).index, API);
});

// A chain whose index is behind and whose RPC read fails keeps the index's last-known totals,
// marked `updating`, instead of dropping out of the totals.
function failingChain(indexAnswer) {
  const calls = [];
  const fetchFn = async (url, init) => {
    if (String(url).startsWith(API)) {
      calls.push({ url });
      return indexAnswer();
    }
    const body = JSON.parse(init.body);
    calls.push({ url, method: body.method });
    if (body.method === "eth_getTransactionReceipt") return json(200, { result: { blockNumber: "0x64" } });
    throw new TypeError("fetch failed");
  };
  return { calls, fetchFn };
}
const ARB_TOTALS = [{ symbol: "USDC", kind: "token", amount: "2500000", decimals: 6, amount18: "2500000000000000000", count: 2 }];

for (const [label, age] of [["fresh", 60], ["stale", INDEX_STALE_MS / 1000 + 3600]]) {
  test(`readTotals keeps a ${label} index's totals, marked updating, when the chain read fails`, async () => {
    const { fetchFn } = failingChain(() => json(200, indexBody(42161, T - age, ARB_TOTALS)));
    const totals = await readTotals([{ chainId: 42161, address: SPLIT, tx: "0x" + "cd".repeat(32), network: "mainnet" }], fetchFn, { index: API, now: NOW });
    const row = totals.byDeployment[0];
    assert.equal(row.error, null);
    assert.equal(row.source, "index");
    assert.equal(row.tokenUnits, 2_500_000n);
    assert.equal(row.payouts, 2);
    assert.deepEqual(row.updating, { block: 1000, time: T - age });
    assert.equal(totals.byCoin.USDC, 25n * 10n ** 17n);
  });
}

test("readTotals reports an error only when the index does not list the contract and the chain fails", async () => {
  const { fetchFn } = failingChain(() => json(409, { code: "PAYOUTS_NOT_INDEXED" }));
  const totals = await readTotals([{ chainId: 42161, address: SPLIT, tx: "0x" + "cd".repeat(32) }], fetchFn, { index: API, now: NOW });
  assert.ok(totals.byDeployment[0].error);
  assert.equal(totals.byDeployment[0].updating, null);
  assert.equal(totals.byCoin.USDC, undefined);
});

test("readTotals adds the tail and clears updating when the chain answers for a stale index", async () => {
  const { fetchFn } = fake(() => json(200, indexBody(42161, T - INDEX_STALE_MS / 1000 - 60, ARB_TOTALS)));
  const row = (await readTotals([{ chainId: 42161, address: SPLIT, tx: "0x" + "cd".repeat(32) }], fetchFn, { index: API, now: NOW })).byDeployment[0];
  assert.equal(row.source, "chain");
  assert.equal(row.updating, null);
  assert.equal(row.tokenUnits, 3_000_000n);
});

test("the widget keeps the index total, labelled updating, when the chain read fails", async () => {
  const src = readFileSync(new URL("../src/widget.js", import.meta.url), "utf8");
  let answer = null;
  const sandbox = { TextEncoder, TextDecoder, BigInt, Date: { now: () => NOW }, fetch: async () => json(200, answer) };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  const rail = sandbox.ShelterRail;
  const totals = [{ kind: "token", amount: "1000000", amount18: "1000000000000000000", count: 1 }];
  const busy = () => Promise.reject(new Error("429"));
  const ok = (v) => () => Promise.resolve(v);

  // A stale entry comes back only when asked for the last-known one.
  answer = indexBody(42161, T - 7200, totals);
  const stale = await rail.readIndexed(API, "mainnet", 42161, SPLIT, true, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.time, T - 7200);

  // Fresh index, tail fails: the index total stands, marked with its time.
  const fresh = { through: 1000, time: T - 60, total: 10n ** 18n, stale: false };
  const r1 = await rail.readTotal(Promise.resolve(fresh), busy, 1);
  assert.equal(r1.value, 10n ** 18n);
  assert.equal(r1.updating, T - 60);
  // Stale index, full read fails: the last-known total stands.
  const r2 = await rail.readTotal(Promise.resolve(stale), busy, 1);
  assert.equal(r2.value, 10n ** 18n);
  assert.equal(r2.updating, T - 7200);
  // The chain answers: index plus tail (fresh), or the chain's full read (stale), not updating.
  let from = null;
  const r3 = await rail.readTotal(Promise.resolve(fresh), (f) => ((from = f), Promise.resolve(5n)), 1);
  assert.equal(r3.value, 10n ** 18n + 5n);
  assert.equal(from, 1001);
  assert.equal(r3.updating, null);
  const r4 = await rail.readTotal(Promise.resolve(stale), ok(7n), 1);
  assert.equal(r4.value, 7n);
  assert.equal(r4.updating, null);
  // No index entry and a busy chain: an error, as before.
  await assert.rejects(rail.readTotal(Promise.resolve(null), busy, 1));
  assert.equal(rail.asOf(T - 7200, NOW), "as of 2 h ago");
});

test("readTotals: an index tail that starts past the RPC's head is complete, not updating", async () => {
  // The RPC refuses a range past its head and is a block behind the index (head 999 < tail start 1001).
  const fetchFn = async (url, init) => {
    if (String(url).startsWith(API)) return json(200, indexBody(143, T - 5, ARB_TOTALS));
    const body = JSON.parse(init.body);
    if (body.method === "eth_blockNumber") return json(200, { result: "0x3e7" });
    throw new Error(`unexpected ${body.method}`);
  };
  const row = (await readTotals([{ chainId: 143, address: SPLIT, network: "mainnet" }], fetchFn, { index: API, now: NOW })).byDeployment[0];
  assert.equal(row.error, null);
  assert.equal(row.updating, null);
  assert.equal(row.tokenUnits, 2_500_000n);
});
