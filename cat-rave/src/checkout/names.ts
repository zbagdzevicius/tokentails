/**
 * F-CHECKOUT: cat names on the client (CHECKOUT-SPEC.md section 7). The server is authoritative;
 * this mirrors its rules for inline messages only, by running the very same `normalizeCatName`
 * from shared/name.ts (2–16 chars, Latin letters/digits/space/'/-, EN + LT profanity, reserved).
 * Names are only ever rendered with textContent or canvas text, never innerHTML.
 */
import { CAT_NAME_MAX_LENGTH, CAT_NAME_MESSAGES, normalizeCatName, foldCatName } from '../../../shared/name';
import type { CatNameErrorCode } from '../../../shared/name';

export { CAT_NAME_MAX_LENGTH };

/** Named fields shown at most; above this one "name for the rest" field is auto-numbered. */
export const NAMED_FIELDS = 10;
/** More than this many identical non-default names in one order is NAME_REPEAT. */
export const MAX_SAME_NAME = 3;

/**
 * The server's RAVE_DEFAULT_NAMES (spec section 7), used here as placeholders. The server picks
 * the final default for an empty field, so the placeholder is a suggestion, not a promise.
 */
export const CUTE_NAMES: readonly string[] = Object.freeze([
  'Mochi', 'Biscuit', 'Pixel', 'Noodle', 'Bean', 'Sprout', 'Tofu', 'Waffles', 'Pumpkin', 'Pepper',
  'Clover', 'Nugget', 'Pickle', 'Sushi', 'Toast', 'Peanut', 'Muffin', 'Kiwi', 'Dumpling', 'Boba',
  'Ziggy', 'Disco', 'Glowstick', 'Bassline', 'Beatpaw', 'Moonbeam', 'Wobble', 'Sparkle', 'Velvet', 'Neon',
  'Comet', 'Jellybean', 'Marble', 'Tinsel', 'Paprika', 'Mango', 'Fudge', 'Pebble', 'Hopscotch', 'Zephyr',
]);

/**
 * Grey text in the name fields. Neutral on purpose: an empty field gets the SERVER's surprise name
 * (sha256 of the order id), so the field never shows a specific name the buyer would not get.
 */
export const NAME_EXAMPLE = 'e.g. Mochi';
export const SURPRISE_PLACEHOLDER = 'surprise name';

export const NAME_REPEAT_MESSAGE = `At most ${MAX_SAME_NAME} cats per order can share a name.`;

/** How many single-name fields to show for `cats`, and whether the "rest" field is needed. */
export function nameFieldCount(cats: number): { named: number; rest: boolean } {
  const n = Math.max(0, Math.floor(cats));
  return { named: Math.min(n, NAMED_FIELDS), rest: n > NAMED_FIELDS };
}

/**
 * `count` distinct cute placeholders, shuffled with `seed` (one seed per sheet open so they do
 * not jump around while typing). Wraps around after 40.
 */
export function placeholders(count: number, seed = 1): string[] {
  const list = CUTE_NAMES.slice();
  let s = (Math.floor(seed) >>> 0) || 1;
  for (let i = list.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(list[i % list.length]);
  return out;
}

export type NameCheck =
  | { ok: true; name: string | null }
  | { ok: false; code: CatNameErrorCode | 'NAME_REPEAT'; message: string };

/** One field. Empty (or only spaces) is fine: the server gives that cat a cute default. */
export function checkName(raw: string): NameCheck {
  if (!String(raw ?? '').trim()) return { ok: true, name: null };
  const r = normalizeCatName(raw);
  if (r.ok) return { ok: true, name: r.name };
  return { ok: false, code: r.code, message: CAT_NAME_MESSAGES[r.code] };
}

/** Server error code → a short line under the field (codes the client does not know get a generic one). */
export function nameMessage(code: string): string {
  if (code === 'NAME_REPEAT') return NAME_REPEAT_MESSAGE;
  return (CAT_NAME_MESSAGES as Record<string, string>)[code] ?? 'Try another name.';
}

export interface NamesCheck {
  ok: boolean;
  /** Normalised names, '' for empty fields (the server fills those in). */
  names: string[];
  restName: string;
  /** Per-field problems: index into `names`, or 'rest'. */
  errors: Array<{ index: number | 'rest'; message: string }>;
}

/**
 * Checks the whole form: each field, then the repeat rule (more than three identical non-empty
 * names, compared on the folded skeleton, flags the 4th and later copies).
 */
export function checkNames(rawNames: readonly string[], rawRest: string, cats: number): NamesCheck {
  const { named, rest } = nameFieldCount(cats);
  const names: string[] = [];
  const errors: NamesCheck['errors'] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < named; i += 1) {
    const r = checkName(rawNames[i] ?? '');
    if (!r.ok) {
      errors.push({ index: i, message: r.message });
      names.push('');
      continue;
    }
    const name = r.name ?? '';
    names.push(name);
    if (name) {
      const key = foldCatName(name) || name.toLowerCase();
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n > MAX_SAME_NAME) errors.push({ index: i, message: NAME_REPEAT_MESSAGE });
    }
  }
  let restName = '';
  if (rest) {
    const r = checkName(rawRest);
    if (!r.ok) errors.push({ index: 'rest', message: r.message });
    else restName = r.name ?? '';
  }
  return { ok: errors.length === 0, names, restName, errors };
}

/**
 * Every cat's name, the way client and server agree: cat i (0-based) is names[i] when
 * i < names.length, else `${restName} ${i + 1}`. Capped at `limit` entries (a 500-cat order does
 * not need 500 strings to draw a summary).
 */
export function expandNames(names: readonly string[], restName: string | null | undefined, cats: number, limit = Infinity): string[] {
  const n = Math.min(Math.max(0, Math.floor(cats)), limit);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i < names.length) out.push(String(names[i] ?? ''));
    else if (restName) out.push(`${restName} ${i + 1}`);
    else break;
  }
  return out;
}

/** "Mochi", "Mochi and Pixel", "Mochi, Pixel and 3 more". */
export function namesSummary(names: readonly string[], cats: number, show = 2): string {
  const shown = names.filter(Boolean).slice(0, show);
  if (!shown.length) return cats === 1 ? '1 cat' : `${cats.toLocaleString('en-US')} cats`;
  const more = Math.max(0, cats - shown.length);
  if (!more) return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return `${shown.join(', ')} and ${more.toLocaleString('en-US')} more`;
}

/** The DJ line: "Shout-out to Mochi, Pixel and 3 more! Shout-out to @handle!" (text only). */
export function shoutOutText(names: readonly string[], cats: number, x?: string | null): string {
  const head = `Shout-out to ${namesSummary(names, cats)}!`;
  return x ? `${head} Shout-out to @${x}!` : head;
}
