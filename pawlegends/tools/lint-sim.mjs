#!/usr/bin/env node
/**
 * npm run lint:sim: determinism rules over src/sim/** (POC.md §15 item 3, §4.2), and integer-only data in
 * src/data/**. Comments and string contents are stripped before matching, so prose may mention anything.
 *
 * src/sim/**:
 * - no Math.random, Date, performance, and no Math.* other than imul, trunc, abs, min, max; any other use of the
 *   `Math` token (bracket access `Math['sqrt']`, an alias `const M = Math`, destructuring `{ sqrt } = Math`) is refused
 * - no Reflect.*, Object.getOwnPropertyNames / getOwnPropertySymbols (key-order iteration by another name)
 * - no float literals (1.5, .5, 1e3) and no ** operator
 * - no `/` division outside fixed.ts (use idiv)
 * - no iteration over Object.keys/values/entries, Map or Set (no `new Map/Set`, no for-in)
 * - no DOM, timers or host globals; imports only from src/sim and src/data; no three
 * - TypeScript only (no .js files)
 * - gameplay numbers live in src/data: integer literals above MAGIC_MAX are refused, except hex literals and in the
 *   MATH_FILES (bit-level maths and encodings). Integers up to MAGIC_MAX (16) stay inline: team size, slot
 *   counts, shifts and enum indices, not tuning. `// lint-sim: allow` on a line exempts that line from the number
 *   rule only (every other rule still applies).
 * src/data/**: no float literals (integer units, §4.2).
 *
 *   node tools/lint-sim.mjs [--root <pkg dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MAGIC_MAX = 16;
/** Files allowed to hold maths constants and the `/` operator (fixed.ts only for `/`). */
export const MATH_FILES = ['fixed.ts', 'rng.ts', 'hash.ts', 'commands.ts'];
const DIVISION_FILES = ['fixed.ts'];
const ALLOWED_MATH = new Set(['imul', 'trunc', 'abs', 'min', 'max']);
const FORBIDDEN_GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'location', 'fetch',
  'setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask', 'crypto', 'process', 'globalThis', 'self',
];

/**
 * Replace comments with spaces and string / template contents with spaces (quotes kept), preserving line breaks
 * and offsets. Regex literals are not expected in the sim; a `/` that starts one is reported as division.
 */
export function stripCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          depth++;
          j += 2;
          continue;
        }
        if (c === '`' && depth > 0 && src[j] === '}') {
          depth--;
          j++;
          continue;
        }
        if (src[j] === c && depth === 0) break;
        j++;
      }
      out += c + blank(src.slice(i + 1, j)) + (j < n ? c : '');
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Lint one sim source. Returns [{ line, rule, text }]. */
export function lintSimSource(src, file) {
  const base = path.basename(file);
  const raw = src.split('\n');
  const code = stripCode(src).split('\n');
  const problems = [];
  const report = (line, rule) => problems.push({ line: line + 1, rule, text: raw[line].trim() });
  const imports = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) imports.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.push(m[1]);
  for (const spec of imports) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file.split(path.sep).join('/')), spec));
    const inside = /(^|\/)src\/(sim|data)(\/|$)/.test(resolved);
    if (!spec.startsWith('.') || !inside) problems.push({ line: 0, rule: 'import', text: `imports "${spec}" (only src/sim and src/data)` });
  }
  for (let i = 0; i < code.length; i++) {
    const l = code[i];
    const allowNumber = /lint-sim:\s*allow/.test(raw[i]);
    if (/\bMath\.random\b/.test(l)) report(i, 'Math.random');
    for (const m of l.matchAll(/\bMath\.(\w+)/g)) if (!ALLOWED_MATH.has(m[1]) && m[1] !== 'random') report(i, `Math.${m[1]}`);
    for (const m of l.matchAll(/(^|[^\w$.])Math\b(?!\s*\.\s*[\w$])/g)) report(i, 'Math (only Math.imul/trunc/abs/min/max)');
    if (/(^|[^\w$.])Reflect\b/.test(l)) report(i, 'Reflect');
    if (/\bObject\.(getOwnPropertyNames|getOwnPropertySymbols|getOwnPropertyDescriptors)\b/.test(l)) report(i, 'Object.getOwnProperty*');
    if (/\bDate\b/.test(l)) report(i, 'Date');
    if (/\bperformance\b/.test(l)) report(i, 'performance');
    if (/(^|[^\w.$])(\d+\.\d*|\.\d+|\d+[eE][+-]?\d+)(?![\w$])/.test(l.replace(/\b0[xXbBoO][\da-fA-F_]+n?\b/g, '0'))) report(i, 'float literal');
    if (/\*\*/.test(l)) report(i, '** operator');
    if (!DIVISION_FILES.includes(base) && /\//.test(l)) report(i, 'division (use idiv)');
    if (/\bObject\.(keys|values|entries)\b/.test(l)) report(i, 'Object.keys/values/entries');
    if (/\bnew\s+(Map|Set|WeakMap|WeakSet)\b/.test(l)) report(i, 'Map/Set');
    if (/\bfor\s*\(\s*(const|let|var)?\s*[\w$]+\s+in\s/.test(l)) report(i, 'for-in');
    for (const g of FORBIDDEN_GLOBALS) if (new RegExp(`(^|[^\\w$.])${g}\\b`).test(l)) report(i, `global ${g}`);
    if (!MATH_FILES.includes(base) && !allowNumber) {
      for (const m of l.matchAll(/(^|[^\w$.])(\d[\d_]*)(?![\w$.])/g)) {
        const v = Number(m[2].replace(/_/g, ''));
        if (v > MAGIC_MAX) report(i, `number ${m[2]} (move it to src/data)`);
      }
    }
  }
  return problems;
}

/** Lint one data source: integer units only. */
export function lintDataSource(src) {
  const code = stripCode(src).split('\n');
  const raw = src.split('\n');
  const problems = [];
  for (let i = 0; i < code.length; i++) {
    if (/(^|[^\w.$])(\d+\.\d*|\.\d+|\d+[eE][+-]?\d+)(?![\w$])/.test(code[i])) problems.push({ line: i + 1, rule: 'float literal', text: raw[i].trim() });
  }
  return problems;
}

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]))
    : [];

export function lintTree(root) {
  const out = [];
  for (const f of walk(path.join(root, 'src/sim'))) {
    const rel = path.relative(root, f);
    if (/\.(js|mjs|cjs|jsx)$/.test(f)) out.push({ file: rel, line: 0, rule: 'no .js in src/sim', text: '' });
    if (!f.endsWith('.ts')) continue;
    for (const p of lintSimSource(fs.readFileSync(f, 'utf8'), rel)) out.push({ file: rel, ...p });
  }
  for (const f of walk(path.join(root, 'src/data'))) {
    if (!f.endsWith('.ts')) continue;
    const rel = path.relative(root, f);
    for (const p of lintDataSource(fs.readFileSync(f, 'utf8'))) out.push({ file: rel, ...p });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? path.resolve(process.argv[i + 1]) : PKG_ROOT;
  const problems = lintTree(root);
  for (const p of problems) console.error(`${p.file}:${p.line}  ${p.rule}  ${p.text}`);
  const files = walk(path.join(root, 'src/sim')).length + walk(path.join(root, 'src/data')).length;
  if (problems.length) {
    console.error(`\nlint:sim FAILED: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`lint:sim ok (${files} files)`);
}
