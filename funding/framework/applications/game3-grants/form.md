# Game3 Grants — form spec

One row per field on the live form https://game3.foundation/grants/apply (reached from the
"Apply for Grant" button on https://game3.foundation/grants). Re-matched on 2026-09-27 against the
form's public source code:
https://raw.githubusercontent.com/game3foundation/website/main/src/app/grants/apply/page.tsx
(repo https://github.com/game3foundation/website, form added 2025-03-17, last commit 2025-12-19).

The live form has three steps (Personal Info → Project Information → Additional Information) and
**no character limits** on any field. The limits below are house limits that keep answers short;
they are not Game3's. Labels are verbatim from the live form (the `*` it shows is the required column).

- type: text | longtext | url | select | number | email-role
- limit: N (characters) or Nw (words); for select, the options as `A/B/C`
- source: `block:<frame>/<Heading>`, `fact:F-###`, `answer`, or `fm:<call.md key>`
- a `### <id>` answer in answers.md overrides the source

| id | label | type | limit | required | source | criteria |
|---|---|---|---|---|---|---|
| email | Email | email-role | 100 | yes | fm:contact |  |
| org | Organization/Project Name | text | 100 | no | answer |  |
| location | Location | text | 100 | no | answer |  |
| website | Website (if any) | url | 200 | no | fm:website |  |
| project_name | Project Name | text | 60 | yes | answer |  |
| description | Project Description | longtext | 1000 | yes | answer | C1,C5 |
| problem | Problem Statement | longtext | 600 | yes | answer | C4 |
| solution | Your Solution | longtext | 1200 | yes | answer | C1,C2,C6 |
| audience | Target Audience | text | 300 | no | answer | C4 |
| category | Project Category | select | Blockchain Gaming Infrastructure/AI-Powered Game Content Generation/Decentralized Virtual Economies/Autonomous Game Agents and NPCs/Cross-Game Identity and Assets/Other | yes | answer | C5 |
| ask | Requested Funding Amount (USD) | number | 12 | yes | fm:ask |  |
| timeline | Estimated Timeline (months) | number | 3 | yes | fm:timeline_months |  |
| experience | Relevant Experience | longtext | 1000 | yes | answer | C3 |
| why_web3 | Why Web3 Gaming? | longtext | 900 | yes | answer | C5 |
| metrics | Success Metrics | longtext | 700 | yes | answer | C4,C6 |
| challenges | Anticipated Challenges | longtext | 700 | no | answer | C2 |

## Fields the person fills at paste time (never stored in these files)

These are on the live form but hold personal data or need the person's own action, so they are
deliberately not in the table:

- **Full Name** (step 1, required): personal data.
- **Your Role** (step 1, required): the submitter's own role.
- **Twitter/X Handle** (step 1, optional): no verified project handle in FACTS.md; add the project account if wanted.
- **Open-source checkbox ("This project will be open-source or will have significant…")** (step 3, optional): a decision: tick only if the grant work will really be published as open source.
- **Wallet Address (from the connected wallet; Ethereum mainnet or Polygon)** (step 3, required): the person connects their own EVM wallet and signs the submission message.
- **Terms agreement ("I agree to the terms and conditions of the Game3 Foundation…")** (step 3, required): the person accepts the terms.
