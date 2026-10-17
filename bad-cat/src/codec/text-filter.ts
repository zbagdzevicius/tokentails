/**
 * Name and title filter (GDD 6.7). Runs on encode and again on decode, so hand-made links are filtered too.
 * Steps: NFKC, strip control characters, URLs, e-mails, @handles and phone numbers, keep letters, digits,
 * spaces and 20 whitelisted emoji, collapse spaces, cap the length, then a small multi-language block list
 * (leetspeak-normalised). A blocked string becomes '' (the UI shows "A Cat" / "Untitled Room").
 */

/** 20 whitelisted single-code-point emoji. */
export const NAME_EMOJI: readonly string[] = [
  '🐱', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
  '🐈', '🐾', '💖', '⭐', '✨', '🔥', '👑', '🎀', '🌸', '🍀',
];
const EMOJI_SET = new Set(NAME_EMOJI);

/** Blocked as a substring of the letters-only, repeat-collapsed text (stems are long enough not to hit normal words). */
const STEMS: readonly string[] = [
  // EN
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'bitch', 'pussy', 'rapist',
  'hitler', 'nazi', 'porn', 'penis', 'vagina', 'molest', 'pedo',
  // LT
  'bybis', 'pyzda', 'kurva', 'pydaras', 'nachui',
  // ES
  'mierda', 'pendejo', 'maricon', 'cabron', 'gilipollas',
  // PT
  'caralho', 'buceta', 'viado', 'foder',
  // DE
  'scheisse', 'fotze', 'wichser', 'hurensohn', 'arschloch',
  // FR
  'putain', 'salope', 'connard', 'encule', 'merde',
  // PL
  'kurwa', 'chuj', 'jebac', 'pierdol', 'skurwysyn',
  // RU (latin transliteration and Cyrillic)
  'pizda', 'blyat', 'blyad', 'xuy', 'хуй', 'пизд', 'ебан', 'ебат', 'бляд', 'мудак', 'пидор',
];
/** Blocked only as a whole word (they are substrings of harmless words). */
const WORDS: ReadonlySet<string> = new Set([
  'ass', 'cock', 'dick', 'cum', 'fag', 'sex', 'rape', 'kys', 'puta', 'puto', 'cono', 'porra', 'pute', 'suka',
  'сука',
]);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '$': 's', '@': 'a', '!': 'i', '|': 'i', '€': 'e' };

const collapse = (s: string): string => s.replace(/(.)\1+/gu, '$1');
const deaccent = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '');
const COLLAPSED_STEMS = STEMS.map((x) => collapse(deaccent(x)));
const PLAIN_WORDS: ReadonlySet<string> = new Set([...WORDS].map(deaccent));

function leet(s: string): string {
  let out = '';
  for (const ch of s) out += LEET[ch] ?? ch;
  return out;
}

/** True if the text (any form) hits the block list. */
export function isBlocked(raw: string): boolean {
  const low = leet(raw.normalize('NFKC').toLowerCase().replace(/ß/gu, 'ss'));
  // Accents off for matching only (é -> e), so 'enculé' is caught.
  const plain = deaccent(low);
  const letters = collapse(plain.replace(/[^\p{L}]+/gu, ''));
  for (const s of COLLAPSED_STEMS) if (letters.includes(s)) return true;
  for (const w of plain.split(/[^\p{L}]+/u)) if (w && PLAIN_WORDS.has(w)) return true;
  return false;
}

const URL_RE = /(?:https?:\/\/|www\.)\S*|\S+\.(?:com|net|org|io|ly|me|gg|tv|app|xyz|ru|lt|co|uk|de|fr|es|pl|link|site|shop)\b\S*/giu;
const EMAIL_RE = /\S+@\S+/gu;
const HANDLE_RE = /@\w+/gu;
const CONTROL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'gu');
const PHONE_RE = /\+?\d[\d\s().-]{5,}\d/gu;

/** Raw input is cut to this many code points before any regex runs (ReDoS guard). */
const RAW_CAP = 64;

/** Filter a free-text name (cat 12, author 12) or title (24). '' when empty or blocked. */
export function filterText(raw: unknown, max = 12): string {
  if (typeof raw !== 'string') return '';
  // Cut first: URL_RE / EMAIL_RE backtrack quadratically, and names are <= 24 code points anyway.
  let s = Array.from(raw.slice(0, 256)).slice(0, RAW_CAP).join('').normalize('NFKC');
  s = Array.from(s).slice(0, RAW_CAP).join('');
  if (isBlocked(s)) return '';
  s = s.replace(CONTROL_RE, " ");
  s = s.replace(URL_RE, ' ').replace(EMAIL_RE, ' ').replace(HANDLE_RE, ' ').replace(PHONE_RE, ' ');
  let kept = '';
  for (const ch of s) {
    if (/[\p{L}\p{M}\p{N}]/u.test(ch) || EMOJI_SET.has(ch)) kept += ch;
    else if (/\s/u.test(ch) || ch === '-' || ch === '\'' || ch === '.') kept += ch === '-' || ch === '\'' || ch === '.' ? ch : ' ';
    // everything else (variation selectors, symbols, other emoji, punctuation) is dropped
  }
  kept = kept.replace(/\s+/gu, ' ').trim();
  const cps = Array.from(kept);
  if (cps.length > max) kept = cps.slice(0, max).join('').trim();
  if (!/[\p{L}\p{N}]|[\u{1f300}-\u{1faff}⭐✨]/u.test(kept)) return '';
  if (isBlocked(kept)) return '';
  return kept;
}

/** Cat or author name, <= 12 code points. */
export function filterName(raw: string, max = 12): string {
  return filterText(raw, max);
}

/** Room title, <= 24 code points. */
export function filterTitle(raw: string, max = 24): string {
  return filterText(raw, max);
}
