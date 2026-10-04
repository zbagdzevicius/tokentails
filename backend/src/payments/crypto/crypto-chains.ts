/*
 * Chains and tokens the crypto checkout accepts: the USDC and EURC entries of
 * funding/framework/tracks/a-build/chains.json (the registry the payouts and donate code use), copied
 * here because the backend build cannot read files outside `src/`. crypto-chains.spec.ts pins every
 * address, decimal and chain id against chains.json, so the two cannot drift.
 *
 * Robinhood Chain has no USDC: mainnet takes USDG (Paxos Global Dollar, chains.json `splitToken`), a
 * US dollar stablecoin priced 1:1 like USDC (token kind 'USDC', symbol 'USDG', the way Tempo's USDC.e
 * is). Its testnet has no stablecoin at all, so it takes the wave's open-mint MockUSDC (mUSDC, address
 * from deployments.json): `testOnly`, never offered under NODE_ENV=production (anyone can mint it).
 * Monad takes Circle's native USDC on both networks (addresses read on-chain 2026-10-04).
 *
 * Left out on purpose: Mezo (MUSD, address unpublished).
 *
 * Native coins (ETH, AVAX, MON) are never accepted: the checkout prices and verifies ERC-20/TIP-20
 * transfers of a USD or EUR stablecoin only, and there is no price feed for a volatile coin.
 *
 * RPC URLs: `publicRpc` is the default for every chain, so no env setup is needed. On a mainnet it
 * MUST be the chain operator's own official endpoint (Circle for Arc, Coinbase for Base, Offchain Labs
 * for Arbitrum, Ava Labs for Avalanche, Tempo for Tempo, Robinhood for Robinhood Chain, Monad Foundation
 * for Monad): it decides whether a payment is real. An env
 * value overrides it (e.g. a keyed provider for higher rate limits): `CRYPTO_PAY_RPC_<chainId>`, then
 * `rpcEnv`, the variable the funding tooling uses (RPC_ARC_MAINNET, ...). See crypto-pay.config.ts `rpcFor`.
 */

export type CryptoPayTokenKind = 'USDC' | 'EURC';

export interface CryptoPayToken {
    /** What the price is computed in. */
    token: CryptoPayTokenKind;
    /** What the token calls itself (USDC.e on Tempo, pathUSD on Tempo testnet). */
    symbol: string;
    address: string;
    decimals: number;
    /**
     * A mock token on a testnet (Robinhood testnet mUSDC: open mint, not a real dollar). Dropped on any
     * mainnet chain and under NODE_ENV=production even when testnets are allowed there.
     */
    testOnly?: true;
}

export interface CryptoPayChain {
    chainId: number;
    /** chains.json family key. */
    key: string;
    name: string;
    testnet: boolean;
    explorer: string;
    rpcEnv: string | null;
    publicRpc: string | null;
    /**
     * Blocks on top of the payment's block before it is accepted. 1 on chains with fast deterministic
     * finality (Arc, Avalanche, Tempo); 12 on the rollups (seconds there: Base, Arbitrum, Robinhood
     * Chain, an Arbitrum Orbit chain); 3 on Monad (MonadBFT finalizes a block two rounds after it is
     * proposed, ~0.8 s at 0.4 s blocks, so the block plus two on top is final in ~1.2 s).
     */
    confirmations: number;
    /** TIP-20 chains (Tempo): `transferWithMemo(to, amount, bytes32 memo)` binds a payment to an order. */
    tip20Memo: boolean;
    tokens: CryptoPayToken[];
}

/** The local anvil chain of the crypto checkout E2E; tokens come only from env, testnet mode only. */
export const LOCAL_CHAIN_ID = 31337;

