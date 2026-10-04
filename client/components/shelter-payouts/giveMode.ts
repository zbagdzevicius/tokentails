// copy-lint: web-only used only by WalletDonate, ShelterPayouts, ShelterReceipt and the onboarding page (web builds)
// Which wallet-giving block the payouts page shows, as a pure function so the custody rules are
// unit-tested (__test__/shelter-give-mode.test.ts).
//
// - "mainnet": real money. Only when NEXT_PUBLIC_WALLET_DONATE is "true", the campaign's shelter has
//   handed over (it holds its own key), and a DonateRouter is listed for the campaign chain.
// - "awaiting-handover": the campaign's wallet is still held by Token Tails. No button: a public gift
//   must never land in a wallet Token Tails controls. Links to the onboarding page instead.
// - "testnet": the separate "try it live" block for NEXT_PUBLIC_WALLET_DONATE_CHAIN (test USDC, no
//   real money), when a testnet router is listed for that chain.
// - "hidden": nothing to show.
import type { Campaign } from "./campaign";
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
}

export const readGiveEnv = (): GiveEnv => ({
  walletDonate: process.env.NEXT_PUBLIC_WALLET_DONATE,
  tryChain: process.env.NEXT_PUBLIC_WALLET_DONATE_CHAIN,
});

/** The try-it chain id, or null when unset or not a positive integer. */
export function tryChainId(env: GiveEnv): number | null {
  const n = Number(env.tryChain);
  return env.tryChain && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The mode of one slot. The campaign slot is "mainnet", "awaiting-handover" or "hidden"; the try-it
 * slot is "testnet" or "hidden". `deployments` is accepted for the shared signature: a router is the
 * only contract the button needs (it knows its ShelterSplit).
 */
/**
 * Chains where no wallet path works yet, so no button is ever shown there even if a router is listed:
 * Tempo's TIP-20 tokens (pathUSD, USDC.e) have no EIP-3009 and Tempo has no native coin; Robinhood
 * testnet's mUSDC has no EIP-3009 and its native coin is ETH. (wallet.assertEip3009 also probes the
 * token before anyone signs.)
 */
export const NO_WALLET_PATH = new Set([4217, 42431, 46630]);
export const hasWalletPath = (chainId: number) => !NO_WALLET_PATH.has(chainId);

export function walletGiveMode(
  campaign: Campaign | null,
  _deployments: ShelterDeployment[],
  routers: RouterEntry[],
  env: GiveEnv,
  slot: GiveSlot = "campaign"
): GiveMode {
  if (slot === "try-it") {
    const id = tryChainId(env);
    if (id === null) return "hidden";
    const r = routers.find((x) => x.chainId === id);
    // A mainnet router never powers the try-it block, even if the env names its chain by mistake.
    return r && r.network === "testnet" && hasWalletPath(id) ? "testnet" : "hidden";
  }
  if (!campaign || !campaign.shelter.wallet) return "hidden";
  if (campaign.shelter.handover !== "handed-over") return "awaiting-handover";
  const r = routers.find((x) => x.chainId === campaign.chainId);
  if (env.walletDonate === "true" && r && r.network === "mainnet" && hasWalletPath(r.chainId)) return "mainnet";
  return "hidden";
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
  const list = routers.filter((r) => r.network === "testnet" && hasWalletPath(r.chainId));
  if (!list.some((r) => r.chainId === first)) return [];
  return [...list.filter((r) => r.chainId === first), ...list.filter((r) => r.chainId !== first)];
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
