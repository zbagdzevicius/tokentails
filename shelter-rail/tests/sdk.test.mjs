// Nothing here touches a network or signs anything: fetch and the wallet provider are mocks.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeDonate,
  decodePayoutLog,
  readTotals,
  donateWithInjected,
  payAndFetch,
  pickOffer,
  encodePaymentHeader,
  fromBase64,
  toBase64,
  formatUnits,
  TOPICS,
} from "../src/sdk.mjs";

const SPLIT = "0x1111111111111111111111111111111111111111";
const SHELTER = "0x2222222222222222222222222222222222222222";
const FROM = "0x3333333333333333333333333333333333333333";
const TX = "0x" + "ab".repeat(32);

// Reference encodings produced with ethers v6 Interface/AbiCoder.
const DONATE_HEIST =
  "0xb5aebc800000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000f74743a68656973743a6162313263640000000000000000000000000000000000";
const DONATE_EMPTY =
  "0xb5aebc8000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000";
const DONATE_UTF8 =
  "0xb5aebc800000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002a783430323a6e6f6e63652dc5be2d783430323a6e6f6e63652dc5be2d783430323a6e6f6e63652dc5be2d00000000000000000000000000000000000000000000";
const HALF_USDC_DATA =
  "0x00000000000000000000000000000000000000000000000006f05b59d3b2000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000007783430323a6e3100000000000000000000000000000000000000000000000000";

const nativeLog = (data = HALF_USDC_DATA, address = SPLIT) => ({
  address,
  topics: [TOPICS.NativeDisbursed, "0x" + "0".repeat(24) + SHELTER.slice(2)],
  data,
  transactionHash: TX,
  blockNumber: "0x10",
});

function jsonResponse(status, body, headers = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: (k) => h.get(k.toLowerCase()) ?? null } };
}

test("encodeDonate matches the ABI encoding of donate(string)", () => {
  assert.equal(encodeDonate("tt:heist:ab12cd"), DONATE_HEIST);
  assert.equal(encodeDonate(""), DONATE_EMPTY);
  assert.equal(encodeDonate("x402:nonce-ž-".repeat(3)), DONATE_UTF8);
  assert.throws(() => encodeDonate("x".repeat(257)), /256/);
});

test("decodePayoutLog reads shelter, amount and memo", () => {
  const p = decodePayoutLog(nativeLog());
  assert.equal(p.kind, "native");
  assert.equal(p.shelter, SHELTER);
  assert.equal(p.amount, 5n * 10n ** 17n);
  assert.equal(p.memo, "x402:n1");
  assert.equal(p.blockNumber, 16);
  assert.equal(decodePayoutLog({ topics: ["0xdead"], data: "0x" }), null);
});

test("formatUnits trims and keeps 18-decimal USDC readable", () => {
  assert.equal(formatUnits(15n * 10n ** 17n, 18), "1.5");
  assert.equal(formatUnits(10n ** 18n, 18), "1");
  assert.equal(formatUnits(1234567n, 6, 2), "1.23");
});

test("readTotals sums native payouts per deployment and skips invalid entries", async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(200, { jsonrpc: "2.0", id: 1, result: [nativeLog(), nativeLog()] });
  };
  const totals = await readTotals(
    [{ chainId: 5042002, address: SPLIT, fromBlock: 32 }, { chainId: 5042, address: "" }, { chainId: 999, address: SPLIT }],
    fetchMock
  );
  assert.equal(totals.nativeWei, 10n ** 18n);
  assert.equal(totals.payouts, 2);
  assert.equal(calls.length, 1);
  // Arc testnet scans read the wide-range log RPC (the default one refuses ranges over ~10,000 blocks).
  assert.equal(calls[0].url, "https://rpc.blockdaemon.testnet.arc.network");
  assert.equal(calls[0].body.params[0].fromBlock, "0x20");
  assert.deepEqual(calls[0].body.params[0].topics, [[TOPICS.NativeDisbursed, TOPICS.Disbursed]]);
  assert.match(totals.byDeployment[1].error, /no RPC/);
});

test("readTotals fetches deployments from a URL and treats [] as zero", async () => {
  const totals = await readTotals("/shelter-payouts/deployments.json", async () => jsonResponse(200, []));
  assert.equal(totals.nativeWei, 0n);
  assert.equal(totals.byDeployment.length, 0);
});

function mockProvider({ chainId = 5042, switchError = null } = {}) {
  const calls = [];
  let current = chainId;
  return {
    calls,
    async request({ method, params }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_requestAccounts":
          return [FROM];
        case "eth_chainId":
          return "0x" + current.toString(16);
        case "wallet_switchEthereumChain":
          if (switchError) throw switchError;
          current = parseInt(params[0].chainId, 16);
          return null;
        case "wallet_addEthereumChain":
          current = parseInt(params[0].chainId, 16);
          return null;
        case "eth_sendTransaction":
          return TX;
        case "eth_getTransactionReceipt":
          return { status: "0x1", transactionHash: params[0] };
        default:
          throw new Error("unexpected " + method);
      }
    },
  };
}

test("donateWithInjected sends donate(memo) with value to the split", async () => {
  const provider = mockProvider({ chainId: 5042 });
  const out = await donateWithInjected(provider, { chainId: 5042, split: SPLIT, amountWei: 10n ** 18n, memo: "tt:heist:ab12cd" });
  assert.equal(out.txHash, TX);
  assert.equal(out.explorerUrl, `https://explorer.arc.io/tx/${TX}`);
  const send = provider.calls.find((c) => c.method === "eth_sendTransaction").params[0];
  assert.deepEqual(send, { from: FROM, to: SPLIT, value: "0xde0b6b3a7640000", data: DONATE_HEIST });
  assert.ok(!provider.calls.some((c) => c.method === "wallet_switchEthereumChain"));
});

