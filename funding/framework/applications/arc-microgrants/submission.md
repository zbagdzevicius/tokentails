# Arc Microgrants — submission

_Generated 2026-09-29T07:03:35.339Z by `fund a:submission arc-microgrants` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Arc Microgrants |
| Deadline | 2026-10-14T23:59:00-04:00 |
| Call | https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq |
| Repository | _(not set — add `repo:` to call.md)_ |
| Demo | _(not set — add `demo:` to call.md)_ |
| Submitted via | DoraHacks entry |

## Summary  <!-- 223/280 chars -->

ShelterSplit splits native USDC on Arc as it arrives: a plain send, no approve step, pays each registered animal shelter its share in one transaction. First payout: {SHELTER_NAME}, wallet held by Token Tails until handover.

## What we built on Arc

- Arc-native receive path: USDC is Arc's native gas token, and the native balance and the ERC-20 balance are one balance. The contract's payable receive() splits a plain USDC send on arrival, so a payer needs no approve step. disburse(amount, memo) remains for ERC-20 payers such as the EURC instance.
- Finality on inclusion: a payout is settled once included, so a receipt can link to it after one confirmation.
- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never exceed the full payment. Rounding dust and any unallocated share go to the treasury, so the contract holds no balance.
- Events: one Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. The payouts page reads only these.
- Blocklist: a USDC transfer to a blocklisted address reverts. A batch is atomic, so one blocked wallet reverts the payout; the owner deactivates that shelter and its share falls back to the treasury. A test covers this.
- Trust model, stated plainly: the chain proves USDC reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of {SHELTER_NAME}, which consented in writing, and will be handed over to them.
- Safety and tests: reentrancy guard, pause, two-step ownership, safe transfers, caps. A Foundry suite covers splits, dust, the cap, pause, access control, reentrancy, blocked recipients and fuzzing.
- MIT, no external dependencies, at {REPO_URL}.

## Arc mainnet deployment

Arc mainnet: ShelterSplit (USDC) at {SPLIT_ADDRESS} and ShelterSplit (EURC) at {EURC_SPLIT_ADDRESS}. The first payout to {SHELTER_NAME} is transaction {ARC_TX}, a Disbursed event anyone can look up. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of {SHELTER_NAME}, to be handed over to the shelter. Every payout into it stays public, before and after the handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet, and ERC-721 contracts on SKALE testnet and mainnet.

_No ShelterSplit deployment recorded on arc yet — run `fund a:deploy arc mainnet`, then `fund a:record`._

## Build evidence

All 41/41 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `b7ac944667b02b444335550a0c78a3a3f684a23c52fe8cc228632e8119964ada`, runtime 8768 bytes, **built from uncommitted source (untracked, not committed yet) — commit, push and re-run `fund a:build` before submitting**, built 2026-09-28.

## Why it matters

Animal shelters run on small donations and have no cheap way to show where the money went. A player who is told that part of a purchase helps shelters cannot check that it happened. Cross-border giving adds bank fees and delays, and most shelters are too small to integrate a payments provider. Token Tails has the demand side: a live consumer cat-rescue app on web, iOS and Android. What is missing is a neutral, public record of the part of that revenue that goes to the shelters caring for the cats. On Arc a shelter only needs an address that holds USDC. It receives the payout in the same asset it would pay gas in, so there is no second token to buy.

## Team

Token Tails is a Lithuanian company, registered as an MB in October 2024. The team shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. The same team writes, tests and deploys the contracts. Demo video: {DEMO_VIDEO_URL}.

## Before you press submit

- [ ] Arc MAINNET address recorded and verified with fund a:verify arc mainnet
- [ ] Repo public

