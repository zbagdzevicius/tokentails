---
program: "{{PROGRAM}}"
track: {{TRACK}}
status: researching
frame: {{FRAME}}
deadline: "{{DEADLINE}}"
url: "{{URL}}"
next: "Paste the call text into source.md, run the extract prompt, then fund c:plan {{SLUG}}"
created: {{CREATED}}
threshold: 70
max_grant: 0
funding_rate: 0.6
internal_buffer_days: 7
score_scale: 10
---
# {{PROGRAM}} — call rules

Filled by `fund prompt extract {{SLUG}} --run`, then checked by a human against the source.

Track C fields in the frontmatter: `threshold` (pass mark on a 100 scale), `max_grant` (EUR cap),
`funding_rate` (share of eligible costs the funder pays, 0..1), `internal_buffer_days` (internal
deadline = deadline minus this), `score_scale` (scale for bare review scores such as "7").
Optional: `plan_start` (YYYY-MM-DD, stretch the schedule to start then), `cofinancing_min` (0..1), `requested_grant` (EUR, if you ask for less than the maximum).

## Scoring criteria

Weights may be percentages or points; `fund c:score` normalises them. Put any uncertainty about a
weight in the quote column, never in the weight cell.

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|

## Limits

## Mandatory annexes

List them in annexes.md as `- [ ] Name — file` so `fund c:annexes {{SLUG}}` can track them.

## Exclusions

## Eligibility gates
