import type { CryptoPayToken } from "@/models/crypto-pay";

/** Brand marks for the crypto checkout, served from public/crypto-icons (no runtime CDN). */
const BASE = "/crypto-icons";

/** Mainnet chain id → icon. Testnets map to their mainnet's icon via TESTNET_OF. */
const CHAIN_ICONS: Record<number, string> = {
  5042: `${BASE}/arc.svg`,
  8453: `${BASE}/base.svg`,
  42161: `${BASE}/arbitrum.svg`,
  43114: `${BASE}/avalanche.svg`,
  4217: `${BASE}/tempo.svg`,
};

/** Testnet chain id → its mainnet chain id. */
export const TESTNET_OF: Record<number, number> = {
  5042002: 5042, // Arc testnet
  84532: 8453, // Base Sepolia
  421614: 42161, // Arbitrum Sepolia
  43113: 43114, // Avalanche Fuji
  42431: 4217, // Tempo testnet
};

const TOKEN_ICONS: Record<string, string> = {
  USDC: `${BASE}/usdc.svg`,
  "USDC.E": `${BASE}/usdc.svg`,
  EURC: `${BASE}/eurc.svg`,
  PATHUSD: `${BASE}/pathusd.svg`,
};

export const FALLBACK_CHAIN_ICON = `${BASE}/network.svg`;
export const FALLBACK_TOKEN_ICON = `${BASE}/coin.svg`;

export const isTestnetChain = (chainId: number) => chainId in TESTNET_OF;

export function chainIcon(chainId: number): string {
  return CHAIN_ICONS[chainId] ?? CHAIN_ICONS[TESTNET_OF[chainId]] ?? FALLBACK_CHAIN_ICON;
}

/** Looks up by token id or display symbol ("USDC.e", "pathUSD"), case-insensitive. */
export function tokenIcon(token: CryptoPayToken | string): string {
  return TOKEN_ICONS[String(token).toUpperCase()] ?? FALLBACK_TOKEN_ICON;
}
