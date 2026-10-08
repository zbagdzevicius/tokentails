// The seven chains, the token (approve + disburse) path and multi-chain x402 onchain-receipt offers.
// Mocks only: nothing touches a network, holds a key or signs anything. Reference calldata below was
// produced once with `cast calldata` (Foundry).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  CHAINS,
  TOPICS,
  TOKEN_SELECTORS,
  NO_NATIVE_COIN_NAME,
  addChainParams,
  coinFor,
  coinByAddress,
  isUsdcNative,
  keccak256,
  encodeApprove,
  encodeAllowanceCall,
  encodeDisburse,
  encodeDisburseWithMemo,
  encodeDonate,
  memoToBytes32,
  donateTokenWithInjected,
  donateWithInjected,
  findOnchainReceiptOffers,
  listOnchainReceiptOffers,
  parseOnchainReceiptOffer,
  pickOffer,
  encodeOfferCalls,
  payAndFetch,
  readTotals,
  fromBase64,
  toBase64,
} from "../src/sdk.mjs";

const SPLIT = "0x1111111111111111111111111111111111111111";
const SHELTER = "0x2222222222222222222222222222222222222222";
const FROM = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
const PATHUSD = "0x20c0000000000000000000000000000000000000";
const TX = "0x" + "ab".repeat(32);
const TX2 = "0x" + "cd".repeat(32);
const NONCE = "0123456789abcdef0123456789abcdef";
const MEMO = `x402:${NONCE}`;
const MEMO32 = "0x24c738bbbddad004ecd6bb98a9aa83814019453a53de259261946b96fa77594c"; // cast keccak MEMO

const CAST_DISBURSE =
  "0xc950e7d9000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000025783430323a3031323334353637383961626364656630313233343536373839616263646566000000000000000000000000000000000000000000000000000000";
const CAST_APPROVE = "0x095ea7b300000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000002710";
const CAST_DISBURSE_MEMO = "0x970a3255000000000000000000000000000000000000000000000000000000000000271024c738bbbddad004ecd6bb98a9aa83814019453a53de259261946b96fa77594c";
const CAST_ALLOWANCE = "0xdd62ed3e00000000000000000000000033333333333333333333333333333333333333330000000000000000000000001111111111111111111111111111111111111111";

const SEVEN = { arc: [5042, 5042002], tempo: [4217, 42431], arbitrum: [42161, 421614], avalanche: [43114, 43113], base: [8453, 84532], robinhood: [4663, 46630], monad: [143, 10143] };
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const sig = (s) => keccak256(new TextEncoder().encode(s)).slice(0, 10);

// ------------------------------------------------------------------ chain table

