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
