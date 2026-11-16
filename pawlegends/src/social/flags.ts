/**
 * Country flags (docs/plans/moba/FLAGS.md). A player's flag is the ISO country the backend reads from the request
 * (Cloudflare's `cf-ipcountry`; the IP itself is never stored), shown as the flag emoji. A player can hide it in
 * Settings (others then see a neutral paw). Bots get a flag too: a seeded pick per match and seat, the same on every
 * screen of that match and for everyone in it.
 *
 * Windows (and Chromium on Windows) has no flag emoji: there a one-time canvas check loads a 77 kB font of only the
 * flags ("Twemoji Country Flags" by TalkJS, MIT; flag art Twemoji by Twitter, CC BY 4.0) from the web host and puts it first in the
 * flag chip's font stack. Every other platform never downloads it.
 */
/**
 * The flags-only font lives on the web host (pawlegends-web/public/fonts), outside the game's 10 MB output: only
 * Windows browsers need it, and native shells (iOS, Android) draw flag emoji themselves.
 */
const FLAG_FONT_URL = '/fonts/pl-flags.woff2';

/** Bot flags: a spread of countries where people play (never a territory or an odd code). */
export const BOT_FLAGS = Object.freeze([
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'ES', 'PT', 'IT', 'CH', 'AT', 'PL',
  'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'TR', 'SE', 'NO', 'DK', 'FI', 'EE', 'LV', 'LT', 'UA', 'HR', 'RS', 'SI', 'IL', 'AE',
  'SA', 'EG', 'MA', 'ZA', 'NG', 'KE', 'IN', 'PK', 'BD', 'TH', 'VN', 'MY', 'SG', 'ID', 'PH', 'JP', 'KR', 'TW', 'AU', 'NZ',
] as const);

const CC_RE = /^[A-Z]{2}$/;
const HIDE_KEY = 'pl.flagHide';
const CACHE_KEY = 'pl.flag';
const CACHE_MS = 12 * 3_600_000;

/** A clean ISO code, or null. Pure. */
export function cleanCc(v: unknown): string | null {
  return typeof v === 'string' && CC_RE.test(v) && v !== 'XX' ? v : null;
}