test("CHAINS lists the seven chains, mainnet and testnet, each with an RPC, an explorer and its USD coin", () => {
  for (const [family, [main, testnet]] of Object.entries(SEVEN)) {
    for (const id of [main, testnet]) {
      const c = CHAINS[id];
      assert.ok(c, `${family} ${id} missing`);
      assert.match(c.rpc, /^https:\/\//);
      assert.match(c.explorer, /^https:\/\//);
      assert.equal(c.nativeDecimals, 18);
      assert.ok(c.coins.length >= 1, `${id} has no coin`);
      for (const k of c.coins) {
        assert.match(k.address, ADDRESS_RE, `${id} ${k.symbol}`);
        assert.equal(k.decimals, 6);
        assert.equal(typeof k.eip3009, "boolean");
      }
    }
    assert.ok(!CHAINS[main].testnet, `${main} is a mainnet`);
    assert.equal(CHAINS[testnet].testnet, true, `${testnet} is a testnet`);
  }
  assert.deepEqual(
    Object.fromEntries(Object.values(SEVEN).flat().map((id) => [id, coinFor(id).symbol])),
    { 5042: "USDC", 5042002: "USDC", 4217: "USDC.e", 42431: "pathUSD", 42161: "USDC", 421614: "USDC", 43114: "USDC", 43113: "USDC", 8453: "USDC", 84532: "USDC", 4663: "USDG", 46630: "mUSDC", 143: "USDC", 10143: "USDC" }
  );
  assert.equal(coinFor(143).address, "0x754704Bc059F8C67012fEd69BC8A327a5aafb603");
  assert.equal(coinFor(10143).address, "0x534b2f3A21130d7a60830c2Df862319e593943A3");
  assert.equal(coinFor(5042002, "eurc").symbol, "EURC");
  assert.equal(coinByAddress(84532, TOKEN.toLowerCase()).symbol, "USDC");
  // EIP-3009 only where it is known: never Tempo's TIP-20, USDG or the test mUSDC.
  for (const id of [4217, 42431, 4663, 46630]) assert.equal(coinFor(id).eip3009, false, String(id));
  assert.deepEqual(Object.values(SEVEN).flat().filter(isUsdcNative), [5042, 5042002]);
});

test("addChainParams adds any of the seven chains; Tempo says it has no native coin", () => {
  const tempo = addChainParams(42431);
  assert.equal(tempo.chainId, "0xa5bf");
  assert.deepEqual(tempo.nativeCurrency, { name: NO_NATIVE_COIN_NAME, symbol: "USD", decimals: 18 });
  assert.deepEqual(addChainParams(10143).nativeCurrency, { name: "MON", symbol: "MON", decimals: 18 });
  assert.equal(addChainParams(10143).chainId, "0x279f");
  assert.equal(addChainParams(46630).rpcUrls[0], "https://rpc.testnet.chain.robinhood.com");
  assert.equal(addChainParams(999999), null);
});

test("SDK: native gifts stay USDC-only on Monad and Tempo too", async () => {
  const calls = [];
  const wallet = { request: async (a) => (calls.push(a), null) };
  for (const chainId of [143, 10143, 4217, 42431, 46630]) {
    await assert.rejects(donateWithInjected(wallet, { chainId, split: SPLIT, amountWei: 1n }), /USDC-only/);
  }
  assert.equal(calls.length, 0);
});

// ------------------------------------------------------------------ token path encoding

test("token selectors and the DisbursementBatch topic are keccak256 of their signatures", () => {
  assert.equal(TOKEN_SELECTORS.approve, sig("approve(address,uint256)"));
  assert.equal(TOKEN_SELECTORS.allowance, sig("allowance(address,address)"));
  assert.equal(TOKEN_SELECTORS.disburse, sig("disburse(uint256,string)"));
  assert.equal(TOKEN_SELECTORS.disburseWithMemo, sig("disburseWithMemo(uint256,bytes32)"));
  assert.equal(TOKEN_SELECTORS.token, sig("token()"));
  assert.equal(
    TOPICS.DisbursementBatch,
    keccak256(new TextEncoder().encode("DisbursementBatch(uint256,address,uint256,uint256,uint256,uint256,string)"))
  );
});

test("token calldata matches cast", () => {
  assert.equal(encodeApprove(SPLIT, 10000n), CAST_APPROVE);
  assert.equal(encodeAllowanceCall(FROM, SPLIT), CAST_ALLOWANCE);
  assert.equal(encodeDisburse(10000n, MEMO), CAST_DISBURSE);
  assert.equal(encodeDisburseWithMemo(10000n, MEMO32), CAST_DISBURSE_MEMO);
  assert.equal(memoToBytes32("widget"), "0x7769646765740000000000000000000000000000000000000000000000000000");
  assert.equal(memoToBytes32(MEMO32.toUpperCase().replace("0X", "0x")), MEMO32);
  assert.throws(() => memoToBytes32(MEMO), /32/);
  assert.throws(() => encodeDisburse(1n, "x".repeat(257)), /256/);
});

function tokenWallet({ chainId = 84532, allowance = 0n, splitToken = TOKEN } = {}) {
  const calls = [];
  let current = chainId;
  let sent = 0;
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
          throw Object.assign(new Error("unknown chain"), { code: 4902 });
        case "wallet_addEthereumChain":
          current = parseInt(params[0].chainId, 16);
          return null;
        case "eth_call": {
          const data = params[0].data;
          if (data === TOKEN_SELECTORS.token) return "0x" + splitToken.slice(2).toLowerCase().padStart(64, "0");
          if (data.startsWith(TOKEN_SELECTORS.allowance)) return "0x" + allowance.toString(16).padStart(64, "0");
          throw new Error("unexpected call " + data);
        }
        case "eth_sendTransaction":
          return sent++ === 0 ? TX : TX2;
        case "eth_getTransactionReceipt":
          return { status: "0x1", transactionHash: params[0] };
        default:
          throw new Error("unexpected " + method);
      }
    },
  };
}

