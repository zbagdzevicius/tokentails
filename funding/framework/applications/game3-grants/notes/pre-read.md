# Pre-read — Game3 Grants (for the human-read step)

Prepared 2026-09-27 so the read takes about 5 minutes. Nothing was submitted, signed or marked done.
Sources are quoted in `../source.md`. The paste sheet is `../fill.md`: 16/16 fields ready, and
`fund check game3-grants` passes 16/16.

## 1. Read this first: Game3 may no longer exist as a funder

| Signal | What it says | Source |
|---|---|---|
| Legal entity | Game3's own imprint gives Game3 Foundation, Vaduz, register no. FL-0002.688.080-3 | https://game3.foundation/imprint |
| Register deletion | For that same number: "Löschung lt. Beschluss des Fürstlichen Landgerichts vom 03.03.2026 (07 KO.2026.4) infolge Abweisung des Antrages auf Eröffnung eines Insolvenzverfahrens mangels hinreichenden Vermögens zur Deckung der Verfahrenskosten". In English: deleted by court order after the insolvency petition was rejected because the foundation lacked the assets to pay for the proceedings. Published 2026-05-12 | https://www.fundraiso.com/en/organisations/game3-foundation |
| Second source | Northdata marks the entity as terminated: a board member left on 2025-10-30 and a notice was published on 2026-05-13 | https://www.northdata.com/Game3%20Foundation,%20Vaduz/FL-0002.688.080-3 |
| Website activity | Grant form added 2025-03-17. The last content commit was 2025-03-25; the only later commit is a Vercel bot CVE fix on 2025-12-19. Footer reads "© 2025" | https://github.com/game3foundation/website/commits/main |
| Page status | The grants page still says rolling intake and $5,000–$50,000. It shows no "closed" notice, but it also has no date and names no past grantees | https://game3.foundation/grants |
| Submission path | The form's API emails the application and does not store it. The code comments "Here you would typically store the application in a database" | https://raw.githubusercontent.com/game3foundation/website/main/src/app/api/submit-grant-application/route.ts |
| Community | The Discord invite on the page opens the "GameDAO.co" server: about 700 members, 31 online on 2026-09-27 | https://discord.gg/h2VMgWY |

**Verdict:** the page is live, but the funder does not look funded. A foundation deleted after an
insolvency petition was refused for lack of assets cannot pay grants. The official register at
https://www.oera.li did not load from here (TLS error), so confirm the deletion there, or ask on the
GameDAO Discord, before spending time.

**Recommendation:** do not submit. Park the app and record why:
`node bin/fund.mjs status game3-grants parked` (your decision; not run). If you still want to
submit (the cost is about 13 minutes plus a wallet signature), read sections 2–4 first.

## 2. Field-by-field: live form vs. our answer

The live form has 3 steps and **no character limits** on any field (none in its source). The limits
below are our own house limits. Every field changed compared with the old form.md: the old table
of 12 guessed fields did not match the real form.

| # | Live form field (step) | Req. | Our answer (summary) | Limit | OK / fix |
|---|---|---|---|---|---|
| 1 | Full Name (1) | yes | — you type it (personal data, not stored) | none | fill at paste |
| 2 | Email (1) | yes | hello@tokentails.com (role mailbox, fm:contact) | none | OK, but confirm it receives mail |
| 3 | Organization/Project Name (1) | no | Token Tails, MB [F-021] | none | OK |
| 4 | Your Role (1) | yes | — you type it | none | fill at paste |
| 5 | Location (1) | no | Lithuania [F-021] | none | OK |
| 6 | Website (if any) (1) | no | https://tokentails.com | none | OK |
| 7 | Twitter/X Handle (1) | no | — empty; FACTS.md has no verified handle | none | optional: add the project account |
| 8 | Project Name (2) | yes | Token Tails | none | OK |
| 9 | Project Description (2) | yes | Cat-rescue game, AI story and art per real shelter cat, live on 3 platforms, 5 modes; the grant turns the pipeline into a content engine | 656/1000 house | OK |
| 10 | Problem Statement (2) | yes | Shelter cats go unseen; a small studio can't hand-make enough content; characters are AI-made, levels and events are not | 355/600 house | OK |
| 11 | Your Solution (2) | yes | The current pipeline plus M1 AI match-3 levels (months 1–2), M2 weekly story events (months 3–4), M3 shelters add their own cats (months 5–6) | 710/1200 house | OK (the old milestones field was folded in here) |
| 12 | Target Audience (2) | no | Casual mobile and web players who like cats; shelters | 128/300 house | OK |
| 13 | Project Category (2, radio) | yes | AI-Powered Game Content Generation (options copied verbatim) | 6 options | OK. The old options (Gaming/AI/…) were wrong |
| 14 | Requested Funding Amount (USD) (2) | yes | 25000 (fm:ask) | must be > 0 | **decision**: confirm |
| 15 | Estimated Timeline (months) (2) | yes | 6 (fm:timeline_months, new) | must be > 0 | **decision**: confirm it matches M1–M3 |
| 16 | Relevant Experience (3) | yes | MB registered 2024; shipped 3 platforms and 5 modes; AI pipeline; 3 Stellar mainnet contracts, 1,218,693 Cat invocations; SKALE ERC-721 earlier; Stripe/IAP/XLM/USDC | 585/1000 house | OK |
| 17 | Why Web3 Gaming? (3) | yes | Cats are on-chain assets in a custodial Stellar wallet per player; real contract use; public link from character to shelter cat; XLM/USDC rails | 609/900 house | OK, see pushback 4a |
| 18 | Success Metrics (3) | yes | Levels shipped per month, generated vs hand-made completion and replay, event players, shelters onboarded; public changelog. No numeric targets | 409/700 house | see pushback 4c |
| 19 | Anticipated Challenges (3) | no | Human review and solvability play-tests; consistent art per cat; start with a small group of shelters | 435/700 house | OK, see claim 3 |
| 20 | Open-source checkbox (3) | no | — left unticked; your decision | — | **decision**: tick only if true (criterion C6) |
| 21 | Wallet Address (3) | yes | — you connect your own EVM wallet (Ethereum mainnet or Polygon) and **sign** the submit message | — | your action; the framework never signs |
| 22 | Terms agreement (3) | yes | — you tick it | — | your action |

