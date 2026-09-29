Draft {{SECTION}} of the {{PROGRAM}} application.

Rules:
- Use only facts from the fact base. After every sentence containing a number, cite its ID like [F-007].
- Facts marked sei-era must say "on SEI" in the same sentence. Do not use retired facts.
- Frame: {{FRAME}}
- Map each "## " section to criteria with an annotation on the heading line:
  `## Title <!-- criterion: C1, C2 | limit: 1500 -->` using the limits from call.md.
- Stay under every limit. No placeholders.
- Output ONLY the complete draft.md. Put any notes for the person (claims to verify, steps to do before submitting) in ONE HTML comment at the very end: <!-- notes: ... -->. Never put notes, code fences or checklists inside a section.

Fact base:
<<<
{{FACTS}}
>>>

Approved blocks:
<<<
{{BLOCKS}}
>>>

Call rules:
<<<
{{CALL}}
>>>

Current draft (revise it; output the complete new draft.md, frontmatter included):
<<<
{{DRAFT}}
>>>
