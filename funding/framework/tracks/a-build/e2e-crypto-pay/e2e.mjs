// Crypto checkout E2E flows against the local stack (stack.sh). Local only; test tokens only.
//
//   node e2e.mjs pre    # before the handover: packs, EURC, refusals, shelter cat + keeper, Stellar 410
//   node e2e.mjs post   # after the handover: shelter cat paid straight into ShelterSplit; then expiry
//
// Every wallet transaction is sent by an unlocked anvil dev account with the exact `steps` the API
// returned, the way a browser wallet would send them.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [phase] = process.argv.slice(2);
const STATE = process.env.E2E_STATE;
const API = process.env.CRYPTO_API;
const DB = process.env.CRYPTO_DB;
const st = JSON.parse(readFileSync(join(STATE, "state.json"), "utf8"));
const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" };
const results = [];

const token = (uid) =>
  "fbe2e." + Buffer.from(JSON.stringify({ uid, email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: "password" } })).toString("base64url");
const mongo = (js) => execFileSync("mongosh", ["--quiet", DB, "--eval", js], { encoding: "utf8" }).trim();
const cast = (...args) => execFileSync("cast", [...args, "--rpc-url", st.rpc], { encoding: "utf8", env }).trim();
const balance = (tok, who) => BigInt(cast("call", tok, "balanceOf(address)(uint256)", who).split(" ")[0]);

