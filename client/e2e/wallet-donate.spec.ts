// copy-lint: web-only E2E of the web wallet-giving flow (never part of an app build)
/**
 * Give to Pink Paw from your own wallet, end to end on a local Arc testnet fork (feature F3).
 *
 * Skipped unless FORK_E2E=1. Needs anvil and forge on PATH, and a client dev server built with
 * NEXT_PUBLIC_WALLET_DONATE_CHAIN=5042002 at E2E_BASE_URL (default :3001):
 *
 *   NEXT_PUBLIC_WALLET_DONATE_CHAIN=5042002 nohup ./node_modules/.bin/next dev -p 3001 &
 *   FORK_E2E=1 E2E_CHROMIUM_PATH=... ./node_modules/.bin/playwright test e2e/wallet-donate.spec.ts --project=mobile-390
 *
 * What it proves:
 * - the real campaign (Pink Paw, wallet still held by Token Tails) shows "Opens when Pink Paw holds
 *   its own key" and no give button;
 * - the testnet "Try it live" block takes one EIP-712 signature from the donor, the relay (mocked
 *   here by anvil dev account #1 when the backend is not running) submits it, and the USDC goes donor
 *   -> DonateRouter -> ShelterSplit -> Pink Paw's test wallet in that one transaction;
 * - the receipt decodes the router gift and pairs the Token Tails match.
 *
 * FORK_SHOTS=<dir> saves screenshots for the demo video.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeDonateCalldata } from "../components/shelter-payouts/calldata";
import {
  ARC_TESTNET_ID,
  ARC_TESTNET_SPLIT,
  ARC_USDC,
  DEV,
  PINK_PAW_TEST_WALLET,
  blockNumber,
  clearDonorCode,
  deployRouter,
  ensureFork,
  forkRpc,
  injectForkWallet,
  mockRelayOnFork,
  nativeBalance,
  routeArcRpcToFork,
  stubArcPrecompiles,
  waitMined,
} from "./fixtures/wallet-fork";

const SHOTS = process.env.FORK_SHOTS || "";
const shot = async (page: import("@playwright/test").Page, name: string, project: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${project}-${name}.png`), fullPage: false });
};

test.describe("wallet giving on an Arc testnet fork", () => {
  test.skip(process.env.FORK_E2E !== "1", "set FORK_E2E=1 (needs anvil, forge and a dev server with NEXT_PUBLIC_WALLET_DONATE_CHAIN)");

  let router = "";
  let fromBlock = 0;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await ensureFork();
    router = deployRouter();
    await clearDonorCode();
    await stubArcPrecompiles();
    fromBlock = await blockNumber();
  });

  test("a donor gives 0.5 test USDC with one signature; the receipt pairs the match", async ({ page }, info) => {
    test.setTimeout(150_000);
    const project = info.project.name;
    let relayTx = "";
    let matchTx = "";

    await injectForkWallet(page, DEV.donor);
    await routeArcRpcToFork(page);
    await mockRelayOnFork(page, router, (tx) => (relayTx = tx));
    await page.route("**/shelter-payouts/routers.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ chainId: ARC_TESTNET_ID, router, usdc: ARC_USDC, network: "testnet", label: "Arc testnet (fork)" }]),
      })
    );
    await page.route("**/shelter-payouts/deployments.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ chainId: ARC_TESTNET_ID, address: ARC_TESTNET_SPLIT, network: "testnet", fromBlock }]),
      })
    );
    // The backend serves the try-it testnet (SHELTER_TRY_CHAIN_ID): its relay pays the fee there and its
    // match runs there. A status for any other chain reads as off.
    await page.route("**/shelter/match/status**", (route) => {
      const asked = Number(new URL(route.request().url()).searchParams.get("chainId") || 5042);
      const body =
        asked === ARC_TESTNET_ID
          ? { state: "live", chainId: ARC_TESTNET_ID, relay: true, perGift: "5", dailyLeft: "45", poolLeft: "200" }
          : { state: "off", chainId: asked, relay: false, perGift: "0", dailyLeft: "0", poolLeft: "0" };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    // The match itself: Token Tails' own money (dev account #0 stands in for its hot wallet) paid
    // straight into ShelterSplit with memo tt:match:<donor tx hex 2..10>, once the gift is mined.
    await page.route("**/shelter/match/by-donor/**", async (route) => {
      if (!matchTx && relayTx) {
        matchTx = await forkRpc<string>("eth_sendTransaction", [
          {
            from: DEV.deployer,
            to: ARC_TESTNET_SPLIT,
            value: "0x" + BigInt("500000000000000000").toString(16),
            data: encodeDonateCalldata(`tt:match:${relayTx.slice(2, 10)}`),
          },
        ]);
        await waitMined(matchTx);
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(matchTx ? { status: "confirmed", matchTxHash: matchTx } : { status: "none", matchTxHash: null }),
      });
    });

    const before = await nativeBalance(PINK_PAW_TEST_WALLET);
    await page.goto("/shelter-payouts");

    // The real campaign: Pink Paw's wallet is still held by Token Tails, so no public button.
    const awaiting = page.getByTestId("wallet-donate-awaiting");
    await expect(awaiting).toContainText("Opens when Pink Paw holds its own key");
    await expect(awaiting.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("wallet-donate")).toHaveCount(0);

    // The testnet try-it block.
    const tryIt = page.getByTestId("wallet-donate-testnet");
    await expect(tryIt.getByTestId("testnet-badge")).toBeVisible();
    await expect(tryIt.getByTestId("testnet-label")).toContainText("Test USDC, no real money");
    await tryIt.scrollIntoViewIfNeeded();
    await shot(page, "1-try-it", project);

    await tryIt.getByRole("button", { name: "0.5 USDC", exact: true }).click();
    await tryIt.getByTestId("wallet-give").click();
    await expect(tryIt.getByTestId("wallet-give-sent")).toBeVisible({ timeout: 60_000 });
    await expect(tryIt.getByTestId("wallet-give-sent")).toContainText("0.5 USDC reached Pink Paw");
    // One gift per tap: the button stays off until the donor asks to give again.
    await expect(tryIt.getByTestId("wallet-give")).toBeDisabled();
    await shot(page, "2-sent", project);
    expect(relayTx).toMatch(/^0x[0-9a-f]{64}$/);

    // donor -> router -> ShelterSplit -> Pink Paw in one transaction: the shelter's balance rose by
    // exactly the gift (USDC is the native coin on Arc, 18 decimals in eth_getBalance).
    const after = await nativeBalance(PINK_PAW_TEST_WALLET);
    expect(after - before).toBe(BigInt("500000000000000000"));

    await tryIt.getByTestId("wallet-give-receipt").click();
    await expect(page).toHaveURL(new RegExp(`/shelter-payouts/receipt\\?chain=${ARC_TESTNET_ID}&tx=${relayTx}`));
    const gift = page.getByTestId("receipt-gift");
    await expect(gift).toContainText("0.5 USDC");
    await expect(gift).toContainText(/tt:wallet:[0-9a-f]{8}/);
    await expect(page.getByTestId("receipt-match")).toContainText("Token Tails matched it", { timeout: 30_000 });
    await shot(page, "3-receipt", project);
    const afterMatch = await nativeBalance(PINK_PAW_TEST_WALLET);
    expect(afterMatch - before).toBe(BigInt("1000000000000000000"));
  });
});
