# Team1 Avalanche mini grants — submission

_Generated 2026-10-07T19:29:52.072Z by `fund a:submission team1-avalanche` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Team1 Avalanche mini grants |
| Deadline | rolling |
| Call | https://team1.network/grants |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |

## Summary  <!-- 231/280 chars -->

ShelterSplit is an open-source payout contract on Tempo. It takes a share of Token Tails' cat-rescue app revenue in USDC.e and pays it to registered animal-shelter wallets, with one on-chain event per shelter that anyone can check.

## What we built

- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the whole payment. Any unallocated share goes to the treasury.
- disburse(amount, memo) pulls USDC.e with transferFrom and splits the amount that actually arrived. It emits one Disbursed(shelter, amount, memo) event per shelter and one DisbursementBatch event per call. Rounding dust goes to the treasury, so the contract holds no balance between calls. preview(amount) shows the split before anyone pays.
- Safety: a reentrancy guard, pause, two-step ownership, safe transfers for tokens that return no bool, and caps on shelter count, name length and memo length.
- Tests: a Foundry suite covers exact splits, rounding dust, the basis-point cap, registry changes, pause, access control, reentrancy through a malicious token, and fuzzing over amounts and shares. A Tempo suite runs the same contract against a mock TIP-20.
- Known limit, stated openly: under a Tempo receive policy a shelter can get a Disbursed event without receiving the funds. The planned fix checks each shelter's balance after payment and reverts if the share did not arrive.
- MIT licence, no external dependencies. Any app or DAO can call disburse() and pay the same public registry.

## Avalanche deployment

ShelterSplit's Tempo mainnet address and explorer link appear below once the deployment is recorded. Every payout is a Disbursed event that anyone can look up. Before the hackathon, the team shipped three Soroban contracts on Stellar mainnet. One of them, the Cat contract, has 1,218,693 invocations since January 2025. The team also deployed ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Avalanche C-Chain mainnet (chain 43114) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://subnets.avax.network/c-chain/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://subnets.avax.network/c-chain/tx/0xe701d3c22300fd10965065c16040f886d9fd91808e08a0460647d74b550bfd50) | [payout 1](https://subnets.avax.network/c-chain/tx/0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7) | verified on-chain, source verified |
| Avalanche Fuji testnet (chain 43113) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://subnets-test.avax.network/c-chain/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://subnets-test.avax.network/c-chain/tx/0xec70639ad5a7065eefd03e8006b5f41f6f68c3dcb4cd15784e63c156db8db904) | - | verified on-chain, source verified |
| Avalanche Fuji testnet (chain 43113) | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://subnets-test.avax.network/c-chain/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [deploy tx](https://subnets-test.avax.network/c-chain/tx/0xe9cc74604e31824540f51d45bb47ad43ea41011cecf51542f855230ef6edfcc8) | [payout 1](https://subnets-test.avax.network/c-chain/tx/0x4170387155b296e140924ed6a9289688dc4801dbab6372d8117ee42f9c256f02) | verified on-chain, source verified |
| Avalanche Fuji testnet (chain 43113) | [`0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022`](https://subnets-test.avax.network/c-chain/address/0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022) | [deploy tx](https://subnets-test.avax.network/c-chain/tx/0x8885ce01c16b6bebae57e9066078adf169a55df9fe5c0a3eca35721659c6f0f3) | [payout 1](https://subnets-test.avax.network/c-chain/tx/0xa0a985544ae6c97ec63c7581f404ff97962a3a14a1113e6de7459a80ea806efa), [payout 2](https://subnets-test.avax.network/c-chain/tx/0x1623dd09b2035620395887da9e6f71c872f2ad9406d8389de125c8fc962339fe) | verified on-chain, source verified |

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

## Traction

All of the following was built before 2026-09-14 and is disclosed as prior work. ShelterSplit itself is the hackathon build. Token Tails is live on web, iOS and Android. It reports 542,000 registered users all time (company figure, not independently verified). The game has five modes, including an 80-level platformer and a 30-level match-3 with leaderboards. Its production Stellar contract has 1,218,693 invocations. The app already takes Stripe, in-app purchases, and XLM and USDC on Stellar, so ShelterSplit has a payment flow to plug into. Blockchain for Good Alliance named Token Tails a top 2025 incubation project.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. It also wrote, tested and deployed the Stellar contracts behind the game, and it wrote ShelterSplit and its test suites.

## Before you press submit

- [ ] draft.md is a v0 copy that pitches Tempo: rewrite it for Avalanche before pasting anything (checked 2026-10-05)

