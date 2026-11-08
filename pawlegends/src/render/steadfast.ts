/**
 * Sim v17 Steadfast (docs/plans/moba/V17.md §3.1, §7): the CC-cap immunity the sim grants after 2 s of hard CC in
 * 4 s. The render shows a white outline underfoot while the snapshot's Steadfast bit is set, and a one-off
 * "Steadfast!" word when it starts. Pure helpers (the views and the effects call them).
 */
import { BuffFlag } from '../sim/api';

/** The outline colour: white, never a team or relation colour (it is a rule, not a side). */
export const STEADFAST_OUTLINE = 0xffffff;
/** Its size against the hero ring and its alpha. */
export const STEADFAST_RING_SCALE = 1.6;
export const STEADFAST_ALPHA = 0.9;
/** The floating word. */
export const STEADFAST_WORD = 'Steadfast!';

export const isSteadfast = (buffs: number): boolean => (buffs & BuffFlag.Steadfast) !== 0;

/**
 * Heroes that turned Steadfast since the last call (pure apart from `was`, the caller's set of ids Steadfast last
 * frame, which it updates). A hero that was already Steadfast is not reported again.
 */
export function steadfastEdges(was: Set<number>, ents: readonly { id: number; kind: string; buffs: number; state?: string }[], out: number[] = []): number[] {
  out.length = 0;
  for (const e of ents) {
    if (e.kind !== 'hero') continue;
    const on = e.state !== 'dead' && isSteadfast(e.buffs);
    if (on && !was.has(e.id)) out.push(e.id);
    if (on) was.add(e.id);
    else was.delete(e.id);
  }
  return out;
}
