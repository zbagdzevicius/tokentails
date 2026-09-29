# SKALE SIP-6 forum post — form spec

The "form" is a reply box on the forum topic https://forum.skale.network/t/848 (SIP-6: The 4-Year
Terminal Tokenomics & Protocol Growth Framework). A reply has no title, website, ask or contact
field, so the only field is the post body. Discourse allows long posts; 2500 characters is our own
cap so the reply stays readable next to the others in the thread.

- type: text | longtext | url | select | number | email-role
- limit: N (characters) or Nw (words); for select, the options as `A/B/C`
- required: yes | no
- source: `block:<frame>/<Heading>` or `block:<Heading>` (uses this app's frame) from facts/BLOCKS.md,
  `fact:F-###`, `answer` (answers.md), or `fm:<key>` (call.md frontmatter)

| id | label | type | limit | required | source |
|---|---|---|---|---|---|
| post | Forum reply (topic 848) | longtext | 2500 | yes | answer |
