// Ghost recording (SHARE lane): every run is taped from its stageStart at GHOST_HZ of run time (G.time), so a
// finished run can become a challenge link that carries the player's ghost. Plain endless runs are recorded as a
// 'daily' course with the session seed (makeRng(G.seed) rebuilds the same course) and the landscape they used.
import { events } from '../core/events';
import { addStepHook } from '../core/loop';
import { P } from '../core/player';
import { G, game } from '../core/state';
import type { RunResult, StageDef, ThemeId } from '../core/types';
import { ugc } from '../ugc/contract';
import { encodeLook } from '../wardrobe/look';
import type { Challenge, ChallengeStage } from './code';
import { dailyCfg } from './dailystage';
import { F_ABILITY, F_AIR, F_CUT, F_SLIDE, GHOST_HZ, GhostTape, packGhost } from './ghost';
import { packScores, SCORE_HZ, ScoreTape } from './scores';

export interface RunTape {
  stage: ChallengeStage | null;
  seed?: number;
  theme?: ThemeId;
  trail?: string;
  /** start s (0 = a full run; only full runs make challenge links) */
  startAt: number;
}
export interface FinishedRun extends RunTape {
  result: RunResult;
  look: string;
  chain: number;
  ghost: Uint8Array;
  /** the running score (scores.ts), so a race against this run compares score at the same distance */
  scores: Uint8Array;
}

const tape = new GhostTape(GHOST_HZ * 60 * 20);
const scoreTape = new ScoreTape();
let nextScoreT = 0;
const cur: RunTape = { stage: null, startAt: 0 };
let live = false;
let nextT = 0;
let cut = false;
let lastS = 0;
let finished: FinishedRun | null = null;

export const recording = {
  get samples() {
    return tape.n;
  },
  get live() {
    return live;
  },
};
/** the last finished run (null before one) */
export const lastFinished = (): FinishedRun | null => finished;

function kindOf(stage: StageDef): RunTape {
  switch (stage.id) {
    case 'meadow':
    case 'gorge':
    case 'sunset':
      return { stage: stage.id, startAt: 0 };
    case 'endless':
      return { stage: 'daily', seed: G.seed >>> 0 || 1, theme: stage.theme, startAt: 0 };
    case 'daily':
      return { stage: 'daily', seed: dailyCfg.seed, theme: dailyCfg.theme, startAt: 0 };
    case 'trail': {
      const code = ugc.currentTrailCode();
      return code ? { stage: 'trail', trail: code, startAt: 0 } : { stage: null, startAt: 0 };
    }
    default:
      return { stage: null, startAt: 0 };
  }
}

function sample(): void {
  let f = 0;
  if (P.sliding) f |= F_SLIDE;
  if (!P.grounded) f |= F_AIR;
  if (P.ability) f |= F_ABILITY;
  // a respawn or fall teleport, or anything faster than a kitten can run, is a cut (no interpolation across it)
  const ds = P.s - lastS;
  if (cut || ds < -0.05 || ds > 80 / GHOST_HZ) f |= F_CUT;
  cut = false;
  lastS = P.s;
  tape.push(P.s, P.x, P.y, tape.n === 0 ? f & ~F_CUT : f);
}

export function initRecording(): void {
  events.on('stageStart', ({ stage, at }) => {
    tape.clear();
    scoreTape.clear();
    scoreTape.push(G.score);
    nextScoreT = 1 / SCORE_HZ;
    Object.assign(cur, { seed: undefined, theme: undefined, trail: undefined }, kindOf(stage));
    cur.startAt = at;
    live = cur.stage !== null;
    nextT = 1 / GHOST_HZ;
    cut = false;
    lastS = P.s;
    if (live) sample();
  });
  events.on('respawn', () => (cut = true));
  events.on('fall', () => (cut = true));
  events.on('quit', () => (live = false));
  // the crossing itself (the next grid sample would come after G.time stopped): the ghost ends on the line
  events.on('finishLine', () => {
    if (live && !tape.full && P.s > lastS) sample();
    // the score at the line (with the finish bonus), on the next grid slot
    if (live) {
      scoreTape.push(G.score);
      nextScoreT = Infinity;
    }
  });
  addStepHook(() => {
    if (!live || game.mode !== 'play') return;
    while (G.time >= nextT - 1e-9 && !tape.full) {
      sample();
      nextT += 1 / GHOST_HZ;
    }
    while (G.time >= nextScoreT - 1e-9 && scoreTape.n < scoreTape.cap) {
      scoreTape.push(G.score);
      nextScoreT += 1 / SCORE_HZ;
    }
  });
  events.on('stageEnd', ({ result }) => {
    if (!live) {
      finished = { stage: null, startAt: 0, result, look: '000000', chain: 0, ghost: new Uint8Array(0), scores: new Uint8Array(0) };
      return;
    }
    live = false;
    let look = '000000';
    let chain = 0;
    try {
      look = encodeLook(ugc.currentLook());
      chain = ugc.styleSummary().bestChain;
    } catch {
      /* other lanes' defaults */
    }
    // an endless run that ran out of hearts: its final score is the last sample
    if (scoreTape.n > 0 && scoreTape.v[scoreTape.n - 1] !== result.score && nextScoreT !== Infinity) scoreTape.push(result.score);
    finished = { ...cur, result, look, chain, ghost: packGhost(tape.g), scores: packScores(scoreTape.v, scoreTape.n) };
  });
}

/** the challenge this run makes (name filled in by the caller); null = not challengeable */
export function challengeOf(run: FinishedRun, name: string, allowPartial: boolean): Challenge | null {
  if (!run.stage || (run.startAt > 0 && !allowPartial)) return null;
  return {
    v: 1,
    stage: run.stage,
    seed: run.seed,
    theme: run.theme,
    trail: run.trail,
    score: run.result.score,
    name,
    look: run.look,
    chain: run.chain,
    ghost: run.ghost,
    scores: run.scores,
  };
}
