/**
 * Text for the image cards (GDD 7.4, 9.2): Rap Sheet "WANTED FOR" line, cat card, cameo card, carousel. Pure
 * (tested with a fake measure); the painters in cards.ts draw what these return.
 */
import { type CatSpec, type Pattern, type RapSheetSummary, type WeeklySummary } from '../types';
import { formatThousands } from './emoji-card';
import { catOrDefault } from './clip/captions';

export const PATTERN_LABEL: Record<Pattern, string> = {
  solid: 'Solid',
  tabby: 'Tabby',
  tuxedo: 'Tuxedo',
  bicolor: 'Bicolour',
  calico: 'Calico',
  colorpoint: 'Colourpoint',
  tortie: 'Tortie',
};

export function catName(cat: Pick<CatSpec, 'name'> | null | undefined): string {
  return catOrDefault(cat?.name ?? '');
}

/** "wine glass" x 5 -> "wine glasses"; 1 -> "wine glass". English-only, enough for prop names. */
export function plural(noun: string, n: number): string {
  const w = noun.trim().toLowerCase();
  if (n === 1 || !w) return w;
  if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(knife)$/.test(w)) return `${w.slice(0, -2)}ves`;
  return `${w}s`;
}

/**
 * Crimes that are something that happened to the cat, not a thing it broke (round 3: "WANTED FOR: 1 cuddled").
 */
const DEED_CRIMES: Record<string, (n: string) => string> = {
  cuddled: (n) => `getting cuddled ${n}×`,
};

/** "212 vases" with thousands separators; "getting cuddled 3×" for the special crimes. */
export function crimeCount(c: { name: string; count: number }): string {
  const deed = DEED_CRIMES[c.name.trim().toLowerCase()];
  if (deed) return deed(formatThousands(c.count));
  return `${formatThousands(c.count)} ${plural(c.name, c.count)}`;
}

/** "WANTED FOR: 212 vases, 14 cakes, framed the Roomba 9×" (top 2–3 crimes, then the Roomba). */
export function wantedFor(s: Pick<RapSheetSummary, 'topCrimes' | 'framed' | 'total'>, maxCrimes = 3): string {
  const parts = s.topCrimes.slice(0, s.framed > 0 ? Math.min(2, maxCrimes) : maxCrimes).map(crimeCount);
  if (s.framed > 0) parts.push(`framed the Roomba ${formatThousands(s.framed)}×`);
  if (!parts.length) return 'WANTED FOR: being suspiciously innocent';
  return `WANTED FOR: ${parts.join(', ')}`;
}

/** "Streak 12 · 214 crimes" line under the rank. */
export function rapSheetStats(s: Pick<RapSheetSummary, 'streak' | 'total' | 'distinct' | 'catalog'>): string {
  const bits = [`${formatThousands(s.total)} ${s.total === 1 ? 'crime' : 'crimes'}`, `${s.distinct}/${s.catalog} on file`];
  if (s.streak > 0) bits.unshift(`🔥 ${s.streak}-day streak`);
  return bits.join(' · ');
}

/** "MOST WANTED: Mochi, Luna" (Club credit) or null. */
export function mostWantedLine(w: Pick<WeeklySummary, 'mostWanted'> | null | undefined, max = 4): string | null {
  const names = (w?.mostWanted ?? []).map((n) => n.trim()).filter(Boolean);
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return `MOST WANTED: ${shown.join(', ')}${more > 0 ? ` +${more}` : ''}`;
}

export type CameoWhere = 'fridge' | 'window' | 'shelf' | 'guest_star';

const WHERE: Record<CameoWhere, string> = {
  fridge: 'find her on the fridge',
  window: 'find her in the window',
  shelf: 'find her on the shelf',
  guest_star: "she's today's guest star",
};

/** "Mochi is in Kitchen #18 · find her on the fridge" (GDD 7.4 / 9.2 cameo card). */
export function cameoLine(cat: Pick<CatSpec, 'name'>, dayLabel: string, where: CameoWhere): string {
  return `${catName(cat)} is in ${dayLabel.trim() || 'today’s room'} · ${WHERE[where] ?? WHERE.fridge}`;
}

/** Strip the protocol: "https://tokentails.com/badcat" -> "tokentails.com/badcat". */
export function bareUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** "Make your cat: tokentails.com/badcat". */
export function makeYourCatLine(link: string): string {
  return `Make your cat: ${bareUrl(link)}`;
}

/** Carousel last slide. */
export function yourCatNextLine(shortUrl: string): string {
  return `Your cat next? ${bareUrl(shortUrl)}`;
}

export interface Measurer {
  /** Width of `text` at `px`. */
  (text: string, px: number): number;
}

/**
 * Fit text into at most `maxLines` lines of `maxW`, shrinking from startPx to minPx; at minPx the last line is
 * cut with "…" (long names and huge numbers never overflow the card).
 */
export function fitText(measure: Measurer, text: string, maxW: number, maxLines: number, startPx: number, minPx: number): { px: number; lines: string[]; cut: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const wrap = (px: number): string[] => {
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (measure(next, px) <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  for (let px = startPx; px >= minPx; px -= 2) {
    const lines = wrap(px);
    if (lines.length <= maxLines && lines.every((l) => measure(l, px) <= maxW)) return { px, lines, cut: false };
  }
  const lines = wrap(minPx).slice(0, maxLines);
  const last = lines.length - 1;
  if (last >= 0) {
    let l = lines[last];
    const chars = Array.from(l);
    while (chars.length > 1 && measure(`${chars.join('')}…`, minPx) > maxW) chars.pop();
    l = chars.join('');
    lines[last] = `${l.replace(/[\s,·]+$/, '')}…`;
  }
  return { px: minPx, lines, cut: true };
}

/** Rough width model for tests and Node (no canvas): average glyph = 0.56 em, wide emoji = 1 em. */
export const approxMeasure: Measurer = (text, px) => {
  let w = 0;
  for (const ch of text) w += /\p{Extended_Pictographic}/u.test(ch) ? 1 : /[A-Z0-9@#%&WM]/.test(ch) ? 0.68 : 0.56;
  return w * px;
};
