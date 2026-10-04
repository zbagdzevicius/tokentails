// copy-lint: web-only E2E of every donation flow against a local stack (never part of an app build)
/**
 * Every donation flow end to end on a LOCAL stack: an anvil fork of Arc testnet, a throwaway backend
 * (real ShelterRelay/Match/Claim/Donate/X402 services, its hot wallet = anvil dev #1) and a second
 * Next dev server. Started by funding/framework/tracks/a-build/e2e-donate/stack.sh:
 *
 *   funding/framework/tracks/a-build/e2e-donate/stack.sh all      # up, this spec, down
 *
 * Skipped unless DONATE_STACK=1. Nothing here touches a real network or a real key: wallets are
 * anvil's unlocked dev accounts behind an injected EIP-1193 provider, and the fork is thrown away.
 *
 * Flows, in order (serial, they share the fork):
 *  1 payouts page: campaign awaiting handover (no public button) + testnet try-it block live
 *  2 gasless one-signature gift through the backend relay (donor pays no gas)
 *  3 Token Tails 1:1 match sent by the backend reconcile job; the receipt pairs it
 *  4 one-transaction native gift (router.donateNative), no backend in the path
 *  5 shelter wallet claim on the onboarding page (personal_sign), then the manual "rotated" step
 *  6 post-handover direct gift from the campaign block (the founder goal), custody guard satisfied
 *  7 sponsored treat: verified account -> backend hot wallet donate('tt:page:…')
 *  8 x402 onchain-receipt: an agent pays ShelterSplit.donate('x402:<nonce>') and gets the cat card
 *  9 x402 exact: an agent signs one EIP-3009 transfer straight to the shelter wallet (local facilitator)
 * 10 shelter-rail widget, gasless mode, embedded on a third-party page
 * 11 treat agent: CappedSpender gives within its caps; the over-cap gift is refused by the contract
 * 12 payouts page lists every payout; each row links to a receipt
 * 13 impact ledger: indexer + snapshot attribute each payout to its source
 */
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { forkRpc, injectForkWallet, waitMined } from "./fixtures/wallet-fork";

const ON = process.env.DONATE_STACK === "1";
const STATE_DIR = process.env.E2E_STATE || "";
const SHOTS = process.env.E2E_SHOTS || "";
const API = process.env.DONATE_API || "http://localhost:3015";
const JOBS = process.env.DONATE_JOBS || "http://127.0.0.1:3016";
const REPO = resolve(__dirname, "..", "..");
const DB = "mongodb://127.0.0.1:27017/tt_e2e_donate";
const E18 = BigInt("1000000000000000000");

interface StackState {
  rpc: string;
  chainId: number;
  usdc: string;
  split: string;
  router: string;
  spender: string;
  fromBlock: number;
  dev: Record<"owner" | "hot" | "donor" | "shelter" | "treasury" | "agent" | "payer" | "widgetDonor" | "settler", string>;
}
const S: StackState = ON ? JSON.parse(readFileSync(join(STATE_DIR, "state.json"), "utf8")) : ({} as StackState);

/** One row per flow, written to <shots>/results.json for the run report. */
const results: Array<Record<string, unknown>> = [];
const record = (flow: string, status: "pass" | "fail", extra: Record<string, unknown> = {}) =>
  results.push({ flow, status, ...extra });

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
};

const balance = async (a: string) => BigInt(await forkRpc<string>("eth_getBalance", [a, "latest"]));
const fmt = (wei: bigint) => {
  const s = wei.toString().padStart(19, "0");
  return `${s.slice(0, -18)}.${s.slice(-18).replace(/0+$/, "") || "0"}`;
};

async function job(name: "reconcile" | "indexer" | "snapshot") {
  const r = await fetch(`${JOBS}/run/${name}`, { method: "POST" });
  const body = await r.json();
  if (!r.ok) throw new Error(`${name} job: ${JSON.stringify(body)}`);
  return body;
}

const mongo = (js: string) => execFileSync("mongosh", ["--quiet", DB, "--eval", js], { encoding: "utf8" });

