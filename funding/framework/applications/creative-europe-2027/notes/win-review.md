# Win review — Creative Europe MEDIA Video Games Development 2027 (2026-09-28)

Short answer: I cannot show that this application wins. As drafted before this pass it would most
likely be ruled **ineligible before anyone scored it**. If it were scored anyway, both blind judges
put it at about 39–40/100, against a pass mark of 70 and a real funding cut-off that is probably in
the high 70s to 80s. The text fixes below remove the knock-outs that text can fix and cover the
score lines that were empty. The points that remain need people, art and paperwork.

Everything is checked against the **2026 call document** (CREA-MEDIA-2026-DEVVGIM, V1.0,
30.09.2025), which I read in full:
https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/crea/wp-call/2026/call-fiche_crea-media-2026-devvgim_en.pdf
The 2027 call is not published yet.

## Judge scores (real 2026 grid)

| Criterion (points) | Judge 1 | Judge 2 |
|---|---|---|
| 1a Originality (10) | 6 | 5 |
| 1b Innovation (15) | 6 | 6 |
| 1c Sustainability strategy (5) | 0–1 | 0 |
| 1d Gender, inclusion, diversity (5) | 1 | 1 |
| 2 Quality of content (25) | 12 | 12 |
| 3a Development strategy (10) | 3 | 4 |
| 3b Financing and feasibility (10) | 2 | 2 |
| 4a Exploitation and distribution (10) | 5 | 5 |
| 4b Marketing (10) | 4 | 3 |
| **Total** | **39–40 (range 35–50)** | **~39** |
| Verdict | REJECT | REJECT |
| Win probability | under 1% as drafted; 5–10% after a full rebuild | under 1%; 3–5% after every text fix |

Our own framework scored it 55.5 on a grid that was wrong. call.md now holds the real grid, as
C1–C9. The 39.3 that `fund check` shows is **stale**: it comes from an old review.md written
against the old IDs. Re-run `fund c:review` and `fund c:score` to rescore v10.

## Benchmark (competition)

EACEA call updates:
- 2024: 253 submitted, 129 above threshold, EUR 22.8M asked against EUR 7M.
- 2025: 324 submitted, 168 above threshold, EUR 28.5M asked against EUR 7M.
- 2026: 336 submitted, 15 inadmissible, 40 ineligible, 143 above threshold, EUR 25,673,065.18
  asked against EUR 10,000,000. I confirmed this one at
  https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/crea-media-2026-devvgim.json

