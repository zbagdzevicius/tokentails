// copy-lint: web-only used only by WalletDonate, ShelterPayouts, ShelterReceipt and the onboarding page (web builds)
// Which wallet-giving block the payouts page shows, as a pure function so the custody rules are
// unit-tested (__test__/shelter-give-mode.test.ts).
//
// - "mainnet": real money. Only when NEXT_PUBLIC_WALLET_DONATE is "true", the campaign's shelter has
//   handed over (it holds its own key), and at least one mainnet chain has a wallet path: by default a
//   DonateRouter listed for the campaign chain; NEXT_PUBLIC_WALLET_DONATE_CHAINS names more chains
//   (giveRails.campaignRails).
// - "awaiting-handover": the campaign's wallet is still held by Token Tails. No button: a public gift
//   must never land in a wallet Token Tails controls. Links to the onboarding page instead.
// - "testnet": the separate "try it live" block for NEXT_PUBLIC_WALLET_DONATE_CHAIN (test coins, no
//   real money), when that testnet has a wallet path (a router, or a listed ShelterSplit). The giver
//   can switch to any of the six testnets (giveRails.walletRails).
// - "hidden": nothing to show.
import type { Campaign } from "./campaign";
import { GiveRail, TEMPO_CHAIN_IDS, campaignRails, walletRails } from "./giveRails";
import type { MatchStatus } from "./relayApi";
import type { RouterEntry } from "./routers";
import type { ShelterDeployment } from "./rpc";

export type GiveMode = "mainnet" | "testnet" | "awaiting-handover" | "hidden";
export type GiveSlot = "campaign" | "try-it";

export interface GiveEnv {
  /** NEXT_PUBLIC_WALLET_DONATE */
  walletDonate?: string;
  /** NEXT_PUBLIC_WALLET_DONATE_CHAIN */
  tryChain?: string;
  /** NEXT_PUBLIC_WALLET_DONATE_CHAINS: the mainnet chain ids the campaign slot offers (unset: the campaign chain). */
  chains?: string;
}

export const readGiveEnv = (): GiveEnv => ({
  walletDonate: process.env.NEXT_PUBLIC_WALLET_DONATE,
  tryChain: process.env.NEXT_PUBLIC_WALLET_DONATE_CHAIN,
  chains: process.env.NEXT_PUBLIC_WALLET_DONATE_CHAINS,
});

/** The try-it chain id, or null when unset or not a positive integer. */
export function tryChainId(env: GiveEnv): number | null {
  const n = Number(env.tryChain);
  return env.tryChain && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Chains where no wallet path works at all. Empty since the approve + ShelterSplit.disburse path
 * (giveRails "split") covers the tokens without EIP-3009: Tempo's TIP-20 pathUSD and USDC.e (with
 * disburseWithMemo) and Robinhood's USDG and test mUSDC. A router is still never used on Tempo
 * (giveRails.railFor), and wallet.assertEip3009 still probes a router's token before anyone signs.
 */
export const NO_WALLET_PATH = new Set<number>();
export const hasWalletPath = (chainId: number) => !NO_WALLET_PATH.has(chainId);

/**
 * The mode of one slot. The campaign slot is "mainnet", "awaiting-handover" or "hidden"; the try-it
 * slot is "testnet" or "hidden". `deployments` lists the ShelterSplits (mainnet and testnet entries):
 * a chain without a router gives straight into its split.
 */
export function walletGiveMode(
  campaign: Campaign | null,
  deployments: ShelterDeployment[],
  routers: RouterEntry[],
  env: GiveEnv,
  slot: GiveSlot = "campaign"
): GiveMode {
  if (slot === "try-it") {
    const id = tryChainId(env);
    if (id === null) return "hidden";
    // Only a testnet rail powers the try-it block, even if the env names a mainnet chain by mistake.
    return tryItRails(routers, deployments, env).some((r) => r.chainId === id) ? "testnet" : "hidden";
  }
  if (!campaign || !campaign.shelter.wallet) return "hidden";
  if (campaign.shelter.handover !== "handed-over") return "awaiting-handover";
  if (env.walletDonate !== "true") return "hidden";
  return campaignRails(campaign.chainId, routers, deployments, env.chains).some((r) => hasWalletPath(r.chainId))
    ? "mainnet"
    : "hidden";
}

