/**
 * Share texts (GDD 9.2, 13). Honest by construction: only numbers this device measured (place, race time), no global
 * ranks, no counts of players or races, and nothing that says or implies that racing gives money to the shelter.
 * The Pink Paw line says what is true: the rival cats are real cats from the shelter, and the payouts page shows what
 * Token Tails has paid out to it. Pure; `card-text.test.ts` checks the banned phrases.
 */
import { bandEmoji } from '../daily/daily';
import { SHELTER_PAYOUTS_URL } from '../links/link';

export const HASHTAG = '#formulameow';

export function fmtRaceTime(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return 'DNF';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function ordinalText(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

export const PINK_PAW_SHARE_LINE = `The rival cats are real cats from Pink Paw, a shelter in Lithuania. Shelter payouts: ${SHELTER_PAYOUTS_URL}`;

/** The clip intro's rivals line, from the field the run had; null when the player raced alone (a time trial). */
export function rivalsLine(racers: number): string | null {
  const n = racers - 1;
  if (n < 1) return null;
  return `vs ${n} real Pink Paw shelter cat${n === 1 ? '' : 's'}`;
}

export interface DareTextIn {
  trackName: string;
  time: number | null;
  place: number;
  link: string;
  /** set when the sender just beat someone's ghost */
  beat?: string | null;
  /** racers in the field (1: a time trial or a ghost duel, so no place out of 8) */
  field?: number;
  /** the stunt brag (clip/highlight.ts stuntBrag), e.g. "3 loops, STUNT COMBO ×4 🌀" */
  brag?: string | null;
}

/** "2nd/8 · 1:31.20", or just the time when the player raced alone. */
function placeTime(place: number, time: number | null, field = 8): string {
  return field > 1 ? `${ordinalText(place)}/${field} · ${fmtRaceTime(time)}` : fmtRaceTime(time);
}

/** "Beat 1:24.31 →" share text (GDD 8.2). */
export function dareText(d: DareTextIn): string {
  const field = d.field ?? 8;
  const head = d.beat
    ? `I just beat ${d.beat}'s ghost on ${d.trackName} in ${fmtRaceTime(d.time)}. Your turn.`
    : d.time != null
      ? field > 1
        ? `My cat ran ${d.trackName} in ${fmtRaceTime(d.time)} (${ordinalText(d.place)}/${field}). Beat my ghost.`
        : `My cat ran ${d.trackName} in ${fmtRaceTime(d.time)}. Beat my ghost.`
      : `My cat raced ${d.trackName}. Beat my ghost.`;
  const brag = d.brag ? `\n${d.brag}` : '';
  return `${head}${brag}\n${d.link}\n${HASHTAG}`;
}

/** Caption that goes with the finish clip or result card ("2nd/8 · 1:31.20 · 3 loops, STUNT COMBO ×4 🌀 on …"). */
export function clipCaption(d: { trackName: string; time: number | null; place: number; link: string; field?: number; brag?: string | null }): string {
  const brag = d.brag ? ` · ${d.brag}` : '';
  return `${placeTime(d.place, d.time, d.field)}${brag} on ${d.trackName} in Formula Meow. Beat my cat: ${d.link} ${HASHTAG}`;
}

/** Wordle-style daily card (GDD 9.2). */
export function dailyCardText(d: { day: number; place: number; time: number | null; laps: readonly number[]; link: string; streak?: number; ghost?: boolean; stunts?: boolean }): string {
  // a ranked run with stunts (a loop, a wall ride or a clean landing) gets the stunt emoji after the lap squares (F8)
  const squares = d.laps.map(bandEmoji).join('') + (d.stunts ? ' 🌀' : '');
  const streak = d.streak && d.streak > 1 ? ` · ${d.streak}-day streak` : '';
  // with a ghost in the link, the receiver races this exact run: say so in the chat preview
  const beat = d.ghost && d.time != null ? `\nBeat my ${fmtRaceTime(d.time)} 👻` : '';
  return `Formula Meow Daily #${d.day} · ${ordinalText(d.place)}/8 · ${fmtRaceTime(d.time)}${streak}\n${squares}${beat}\n${d.link}`;
}

/** Phrases a share text must never contain (GDD 13: the game itself moves no money). */
export const BANNED_CLAIMS: readonly RegExp[] = [
  /each race (donates|gives|helps)/i,
  /proceeds/i,
  /\bdonat(e|es|ed|ing)\b.*\brace/i,
  /cats? (helped|saved|rescued)/i,
  /\b\d[\d,.]*\s*(players|races|racers)\b/i,
  /world(wide)? (rank|record)/i,
  /#\d+ in the world/i,
];
