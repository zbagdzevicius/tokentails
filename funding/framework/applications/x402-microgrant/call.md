---
program: "x402 Foundation impact micro-grant"
track: B
status: drafting
frame: payout-rail
criteria: none
deadline: "rolling"
url: "https://github.com/x402-foundation/x402/blob/main/PROJECT-IDEAS.md"
next: "Do not start before Oct 11 (Colosseum first). Oct 12-14 AI configures the standard x402 exact scheme (built, testnet verified) through a facilitator on a mainnet that facilitator supports; needs the x402 go decision (exact on mainnet needs SHELTER_HANDED_OVER=true and SHELTER_X402_FACILITATOR_URL; the onchain-receipt card is on by default but opens on a mainnet only after Pink Paw's per-chain claim). Then fill {X402_URL} {PAY_TX} {VIDEO_URL} in answers.md, b:fill, record the 2 min video, post on X tagging @coinbaseDev, open the GitHub issue."
created: 2026-10-02
website: "https://tokentails.com"
ask: "3000"
contact: ""
---
# x402 Foundation impact micro-grant — call rules

Track B short form. The field list lives in `form.md`, free answers in `answers.md`, and
`node bin/fund.mjs b:fill x402-microgrant` writes the paste sheet `fill.md`.

Frontmatter keys used by `fm:` sources: `website`, `ask` (plain number, the amount requested),
`contact` (a role address only, never a personal one).

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|

## Limits

See form.md (one row per field).

## Eligibility gates

- "Impact-based micro-grants up to $3k" for projects that "unlock new demand or supply and are live on mainnet".
- To apply: "Open a grant or reach out to @murrlincoln"; the October sweep also records: a video of 2 minutes or less, tagging @coinbaseDev on X.
- No deadline, award count, approval rate, payout asset or KYC rule is published (issue #3598 asking about them had no maintainer reply on 2026-09-27).
- Our endpoint's default scheme is our own `onchain-receipt`, without a facilitator, which probably does not count. The standard `exact` scheme is built (`backend/src/shelter/onchain/x402-exact.ts`) but opt-in and testnet-only so far; the entry needs it live on mainnet first.

## Exclusions
