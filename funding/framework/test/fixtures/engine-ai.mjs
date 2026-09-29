#!/usr/bin/env node
// Deterministic stand-in for $FUND_AI_CMD in test/pipeline.test.mjs.
// Reads the prompt on stdin and prints canned output chosen by keywords in it.
// Knobs (env): ENGINE_AI_LOG=file (append one line per call: the prompt kind),
// ENGINE_FIT=GO|NO-GO|GO-IF, ENGINE_DRAFT=bad (first draft has an uncited number),
// ENGINE_REVIEW=FUND|REJECT, ENGINE_REVISE=bad (revision still broken), ENGINE_FAIL=<kind> (exit 1).

import { appendFileSync } from 'node:fs';

let prompt = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) prompt += chunk;

const kind = /You are extracting the rules/.test(prompt) ? 'extract'
  : /skeptical program officer/.test(prompt) ? 'fit'
  : /Fix these problems\./.test(prompt) ? 'revise'
  : /^Draft .* application\./m.test(prompt) ? 'draft'
  : /evaluator on the .* panel/.test(prompt) ? 'review'
  : /formal rules/.test(prompt) ? 'compliance'
  : 'unknown';

if (process.env.ENGINE_AI_LOG) appendFileSync(process.env.ENGINE_AI_LOG, `${kind}\n`);
if (process.env.ENGINE_FAIL === kind) { process.stderr.write(`stub: forced failure for ${kind}\n`); process.exit(1); }

// The frontmatter of the "Current call.md" block, so the extract answer keeps it (like a good AI).
function currentCallFrontmatter() {
  const m = /Current call\.md \(update it\):\n<<<\n(---\n[\s\S]*?\n---\n)/.exec(prompt);
  return m ? m[1] : '';
}

const DRAFT_GOOD = `---
program: "Stub Program"
version: 1
---
# Stub Program — application draft

## Summary <!-- criterion: C1 | limit: 600 -->
Token Tails is a cat-rescue game studio in Vilnius that ships on web, iOS and Android.

## Impact <!-- criterion: C2 | limit: 800 -->
Every player action funds a named shelter partner, and each payout is visible to the shelter.
`;

const DRAFT_BAD = DRAFT_GOOD.replace('visible to the shelter.', 'visible to the shelter. We reached 5000 players last month.');

let out;
switch (kind) {
  case 'extract':
    out = '```markdown\n' + currentCallFrontmatter() + `# Stub Program — call rules

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Quality | 50% | "Quality of the project" (s. 3) |
| C2 | Impact | 50% | "Expected impact" (s. 3) |

## Limits
Summary: 600 characters (s. 4).
` + '```\n';
    break;
  case 'fit':
    out = `| Gate | Result | Evidence |\n|---|---|---|\n| Remote | PASS | call text |\n\n# Verdict\n${process.env.ENGINE_FIT || 'GO'}\n`;
    break;
  case 'draft':
    out = '```markdown\n' + (process.env.ENGINE_DRAFT === 'bad' ? DRAFT_BAD : DRAFT_GOOD) + '```\n';
    break;
  case 'revise':
    out = process.env.ENGINE_REVISE === 'bad' ? DRAFT_BAD : DRAFT_GOOD.replace('version: 1', 'version: 2');
    break;
  case 'review':
    out = `# Scores\n\n| Criterion | Score | Reason |\n|---|---|---|\n| C1 | 8 | clear |\n\n## Verdict\n${process.env.ENGINE_REVIEW || 'FUND'}\n`;
    break;
  case 'compliance':
    out = '| Rule | Result | Evidence |\n|---|---|---|\n| Summary under 600 chars | PASS | 97 chars |\n';
    break;
  default:
    out = 'stub: unknown prompt\n';
}
process.stdout.write(out);
