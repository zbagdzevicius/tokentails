// Gasless gifts (DonateRouter) and the standard x402 `exact` scheme. Nothing here touches a network
// or holds a key: the wallet and fetch are mocks, and the reference values below were computed once
// with ethers v6 for anvil's public dev account #0 (0xf39F…2266), a well-known test-only vector.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  keccak256,
  hashTypedData,
  buildAuthorization,
  routerAuthNonce,
  encodeAuthNonceCall,
  ROUTER_SELECTORS,
  signAndRelay,
  pickExactOffer,
  pickOffer,
  EXACT_NETWORKS,
  encodeExactPaymentHeader,
  payAndFetch,
  fromBase64,
  toBase64,
} from "../src/sdk.mjs";

const DEV = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ROUTER = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const SHELTER = "0x2222222222222222222222222222222222222222";
const SPLIT = "0x1111111111111111111111111111111111111111";
const SALT = "0x" + "11".repeat(32);
const MEMO = "tt:wallet:0badcafe";
const TX = "0x" + "ab".repeat(32);
// The payout list the router reports for the gift (router.recipientsHash(value)), a fixed test value.
const RH = "0x" + "cd".repeat(32);

// ethers: keccak256(abi.encode(router, keccak256(memo), salt, recipients)).
const NONCE = "0xe52bb44074dc31a07aabe4dee2eb03e14c768c7d8f2d96699f6efa25637ab42b";
// ethers TypedDataEncoder.hash for the two authorizations built below.
const RECEIVE_DIGEST = "0x460a5ff86c04f1f36d6429c36f99cbdc07569a34874740e88a052eb29440bbd7";
const TRANSFER_DIGEST = "0xb373fcaff143e62f67d77103d88df0fb7256726702c6ca6d5008399346aa0bad";
// ethers Interface.encodeFunctionData("authNonce", [SALT, MEMO, RH]).
const AUTH_NONCE_CALL =
  "0x8a7ae4e211111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000060cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a30626164636166650000000000000000000000000000";

const abiString = (s) => {
  const hex = Buffer.from(s).toString("hex");
  return "0x" + (32).toString(16).padStart(64, "0") + s.length.toString(16).padStart(64, "0") + hex.padEnd(Math.ceil(hex.length / 64) * 64 || 64, "0");
};