test("donateTokenWithInjected approves exactly the gift when short, waits, then disburses", async () => {
  const w = tokenWallet({ chainId: 1 });
  const out = await donateTokenWithInjected(w, { chainId: 84532, split: SPLIT, amount: 10000n, memo: MEMO });
  const sends = w.calls.filter((c) => c.method === "eth_sendTransaction").map((c) => c.params[0]);
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0], { from: FROM, to: TOKEN.toLowerCase(), data: CAST_APPROVE });
  assert.deepEqual(sends[1], { from: FROM, to: SPLIT, data: CAST_DISBURSE });
  assert.equal(out.approveTxHash, TX);
  assert.equal(out.txHash, TX2);
  assert.equal(out.explorerUrl, `https://sepolia.basescan.org/tx/${TX2}`);
  // The approve was mined before the disburse was sent.
  const order = w.calls.map((c) => c.method);
  assert.ok(order.indexOf("eth_getTransactionReceipt") < order.lastIndexOf("eth_sendTransaction"));
  assert.equal(w.calls.find((c) => c.method === "wallet_addEthereumChain").params[0].chainName, "Base Sepolia");
});

test("donateTokenWithInjected skips the approve when the allowance covers it, and uses disburseWithMemo on Tempo", async () => {
  const w = tokenWallet({ chainId: 42431, allowance: 10n ** 9n, splitToken: PATHUSD });
  const out = await donateTokenWithInjected(w, { chainId: 42431, split: SPLIT, amount: 10000n, memo: MEMO32 });
  const sends = w.calls.filter((c) => c.method === "eth_sendTransaction").map((c) => c.params[0]);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].data, CAST_DISBURSE_MEMO);
  assert.equal(out.approveTxHash, null);
  await assert.rejects(donateTokenWithInjected(w, { chainId: 42431, split: SPLIT, amount: 0n }), /above zero/);
  await assert.rejects(donateTokenWithInjected(w, { chainId: 42431, split: null, amount: 1n }), /not set/);
});

// ------------------------------------------------------------------ multi-chain x402 offers

const offer = (chainId, over = {}) => ({
  scheme: "onchain-receipt",
  network: `eip155:${chainId}`,
  maxAmountRequired: "10000",
  asset: TOKEN,
  payTo: SPLIT,
  resource: "https://api.example/shelter/agent/cat-card",
  description: "One adoptable-cat card",
  mimeType: "application/json",
  maxTimeoutSeconds: 600,
  extra: { memo: MEMO, nonce: NONCE, decimals: 6, coin: "USDC", method: "disburse" },
  ...over,
});
const arcOffer = offer(5042002, { asset: "native", maxAmountRequired: "10000000000000000", extra: { memo: MEMO, nonce: NONCE, decimals: 18, coin: "USDC", method: "donate" } });
const tempoOffer = offer(42431, { asset: PATHUSD, extra: { memo: MEMO, nonce: NONCE, decimals: 6, coin: "pathUSD", method: "disburseWithMemo", memo32: MEMO32 } });
const multiBody = () => ({ x402Version: 1, error: "payment required", accepts: [arcOffer, offer(84532), tempoOffer] });

