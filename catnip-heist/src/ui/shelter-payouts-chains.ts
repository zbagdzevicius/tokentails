// copy-lint: web-only chain names and explorers for the payouts modal, which renders only on web hosts
/**
 * Display names and block explorers for the payouts modal (src/ui/shelter-payouts.ts). Mirrors
 * client/components/shelter-payouts/chains.ts; the RPCs and units stay in payouts.ts.
 */
export const PAYOUT_CHAIN_META: Record<number, { name: string; explorer: string }> = {
  5042: { name: 'Arc', explorer: 'https://explorer.arc.io' },
  5042002: { name: 'Arc Testnet', explorer: 'https://explorer.testnet.arc.io' },
  4217: { name: 'Tempo', explorer: 'https://explore.tempo.xyz' },
  42431: { name: 'Tempo Testnet', explorer: 'https://explore.testnet.tempo.xyz' },
  42161: { name: 'Arbitrum One', explorer: 'https://arbiscan.io' },
  421614: { name: 'Arbitrum Sepolia', explorer: 'https://sepolia.arbiscan.io' },
  43114: { name: 'Avalanche C-Chain', explorer: 'https://subnets.avax.network/c-chain' },
  43113: { name: 'Avalanche Fuji', explorer: 'https://subnets-test.avax.network/c-chain' },
  8453: { name: 'Base', explorer: 'https://basescan.org' },
  84532: { name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org' },
  4663: { name: 'Robinhood Chain', explorer: 'https://robinhoodchain.blockscout.com' },
  46630: { name: 'Robinhood Chain Testnet', explorer: 'https://explorer.testnet.chain.robinhood.com' },
  143: { name: 'Monad', explorer: 'https://monadvision.com' },
  10143: { name: 'Monad Testnet', explorer: 'https://testnet.monadvision.com' },
};

/**
 * What each chain is used for, one line per chain family (the testnet proof shows it per card).
 * Mirrors client/components/shelter-payouts/chains.ts CHAIN_ROLES (payout-chains-client-parity test).
 */
export const PAYOUT_CHAIN_ROLES: Record<string, string> = {
  arc: "Circle's chain: gas is paid in USDC itself. Pink Paw's campaign runs here.",
  arcEurc: "Arc's euro split: EURC gifts go straight to the shelter. The dollar goal counts only USDC.",
  tempo: 'A payments chain with no gas coin: network fees are paid in a stablecoin.',
  arbitrum: 'Ethereum rollup with low fees. Native ETH gifts are split too.',
  avalanche: 'Avalanche C-Chain. Native AVAX gifts are split too.',
  base: "Coinbase's Ethereum rollup. Native ETH gifts are split too.",
  robinhood: 'Pays USDG, a regulated dollar stablecoin: there is no USDC on this chain.',
  robinhoodTestnet: 'The testnet has no stablecoin, so it uses a test coin (mUSDC).',
  monad: "A fast EVM chain with Circle's own USDC. Native MON gifts are split too.",
};

/** Chain family per chain id, mainnet and testnet. */
const FAMILY_BY_CHAIN_ID: Record<number, string> = {
  5042: 'arc', 5042002: 'arc', 4217: 'tempo', 42431: 'tempo', 42161: 'arbitrum', 421614: 'arbitrum',
  43114: 'avalanche', 43113: 'avalanche', 8453: 'base', 84532: 'base', 4663: 'robinhood', 46630: 'robinhoodTestnet',
  143: 'monad', 10143: 'monad',
};

/** The role line for a chain id, or '' for chains without one. */
export const payoutChainRole = (chainId: number): string => PAYOUT_CHAIN_ROLES[FAMILY_BY_CHAIN_ID[chainId]] ?? '';

/**
 * The testnets the testnet proof reads, in the order it shows them (the deploy wave's seven chains).
 * Anything else in the testnet list is ignored, so a mainnet entry can never land in the test section.
 */
export const TESTNET_CHAIN_IDS: readonly number[] = [5042002, 42431, 421614, 43113, 84532, 46630, 10143];

/**
 * The website receipt for one payout: `{payoutsUrl}/receipt?chain=<id>&tx=<hash>`. '' when the build
 * has no site link (payoutsUrl ''), or the hash is not a transaction hash.
 */
export function receiptHref(payoutsUrl: string, chainId: number, tx: string): string {
  const base = payoutsUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!base || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return '';
  return `${base}/receipt?chain=${chainId}&tx=${tx}`;
}
