// Mainnet chains for the read-only shelter wallet panel. Copied from the generated
// backend/src/shelter/onchain/wallet.config.ts; __tests__/shelter-wallet.test.ts fails if they drift.

export interface WalletToken {
  symbol: string;
  decimals: number;
  address: string;
  /** EUR stablecoins are shown apart from the USD total. */
  currency: 'USD' | 'EUR';
}

export interface WalletChain {
  key: string;
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  tokens: WalletToken[];
  /** Native gas coin; null when the chain has none (Tempo). */
  native: { symbol: string; decimals: number; currency?: 'USD' } | null;
}

export const PINK_PAW_WALLET = '0x3c833562e682dB66C2415b34961595df135f4771';

/** Arc ShelterSplit (USDC): NativeDisbursed(address indexed shelter, uint256 amount, string memo). */
export const ARC_SPLIT = '0x457c89e10a6e66633eda5bf82fd086febb5db147';
export const NATIVE_DISBURSED_TOPIC =
  '0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef';

const usd = (symbol: string, address: string): WalletToken => ({
  symbol,
  decimals: 6,
  address,
  currency: 'USD'
});

export const WALLET_CHAINS: WalletChain[] = [
  {
    key: 'arcMainnet',
    name: 'Arc',
    chainId: 5042,
    rpc: 'https://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
    // Native USDC (18 decimals) is the same balance as the USDC ERC-20 at 0x3600…, so only native is read.
    tokens: [
      {
        symbol: 'EURC',
        decimals: 6,
        address: '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1',
        currency: 'EUR'
      }
    ],
    native: { symbol: 'USDC', decimals: 18, currency: 'USD' }
  },
  {
    key: 'baseMainnet',
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    tokens: [usd('USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')],
    native: { symbol: 'ETH', decimals: 18 }
  },
  {
    key: 'arbitrumMainnet',
    name: 'Arbitrum One',
    chainId: 42161,
    rpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
    tokens: [usd('USDC', '0xaf88d065e77c8cc2239327c5edb3a432268e5831')],
    native: { symbol: 'ETH', decimals: 18 }
  },
  {
    key: 'robinhoodMainnet',
    name: 'Robinhood Chain',
    chainId: 4663,
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    tokens: [usd('USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168')],
    native: { symbol: 'ETH', decimals: 18 }
  },
  {
    key: 'avalancheMainnet',
    name: 'Avalanche C-Chain',
    chainId: 43114,
    rpc: 'https://api.avax.network/ext/bc/C/rpc',
    explorer: 'https://subnets.avax.network/c-chain',
    tokens: [usd('USDC', '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e')],
    native: { symbol: 'AVAX', decimals: 18 }
  },
  {
    key: 'tempoMainnet',
    name: 'Tempo',
    chainId: 4217,
    rpc: 'https://rpc.tempo.xyz',
    explorer: 'https://explore.tempo.xyz',
    tokens: [usd('USDC.e', '0x20c000000000000000000000b9537d11c60e8b50')],
    native: null
  },
  {
    key: 'monadMainnet',
    name: 'Monad',
    chainId: 143,
    rpc: 'https://rpc.monad.xyz',
    explorer: 'https://monadvision.com',
    tokens: [usd('USDC', '0x754704bc059f8c67012fed69bc8a327a5aafb603')],
    native: { symbol: 'MON', decimals: 18 }
  }
];