async function api(method, path, { as, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(as ? { accesstoken: token(as) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

/** Sends one step as `from` (unlocked dev account) and returns the tx hash. */
function sendStep(from, step) {
  const out = cast("send", step.to, step.data, "--unlocked", "--from", from, "--json");
  return JSON.parse(out).transactionHash;
}
function payOption(from, option) {
  let hash;
  for (const step of option.steps) hash = sendStep(from, step);
  return hash;
}

async function flow(name, fn) {
  try {
    const detail = await fn();
    results.push({ flow: name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok  ${name}`);
  } catch (error) {
    results.push({ flow: name, ok: false, error: String(error?.message || error) });
    console.log(`  FAIL ${name}\n       ${String(error?.message || error).split("\n").join("\n       ")}`);
  }
}

async function confirm(as, orderId, txHash) {
  // A wallet sees its transaction before the server does; poll 202 like the client will.
  for (let i = 0; i < 10; i++) {
    const res = await api("POST", `/payments/crypto/orders/${orderId}/confirm`, { as, body: { chainId: 31337, txHash } });
    if (res.status !== 202) return res;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("still CONFIRMING after 5 s");
}

const userId = (uid) => mongo(`db.users.findOne({ email: "${uid}@example.test" })._id.toString()`);
/** Copies of catalogue cat `cat` owned by the account `uid`. */
const copies = (uid, cat, projection = "{ _id: 0, tier: 1, origin: 1 }") =>
  JSON.parse(mongo(`JSON.stringify(db.cats.find({ owner: ObjectId("${userId(uid)}"), sourceCat: ObjectId("${cat}") }, ${projection}).toArray())`));
const local = (order, tok = "USDC") => order.accepted.find((o) => o.chainId === 31337 && o.token === tok);

if (phase === "pre") {
  const A = `e2e-buyer-a-${Date.now()}`;
  const B = `e2e-buyer-b-${Date.now()}`;
  const ADMIN = `e2e-admin-${Date.now()}`;
  let packOrder, packTx;

  await flow("1 config lists the local chain with USDC and EURC, prices, EURC table rate", async () => {
    const { status, body } = await api("GET", "/payments/crypto/config");
    assert.equal(status, 200);
    assert.equal(body.enabled, true);
    assert.equal(body.network, "testnet");
    assert.deepEqual(body.chains.map((c) => c.chainId), [31337]);
    assert.deepEqual(body.chains[0].tokens.map((t) => t.token), ["USDC", "EURC"]);
    assert.equal(body.prices.shelterCat, 5);
    return { prices: body.prices, fx: body.fx };
  });

  await flow("2 pack order: server price, unique amount, treasury, ready-to-send transfer", async () => {
    const { status, body } = await api("POST", "/payments/crypto/orders", { as: A, body: { sku: { kind: "PACK", packType: "STARTER" }, discount: "nobody" } });
    assert.equal(status, 201, JSON.stringify(body));
    packOrder = body;
    const usdc = local(body);
    assert.equal(body.priceUsdCents, 500);
    assert.equal(usdc.recipient.toLowerCase(), st.dev.treasury.toLowerCase());
    assert.equal(usdc.binding, "amount");
    assert.ok(BigInt(usdc.amount) > 5000000n && BigInt(usdc.amount) < 5010000n, usdc.amount);
    return { orderId: body.orderId, amount: usdc.amountDisplay };
  });

  await flow("3 confirm before the real payment: an unrelated or rounded tx is refused (400)", async () => {
    // A rounded 5.00 (no unique tag, like an exchange withdrawal) is reported UNDERPAID, never accepted.
    const rounded = cast("send", st.usdc, "transfer(address,uint256)", st.dev.treasury, "5000000", "--unlocked", "--from", st.dev.buyer, "--json");
    const res = await confirm(A, packOrder.orderId, JSON.parse(rounded).transactionHash);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "CRYPTO_PAY_UNDERPAID");
    const other = cast("send", st.usdc, "transfer(address,uint256)", st.dev.treasury, "1000000", "--unlocked", "--from", st.dev.buyer, "--json");
    const res2 = await confirm(A, packOrder.orderId, JSON.parse(other).transactionHash);
    assert.equal(res2.status, 400);
    assert.equal(res2.body.code, "CRYPTO_PAY_NO_MATCHING_TRANSFER");
  });

  await flow("4 pay the exact amount, confirm: COMPLETE, one cat granted, one EVM order", async () => {
    const before = balance(st.usdc, st.dev.treasury);
    packTx = payOption(st.dev.buyer, local(packOrder));
    const res = await confirm(A, packOrder.orderId, packTx);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "COMPLETE");
    assert.equal(res.body.success, true);
    assert.equal(balance(st.usdc, st.dev.treasury) - before, BigInt(local(packOrder).amount));
    const order = JSON.parse(mongo(`JSON.stringify(db.orders.findOne({ hash: "evm:31337:${packTx}" }, { _id: 0, status: 1, chainType: 1, currencyType: 1, priceUsd: 1, entityType: 1, id: 1 }))`));
    assert.deepEqual(order, { status: "COMPLETE", chainType: "EVM", currencyType: "USDC", priceUsd: 5, entityType: "PACK", id: "STARTER" });
    return { txHash: packTx, order };
  });

  await flow("5 replayed confirm grants nothing", async () => {
    const res = await confirm(A, packOrder.orderId, packTx);
    assert.equal(res.status, 200);
    assert.equal(res.body.replay, true);
    const n = Number(mongo(`db.orders.countDocuments({ hash: "evm:31337:${packTx}" })`));
    assert.equal(n, 1);
  });

  await flow("6 a used tx cannot pay another order: refused, nothing granted", async () => {
    // Its amount is bound to the first order, so the check refuses it before the hash index (409
    // CRYPTO_PAY_TX_USED) is reached; a crafted tx matching two orders is covered by the unit spec.
    const { body } = await api("POST", "/payments/crypto/orders", { as: A, body: { sku: { kind: "LOOT_BOX" } } });
    const res = await confirm(A, body.orderId, packTx);
    assert.ok([400, 409].includes(res.status), JSON.stringify(res.body));
    assert.ok(["CRYPTO_PAY_NO_MATCHING_TRANSFER", "CRYPTO_PAY_TX_USED"].includes(res.body.code));
    assert.equal(Number(mongo(`db.orders.countDocuments({ hash: "evm:31337:${packTx}" })`)), 1);
    const view = (await api("GET", `/payments/crypto/orders/${body.orderId}`, { as: A })).body;
    assert.equal(view.status, "OPEN");
    return { status: res.status, code: res.body.code };
  });

  await flow("7 EURC: loot box paid in EURC at the table rate", async () => {
    const { body } = await api("POST", "/payments/crypto/orders", { as: A, body: { sku: { kind: "LOOT_BOX" } } });
    const eurc = local(body, "EURC");
    const tx = payOption(st.dev.buyer, eurc);
    const res = await confirm(A, body.orderId, tx);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "COMPLETE");
    const order = JSON.parse(mongo(`JSON.stringify(db.orders.findOne({ hash: "evm:31337:${tx}" }, { _id: 0, currencyType: 1, priceUsd: 1 }))`));
    assert.deepEqual(order, { currencyType: "EURC", priceUsd: 1 });
    return { paid: eurc.amountDisplay + " EURC" };
  });

  await flow("8 shelter cat before the handover: $5 to the treasury, basic tier copy, share due", async () => {
    const { status, body } = await api("POST", "/payments/crypto/orders", { as: B, body: { sku: { kind: "CAT", catId: st.cats[0] }, discount: "anything" } });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.priceUsdCents, 500);
    assert.ok(!body.accepted.some((o) => o.route === "split"), "no split route before the handover");
    const tx = payOption(st.dev.buyer2, local(body));
    const res = await confirm(B, body.orderId, tx);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "COMPLETE");
    assert.deepEqual(copies(B, st.cats[0]), [{ tier: "COMMON", origin: "adopt" }]);
    const view = (await api("GET", `/payments/crypto/orders/${body.orderId}`, { as: B })).body;
    assert.equal(view.shelterShare.state, "due");
    assert.equal(view.shelterShare.amountUsdCents, 250);
    st.catOrder = body.orderId;
    return { shelterShare: view.shelterShare };
  });

  await flow("9 a second order for a cat the buyer owns: 409 CRYPTO_PAY_ALREADY_OWNED", async () => {
    const res = await api("POST", "/payments/crypto/orders", { as: B, body: { sku: { kind: "CAT", catId: st.cats[0] } } });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "CRYPTO_PAY_ALREADY_OWNED");
  });

  await flow("10 keeper pays the shelter share from the hot wallet through ShelterSplit, custodial tier", async () => {
    await api("GET", "/payments/crypto/config", { as: ADMIN });
    await api("GET", `/payments/crypto/orders/co_0000000000000000`, { as: ADMIN });
    mongo(`db.users.updateOne({ email: "${ADMIN}@example.test" }, { $set: { permission: 5 } })`);
    const before = balance(st.usdc, st.dev.shelter);
    const run1 = await api("POST", "/payments/crypto/shelter-share/run", { as: ADMIN });
    assert.equal(run1.status, 200, JSON.stringify(run1.body));
    assert.equal(run1.body.sent, 1, JSON.stringify(run1.body));
    const run2 = await api("POST", "/payments/crypto/shelter-share/run", { as: ADMIN });
    assert.equal(run2.body.confirmed, 1, JSON.stringify(run2.body));
    assert.equal(balance(st.usdc, st.dev.shelter) - before, 2500000n);
    const view = (await api("GET", `/payments/crypto/orders/${st.catOrder}`, { as: B })).body;
    assert.equal(view.shelterShare.state, "confirmed");
    assert.equal(view.shelterShare.evidenceTier, "onchain-custodial");
    const logs = cast("logs", "--from-block", String(st.fromBlock), "--address", st.split, "Disbursed(address indexed shelter, uint256 amount, string memo)", "--json");
    assert.ok(logs.includes(view.shelterShare.txHash), "Disbursed event in the share tx");
    return { txHash: view.shelterShare.txHash };
  });

  await flow("11 Stellar pack: verified before anything is refused, nothing granted for an unknown payment", async () => {
    // A pack payment that still arrives is verified and recorded first (paid before the sunset: granted;
    // after: refund due + 410). An unknown hash fails verification (400, or 503 without Horizon access).
    const hash = "a".repeat(64);
    const res = await api("POST", "/web3/confirm", {
      as: A,
      body: { chainType: "STELLAR", hash, currencyType: "USDC", price: 5, entityType: "PACK", id: "STARTER" },
    });
    assert.ok([400, 503].includes(res.status), JSON.stringify(res.body));
    const order = JSON.parse(mongo(`JSON.stringify(db.orders.findOne({ failedHash: "${hash}" }, { _id: 0, status: 1 }))`));
    assert.deepEqual(order, { status: "FAILED" });
    return { status: res.status };
  });
} else if (phase === "post") {
  const C = `e2e-buyer-c-${Date.now()}`;
  await flow("12 after the handover: shelter cat paid straight into ShelterSplit (approve + disburse)", async () => {
    const { status, body } = await api("POST", "/payments/crypto/orders", { as: C, body: { sku: { kind: "CAT", catId: st.cats[1] } } });
    assert.equal(status, 201, JSON.stringify(body));
    const split = body.accepted.find((o) => o.route === "split");
    assert.ok(split, "split route offered");
    assert.equal(split.recipient.toLowerCase(), st.split.toLowerCase());
    assert.deepEqual(split.steps.map((s) => s.kind), ["approve", "disburse"]);
    const before = balance(st.usdc, st.dev.shelter);
    const tx = payOption(st.dev.buyer2, split);
    const res = await confirm(C, body.orderId, tx);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "COMPLETE");
    assert.equal(balance(st.usdc, st.dev.shelter) - before, 5000000n);
    const view = (await api("GET", `/payments/crypto/orders/${body.orderId}`, { as: C })).body;
    assert.equal(view.shelterShare.state, "onchain");
    assert.equal(view.shelterShare.evidenceTier, "onchain-shelter-held");
    assert.equal(view.shelterShare.amountUsdCents, 500);
    assert.deepEqual(copies(C, st.cats[1]), [{ tier: "COMMON", origin: "adopt" }]);
    return { txHash: tx, shelterShare: view.shelterShare };
  });

  await flow("13a a payment mined in the 2-hour grace after expiry is still granted", async () => {
    const { body } = await api("POST", "/payments/crypto/orders", { as: C, body: { sku: { kind: "LOOT_BOX" } } });
    const usdc = local(body);
    // Past expiresAt (5 minutes in this stack), inside the grace.
    cast("rpc", "evm_increaseTime", "420");
    cast("rpc", "evm_mine");
    const tx = payOption(st.dev.buyer2, usdc);
    const res = await confirm(C, body.orderId, tx);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "COMPLETE");
    return { txHash: tx };
  });

  await flow("13 a payment mined after the order and its grace closed: 410 with a refund due, nothing granted", async () => {
    // A fresh buyer: 13a's loot box draws a random seeded cat, so C may already own cats[2] (409).
    const D = `e2e-buyer-d-${Date.now()}`;
    const { body } = await api("POST", "/payments/crypto/orders", { as: D, body: { sku: { kind: "CAT", catId: st.cats[2] } } });
    // After the handover USDC goes through the split here; EURC still pays the treasury by exact amount.
    const usdc = body.accepted.find((o) => o.chainId === 31337 && o.route === "transfer");
    // Move the chain clock past expiresAt (5 minutes in this stack) plus the 2-hour grace, then pay.
    cast("rpc", "evm_increaseTime", String(5 * 60 + 2 * 3600 + 120));
    cast("rpc", "evm_mine");
    const tx = payOption(st.dev.buyer2, usdc);
    const res = await confirm(D, body.orderId, tx);
    assert.equal(res.status, 410, JSON.stringify(res.body));
    assert.equal(res.body.code, "CRYPTO_PAY_EXPIRED");
    assert.equal(res.body.refund, "due");
    const order = JSON.parse(mongo(`JSON.stringify(db.orders.findOne({ hash: "evm:31337:${tx}" }, { _id: 0, status: 1, "refund.state": 1, "refund.reason": 1 }))`));
    assert.deepEqual(order, { status: "FAILED_GRANT", refund: { state: "due", reason: "PAID_AFTER_EXPIRY" } });
    assert.deepEqual(copies(D, st.cats[2]), []);
  });
} else {
  console.error("usage: node e2e.mjs pre|post");
  process.exit(2);
}

const file = join(STATE, `results-${phase}.json`);
writeFileSync(file, JSON.stringify(results, null, 2) + "\n");
writeFileSync(join(STATE, "state.json"), JSON.stringify(st, null, 2) + "\n");
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} flows passed (${file})`);
process.exit(failed ? 1 : 0);
