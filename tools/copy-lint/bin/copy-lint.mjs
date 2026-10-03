#!/usr/bin/env node
// copy-lint: tone and claims lint for public copy (plan F11; rules in docs/CLAIMS.md).
//
//   node tools/copy-lint/bin/copy-lint.mjs [files...] [--root DIR] [--format text|json|github|markdown]
//                                          [--out FILE] [--warn] [--allow-empty] [--rule R9,R10]
//                                          [--target client,heist]
//
// Exit code: 1 when there are findings, 0 with --warn (warn mode) or when clean, 2 on bad usage
// and when every file named on the command line is outside the targets ("no files scanned"; 0 with
// --allow-empty or --warn). CI runs it as a failing check (task 7b); with --format github the
// annotations are errors, or warnings under --warn.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS, lintRepo } from '../lib/lint.mjs';
import { RULES } from '../lib/rules.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function parse(argv) {
  const flags = { format: 'text', warn: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--warn') flags.warn = true;
    else if (a === '--allow-empty') flags.allowEmpty = true;
    else if (a === '--root') flags.root = val();
    else if (a === '--format') flags.format = val();
    else if (a === '--out') flags.out = val();
    else if (a === '--rule') flags.rules = val().split(',');
    else if (a === '--target') flags.targets = val().split(',');
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else flags.files.push(a);
  }
  return flags;
}

export function summarise(findings) {
  const byRule = {};
  const byFile = {};
  for (const f of findings) {
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    byFile[f.file] = (byFile[f.file] || 0) + 1;
  }
  return { byRule, byFile };
}

export function render(result, format, { warn = false } = {}) {
  const { findings, files, byTarget } = result;
  const { byRule, byFile } = summarise(findings);
  if (format === 'json') return JSON.stringify({ files, byTarget, byRule, findings }, null, 2);
  if (format === 'github') {
    const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    const lines = findings.map((f) => `::${warn ? 'warning' : 'error'} file=${f.file},line=${f.line},title=copy-lint ${f.rule}::${esc(f.message)}`);
    lines.push(`copy-lint: ${findings.length} finding(s) in ${Object.keys(byFile).length} of ${files} file(s)`);
    return lines.join('\n');
  }
  const ruleRows = Object.keys(RULES).map((r) => `| ${r} | ${RULES[r]} | ${byRule[r] || 0} |`);
  const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (format === 'markdown') {
    return [
      `# copy-lint report`,
      '',
      `${findings.length} finding(s) in ${topFiles.length} of ${files} scanned file(s).`,
      '',
      '| Target | Files | Findings |', '|---|---|---|',
      ...Object.entries(byTarget).map(([t, v]) => `| ${t} | ${v.files} | ${v.findings} |`),
      '',
      '| Rule | Meaning | Findings |', '|---|---|---|', ...ruleRows,
      '',
      '## Findings',
      '',
      ...findings.map((f) => `- \`${f.file}:${f.line}\` **${f.rule}** ${f.message}${f.text ? `  \n  > ${f.text.replace(/\|/g, '\\|')}` : ''}`),
      '',
    ].join('\n');
  }
  const out = [];
  let last = '';
  for (const f of findings) {
    if (f.file !== last) { out.push(`\n${f.file}`); last = f.file; }
    out.push(`  ${String(f.line).padStart(5)}  ${f.rule.padEnd(3)}  ${f.message}${f.text ? `\n         "${f.text}"` : ''}`);
  }
  out.push(`\ncopy-lint: ${findings.length} finding(s) in ${topFiles.length} of ${files} file(s)`);
  out.push(Object.entries(byRule).sort().map(([r, n]) => `${r} ${n}`).join(' · ') || 'clean');
  return out.join('\n');
}

export function main(argv = process.argv.slice(2), { log = console.log, err = console.error } = {}) {
  let flags;
  try { flags = parse(argv); } catch (e) { err(e.message); return 2; }
  if (flags.help) { log('usage: copy-lint [files...] [--root DIR] [--format text|json|github|markdown] [--out FILE] [--warn] [--allow-empty] [--rule R9] [--target client]'); return 0; }
  if (!['text', 'json', 'github', 'markdown'].includes(flags.format)) { err(`unknown format ${flags.format}`); return 2; }
  const root = resolve(flags.root || DEFAULT_ROOT);
  const targets = flags.targets ? TARGETS.filter((t) => flags.targets.includes(t.name)) : TARGETS;
  if (flags.targets && !targets.length) { err(`unknown target(s) ${flags.targets.join(', ')} (one of ${TARGETS.map((t) => t.name).join(', ')})`); return 2; }
  const result = lintRepo(root, { only: flags.files.length ? flags.files : undefined, targets });
  if (result.skipped.length) err(`copy-lint: not scanned (outside the selected targets): ${result.skipped.join(', ')}`);
  // Files were named but none is in a target: say so instead of printing "clean".
  if (flags.files.length && result.files === 0) {
    const msg = 'copy-lint: no files scanned (every file named was skipped: outside the selected targets, or too large)';
    if (flags.out) writeFileSync(flags.out, `${msg}\n`);
    if (flags.allowEmpty || flags.warn) { log(msg); return 0; }
    err(msg);
    return 2;
  }
  if (flags.rules) result.findings = result.findings.filter((f) => flags.rules.includes(f.rule));
  const text = render(result, flags.format, { warn: flags.warn });
  if (flags.out) writeFileSync(flags.out, `${flags.format === 'text' ? text.trimStart() : text}\n`);
  log(text);
  return result.findings.length && !flags.warn ? 1 : 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());
