#!/usr/bin/env node
// Deterministic stub for $FUND_AI_CMD in test/loop.test.mjs. Never calls a real AI.
// Reads the prompt on stdin, decides by keywords whether it is the autofix or the scored-review
// prompt, and prints canned output. Behaviour:
//   LOOP_STUB_STATE  JSON file with call counters (created if missing); the last prompt of each
//                    kind is saved next to it as <kind>.prompt.txt
//   LOOP_STUB_SCORES comma list of review scores out of 10, one per review call (last repeats)
//   LOOP_STUB_FIX    good (default) | garbage | fence | worse | same (returns the draft unchanged)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const prompt = readFileSync(0, 'utf8');
const stateFile = process.env.LOOP_STUB_STATE;
const state = stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { autofix: 0, review: 0 };
const kind = /Output the COMPLETE corrected draft\.md/.test(prompt) ? 'autofix' : /OUTPUT FORMAT/.test(prompt) ? 'review' : 'other';
state[kind] = (state[kind] || 0) + 1;
if (stateFile) {
  writeFileSync(stateFile, JSON.stringify(state));
  writeFileSync(join(dirname(stateFile), `${kind}.prompt.txt`), prompt);
}

if (kind === 'review') {
  const scores = String(process.env.LOOP_STUB_SCORES || '6').split(',').map(Number);
  const s = scores[Math.min(state.review - 1, scores.length - 1)];
  const ids = (/every one, in this order: ([^\n]+)/.exec(prompt)?.[1] || 'C1').match(/C\d+/g) || ['C1'];
  // The last criterion scores one point lower, so it is always the weakest.
  const rows = ids.map((id, i) => `| ${id} | ${i === ids.length - 1 ? Math.max(0, s - 1) : s}/10 | stub reason for ${id} |`);
  process.stdout.write(`| ID | Score | Reason |\n|---|---|---|\n${rows.join('\n')}\n\nFixes:\n1. ${ids[ids.length - 1]} Plan: add milestones.\n\nUnsupported or inflated claims: none\n\nVerdict: BORDERLINE\n`);
} else if (kind === 'autofix') {
  const mode = process.env.LOOP_STUB_FIX || 'good';
  const blocks = [...prompt.matchAll(/<<<\n([\s\S]*?)\n>>>/g)];
  let draft = blocks[blocks.length - 1][1];
  if (mode === 'garbage') { process.stdout.write('I am sorry, I cannot help with that.\n'); process.exit(0); }
  if (mode === 'same') { process.stdout.write(draft + '\n'); process.exit(0); }
  if (mode === 'worse') draft += '\n\n## Extra <!-- criterion: C9 -->\nWe reached 900,000 fans.\n';
  else {
    draft = draft.replace(/1,218,693 contract invocations\./g, '1,218,693 contract invocations [F-007].');
    // Improve the Plan section, or (drafts without one) the first section, so every fix changes the draft.
    if (/## Plan[^\n]*\n/.test(draft)) draft = draft.replace(/(## Plan[^\n]*\n)/, `$1Milestone ${state.autofix} is defined per work package.\n`);
    else draft = draft.replace(/(\n## [^\n]*\n)/, `$1Each work package has a named owner and milestone (stub revision ${'I'.repeat(state.autofix)}).\n`);
  }
  process.stdout.write(mode === 'fence' ? '```markdown\n' + draft.replace(/1,218,693 contract invocations\./g, '1,218,693 contract invocations [F-007].') + '\n```\n' : draft + '\n');
} else {
  process.stdout.write('stub: unknown prompt\n');
}
