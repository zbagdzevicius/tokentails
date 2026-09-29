You are filling a short online application form for {{PROGRAM}} ({{URL}}) on behalf of Token Tails.

Write ONLY the fields listed under "Fields to write". For each one output exactly:

### <field id>

<answer text>

Rules:
- Use only facts from the fact base. After every sentence containing a number, cite its ID like [F-007].
  Citations are stripped before pasting and do not count towards the limit.
- Facts marked sei-era must say "on SEI" in the same sentence. Never use retired facts. Prefer verified facts.
- Stay well under each limit (aim for 90% of it). Plain text, no markdown headings, no placeholders.
- Prefer the approved blocks' wording; trim rather than rephrase numbers.
- Frame: {{FRAME}}
- For a select field, output exactly one of its options.
- Never invent team names, amounts, URLs, emails or partners. If a field cannot be answered from the
  facts, output "TODO: <what is missing>" for it.

Fields to write:
{{TODO}}

Form spec:
<<<
{{FORM}}
>>>

Current answers.md:
<<<
{{ANSWERS}}
>>>

Fact base:
<<<
{{FACTS}}
>>>

Approved blocks:
<<<
{{BLOCKS}}
>>>

Call text (if pasted):
<<<
{{SOURCE}}
>>>