test("donateWithInjected adds Arc when the wallet does not know it", async () => {
  const provider = mockProvider({ chainId: 1, switchError: Object.assign(new Error("unknown chain"), { code: 4902 }) });
  await donateWithInjected(provider, { chainId: 5042002, split: SPLIT, amountWei: 1n });
  const add = provider.calls.find((c) => c.method === "wallet_addEthereumChain").params[0];
  assert.equal(add.chainId, "0x4cef52");
  assert.equal(add.nativeCurrency.decimals, 18);
});

test("donateWithInjected refuses a missing split address or zero amount", async () => {
  await assert.rejects(donateWithInjected(mockProvider(), { chainId: 5042, split: null, amountWei: 1n }), /not set/);
  await assert.rejects(donateWithInjected(mockProvider(), { chainId: 5042, split: SPLIT, amountWei: 0n }), /above zero/);
});

const offerBody = (overrides = {}) => ({
  x402Version: 1,
  error: "payment required",
  accepts: [
    {
      scheme: "onchain-receipt",
      network: "eip155:5042002",
      maxAmountRequired: "10000000000000000",
      asset: "native",
      payTo: SPLIT,
      resource: "https://api.example/shelter/agent/cat-card",
      description: "One adoptable-cat card; payment goes to shelters via ShelterSplit",
      mimeType: "application/json",
      maxTimeoutSeconds: 600,
      extra: { memo: "x402:n1", nonce: "n1" },
      ...overrides,
    },
  ],
});

test("payAndFetch follows the 402 onchain-receipt flow with a provider", async () => {
  const provider = mockProvider({ chainId: 5042002 });
  const requests = [];
  const card = { name: "Mittens", image: "https://img/1.png", shelter: "Pink Paw (Rožinė pėdutė)" };
  const fetchMock = async (url, init = {}) => {
    requests.push(init.headers || {});
    if (!init.headers?.["X-PAYMENT"]) return jsonResponse(402, offerBody());
    return jsonResponse(200, card, { "X-PAYMENT-RESPONSE": toBase64(JSON.stringify({ success: true, txHash: TX })) });
  };
  const out = await payAndFetch("https://api.example/shelter/agent/cat-card", { provider, fetch: fetchMock, maxAmountWei: 10n ** 16n });
  assert.equal(out.response.status, 200);
  assert.deepEqual(await out.response.json(), card);
  assert.deepEqual(out.receipt, { success: true, txHash: TX });
  assert.equal(out.paid.amountWei, 10n ** 16n);

  const sent = provider.calls.find((c) => c.method === "eth_sendTransaction").params[0];
  assert.equal(sent.to, SPLIT);
  assert.equal(sent.data, encodeDonate("x402:n1"));
  assert.ok(provider.calls.some((c) => c.method === "eth_getTransactionReceipt"));

  const header = JSON.parse(fromBase64(requests[1]["X-PAYMENT"]));
  assert.deepEqual(header, { x402Version: 1, scheme: "onchain-receipt", network: "eip155:5042002", payload: { txHash: TX, nonce: "n1" } });
});

test("payAndFetch works with a signer callback and retries while the server still says 402", async () => {
  let paidCalls = 0;
  let paidRequests = 0;
  const fetchMock = async (url, init = {}) => {
    if (!init.headers?.["X-PAYMENT"]) return jsonResponse(402, offerBody());
    paidRequests++;
    return paidRequests < 2 ? jsonResponse(402, offerBody()) : jsonResponse(200, { ok: true });
  };
  const out = await payAndFetch("u", {
    fetch: fetchMock,
    maxAmountWei: "10000000000000000",
    retryDelayMs: 0,
    pay: async ({ chainId, to, valueWei, data }) => {
      paidCalls++;
      assert.equal(chainId, 5042002);
      assert.equal(to, SPLIT);
      assert.equal(valueWei, 10n ** 16n);
      assert.equal(data, encodeDonate("x402:n1"));
      return TX;
    },
  });
  assert.equal(out.response.status, 200);
  assert.equal(paidCalls, 1, "pays exactly once");
  assert.equal(paidRequests, 2);
});

test("payAndFetch passes non-402 responses through without paying", async () => {
  const out = await payAndFetch("u", { fetch: async () => jsonResponse(503, { message: "off" }), maxAmountWei: 1n, pay: async () => assert.fail("must not pay") });
  assert.equal(out.response.status, 503);
  assert.equal(out.paid, null);
});

test("payAndFetch refuses offers above the cap and bad offers", async () => {
  const pay = async () => assert.fail("must not pay");
  await assert.rejects(payAndFetch("u", { fetch: async () => jsonResponse(402, offerBody()), maxAmountWei: 1n, pay }), /above your cap/);
  await assert.rejects(payAndFetch("u", { fetch: async () => jsonResponse(402, offerBody()), pay }), /maxAmountWei/);
  assert.throws(() => pickOffer(offerBody({ extra: { memo: "other", nonce: "n1" } })), /x402:<nonce>/);
  assert.throws(() => pickOffer(offerBody({ asset: "0xtoken" })), /asset/);
  assert.throws(() => pickOffer(offerBody({ scheme: "exact" })), /onchain-receipt/);
});

test("encodePaymentHeader round-trips", () => {
  const h = encodePaymentHeader({ chainId: 5042, txHash: TX, nonce: "abc" });
  assert.equal(JSON.parse(fromBase64(h)).network, "eip155:5042");
});