export const CRYPTO_PAY_CHAINS: readonly CryptoPayChain[] = [
    {
        chainId: 5042,
        key: 'arc',
        name: 'Arc',
        testnet: false,
        explorer: 'https://explorer.arc.io',
        rpcEnv: 'RPC_ARC_MAINNET',
        publicRpc: 'https://rpc.mainnet.arc.io',
        confirmations: 1,
        tip20Memo: false,
        tokens: [
            { token: 'USDC', symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6 },
            { token: 'EURC', symbol: 'EURC', address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1', decimals: 6 },
        ],
    },
    {
        chainId: 5042002,
        key: 'arc',
        name: 'Arc Testnet',
        testnet: true,
        explorer: 'https://explorer.testnet.arc.io',
        rpcEnv: 'RPC_ARC_TESTNET',
        publicRpc: 'https://rpc.testnet.arc.io',
        confirmations: 1,
        tip20Memo: false,
        tokens: [
            { token: 'USDC', symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6 },
            { token: 'EURC', symbol: 'EURC', address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', decimals: 6 },
        ],
    },
    {
        chainId: 8453,
        key: 'base',
        name: 'Base',
        testnet: false,
        explorer: 'https://basescan.org',
        rpcEnv: 'RPC_BASE_MAINNET',
        publicRpc: 'https://mainnet.base.org',
        confirmations: 12,
        tip20Memo: false,
        tokens: [
            { token: 'USDC', symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
            { token: 'EURC', symbol: 'EURC', address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6 },
        ],
    },
    {
        chainId: 84532,
        key: 'base',
        name: 'Base Sepolia',
        testnet: true,
        explorer: 'https://sepolia.basescan.org',
        rpcEnv: 'RPC_BASE_SEPOLIA',
        publicRpc: 'https://base-sepolia-rpc.publicnode.com',
        confirmations: 12,
        tip20Memo: false,
        tokens: [
            { token: 'USDC', symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
            { token: 'EURC', symbol: 'EURC', address: '0x808456652fdb597867f38412077A9182bf77359F', decimals: 6 },
        ],
    },
    {
        chainId: 42161,
        key: 'arbitrum',
        name: 'Arbitrum One',
        testnet: false,
        explorer: 'https://arbiscan.io',
        rpcEnv: 'RPC_ARBITRUM_MAINNET',
        publicRpc: 'https://arb1.arbitrum.io/rpc',
        confirmations: 12,
        tip20Memo: false,
        tokens: [{ token: 'USDC', symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 }],
    },
    {
        chainId: 421614,
        key: 'arbitrum',
        name: 'Arbitrum Sepolia',
        testnet: true,
        explorer: 'https://sepolia.arbiscan.io',
        rpcEnv: 'RPC_ARBITRUM_SEPOLIA',
        publicRpc: 'https://sepolia-rollup.arbitrum.io/rpc',
        confirmations: 12,
        tip20Memo: false,
        tokens: [{ token: 'USDC', symbol: 'USDC', address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', decimals: 6 }],
    },
    {
        chainId: 43114,
        key: 'avalanche',
        name: 'Avalanche C-Chain',
        testnet: false,
        explorer: 'https://subnets.avax.network/c-chain',
        rpcEnv: 'RPC_AVALANCHE_MAINNET',
        publicRpc: 'https://api.avax.network/ext/bc/C/rpc',
        confirmations: 1,
        tip20Memo: false,
        tokens: [
            { token: 'USDC', symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
            { token: 'EURC', symbol: 'EURC', address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD', decimals: 6 },
        ],
    },
    {
        chainId: 43113,
        key: 'avalanche',
        name: 'Avalanche Fuji',
        testnet: true,
        explorer: 'https://subnets-test.avax.network/c-chain',
        rpcEnv: 'RPC_AVALANCHE_FUJI',
        publicRpc: 'https://api.avax-test.network/ext/bc/C/rpc',
        confirmations: 1,
        tip20Memo: false,
        tokens: [
            { token: 'USDC', symbol: 'USDC', address: '0x5425890298aed601595a70AB815c96711a31Bc65', decimals: 6 },
            { token: 'EURC', symbol: 'EURC', address: '0x5E44db7996c682E92a960b65AC713a54AD815c6B', decimals: 6 },
        ],
    },
    {
        chainId: 4217,
        key: 'tempo',
        name: 'Tempo',
        testnet: false,
        explorer: 'https://explore.tempo.xyz',
        rpcEnv: 'RPC_TEMPO_MAINNET',
        publicRpc: 'https://rpc.tempo.xyz',
        confirmations: 1,
        tip20Memo: true,
        // Bridged USDC (Stargate): there is no native Circle USDC on Tempo (chains.json note).
        tokens: [
            { token: 'USDC', symbol: 'USDC.e', address: '0x20C000000000000000000000b9537d11c60E8b50', decimals: 6 },
        ],
    },
    {
        chainId: 42431,
        key: 'tempo',
        name: 'Tempo Testnet',
        testnet: true,
        explorer: 'https://explore.testnet.tempo.xyz',
        rpcEnv: 'RPC_TEMPO_TESTNET',
        publicRpc: 'https://rpc.moderato.tempo.xyz',
        confirmations: 1,
        tip20Memo: true,
        // No test USDC on Moderato: chains.json lists testnet pathUSD in its `usdc` field.
        tokens: [
            { token: 'USDC', symbol: 'pathUSD', address: '0x20c0000000000000000000000000000000000000', decimals: 6 },
        ],
    },
    {
        chainId: 4663,
        key: 'robinhood',
        name: 'Robinhood Chain',
        testnet: false,
        explorer: 'https://robinhoodchain.blockscout.com',
        rpcEnv: 'RPC_ROBINHOOD_MAINNET',
        publicRpc: 'https://rpc.mainnet.chain.robinhood.com',
        confirmations: 12,
        tip20Memo: false,
        // No USDC on Robinhood Chain: USDG (Paxos), a US dollar stablecoin, priced 1:1 like USDC.
        tokens: [{ token: 'USDC', symbol: 'USDG', address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6 }],
    },
    {
        chainId: 46630,
        key: 'robinhood',
        name: 'Robinhood Chain Testnet',
        testnet: true,
        explorer: 'https://explorer.testnet.chain.robinhood.com',
        rpcEnv: 'RPC_ROBINHOOD_TESTNET',
        publicRpc: 'https://rpc.testnet.chain.robinhood.com',
        confirmations: 12,
        tip20Memo: false,
        // No stablecoin on the testnet: the wave's MockUSDC (deployments.json tokenAddress), open mint.
        tokens: [
            {
                token: 'USDC',
                symbol: 'mUSDC',
                address: '0x457c89e10a6e66633Eda5Bf82fD086FEbB5DB147',
                decimals: 6,
                testOnly: true,
            },
        ],
    },
    {
        chainId: 143,
        key: 'monad',
        name: 'Monad',
        testnet: false,
        explorer: 'https://monadvision.com',
        rpcEnv: 'RPC_MONAD_MAINNET',
        publicRpc: 'https://rpc.monad.xyz',
        confirmations: 3,
        tip20Memo: false,
        tokens: [{ token: 'USDC', symbol: 'USDC', address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6 }],
    },
    {
        chainId: 10143,
        key: 'monad',
        name: 'Monad Testnet',
        testnet: true,
        explorer: 'https://testnet.monadvision.com',
        rpcEnv: 'RPC_MONAD_TESTNET',
        publicRpc: 'https://testnet-rpc.monad.xyz',
        confirmations: 3,
        tip20Memo: false,
        tokens: [{ token: 'USDC', symbol: 'USDC', address: '0x534b2f3A21130d7a60830c2Df862319e593943A3', decimals: 6 }],
    },
];

export const cryptoPayChain = (chainId: number): CryptoPayChain | undefined =>
    CRYPTO_PAY_CHAINS.find(chain => chain.chainId === Number(chainId));
