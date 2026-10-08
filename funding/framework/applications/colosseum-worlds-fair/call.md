---
program: Colosseum Crypto World's Fair
track: A
status: drafting
frame: payout-rail
deadline: "2026-10-12T23:59:00-07:00"
url: "https://colosseum.com/worldsfair"
next: "Mainnet done (Oct 7) and draft v6 true as of Oct 8. Person: fill {TEAM_MEMBERS} {TEAM_LOCATION} in draft.md, record the pitch and demo and set {PITCH_VIDEO_URL} {DEMO_URL} (fill-values.json), register every member, then fund a:submission colosseum-worlds-fair and paste PASTE.md in Arena; tracks Tempo, Arbitrum, Base, Robinhood; Public Goods unticked"
created: 2026-09-25
profile: colosseum-worlds-fair
chain: [tempo, arbitrum, base, robinhood]
mainnet_required: true
repo: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
demo: ""
build_window_start: 2026-09-14
build_window_end: 2026-10-12
---
# Colosseum Crypto World's Fair — call rules

Criteria are the six judging criteria in section 8 of the official rules
(https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf, checked 2026-09-27);
the quote column is the rules text, verbatim. No weights are stated.

Track A fields: `chain` is a key in `tracks/a-build/chains.json` (or a list, any of which counts),
`mainnet_required: true` makes `fund check` demand a recorded mainnet deployment on that chain,
`repo` must be the public repo URL before `ready`. `profile` names `tracks/a-build/programs/<profile>.json`
(submission sections and limits); if that file does not exist the draft sections are used as-is.

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Functionality and code quality | not stated | "Functionality: How well does this Project Submission work? What is the quality of the code?" |
| C2 | Potential impact | not stated | "Potential Impact: How big is the total addressable market for this Project Submission? What will be the impact of this Project Submission on the broader crypto ecosystem?" |
| C3 | Novelty | not stated | "Novelty: How unique is this Project Submission's concept?" |
| C4 | UX via blockchain | not stated | "UX: How well does this Project Submission utilize blockchain to create great UX for downstream users?" |
| C5 | Open-source and composability | not stated | "Open-source: Is this Project Submission open-source? How well does the Project Submission compose with other primitives in the crypto ecosystem?" |
| C6 | Business plan and team execution | not stated | "Business Plan: Is there a viable business that can be built in the future around this Submission? How adept is the team building the product to execute on the vision?" |

## Limits

- Form field limits: not stated in the research summary — verify on the submission form. The draft
  uses self-imposed limits (280 characters for the pitch, 800 to 1500 per section).
- Videos (https://colosseum.com/hackathon FAQ): a pitch video of 2 to 3 minutes and a product demo of no more than 3 minutes.

## Mandatory annexes

- Public code repository with commits inside the build window (2026-09-14 to 2026-10-12).
- Demo video and pitch video (recorded by a human).
- Deployment address on the chain of each track entered: Tempo, Arbitrum One, Base and Robinhood Chain (one submission enters all four tracks, confirmed by the user on 2026-10-03; see notes/chain-decision.md).

## Exclusions

- not stated (research summary). Token Tails policy: no token, TGE or speculation language.

## Eligibility gates

- Work must be built inside the hackathon window (research summary, verify wording on the site).
- Deadline 2026-10-12 23:59 PT.
