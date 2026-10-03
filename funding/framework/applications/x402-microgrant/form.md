# x402 Foundation impact micro-grant — form spec

There is no form. The "fields" are the three things we post: the GitHub grant issue on
x402-foundation/x402, the X post that tags @coinbaseDev with the video, and the video narration.
Limits are house limits (X allows 280 characters per post).

- type: text | longtext | url | select | number | email-role
- limit: N (characters) or Nw (words); for select, the options as `A/B/C`
- required: yes | no
- source: `block:<frame>/<Heading>`, `fact:F-###`, `answer`, or `fm:<key>`

| id | label | type | limit | required | source |
|---|---|---|---|---|---|
| issue_title | GitHub issue title | text | 100 | yes | answer |
| issue_body | GitHub issue body | longtext | 2500 | yes | answer |
| x_post | X post (with the video, tags @coinbaseDev) | text | 280 | yes | answer |
| video_script | Video narration (2 minutes or less) | longtext | 1600 | yes | answer |
| website | Website | url | 200 | yes | fm:website |
| ask | Amount requested (USD) | number | 6 | yes | fm:ask |
