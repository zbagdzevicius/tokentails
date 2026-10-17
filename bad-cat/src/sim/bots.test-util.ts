/**
 * Balance bots (review round 1): a random bot and a "freeze" bot that lets go of the stick 0.2 s after a turn
 * warning starts (a human's TELEGRAPH, or the mirror's glint) until the look is over. They compare rooms with each
 * other; they are not human scores. Used by balance.test.ts (and by hand: `npx vitest run src/sim/balance`).
 */
import { BTN_JUMP, BTN_SWAT, DEFAULT_CAT, HumanSt, NO_INPUT, type CatSpec, type Dir8, type PlayableRoom, type RunMode, type SimEvent, type TickInput } from '../types';
import { initSim, stepSim } from './sim';
import { mirrorPhase } from './v5';
import { content } from '../content';

export const BOT_CAT: CatSpec = DEFAULT_CAT;

/** xorshift32 for the bot's own choices (never the sim's RNG). */
function botRng(seed: number): () => number {
  let x = seed | 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export interface BotRun {
  score: number;
  caught: boolean;
  firstWakeTick: number;
  peakNoise: number;
  wish: boolean;
  wishTick: number;
}

export function playBot(play: PlayableRoom, kind: 'random' | 'freeze', seed: number, simVersion?: number): BotRun {
  const s = initSim(play, BOT_CAT, simVersion ? { simVersion } : undefined);
  const rnd = botRng(seed * 7919 + 13);
  const out: SimEvent[] = [];
  let dir: Dir8 = 0;
  let warnSince = -1;
  let firstWake = -1;
  let wishTick = -1;
  const cap = s.ticks + 200;
  while (!s.ended && s.tick < cap) {
    if (s.tick % 12 === 0 || rnd() < 0.04) dir = (Math.floor(rnd() * 9) as Dir8);
    let buttons = 0;
    if (rnd() < 0.08) buttons |= BTN_SWAT;
    if (rnd() < 0.02) buttons |= BTN_JUMP;
    let input: TickInput = { dir, speed: dir ? 2 : 0, buttons };
    if (kind === 'freeze') {
      const warned =
        s.humans.some((h) => h.state === HumanSt.TELEGRAPH || h.state === HumanSt.LOOK || h.state === HumanSt.FAKEOUT) ||
        mirrorPhase(s, play) !== 'off';
      if (warned) {
        if (warnSince < 0) warnSince = s.tick;
        if (s.tick - warnSince >= 6) input = NO_INPUT;
      } else warnSince = -1;
    }
    const before = out.length;
    stepSim(s, play, input, out);
    for (let i = before; i < out.length; i++) {
      const e = out[i];
      if (e.t === 'wake' && firstWake < 0) firstWake = e.tick;
      if (e.t === 'wish' && wishTick < 0) wishTick = e.tick;
    }
  }
  return { score: s.finalScore, caught: s.caughtTick >= 0, firstWakeTick: firstWake, peakNoise: s.maxNoise ?? 0, wish: s.wish === 1, wishTick };
}

export function playFor(dayNo: number | 'glass', mode: RunMode = 'ranked'): PlayableRoom {
  const room = dayNo === 'glass' ? content.glassRoom() : content.dailyRoom(dayNo);
  return content.resolve(room, mode, dayNo === 'glass' ? undefined : dayNo);
}

export interface BotStats {
  median: number;
  p90: number;
  caughtPct: number;
  zeroPct: number;
  wakePct: number;
  medianWakeTick: number;
}

const pct = (xs: number[], q: number): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
};

export function botStats(play: PlayableRoom, kind: 'random' | 'freeze', runs: number, simVersion?: number): BotStats {
  const rs: BotRun[] = [];
  for (let i = 0; i < runs; i++) rs.push(playBot(play, kind, i + 1, simVersion));
  const wakes = rs.filter((r) => r.firstWakeTick >= 0).map((r) => r.firstWakeTick);
  return {
    median: pct(rs.map((r) => r.score), 0.5),
    p90: pct(rs.map((r) => r.score), 0.9),
    caughtPct: Math.round((100 * rs.filter((r) => r.caught).length) / runs),
    zeroPct: Math.round((100 * rs.filter((r) => r.score === 0).length) / runs),
    wakePct: Math.round((100 * wakes.length) / runs),
    medianWakeTick: pct(wakes, 0.5),
  };
}
