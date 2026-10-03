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
  4663: { name: 'Robinhood Chain', explorer: 'https://robinhoodchain.blockscout.com' },
  143: { name: 'Monad', explorer: 'https://monadvision.com' },
};