test("findOnchainReceiptOffers reads one offer per chain, main chain first, without duplicates", () => {
  assert.deepEqual(findOnchainReceiptOffers(multiBody()).map((o) => o.network), ["eip155:5042002", "eip155:84532", "eip155:42431"]);
  const withExact = { x402Version: 1, accepts: [{ scheme: "exact" }], onchainReceipt: arcOffer, onchainReceipts: [arcOffer, offer(84532), tempoOffer] };
  assert.deepEqual(findOnchainReceiptOffers(withExact).map((o) => o.network), ["eip155:5042002", "eip155:84532", "eip155:42431"]);
  assert.equal(listOnchainReceiptOffers({ x402Version: 1, accepts: [arcOffer, offer(84532, { payTo: "0xnope" })] }).length, 1);
});

test("pickOffer picks by chain and normalises native and token offers", () => {
  const arc = pickOffer(multiBody());
  assert.equal(arc.kind, "native");
  assert.equal(arc.amountWei, 10n ** 16n);
  assert.equal(arc.method, "donate");
  const base = pickOffer(multiBody(), { chainId: 84532 });
  assert.deepEqual([base.kind, base.amount, base.amountBase, base.decimals, base.method, base.token, base.coin], ["token", 10000n, 10000n, 6, "disburse", TOKEN, "USDC"]);
  assert.equal(base.amountWei, undefined);
  const tempo = pickOffer(multiBody(), { chainId: 42431 });
  assert.equal(tempo.method, "disburseWithMemo");
  assert.equal(tempo.memo32, MEMO32);
  assert.throws(() => pickOffer(multiBody(), { chainId: 10143 }), /no 'onchain-receipt' payment on chain 10143/);
});

test("offers from an older server (no extra.method) still parse; Tempo defaults to memo32 = keccak256(memo)", () => {
  const old = parseOnchainReceiptOffer(offer(42431, { asset: PATHUSD, extra: { memo: MEMO, nonce: NONCE } }));
  assert.equal(old.method, "disburseWithMemo");
  assert.equal(old.memo32, MEMO32);
  assert.equal(old.coin, "pathUSD");
  const oldBase = parseOnchainReceiptOffer(offer(84532, { extra: { memo: MEMO, nonce: NONCE } }));
  assert.deepEqual([oldBase.method, oldBase.decimals], ["disburse", 6]);
  assert.throws(() => parseOnchainReceiptOffer(offer(84532, { extra: { memo: MEMO, nonce: NONCE, method: "donate" } })), /method/);
  assert.throws(() => parseOnchainReceiptOffer({ ...arcOffer, extra: { ...arcOffer.extra, method: "disburse" } }), /method/);
  assert.throws(() => parseOnchainReceiptOffer({ ...tempoOffer, extra: { ...tempoOffer.extra, memo32: "0x12" } }), /bytes32/);
});

test("encodeOfferCalls: donate for native, approve then disburse(WithMemo) for tokens", () => {
  assert.deepEqual(encodeOfferCalls(pickOffer(multiBody())), [{ step: "donate", to: SPLIT, data: encodeDonate(MEMO), value: 10n ** 16n }]);
  assert.deepEqual(encodeOfferCalls(pickOffer(multiBody(), { chainId: 84532 })), [
    { step: "approve", to: TOKEN, data: CAST_APPROVE, value: 0n },
    { step: "disburse", to: SPLIT, data: CAST_DISBURSE, value: 0n },
  ]);
  assert.equal(encodeOfferCalls(pickOffer(multiBody(), { chainId: 42431 }))[1].data, CAST_DISBURSE_MEMO);
});

function jsonResponse(status, body, headers = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: (k) => h.get(k.toLowerCase()) ?? null } };
}

