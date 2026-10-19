/**
 * Strings (iteration 2 contract, API integrator-owned): `t(key, vars)` looks a key up in the current locale, then in
 * English, then returns the key itself. Each lane registers its own table (`src/ui/strings/<lane>.en.ts`) from its
 * install file. `?lang=xx` (or settings.lang 'xx') is a pseudo-locale: every string comes back accented and bracketed,
 * so `e2e/a11y.spec.ts` can find text that never went through `t()`.
 */
type Table = Record<string, string>;

const tables = new Map<string, Table>();
let locale = 'en';

export function registerStrings(loc: string, table: Table): void {
  tables.set(loc, { ...(tables.get(loc) ?? {}), ...table });
}

export function setLocale(loc: string): void {
  locale = loc || 'en';
}

export function getLocale(): string {
  return locale;
}

const ACCENT: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ç', n: 'ñ' };

/** Pseudo-localise: accents, 30 % longer, in brackets (placeholders untouched). */
export function pseudo(s: string): string {
  let out = '';
  let inVar = false;
  for (const ch of s) {
    if (ch === '{') inVar = true;
    out += inVar ? ch : (ACCENT[ch] ?? ch);
    if (ch === '}') inVar = false;
  }
  return `⟦${out}${'·'.repeat(Math.ceil(s.length * 0.3))}⟧`;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const base = tables.get(locale === 'xx' ? 'en' : locale)?.[key] ?? tables.get('en')?.[key] ?? key;
  let s = base.replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m));
  if (locale === 'xx') s = pseudo(s);
  return s;
}

/** Read `?lang=` once at boot (QA). */
export function localeFromUrl(search: string): string | null {
  const q = new URLSearchParams(search).get('lang');
  return q && /^[a-z]{2}$/.test(q) ? q : null;
}