Removed from the old form.md because the live form does not have them: One-line summary, "How does
the project use AI for game content?", "What have you shipped?", Team, Traction, Milestones,
Category (Gaming/AI/Infrastructure/Tooling/Other). Their content moved into Description, Solution
and Relevant Experience.

## 3. Claims resting on unverified facts or on plans, not facts

- **No unverified or SEI-era fact is cited.** The answers cite only verified facts: F-007, F-009,
  F-010, F-015, F-016, F-018, F-019, F-020, F-021, F-025. The strict gates at `ready` will
  not refuse on facts.
- `fund verify --offline` warns that F-010 (SKALE Nebula ERC-721, dated 2024) is older than 90
  days. Proposed fact change, not applied because FACTS.md is shared: re-check the SKALE contracts
  and update F-010's date. The other option is to drop the SKALE sentence from Relevant Experience.
- Unverified facts that were deliberately left out, though a reviewer may ask about them: F-001 (542,000
  registered users), F-011 (186,000 X followers), F-024 (800+ strays saved), F-022 (FY2025 revenue
  of €105).
- Plans and commitments that no fact backs. Confirm you will stand behind each:
  - "generated levels are play-tested for solvability before they ship" (challenges)
  - "human review before release" of every generated level and story (solution, challenges)
  - "a public changelog of every content release" (solution, metrics)
  - "weekly" AI story events (M2), and shelters adding their own cats with "a simple upload flow" (M3)
  - "The grant work keeps every generated level and story tied to its on-chain cat" (why_web3)
- "Shelter cats wait for homes because few people ever see them" (problem) is an argument, not a
  fact, and it has no citation. Soften it or keep it as framing.

## 4. What a reviewer would push back on

a. **The chain does not match.** Submitting requires an Ethereum mainnet or Polygon wallet. Our
   production chain is Stellar [F-025], and our only EVM history is SKALE Nebula [F-010]. A
   Game3/GameDAO reviewer may see nothing on their stack.
b. **The wallets are custodial.** "Why Web3" says each player gets a custodial Stellar wallet
   [F-025]. Web3 purists will ask what the player really owns.
c. **Success metrics have no targets.** There are no numbers, because none are facts yet. A reviewer
   judging "Market potential and scalability" (C4) will want baselines such as MAU or retention.
   Add targets as decisions, or verify F-001 first.
d. **Open-source commitment is weak (C6).** Only the public changelog and partner shelters speak to
   it. If any part (the level generator, the ShelterSplit contract) can be open-sourced, say so and
   tick the checkbox.
e. **Revenue.** F-022 (€105 FY2025 revenue, unverified) is public in the register. A $25k ask from
   an entity with almost no revenue needs the 6-month plan to carry it.
f. **Team size and names.** "Relevant Experience" describes the entity, not the people. Reviewers
   usually want named roles. Add them at paste time if you are comfortable doing so; do not add
   them to these files.

## 5. What changed in this pass

- `form.md`: rebuilt from the live form's source. It now has 16 stored fields with verbatim labels,
  the real category options, required flags, house limits, and criteria mapped. Personal and
  wallet fields are listed for you to fill at paste time.
- `answers.md`: new problem, solution, audience, experience, why_web3, metrics and challenges
  answers, all cited to verified facts. The old ids were removed.
- `call.md`: added `timeline_months: 6` (a decision), the 6 published criteria C1–C6, the program
  status warning, the form URL and the wallet-signature gate. `next:` points here.
- `source.md`: the grants page, form mechanics and entity-status evidence, with URLs.
- `fill.md` and `draft.md`: regenerated by `b:fill`.
- `human-read` is **not** marked done.