/** Preset amounts: whole USDC on mainnet, tenths on the testnet (faucet amounts are small). */
export const giveAmounts = (mode: GiveMode) => (mode === "testnet" ? ["0.1", "0.5", "1"] : ["1", "5", "10"]);

/** Circle's public faucet hands out test USDC on Arc and the other testnets. */
export const FAUCET_URL = "https://faucet.circle.com";

/** Testnets Circle's faucet serves (USDC and EURC): Arc, Base Sepolia, Arbitrum Sepolia, Avalanche Fuji. */
export const CIRCLE_FAUCET_CHAINS = new Set([5042002, 84532, 421614, 43113]);
export const faucetFor = (chainId: number) => (CIRCLE_FAUCET_CHAINS.has(chainId) ? FAUCET_URL : null);

/**
 * The testnet routers the try-it block can switch between: every listed testnet router on a chain with
 * a wallet path, the NEXT_PUBLIC_WALLET_DONATE_CHAIN one first. Empty while the block is hidden.
 */
export function tryItRouters(routers: RouterEntry[], env: GiveEnv): RouterEntry[] {
  const first = tryChainId(env);
  if (first === null) return [];
  // Tempo's TIP-20 tokens have no EIP-3009, so a router there never carries a gift (giveRails.railFor).
  const list = routers.filter((r) => r.network === "testnet" && hasWalletPath(r.chainId) && !TEMPO_CHAIN_IDS.has(r.chainId));
  if (!list.some((r) => r.chainId === first)) return [];
  return [...list.filter((r) => r.chainId === first), ...list.filter((r) => r.chainId !== first)];
}

/**
 * The testnets the try-it block can switch between: every one of the six with a wallet path (a router,
 * or a listed ShelterSplit), in picker order. Empty while the block is hidden (no try chain set).
 */
export function tryItRails(routers: RouterEntry[], deployments: ShelterDeployment[], env: GiveEnv): GiveRail[] {
  if (tryChainId(env) === null) return [];
  // With each chain's extra-coin routers (EURC on Arc and Fuji) as their own picker options.
  return walletRails("testnet", routers, deployments, true).filter((r) => hasWalletPath(r.chainId));
}

/** The real-money chains of the campaign slot, once walletGiveMode says "mainnet". */
export function mainnetRails(campaign: Campaign | null, routers: RouterEntry[], deployments: ShelterDeployment[], env: GiveEnv): GiveRail[] {
  if (!campaign) return [];
  return campaignRails(campaign.chainId, routers, deployments, env.chains).filter((r) => hasWalletPath(r.chainId));
}

export const ONBOARD_URL = "/shelter-payouts/onboard";

/** "Pink Paw (Rožinė pėdutė)" -> "Pink Paw": buttons stay short. */
export const shortShelterName = (name: string) => name.replace(/\s*\(.*\)\s*$/, "").trim() || name;

/**
 * Wallets Token Tails holds for a shelter (Pink Paw's payout wallet until the handover). A real-money
 * gift is refused while the split would pay any of them, whatever campaign.json says (wallet.CustodyGuard).
 */
export const TOKEN_TAILS_HELD_WALLETS: readonly string[] = ["0xe299299b846ba629f5a591dbf4f562bcc07a0f37"];

/** The gift token's symbol: the router entry's own (EURC), else the chain's payout token. */
export const giftSymbol = (chain: { symbol?: string } | null, router: { symbol?: string } | null) =>
  router?.symbol || chain?.symbol || "USDC";

/**
 * Who the button names: the shelter when the split pays exactly one wallet, "N shelters" when it pays
 * several, and nobody while the list is unknown (the page never names a receiver it has not read).
 */
export function payeeLabel(payees: number | null, shelter: string): string | null {
  if (payees === 1) return shelter;
  if (payees !== null && payees > 1) return `${payees} shelters`;
  return null;
}

/**
 * "Token Tails matches gifts up to X; Y left today": only while the match is live and the match_cap
 * fact is published (the claim is never hardcoded). The caller shows it only next to `status.chainId`.
 */
export function matchMeterCopy(status: MatchStatus | null, capFact: string | null): string | null {
  if (!status || status.state !== "live" || !capFact) return null;
  return `Token Tails matches gifts up to ${status.perGift} USDC each; ${status.dailyLeft} USDC left today.`;
}