test("keccak256 matches the Ethereum test vectors", () => {
  assert.equal(keccak256("0x"), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccak256(new TextEncoder().encode("abc")), "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  // Longer than one 136-byte block.
  assert.equal(keccak256(new Uint8Array(200)).length, 66);
});

test("router selectors, authNonce and its calldata match the Solidity router", () => {
  assert.deepEqual(
    { ...ROUTER_SELECTORS },
    { authNonce: "0x8a7ae4e2", canDonate: "0xdd8fca6a", recipientsHash: "0xbd8e8b98", split: "0xf7654176", usdc: "0x3e413bee" }
  );
  assert.equal(routerAuthNonce(ROUTER, SALT, MEMO, RH), NONCE);
  assert.notEqual(routerAuthNonce(ROUTER, SALT, MEMO, "0x" + "ce".repeat(32)), NONCE, "the payout list is part of the nonce");
  assert.equal(encodeAuthNonceCall(SALT, MEMO, RH), AUTH_NONCE_CALL);
});

test("ReceiveWithAuthorization typed data hashes to the pinned EIP-712 digest", () => {
  const typed = buildAuthorization({
    kind: "ReceiveWithAuthorization",
    chainId: 5042002,
    token: ARC_USDC,
    name: "USDC",
    version: "2",
    from: DEV,
    to: ROUTER,
    value: 1000000n,
    validAfter: 0,
    validBefore: 1790000300,
    nonce: NONCE,
  });
  assert.equal(hashTypedData(typed), RECEIVE_DIGEST);
});

test("TransferWithAuthorization (x402 exact) typed data hashes to the pinned EIP-712 digest", () => {
  const typed = buildAuthorization({
    kind: "TransferWithAuthorization",
    chainId: 84532,
    token: BASE_SEPOLIA_USDC,
    name: "USDC",
    version: "2",
    from: DEV,
    to: SHELTER,
    value: "10000",
    validAfter: 0,
    validBefore: 1790000120,
    nonce: "0x" + "7c".repeat(32),
  });
  assert.equal(hashTypedData(typed), TRANSFER_DIGEST);
});

const addrRet = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");

function walletMock({ canDonate = 1n, nonce, split = SPLIT, usdc = ARC_USDC, name = "USDC" } = {}) {
  const calls = [];
  return {
    calls,
    async request({ method, params }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_requestAccounts":
          return [DEV];
        case "eth_chainId":
          return "0x" + (5042002).toString(16);
        case "eth_call": {
          const { to, data } = params[0];
          if (data.startsWith(ROUTER_SELECTORS.canDonate)) return "0x" + canDonate.toString(16).padStart(64, "0") + "0".repeat(64);
          if (data.startsWith(ROUTER_SELECTORS.recipientsHash)) return RH;
          if (data === ROUTER_SELECTORS.split) return addrRet(split);
          if (data === ROUTER_SELECTORS.usdc) return addrRet(usdc);
          if (data.startsWith(ROUTER_SELECTORS.authNonce)) {
            const salt = "0x" + data.slice(10, 74);
            const rh = "0x" + data.slice(138, 202);
            const len = parseInt(data.slice(202, 266), 16);
            const memo = Buffer.from(data.slice(266, 266 + len * 2), "hex").toString("utf8");
            return nonce ?? routerAuthNonce(to, salt, memo, rh);
          }
          if (data === "0x06fdde03") return name === null ? "0x" : abiString(name);
          if (data === "0x54fd4d50") return abiString("2");
          throw new Error("unexpected call " + data);
        }
        case "eth_signTypedData_v4":
          return "0x" + "12".repeat(65);
        default:
          throw new Error("unexpected " + method);
      }
    },
  };
}

test("signAndRelay signs one ReceiveWithAuthorization to the router and posts it to the relay", async () => {
  const wallet = walletMock();
  const posts = [];
  const out = await signAndRelay({
    provider: wallet,
    chainId: 5042002,
    router: ROUTER,
    usdc: ARC_USDC,
    split: SPLIT,
    amount: 1000000n,
    relayUrl: "https://api.example/shelter/relay",
    salt: SALT,
    memo: MEMO,
    now: 1790000000,
    fetch: async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ txHash: TX }) };
    },
  });
  assert.equal(out.txHash, TX);
  assert.equal(out.nonce, NONCE);

  const sign = wallet.calls.find((c) => c.method === "eth_signTypedData_v4");
  assert.equal(sign.params[0], DEV);
  const typed = JSON.parse(sign.params[1]);
  assert.equal(typed.primaryType, "ReceiveWithAuthorization");
  assert.equal(typed.message.to, ROUTER, "the payee is the router, never a Token Tails wallet");
  assert.equal(hashTypedData(typed), RECEIVE_DIGEST);
  assert.ok(!wallet.calls.some((c) => c.method === "eth_sendTransaction"), "the donor sends no transaction");

  assert.deepEqual(posts, [
    {
      url: "https://api.example/shelter/relay",
      body: { chainId: 5042002, from: DEV, value: "1000000", validAfter: "0", validBefore: "1790000300", salt: SALT, memo: MEMO, recipients: RH, signature: "0x" + "12".repeat(65) },
    },
  ]);
});

test("signAndRelay makes a random tt:wallet memo by default", async () => {
  let body;
  await signAndRelay({
    provider: walletMock(),
    chainId: 5042002,
    router: ROUTER,
    usdc: ARC_USDC,
    amount: 1n,
    relayUrl: "r",
    fetch: async (_u, init) => ((body = JSON.parse(init.body)), { ok: true, status: 200, json: async () => ({}) }),
  });
  assert.match(body.memo, /^tt:wallet:[0-9a-f]{8}$/);
  assert.match(body.salt, /^0x[0-9a-f]{64}$/);
});