function server(body = multiBody()) {
  const requests = [];
  const fetchMock = async (_url, init = {}) => {
    requests.push(init.headers || {});
    if (!init.headers?.["X-PAYMENT"]) return jsonResponse(402, body);
    return jsonResponse(200, { name: "Mochi" }, { "X-PAYMENT-RESPONSE": toBase64(JSON.stringify({ success: true, txHash: TX2 })) });
  };
  return { requests, fetchMock };
}

test("payAndFetch pays a token offer on the chain asked for, with approve + disburse calls, capped by maxAmountBase", async () => {
  const { requests, fetchMock } = server();
  let seen;
  const out = await payAndFetch("u", {
    fetch: fetchMock,
    chainId: 84532,
    maxAmountBase: 10000n,
    pay: async (args) => ((seen = args), TX2),
  });
  assert.equal(out.response.status, 200);
  assert.deepEqual(out.paid, { scheme: "onchain-receipt", txHash: TX2, chainId: 84532, amountBase: 10000n, coin: "USDC", asset: TOKEN });
  assert.equal(seen.chainId, 84532);
  assert.equal(seen.to, SPLIT);
  assert.equal(seen.valueWei, 0n);
  assert.equal(seen.data, CAST_DISBURSE);
  assert.equal(seen.token, TOKEN);
  assert.deepEqual(seen.calls.map((c) => c.step), ["approve", "disburse"]);
  const header = JSON.parse(fromBase64(requests[1]["X-PAYMENT"]));
  assert.deepEqual(header, { x402Version: 1, scheme: "onchain-receipt", network: "eip155:84532", payload: { txHash: TX2, nonce: NONCE } });
});

test("payAndFetch only pays offers whose unit is capped, and refuses above the cap", async () => {
  const pay = async () => assert.fail("must not pay");
  // Only maxAmountBase: the native Arc offer is skipped, the first token offer (Base Sepolia) is paid.
  let chain;
  await payAndFetch("u", { fetch: server().fetchMock, maxAmountBase: 10000n, pay: async (a) => ((chain = a.chainId), TX2) });
  assert.equal(chain, 84532);
  // Only maxAmountWei: the native Arc offer.
  await payAndFetch("u", { fetch: server().fetchMock, maxAmountWei: 10n ** 16n, pay: async (a) => ((chain = a.chainId), TX2) });
  assert.equal(chain, 5042002);
  await assert.rejects(payAndFetch("u", { fetch: server().fetchMock, chainId: 84532, maxAmountBase: 9999n, pay }), /above your cap/);
  await assert.rejects(payAndFetch("u", { fetch: server().fetchMock, chainId: 84532, maxAmountWei: 10n ** 18n, pay }), /maxAmountBase/);
  await assert.rejects(payAndFetch("u", { fetch: server().fetchMock, chainId: 10143, maxAmountBase: 10n ** 6n, pay }), /chain 10143/);
});

test("payAndFetch pays a Tempo offer through a wallet: approve, wait, disburseWithMemo, wait, retry with the header", async () => {
  const w = tokenWallet({ chainId: 42431, splitToken: PATHUSD });
  const { requests, fetchMock } = server();
  const out = await payAndFetch("u", { fetch: fetchMock, provider: w, chainId: 42431, maxAmountBase: 10000n });
  assert.equal(out.response.status, 200);
  const sends = w.calls.filter((c) => c.method === "eth_sendTransaction").map((c) => c.params[0]);
  assert.deepEqual(sends.map((s) => s.to), [PATHUSD, SPLIT]);
  assert.equal(sends[1].data, CAST_DISBURSE_MEMO);
  assert.equal(JSON.parse(fromBase64(requests[1]["X-PAYMENT"])).network, "eip155:42431");
  assert.equal(out.paid.amountBase, 10000n);
});