/** Arc testnet RPCs the page reads (rpc + the log RPC) -> the fork. Nothing else leaves the machine. */
async function routeChain(page: Page) {
  const forward = async (route: import("@playwright/test").Route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const res = await fetch(S.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() || "" });
    return route.fulfill({ status: res.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: await res.text() });
  };
  await page.route(/^https:\/\/rpc\.testnet\.arc\.io\/?.*$/, forward);
  await page.route(/^https:\/\/rpc\.blockdaemon\.testnet\.arc\.network\/?.*$/, forward);
  // The impact CDN mirror is not uploaded; fail it fast so the page reads the local backend.
  await page.route(/digitaloceanspaces\.com\/impact\//, (r) => r.abort());
}

type Scenario = "testnet" | "handed-over";
/** The public JSON lists the page reads, pointed at the fork's contracts. */
async function routeLists(page: Page, scenario: Scenario) {
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) });
  const deployment = { chainId: S.chainId, address: S.split, fromBlock: S.fromBlock, label: "Arc testnet (local fork)" };
  const router = { chainId: S.chainId, router: S.router, usdc: S.usdc, label: "Arc testnet (local fork)" };
  if (scenario === "testnet") {
    await page.route("**/shelter-payouts/routers.json", (r) => r.fulfill(json([{ ...router, network: "testnet" }])));
    await page.route("**/shelter-payouts/deployments.json", (r) => r.fulfill(json([])));
    await page.route("**/shelter-payouts/testnet-deployments.json", (r) => r.fulfill(json([{ ...deployment, network: "testnet" }])));
  } else {
    // Simulates the day after the handover on the fork: the campaign's shelter holds its own key
    // (anvil dev #4), the split pays only that wallet, and the router is listed as the live one.
    await page.route("**/shelter-payouts/campaign.json", (r) =>
      r.fulfill(
        json({
          name: "Pink Paw autumn rescue (local fork)",
          goalUsdc: "90",
          startDate: "2026-10-02",
          chainId: S.chainId,
          fromBlock: S.fromBlock,
          shelter: { name: "Pink Paw (Rožinė pėdutė)", wallet: S.dev.shelter, handover: "handed-over" },
        })
      )
    );
    await page.route("**/shelter-payouts/routers.json", (r) => r.fulfill(json([{ ...router, network: "mainnet" }])));
    await page.route("**/shelter-payouts/deployments.json", (r) => r.fulfill(json([{ ...deployment, network: "mainnet" }])));
    await page.route("**/shelter-payouts/testnet-deployments.json", (r) => r.fulfill(json([])));
  }
}

async function preparePage(page: Page, account: string, scenario: Scenario) {
  await injectForkWallet(page, account);
  await routeChain(page);
  await routeLists(page, scenario);
}

/**
 * Fork artifact: the Arc precompile stand-in (fixtures/wallet-fork.ts) credits each USDC receiver but
 * cannot debit the sender, so after a router gift the router and the split keep a phantom copy of
 * it. On Arc both end at zero (the split forwards everything in the same call). Zero them, or the
 * backend's flush keeper would push the phantom amount to the shelter as an extra payout.
 */
async function clearPhantomBalances() {
  for (const a of [S.router, S.split]) await forkRpc("anvil_setBalance", [a, "0x0"]);
}

const receiptTx = (href: string | null) => /tx=(0x[0-9a-f]{64})/.exec(href || "")?.[1] || "";

