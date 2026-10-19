/**
 * Rivals (ITERATION-2 progression): each Grand Prix and each Daily Cup names one AI as the player's rival. The pick
 * is the highest-skill AI that was not the last rival (Daily Cup: no memory, so every player gets the same rival on
 * the same day). `RacerInfo.rival` carries it into the race (the feel lane gives it behaviour); the HUD shows a chip
 * and the progression save keeps a head-to-head record by name.
 */
import type { RaceEvent, RacerInfo, RaceResult } from '../types';

/** Index of the rival in `racers`, or -1 when there is no AI. */
export function pickRival(racers: readonly RacerInfo[], humans: readonly number[], avoid: string | null = null): number {
  let best = -1;
  let bestSkill = -Infinity;
  let fallback = -1;
  let fallbackSkill = -Infinity;
  racers.forEach((r, i) => {
    if (humans.includes(i) || !r.ai) return;
    const skill = r.ai.skill;
    if (skill > fallbackSkill) {
      fallbackSkill = skill;
      fallback = i;
    }
    if (avoid != null && r.name === avoid) return;
    if (skill > bestSkill) {
      bestSkill = skill;
      best = i;
    }
  });
  return best >= 0 ? best : fallback;
}

/** Mark `idx` as the rival (copies: the caller's racers are never mutated). */
export function withRival(racers: readonly RacerInfo[], idx: number): RacerInfo[] {
  return racers.map((r, i) => (i === idx ? { ...r, rival: true } : r.rival ? { ...r, rival: false } : r));
}

/** Index of the racer with this name (a GP keeps its rival by name across the cup), or -1. */
export function rivalByName(racers: readonly RacerInfo[], humans: readonly number[], name: string): number {
  return racers.findIndex((r, i) => !humans.includes(i) && !!r.ai && r.name === name);
}

/** Did `me` hit kart `rival` with an item in this race? */
export function hitRival(events: readonly RaceEvent[], me: number, rival: number): boolean {
  if (rival < 0) return false;
  for (const e of events) if (e.type === 'hit' && e.kart === rival && e.b === me) return true;
  return false;
}

/** Head-to-head of one race: did the player finish ahead of the rival? (DNF counts as behind everyone who finished.) */
export function beatRival(result: RaceResult, rival: number): boolean | null {
  const me = result.places.find((p) => p.kart === result.player.kart);
  const them = result.places.find((p) => p.kart === rival);
  if (!me || !them) return null;
  return me.place < them.place;
}
