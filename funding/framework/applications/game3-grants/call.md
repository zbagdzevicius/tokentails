---
program: "Game3 Grants"
track: B
status: in-review
frame: game-studio
deadline: "rolling"
url: "https://game3.foundation/grants"
next: "Read notes/pre-read.md first: the Game3 Foundation entity appears deleted from the Liechtenstein register (May 2026). Decide park vs submit before any paste."
created: 2026-09-25
website: "https://tokentails.com"
ask: 25000
timeline_months: 6
contact: "hello@tokentails.com"
---
# Game3 Grants — call rules

Track B short form. Grants of $5,000 to $50,000, rolling intake, review "typically takes 4-6
weeks" (https://game3.foundation/grants, read 2026-09-27). "AI-powered game content generation" is
a named funding priority on that page and a category on the form, so the form leads with the
game-studio frame and the AI content engine.

Live form: https://game3.foundation/grants/apply (3 steps, wallet signature required to submit).
Field list: `form.md`. Answers: `answers.md`. Paste sheet: `node bin/fund.mjs b:fill game3-grants`.
Pre-read for the human-read step: `notes/pre-read.md`.

`ask` and `timeline_months` are decisions, not facts: 25000 sits mid-range, and 6 months matches
the three milestones in answers.md (solution). A human confirms both before submitting. `contact`
must be a role mailbox that exists; confirm it receives mail.

## Program status warning

Game3's own imprint (https://game3.foundation/imprint) gives register number FL-0002.688.080-3,
Vaduz. Fundraiso quotes the Liechtenstein commercial register for that number: "Löschung lt.
Beschluss des Fürstlichen Landgerichts vom 03.03.2026 (07 KO.2026.4) infolge Abweisung des
Antrages auf Eröffnung eines Insolvenzverfahrens mangels hinreichenden Vermögens zur Deckung der
Verfahrenskosten", published 2026-05-12
(https://www.fundraiso.com/en/organisations/game3-foundation). Northdata marks the entity as
terminated (https://www.northdata.com/Game3%20Foundation,%20Vaduz/FL-0002.688.080-3). Not yet
confirmed on the official register (oera.li did not load from here).

## Scoring criteria

Published on https://game3.foundation/grants as "Applications are evaluated based on:" (no weights).

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Innovation and originality | not stated | "Innovation and originality" |
| C2 | Technical feasibility | not stated | "Technical feasibility" |
| C3 | Team experience and capabilities | not stated | "Team experience and capabilities" |
| C4 | Market potential and scalability | not stated | "Market potential and scalability" |
| C5 | Alignment with Game3 Foundation's mission | not stated | "Alignment with Game3 Foundation's mission" |
| C6 | Commitment to open-source and community | not stated | "Commitment to open-source and community" |

## Limits

The live form has no character limits (checked in its source, see form.md). form.md carries house
limits to keep answers short.

## Eligibility gates

- A connected EVM wallet (Ethereum mainnet or Polygon) must sign the message "I am submitting a
  grant application to Game3 Foundation for the project "<Project Name>" with the wallet address
  <address>." before the form submits (form source, see form.md).
- Terms agreement checkbox (required).

## Exclusions

not stated
