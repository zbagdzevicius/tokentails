---
program: Arc Microgrants
track: A
status: researching
frame: payout-rail
deadline: "2026-10-14T23:59:00-04:00"
url: "https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq"
next: "Run the mainnet wave for Arc MAINNET (testnet-only builds are excluded): fund a:mainnet-plan --network mainnet, then a person runs CONFIRM_MAINNET=yes wave/mainnet-all.sh, which deploys and records the USDC and EURC splits and routers (fund a:ingest); then fund a:submission arc-microgrants"
created: 2026-09-27
profile: arc-microgrants
chain: arc
mainnet_required: true
repo: "https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split"
demo: ""
build_window_start: ""
build_window_end: ""
---
# Arc Microgrants — call rules

Track A fields: `chain` is a key in `tracks/a-build/chains.json` (or a list, any of which counts),
`mainnet_required: true` makes `fund check` demand a recorded mainnet deployment on that chain,
`repo` must be the public repo URL before `ready`. `profile` names `tracks/a-build/programs/<profile>.json`
(submission sections and limits); if that file does not exist the draft sections are used as-is.

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Relevance to Arc | not stated | "Relevance to Arc" |
| C2 | Technical credibility | not stated | "technical credibility" |
| C3 | Quality of work | not stated | "the quality of what you built" |
| C4 | Project viability | not stated | "whether the project is worth taking further" |
| C5 | Promise vs. traction | emphasized | "Promise counts for more than traction here" |

## Limits

Not stated. Submission description requested as "short" with no specified character, word, or page limits.

## Mandatory annexes

- Live deployment on Arc mainnet (link required; must be working)
- Public repository (link required)
- Short description of what the project does and what it uses Arc for
- Public builder profile (GitHub, X, or Farcaster account)

## Exclusions

"Not eligible: design mockups, slide decks, testnet-only builds, projects with no Arc component, and work already funded by a Circle or Arc program."

## Eligibility gates

- "Open to individuals and teams worldwide, subject to sanctions and restricted-jurisdiction screening."
- "Your project must be deployed and working on Arc mainnet at the time you submit."
- "Pseudonymous builders can submit. Verification happens only after conditional selection, and only for whoever receives the microgrant. You do not have to disclose your identity publicly."
- "One submission per project. Teams can submit more than one distinct project."
- "Hackathon projects are eligible."
- "The work must be yours, or you must have the right to submit it."
- "You need a wallet that can receive USDC on Arc."
- "You keep full ownership of your work. No equity, no IP assignment, no exclusivity."
