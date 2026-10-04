// Multi-chain checkout + goal meter flows against the local stack (stack.sh). Local only; test tokens.
//
//   node flows.mjs pre       # packs on both chains in both coins, cats before the handover, keeper, goal
//   node flows.mjs handover  # on-chain rotation to the shelter's own wallet + sweep of the held wallet
//   node flows.mjs post      # goal recount, cat through the split, keeper, gifts, spending, impact rows
//
// Every wallet transaction is sent by an unlocked anvil dev account with the exact `steps` the API
// returned, the way a browser wallet would send them. Results: <state>/results-<phase>.json.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [phase] = process.argv.slice(2);
const STATE = process.env.E2E_STATE;
const API = process.env.PAY_API;
const JOBS = process.env.PAY_JOBS;
const DB = process.env.PAY_DB;
const st = JSON.parse(readFileSync(join(STATE, "state.json"), "utf8"));
const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" };
const results = [];
const A = st.a;
const B = st.b;
const chainOf = (id) => (id === A.chainId ? A : B);
const RUN = st.run || (st.run = String(Date.now()));

const token = (uid) =>
  "fbe2e." + Buffer.from(JSON.stringify({ uid, email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: "password" } })).toString("base64url");
const mongo = (js) => execFileSync("mongosh", ["--quiet", DB, "--eval", js], { encoding: "utf8" }).trim();
const mjson = (js) => JSON.parse(mongo(`JSON.stringify(${js})`));
const cast = (chain, ...args) => execFileSync("cast", [...args, "--rpc-url", chain.rpc], { encoding: "utf8", env }).trim();
const balance = (chain, tok, who) => BigInt(cast(chain, "call", tok, "balanceOf(address)(uint256)", who).split(" ")[0]);
const usdcText = (base) => {
  const s = BigInt(base).toString().padStart(7, "0");
  const frac = s.slice(-6).replace(/0+$/, "");
  return frac ? `${s.slice(0, -6)}.${frac}` : s.slice(0, -6);
};
const sendTx = (chain, from, to, sig, args = []) =>
  JSON.parse(cast(chain, "send", to, sig, ...args, "--unlocked", "--from", from, "--json")).transactionHash;

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
async function job(name) {
  const r = await fetch(`${JOBS}/run/${name}`, { method: "POST" });
  const body = await r.json();
  if (!r.ok) throw new Error(`${name} job: ${JSON.stringify(body)}`);
  return body;
}

