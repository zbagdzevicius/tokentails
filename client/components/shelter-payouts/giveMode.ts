// copy-lint: web-only used only by WalletDonate, ShelterPayouts, ShelterReceipt and the onboarding page (web builds)
// Which wallet-giving block the payouts page shows, as a pure function so the custody rules are
// unit-tested (__test__/shelter-give-mode.test.ts).
//
// - "mainnet": real money. On by default: NEXT_PUBLIC_WALLET_DONATE only turns it off (`0`, `false`, `no`
//   or `off`). Shown when campaign.json says the campaign pays Pink Paw's wallet ("handed-over") and at
//   least one mainnet chain has a wallet path: by default a
//   DonateRouter listed for the campaign chain; NEXT_PUBLIC_WALLET_DONATE_CHAINS names more chains
//   (giveRails.campaignRails).
// - "awaiting-handover": the campaign's wallet is a Token Tails held wallet (the state before 2026-10-16).
//   No button: a public gift must never land in a wallet Token Tails holds. Links to the onboarding page.
// - "testnet": the separate "try it live" block for NEXT_PUBLIC_WALLET_DONATE_CHAIN (test coins, no
//   real money), when that testnet has a wallet path (a router, or a listed ShelterSplit). The giver
//   can switch to any of the seven testnets (giveRails.walletRails).
// - "hidden": nothing to show.
import { flagNotOff } from "@/lib/flags";
import type { Campaign } from "./campaign";
import { GiveRail, TEMPO_CHAIN_IDS, campaignRails, walletRails } from "./giveRails";
import type { MatchStatus } from "./relayApi";
import type { RouterEntry } from "./routers";
import type { ShelterDeployment } from "./rpc";

export type GiveMode = "mainnet" | "testnet" | "awaiting-handover" | "hidden";
export type GiveSlot = "campaign" | "try-it";

export interface GiveEnv {
  /** NEXT_PUBLIC_WALLET_DONATE: on unless `0`, `false`, `no` or `off`. */
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
  if (!flagNotOff(env.walletDonate)) return "hidden";
  return campaignRails(campaign.chainId, routers, deployments, env.chains).some((r) => hasWalletPath(r.chainId))
    ? "mainnet"
    : "hidden";
}

/** Preset amounts: whole USDC on mainnet, tenths on the testnet (faucet amounts are small). */
export const giveAmounts = (mode: GiveMode) => (mode === "testnet" ? ["0.1", "0.5", "1"] : ["1", "5", "10"]);

/** The smallest and largest amount the custom field takes (a typo guard, not a rule of the contracts). */
export const CUSTOM_MIN = "0.01";
export const CUSTOM_MAX = 10_000;

/** Above this, the Token Tails relay refuses a gift (backend DEFAULT_RELAY_MAX, SHELTER_RELAY_MAX_USDC). */
export const RELAY_MAX = "100";

/**
 * The giver's typed amount: "2,5" and " 2.50 " both become "2.5". An error says why it cannot be
 * sent (empty, not a number, a thousands separator, more than 6 decimals, under 0.01, over 10,000),
 * naming the coin. "1,000" and "1,000.50" are refused, never read as 1: a comma is a decimal mark only
 * when it is the one separator and is not followed by exactly three digits.
 */
// claim: fiction input validation for the giver's own amount, not an impact figure
export function parseCustomAmount(raw: string, symbol = "USDC"): { amount: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: `Type an amount in ${symbol}.` };
  if (/,/.test(trimmed) && (/\./.test(trimmed) || /,.*,/.test(trimmed) || /^\d+,\d{3}$/.test(trimmed))) {
    return { error: "No thousands separators: type 1000 or 2.5." };
  }
  const t = trimmed.replace(",", ".");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return { error: "Use digits only, like 2.5." };
  if ((m[2] || "").length > 6) return { error: "Use at most 6 decimals." };
  const whole = (m[1] || "0").replace(/^0+(?=\d)/, "");
  const frac = (m[2] || "").replace(/0+$/, "");
  const amount = frac ? `${whole}.${frac}` : whole;
  const micros = BigInt(whole) * BigInt(1_000_000) + BigInt(frac.padEnd(6, "0") || "0");
  if (micros < BigInt(10_000)) return { error: `The smallest gift is ${CUSTOM_MIN} ${symbol}.` };
  if (micros > BigInt(CUSTOM_MAX) * BigInt(1_000_000)) {
    return { error: `Up to ${CUSTOM_MAX.toLocaleString("en-US")} ${symbol} per gift from this page.` };
  }
  return { amount };
}

/** Circle's public faucet hands out test USDC on Arc and the other testnets. */
export const FAUCET_URL = "https://faucet.circle.com";

/** Testnets Circle's faucet serves: Arc, Base Sepolia, Arbitrum Sepolia, Avalanche Fuji (USDC and EURC), Monad testnet (USDC). */
export const CIRCLE_FAUCET_CHAINS = new Set([5042002, 84532, 421614, 43113, 10143]);
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
 * The testnets the try-it block can switch between: every one of the seven with a wallet path (a router,
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
 * Wallets Token Tails holds (0xE299 was Pink Paw's payout wallet until 2026-10-16). A real-money
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
