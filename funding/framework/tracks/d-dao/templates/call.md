---
program: "{{PROGRAM}}"
track: {{TRACK}}
status: researching
frame: {{FRAME}}
deadline: "{{DEADLINE}}"
url: "{{URL}}"
next: "Fill budget.md and draft.md, then run d:export {{SLUG}}"
created: {{CREATED}}
dao: ""
proposal_title: ""
posted: ""
kill_after_days: 21
forum_url: ""
eth_usd: ""
budget_unit: ETH
min_budget: ""
max_budget: ""
---
# {{PROGRAM}} — call rules

DAO proposals rarely publish a rubric. Quote the DAO's own proposal guidance verbatim (paste it into
source.md first, then run `fund prompt extract {{SLUG}} --run`).

Track D fields: `posted` is set by `d:post` and starts the kill clock; `kill_after_days` (default 21)
is when to stop without a sponsor; `eth_usd` is the planning rate used to show USD next to ETH;
`min_budget` / `max_budget` are in `budget_unit` (ETH or USD); `dao` names the DAO in the sponsor ask.

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Mission fit (what the project is, how it spreads the DAO's brand) | not stated | replace with the DAO's own wording |
| C2 | Community and DAO fit | not stated | replace with the DAO's own wording |
| C3 | Funding needed | not stated | replace with the DAO's own wording |
| C4 | Cost breakdown | not stated | replace with the DAO's own wording |
| C5 | Success metrics and milestones | not stated | replace with the DAO's own wording |

## Limits

## Mandatory annexes

## Exclusions

## Eligibility gates

## Sponsorship
