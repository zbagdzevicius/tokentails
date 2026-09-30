// Public, keyless RPCs and explorers for the chains ShelterSplit targets.
// Chain IDs, explorers and token decimals mirror
// funding/framework/tracks/a-build/chains.json. A deployment entry can override
// any of these with its own rpc, explorer, decimals or symbol fields.

export interface ChainInfo {
  name: string;
  rpc: string;
  explorer: string;
  decimals: number;
  symbol: string;
  // The chain's native coin, which ShelterSplit's donate()/receive() split and
  // report as NativeDisbursed. On Arc the native coin is USDC with 18 decimals,
  // while the ERC-20 view of the same balance has 6.
  nativeDecimals?: number;
  nativeSymbol?: string;
}

export const SHELTER_CHAINS: Record<number, ChainInfo> = {
  5042: { name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "USDC" },
  5042002: { name: "Arc Testnet", rpc: "https://rpc.testnet.arc.io", explorer: "https://explorer.testnet.arc.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "USDC" },
  8453: { name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  84532: { name: "Base Sepolia", rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  42161: { name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  421614: { name: "Arbitrum Sepolia", rpc: "https://sepolia-rollup.arbitrum.io/rpc", explorer: "https://sepolia.arbiscan.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  43114: { name: "Avalanche C-Chain", rpc: "https://api.avax.network/ext/bc/C/rpc", explorer: "https://subnets.avax.network/c-chain", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "AVAX" },
  43113: { name: "Avalanche Fuji", rpc: "https://api.avax-test.network/ext/bc/C/rpc", explorer: "https://subnets-test.avax.network/c-chain", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "AVAX" },
  4217: { name: "Tempo", rpc: "https://rpc.tempo.xyz", explorer: "https://explore.tempo.xyz", decimals: 6, symbol: "USDC.e" },
  42431: { name: "Tempo Testnet", rpc: "https://rpc.moderato.tempo.xyz", explorer: "https://explore.testnet.tempo.xyz", decimals: 6, symbol: "pathUSD" },
  31612: { name: "Mezo", rpc: "https://mezo.drpc.org", explorer: "https://explorer.mezo.org", decimals: 18, symbol: "MUSD", nativeDecimals: 18, nativeSymbol: "BTC" },
  31611: { name: "Mezo Testnet", rpc: "https://rpc.test.mezo.org", explorer: "https://explorer.test.mezo.org", decimals: 18, symbol: "MUSD", nativeDecimals: 18, nativeSymbol: "BTC" },
};

export const explorerAddress = (explorer: string, address: string) =>
  `${explorer}/address/${address}`;

export const explorerTx = (explorer: string, tx: string) =>
  `${explorer}/tx/${tx}`;