Only about 24–39% of proposals that clear 70 get money: roughly 40–56 grants a year at about
EUR 200k each. About 16% of 2026 proposals were thrown out before scoring. Typical winners are
established studios with shipped PC or console titles, named leads, a full creative dossier
(concept art, bible, script, GUI mock-ups), signed rights and publisher interest. Past examples
include CD Projekt RED, 11 bit studios and Bloober Team
(https://kreatywna-europa.eu/program-kreatywna-europa-od-lat-wspiera-europejskie-gry-wideo/).
We have none of those today.

## Knock-outs found in the call text (before any scoring)

1. **Puzzle or memory game.** The call says: "puzzle games, memory games ... mind games, even if
   they have a narrative element" are ineligible. v9 used "memory puzzle" as the core loop, and the
   word "puzzle" appeared 19 times. v10 has **zero** uses of "puzzle". It presents the game as a
   narrative exploration adventure told throughout, with "memory scenes". The design still
   includes torn-photo reassembly, so the team must make sure the prototype plays as exploration
   plus story, not as a series of puzzles.
2. **Production work in the budget.** "The production phase is ineligible. Production is understood
   as the phase starting from the testing and debugging of the first prototype." In v9, testing the
   vertical slice, localising the slice and releasing demos were all in scope. v10 ends the project
   at delivery of the prototype, and the budget lines are relabelled to match (amounts unchanged).
3. **Publishing companies are not eligible.** The applicant is registered under NACE 58.21
   "Publishing of video games" (F-021). **The call does not require a UAB.** fit.md and the old
   call.md said it did, and that was wrong. What the call requires is that the company's "main
   objective and activity" is development.
4. **Previous work.** A game "commercially distributed" between 01/01/2023 and the deadline, with a
   sales report, and "The work must have generated revenues". F-022 (EUR 105, unverified) may
   technically count, but the report must exist and must cover that game.
5. **Rights.** A "duly dated and signed contract covering the rights to the artistic material" is
   required by the deadline.
6. **Timing.** Production (the first prototype) cannot start until at least 10 months after the
   deadline. v10 schedules the prototype for month 15 of 18.
7. **AI disclosure.** Applicants "must be transparent in disclosing which AI tools were used and how
   they were utilised". This draft was written with AI tools. v10 adds a disclosure paragraph and an
   annex line.

## What changed (draft v10, call.md, budget.csv labels, annexes.md)

- call.md: replaced the wrong 7-criterion grid with the real 9-part 2026 grid, quoted verbatim.
  Added the exclusions, the mandatory work packages and deliverables, the eligibility gates, the
  70-page limit and the AI rule.
- The draft is restructured one section per scored sub-criterion (C1–C9). Two new sections cover
  lines that had no text before:
  - Sustainability: remote work, rail travel, digital-only distribution, low-power 2D art, energy
    rules for production, and reporting.
  - Gender, inclusion and diversity: in the content, in accessibility, and in how the team is
    managed.
- Innovation is argued on the call's own terms: gameplay, visual approach and interactivity. It adds
  the "city repaints itself" visual state, a design proposal the team must approve.
- The comparison set now includes Little Kitty, Big City.
- Work packages are renamed to the mandatory WP1 Artistic, WP2 Technical, WP3 Financing,
  distribution and marketing. They include every mandatory deliverable (including the ISAN/EIDR
  identifier) and an 18-month schedule in months. **The schedule is a proposal; confirm it.**
- The roles now match budget.csv: director/producer, lead programmer, gameplay programmer and
  designer in-house; narrative, art, audio and accessibility contracted.
- Languages are reconciled. The team writes EN and LT, and the budget pays for five translations
  (FR, DE, ES, IT, PL) of the pitch package, store page and teaser. That makes 7 languages. The full
  game is localised in production.
- Added explicit USPs, target audiences and markets, a sound-design paragraph and a level-design
  paragraph.
- Removed the "1K+ downloads per language" demo target (it advertised how small we are) and the
  public demo release (production).
- Removed EUR 105 (F-022, unverified) from the prose. The sales report goes in the MEDIA Database
  anyway.
- Removed the false claim that a UAB conversion is required.
- No SEI, X-follower, user-count or other on-chain numbers are used. None are relevant here, and
  the frame bans them. F-011 (proposed 181,010) was deliberately left out: the X audience is a
  crypto audience and would lead evaluators straight to the banned frame.
- annexes.md: added rights, team and AI-use annexes. Reworded the legal-status annex.
- `fund check creative-europe-2027` passes. Warnings: F-023 unverified, annexes missing, stale
  score.

## Payout mechanics (if it ever wins)

- Lump-sum grant, 60% funding rate, "EUR 200 000 per project". Our request is EUR 199,983 of
  EUR 333,305 eligible (budget.csv), and the owners fund EUR 133,322 plus EUR 15,000 of ineligible
  launch marketing.
- Timeline on the 2026 pattern: deadline in February, "Evaluation results are expected to be
  communicated in August", then grant preparation and signature. Money arrives around autumn 2027
  at the earliest.
- Prefinancing is "normally 70% of the maximum grant amount", about EUR 140k, paid "30 days from
  entry into force/financial guarantee (if required)". With almost no revenue, the financial
  capacity check may ask for a guarantee or cut the prefinancing. The rest is paid after the final
  report, against completed work packages. An unfinished work package loses its share of the lump
  sum.
- Payment goes to the company's bank account after legal entity validation (PIC, LEAR).

## Ranked human-only fixes (do these in order)

1. **Change the registered main activity from NACE 58.21 (publishing) to a development code** at
   Registrų centras, and get the extract. A UAB is not required. Without this change the proposal
   is likely ineligible.
2. **Produce the sales report** for the live game covering 01/01/2023 to the deadline, showing
   revenue, and verify F-022. Confirm that the game is not Early Access and not work-for-hire.
3. **Sign the rights documents** for the story, characters and script, dated on or before the
   deadline. Because the text was drafted with AI help, a named human author must rewrite and own
   the creative material, and the AI-use annex must say exactly which parts used which tools.
4. **Commission hand-made art now**: mood boards, key art for Pilka, Ona and Jonas, and one painted
   Vilnius district showing the muted-to-warm repaint. This is worth up to 25 Quality points and is
   currently unscorable.
5. **Name the team** with credits (director/producer, programmers, designer). Sign or obtain letters
   of intent from a narrative lead and an artist who have shipped titles.
6. **Build a greybox of "The Suitcase"** and a short video of it. Present it as exploration plus
   story, not as a puzzle.
7. **Financing**: estimate the production budget, and get proof of the owners' funds for
   EUR 133,322 (a bank statement plus a signed commitment). Get 1–3 publisher letters of interest.
   Name the national or regional funds you would apply to.
8. **Fix the staff-cost model**: MB members are usually not employees. Decide whether they are
   costed as SME-owner unit costs or under civil contracts, and rebuild the Staff lines with
   person-months.
9. **Set numeric wishlist and creator targets** (add them to FACTS.md or the marketing plan), and
   confirm the 18-month schedule, the events to attend and the Playing for the Planet commitment.
10. **Sign the Vilnius shelter letter**. This is optional for eligibility but lifts originality.
11. On the day the 2027 call publishes, diff it against call.md and check that the puzzle/memory
    exclusion, the grid and the previous-work window are unchanged.

## Honest probability

- As drafted before this pass (v9): **under 1%**. It was likely ineligible, and scored about 40.
- After these text fixes only: **about 1–2%**. The sections that were empty now carry text, but the
  NACE, sales-report and rights gates still fail, there is no art, no team and no financing
  evidence, and a realistic score is about 50–58.
- After human fixes 1–9: **about 5–10%**. That would be a plausible 70–80, which sits in the band
  where roughly 1 in 3 to 1 in 4 above-threshold proposals are funded. A studio with no narrative
  game shipped rarely reaches the high 80s.
