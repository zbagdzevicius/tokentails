# Reviews — Nouns DAO proposal

Hostile-review rounds are appended here by `fund prompt review nouns-dao --run`. Keep every round;
record the real panel's feedback here after a decision.

## Review — 2026-09-27T19:04:35.942Z

### Panel review: Nounish Cats (Nouns DAO proposal)

**Verdict: REJECT.** This draft can't be sponsored or voted on as written. It never states how much ETH it wants, even though the TL;DR says "the full ask is in the budget table below" and no table exists.

### 1. Scores

Nouns doesn't publish a scoring scale, so this uses a 0–5 scale of my own: 0 means missing, 5 means strong.

| Criterion | Score | Reason |
|---|---|---|
| C1 What the project is | 3/5 | The concept is clear and the live apps are verified (F-015–F-017). But it never says how many characters there will be, whether they are NFTs, or who is on the team. |
| C2 Proliferation of Nouns | 2/5 | "Noggles in front of that audience every day" comes with no audience number. There is no route from a player back to Nouns, and no attribution plan. |
| C3 Funding needed | 0/5 | No amount appears anywhere. The TL;DR points to a table that doesn't exist. |
| C4 Cost breakdown | 0/5 | The budget section describes how funds would be released but gives no line items, rates or ETH per milestone. |
| C5 Success metrics and milestones | 1/5 | There are no dates or timeline, even though the guidance asks for them. There are no numeric targets: no count of characters, shelters, purchases or USDC paid out. "Success" just means the milestones happened. |

### 2. Unsupported or inflated claims

- **"The full ask is in the budget table below and is paid out per milestone."** There is no table, so this is false as written.
- **"Our production Stellar contract has processed 1,218,693 invocations… so the game itself is running."** The number is verified (F-007). But contract calls aren't users or revenue, and this is the only traction number in the draft. A panelist who checks stellar.expert will also see the Blessing and Pass contracts at 3 and 5 calls (F-008). Those are the closest thing the game has to a "pay a cause" mechanic, and they are barely used.
- **"When a player buys a nounish cat, ShelterSplit pays the shelter that cares for it."** The Specification says payouts are batched per "payout cycle", so this isn't per purchase. It also never says what share of each purchase goes to the shelter.
- **"Purchases already run through Stripe, app-store payments and Stellar [F-020]."** The payment rails exist, but there is no evidence that anyone buys. The entity's filed FY2025 revenue is €105 (F-022, unverified). The Nouns DAO panel can look that up in the public registry, and it would undercut both the demand story and "demand risk" being treated as minor.
- **"Based on real shelter cats" and "registered shelter wallets."** No shelters are named and there are no letters of intent.
- **"An automated review and an independent human review."** No auditor, cost or scope is given.
- **"Never holds more than one payout cycle."** A cycle is never defined.
- **"Rescue cats in noggles are a nounish meme."** This is asserted, not shown.
- **The money flow doesn't work.** Payments come in through Stripe, app stores and Stellar, and production runs on Stellar (F-025). ShelterSplit takes USDC on Ethereum mainnet. The draft never explains who converts fiat or Stellar USDC into Ethereum USDC, who holds it in between, or who pays mainnet gas for each payout event. An expert reviewer will stop at this point.

### 3. Token promotion, speculation or gambling

- Nothing in the draft is openly promotional. There's no token, no yield and no price talk, and the SEI-era numbers are left out.
- **NFT ambiguity.** The production game mints Soroban NFTs into custodial wallets (F-025), and the draft doesn't say whether a "nounish cat" is one. If it is, the DAO would be paying to create NFT inventory that the company sells.
- **Commercial capture.** The DAO pays for the art and the contract, and the company sells the characters. With no shelter percentage stated, this reads as the treasury subsidising a for-profit product with a charity wrapper.
- **App-store risk.** Tying in-app purchases to charitable payouts can run into Apple's rules on donations. This isn't listed as a risk, and it threatens milestone M2.

### 4. Missing annexes and evidence

The call requires no annexes, but a Nouns proposal is expected to include the following, and this one doesn't:

