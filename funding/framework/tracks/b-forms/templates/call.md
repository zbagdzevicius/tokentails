---
program: "{{PROGRAM}}"
track: {{TRACK}}
status: drafting
frame: {{FRAME}}
deadline: "{{DEADLINE}}"
url: "{{URL}}"
next: "Fill form.md from the live form, then run b:fill {{SLUG}}"
created: {{CREATED}}
website: "https://tokentails.com"
ask: ""
contact: ""
---
# {{PROGRAM}} — call rules

Track B short form. The field list lives in `form.md`, free answers in `answers.md`, and
`node bin/fund.mjs b:fill {{SLUG}}` writes the paste sheet `fill.md`.

Frontmatter keys used by `fm:` sources: `website`, `ask` (plain number, the amount requested),
`contact` (a role address only, never a personal one).

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|

## Limits

See form.md (one row per field).

## Eligibility gates

## Exclusions
