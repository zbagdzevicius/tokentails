# Donate rail, 2026-10-04: what changed for the x402 micro-grant

Additive note. Rolling program; plan is to build and post Oct 12–16, after Colosseum. The grant asks
for projects "live on mainnet" that "unlock new demand or supply".

## New mechanics, mapped to what the grant asks

| Ask | What is new |
|---|---|
| Standard x402 | The backend now offers the standard `exact` scheme (EIP-3009 `TransferWithAuthorization`) next to our own `onchain-receipt` scheme. `payTo` is **the shelter's own wallet**: the agent signs a transfer straight to the shelter, the facilitator submits it and pays gas, Token Tails never holds or relays the money. Mainnet networks are offered only when `SHELTER_HANDED_OVER=true`. (`backend/src/shelter/onchain/x402-exact.ts`) |
| A facilitator that covers the chain | The `exact` scheme is facilitator-agnostic; the code defaults to the x402.org facilitator and lists `arc-testnet` but no Arc mainnet network. Circle's docs list Arc, Base and Polygon PoS for its x402 facilitator (source below); pointing the scheme at it is the next step, not done. |
| New demand | Agents can now give to a shelter without a donation form; a budgeted agent (CappedSpender + Claude) shows how an AI can give safely inside on-chain caps. |
| Developer tool | shelter-rail widget and SDK (MIT) for any site to add a give button. |

## Correction to carry into answers.md (not edited here; another session owns it)

answers.md says the x402 payment "is split on-chain between the shelter and the treasury". With the
`exact` scheme the payment goes straight to the shelter wallet; nothing reaches a treasury. Fix that
sentence before posting.

## 3-beat video (≤ 2 min, tag @coinbaseDev)

1. **402.** `curl` the cat-card URL: a 402 with an `exact` offer, `payTo` = the shelter's wallet,
   price [C-006].
2. **Pay.** An agent signs one EIP-3009 authorization; the facilitator settles; the explorer shows a
   USDC transfer agent → shelter wallet.
3. **Card.** The retry returns 200 with the cat card; the payouts page lists the payment.

## Live, testnet, pending

| Item | State on 2026-10-04 |
|---|---|
| `exact` scheme | built; testnet only (Base Sepolia via the default testnet facilitator) |
| Mainnet | pending the Pink Paw handover: the grant needs mainnet, so do not apply before G2b passes |
| Our own onchain-receipt scheme | built, endpoint off by default (`SHELTER_X402_ENABLED`) |

## Numbers and their keys

[C-006] cat-card price for the onchain-receipt scheme (0.01 USDC); the `exact` default price in code
is also 0.01 USDC but has no fact key yet: add one before citing it. App facts [F-015] [F-016].

Facilitator networks: Circle docs, https://developers.circle.com/x402-facilitators/x402. No launch date on a Circle source yet: cite none.
