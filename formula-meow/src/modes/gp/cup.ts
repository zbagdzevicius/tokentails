/**
 * Grand Prix rules (pure, unit tested): the cup field, points 15/12/10/8/6/4/2/1, standings with the tie-break (the
 * better place in the last race), the grid of each race (reverse standings: the leader starts at the back) and the
 * seed of each race. The flow (gp/gp-flow.ts) turns these into shell race requests.
 */
import { DEFAULT_CAT, Modifier, type CatSpec, type KartLook, type RaceClass, type RacerInfo } from '../../types';
import { CUP_POINTS, cupById, type CupDef } from '../../content/cups';
import type { CupId } from '../../content/ids';
import { buildField } from '../../items-ai';
import { personalityFor } from '../../items-ai/ai/personalities';
import { kartLookFor } from '../../items-ai';
import { pinkPawCatSpec, pinkPawWaiting } from '../../share/pinkpaw/pink-paw';
import type { ClassPick, CupRacer, CupRun } from '../store';

export const CUP_RACES = 4;
/** the player's grid slot in race 1 (6th, as in a quick race: overtakes come early) */
export const FIRST_RACE_SLOT = 5;

/** Sim class of a class pick (Mirror races on 150cc numbers). */
export function simClass(c: ClassPick): RaceClass {
  return (c === 3 ? 2 : c) as RaceClass;
}

/** Modifiers of a cup race for a class pick (Mirror flips every track; a mirrored race stays mirrored). */
export function raceModifiers(cup: CupDef, race: number, c: ClassPick): number {
  const m = cup.races[race]?.modifiers ?? 0;
  return c === 3 ? m | Modifier.Mirror : m;
}

/** Seed of race `race` of a cup (deterministic from the cup seed). */
export function raceSeed(cupSeed: number, race: number): number {
  let h = (cupSeed ^ Math.imul(race + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h & 0x7fffffff;
}

export interface CupPlayer {
  name: string;
  cat: CatSpec;
  kart: KartLook;
  /** a Pink Paw id when the player races as a roster cat (that cat is not also an AI) */
  pinkPawId?: string;
  hat?: number;
}

/** The 8 cats of a cup: the player plus 7 Pink Paw cats with personalities from the cup seed. */
export function buildCupField(seed: number, cls: ClassPick, player: CupPlayer): CupRacer[] {
  const base = buildField({ seed, cls: simClass(cls), playerSlot: 0, playerName: player.name, playerCat: player.cat, playerKart: player.kart });
  const field: CupRacer[] = [{ name: player.name, cat: player.cat, kart: player.kart, player: true, pinkPawId: player.pinkPawId, hat: player.hat }];
  // never race against yourself: a roster cat the player drives is swapped for one that is not in the field yet
  const used = new Set<string>(player.pinkPawId ? [player.pinkPawId] : []);
  for (const r of base.slice(1)) if (r.pinkPawId) used.add(r.pinkPawId);
  const spare = pinkPawWaiting().filter((c) => !used.has(c.id));
  base.slice(1).forEach((r, i) => {
    let info: CupRacer = { name: r.name, cat: r.cat, kart: r.kart, ai: personalityFor(seed, i + 1, simClass(cls)), pinkPawId: r.pinkPawId };
    if (player.pinkPawId && r.pinkPawId === player.pinkPawId) {
      const c = spare.shift();
      info = c ? { ...info, name: c.name, cat: pinkPawCatSpec(c), pinkPawId: c.id } : { ...info, name: `Cat ${i + 2}`, cat: DEFAULT_CAT, pinkPawId: undefined };
    }
    if (!info.kart) info.kart = kartLookFor(i + 1);
    field.push(info);
  });
  return field;
}

/** A fresh cup run. */
export function newCup(cupId: CupId, cls: ClassPick, seed: number, player: CupPlayer): CupRun {
  return {
    cupId,
    cls,
    seed,
    race: 0,
    field: buildCupField(seed, cls, player),
    points: new Array<number>(8).fill(0),
    lastPlaces: new Array<number>(8).fill(0),
    history: [],
    rival: -1,
  };
}

export const playerIndex = (run: CupRun): number => run.field.findIndex((r) => r.player);

/** Field indices by standing (points desc; ties: the better place in the last race, then the field order). */
export function standings(run: Pick<CupRun, 'points' | 'lastPlaces'>): number[] {
  const idx = run.points.map((_, i) => i);
  idx.sort((a, b) => run.points[b] - run.points[a] || (run.lastPlaces[a] || 99) - (run.lastPlaces[b] || 99) || a - b);
  return idx;
}

/**
 * Grid of race `run.race`: slot → field index. Race 1: the AI in field order with the player 6th. Then reverse
 * standings: the last in the standings starts on pole, the leader at the back.
 */
export function gridOrder(run: CupRun): number[] {
  if (run.race === 0 || run.history.length === 0) {
    const me = playerIndex(run);
    const ai = run.field.map((_, i) => i).filter((i) => i !== me);
    const grid = ai.slice();
    grid.splice(FIRST_RACE_SLOT, 0, me);
    return grid;
  }
  return standings(run).reverse();
}

/** The racers of the next race in grid order, with the rival flag; and the player's slot. */
export function raceField(run: CupRun): { racers: RacerInfo[]; slot: number; grid: number[] } {
  const grid = gridOrder(run);
  const racers = grid.map((fi) => {
    const r = run.field[fi];
    const info: RacerInfo = { name: r.name, cat: r.cat, kart: r.kart };
    if (r.ai) info.ai = r.ai;
    if (r.pinkPawId) info.pinkPawId = r.pinkPawId;
    if (r.hat) info.hat = r.hat;
    if (fi === run.rival) info.rival = true;
    return info;
  });
  return { racers, slot: grid.indexOf(playerIndex(run)), grid };
}

/** Points for a place (1-based). */
export const pointsFor = (place: number): number => CUP_POINTS[place - 1] ?? 0;

/**
 * Score a finished race: `placeBySlot[slot]` is the place of the kart in grid slot `slot`. Returns the points each
 * field index gained. Mutates `run` (points, last places, history, next race).
 */
export function scoreRace(run: CupRun, grid: readonly number[], placeBySlot: readonly number[]): number[] {
  const gained = new Array<number>(run.field.length).fill(0);
  const places = new Array<number>(run.field.length).fill(8);
  grid.forEach((fi, slot) => {
    const p = placeBySlot[slot] ?? 8;
    places[fi] = p;
    gained[fi] = pointsFor(p);
    run.points[fi] += gained[fi];
  });
  run.lastPlaces = places;
  run.history.push(places);
  run.race++;
  return gained;
}

/** Final place of the player in the cup (1-based) and the trophy (1 gold, 2 silver, 3 bronze, 0 none). */
export function cupOutcome(run: CupRun): { place: number; trophy: number; points: number } {
  const order = standings(run);
  const me = playerIndex(run);
  const place = order.indexOf(me) + 1;
  return { place, trophy: place <= 3 ? place : 0, points: run.points[me] };
}

export function cupDef(run: CupRun): CupDef {
  return cupById(run.cupId)!;
}