- **The money itself:**
  - A total ETH ask. It has to fit within our own 1–25 ETH cap.
  - A breakdown per milestone.
  - The USD equivalent at the planning rate.
- **A timeline**, with dates or weeks for M1–M4.
- **Visuals:** sample art or a mock-up of a noggled cat. For an art proposal to Nouns, this is the most persuasive single thing you could add.
- **Shelter commitments:** named shelters, letters of intent, and how their wallets get set up.
- **Contract details:**
  - A ShelterSplit spec or repository.
  - The chain choice and why.
  - The reviewer's name.
- **Team:** real names or handles, and any history in the Nouns ecosystem.
- **Reach data:** a verified audience figure. The registered-users number (F-001) is still unverified, and the verified Android figure is only 1K+ downloads (F-016).
- **Sponsorship:** a named sponsor or a Nouncil contact, plus a forum thread. `forum_url` is empty.

### 5. The three changes that would raise the score most

1. **State the number and break it down.**
   - Put the total ETH ask, with its USD value at `eth_usd`, in the first line of the TL;DR.
   - Add the missing table: one row per milestone, costed per item (for example N characters × rate, client integration, the contract plus a named reviewer, and reporting).
   - This takes C3 and C4 from 0 to at least 3.
2. **Make the shelter payout concrete and credible.**
   - Commit to a fixed percentage of each nounish-cat sale going to shelters.
   - Name two or three shelters that have signed letters of intent.
   - Explain the full path from fiat or Stellar payment to the onchain payout. Alternatively, put ShelterSplit on Stellar, where the stack already runs, or on a cheap L2 instead of mainnet.
   - Say plainly whether the cats are NFTs and who keeps the revenue that doesn't go to shelters.
3. **Add a timeline and targets you can check.**
   - Dates for each milestone.
   - A character count.
   - A verified reach figure for how many players will see noggles each month. Verify F-001 first.
   - Targets for purchases, USDC paid to shelters, and the number of active shelters by M4.
   - Attach art samples, so C2 and C5 rest on evidence rather than intent.

### 6. Verdict

**REJECT.** The concept is reasonable and the delivery evidence (the live apps and deployed contracts) is real. But the draft has no ask, no breakdown and no timeline, which are three of the five things the guidance explicitly lists. Its core mechanic, paying shelters on Ethereum from purchases made on Stripe, app stores and Stellar, isn't explained. With the three fixes above it could plausibly reach BORDERLINE.

## Review — 2026-09-27T19:08:20.867Z

### Nouns DAO panel review: Nounish Cats (v2)

Nouns publishes no scoring scale, so I scored each criterion from 1 to 5 myself (5 = strong).

### 1. Scores

| Criterion | Score | Reason |
|---|---|---|
| C1 What the project is | 3/5 | The TL;DR is clear and can be checked. But no art exists yet, the team is anonymous, and ten characters "in noggles" is the only part that is actually Nouns. |
| C2 Proliferation of Nouns | 2/5 | The Nouns reach depends on a user base built on unverified numbers (542k users, 186k followers). The cats live as custodial Stellar NFTs, so they never reach the Nouns ecosystem. |
| C3 Funding needed | 4/5 | 11.5 ETH (about $29k) is modest, justified, and split into tranches. |
| C4 Cost breakdown | 2/5 | There are four lump sums and no hours, rates, people or quotes. 4 ETH to write and audit a new splitter is hard to defend when 0xSplits exists. 3 ETH to put your own asset into your own commercial app is the DAO paying for the company's roadmap. |
| C5 Success metrics and milestones | 2/5 | Only outputs are tracked, with no targets: no sales goal, no USDC goal, no shelter count, no player reach. M4 can be "met" with zero shelters. Nothing says who approves a tranche or how. |

### 2. Unsupported or inflated claims

