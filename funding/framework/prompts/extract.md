You are extracting the rules of a funding call so an application can be checked against them.

Program: {{PROGRAM}}

Call text (pasted by the applicant):
<<<
{{SOURCE}}
>>>

Current call.md (update it):
<<<
{{CALL}}
>>>

Output a complete replacement for call.md. Keep the YAML frontmatter and update `deadline` (ISO 8601
with timezone) if the text states one. In the body, fill:
1. A criteria table, one row per scoring criterion: `| C1 | Name | Weight | Verbatim quote |`.
2. Limits: every character, word and page limit, with the section it applies to.
3. Mandatory annexes and attachments.
4. Exclusion clauses, quoted verbatim.
5. Eligibility gates, quoted verbatim.
Quote every rule verbatim with its section number. Write "not stated" rather than guessing.