test("payAndFetch skips an exact offer on another chain when chainId asks for an onchain-receipt chain", async () => {
  const exact = { scheme: "exact", network: "base-sepolia", maxAmountRequired: "10000", payTo: SHELTER, asset: TOKEN, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } };
  const body = { x402Version: 1, accepts: [exact], onchainReceipt: arcOffer, onchainReceipts: [arcOffer, offer(84532), tempoOffer] };
  let paidOn;
  const out = await payAndFetch("u", {
    fetch: server(body).fetchMock,
    chainId: 42431,
    maxAmountBase: 10000n,
    account: FROM,
    signTypedData: async () => assert.fail("must not sign exact"),
    pay: async (a) => ((paidOn = a.chainId), TX2),
  });
  assert.equal(out.paid.scheme, "onchain-receipt");
  assert.equal(paidOn, 42431);
});

// ------------------------------------------------------------------ totals per coin

const amountData = (n, memo = "m") => {
  const hex = Buffer.from(memo).toString("hex");
  return "0x" + BigInt(n).toString(16).padStart(64, "0") + (64).toString(16).padStart(64, "0") + memo.length.toString(16).padStart(64, "0") + hex.padEnd(64, "0");
};
const log = (topic, n) => ({ address: SPLIT, topics: [topic, "0x" + "0".repeat(24) + SHELTER.slice(2)], data: amountData(n), transactionHash: TX, blockNumber: "0x10" });

test("readTotals keeps coins apart, starts at the deploy tx's block and falls back to log windows", async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: body.method, params: body.params });
    if (body.method === "eth_getTransactionReceipt") return jsonResponse(200, { result: { blockNumber: "0x64" } });
    if (body.method === "eth_blockNumber") return jsonResponse(200, { result: "0x" + (100 + 25000).toString(16) });
    if (url.includes("robinhood")) {
      // The whole range is refused; 10,000-block windows are not.
      if (body.params[0].toBlock === "latest") return jsonResponse(200, { error: { message: "range too large" } });
      return jsonResponse(200, { result: [log(TOPICS.Disbursed, 1_000_000)] });
    }
    if (url.includes("arc")) return jsonResponse(200, { result: [log(TOPICS.NativeDisbursed, 10n ** 18n), log(TOPICS.Disbursed, 500_000)] });
    return jsonResponse(200, { result: [log(TOPICS.Disbursed, 2_000_000)] });
  };
  const totals = await readTotals(
    [
      { chainId: 5042002, address: SPLIT, fromBlock: 5, token: "USDC" },
      { chainId: 84532, address: SPLIT, tx: TX, network: "testnet", token: "USDC" },
      { chainId: 46630, address: SPLIT, fromBlock: 100, symbol: "mUSDC", decimals: 6 },
    ],
    fetchMock
  );
  assert.equal(totals.byCoin.USDC, 10n ** 18n + 5n * 10n ** 17n + 2n * 10n ** 18n);
  assert.equal(totals.byCoin.mUSDC, 3n * 10n ** 18n, "three 10,000-block windows, 1 mUSDC each");
  assert.equal(totals.byDeployment[2].symbol, "mUSDC");
  assert.equal(totals.byDeployment[2].testnet, true);
  const baseLogs = calls.find((c) => c.url.includes("base") && c.method === "eth_getLogs");
  assert.equal(baseLogs.params[0].fromBlock, "0x64", "the deploy transaction's block");
  assert.equal(baseLogs.url, "https://base-sepolia-rpc.publicnode.com");
  assert.equal(calls.filter((c) => c.url.includes("robinhood") && c.method === "eth_getLogs").length, 4);
});

// ------------------------------------------------------------------ widget parity

const src = readFileSync(new URL("../src/widget.js", import.meta.url), "utf8");
const sandbox = { TextEncoder, TextDecoder, BigInt };
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);
const rail = sandbox.ShelterRail;

