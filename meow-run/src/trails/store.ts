// The trail the 'trail' stage plays now, and the player's saved trails (TRAILS lane). Browser module: it registers
// the stage and writes the save (only `trails` and `ugcStats.trailsFinished`, always from the live `save` binding).
import { stages } from '../core/registry';
import { TRAILS_MAX, type TrailEntry } from '../meta/save';
import { ugc, type TrailLoad } from '../ugc/contract';
import { save, setSave } from '../ui/flow';
import { trailStage } from './build';
import { decodeTrail, encodeTrail, type Trail } from './code';
import { STARTER, validateTrail } from './validate';

let current: { trail: Trail; code: string } = { trail: STARTER, code: encodeTrail(STARTER) };

/** make `trail` the course of the 'trail' stage (it is played the next time 'trail' starts) */
export function install(trail: Trail): string {
  const code = encodeTrail(trail);
  const t = decodeTrail(code) ?? trail;
  current = { trail: t, code };
  stages.add(trailStage(t));
  return code;
}
export const currentTrail = (): Trail => current.trail;
export const currentCode = (): string => current.code;

/** ugc.loadTrail: decode + validate + install (does not start the run) */
export function loadTrail(code: string): TrailLoad {
  const t = decodeTrail(typeof code === 'string' ? code.trim() : code);
  if (!t) return { ok: false, error: 'That trail code is broken' };
  const c = validateTrail(t);
  if (!c.ok) return { ok: false, error: c.errors[0]?.message ?? 'That trail does not work' };
  install(t);
  return { ok: true, name: t.name, author: t.author ?? '' };
}

// ---------------------------------------------------------------- saved trails
export const mine = (): readonly TrailEntry[] => save.trails.mine;
export const findMine = (code: string): TrailEntry | undefined => save.trails.mine.find((e) => e.code === code);

function write(list: TrailEntry[], finishedInc = 0): void {
  const s = save;
  setSave({
    ...s,
    trails: { ...s.trails, mine: list.slice(0, TRAILS_MAX) },
    ugcStats: finishedInc ? { ...s.ugcStats, trailsFinished: s.ugcStats.trailsFinished + finishedInc } : s.ugcStats,
  });
}

/**
 * Save a trail as one of mine: replaces the entry `prevCode` (an edit) or adds a new one at the top. An edit that
 * changes the course (not just the name) clears `finished` and `best` (the new course has to be finished again before it can be shared).
 * Returns false when the list is full.
 */
export function saveMine(trail: Trail, prevCode: string | null): { ok: boolean; code: string } {
  // a trail I made carries my name; a copy of someone else's keeps theirs
  if (!trail.author) {
    let me = '';
    try {
      me = ugc.playerName();
    } catch {
      me = '';
    }
    if (me) trail = { ...trail, author: me };
  }
  const code = encodeTrail(trail);
  const list = save.trails.mine.slice();
  const same = list.findIndex((e) => e.code === code);
  const prev = prevCode ? list.findIndex((e) => e.code === prevCode) : -1;
  // a rename keeps the course (the part of the code before '-'), so it keeps best and finished
  const head = (c: string) => c.slice(0, c.indexOf('-'));
  const keep = same >= 0 ? list[same] : prev >= 0 && head(list[prev].code) === head(code) ? list[prev] : null;
  const entry: TrailEntry = { code, name: decodeTrail(code)?.name ?? trail.name, best: keep?.best ?? 0, finished: keep?.finished ?? false, at: Date.now() };
  const drop = new Set([same, prev].filter((i) => i >= 0));
  if (drop.size === 0 && list.length >= TRAILS_MAX) return { ok: false, code };
  const next = [entry, ...list.filter((_, i) => !drop.has(i))];
  write(next);
  return { ok: true, code };
}

export function deleteMine(code: string): void {
  write(save.trails.mine.filter((e) => e.code !== code));
}

/** a 'trail' run ended: best + finished on my matching entry, and the lifetime finish counter */
export function recordTrailRun(score: number, finished: boolean): void {
  const list = save.trails.mine.slice();
  const i = list.findIndex((e) => e.code === current.code);
  if (i >= 0 && finished) list[i] = { ...list[i], finished: true, best: Math.max(list[i].best, Math.round(score)) };
  if (i < 0 && !finished) return;
  write(list, finished ? 1 : 0);
}
