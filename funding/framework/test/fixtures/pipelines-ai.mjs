#!/usr/bin/env node
// Deterministic stand-in for $FUND_AI_CMD in test/track-pipelines.test.mjs. Never calls a real AI.
// Reads the prompt on stdin, picks the prompt kind by keywords, answers with canned text shaped for
// the application's track (read from the `track:` line of the call.md quoted in the prompt).
// Knobs (env):
//   PIPE_STUB_LOG=file        append one line per call: the prompt kind
//   PIPE_STUB_CREVIEW=N       c:review score out of 10 for every criterion (default 9)
//   PIPE_STUB_LOOPSCORE=N     `fund loop` scored-review score out of 10 (default 9)
//   PIPE_STUB_REVIEW=VERDICT  default review verdict (default FUND)

import { appendFileSync } from 'node:fs';

let prompt = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) prompt += chunk;

const kind = /You are filling a short online application form/.test(prompt) ? 'answer'
  : /Output the COMPLETE corrected draft\.md/.test(prompt) ? 'autofix'
  : /FORMAT REQUIREMENT \(machine-scored/.test(prompt) ? 'c-review'
  : /OUTPUT FORMAT — follow exactly/.test(prompt) ? 'review-scored'
  : /You are extracting the rules/.test(prompt) ? 'extract'
  : /skeptical program officer/.test(prompt) ? 'fit'
  : /Fix these problems\./.test(prompt) ? 'revise'
  : /^Draft .* application\./m.test(prompt) ? 'draft'
  : /^Check this application against the call's formal rules/m.test(prompt) ? 'compliance'
  : /evaluator on the .* panel/.test(prompt) ? 'review'
  : 'unknown';

if (process.env.PIPE_STUB_LOG) appendFileSync(process.env.PIPE_STUB_LOG, `${kind}\n`);

const track = (/^track:\s*"?([A-E])"?\s*$/m.exec(prompt) || [])[1] || 'X';

function currentCallFrontmatter() {
  const m = /Current call\.md \(update it\):\n<<<\n(---\n[\s\S]*?\n---\n)/.exec(prompt);
  return m ? m[1] : '';
}

const CRITERIA = {
  A: [['C1', 'Technical execution', '50%', '"Working code deployed on the target chain" (s. 2)'], ['C2', 'Impact', '50%', '"Real users and a path to adoption" (s. 2)']],
  C: [['C1', 'Relevance', '50', '"Relevance of the project to the call priorities" (s. 5)'], ['C2', 'Quality of content', '50', '"Quality of the content and activities" (s. 5)']],
  D: [['C1', 'Mission fit', 'not stated', '"Proposals should proliferate the brand" (guidance)'], ['C2', 'Clear budget', 'not stated', '"Break down what the funds pay for" (guidance)']],
  X: [['C1', 'Quality', '50%', '"Quality of the project" (s. 3)'], ['C2', 'Impact', '50%', '"Expected impact" (s. 3)']],
};

const fm = (v) => `---\nprogram: "Stub Program"\nversion: ${v}\n---\n`;

// No metric-like numbers anywhere, so the citation rule never fires; no frame-banned words.
const DRAFTS = {
  A: (v) => `${fm(v)}# Stub Program — submission draft

## Summary <!-- criterion: C1 | limit: 280 -->
ShelterSplit pays named animal shelters in USDC in the same transaction as each purchase.

## Problem <!-- criterion: C2 | limit: 1200 -->
Shelters cannot see or verify the payouts that purchases are meant to send them.

## Solution <!-- criterion: C1 | limit: 1200 -->
A registry of shelter wallets with shares, and one call that splits and pays every shelter.

## How it works <!-- criterion: C1 | limit: 1500 -->
The owner registers shelters; disburse pulls USDC and emits one event per shelter paid.

## On-chain proof <!-- criterion: C1 | limit: 800 -->
The deployment and its explorer links are inserted by the submission step.

## Traction <!-- criterion: C2 | limit: 1000 -->
The consumer game is live on web, iOS and Android.

## Team <!-- criterion: C2 | limit: 800 -->
A small Vilnius studio that has shipped the game and its payment rails.

## Roadmap and business plan <!-- criterion: C2 | limit: 1200 -->
Onboard partner shelters, publish payout reports, then extend to more chains.
`,
  C: (v) => `${fm(v)}# Stub Program — proposal draft

## Relevance <!-- criterion: C1 | limit: 3000 -->
The studio builds an original narrative game about rescued cats for a European audience.

## Quality of content <!-- criterion: C2 | limit: 3000 -->
Each chapter is written by a contracted narrative lead and reviewed against a style guide.
`,
  D: (v) => `${fm(v)}# Stub Program — application draft

## TL;DR <!-- criterion: C1 | limit: 600 -->
Rescue-cat characters whose purchases pay named shelters, with every payout public.

## Motivation <!-- criterion: C2 | limit: 1500 -->
Shelters need predictable income and donors want proof that money arrived.

## Budget <!-- criterion: C2 | limit: 800 -->
The table below lists each line item; totals are computed from budget.md.

## Why this DAO <!-- criterion: C1 | limit: 1000 -->
The characters carry the brand into a game played every day.
`,
};
DRAFTS.X = DRAFTS.A;
DRAFTS.B = DRAFTS.A;
DRAFTS.E = DRAFTS.A;

function ids(re) {
  const found = [...prompt.matchAll(re)].map((m) => m[1]);
  return found.length ? [...new Set(found)] : ['C1'];
}

let out;
switch (kind) {
  case 'extract': {
    const rows = (CRITERIA[track] || CRITERIA.X).map((c) => `| ${c.join(' | ')} |`).join('\n');
    out = '```markdown\n' + currentCallFrontmatter() + `# Stub Program — call rules

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
${rows}

## Limits
Summary: 280 characters (s. 4).
` + '```\n';
    break;
  }
  case 'fit':
    out = '| Gate | Result | Evidence |\n|---|---|---|\n| Remote | PASS | call text |\n\nVerdict: GO\n';
    break;
  case 'draft':
    out = '```markdown\n' + (DRAFTS[track] || DRAFTS.X)(1) + '```\n';
    break;
  case 'revise':
    out = (DRAFTS[track] || DRAFTS.X)(2);
    break;
  case 'review':
    out = `| Criterion | Score | Reason |\n|---|---|---|\n| C1 | 8 | clear |\n\nVerdict: ${process.env.PIPE_STUB_REVIEW || 'FUND'}\n`;
    break;
  case 'c-review': {
    const s = process.env.PIPE_STUB_CREVIEW || '9';
    out = `| ID | Score | Reason |\n|---|---|---|\n${ids(/^\| (C\d+) \| <score>/gm).map((id) => `| ${id} | ${s}/10 | stub reason for ${id} |`).join('\n')}\n\nVerdict: BORDERLINE\n`;
    break;
  }
  case 'review-scored': {
    const s = process.env.PIPE_STUB_LOOPSCORE || '9';
    const list = (/every one, in this order: ([^\n]+)/.exec(prompt)?.[1] || 'C1').match(/C\d+/g) || ['C1'];
    out = `| ID | Score | Reason |\n|---|---|---|\n${list.map((id) => `| ${id} | ${s}/10 | stub reason for ${id} |`).join('\n')}\n\nFixes:\n1. ${list[0]} add evidence.\n\nUnsupported or inflated claims: none\n\nVerdict: FUND\n`;
    break;
  }
  case 'autofix': {
    const blocks = [...prompt.matchAll(/<<<\n([\s\S]*?)\n>>>/g)];
    const draft = blocks.length ? blocks[blocks.length - 1][1] : DRAFTS.X(1);
    out = draft.replace(/(\n## [^\n]*\n)([^\n]*)/, '$1$2 Every claim is sourced.') + '\n';
    break;
  }
  case 'compliance':
    out = '| Rule | Result | Evidence |\n|---|---|---|\n| Every section present | PASS | draft.md |\n';
    break;
  case 'answer': {
    const list = /Fields to write:\n([\s\S]*?)\n\n/.exec(prompt)?.[1] || '';
    const fields = [...list.matchAll(/^- ([A-Za-z0-9_-]+) — .*$/gm)].map((m) => ({ id: m[1], opts: /must be exactly one of: ([^;)]+)/.exec(m[0])?.[1] }));
    out = fields.map((f) => `### ${f.id}\n\n${f.opts ? f.opts.split('/')[0].trim() : 'Token Tails is a cat-rescue game studio whose players fund named shelters.'}\n`).join('\n');
    break;
  }
  default:
    out = 'stub: unknown prompt\n';
}
process.stdout.write(out);
