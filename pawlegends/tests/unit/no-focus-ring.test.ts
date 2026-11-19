// @vitest-environment happy-dom
// No focus ring anywhere in Paw Legends (founder, Nov 19: "remove that indicator when clicking TAB from buttons
// everywhere across the app"). The guard: a :focus / :focus-visible / :focus-within rule in the game (src/) or the app
// shell (../pawlegends-app/src) may only say `outline: none` or set `opacity` (an arrow-key target that is hidden until
// hover must still show); the one global rule lives in src/ui/theme/v6.css. And Tab
// is cancelled outside a text field (src/input/tabGuard.ts). The e2e side is tests/e2e/no-focus-ring.spec.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { installTabGuard, tabKeepsFocusMove } from '../../src/input/tabGuard';

const ROOT = join(__dirname, '../..');
const DIRS = [join(ROOT, 'src'), join(ROOT, '../pawlegends-app/src')];
const FOCUS = /:focus(-visible|-within)?\b/;
const ONLY_NONE = /^outline\s*:\s*none\s*(!important)?$/;
const ALLOWED = (d: string): boolean => ONLY_NONE.test(d) || /^opacity\s*:/.test(d);

function files(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(css|ts)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}

/** Each focus rule that sets more than `outline: none` / `opacity`, as `file: selector { body }`. */
function offenders(): string[] {
  const bad: string[] = [];
  for (const f of DIRS.flatMap(files)) {
    const src = readFileSync(f, 'utf8');
    if (!FOCUS.test(src)) continue;
    const rel = relative(ROOT, f);
    if (f.endsWith('.css')) {
      postcss.parse(src).walkRules((r) => {
        if (!FOCUS.test(r.selector)) return;
        const decls = (r.nodes ?? []).filter((n) => n.type === 'decl').map((d) => `${(d as postcss.Declaration).prop}: ${(d as postcss.Declaration).value}${(d as postcss.Declaration).important ? ' !important' : ''}`);
        if (!decls.length || !decls.every(ALLOWED)) bad.push(`${rel}: ${r.selector} { ${decls.join('; ')} }`);
      });
    } else {
      // CSS inside a TS template string: `sel:focus-visible{...}`
      for (const m of src.matchAll(/([^{};`'"\n]*:focus(?:-visible|-within)?\b[^{};`'"\n]*)\{([^}]*)\}/g)) {
        const decls = m[2].split(';').map((d) => d.trim()).filter(Boolean);
        if (!decls.length || !decls.every(ALLOWED)) bad.push(`${rel}: ${m[1].trim()} { ${decls.join("; ")} }`);
      }
    }
  }
  return bad;
}

describe('no focus ring', () => {
  it('no :focus / :focus-visible / :focus-within rule draws anything (outline: none or opacity only)', () => {
    expect(offenders()).toEqual([]);
  });

  it('the global rule removes every outline on focus', () => {
    const v6 = readFileSync(join(ROOT, 'src/ui/theme/v6.css'), 'utf8');
    expect(v6).toMatch(/:focus, :focus-visible \{ outline: none !important; \}/);
    expect(readFileSync(join(ROOT, 'src/main.ts'), 'utf8')).toMatch(/installTabGuard\(\);/);
  });

  it('the guard itself catches a ring', () => {
    const r = postcss.parse('.a:focus-visible { outline: 3px solid #ffe14a; }').first as postcss.Rule;
    expect(FOCUS.test(r.selector)).toBe(true);
    expect(ONLY_NONE.test('outline: 3px solid #ffe14a')).toBe(false);
    expect(ONLY_NONE.test('outline: none')).toBe(true);
    expect(ALLOWED('box-shadow: inset 0 0 0 3px #ffe14a')).toBe(false);
    expect(ALLOWED('border-color: #ffe14a')).toBe(false);
    expect(ALLOWED('opacity: 1')).toBe(true);
  });
});

describe('tabGuard', () => {
  it('keeps Tab only in text fields', () => {
    const mk = (tag: string, type?: string): HTMLElement => {
      const el = document.createElement(tag);
      if (type) (el as HTMLInputElement).type = type;
      return el;
    };
    expect(tabKeepsFocusMove(mk('input'))).toBe(true);
    expect(tabKeepsFocusMove(mk('input', 'search'))).toBe(true);
    expect(tabKeepsFocusMove(mk('textarea'))).toBe(true);
    expect(tabKeepsFocusMove(mk('select'))).toBe(true);
    expect(tabKeepsFocusMove(mk('input', 'checkbox'))).toBe(false);
    expect(tabKeepsFocusMove(mk('input', 'range'))).toBe(false);
    expect(tabKeepsFocusMove(mk('button'))).toBe(false);
    expect(tabKeepsFocusMove(mk('a'))).toBe(false);
    expect(tabKeepsFocusMove(document.body)).toBe(false);
    expect(tabKeepsFocusMove(null)).toBe(false);
  });

  it('cancels Tab on a button and on the page, keeps it in a field, never stops it (the scoreboard still sees it)', () => {
    const off = installTabGuard(window);
    const btn = document.createElement('button');
    const input = document.createElement('input');
    document.body.append(btn, input);
    let seen = 0;
    const count = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') seen++;
    };
    window.addEventListener('keydown', count);
    const tab = (el: HTMLElement, shiftKey = false): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e;
    };
    expect(tab(btn).defaultPrevented).toBe(true);
    expect(tab(btn, true).defaultPrevented).toBe(true);
    expect(tab(document.body).defaultPrevented).toBe(true);
    expect(tab(input).defaultPrevented).toBe(false);
    expect(seen).toBe(4);
    const q = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true });
    btn.dispatchEvent(q);
    expect(q.defaultPrevented).toBe(false);
    off();
    expect(tab(btn).defaultPrevented).toBe(false);
    window.removeEventListener('keydown', count);
    btn.remove();
    input.remove();
  });
});
