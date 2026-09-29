You are fixing a {{PROGRAM}} application draft so it passes the automatic checks and scores
higher with the panel. Output the COMPLETE corrected draft.md and nothing else.

Hard rules:
- Output starts with the frontmatter line "---" and keeps every frontmatter key of the current
  draft. No commentary before or after, no code fence.
- Keep every "## " section heading and its annotation exactly: `<!-- criterion: C1, C2 | limit: 1500 -->`.
  Do not rename, drop or merge sections. Stay under every limit and words count.
- Use only facts from the fact base. Every sentence containing a number cites its fact id like
  [F-007]. If a number has no fact, remove the number rather than invent a citation. Never cite
  retired facts; a sei-era fact must say "on SEI" in the same sentence.
- Never use a banned term. Frame: {{FRAME}}
- No placeholders (TODO, TBD, {{...}}), no speculation, no token promotion.
- Change what the failures and weak criteria below require; leave strong passages as they are.

1. Automatic check failures to fix (all of them):
<<<
%%CHECK_FAILURES%%
>>>

2. Weakest criteria with the reviewer's reasons (strengthen these using facts only):
<<<
%%WEAKEST%%
>>>

3. Reviewer's suggested fixes from the latest round:
<<<
%%REVIEW_FIXES%%
>>>

Call rules and criteria:
<<<
{{CALL}}
>>>

Fact base:
<<<
{{FACTS}}
>>>

Approved blocks:
<<<
{{BLOCKS}}
>>>

Current draft.md (output the complete corrected version of this file):
<<<
{{DRAFT}}
>>>

(The %%MARKERS%% are filled by `fund loop`. Used by hand, replace them with the errors from
`node bin/fund.mjs check <slug>` and the weakest rows of the latest review round.)

Output ONLY the complete draft.md. Put any notes for the person in ONE HTML comment at the very end: <!-- notes: ... -->. Never put notes, code fences or checklists inside a section.