test("signAndRelay refuses before signing when the router guard would revert", async () => {
  const wallet = walletMock({ canDonate: 0n });
  await assert.rejects(
    signAndRelay({ provider: wallet, chainId: 5042002, router: ROUTER, usdc: ARC_USDC, amount: 1n, relayUrl: "r", fetch: async () => assert.fail("must not post") }),
    /nothing was signed/
  );
  assert.ok(!wallet.calls.some((c) => c.method === "eth_signTypedData_v4"));
});

test("signAndRelay refuses a router wired to another split or token, before signing", async () => {
  const base = { chainId: 5042002, router: ROUTER, usdc: ARC_USDC, split: SPLIT, amount: 1n, relayUrl: "r", fetch: async () => assert.fail("must not post") };
  const other = walletMock({ split: SHELTER });
  await assert.rejects(signAndRelay({ ...base, provider: other }), /expected ShelterSplit; nothing was signed/);
  assert.ok(!other.calls.some((c) => c.method === "eth_signTypedData_v4"));
  await assert.rejects(signAndRelay({ ...base, provider: walletMock({ usdc: SHELTER }) }), /expected USDC; nothing was signed/);
  await assert.rejects(signAndRelay({ ...base, provider: walletMock({ name: null }) }), /name and version/);
});

test("signAndRelay refuses a router whose authNonce differs from the SDK", async () => {
  await assert.rejects(
    signAndRelay({ provider: walletMock({ nonce: "0x" + "00".repeat(32) }), chainId: 5042002, router: ROUTER, usdc: ARC_USDC, amount: 1n, relayUrl: "r", fetch: async () => assert.fail() }),
    /authNonce/
  );
});

test("signAndRelay surfaces the relay's refusal message", async () => {
  await assert.rejects(
    signAndRelay({
      provider: walletMock(),
      chainId: 5042002,
      router: ROUTER,
      usdc: ARC_USDC,
      amount: 1n,
      relayUrl: "r",
      fetch: async () => ({ ok: false, status: 429, json: async () => ({ code: "RELAY_DAILY_CAP", message: "cap reached" }) }),
    }),
    (err) => err.code === "RELAY_DAILY_CAP" && err.status === 429
  );
});

// ------------------------------------------------------------------ x402 exact

const exactOffer = (over = {}) => ({
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "10000",
  resource: "https://api.example/shelter/agent/cat-card",
  description: "A Token Tails cat card; the price goes to the shelter",
  mimeType: "application/json",
  payTo: SHELTER,
  maxTimeoutSeconds: 120,
  asset: BASE_SEPOLIA_USDC,
  extra: { name: "USDC", version: "2" },
  ...over,
});

test("pickExactOffer reads the chain id from the v1 network name", () => {
  const offer = pickExactOffer({ x402Version: 1, accepts: [{ scheme: "onchain-receipt" }, exactOffer()] });
  assert.equal(offer.chainId, 84532);
  assert.equal(offer.amountBase, 10000n);
  assert.throws(() => pickExactOffer({ x402Version: 1, accepts: [exactOffer({ network: "nowhere" })] }), /unknown network/);
  assert.throws(() => pickExactOffer({ x402Version: 1, accepts: [exactOffer({ extra: {} })] }), /EIP-712/);
});

test("EXACT_NETWORKS holds only x402 v1 network names; others need chainIds", () => {
  for (const name of ["arbitrum", "arbitrum-sepolia", "optimism", "arc-testnet"]) assert.equal(EXACT_NETWORKS[name], undefined);
  assert.throws(() => pickExactOffer({ x402Version: 1, accepts: [exactOffer({ network: "arbitrum-sepolia" })] }), /unknown network/);
  assert.equal(pickExactOffer({ x402Version: 1, accepts: [exactOffer({ network: "arbitrum-sepolia" })] }, { "arbitrum-sepolia": 421614 }).chainId, 421614);
});

