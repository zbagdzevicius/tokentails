# Arc Microgrants — submission

_Generated 2026-10-07T19:29:52.065Z by `fund a:submission arc-microgrants` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Arc Microgrants |
| Deadline | 2026-10-14T23:59:00-04:00 |
| Call | https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |
| Submitted via | DoraBacks registration link on the Arc call page |
| Live deployment link | https://tokentails.com/shelter-payouts (plus the Arc explorer link for {SPLIT_ADDRESS}) |
| Builder profile | {BUILDER_PROFILE_URL} (GitHub, X or Farcaster; required by the call) |

## Summary  <!-- 265/280 chars -->

ShelterSplit splits native USDC on Arc as it arrives and pays each registered shelter in one transaction. Players send a sponsored one-tap gift after a game, and every payout gets a public receipt. First shelter: Pink Paw, wallet held by Token Tails until handover.

## What we built on Arc

- Arc-native path: USDC is Arc's gas token, so the native and ERC-20 balances are one. donate(memo) and receive() split a USDC send with no approve step. disburse(amount, memo) serves ERC-20 payers such as the EURC instance.
- Events: NativeDisbursed or Disbursed(shelter, amount, memo) per shelter and one batch event per call. Payouts page and receipts read only these; the goal meter counts USDC transfers into the campaign wallet.
- Registry: the owner adds, updates, deactivates or removes shelters; dust goes to the treasury, so the split holds no balance.
- Atomic batch: if one payout fails the whole batch reverts and nobody is paid short.
- Sponsored gifts: a verified player taps once a day; a backend wallet with a small float calls donate('tt:<source>:<random id>') within a capped daily budget. No personal data in the memo.
- One-signature gifts (public after handover): the donor signs an EIP-3009 receiveWithAuthorization that binds the router, memo and payout list. The router reverts if that list changed or any share would reach the treasury.
- Agent payments, off on mainnet until handover: standard x402 exact paid straight to the shelter wallet, or our own scheme (donate('x402:<nonce>'), tx checked over RPC, accepted once).
- Trust model: the chain proves USDC reached the registered wallet, not who controls it. Token Tails holds the first wallet for Pink Paw until handover.
- Reentrancy guard, pause, two-step ownership; fuzz and invariant Foundry suites; MIT.

## Arc mainnet deployment

Arc mainnet: ShelterSplit (USDC) at 0x457c89e10a6e66633eda5bf82fd086febb5db147 and ShelterSplit (EURC) at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052. The first payout to Pink Paw is transaction 0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d, a Disbursed event anyone can look up. Disclosure: the receiving wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails on behalf of Pink Paw, to be handed over to the shelter. Every payout into it stays public, before and after the handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet, and ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Arc mainnet (chain 5042) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://explorer.arc.io/tx/0xa88dca321dba7d2669b45defd8f6714f1dac29ad6e16bd47468e0d3a93aa7b1a) | [payout 1](https://explorer.arc.io/tx/0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d) | verified on-chain, source verified |
| Arc mainnet (chain 5042) | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://explorer.arc.io/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [deploy tx](https://explorer.arc.io/tx/0xc9e01275524bda5860b4bfd95af13bc0f9db8f384929eeb89d0b72c0af59e469) | [payout 1](https://explorer.arc.io/tx/0x56d7f37ba0608f7c610d45e4c1bca9d961218aa49f99fbcd095f635b9c62481f) | verified on-chain, source verified |
| Arc testnet (chain 5042002) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://explorer.testnet.arc.io/tx/0x6af0fe0eae4abd65d8560cf4ed14ada55f2debd2e14e9306d45d81a271d0ede8) | [payout 1](https://explorer.testnet.arc.io/tx/0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a) | verified on-chain, source verified |
| Arc testnet (chain 5042002) | [`0x937f13ce28294011567615330dbcb859a06a0bba`](https://explorer.testnet.arc.io/address/0x937f13ce28294011567615330dbcb859a06a0bba) | [deploy tx](https://explorer.testnet.arc.io/tx/0xc63d3c5786aaf15474c0d74c5c65f6e0dcd33d232bdbbee0141a83313a1e59a3) | [payout 1](https://explorer.testnet.arc.io/tx/0xc68ceb5a3633b78cd1681c81dde1ff310ca04f1f378003497acc906eb88f387b) | verified on-chain, source verified |

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

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

