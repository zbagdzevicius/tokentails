// copy-lint: web-only chain names render only inside !isApp branches (impact explorer links, web ShelterPayouts)
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
  // Chains with no native coin (Tempo): the contract balance is read from this TIP-20 token instead,
  // because eth_getBalance there returns a placeholder value.
  balanceToken?: string;
  /** A test network: no real money. Receipts, cards and share cards say so. */
  testnet?: boolean;
  /**
   * The widest eth_getLogs range the public RPC accepts, when it is known to be small (Base caps
   * mainnet.base.org at 2,000 blocks). The log scan starts with windows of this size.
   */
  maxLogRange?: number;
  /**
   * A separate keyless RPC for the eth_getLogs scan only, when the default one accepts just small
   * ranges and rate-limits the many windows that needs. Balances, receipts and wallets keep `rpc`.
   */
  logRpc?: string;
}

/** What each chain is used for, one line per chain family (the payouts page shows it per card). */
export const CHAIN_ROLES: Record<string, string> = {
  arc: "Circle's chain: gas is paid in USDC itself. Pink Paw's campaign runs here.",
  tempo: "A payments chain with no gas coin: network fees are paid in a stablecoin.",
  arbitrum: "Ethereum rollup with low fees. Native ETH gifts are split too.",
  avalanche: "Avalanche C-Chain. Native AVAX gifts are split too.",
  base: "Coinbase's Ethereum rollup. Native ETH gifts are split too.",
  robinhood: "Pays USDG on mainnet. The testnet has no stablecoin, so it uses a test coin (mUSDC).",
};

const ROLE_BY_CHAIN_ID: Record<number, string> = {
  5042: "arc", 5042002: "arc", 4217: "tempo", 42431: "tempo", 42161: "arbitrum", 421614: "arbitrum",
  43114: "avalanche", 43113: "avalanche", 8453: "base", 84532: "base", 4663: "robinhood", 46630: "robinhood",
};

/** The role line for a chain id, or null for chains without one. */
export const chainRole = (chainId: number): string | null => CHAIN_ROLES[ROLE_BY_CHAIN_ID[chainId]] || null;

/** "Avalanche Fuji" -> "Avalanche Fuji testnet"; names that already say testnet stay as they are. */
export const chainDisplayName = (chain: Pick<ChainInfo, "name" | "testnet">): string =>
  chain.testnet && !/testnet/i.test(chain.name) ? `${chain.name} testnet` : chain.name;

// Arc Testnet: rpc.testnet.arc.io refuses eth_getLogs over ~10,000 blocks and Arc makes blocks fast
// (~160,000 a day), so the scan needed dozens of windows per contract and hit HTTP 429. The
// Blockdaemon endpoint listed by Arc takes 100,000-block windows (checked 2026-10-04).
// Base Sepolia: sepolia.base.org caps eth_getLogs at 1,000 blocks, so the page reads the keyless
// publicnode endpoint, which serves the whole range since the deploy in one call (checked 2026-10-04).
export const SHELTER_CHAINS: Record<number, ChainInfo> = {
  5042: { name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "USDC" },
  5042002: { name: "Arc Testnet", testnet: true, rpc: "https://rpc.testnet.arc.io", logRpc: "https://rpc.blockdaemon.testnet.arc.network", maxLogRange: 100_000, explorer: "https://explorer.testnet.arc.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "USDC" },
  8453: { name: "Base", rpc: "https://mainnet.base.org", maxLogRange: 2_000, explorer: "https://basescan.org", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  84532: { name: "Base Sepolia", testnet: true, rpc: "https://base-sepolia-rpc.publicnode.com", explorer: "https://sepolia.basescan.org", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  42161: { name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  421614: { name: "Arbitrum Sepolia", testnet: true, rpc: "https://sepolia-rollup.arbitrum.io/rpc", explorer: "https://sepolia.arbiscan.io", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  43114: { name: "Avalanche C-Chain", rpc: "https://api.avax.network/ext/bc/C/rpc", explorer: "https://subnets.avax.network/c-chain", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "AVAX" },
  43113: { name: "Avalanche Fuji", testnet: true, rpc: "https://api.avax-test.network/ext/bc/C/rpc", explorer: "https://subnets-test.avax.network/c-chain", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "AVAX" },
  4217: { name: "Tempo", rpc: "https://rpc.tempo.xyz", explorer: "https://explore.tempo.xyz", decimals: 6, symbol: "USDC.e", balanceToken: "0x20C000000000000000000000b9537d11c60E8b50" },
  42431: { name: "Tempo Testnet", testnet: true, rpc: "https://rpc.moderato.tempo.xyz", explorer: "https://explore.testnet.tempo.xyz", decimals: 6, symbol: "pathUSD", balanceToken: "0x20c0000000000000000000000000000000000000" },
  // Robinhood Chain pays out USDG (Paxos), not USDC: no USDC exists there. Totals group by symbol,
  // so USDG is always shown on its own and never added into a USDC sum.
  4663: { name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com", decimals: 6, symbol: "USDG", nativeDecimals: 18, nativeSymbol: "ETH" },
  // Testnet has no stablecoin: the wave deploys a test MockUSDC (symbol mUSDC), so it never sums with USDC or USDG.
  46630: { name: "Robinhood Chain Testnet", testnet: true, rpc: "https://rpc.testnet.chain.robinhood.com", explorer: "https://explorer.testnet.chain.robinhood.com", decimals: 6, symbol: "mUSDC", nativeDecimals: 18, nativeSymbol: "ETH" },
  // Monad (Metropolis entry): chainId and explorer from chains.json; recheck the RPC with the deploy.
  143: { name: "Monad", rpc: "https://rpc.monad.xyz", explorer: "https://monadvision.com", decimals: 6, symbol: "USDC", nativeDecimals: 18, nativeSymbol: "MON" },
  31612: { name: "Mezo", rpc: "https://mezo.drpc.org", explorer: "https://explorer.mezo.org", decimals: 18, symbol: "MUSD", nativeDecimals: 18, nativeSymbol: "BTC" },
  31611: { name: "Mezo Testnet", testnet: true, rpc: "https://rpc.test.mezo.org", explorer: "https://explorer.test.mezo.org", decimals: 18, symbol: "MUSD", nativeDecimals: 18, nativeSymbol: "BTC" },
};

export const explorerAddress = (explorer: string, address: string) =>
  `${explorer}/address/${address}`;

export const explorerTx = (explorer: string, tx: string) =>
  `${explorer}/tx/${tx}`;