test("pickOffer reads the onchain-receipt offer from the top-level field when accepts holds only exact", () => {
  const onchainReceipt = {
    scheme: "onchain-receipt",
    network: "eip155:5042002",
    maxAmountRequired: "10000000000000000",
    asset: "native",
    payTo: SPLIT,
    extra: { memo: "x402:n1", nonce: "n1" },
  };
  const offer = pickOffer({ x402Version: 1, accepts: [exactOffer()], onchainReceipt });
  assert.equal(offer.payTo, SPLIT);
  assert.equal(offer.chainId, 5042002);
  assert.throws(() => pickOffer({ x402Version: 1, accepts: [exactOffer()] }), /no 'onchain-receipt'/);
});

test("payAndFetch reports a refused exact payment as unpaid, with the server's reason", async () => {
  const fetchMock = async (_url, init = {}) =>
    init.headers?.["X-PAYMENT"]
      ? { ok: false, status: 402, json: async () => ({ x402Version: 1, error: "the facilitator refused the payment: insufficient_funds", accepts: [exactOffer()] }), headers: { get: () => null } }
      : { ok: false, status: 402, json: async () => ({ x402Version: 1, accepts: [exactOffer()] }), headers: { get: () => null } };
  const out = await payAndFetch("u", { fetch: fetchMock, maxAmountBase: 10000n, account: DEV, signTypedData: async () => "0x" + "34".repeat(65) });
  assert.equal(out.paid, null);
  assert.match(out.error, /insufficient_funds/);
});

test("encodeExactPaymentHeader is the x402 v1 PaymentPayload in base64", () => {
  const authorization = { from: DEV, to: SHELTER, value: "10000", validAfter: "0", validBefore: "1", nonce: "0x" + "00".repeat(32) };
  const decoded = JSON.parse(fromBase64(encodeExactPaymentHeader({ network: "base-sepolia", signature: "0xsig", authorization })));
  assert.deepEqual(decoded, { x402Version: 1, scheme: "exact", network: "base-sepolia", payload: { signature: "0xsig", authorization } });
});

test("payAndFetch pays an exact offer to the shelter wallet with one signature and no transaction", async () => {
  const requests = [];
  let signed;
  const fetchMock = async (url, init = {}) => {
    requests.push(init.headers || {});
    if (!init.headers?.["X-PAYMENT"]) {
      return {
        status: 402,
        json: async () => ({ x402Version: 1, error: "payment required", accepts: [exactOffer()], onchainReceipt: { scheme: "onchain-receipt", network: "eip155:5042", asset: "native" } }),
        headers: { get: () => null },
      };
    }
    return {
      status: 200,
      json: async () => ({ name: "Mochi" }),
      headers: { get: (h) => (h === "x-payment-response" ? toBase64(JSON.stringify({ success: true, transaction: TX, network: "base-sepolia", payer: DEV })) : null) },
    };
  };
  const out = await payAndFetch("https://api.example/shelter/agent/cat-card", {
    fetch: fetchMock,
    maxAmountBase: 10000n,
    account: DEV,
    now: 1790000000,
    signTypedData: async (typed) => ((signed = typed), "0x" + "34".repeat(65)),
  });
  assert.equal(out.response.status, 200);
  assert.deepEqual(out.paid, { scheme: "exact", txHash: TX, chainId: 84532, amountBase: 10000n, payTo: SHELTER });
  assert.equal(signed.primaryType, "TransferWithAuthorization");
  assert.equal(signed.message.to, SHELTER);
  assert.equal(signed.message.value, "10000");
  assert.equal(signed.message.validBefore, String(1790000000 + 120));
  const header = JSON.parse(fromBase64(requests[1]["X-PAYMENT"]));
  assert.equal(header.scheme, "exact");
  assert.equal(header.network, "base-sepolia");
  assert.deepEqual(header.payload.authorization, signed.message);
});

