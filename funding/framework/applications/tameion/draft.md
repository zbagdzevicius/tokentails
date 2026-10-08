---
program: Tameion Agents Hackathon (Canteen x Circle x Arc)
version: 1
copied_from: colosseum-worlds-fair
---
# Tameion Agents Hackathon (Canteen x Circle x Arc) — submission draft

<!-- Deadline 2026-10-17 23:59 ET (Oct 18 06:59 Vilnius; Luma shows 23:30 ET, so submit by Oct 17 22:00 Vilnius). Window 2026-09-27 to 2026-10-17: only in-window progress counts,
and existing projects must show a measurable delta. ShelterSplit's ERC-20 core was written from
2026-09-25, two days before the window: say so. In the window: the native-USDC donate() path, the
x402 agent endpoint, payAndFetch in the SDK, the sponsored-treat flow, receipts and the Heist hook.

Required: public GitHub repo, demo video under 3 minutes. Live link: the page says optional but
strongly encouraged; treat it as required. Test USDC is accepted, mainnet USDC is weighted more.

x402 is on by default, but on a mainnet the cat-card is offered only once publicGivingVerified
passes: every wallet on the split is a rotated claim (Pink Paw's signed per-chain claim). Tameion
closes before the handover, so the agent demo runs on Arc testnet and the body says so; the only
mainnet claims are the split, the EURC instance, the DonateRouters and the proof payouts (On-chain
proof). Re-checked 2026-10-08: production donate/status shows enabled:false on every chain (the treat
wallet key is not set), so no sponsored treat exists yet; cite one only once its hash is known.

Fill (single braces, fund check does not flag them, search for "{"):
{SPLIT_ADDRESS} ShelterSplit on Arc mainnet · {DEMO_URL} demo
video · github.com/zbagdzevicius/tokentails public repo. HEIST_URL https://tokentails.com/heist · PAYOUTS_URL
https://tokentails.com/shelter-payouts. Live API: GET https://api.tokentails.com/shelter/agent/cat-card -->

## Summary <!-- criterion: C1, C4 | limit: 280 -->
A budget-capped agent pays a cat shelter in USDC on Arc and gets something back: it calls /shelter/agent/cat-card, gets a 402 offer, pays ShelterSplit, retries with the tx hash and receives an adoptable-cat card. Every payout is public; we hold the shelter wallet until handover.

## What the agent does <!-- criterion: C1 | limit: 1500 -->
The agent buys one adoptable-cat card from https://api.tokentails.com/shelter/agent/cat-card, and the whole price is split across shelter wallets. The loop is built and tested, and needs no human in it:
1. The agent calls the URL. The server answers 402 with an x402-shaped offer: scheme onchain-receipt, the Arc network, the price, payTo set to the ShelterSplit contract and a one-time memo x402:<nonce>.
2. The agent checks the price against its own spending cap and calls donate(memo) on the contract, paying native USDC.
3. It retries with an X-PAYMENT header carrying the transaction hash and nonce.
4. The server reads the receipt over RPC: status ok, payout events from that contract with that memo summing to the price, a nonce it issued and not expired, a hash never used before. Then it answers 200 with the card.
On Arc mainnet the endpoint opens once Pink Paw holds its own key (its signed claim), so no public payment reaches a wallet we hold. payAndFetch in the open SDK runs this loop and refuses any price above its cap. A second agent decides gifts: Claude weighs the goal, fresh gifts and the day's budget, then gives or holds, with a reason; a CappedSpender contract caps each gift and each UTC day on-chain, so an over-cap proposal reverts (shown on a local Arc testnet fork). It spends Token Tails' own float, not donor money. Demo: {DEMO_URL}.

## How it works <!-- criterion: C1, C3 | limit: 1500 -->
- ShelterSplit on Arc at 0x457c89e10a6e66633eda5bf82fd086febb5db147: a registry of shelter wallets, names and shares in basis points. donate(memo) splits the USDC sent with the call across every active shelter in the same transaction and emits one public event per payout. The contract never holds funds between calls. An ERC-20 path, disburse(), does the same through the USDC token interface, with separate events so the two decimal scales never mix.
- Sponsored treats, the human-facing twin: after a win in Catnip Heist (https://tokentails.com/heist) a signed-in player (anti-abuse: verified email, account older than a day) taps "Send Pink Paw a rescue treat", and a backend wallet with a small float pays a tiny gift, once a day per player, from a capped daily budget. Each payout gets a receipt page and a share card. It switches on in production with the backend's treat wallet.
- The payouts page at https://tokentails.com/shelter-payouts reads chain events, not our database.
- Safety: reentrancy guard, pause, two-step ownership, caps, a Foundry suite with fuzzing, and backend tests for the receipt check and replay protection.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/ in github.com/zbagdzevicius/tokentails).

## Circle tools used <!-- criterion: C3 | limit: 900 -->
- USDC on Arc as both the payment and the gas: the agent needs no second token, and neither does a shelter.
- Arc settlement: the server can accept the payment as soon as the receipt is final, so the agent gets its card in the same session.
- EURC on Arc: the contract takes any token at deploy time; a EURC instance and its DonateRouter are live on Arc mainnet for European shelters.
- x402 and EIP-3009: our standard exact scheme is facilitator-agnostic and pays the shelter's own wallet; next is pointing it at Circle's x402 facilitator (Arc, Base, Polygon PoS). A DonateRouter lets a donor give with one signature. Both stay off on mainnet until handover.
Honest gap: no Circle Wallets, Paymaster, CCTP or Gateway yet. The next step is Circle Wallets for the shelter side, so a shelter can hold its own key without managing a seed phrase, which is also our path to handing over the first wallet.

## Traction <!-- criterion: C2 | limit: 1200 -->
Traction is early, and we will not dress it up. Businesses onboarded: one shelter, Pink Paw, whose wallet Token Tails still holds. Value moved: proof payouts to Pink Paw on Arc mainnet (0.1 USDC and 0.1 EURC) and every payout after them, listed on the payouts page; sponsored treats are next. Agent payments: the endpoint is new in this window and has had no outside agent yet. What exists around it, from before the window: Token Tails is live on web, iOS and Android [F-015] [F-016] with five game modes [F-018] and three payment rails [F-020], so the give flow sits in front of real players. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets [F-003] in November 2025; that activity ended in March 2026 and none of it is Arc data.

## Innovation <!-- criterion: C4 | limit: 900 -->
Most agent-payment demos pay a seller. Here the seller's revenue is the donation: the agent buys a piece of content and the full price lands in shelter wallets, split by a contract, with a public event per payout. The x402 check runs against the chain itself, so it needs no facilitator and works on any EVM chain, including ones no facilitator covers yet. The same contract serves a game player's one-tap gift and an agent's machine payment, and both show up on one public page.

## On-chain proof <!-- criterion: C2 | limit: 800 -->
Arc mainnet: ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147 (USDC) and 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052 (EURC), each with a DonateRouter. The first payout to Pink Paw is proof payout 0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d, listed on the payouts page. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet was created by and is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet; the contract itself holds nothing. Prior work, before the window: three Soroban contracts on Stellar mainnet [F-009], and ShelterSplit's ERC-20 split core, written from 2026-09-25, two days before the window opened. We also entered this work in Arc Microgrants.

## Team <!-- criterion: C1 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product: the app on both stores [F-015] [F-016], an AI pipeline that writes each cat's story and paints its portraits [F-019], and payments on three rails [F-020]. In the window it wrote the native-USDC donate path, the x402 endpoint and its receipt check, payAndFetch and the agent example, the sponsored-treat flow and the receipts.
