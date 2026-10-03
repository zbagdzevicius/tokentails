# Tameion Agents Hackathon (Canteen x Circle x Arc) — submission

_Generated 2026-10-02T08:28:46.474Z by `fund a:submission tameion` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Tameion Agents Hackathon (Canteen x Circle x Arc) |
| Deadline | 2026-10-10T23:59:00-04:00 |
| Call | https://tameion.thecanteenapp.com/ |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |
| Chain | Arc (mainnet USDC preferred and weighted more heavily; test USDC accepted) |
| Problem area | Autonomous Operations (open RFB, not a mandatory track) |

## Summary  <!-- 279/280 chars -->

A budget-capped agent pays a cat shelter in USDC on Arc and gets something back: it calls /shelter/agent/cat-card, gets a 402 offer, pays ShelterSplit, retries with the tx hash and receives an adoptable-cat card. Every payout is public; we hold the shelter wallet until handover.

## What the agent does

The agent buys one adoptable-cat card from https://api.tokentails.com/shelter/agent/cat-card, and the whole price is split across shelter wallets on Arc. The loop has no human in it:
1. The agent calls the URL. The server answers 402 with an x402-shaped offer: scheme onchain-receipt, network eip155 for Arc, the price, payTo set to the ShelterSplit contract and a one-time memo of the form x402:<nonce>.
2. The agent checks the price against its own spending cap and calls donate(memo) on the contract, paying native USDC.
3. It retries with an X-PAYMENT header carrying the transaction hash and nonce.
4. The server reads the receipt over RPC: status ok, payout events from that contract with that memo summing to the price, a nonce it issued and that has not expired, and a hash never used before. Then it answers 200 with the card and an X-PAYMENT-RESPONSE header.
payAndFetch in the open SDK does all of this in one call: it refuses any price above the cap, pays at most once and passes any non-402 answer straight through. examples/agent-pay.mjs is a Node script that runs it; the spending decision is a fixed cap in code, not a model. Honest limit: this is our own scheme, x402-compatible in shape, without a facilitator, because standard facilitators may not support Arc. Demo: {DEMO_URL}.

## How it works

- ShelterSplit on Arc at {SPLIT_ADDRESS}: a registry of shelter wallets, names and shares in basis points. donate(memo) splits the USDC sent with the call across every active shelter in the same transaction and emits one public event per payout. The contract never holds funds between calls. An ERC-20 path, disburse(), does the same through the USDC token interface, with separate events so the two decimal scales never mix.
- Sponsored treats, the human-facing twin: after a win in Catnip Heist (https://tokentails.com/heist) a signed-in player taps "Send Pink Paw a rescue treat", and a backend wallet with a small float pays a tiny gift, once a day per player, from a capped daily budget. Each payout gets a receipt page and a share card. First treat: {ARC_TX}.
- The payouts page at https://tokentails.com/shelter-payouts reads chain events, not our database.
- Safety: reentrancy guard, pause, two-step ownership, caps, a Foundry suite with fuzzing, and backend tests for the receipt check and replay protection.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. MIT, at github.com/zbagdzevicius/tokentails.

## Circle tools used

- USDC on Arc as both the payment and the gas: the agent needs no second token, and neither does a shelter.
- Arc settlement: the server can accept the payment as soon as the receipt is final, so the agent gets its card in the same session.
- EURC on Arc: the contract takes any token at deploy time, and a EURC instance is prepared for European shelters, not yet deployed.
Honest gap: we do not yet use Circle Wallets, Paymaster, CCTP or Gateway. The next step is Circle Wallets for the shelter side, so a shelter can hold its own key without managing a seed phrase, which is also our path to handing over the first wallet.

## Traction

Traction is early, and we will not dress it up. Businesses onboarded: one shelter, Pink Paw, whose wallet Token Tails still holds. Value moved: the first sponsored treat {ARC_TX} and every payout after it, listed on the payouts page. Agent payments: the endpoint is new in this window and has had no outside agent yet. What exists around it, from before the window: Token Tails is live on web, iOS and Android with five game modes and three payment rails, so the give flow sits in front of real players. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets in November 2025; that activity ended in March 2026 and none of it is Arc data.

## Innovation

Most agent-payment demos pay a seller. Here the seller's revenue is the donation: the agent buys a piece of content and the full price lands in shelter wallets, split by a contract, with a public event per payout. The x402 check runs against the chain itself, so it needs no facilitator and works on a chain facilitators do not cover yet. The same contract serves a game player's one-tap gift and an agent's machine payment, and both show up on one public page.

## Arc deployment

Arc mainnet: ShelterSplit at {SPLIT_ADDRESS}. The first sponsored treat to Pink Paw is transaction {ARC_TX}, listed on the payouts page. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet was created by and is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet; the contract itself holds nothing. Prior work, before the window: three Soroban contracts on Stellar mainnet, and ShelterSplit's ERC-20 split core, written from 2026-09-25, two days before the window opened. We also entered this work in Arc Microgrants.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Arc testnet (chain 5042002) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://explorer.testnet.arc.io/tx/0x6af0fe0eae4abd65d8560cf4ed14ada55f2debd2e14e9306d45d81a271d0ede8) | [payout 1](https://explorer.testnet.arc.io/tx/0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a) | verified on-chain, source verified |

## Build evidence

All 73/73 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `9734bed09985`, built 2026-10-01.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product: the app on both stores, an AI pipeline that writes each cat's story and paints its portraits, and payments on three rails. In the window it wrote the native-USDC donate path, the x402 endpoint and its receipt check, payAndFetch and the agent example, the sponsored-treat flow and the receipts.

## Before you press submit

- [ ] Public GitHub repo (required)
- [ ] Demo video under 3 minutes (required)
- [ ] Live deployed link (optional on the page, strongly encouraged)
- [ ] Only in-window progress (2026-09-27 to 2026-10-10) counts: show the delta, disclose prior work
- [ ] Arc mainnet address recorded with fund a:record arc mainnet, x402 endpoint switched on, one paid agent call on the explorer