test("payAndFetch refuses an exact price above maxAmountBase", async () => {
  const fetchMock = async () => ({ status: 402, json: async () => ({ x402Version: 1, accepts: [exactOffer({ maxAmountRequired: "20000" })] }) });
  await assert.rejects(
    payAndFetch("u", { fetch: fetchMock, maxAmountBase: 10000n, account: DEV, signTypedData: async () => assert.fail("must not sign") }),
    /above your cap/
  );
});

// ------------------------------------------------------------------ widget

const src = readFileSync(new URL("../src/widget.js", import.meta.url), "utf8");
const sandbox = { TextEncoder, TextDecoder, BigInt };
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);
const rail = sandbox.ShelterRail;

test("widget parses gasless attributes and ignores malformed addresses", () => {
  const o = rail.readOptions({ mode: "gasless", chain: "5042002", router: ROUTER, usdc: ARC_USDC, relay: "https://api/relay", testnet: "true", shelter: "Pink Paw", theme: "dark" });
  assert.equal(o.mode, "gasless");
  assert.equal(o.router, ROUTER);
  assert.equal(o.usdc, ARC_USDC);
  assert.equal(o.relay, "https://api/relay");
  assert.equal(o.testnet, true);
  assert.equal(o.theme, "dark");
  const bad = rail.readOptions({ mode: "turbo", router: "0x123", usdc: "nope", theme: "neon" });
  // An unknown mode is "auto": gasless with a router and relay, native on Arc, token elsewhere.
  assert.equal(bad.mode, "auto");
  assert.equal(bad.router, null);
  assert.equal(bad.usdc, null);
  assert.equal(bad.theme, null);
  assert.equal(bad.testnet, false);
});

test("widget authNonce calldata matches the SDK", () => {
  assert.equal(rail.encodeAuthNonce(SALT, MEMO, RH), AUTH_NONCE_CALL);
  assert.equal(rail.decodeString(abiString("USD Coin")), "USD Coin");
});

test("widget keccak256 and router authNonce match the SDK", () => {
  assert.equal(rail.keccak256("0x"), keccak256("0x"));
  assert.equal(rail.keccak256(new TextEncoder().encode("abc")), keccak256(new TextEncoder().encode("abc")));
  assert.equal(rail.keccak256(new Uint8Array(200)), keccak256(new Uint8Array(200)));
  assert.equal(rail.routerAuthNonce(ROUTER, SALT, MEMO, RH), NONCE);
});

test("widget enables gasless giving only for a router wired to the shown split and USDC", async () => {
  const answers = (split, usdc) => async (_to, data) => (data === "0xf7654176" ? addrRet(split) : data === "0x3e413bee" ? addrRet(usdc) : "0x");
  await rail.checkRouter(answers(SPLIT, ARC_USDC), ROUTER, SPLIT.toUpperCase().replace("0X", "0x"), ARC_USDC);
  await assert.rejects(rail.checkRouter(answers(SHELTER, ARC_USDC), ROUTER, SPLIT, ARC_USDC), (e) => e.mismatch === true);
  await assert.rejects(rail.checkRouter(answers(SPLIT, SHELTER), ROUTER, SPLIT, ARC_USDC), (e) => e.mismatch === true);
  assert.equal(rail.decodeAddress("0x12"), null);
});

test("widget sums native and token payouts on one 18-decimal meter", () => {
  const amt = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0") + "0".repeat(128);
  const logs = [
    { topics: ["0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef"], data: amt(10n ** 18n) },
    { topics: ["0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a"], data: amt(500000n) },
    { topics: ["0x" + "99".repeat(32)], data: amt(7n) },
  ];
  assert.equal(rail.formatUnits(rail.sumPayouts(logs), 18), "1.5");
});
