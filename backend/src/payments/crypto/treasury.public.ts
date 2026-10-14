/**
 * Public receiving addresses of the Token Tails treasury per EVM chain id, for crypto checkout
 * purchases (commerce, not donations). Addresses only: no key, seed or account detail ever lives in
 * this repository. A `null` chain is not offered until an address is set here or in env
 * (`CRYPTO_PAY_TREASURY_<chainId>`, or `CRYPTO_PAY_TREASURY` for every chain at once).
 *
 * When set, the address is the funding framework's `shelter-split-treasury`
 * (funding/framework/tracks/a-build/wallets.public.json, mirrored as WALLETS.mainnet.treasury in the
 * generated wallet.config.ts); crypto-pay.config.spec.ts fails when a value here differs from it.
 * Founder decision 2026-10-14: checkout revenue goes to this treasury on all seven mainnets. Read
 * on-chain that day: a plain account (no contract code) on every chain, and every checkout token
 * contract answers with 6 decimals. Checkout still stays off until CRYPTO_PAY_ENABLED=true.
 *
 * Never put a wallet Token Tails holds for a shelter here (TOKEN_TAILS_HELD_WALLETS): such a value is
 * dropped by readCryptoPayConfig and the chain is not offered.
 */
export const TREASURY_ADDRESSES: Readonly<Record<number, string | null>> = {
    5042: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
    8453: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
    42161: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
    43114: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
    4217: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
    4663: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
    143: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
};
