/**
 * The results headline (iteration 4, F7): the one line that matters, under the place and the time. Pure, so the choice
 * is unit tested (share.test.ts). Only numbers this device measured in this race: the recomputed dare ghost time, the
 * sub-tick finish margin (`core/app/finish.ts`, the same call the photo-finish stamp and the clip use), the best time
 * kept on this device.
 *
 * Priority: a dare ghost's result, a photo finish, the margin to the nearest cat, a new best (or how far off it a time
 * trial was). Null when none applies (a DNF, a battle).
 *
 * The share lane notes what the results screen cannot see on its own (was this a new best, is the ghost time still
 * being recomputed) with `noteResult`; `core/hud/results.ts` asks `headlineFor` when it draws and when it updates.
 */
import type { RaceResult } from '../../types';
import { finishMargin, isPhotoFinish } from '../../core/app/finish';
import { t } from '../../ui/i18n';

export type HeadlineTone = 'win' | 'lose' | 'photo' | 'best' | 'plain';

export interface Headline {
  kind: 'ghost' | 'photo' | 'rival' | 'best' | 'pending';
  tone: HeadlineTone;
  text: string;
}

export interface HeadlineIn {
  result: Pick<RaceResult, 'places' | 'player' | 'mode'>;
  /** the dare ghost raced (time null = never finished) */
  ghost?: { name: string; time: number | null } | null;
  /** the ghost's time is still being recomputed */
  ghostPending?: boolean;
  /** the best on this device for this race setup before this run (null: first run here) */
  prevBest?: number | null;
}

const s2 = (x: number) => x.toFixed(2);

export function pickHeadline(h: HeadlineIn): Headline | null {
  const r = h.result;
  const me = r.player;
  const my = me.time;
  if (r.mode === 'battle') return null;
  const g = h.ghost;
  if (g) {
    if (h.ghostPending) return { kind: 'pending', tone: 'plain', text: t("Checking {name}'s ghost…", { name: g.name }) };
    // a dead heat to the hundredth (a replayed run, or a real tie): nobody lost
    if (my != null && g.time != null && Math.abs(my - g.time) < 0.005) return { kind: 'ghost', tone: 'photo', text: t("Dead heat with {name}'s ghost!", { name: g.name }) };
    const won = my != null && (g.time == null || my < g.time);
    if (won) {
      return g.time != null
        ? { kind: 'ghost', tone: 'win', text: t("You beat {name}'s ghost by {s} s", { name: g.name, s: s2(g.time - my!) }) }
        : { kind: 'ghost', tone: 'win', text: t("You beat {name}'s ghost", { name: g.name }) };
    }
    if (my != null && g.time != null) return { kind: 'ghost', tone: 'lose', text: t("Lost to {name}'s ghost by {s} s", { name: g.name, s: s2(my - g.time) }) };
    return { kind: 'ghost', tone: 'lose', text: t("{name}'s ghost won", { name: g.name }) };
  }
  if (my == null) return null;
  const m = r.mode === 'tt' ? null : finishMargin(r, me.kart);
  if (m && isPhotoFinish(m)) return { kind: 'photo', tone: 'photo', text: t('PHOTO FINISH by {s} s', { s: s2(m.margin) }) };
  const best = h.prevBest;
  const newBest = best == null || my < best;
  if (m && !m.projected) {
    const other = r.places.find((p) => p.kart === m.other)?.name ?? '';
    if (m.won && me.place === 1) return { kind: 'rival', tone: 'win', text: t('WON BY {s} s', { s: s2(m.margin) }) };
    if (!m.won) return { kind: 'rival', tone: 'lose', text: t('{name} beat you by {s} s', { name: other, s: s2(m.margin) }) };
    if (newBest && best != null) return { kind: 'best', tone: 'best', text: t('New best by {s} s', { s: s2(best - my) }) };
    return { kind: 'rival', tone: 'win', text: t('You held off {name} by {s} s', { name: other, s: s2(m.margin) }) };
  }
  if (best != null && newBest) return { kind: 'best', tone: 'best', text: t('New best by {s} s', { s: s2(best - my) }) };
  if (best == null) return { kind: 'best', tone: 'best', text: t('New best') };
  if (r.mode === 'tt') return { kind: 'best', tone: 'plain', text: t('{s} s off your best', { s: s2(my - best) }) };
  return null;
}

/** What the share lane knows about a result (keyed by the result object the shell hands to both). */
export interface ResultNote {
  prevBest?: number | null;
  ghostPending?: boolean;
  /** a duel (the ghost only, no field) */
  duel?: boolean;
}

const notes = new WeakMap<object, ResultNote>();
let lastNote: { places: unknown; note: ResultNote } | null = null;

export function noteResult(result: RaceResult, n: ResultNote): void {
  notes.set(result, n);
  lastNote = { places: result.places, note: n };
}

export function updateNote(result: RaceResult, patch: Partial<ResultNote>): void {
  const n = notes.get(result) ?? (lastNote?.places === result.places ? lastNote.note : null);
  if (n) Object.assign(n, patch);
}

/** The note for `result` (or the last one noted, for a refreshed copy of the same race's result). */
export function resultNote(result: RaceResult): ResultNote | null {
  return notes.get(result) ?? lastNote?.note ?? null;
}

export function headlineFor(result: RaceResult, ghost?: { name: string; time: number | null } | null): Headline | null {
  const n = resultNote(result);
  return pickHeadline({ result, ghost, ghostPending: !!n?.ghostPending, prevBest: n?.prevBest });
}

/** The "•••" tray button's accessible name (the share lane's string table). */
export function moreLabel(): string {
  return t('More');
}