test.describe.serial("donation flows on the local stack", () => {
  test.skip(!ON, "set DONATE_STACK=1 (run through funding/framework/tracks/a-build/e2e-donate/stack.sh)");
  test.setTimeout(180_000);

  let giftTx = "";

  test.afterAll(() => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ state: S, results }, null, 2) + "\n");
  });

  test("1 payouts page: campaign awaits handover, try-it block is live", async ({ page }) => {
    await preparePage(page, S.dev.donor, "testnet");
    await page.goto("/shelter-payouts");
    const awaiting = page.getByTestId("wallet-donate-awaiting");
    await expect(awaiting).toContainText("Opens when Pink Paw holds its own key");
    await expect(awaiting.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("wallet-donate")).toHaveCount(0);
    await awaiting.scrollIntoViewIfNeeded();
    await shot(page, "01a-awaiting-handover");
    const tryIt = page.getByTestId("wallet-donate-testnet");
    await expect(tryIt.getByTestId("testnet-label")).toContainText("Test USDC, no real money");
    // The real backend says its relay serves this chain: the primary button is the one-signature gift.
    await expect(tryIt.getByTestId("wallet-give-how")).toContainText("Sign once in your wallet.");
    await tryIt.scrollIntoViewIfNeeded();
    await shot(page, "01b-try-it-live");
    record("1 payouts page gates the campaign, try-it live", "pass");
  });

  test("2 gasless gift through the backend relay", async ({ page }) => {
    await preparePage(page, S.dev.donor, "testnet");
    const shelter0 = await balance(S.dev.shelter);
    const donorNonce0 = parseInt(await forkRpc<string>("eth_getTransactionCount", [S.dev.donor, "latest"]), 16);
    await page.goto("/shelter-payouts");
    const tryIt = page.getByTestId("wallet-donate-testnet");
    await tryIt.scrollIntoViewIfNeeded();
    await tryIt.getByRole("button", { name: "0.5 USDC", exact: true }).click();
    await tryIt.getByTestId("wallet-give").click();
    await expect(tryIt.getByTestId("wallet-give-sent")).toContainText("0.5 USDC reached Pink Paw", { timeout: 60_000 });
    await shot(page, "02-gasless-sent");
    giftTx = receiptTx(await tryIt.getByTestId("wallet-give-receipt").getAttribute("href"));
    expect(giftTx).toMatch(/^0x[0-9a-f]{64}$/);
    const tx = await forkRpc<{ from: string; to: string }>("eth_getTransactionByHash", [giftTx]);
    // The relay (backend hot wallet) sent it to the router; the donor sent no transaction at all.
    expect(tx.from.toLowerCase()).toBe(S.dev.hot.toLowerCase());
    expect(tx.to.toLowerCase()).toBe(S.router.toLowerCase());
    expect(parseInt(await forkRpc<string>("eth_getTransactionCount", [S.dev.donor, "latest"]), 16)).toBe(donorNonce0);
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18 / BigInt(2));
    const relay = await (await fetch(`${API}/shelter/relay/${giftTx}`)).json();
    await clearPhantomBalances();
    record("2 gasless gift via backend relay", "pass", { tx: giftTx, shelterDelta: fmt(delta), relayStatus: relay?.status });
  });

  test("3 Token Tails match by the backend job; the receipt pairs it", async ({ page }) => {
    const shelter0 = await balance(S.dev.shelter);
    let match: { status?: string; matchTxHash?: string | null } = {};
    for (let i = 0; i < 4 && match.status !== "confirmed"; i++) {
      await job("reconcile");
      match = await (await fetch(`${API}/shelter/match/by-donor/${giftTx}`)).json();
    }
    expect(match.status).toBe("confirmed");
    const mtx = await forkRpc<{ from: string; to: string }>("eth_getTransactionByHash", [match.matchTxHash]);
    expect(mtx.from.toLowerCase()).toBe(S.dev.hot.toLowerCase());
    expect(mtx.to.toLowerCase()).toBe(S.split.toLowerCase());
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18 / BigInt(2));

    await preparePage(page, S.dev.donor, "testnet");
    await page.goto(`/shelter-payouts/receipt?chain=${S.chainId}&tx=${giftTx}`);
    await expect(page.getByTestId("receipt-gift")).toContainText("0.5 USDC");
    await expect(page.getByTestId("receipt-gift")).toContainText(/tt:wallet:[0-9a-f]{8}/);
    await expect(page.getByTestId("receipt-match")).toContainText("Token Tails matched it", { timeout: 30_000 });
    await page.getByTestId("receipt-match").scrollIntoViewIfNeeded();
    await shot(page, "03-receipt-with-match");
    record("3 backend 1:1 match + receipt pairing", "pass", { tx: match.matchTxHash, shelterDelta: fmt(delta) });
  });

  test("4 one-transaction native gift (router.donateNative)", async ({ page }) => {
    await preparePage(page, S.dev.donor, "testnet");
    const shelter0 = await balance(S.dev.shelter);
    await page.goto("/shelter-payouts");
    const tryIt = page.getByTestId("wallet-donate-testnet");
    await tryIt.scrollIntoViewIfNeeded();
    await tryIt.getByRole("button", { name: "0.1 USDC", exact: true }).click();
    await tryIt.getByTestId("wallet-give-native").click();
    await expect(tryIt.getByTestId("wallet-give-sent")).toContainText("0.1 USDC reached Pink Paw", { timeout: 60_000 });
    await shot(page, "04-native-sent");
    const tx = receiptTx(await tryIt.getByTestId("wallet-give-receipt").getAttribute("href"));
    const t = await forkRpc<{ from: string; to: string }>("eth_getTransactionByHash", [tx]);
    expect(t.from.toLowerCase()).toBe(S.dev.donor.toLowerCase());
    expect(t.to.toLowerCase()).toBe(S.router.toLowerCase());
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18 / BigInt(10));
    record("4 one-transaction native gift", "pass", { tx, shelterDelta: fmt(delta) });
  });

  test("5 shelter wallet claim on the onboarding page", async ({ page }) => {
    await preparePage(page, S.dev.shelter, "testnet");
    await page.goto("/shelter-payouts/onboard");
    await page.getByTestId("onboard-connect").click();
    await expect(page.getByTestId("onboard-wallet")).toContainText(S.dev.shelter.slice(0, 6), { ignoreCase: true });
    await page.getByTestId("onboard-sign").click();
    await expect(page.getByTestId("onboard-status")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("onboard-status").scrollIntoViewIfNeeded();
    await shot(page, "05a-claim-sent");
    // A pending claim is never shown publicly.
    const before = await (await fetch(`${API}/shelter/claim`)).json().catch(() => null);
    expect(before?.wallet ?? null).toBeNull();
    const stored = mongo(`print(db.shelterclaims.countDocuments({ chainId: ${S.chainId}, status: "pending-rotation" }))`).trim();
    expect(stored).toBe("1");
    // The manual step after confirming the address with the shelter by a separate channel.
    mongo(`db.shelterclaims.updateOne({ chainId: ${S.chainId}, status: "pending-rotation" }, { $set: { status: "rotated" } })`);
    const after = await (await fetch(`${API}/shelter/claim`)).json();
    expect(after.status).toBe("rotated");
    expect(after.wallet.toLowerCase()).toBe(S.dev.shelter.toLowerCase());
    record("5 shelter claim (signed) + manual rotate", "pass", { claim: after.status });
  });

  test("6 post-handover direct gift from the campaign block", async ({ page }) => {
    await preparePage(page, S.dev.donor, "handed-over");
    const shelter0 = await balance(S.dev.shelter);
    const treasury0 = await balance(S.dev.treasury);
    await page.goto("/shelter-payouts");
    const block = page.getByTestId("wallet-donate");
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("wallet-donate-awaiting")).toHaveCount(0);
    await block.scrollIntoViewIfNeeded();
    await shot(page, "06a-campaign-give");
    await block.getByRole("button", { name: "1 USDC", exact: true }).click();
    await block.getByTestId("wallet-give").click();
    await expect(block.getByTestId("wallet-give-sent")).toContainText("1 USDC reached Pink Paw", { timeout: 60_000 });
    await shot(page, "06b-campaign-sent");
    const tx = receiptTx(await block.getByTestId("wallet-give-receipt").getAttribute("href"));
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18);
    expect(await balance(S.dev.treasury)).toBe(treasury0);
    await clearPhantomBalances();
    record("6 post-handover campaign gift (shelter-held wallet)", "pass", { tx, shelterDelta: fmt(delta), treasuryDelta: "0" });
  });

  test("7 sponsored treat from the backend hot wallet", async () => {
    const uid = `e2e-treat-${Date.now()}`;
    const email = `${uid}@example.test`;
    const token =
      "fbe2e." +
      Buffer.from(JSON.stringify({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } })).toString("base64url");
    const h = { accesstoken: token, "content-type": "application/json" };
    const me0 = await (await fetch(`${API}/shelter/donate/me`, { headers: h })).json();
    expect(me0.eligibility.eligible).toBe(false);
    // Fixture: the account is two days old (throwaway database only).
    const old = "new Date(Date.now() - 48 * 3600e3)";
    mongo(`db.users.updateOne({ email: "${email}" }, { $set: { createdAt: ${old}, promotedAt: ${old} } })`);
    // One saved game, through the only score write path.
    const live = await fetch(`${API}/user/catbassadors/live`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ type: "CATNIP_CHAOS", points: 1, score: 0, time: 30, level: "11" }),
    });
    expect(live.status).toBe(201);
    // Settle any pending router match first, so the balance below moves by the treat alone.
    await job("reconcile");
    await job("reconcile");
    const shelter0 = await balance(S.dev.shelter);
    const res = await fetch(`${API}/shelter/donate`, { method: "POST", headers: h, body: JSON.stringify({ source: "page" }) });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    await waitMined(body.txHash);
    const delta = (await balance(S.dev.shelter)) - shelter0;
    const sent = await forkRpc<{ from: string; to: string }>("eth_getTransactionByHash", [body.txHash]);
    expect(sent.from.toLowerCase()).toBe(S.dev.hot.toLowerCase());
    expect(sent.to.toLowerCase()).toBe(S.split.toLowerCase());
    await job("reconcile");
    const me = await (await fetch(`${API}/shelter/donate/me`, { headers: h })).json();
    expect(me.confirmedCount).toBe(1);
    const again = await fetch(`${API}/shelter/donate`, { method: "POST", headers: h, body: JSON.stringify({ source: "page" }) });
    expect(again.status).toBe(429);
    expect(delta).toBe(E18 / BigInt(100));
    record("7 sponsored treat (hot wallet, once a day)", "pass", { tx: body.txHash, shelterDelta: fmt(delta), secondTreat: 429 });
  });

  test("8 x402 onchain-receipt: an agent pays the split and gets a cat card", async () => {
    const sdk = await import(pathToFileURL(join(REPO, "shelter-rail", "src", "sdk.mjs")).href);
    const shelter0 = await balance(S.dev.shelter);
    let paidTx = "";
    const out = await sdk.payAndFetch(`${API}/shelter/agent/cat-card`, {
      maxAmountWei: BigInt("10000000000000000"),
      prefer: "onchain-receipt",
      pay: async ({ to, valueWei, data }: { to: string; valueWei: bigint; data: string }) => {
        paidTx = await forkRpc<string>("eth_sendTransaction", [{ from: S.dev.payer, to, value: "0x" + BigInt(valueWei).toString(16), data }]);
        await waitMined(paidTx);
        return paidTx;
      },
    });
    expect(out.response.status).toBe(200);
    const card = await out.response.json();
    expect(card.card?.name || card.name).toContain("Mochi");
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18 / BigInt(100));
    record("8 x402 onchain-receipt (agent -> ShelterSplit)", "pass", { tx: paidTx, shelterDelta: fmt(delta) });
  });

  test("9 x402 exact: one signed transfer straight to the shelter wallet", async () => {
    const sdk = await import(pathToFileURL(join(REPO, "shelter-rail", "src", "sdk.mjs")).href);
    const shelter0 = await balance(S.dev.shelter);
    const out = await sdk.payAndFetch(`${API}/shelter/agent/cat-card`, {
      maxAmountBase: BigInt(10_000),
      account: S.dev.payer,
      chainIds: { "arc-testnet": S.chainId },
      signTypedData: async (typed: unknown) =>
        forkRpc<string>("eth_signTypedData_v4", [S.dev.payer, JSON.stringify(typed, (_k, v) => (typeof v === "bigint" ? v.toString() : v))]),
    });
    expect(out.error ?? null, String(out.error)).toBeNull();
    expect(out.response.status).toBe(200);
    expect(out.paid?.scheme).toBe("exact");
    const tx = out.paid?.txHash as string;
    const t = await forkRpc<{ to: string }>("eth_getTransactionByHash", [tx]);
    expect(t.to.toLowerCase()).toBe(S.usdc.toLowerCase());
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18 / BigInt(100));
    record("9 x402 exact (EIP-3009 -> shelter wallet)", "pass", { tx, shelterDelta: fmt(delta) });
  });

  test("10 shelter-rail widget, gasless, on a third-party page", async ({ page }) => {
    await injectForkWallet(page, S.dev.widgetDonor);
    await routeChain(page);
    // This page is served by page.route, so Chrome treats it as public and its Local Network Access
    // check blocks its direct fetches to loopback (the fork, the relay): proxy those calls instead.
    await page.route(`${S.rpc}/**`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
      }
      const res = await fetch(S.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() || "" });
      return route.fulfill({ status: res.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: await res.text() });
    });
    // Same check for the relay POST: forward it unchanged to the throwaway backend.
    await page.route(`${API}/shelter/relay`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
      }
      const res = await fetch(`${API}/shelter/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() || "" });
      return route.fulfill({ status: res.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: await res.text() });
    });
    const widget = readFileSync(join(REPO, "shelter-rail", "src", "widget.js"), "utf8");
    await page.route("**/e2e-widget/widget.js", (r) => r.fulfill({ contentType: "text/javascript", body: widget }));
    await page.route("**/e2e-widget/", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="background:#f6f1f4;padding:16px"><h1>A friendly cat blog</h1><div id="donate"></div>
<script src="/e2e-widget/widget.js" data-mode="gasless" data-chain="${S.chainId}" data-split="${S.split}"
 data-router="${S.router}" data-usdc="${S.usdc}" data-relay="${API}/shelter/relay" data-amount="250000"
 data-from-block="${S.fromBlock}" data-shelter="Pink Paw" data-testnet="true" data-theme="light" data-target="#donate"></script>
</body></html>`,
      })
    );
    const shelter0 = await balance(S.dev.shelter);
    if (process.env.E2E_DEBUG) {
      page.on("console", (m) => console.log("[page]", m.type(), m.text()));
      page.on("pageerror", (e) => console.log("[pageerror]", e.message));
      page.on("response", async (r) => r.url().includes("/shelter/relay") && console.log("[relay]", r.status(), await r.text()));
      await page.addInitScript(() => {
        const w = window as unknown as { ethereum: { request: (a: { method: string }) => Promise<unknown> } };
        const orig = w.ethereum.request;
        w.ethereum.request = async (a) => {
          try {
            return await orig(a);
          } catch (e) {
            console.log("eth error", a.method, JSON.stringify(a), String(e));
            throw e;
          }
        };
      });
    }
    await page.goto("/e2e-widget/");
    const btn = page.locator("#donate button");
    await expect(btn).toBeEnabled({ timeout: 30_000 });
    await expect(btn).toContainText("Give 0.25 USDC to Pink Paw");
    await shot(page, "10a-widget");
    await btn.click();
    await expect(page.locator("#donate .msg")).toContainText(/thank/i, { timeout: 60_000 });
    await shot(page, "10b-widget-sent");
    const delta = (await balance(S.dev.shelter)) - shelter0;
    expect(delta).toBe(E18 / BigInt(4));
    await clearPhantomBalances();
    record("10 shelter-rail widget gasless (third-party page)", "pass", { shelterDelta: fmt(delta) });
  });

  test("11 treat agent: CappedSpender gives within caps, over-cap refused", async () => {
    const dir = join(REPO, "funding", "framework", "tracks", "a-build", "treat-agent");
    const env = {
      ...process.env,
      TREAT_AGENT_FAKE_LLM: "1",
      TREAT_AGENT_LOG_DIR: join(STATE_DIR, "treat-agent"),
      TREAT_AGENT_TT_SENDERS: S.dev.hot,
      FOUNDRY_DISABLE_NIGHTLY_WARNING: "1",
    };
    delete (env as Record<string, string | undefined>).ANTHROPIC_API_KEY;
    const shelter0 = await balance(S.dev.shelter);
    const once = execFileSync("node", ["run.mjs", "--rpc", S.rpc, "--spender", S.spender, "--fork", "--once"], { cwd: dir, env, encoding: "utf8" });
    const mid = await balance(S.dev.shelter);
    let over = "";
    try {
      over = execFileSync("node", ["run.mjs", "--rpc", S.rpc, "--spender", S.spender, "--fork", "--demo-overcap"], { cwd: dir, env, encoding: "utf8" });
    } catch (e) {
      over = String((e as { stdout?: string }).stdout || e);
    }
    const after = await balance(S.dev.shelter);
    expect(over).toMatch(/OverTxCap|OverDailyCap|REFUSED/);
    expect(after).toBe(mid);
    const gave = mid - shelter0;
    expect(gave <= BigInt("50000000000000000")).toBe(true);
    record("11 treat agent within caps; over-cap refused on-chain", "pass", {
      shelterDelta: fmt(gave),
      decision: once.split("\n").find((l) => /fork tx|hold|give/i.test(l)) || once.trim().split("\n")[0],
    });
  });

  test("12 payouts page lists every payout with a receipt", async ({ page }) => {
    await preparePage(page, S.dev.donor, "testnet");
    await page.goto("/shelter-payouts");
    const proof = page.getByTestId("testnet-proof");
    await proof.scrollIntoViewIfNeeded();
    const feed = page.getByTestId("testnet-feed");
    await expect(feed).toBeVisible({ timeout: 60_000 });
    await feed.locator("summary").click();
    const rows = feed.locator("li");
    const n = await rows.count();
    // 2 gift + 3 match + 4 native (+ its match) + 6 campaign gift (+ match) + 7 treat + 8 x402 + 10 widget (+ match) + 11 agent;
    // 9 (exact) pays the shelter wallet directly, so it is not a ShelterSplit payout.
    expect(n).toBeGreaterThanOrEqual(8);
    await shot(page, "12a-testnet-proof");
    await rows.first().scrollIntoViewIfNeeded();
    await shot(page, "12b-payout-feed");
    record("12 payouts page reads every payout from the chain", "pass", { rows: n });
  });

  test("13 impact ledger attributes every payout", async ({ page }) => {
    // Twice: the first run sends the last pending match, the second settles it.
    await job("reconcile");
    await job("reconcile");
    await job("indexer");
    await job("snapshot");
    const impact = await (await fetch(`${API}/impact`)).json();
    writeFileSync(join(SHOTS || STATE_DIR, "impact.json"), JSON.stringify(impact, null, 2) + "\n");
    const by = (impact?.money?.byBucket || {}) as Record<string, Record<string, string>>;
    const usdc = (b: string) => BigInt(by[b]?.USDC || "0");
    // wallet = gifts 2 + 4 + 6 + 10 (0.5 + 0.1 + 1 + 0.25), match = their 1:1 matches within the daily cap,
    // page = the treat, x402 = the onchain-receipt and exact payments, direct = everything untraced (agent).
    expect(usdc("wallet")).toBeGreaterThanOrEqual(BigInt("1850000000000000000"));
    expect(usdc("match") > BigInt(0)).toBe(true);
    expect(usdc("page") > BigInt(0)).toBe(true);
    expect(usdc("x402")).toBeGreaterThanOrEqual(BigInt("20000000000000000"));
    await preparePage(page, S.dev.donor, "testnet");
    await page.goto("/impact");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await shot(page, "13-impact");
    record("13 impact ledger (indexer + snapshot)", "pass", {
      byBucket: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, fmt(BigInt(v.USDC || "0"))])),
      events: impact?.money?.eventCount ?? null,
    });
  });
});
