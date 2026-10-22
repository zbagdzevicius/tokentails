#!/usr/bin/env node
/**
 * Copy gate for the trailer (storyboard §2 "Copy gate", §4): every on-screen string in copy.json, and every full line
 * the type layer composes from them, goes through the repo copy lint (`lintSource`, pawlegends target: R8, R9, R10 and
 * R13 game copy) plus the trailer's own rules (no "#1"; no numbers except "3V3"). Exit 1 on any finding, so
 * type.mjs refuses to render bad copy.
 *
 *   node tools/trailer/lint-copy.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const { TARGETS, lintSource, loadFacts } = await import(join(ROOT, 'tools/copy-lint/lib/lint.mjs'));

export function trailerLines(copy) {
  const c = copy;
  const lines = Object.entries(c).filter(([k]) => !k.startsWith('_'));
  // the composed lines as viewers read them
  lines.push(
    ['L1', `${c.L1a} ${c.L1b} ${c.L1c}`],
    ['L2', `${c.L2a} ${c.L2b}`],
    ['END', `${c.LOGOa}${c.LOGOb} · ${c.CTA} · ${c.SUB} · ${c.URL} · ${c.CREDIT}`],
  );
  return lines;
}

/** The trailer's own rules on top of the copy lint (storyboard §2). */
export function trailerRules(id, text) {
  const out = [];
  if (/#\s?1\b/.test(text)) out.push({ id, rule: 'T1', message: 'no "#1"' });
  const numbers = text.replace(/\b3V3\b/g, '').match(/\d+/g);
  if (numbers) out.push({ id, rule: 'T2', message: `no numbers on screen except "3V3": ${numbers.join(', ')}` });
  // the brand ("Token Tails", tokentails.com) is the company name, not a crypto token
  const plain = text.replace(/\bToken Tails\b|\btokentails\.com\b/g, ' ');
  if (/\b(?:adopt\w*|rescue\w*|token|crypto|NFT|USDC|buy|purchase|free money|win \w+ money)\b/i.test(plain)) out.push({ id, rule: 'T3', message: 'no adopt, rescue, token, crypto or buying words in the trailer' });
  return out;
}

export function lintTrailerCopy(copy) {
  const target = TARGETS.find((t) => t.name === 'pawlegends');
  const facts = loadFacts(ROOT);
  const lines = trailerLines(copy);
  // one virtual source file in the pawlegends tree: each string is a `text` property, so even one-word lines are copy
  const src = `export const TRAILER = [\n${lines.map(([id, t]) => `  { id: ${JSON.stringify(id)}, text: ${JSON.stringify(t)} },`).join('\n')}\n];\n`;
  const found = lintSource('pawlegends/src/ui/trailerCopy.ts', src, { facts, target, toneExempt: false }).map((f) => ({ id: lines[f.line - 2]?.[0], rule: f.rule, message: f.message, text: f.text }));
  for (const [id, t] of lines) found.push(...trailerRules(id, t));
  return { lines: lines.length, findings: found };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const copy = JSON.parse(readFileSync(join(HERE, 'copy.json'), 'utf8'));
  const r = lintTrailerCopy(copy);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    for (const f of r.findings) console.log(`  ${f.id}: ${f.rule} ${f.message}`);
    console.log(`[lint-copy] ${r.lines} lines, ${r.findings.length} findings`);
  }
  process.exit(r.findings.length ? 1 : 0);
}