/** The flag emoji of an ISO code (two regional indicator symbols). Pure. */
export function flagEmoji(cc: string): string {
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** A bot's flag: stable for one match seed and seat, spread over BOT_FLAGS. Pure. */
export function botFlag(seed: number, slot: number): string {
  let h = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(slot + 1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return BOT_FLAGS[(h >>> 0) % BOT_FLAGS.length];
}

let names: Intl.DisplayNames | null | undefined;
/** The English country name of a code (the chip's tooltip), or the code itself. */
export function countryName(cc: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      names = null;
    }
  }
  try {
    return names?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

let fontChecked = false;
/** Windows has no flag emoji: load the flags-only font once (never on platforms that draw flags themselves). */
export function ensureFlagFont(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): void {
  if (fontChecked || !doc) return;
  fontChecked = true;
  if (flagsDrawNatively(doc)) return;
  const style = doc.createElement('style');
  style.dataset.flagFont = '1';
  style.textContent = `@font-face{font-family:"PL Flags";src:url(${JSON.stringify(FLAG_FONT_URL)}) format("woff2");unicode-range:U+1F1E6-1F1FF;font-display:swap}`;
  doc.head.appendChild(style);
  doc.documentElement.dataset.flagFont = '1';
}

/** Does this platform draw a flag emoji in colour? (No canvas, e.g. tests: assume it does.) */
function flagsDrawNatively(doc: Document): boolean {
  try {
    const c = doc.createElement('canvas');
    c.width = c.height = 20;
    const g = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
    if (!g || typeof g.fillText !== 'function') return true;
    g.textBaseline = 'top';
    g.font = '16px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(flagEmoji('CH'), 0, 0);
    const d = g.getImageData(0, 0, 20, 20).data;
    // a drawn Swiss flag has red pixels; two letters in a box are grey or black
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) return true;
    return false;
  } catch {
    return true;
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A flag chip: the country's flag, or a neutral paw for a hidden or unknown flag. */
export function ccHtml(cc: string | null | undefined): string {
  ensureFlagFont();
  const code = cleanCc(cc);
  if (!code) return '<span class="pl-cc paw" title="No flag" aria-hidden="true">🐾</span>';
  const name = countryName(code);
  return `<span class="pl-cc" data-cc="${code}" title="${esc(name)}" role="img" aria-label="${esc(name)}">${flagEmoji(code)}</span>`;
}

// ------------------------------------------------------------------------------------------- the player's own flag

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* storage blocked: this session only */
  }
}

/** Settings: the player hides their flag (others see a paw). */
export function flagHidden(): boolean {
  return read(HIDE_KEY) === '1';
}

/** The player's own country as last answered by the backend (null: not known yet, or hidden). */
export function myCountry(): string | null {
  try {
    const v = JSON.parse(read(CACHE_KEY) ?? 'null') as { cc?: unknown } | null;
    return cleanCc(v?.cc);
  } catch {
    return null;
  }
}

/** The flag the player shows (null when hidden or unknown). */
export function myFlag(): string | null {
  return flagHidden() ? null : myCountry();
}

type FlagApi = (op: 'flag.get' | 'flag.set', args?: { hideFlag?: boolean }) => Promise<{ ok: boolean; body?: unknown }>;

/**
 * Refresh the player's country (at most twice a day; the backend records it, never the IP) and push the local hide
 * choice when the server's differs. Never throws; an older host without the op just leaves the flag unknown.
 */
export async function refreshMyFlag(api: FlagApi, nowMs = Date.now()): Promise<string | null> {
  try {
    const cached = JSON.parse(read(CACHE_KEY) ?? 'null') as { cc?: unknown; at?: number } | null;
    if (cached && typeof cached.at === 'number' && nowMs - cached.at < CACHE_MS) return myFlag();
    const r = await api('flag.get');
    if (!r.ok || !r.body || typeof r.body !== 'object') return myFlag();
    const b = r.body as { cc?: unknown; hideFlag?: unknown };
    write(CACHE_KEY, JSON.stringify({ cc: cleanCc(b.cc), at: nowMs }));
    // a device that never chose adopts the account's choice; a choice made here wins and is pushed
    if (typeof b.hideFlag === 'boolean' && b.hideFlag !== flagHidden()) {
      if (read(HIDE_KEY) === null) write(HIDE_KEY, b.hideFlag ? '1' : '0');
      else void api('flag.set', { hideFlag: flagHidden() }).catch(() => undefined);
    }
    return myFlag();
  } catch {
    return myFlag();
  }
}

/** Settings toggle: store locally at once, then tell the backend (relay, friends and boards read it there). */
export async function setFlagHidden(hide: boolean, api: FlagApi | null): Promise<void> {
  write(HIDE_KEY, hide ? '1' : '0');
  if (!api) return;
  try {
    await api('flag.set', { hideFlag: hide });
  } catch {
    /* the next refresh pushes it again */
  }
}

// ------------------------------------------------------------------------------------------- one match's flags

let current: readonly (string | null)[] = [];

/**
 * A match's flags by seat: the player's own (`mine`, or a paw), each human's from the relay (`humans[slot]`, a paw
 * when hidden or unknown), and every bot seat a seeded flag. `isHuman(slot)` tells humans from bots. Pure.
 */
export function matchFlagsFor(o: { seed: number; slots: number; mySlot: number; mine: string | null; isHuman(slot: number): boolean; relay?: readonly (string | null)[] | null }): (string | null)[] {
  return Array.from({ length: o.slots }, (_, slot) => {
    if (slot === o.mySlot) return o.relay ? cleanCc(o.relay[slot]) : o.mine;
    if (o.isHuman(slot)) return cleanCc(o.relay?.[slot]);
    return botFlag(o.seed, slot);
  });
}

/** The running match's flags (the scoreboard and the results read them). */
export function setMatchFlags(flags: readonly (string | null)[]): void {
  current = [...flags];
}

export function matchFlag(slot: number): string | null {
  return current[slot] ?? null;
}

export function hasMatchFlags(): boolean {
  return current.length > 0;
}
