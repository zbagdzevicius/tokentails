// Run state shared by every lane. FROZEN. Mutated by core only (lanes call the APIs in score.ts, player.ts, session.ts).
import { BELLS, MAX_HEARTS, type Mode, type StageDef } from './types';
import type { Track } from './track';

export const game = {
  mode: 'title' as Mode,
  stage: null as StageDef | null,
  track: null as Track | null,
};

/** The current run. Reset by session.startStage. */
export const G = {
  score: 0,
  mult: 1,
  maxMult: 1,
  hearts: MAX_HEARTS,
  bells: new Array<boolean>(BELLS).fill(false),
  fish: 0,
  /** ability meter 0..1 (yarn / treats fill it; the puff cloud spends it) */
  meter: 0,
  time: 0,
  distance: 0,
  hits: 0,
  respawns: 0,
  /** checkpoint s values, ascending, first is the start */
  checkpoints: [0] as number[],
  cpIndex: 0,
  /** finish line s (Infinity in endless) */
  finishS: Infinity,
  /** 0..1 along the stage (endless: distance / 5000 wrapped) */
  progress: 0,
  endless: false,
  /** dev.invincible */
  invincible: false,
  /** run seed (endless generation, decorations) */
  seed: 1,
};

/** Player preferences core reads (meta-ui writes them from the save). */
export const prefs = {
  reducedMotion: false,
  /** 0..1 screen shake */
  shake: 1,
};