test("widget knows the same fourteen chains, RPCs, explorers and coins as the SDK", () => {
  assert.deepEqual(Object.keys(rail.CHAINS).map(Number).sort((a, b) => a - b), Object.keys(CHAINS).map(Number).sort((a, b) => a - b));
  for (const [id, c] of Object.entries(CHAINS)) {
    const w = rail.CHAINS[id];
    assert.equal(w.name, c.name, id);
    assert.equal(w.rpc, c.rpc, id);
    assert.equal(w.explorer, c.explorer, id);
    assert.equal(w.symbol, c.nativeSymbol, id);
    assert.equal(!!w.testnet, !!c.testnet, id);
    assert.equal(!!w.memo32, !!c.memo32, id);
    assert.equal(w.coin.symbol, c.coins[0].symbol, id);
    assert.equal(w.coin.address, c.coins[0].address, id);
    assert.equal(w.coin.eip3009, c.coins[0].eip3009, id);
    assert.equal(w.logRpc || null, c.logRpc || null, id);
  }
});

test("widget token calldata matches the SDK and cast", () => {
  assert.equal(rail.encodeApprove(SPLIT, 10000n), CAST_APPROVE);
  assert.equal(rail.encodeAllowance(FROM, SPLIT), CAST_ALLOWANCE);
  assert.equal(rail.encodeDisburse(10000n, MEMO), CAST_DISBURSE);
  assert.equal(rail.encodeDisburseWithMemo(10000n, MEMO32), CAST_DISBURSE_MEMO);
  assert.equal(rail.encodeDisburseWithMemo(10000n, "widget"), encodeDisburseWithMemo(10000n, "widget"));
});

test("widget mode: auto is gasless with a router and relay, native on Arc, token elsewhere", () => {
  assert.equal(rail.readOptions({}).mode, "auto");
  assert.equal(rail.readOptions({ mode: "token" }).mode, "token");
  assert.equal(rail.readOptions({ coin: "EURC" }).coin, "EURC");
  assert.equal(rail.readOptions({ coin: "<b>" }).coin, null);
  const r = "0x" + "44".repeat(20);
  assert.equal(rail.pickMode({ mode: "auto", router: r, usdc: r, relay: "https://relay" }, rail.CHAINS[84532]), "gasless");
  assert.equal(rail.pickMode({ mode: "auto" }, rail.CHAINS[5042002]), "native");
  for (const id of [42431, 84532, 421614, 43113, 46630, 10143]) assert.equal(rail.pickMode({ mode: "auto" }, rail.CHAINS[id]), "token", String(id));
  assert.equal(rail.pickMode({ mode: "native" }, rail.CHAINS[84532]), "native");
});

test("widget giveToken approves the exact gift, waits, then disburses (disburseWithMemo on Tempo)", async () => {
  const w = tokenWallet({ chainId: 42431, splitToken: PATHUSD });
  const steps = [];
  const hash = await rail.giveToken(w, { chainId: 42431, chain: rail.CHAINS[42431], split: SPLIT, amount: 10000n, memo: "widget", coinAddress: PATHUSD }, (s) => steps.push(s));
  assert.equal(hash, TX2);
  assert.deepEqual(steps, ["approve", "give"]);
  const sends = w.calls.filter((c) => c.method === "eth_sendTransaction").map((c) => c.params[0]);
  assert.equal(sends[0].to, PATHUSD);
  assert.equal(sends[1].data, encodeDisburseWithMemo(10000n, "widget"));
  // A split that pays another coin than the one shown is refused before anything is sent.
  const other = tokenWallet({ chainId: 84532, splitToken: SHELTER });
  await assert.rejects(
    rail.giveToken(other, { chainId: 84532, chain: rail.CHAINS[84532], split: SPLIT, amount: 1n, memo: "w", coinAddress: TOKEN }),
    (e) => e.mismatch === true
  );
  assert.equal(other.calls.filter((c) => c.method === "eth_sendTransaction").length, 0);
});

test("Monad mainnet reads logs from rpc2.monad.xyz in 10,000-block windows (rpc.monad.xyz and rpc1 cap at 100)", () => {
  assert.equal(CHAINS[143].rpc, "https://rpc.monad.xyz");
  assert.equal(CHAINS[143].logRpc, "https://rpc2.monad.xyz");
  assert.equal(CHAINS[143].maxLogRange, 10000);
});
