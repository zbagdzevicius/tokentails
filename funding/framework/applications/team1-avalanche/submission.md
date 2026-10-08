# Team1 Avalanche mini grants — submission

_Generated 2026-10-07T23:45:25.081Z by `fund a:submission team1-avalanche` from draft.md, the program profile,
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
| Project | ShelterSplit on Avalanche (Token Tails) |
| Amount | $5,000 (whole dollars, at most $10,000) |
| Other links | https://tokentails.com/shelter-payouts |

## Project description  <!-- 244/280 chars -->

ShelterSplit pays animal shelters in native USDC on Avalanche C-Chain: one call splits a payment across every registered shelter wallet, with a public event per payout. Live on mainnet with a first payout to Pink Paw. MIT, built by Token Tails.

## Summary  <!-- 1915/4000 chars -->

ShelterSplit turns the shelter promise into a public record on Avalanche C-Chain. The contract holds a shelter registry: each shelter has a wallet, a name and a share in basis points.
- disburse(amount, memo) pulls native USDC (Circle's C-Chain USDC) and pays every active shelter its share in the same transaction, with one Disbursed(shelter, amount, memo) event per shelter and one batch event per call. Rounding dust goes to the treasury, so the contract holds no balance between calls. preview(amount) shows the split before anyone pays.
- Native AVAX gifts are split the same way through donate(memo).
- One-signature gifts: an ownerless DonateRouter takes a USDC gift signed once with EIP-3009 (receiveWithAuthorization), so a donor needs no approve step. It reverts if the payout list changed or any share would reach the treasury. It opens to the public once Pink Paw holds its own key.
- Sponsored treats: after a win in Token Tails' Catnip Heist (https://tokentails.com/heist) a verified player taps "Send Pink Paw a rescue treat" and a backend wallet with a small capped float pays a tiny gift. Its Avalanche float is funded; it switches on with the production treat wallet.
- Public record: https://tokentails.com/shelter-payouts reads the C-Chain events directly, not our database, and every payout gets a receipt page.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps on shelter count, name and memo length. A Foundry suite covers exact splits, rounding dust, the basis-point cap, registry changes, pause, access control, reentrancy and fuzzing, plus invariant tests. MIT licence, no external dependencies: any Avalanche app can call disburse() and pay the same public registry.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. Token Tails holds Pink Paw's first wallet until the shelter takes it over, and says so on every page.

## Avalanche deployment

Avalanche C-Chain mainnet: ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147, source verified on Routescan and Sourcify. First payout to Pink Paw: 0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7 (0.1 USDC, a Disbursed event). DonateRouter at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052, source verified. Disclosure: the receiving wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails on behalf of Pink Paw until handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Avalanche C-Chain mainnet (chain 43114) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://subnets.avax.network/c-chain/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://subnets.avax.network/c-chain/tx/0xe701d3c22300fd10965065c16040f886d9fd91808e08a0460647d74b550bfd50) | [payout 1](https://subnets.avax.network/c-chain/tx/0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7) | verified on-chain, source verified |
| Avalanche Fuji testnet (chain 43113) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://subnets-test.avax.network/c-chain/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://subnets-test.avax.network/c-chain/tx/0xec70639ad5a7065eefd03e8006b5f41f6f68c3dcb4cd15784e63c156db8db904) | - | verified on-chain, source verified |
| Avalanche Fuji testnet (chain 43113) | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://subnets-test.avax.network/c-chain/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [deploy tx](https://subnets-test.avax.network/c-chain/tx/0xe9cc74604e31824540f51d45bb47ad43ea41011cecf51542f855230ef6edfcc8) | [payout 1](https://subnets-test.avax.network/c-chain/tx/0x4170387155b296e140924ed6a9289688dc4801dbab6372d8117ee42f9c256f02) | verified on-chain, source verified |
| Avalanche Fuji testnet (chain 43113) | [`0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022`](https://subnets-test.avax.network/c-chain/address/0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022) | [deploy tx](https://subnets-test.avax.network/c-chain/tx/0x8885ce01c16b6bebae57e9066078adf169a55df9fe5c0a3eca35721659c6f0f3) | [payout 1](https://subnets-test.avax.network/c-chain/tx/0xa0a985544ae6c97ec63c7581f404ff97962a3a14a1113e6de7459a80ea806efa), [payout 2](https://subnets-test.avax.network/c-chain/tx/0x1623dd09b2035620395887da9e6f71c872f2ad9406d8389de125c8fc962339fe) | verified on-chain, source verified |

## Milestones  <!-- 1005/4000 chars -->

The grant (amount in the form field) is paid in two equal stages, each with one metric anyone can check on the C-Chain.
1. Stage 1 (half the grant, about four weeks): Pink Paw takes over its own wallet (the registry entry is rotated on-chain and announced), sponsored treats and one-signature DonateRouter gifts open on Avalanche, and three more shelters with their own wallets join the registry. Metric: active shelters in the C-Chain registry, and Disbursed events with a tt: memo per week.
2. Stage 2 (half the grant, about eight weeks): purchases in the Token Tails app route a fixed share through disburse() on Avalanche, each purchase receipt links to its C-Chain payout, and the Rail widget lets other Avalanche apps pay the same registry. Metric: batch events per week and distinct payer addresses.
Budget: shelter onboarding and wallet setup support, C-Chain gas and the sponsored-treat float, the app integration work, and an external review of ShelterSplit and DonateRouter before volume grows.

## Why You Deserve  <!-- 504/4000 chars -->

The contract is already live and verified on Avalanche mainnet with a real payout, so the grant funds adoption, not a prototype. Token Tails has the demand side: a consumer cat-rescue app on web, iOS and Android with five game modes that already takes card, in-app and USDC payments, so payouts grow with app sales and cost shelters nothing. We plan to keep Avalanche as a home for the rail: the registry, the router and the payouts page are built to stay, and every milestone is measured on the C-Chain.

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

## Before you press submit

- [ ] Avalanche C-Chain only in the text: no other chain is pitched (the committee weights long-term Avalanche commitment)
- [ ] Never claim EURC on the C-Chain
- [ ] X post of the C-Chain payout tagging @AvaxTeam1 exists before submitting
- [ ] Builder Hub account whose inbox someone reads; new project, not tied to another program

