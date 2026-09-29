# {{PROGRAM}} — form spec

One row per field on the live form ({{URL}}). Copy labels and limits exactly as the form shows them.

- type: text | longtext | url | select | number | email-role
- limit: N (characters) or Nw (words); for select, the options as `A/B/C`
- required: yes | no
- source: `block:<frame>/<Heading>` or `block:<Heading>` (uses this app's frame) from facts/BLOCKS.md,
  `fact:F-###`, `answer` (answers.md), or `fm:<key>` (call.md frontmatter)
- optional 7th column: criterion ids (`C1, C2`) from call.md

A `### <id>` answer in answers.md overrides any source (use it to trim a block to the limit).

| id | label | type | limit | required | source |
|---|---|---|---|---|---|
| name | Project name | text | 60 | yes | answer |
| website | Website | url | 200 | yes | fm:website |
| summary | One-line summary | text | 140 | yes | block:One-liner |
| description | Project description | longtext | 1000 | yes | answer |
| traction | Traction | longtext | 150w | yes | answer |
| team | Team | longtext | 600 | yes | answer |
| ask | Amount requested (USD) | number | 12 | yes | fm:ask |
| contact | Contact email | email-role | 100 | yes | fm:contact |
