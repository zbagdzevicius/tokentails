/**
 * HERO_ANIM (ANIM-SPEC §3): THE one registry of per-hero move sets and skill FX, all 8 heroes. Each entry lazy-loads
 * its hero's two files (src/render/moves/<hero>.ts, src/render/skillfx/<hero>.ts) as their own chunks, during match
 * load; until a file is loaded (or when it is still a stub) the director falls back to the legacy Animator swing /
 * cast and effects.ts's generic shape switch, so a hero keeps today's look. Per-hero work replaces only those files.
 */
import { HERO_IDS } from '../../data/heroes';
import type { HeroId } from '../../data/heroes/types';
import { stubFx, stubMoves } from './common';
import type { MoveSet, SkillFxSet } from './types';

export interface HeroAnimEntry {
  moves: () => Promise<{ MOVES: MoveSet }>;
  fx: () => Promise<{ SKILL_FX: SkillFxSet }>;
}

export const HERO_ANIM: Readonly<Record<HeroId, HeroAnimEntry>> = Object.freeze({
  clem: { moves: () => import('../moves/clem'), fx: () => import('../skillfx/clem') },
  sage: { moves: () => import('../moves/sage'), fx: () => import('../skillfx/sage') },
  brutus: { moves: () => import('../moves/brutus'), fx: () => import('../skillfx/brutus') },
  cacklejaw: { moves: () => import('../moves/cacklejaw'), fx: () => import('../skillfx/cacklejaw') },
  lambo: { moves: () => import('../moves/lambo'), fx: () => import('../skillfx/lambo') },
  aviete: { moves: () => import('../moves/aviete'), fx: () => import('../skillfx/aviete') },
  bengas: { moves: () => import('../moves/bengas'), fx: () => import('../skillfx/bengas') },
  gabe: { moves: () => import('../moves/gabe'), fx: () => import('../skillfx/gabe') },
});

const STUB_MOVES = new Map<HeroId, MoveSet>(HERO_IDS.map((h) => [h, stubMoves(h)]));
const STUB_FX = new Map<HeroId, SkillFxSet>(HERO_IDS.map((h) => [h, stubFx(h)]));
const moves = new Map<HeroId, MoveSet>();
const fx = new Map<HeroId, SkillFxSet>();
const loading = new Map<HeroId, Promise<void>>();

/** Loads the heroes in a match (called during match load, before the first frame). A failed load stays a stub. */
export function loadHeroAnim(ids: readonly HeroId[]): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const h of new Set(ids)) {
    const e = HERO_ANIM[h];
    if (!e) continue;
    let p = loading.get(h);
    if (!p) {
      p = Promise.all([
        e.moves().then((m) => void (m.MOVES ? moves.set(h, m.MOVES) : undefined), () => undefined),
        e.fx().then((m) => void (m.SKILL_FX ? fx.set(h, m.SKILL_FX) : undefined), () => undefined),
      ]).then(() => undefined);
      loading.set(h, p);
    }
    jobs.push(p);
  }
  return Promise.all(jobs).then(() => undefined);
}

/** The hero's MoveSet (the stub until loaded). */
export function movesFor(h: HeroId): MoveSet {
  return moves.get(h) ?? (STUB_MOVES.get(h) as MoveSet);
}

/** The hero's SkillFxSet (the stub until loaded). */
export function skillFxFor(h: HeroId): SkillFxSet {
  return fx.get(h) ?? (STUB_FX.get(h) as SkillFxSet);
}

/** Tests and the gallery: install a move set / fx set without the loader (a demo set, a test double). */
export function setHeroAnim(h: HeroId, m: MoveSet | null, f: SkillFxSet | null = null): void {
  if (m) moves.set(h, m);
  else moves.delete(h);
  if (f) fx.set(h, f);
  else fx.delete(h);
}
