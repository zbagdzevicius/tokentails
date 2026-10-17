/**
 * Ghost race (GDD 6.3): each dare ghost replays in lockstep with the player under the rule set it was recorded with
 * (`initSim(play, cat, { simVersion })`); ghosts from an older rule set are "replay only": drawn and scored live but
 * never beaten or lost to. Pure apart from the sim calls; tested with the real sim.
 */
import { NO_INPUT, SIM_VERSION, type GhostRef, type PlayableRoom, type SimApi, type SimState } from '../../types';
import { formatScore } from '../copy';
import { HUD_COPY } from './copy-hud';

export interface GhostLane {
  ref: GhostRef;
  state: SimState;
  simVersion: number;
  replayOnly: boolean;
  name: string;
}

/** Rule set and replay-only flag of a ghost (a missing version is the current one). */
export function ghostRules(ref: GhostRef): { simVersion: number; replayOnly: boolean } {
  const v = typeof ref.simVersion === 'number' && Number.isFinite(ref.simVersion) ? ref.simVersion : SIM_VERSION;
  return { simVersion: v, replayOnly: ref.replayOnly === true || v < SIM_VERSION };
}

/** Starts up to `max` ghost lanes; a ghost whose rule set or cat fails to start is skipped (the others still race). */
export function createGhostLanes(sim: SimApi, play: PlayableRoom, refs: readonly GhostRef[] | undefined, max = 2): GhostLane[] {
  const lanes: GhostLane[] = [];
  for (const ref of (refs ?? []).slice(0, max)) {
    const r = ghostRules(ref);
    try {
      const state = sim.initSim(play, ref.cat, { simVersion: r.simVersion });
      lanes.push({ ref, state, simVersion: r.simVersion, replayOnly: r.replayOnly, name: ref.name || ref.cat?.name || 'Ghost' });
    } catch {
      /* a broken ghost is skipped */
    }
  }
  return lanes;
}

/** One lockstep tick for every live ghost (its own recorded input at its own tick). A ghost that throws just ends. */
export function stepGhostLanes(sim: SimApi, play: PlayableRoom, lanes: readonly GhostLane[]): void {
  for (const l of lanes) {
    const gs = l.state;
    if (gs.ended) continue;
    try {
      sim.stepSim(gs, play, l.ref.inputs[gs.tick] ?? NO_INPUT, []);
    } catch {
      gs.ended = 1;
    }
  }
}

/** Live score of a ghost: the running score, the final one once it ended. */
export function ghostScore(s: SimState): number {
  return s.ended ? s.finalScore : s.score;
}

export interface GhostChip {
  name: string;
  score: number;
  /** "Mochi 4,210" */
  label: string;
  /** "replay only (older version)" or '' */
  tag: string;
  /** Player vs ghost right now; null for replay-only ghosts (no beat / lose). */
  lead: 'ahead' | 'behind' | 'tie' | null;
  done: boolean;
}

/** HUD chip of a ghost lane against the player's live score (pure). */
export function ghostChip(lane: Pick<GhostLane, 'name' | 'replayOnly' | 'state'>, playerScore: number): GhostChip {
  const score = ghostScore(lane.state);
  const name = lane.name.length > 12 ? `${lane.name.slice(0, 11)}…` : lane.name;
  return {
    name,
    score,
    label: `${name} ${formatScore(score)}`,
    tag: lane.replayOnly ? HUD_COPY.ghostReplayOnly : '',
    lead: lane.replayOnly ? null : playerScore > score ? 'ahead' : playerScore < score ? 'behind' : 'tie',
    done: !!lane.state.ended,
  };
}
