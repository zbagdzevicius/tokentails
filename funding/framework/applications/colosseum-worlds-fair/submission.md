# Colosseum Crypto World's Fair — submission

_Generated 2026-09-29T07:03:35.576Z by `fund a:submission colosseum-worlds-fair` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Colosseum Crypto World's Fair |
| Deadline | 2026-10-12T23:59:00-07:00 |
| Call | https://colosseum.com/worldsfair |
| Repository | _(not set — add `repo:` to call.md)_ |
| Demo | _(not set — add `demo:` to call.md)_ |
| Tracks entered | Tempo track (Arbitrum track as well if the form allows more than one), plus the Public Goods Award |
| Category | Payments / public goods |

## One-line pitch  <!-- 231/280 chars -->

Built in the hackathon window: ShelterSplit, a USDC.e payout rail on Tempo with a TIP-20 memo receipt per shelter, a public payouts page, and Catnip Heist, a new game that feeds it. The Token Tails app it plugs into existed before.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for.

## Solution

Three pieces, all built between 2026-09-14 and 2026-10-12:
- ShelterSplit, the rail. A shelter registry in the contract (wallet, name, share in basis points). One disburse(amount, memo) call pulls USDC.e from the payer and pays every active shelter its share in the same transaction, each with a TIP-20 memo carrying the purchase reference. The rest goes to the treasury.
- The payouts page at {PAYOUTS_URL}. It reads the contract's events from Tempo and lists each shelter, what it has received, and an explorer link for every payout. No backend is trusted for the numbers.
- Catnip Heist at {HEIST_URL}, a deterministic voxel stealth game: the same inputs always replay to the same result. It is the new front door for purchases that fund shelters.
The buyer never touches a wallet. The purchase stays a card or in-app payment, and Token Tails' operations wallet funds the payout from its USDC.e balance.

## Why Tempo

Tempo is a payments chain, and Token Tails already takes card payments through Stripe. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token. Finality is deterministic, so a receipt can link to a payout that has settled. ShelterSplit pays each shelter with TIP-20 transferWithMemo, so the memo on the shelter's own transfer carries the purchase reference and the shelter can reconcile without us. A Tempo test suite runs the contract against a mock TIP-20 at the real USDC.e address and covers transfer-policy reverts, token pause and receive-policy redirects. A policy block reverts the whole batch, so no shelter is paid short.

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the whole payment. Any unallocated share goes to the treasury.
- disburse(amount, memo) pulls USDC.e and splits the amount that actually arrived. Each shelter is paid with transferWithMemo. The contract emits one Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Rounding dust goes to the treasury, so the contract holds no balance. preview(amount) shows the split before anyone pays.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers for tokens that return no bool, caps on shelter count, name length and memo length.
- Tests: a Foundry suite covers exact splits, dust, the cap, registry changes, pause, access control, reentrancy through a malicious token and fuzzing. A Tempo suite runs the same contract against a mock TIP-20.
- Known limit, stated openly: under a Tempo receive policy a shelter can get a Disbursed event without the funds. Each wallet is checked for a receive policy before it is registered, and a post-payment balance check is next.
- Trust model: the chain proves USDC.e reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of {SHELTER_NAME} and will be handed over to them.
- MIT, no external dependencies, at {REPO_URL}. Any app or DAO can call disburse() and pay the same registry.

## On-chain proof

Tempo mainnet: ShelterSplit at {SPLIT_ADDRESS}. The first payout to {SHELTER_NAME} is transaction {TEMPO_TX}, with its memo, and it is listed on the payouts page. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of {SHELTER_NAME}, to be handed over to the shelter. The shelter consented to be named. Before the hackathon, and disclosed as prior work, the team shipped three Soroban contracts on Stellar mainnet and ERC-721 contracts on SKALE testnet and mainnet.

_No ShelterSplit deployment recorded on tempo / arbitrum yet — run `fund a:deploy tempo mainnet`, then `fund a:record`._

## Build evidence

All 41/41 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `b7ac944667b02b444335550a0c78a3a3f684a23c52fe8cc228632e8119964ada`, runtime 8768 bytes, **built from uncommitted source (untracked, not committed yet) — commit, push and re-run `fund a:build` before submitting**, built 2026-09-28.

## Traction

Judge only the in-window work: the rail, the payouts page and Catnip Heist. Everything below existed before 2026-09-14 and is disclosed as prior work. Token Tails is live on web, iOS and Android, with five game modes, and already takes Stripe, in-app purchases and USDC. Historical peaks, not current activity: on the SEI chain, Token Tails peaked at 324,000 monthly active on-chain users and 659,000 weekly transactions in 2025-26; that SEI activity ended in March 2026 and none of it is Tempo data. Blockchain for Good Alliance named Token Tails a top 2025 incubation project.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. In the window it wrote ShelterSplit and its test suites, the payouts page and Catnip Heist. Demo: {DEMO_VIDEO_URL}. Pitch: {PITCH_VIDEO_URL}.

## Roadmap and business plan

Token Tails earns from card payments and in-app purchases. ShelterSplit sends a fixed share of those purchases to shelters and the rest to the treasury. The contract charges shelters nothing. Payout volume grows with app sales, and the public payout record is something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon: ShelterSplit on Tempo mainnet, {SHELTER_NAME} registered, a first real payout with a memo, and the payouts page live. Metric: shelters in the registry.
2. Handover and delivery check: the held wallet passes to {SHELTER_NAME}, and payouts revert if a share does not arrive. Metric: shelters controlling their own wallet.
3. App integration: purchases in Token Tails and Catnip Heist trigger disburse(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: other apps pay the same shelters. Metric: distinct payer addresses.

## Before you press submit

- [ ] Public GitHub repo; disclose pre-hackathon work (products are judged only on work done Sep 14 - Oct 12)
- [ ] Product demo video recorded by a human, no more than 3 minutes (colosseum.com/hackathon FAQ)
- [ ] Pitch/presentation video recorded by a human, 2 to 3 minutes (colosseum.com/hackathon FAQ)
- [ ] Deployment address and explorer link on Tempo mainnet (explore.tempo.xyz), plus Arbitrum One if entered
- [ ] Every team member registered on colosseum.com before 2026-10-12 23:59 PT (rules section 6)