- **"542,000 registered users [F-001]"**: marked unverified, and it sits next to "1K+ downloads [F-016]" and "FY2025 sales of €105 [F-022]". A panel will read that gap as inflation.
- **"our 186,000 X followers [F-011]"**: unverified. Engagement on that account will be checked.
- **"drawn by hand and finished through our existing art pipeline [F-019]"**: F-019 describes an AI pipeline in which Gemini paints the avatars. A citation that contradicts "drawn by hand" is the most dangerous line in the draft. The Nouns community is sensitive about AI art, and "CC0" is weak for AI-generated work.
- **"Delivery can be checked at every step … payouts onchain"** and **"anyone can verify them"**: only the payout can be checked. Whether it equals "all net revenue from nounish-cat sales" depends on offchain Stripe, in-app purchase and Stellar books. Trust is required.
- **"the contract never holds more than that month's balance"**: this is an operating promise, not something the contract enforces.
- **"The same team already runs contracts on Stellar mainnet [F-009]"**: this is offered as proof of Solidity ability, but those are Soroban/Rust contracts. F-010 (SKALE ERC-721) is the relevant EVM experience and only says "deployed".
- **"Nouns funds public goods that carry its brand"**: asserted without support. Given treasury-preservation mode, it is arguable.
- **"Team members' handles are listed in the forum thread"**: no thread exists (`forum_url` is empty).
- **"We will publish a verified monthly-active figure"**: this is a promise in place of evidence the applicant should already have.

### 3. Token promotion, speculation or gambling

- There are no token, price or speculation claims. That is good.
- **Paid NFT characters:** the product is paid characters recorded as Soroban NFTs in custodial Stellar wallets, sold partly for XLM and USDC. Some delegates will see this as Nouns treasury money promoting Stellar NFT sales. Players also don't truly hold the assets, which undercuts the ownership story.
- **Undefined contracts:** the "Blessing" and "Pass" contracts are named but not explained. If either is a paid chance mechanic or boost, reviewers will ask. Say what they do, or drop the mention.
- **Company motive:** "Its return is engagement and retention in the wider game" is honest. It also confirms the grant subsidises a commercial funnel.

### 4. Missing annexes and evidence

Nouns requires no annexes. The following are still expected in practice:

- **Art:** no sample art. It is promised "before posting", but the reviewer has none now.
- **Shelters:** none are named, and no letter of intent is attached. The number of shelters is unknown and could be zero.
- **Team:** no named team, no Nouns history, and no Noun held.
- **Sponsor:** none identified, although sponsorship is the eligibility gate.
- **Tranche release:** no mechanism is given. Nouns does not natively escrow by milestone, so name a Stream, an escrow multisig with named signers, or a sequence of proposals.
- **Security review:** no reviewer is named and there is no quote. There is no ShelterSplit spec, and no reason given for not using 0xSplits.
- **Unit economics:** at €105 of annual revenue, monthly mainnet gas plus the Stellar-to-Ethereum USDC conversion could cost more than the payouts. There is no estimate of revenue per character or of shelter income.
- **App stores:** the policy risk is left open. If iOS and Android sell "without payout wording", does that revenue still go to shelters? Say so either way.

### 5. The three changes that would raise the score most

1. **Remove the custom contract and re-cost.** Use 0xSplits, or pay shelters directly and publish receipts. That drops M3's 4 ETH, and the ask falls to about 6–7 ETH. Itemise every line as hours × rate plus named quotes, and name the tranche mechanism and its signers. This lifts C3 and C4.
2. **Give Nouns reach beyond your own app.** Publish the art as Nouns-compatible trait files, and get it into existing Nouns venues (Nouns builders, props, Nouncil). Replace F-001 and F-011 with one verified current metric, such as monthly active users or a store dashboard screenshot. Set numeric targets: players who see a Nouns credit, cats sold, USDC paid, and shelters paid by M4. This lifts C2 and C5.
3. **Post the evidence before asking.** That means sample art with a truthful statement of how it was made (fix the hand-drawn vs AI contradiction), 2–3 named shelters with signed letters of intent, named team members with handles, and a committed sponsor. This lifts C1 and clears the gate.

### 6. Verdict: **REJECT** (as written)

The ask is modest and the risks section is unusually honest. But the Nouns value is thin: ten CC0 characters inside a Stellar game with verified traction of 1K+ Android downloads and €105 in revenue. 35% of the budget goes to reinventing a splitter that already exists, and no outcome has a target. With the three changes above, this could become a credible **BORDERLINE** at about 6–7 ETH.