/** Sends every step of an option as `from` (unlocked dev account) and returns the last tx hash. */
function payOption(from, option) {
  const chain = chainOf(option.chainId);
  let hash;
  for (const step of option.steps) {
    hash = JSON.parse(cast(chain, "send", step.to, step.data, "--unlocked", "--from", from, "--json")).transactionHash;
  }
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

async function confirm(as, orderId, chainId, txHash) {
  for (let i = 0; i < 20; i++) {
    const res = await api("POST", `/payments/crypto/orders/${orderId}/confirm`, { as, body: { chainId, txHash } });
    if (res.status !== 202) return res;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("still CONFIRMING after 10 s");
}

const userId = (uid) => mongo(`db.users.findOne({ email: "${uid}@example.test" })._id.toString()`);
/** Cats an account got from purchases (the starter every new account gets is left out). */
const catsOf = (uid) => Number(mongo(`db.cats.countDocuments({ owner: ObjectId("${userId(uid)}"), isStarter: { $ne: true } })`));
const option = (order, chainId, tok, route) =>
  order.accepted.find((o) => o.chainId === chainId && o.token === tok && (!route || o.route === route));
const ordersFor = (chainId, tx) => mjson(`db.orders.find({ hash: "evm:${chainId}:${tx}" }, { _id: 0, status: 1, currencyType: 1, priceUsd: 1, entityType: 1, id: 1 }).toArray()`);

async function admin() {
  const uid = `e2e-admin-${RUN}`;
  await api("GET", "/payments/crypto/orders/co_0000000000000000", { as: uid });
  mongo(`db.users.updateOne({ email: "${uid}@example.test" }, { $set: { permission: 5 } })`);
  return uid;
}
/** Runs the keeper until nothing is due or sent (each run settles what the previous one sent). */
async function keeper(max = 4) {
  const as = await admin();
  const runs = [];
  for (let i = 0; i < max; i++) {
    const r = await api("POST", "/payments/crypto/shelter-share/run", { as });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    runs.push(r.body);
    const open = Number(mongo(`db.cryptocheckouts.countDocuments({ "shelterShare.state": { $in: ["due", "sending", "sent"] } })`));
    if (!open) break;
  }
  return runs;
}
async function goal() {
  const scan = await job("goal");
  assert.equal(scan.state, "scanned", JSON.stringify(scan));
  const { status, body } = await api("GET", "/shelter/goal/C-001");
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

/** One pack bought by a fresh account: pays, confirms, checks the grant, the money and the order row. */
async function buyPack(label, chain, tok, from, { concurrent = 1 } = {}) {
  const uid = `e2e-${label}-${RUN}`;
  const { status, body: order } = await api("POST", "/payments/crypto/orders", { as: uid, body: { sku: { kind: "PACK", packType: "STARTER" } } });
  assert.equal(status, 201, JSON.stringify(order));
  assert.equal(order.priceUsdCents, 500);
  const opt = option(order, chain.chainId, tok);
  assert.ok(opt, `no ${tok} option on ${chain.chainId}: ${JSON.stringify(order.accepted.map((o) => [o.chainId, o.token]))}`);
  assert.equal(opt.recipient.toLowerCase(), st.dev.treasury.toLowerCase());
  const coin = tok === "USDC" ? chain.usdc : chain.eurc;
  const before = balance(chain, coin, st.dev.treasury);
  const tx = payOption(from, opt);
  const answers = await Promise.all(Array.from({ length: concurrent }, () => confirm(uid, order.orderId, chain.chainId, tx)));
  for (const a of answers) assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.ok(answers.every((a) => a.body.status === "COMPLETE"), JSON.stringify(answers.map((a) => a.body)));
  assert.equal(balance(chain, coin, st.dev.treasury) - before, BigInt(opt.amount));
  assert.equal(catsOf(uid), 1, "one cat granted");
  assert.deepEqual(ordersFor(chain.chainId, tx), [{ status: "COMPLETE", currencyType: tok, priceUsd: 5, entityType: "PACK", id: "STARTER" }]);
  return { uid, order, tx, opt, answers };
}

/** A shelter cat bought by a fresh account through `route` on `chain`/`tok`. */
async function buyCat(label, cat, chain, tok, from, route) {
  const uid = `e2e-${label}-${RUN}`;
  const { status, body: order } = await api("POST", "/payments/crypto/orders", { as: uid, body: { sku: { kind: "CAT", catId: cat } } });
  assert.equal(status, 201, JSON.stringify(order));
  assert.equal(order.priceUsdCents, 500);
  const opt = option(order, chain.chainId, tok, route);
  assert.ok(opt, `no ${tok}/${route} option on ${chain.chainId}: ${JSON.stringify(order.accepted.map((o) => [o.chainId, o.token, o.route]))}`);
  const tx = payOption(from, opt);
  const res = await confirm(uid, order.orderId, chain.chainId, tx);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, "COMPLETE");
  const copies = mjson(`db.cats.find({ owner: ObjectId("${userId(uid)}"), sourceCat: ObjectId("${cat}") }, { _id: 0, tier: 1, origin: 1 }).toArray()`);
  assert.deepEqual(copies, [{ tier: "COMMON", origin: "adopt" }]);
  const view = (await api("GET", `/payments/crypto/orders/${order.orderId}`, { as: uid })).body;
  return { uid, order, tx, opt, view };
}

/**
 * What the goal must show: every USDC inflow this run (and ui.cjs) sent to a campaign wallet, kept in
 * state.json so the phases (and the UI script between them) add to one running total.
 */
st.expect = st.expect || { base: "0", n: 0 };
const counted = (base, n = 1) => {
  st.expect = { base: (BigInt(st.expect.base) + BigInt(base)).toString(), n: st.expect.n + n };
};
const assertGoal = (g) => {
  assert.equal(g.raised, usdcText(st.expect.base), `goal raised (${st.expect.n} inflows expected)`);
  assert.equal(g.transfers, st.expect.n, "goal transfers");
};

const saveState = () => writeFileSync(join(STATE, "state.json"), JSON.stringify(st, null, 2) + "\n");

if (phase === "pre") {
  st.orders = {};

  await flow("P1 config: both chains (5042002 and 31337), USDC and EURC on each, not handed over", async () => {
    const { status, body } = await api("GET", "/payments/crypto/config");
    assert.equal(status, 200);
    assert.equal(body.enabled, true);
    assert.equal(body.shelterHandedOver, false);
    const chains = body.chains.map((c) => [c.chainId, c.tokens.map((t) => t.token).join("+")]).sort((x, y) => x[0] - y[0]);
    assert.deepEqual(chains, [[31337, "USDC+EURC"], [5042002, "USDC+EURC"]]);
    return { chains: body.chains.map((c) => c.name), prices: body.prices, fx: body.fx };
  });

  await flow("P2 pack in USDC on chain B (Arc testnet id): granted once, treasury paid, one order row", async () => {
    const r = await buyPack("pack-usdc-b", B, "USDC", st.dev.buyerA);
    st.orders.packUsdcB = { uid: r.uid, orderId: r.order.orderId, tx: r.tx, chainId: B.chainId };
    return { paid: `${r.opt.amountDisplay} USDC`, tx: r.tx };
  });

  await flow("P3 same pack confirmed 5 more times, in parallel: replays, still one cat and one order row", async () => {
    const o = st.orders.packUsdcB;
    const answers = await Promise.all(Array.from({ length: 5 }, () => confirm(o.uid, o.orderId, o.chainId, o.tx)));
    for (const a of answers) {
      assert.equal(a.status, 200, JSON.stringify(a.body));
      assert.equal(a.body.status, "COMPLETE");
      assert.equal(a.body.replay, true);
    }
    assert.equal(catsOf(o.uid), 1);
    assert.equal(ordersFor(o.chainId, o.tx).length, 1);
  });

  await flow("P4 the chain B tx hash claimed on chain A for a new order: never granted (chain A has no such tx)", async () => {
    // Chain A's node has never seen that hash, so the server cannot tell "not mined yet" from "not on this
    // chain": it answers 202 CONFIRMING with 0 confirmations and grants nothing (known limit: the client
    // polls for 20 minutes before it says so; see docs/BACKEND.md "Known issues").
    const uid = `e2e-crosschain-${RUN}`;
    const { body: order } = await api("POST", "/payments/crypto/orders", { as: uid, body: { sku: { kind: "PACK", packType: "STARTER" } } });
    const res = await api("POST", `/payments/crypto/orders/${order.orderId}/confirm`, { as: uid, body: { chainId: A.chainId, txHash: st.orders.packUsdcB.tx } });
    assert.equal(res.status, 202, JSON.stringify(res));
    assert.equal(res.body.status, "CONFIRMING");
    assert.equal(res.body.confirmations, 0);
    // The same hash on its own chain but for this other order: it pays the first order, not this one.
    const other = await api("POST", `/payments/crypto/orders/${order.orderId}/confirm`, { as: uid, body: { chainId: B.chainId, txHash: st.orders.packUsdcB.tx } });
    assert.ok(other.status >= 400 && other.status < 500, JSON.stringify(other));
    assert.equal(catsOf(uid), 0);
    assert.equal((await api("GET", `/payments/crypto/orders/${order.orderId}`, { as: uid })).body.status, "OPEN");
    return { onA: res.status, onB: `${other.status} ${other.body.code}` };
  });

  await flow("P5 pack in EURC on chain A, first confirms sent 4 at once: granted exactly once", async () => {
    const r = await buyPack("pack-eurc-a", A, "EURC", st.dev.buyerB, { concurrent: 4 });
    const replays = r.answers.filter((a) => a.body.replay).length;
    assert.equal(replays, 3, `expected 1 grant + 3 replays, got ${JSON.stringify(r.answers.map((a) => a.body))}`);
    return { paid: `${r.opt.amountDisplay} EURC`, replays };
  });

  await flow("P6 pack in EURC on chain B: granted once", async () => {
    const r = await buyPack("pack-eurc-b", B, "EURC", st.dev.buyerC);
    return { paid: `${r.opt.amountDisplay} EURC` };
  });

  await flow("P7 pack in USDC on chain A: granted once; the goal does not move (packs are commerce)", async () => {
    const r = await buyPack("pack-usdc-a", A, "USDC", st.dev.buyerA);
    const g = await goal();
    assertGoal(g);
    return { paid: `${r.opt.amountDisplay} USDC`, goal: g.raised };
  });

  await flow("P8 shelter cat in USDC on chain A before the handover: treasury route, share due 2.50", async () => {
    const r = await buyCat("cat-pre-a", st.cats[0], A, "USDC", st.dev.buyerB, "transfer");
    assert.ok(!r.order.accepted.some((o) => o.route === "split"), "no split route before the handover");
    assert.equal(r.opt.recipient.toLowerCase(), st.dev.treasury.toLowerCase());
    assert.equal(r.view.shelterShare.state, "due");
    assert.equal(r.view.shelterShare.amountUsdCents, 250);
    st.orders.catPreA = { uid: r.uid, orderId: r.order.orderId, tx: r.tx };
    return { shelterShare: r.view.shelterShare };
  });

  await flow("P9 shelter cat in EURC on chain B before the handover: treasury route, share due 2.50", async () => {
    const r = await buyCat("cat-pre-b", st.cats[1], B, "EURC", st.dev.buyerC, "transfer");
    assert.equal(r.view.shelterShare.state, "due");
    assert.equal(r.view.shelterShare.amountUsdCents, 250);
    st.orders.catPreB = { uid: r.uid, orderId: r.order.orderId, tx: r.tx };
    return { shelterShare: r.view.shelterShare };
  });

  await flow("P10 keeper pays both shares through ShelterSplit to the held wallet, once; receipts custodial", async () => {
    const before = balance(A, A.usdc, st.dev.held);
    const runs = await keeper();
    assert.equal(balance(A, A.usdc, st.dev.held) - before, 5000000n);
    for (const key of ["catPreA", "catPreB"]) {
      const o = st.orders[key];
      const v = (await api("GET", `/payments/crypto/orders/${o.orderId}`, { as: o.uid })).body;
      assert.equal(v.status, "COMPLETE");
      assert.equal(v.shelterShare.state, "confirmed", JSON.stringify(v.shelterShare));
      assert.equal(v.shelterShare.evidenceTier, "onchain-custodial");
      assert.equal(v.shelterShare.amountUsdCents, 250);
      o.shareTx = v.shelterShare.txHash;
    }
    const again = await keeper(1);
    assert.equal(again[0].sent, 0);
    assert.equal(balance(A, A.usdc, st.dev.held) - before, 5000000n, "a second run pays nothing");
    return { runs };
  });

  await flow("P11 goal meter before the handover: 5 USDC from 2 shop shares, treats + shop shares named", async () => {
    counted(5000000n, 2);
    const g = await goal();
    assertGoal(g);
    assert.equal(g.upToDate, true);
    assert.equal(g.goalUsdc, "50000");
    assert.deepEqual(g.wallets.map((w) => w.holder), ["token-tails"]);
    assert.deepEqual([...g.liveSources].sort(), ["purchase-shares", "treats"]);
    return { raised: g.raised, liveSources: g.liveSources };
  });

  await flow("P12 a shelter cat bought just before the handover: its share is sent, not yet settled", async () => {
    const r = await buyCat("cat-straddle", st.cats[2], A, "USDC", st.dev.buyerC, "transfer");
    assert.equal(r.view.shelterShare.state, "due");
    const as = await admin();
    const run = await api("POST", "/payments/crypto/shelter-share/run", { as });
    assert.equal(run.body.sent, 1, JSON.stringify(run.body));
    const v = (await api("GET", `/payments/crypto/orders/${r.order.orderId}`, { as: r.uid })).body;
    assert.equal(v.shelterShare.state, "sent");
    counted(2500000n); // mined at once on anvil; settled only after the handover (Q2)
    st.orders.catStraddle = { uid: r.uid, orderId: r.order.orderId, tx: r.tx, shareTx: v.shelterShare.txHash };
    return { shareTx: v.shelterShare.txHash };
  });

  await flow("P13 impact ledger: every shop share is a payout row to the held wallet, right amount, once", async () => {
    await job("indexer");
    const rows = mjson(`db.shelterpayoutevents.find({ memo: /^tt:cat:/ }, { _id: 0, txHash: 1, shelter: 1, amount: 1, bucket: 1, memo: 1 }).toArray()`);
    assert.equal(rows.length, 3, JSON.stringify(rows));
    for (const row of rows) {
      assert.equal(row.shelter.toLowerCase(), st.dev.held.toLowerCase());
      assert.equal(row.amount, "2500000");
    }
    await job("indexer");
    assert.equal(Number(mongo(`db.shelterpayoutevents.countDocuments({ memo: /^tt:cat:/ })`)), 3, "a second index run adds nothing");
    return { buckets: [...new Set(rows.map((r) => r.bucket))] };
  });
} else if (phase === "handover") {
  await flow("H1 rotate the split to the shelter's own wallet, then sweep the held wallet into it", async () => {
    sendTx(A, st.dev.owner, A.split, "removeShelter(address)", [st.dev.held]);
    sendTx(A, st.dev.owner, A.split, "addShelter(address,uint16,string)", [st.dev.own, "10000", "Pink Paw (E2E own wallet)"]);
    st.handoverBlock = Number(cast(A, "block-number"));
    const held = balance(A, A.usdc, st.dev.held);
    assert.equal(held, BigInt(st.expect.base), "everything that came in before the handover sits in the held wallet");
    st.sweepTx = sendTx(A, st.dev.held, A.usdc, "transfer(address,uint256)", [st.dev.own, held.toString()]);
    assert.equal(balance(A, A.usdc, st.dev.own), held);
    return { handoverBlock: st.handoverBlock, swept: usdcText(held) };
  });
} else if (phase === "post") {
  await flow("Q1 config after the handover: shelterHandedOver true", async () => {
    const { body } = await api("GET", "/payments/crypto/config");
    assert.equal(body.shelterHandedOver, true);
  });

  await flow("Q2 the share sent before the handover settles as custodial (it reached the held wallet)", async () => {
    const o = st.orders.catStraddle;
    await keeper(1);
    const v = (await api("GET", `/payments/crypto/orders/${o.orderId}`, { as: o.uid })).body;
    assert.equal(v.shelterShare.state, "confirmed");
    assert.equal(v.shelterShare.evidenceTier, "onchain-custodial", "paid to the wallet Token Tails held");
    return { shelterShare: v.shelterShare };
  });

  await flow("Q3 goal recounted over both wallets: everything before the handover, the sweep not counted again", async () => {
    const g = await goal();
    assertGoal(g);
    assert.deepEqual(g.wallets.map((w) => [w.holder, w.toBlock === null]), [["token-tails", false], ["shelter", true]]);
    assert.deepEqual([...g.liveSources].sort(), ["gifts", "match", "purchase-shares", "treats", "x402"]);
    return { raised: g.raised, liveSources: g.liveSources };
  });

  await flow("Q4 shelter cat in USDC on chain A after the handover: straight into ShelterSplit, 5 to the shelter", async () => {
    const before = balance(A, A.usdc, st.dev.own);
    const r = await buyCat("cat-post-a", st.cats[3], A, "USDC", st.dev.buyerA, "split");
    assert.equal(r.opt.recipient.toLowerCase(), A.split.toLowerCase());
    assert.deepEqual(r.opt.steps.map((s) => s.kind), ["approve", "disburse"]);
    assert.equal(balance(A, A.usdc, st.dev.own) - before, 5000000n);
    assert.equal(r.view.shelterShare.state, "onchain");
    assert.equal(r.view.shelterShare.evidenceTier, "onchain-shelter-held");
    assert.equal(r.view.shelterShare.amountUsdCents, 500);
    const replay = await confirm(r.uid, r.order.orderId, A.chainId, r.tx);
    assert.equal(replay.body.replay, true);
    assert.equal(catsOf(r.uid), 1);
    st.orders.catPostA = { uid: r.uid, orderId: r.order.orderId, tx: r.tx };
    counted(5000000n);
    const g = await goal();
    assertGoal(g);
    return { goal: g.raised, shelterShare: r.view.shelterShare };
  });

  await flow("Q5 shelter cat in EURC on chain B after the handover: treasury route, keeper pays the shelter's own wallet", async () => {
    const r = await buyCat("cat-post-b", st.cats[4], B, "EURC", st.dev.buyerB, "transfer");
    assert.ok(!r.order.accepted.some((o) => o.chainId === B.chainId && o.route === "split"), "no split on chain B");
    assert.equal(r.view.shelterShare.state, "due");
    const before = balance(A, A.usdc, st.dev.own);
    await keeper();
    assert.equal(balance(A, A.usdc, st.dev.own) - before, 2500000n);
    const v = (await api("GET", `/payments/crypto/orders/${r.order.orderId}`, { as: r.uid })).body;
    assert.equal(v.shelterShare.state, "confirmed");
    assert.equal(v.shelterShare.evidenceTier, "onchain-shelter-held");
    st.orders.catPostB = { uid: r.uid, orderId: r.order.orderId, tx: r.tx };
    counted(2500000n);
    const g = await goal();
    assertGoal(g);
    return { goal: g.raised };
  });

  await flow("Q6 gifts: a direct wallet transfer (3) and a gift through ShelterSplit (2) both count", async () => {
    sendTx(A, st.dev.donor, A.usdc, "transfer(address,uint256)", [st.dev.own, "3000000"]);
    counted(3000000n);
    let g = await goal();
    assertGoal(g);
    sendTx(A, st.dev.donor, A.usdc, "approve(address,uint256)", [A.split, "2000000"]);
    sendTx(A, st.dev.donor, A.split, "disburse(uint256,string)", ["2000000", "e2e:gift"]);
    counted(2000000n);
    g = await goal();
    assertGoal(g);
    return { raised: g.raised, transfers: g.transfers };
  });

  await flow("Q7 the shelter spends 4: the count does not go down", async () => {
    sendTx(A, st.dev.own, A.usdc, "transfer(address,uint256)", [st.dev.donor, "4000000"]);
    const g = await goal();
    assertGoal(g);
    return { raised: g.raised };
  });

  await flow("Q8 a pack after the handover still pays the treasury; the goal does not move", async () => {
    await buyPack("pack-post-a", A, "USDC", st.dev.buyerC);
    const g = await goal();
    assertGoal(g);
  });

  await flow("Q9 impact ledger: one payout row per shop share and gift, right wallet and amount; snapshot runs", async () => {
    await job("indexer");
    const rowsFor = (memo) =>
      mjson(`db.shelterpayoutevents.find({ memo: "${memo}" }, { _id: 0, shelter: 1, amount: 1, bucket: 1 }).toArray()`);
    const memo = (key) => `tt:cat:${st.orders[key].orderId.replace(/^co_/, "")}`;
    const expectRows = [
      ["catPreA", st.dev.held, "2500000"],
      ["catPreB", st.dev.held, "2500000"],
      ["catStraddle", st.dev.held, "2500000"],
      ["catPostA", st.dev.own, "5000000"],
      ["catPostB", st.dev.own, "2500000"],
    ];
    const seen = {};
    for (const [key, wallet, amount] of expectRows) {
      const rows = rowsFor(memo(key));
      assert.equal(rows.length, 1, `${key}: ${JSON.stringify(rows)}`);
      assert.equal(rows[0].shelter.toLowerCase(), wallet.toLowerCase(), key);
      assert.equal(rows[0].amount, amount, key);
      seen[key] = `${usdcText(amount)} ${rows[0].bucket}`;
    }
    const gift = rowsFor("e2e:gift");
    assert.deepEqual(gift.map((r) => [r.shelter.toLowerCase(), r.amount]), [[st.dev.own.toLowerCase(), "2000000"]]);
    seen.gift = `2 ${gift[0].bucket}`;
    const snap = await job("snapshot");
    assert.ok(snap.ok, JSON.stringify(snap));
    return seen;
  });

  await flow("Q10 every checkout settled once: one order row per paid tx, no grant pending, no share open", async () => {
    const dup = mjson(`db.orders.aggregate([{ $match: { hash: /^evm:/ } }, { $group: { _id: "$hash", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray()`);
    assert.deepEqual(dup, []);
    const states = mjson(`db.cryptocheckouts.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()`);
    const open = Number(mongo(`db.cryptocheckouts.countDocuments({ "shelterShare.state": { $in: ["due", "sending", "sent", "failed"] } })`));
    assert.equal(open, 0);
    return { states };
  });
} else {
  console.error("usage: node flows.mjs pre|handover|post");
  process.exit(2);
}

writeFileSync(join(STATE, `results-${phase}.json`), JSON.stringify(results, null, 2) + "\n");
saveState();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} flows passed (${join(STATE, `results-${phase}.json`)})`);
process.exit(failed ? 1 : 0);
