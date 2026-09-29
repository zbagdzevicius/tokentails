---
program: Nouns DAO proposal
version: 3
---
# Nounish Cats — application draft

## TL;DR <!-- criterion: C1, C3 | limit: 700 -->
We ask for 13000 USDC, paid as a 16-week Nouns stream that stops if we stop delivering. For it, Nouns gets ten CC0 rescue-cat characters in noggles, based on real shelter cats. They ship as open source files and as playable cats in our live apps on web, iOS and Android [F-015] [F-016]. All net revenue from their sales goes to the shelters that cared for those cats, through a public 0xSplits split on Ethereum. No new contract, no token.

## Motivation <!-- criterion: C2 | limit: 1500 -->
Nouns spreads when noggles turn up where people already spend time. Token Tails players open the app to look after cats, not to learn about crypto. Our Stellar Cat contract has recorded 1,218,693 invocations since January 2025 [F-007]. The Android listing shows 1K+ downloads [F-016], and the company reports 540K+ registered players over the product's lifetime, including accounts from a channel we have since retired [F-001]; we will post a dated export of that count in the forum thread.

Every nounish cat carries a visible "Nouns · CC0" credit and a link to nouns.wtf on its character card. Every monthly payout is a public Ethereum transaction that Nouns can point to. We will announce each milestone on our X account, which has 181,010 followers [F-011], tagging Nouns. All new art is CC0 and published as plain files, so any Nouns builder can reuse the cats without asking.

## Specification <!-- criterion: C1, C2 | limit: 3000 -->
**Characters.** Ten nounish cat characters, each based on a real shelter cat. Our current art pipeline uses AI image generation [F-019], and we say so up front. Before this goes onchain we will post sample art in the forum thread with a note on exactly which steps are AI-assisted and which are done by hand. The final files ship as SVG and PNG under CC0. In the game, each nounish cat is recorded like every other Token Tails cat: as a Soroban NFT in the player's custodial Stellar wallet [F-025]. The DAO pays nothing toward those records, and the CC0 files stay usable by anyone, whatever happens to the game.

**Money flow.** Players buy through Stripe, in-app purchases, or XLM and USDC on Stellar [F-020]. Token Tails, MB takes in that revenue [F-021]. Once a month it converts the net revenue from nounish-cat sales (after payment and app-store fees) into USDC on Ethereum and sends it to the split. The company pays the gas and keeps none of the nounish-cat revenue. Its return is engagement in the wider game. The totals come from our own books, so each monthly report lists the sales behind the payout.

**Payout split.** We do not build a contract. We use 0xSplits, the audited splitter already deployed on Ethereum mainnet, with one split whose recipients are the participating shelters' own wallets. Anyone can see the split, its shares and every distribution on a block explorer.

**Shelters.** Each character is tied to the shelter that cared for the real cat. A shelter joins the split only after it has signed a letter of intent and controls its own wallet. We help set the wallet up, but we never hold its keys. The shelters will be named in the forum thread before this goes onchain.

## Budget <!-- criterion: C3, C4 | limit: 1200 -->
The ask is in USDC and is paid through the Nouns stream factory over sixteen weeks from execution. The DAO (by vote) or we can cancel the stream at any time; on cancel, unstreamed funds go back to the treasury. If a milestone is more than four weeks late, we will cancel it ourselves.

The table below breaks the ask into its three lines. There is no contract-development line: the split uses existing, audited infrastructure. The integration line pays for work in our own clients, so we kept it below the art line.

The treasury has little auction income right now, so every ask is judged on value per dollar. We would rather prove delivery on a small, capped ask than ask for more.

## Milestones & deliverables <!-- criterion: C5 | limit: 1800 -->
Weeks are counted from when the proposal executes.
- Week 6: ten characters published as CC0 source files in a public repository, with the process note.
- Week 10: the characters are playable and purchasable in all four clients, each card with a Nouns credit.
- Week 12: the 0xSplits split is created with every shelter that has signed a letter of intent, and its address is posted on the forum.
- Week 16: the first monthly distribution, with a public report linking the transaction.

Targets we report against, every month for six months after week 16:
- nounish-cat purchases and USDC distributed, with the transaction link;
- players who opened a nounish cat card (the Nouns credit shown);
- the number of shelters paid; the target is every shelter named in the thread.

We will not claim a sales target we cannot support: demand for paid characters is unproven (see Risks).

## Team <!-- criterion: C1 | limit: 800 -->
Token Tails, MB is a small partnership registered in Lithuania in October 2024 [F-021]. It built and runs the game, its apps and its contracts. It has shipped contracts on Stellar mainnet [F-009] and ERC-721 contracts on SKALE [F-010]. The Blockchain for Good Alliance named Token Tails its top 2025 incubation project [F-014]. The team members' names and handles will be posted in the forum thread before this goes onchain.

## Risks <!-- criterion: C5 | limit: 1500 -->
**Demand.** Demand for paid characters is not proven yet. The applicant entity filed FY2025 sales of €105 [F-022], and our Blessing and Pass contracts have seen 3 and 5 invocations [F-008]. Early payouts may be small. That is why the stream pays for delivered work, not sales, and why the CC0 art stays useful to Nouns however many cats sell.

**App stores.** Apple and Google limit charitable payments inside apps. If app review objects, the iOS and Android builds will sell the cats without payout wording; the monthly report will say which sales reached the split.

**Trust.** The split is onchain, but the sales figure behind each payout comes from our books. Each report lists those sales so they can be checked against the transaction.

**Shelters.** A shelter may leave. If one does, we update the split, redirect its share to the other shelters, and report the change publicly.

## Why this DAO <!-- criterion: C2 | limit: 1000 -->
Nouns has funded animal rescue under noggles before (Prop 462, Nouns Winter Shelter). This is a smaller, software-only version: CC0 cats in noggles, a Nouns credit on every card, and a monthly public payout to named shelters. Each payout is a reason to talk about Nouns, made by people who came for the cats. We would rather prove this at a small scale, in the open, than ask for more.
