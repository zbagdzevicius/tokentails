/**
 * Public receiving addresses of the Token Tails treasury per EVM chain id, for crypto checkout
 * purchases (commerce, not donations). Addresses only: no key, seed or account detail ever lives in
 * this repository. A `null` chain is not offered until an address is set here or in env
 * (`CRYPTO_PAY_TREASURY_<chainId>`, or `CRYPTO_PAY_TREASURY` for every chain at once).
 *
 * When set, the address is the funding framework's `shelter-split-treasury`
 * (funding/framework/tracks/a-build/wallets.public.json, mirrored as WALLETS.mainnet.treasury in the
 * generated wallet.config.ts); crypto-pay.config.spec.ts fails when a value here differs from it.
 * That treasury is filled (2026-10-05), but routing checkout revenue to it is a founder decision, so
 * every chain stays `null` here until then (env still works).
 *
 * Never put a wallet Token Tails holds for a shelter here (TOKEN_TAILS_HELD_WALLETS): such a value is
 * dropped by readCryptoPayConfig and the chain is not offered.
 */
export const TREASURY_ADDRESSES: Readonly<Record<number, string | null>> = {
    5042: null,
    8453: null,
    42161: null,
    43114: null,
    4217: null,
    4663: null,
    143: null,
};
