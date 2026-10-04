/**
 * Public receiving addresses of the Token Tails treasury per EVM chain id, for crypto checkout
 * purchases (commerce, not donations). Addresses only: no key, seed or account detail ever lives in
 * this repository. A `null` chain is not offered until an address is set here or in env
 * (`CRYPTO_PAY_TREASURY_<chainId>`, or `CRYPTO_PAY_TREASURY` for every chain at once).
 *
 * The funding framework keeps the same address as `shelter-split-treasury` in
 * funding/framework/tracks/a-build/wallets.public.json; it is still `null` there (2026-10-04), so no
 * chain is live until the founder fills one of the two.
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
};
