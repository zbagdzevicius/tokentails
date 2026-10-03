# Arc Microgrants — submission

_Generated 2026-10-03T19:13:11.004Z by `fund a:submission arc-microgrants` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Arc Microgrants |
| Deadline | 2026-10-14T23:59:00-04:00 |
| Call | https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |
| Submitted via | DoraBacks registration link on the Arc call page |
| Live deployment link | https://tokentails.com/shelter-payouts (plus the Arc explorer link for {SPLIT_ADDRESS}) |
| Builder profile | {BUILDER_PROFILE_URL} (GitHub, X or Farcaster; required by the call) |

## Summary  <!-- 265/280 chars -->

ShelterSplit splits native USDC on Arc as it arrives and pays each registered shelter in one transaction. Players send a sponsored one-tap gift after a game, and every payout gets a public receipt. First shelter: Pink Paw, wallet held by Token Tails until handover.

## What we built on Arc

- Arc-native path: USDC is Arc's gas token, so the native and ERC-20 balances are one. donate(memo) and receive() split a USDC send with no approve step. disburse(amount, memo) serves ERC-20 payers such as the EURC instance.
- Events: one NativeDisbursed or Disbursed(shelter, amount, memo) per shelter and one batch event per call. The payouts page, receipts and meter read only these.
- Registry: the owner adds, updates, deactivates or removes shelters. Shares never exceed the payment; dust goes to the treasury, so the contract holds no balance.
- Atomic batch: if one payout fails, for example a wallet that rejects the transfer, the whole batch reverts and nobody is paid short; the owner deactivates that shelter. A test covers this.
- Sponsored gifts: a verified player taps once a day; a backend wallet with a small float calls donate('tt:<source>:<random id>') within a capped daily budget. The memo holds no personal data.
- Agent payments, off until handover: an x402-compatible endpoint answers 402 with a price. The agent calls donate('x402:<nonce>') and retries with the tx hash, checked over RPC and accepted once. Our own onchain-receipt scheme, no facilitator.
- Trust model: the chain proves USDC reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- Reentrancy guard, pause, two-step ownership, caps, a fuzzed Foundry suite. ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/).

## Arc mainnet deployment

Arc mainnet: ShelterSplit (USDC) at {SPLIT_ADDRESS} and ShelterSplit (EURC) at {EURC_SPLIT_ADDRESS}. The first payout to Pink Paw is transaction {ARC_PROOF_TX}, a Disbursed event anyone can look up. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of Pink Paw, to be handed over to the shelter. Every payout into it stays public, before and after the handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet, and ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Arc testnet (chain 5042002) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://explorer.testnet.arc.io/tx/0x6af0fe0eae4abd65d8560cf4ed14ada55f2debd2e14e9306d45d81a271d0ede8) | [payout 1](https://explorer.testnet.arc.io/tx/0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a) | verified on-chain, source verified |

## Build evidence

All 73/73 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `9734bed09985`, built 2026-10-01.

## Why it matters

Animal shelters run on small donations and have no cheap way to show where the money went. A player who is told that part of a purchase helps shelters cannot check that it happened. Cross-border giving adds bank fees and delays, and most shelters are too small to integrate a payments provider. Token Tails has the demand side: a live consumer cat-rescue app on web, iOS and Android. What is missing is a neutral, public record of the part of that revenue that goes to the shelters caring for the cats. On Arc a shelter only needs an address that holds USDC. It receives the payout in the same asset it would pay gas in, so there is no second token to buy.

## Team

Token Tails is a Lithuanian company, registered as an MB in October 2024. The team shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. The same team writes, tests and deploys the contracts. Demo video: {DEMO_URL}. Disclosure: we are also entering this work in the Tameion Agents Hackathon (Canteen x Circle x Arc, closes Oct 10); no Circle or Arc program has funded it.

## Before you press submit

- [ ] Arc MAINNET address recorded and verified with fund a:verify arc mainnet
- [ ] Repo public
- [ ] Public builder profile link filled in (GitHub, X or Farcaster)
- [ ] https://api.tokentails.com/shelter/donate/status returns 200 (the Summary says players send sponsored gifts); otherwise reword the Summary to 'built, switching on'
- [ ] Pink Paw consent letter or public post exists, or no consent is claimed
- [ ] If a Tameion prize was awarded before Arc decides, disclose it (Arc excludes work already funded by a Circle or Arc program)

