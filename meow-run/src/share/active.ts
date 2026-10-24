// The challenge being raced (SHARE lane): set by a ?c= link, kept for retries of the same course, dropped when the
// player starts anything else.
import type { ChallengeInfo } from '../ugc/contract';
import type { StageDef } from '../core/types';
import { ugc } from '../ugc/contract';
import type { Challenge } from './code';
import { dailyCfg } from './dailystage';

export const active = {
  challenge: null as Challenge | null,
  /** the last finished run against it: null while racing / before */
  won: null as boolean | null,
  /** that run's score */
  myScore: 0,
};

export function setChallenge(c: Challenge | null): void {
  active.challenge = c;
  active.won = null;
  active.myScore = 0;
}

/** the challenge's course is the one this stage plays now */
export function challengeMatches(c: Challenge, stage: StageDef): boolean {
  if (c.stage !== stage.id) return false;
  if (c.stage === 'daily') return dailyCfg.seed === c.seed;
  if (c.stage === 'trail') return ugc.currentTrailCode() === c.trail;
  return true;
}

export function activeChallenge(): ChallengeInfo | null {
  const c = active.challenge;
  if (!c) return null;
  return { name: c.name || 'A Mochi fan', score: c.score, stageId: c.stage, won: active.won };
}
