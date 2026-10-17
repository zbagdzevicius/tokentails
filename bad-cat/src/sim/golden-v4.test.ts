/**
 * v4 golden replays (W1-SIM STEP 0). `fixtures/golden-v4.json` was recorded with the SIM_VERSION 4 rule code
 * before any v5 rule existed: 30 runs (The Glass, kitchen-v1..v7, two preview days) x (ranked, practice, ftue),
 * scripted prefixes plus seeded pseudo-random inputs. The fixture stores the resolved PlayableRooms themselves, so
 * later content edits can never move a golden run; `../content` is only used when re-recording.
 *
 * Re-record (only when the v4 rules were changed on purpose, which must never happen):
 *   BADCAT_GOLDEN_RECORD=1 npx vitest run src/sim/golden-v4.test.ts
 *
 * State digest: FNV-1a over a canonical (sorted keys, typed arrays as arrays) JSON of the final SimState without
 * the `rules` key (the v4 code had no such field). Events digest: FNV-1a over JSON.stringify(events) as emitted.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BTN_GRAB,
  BTN_JUMP,
  BTN_SWAT,
  CUDDLE_TICKS,
  DEFAULT_CAT,
  NO_INPUT,
  type Dir8,
  type PlayableRoom,
  type RunMode,
  type ShellDef,
  type SimEvent,
  type SimState,
  type Speed,
  type TickInput,
  DIR_DX as DX,
  DIR_DZ as DZ,
} from '../types';
import { decodeInputs, encodeInputs, initSim, nextRng, rngInt, runToEnd, seedRng, stepSim, hashState, swatTarget, type InputRun } from './index';
import { HumanSt } from '../types';
import { FNV_OFFSET, fnvInt } from './hash';

const FIXTURE = fileURLToPath(new URL('./fixtures/golden-v4.json', import.meta.url));
const RECORD = typeof process !== 'undefined' && process.env.BADCAT_GOLDEN_RECORD === '1';

interface GoldenRecord {
  name: string;
  mode: RunMode;
  inputSeed: number;
  script: number;
  finalScore: number;
  stamp: string;
  ticks: number;
  events: number;
  eventsDigest: number;
  stateDigest: number;
  /** Inputs as RLE runs (the bot runs are closed-loop, so the inputs are stored, not regenerated). */
  inputs: string; // 'dir.speed.buttons.count' runs joined by ' '
  /** finalHash of the recording code (it hashed the constant SIM_VERSION = 5 in the version slot). */
  legacyHash5: number;
}
interface GoldenFile {
  note: string;
  shells: Record<string, ShellDef>;
  plays: Record<string, Omit<PlayableRoom, 'shell'> & { shellKey: string }>;
  runs: GoldenRecord[];
}

/** FNV-1a 32-bit over the UTF-16 code units of a string. */
export function fnvString(str: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= str.charCodeAt(i) >>> 8;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function canon(v: unknown): unknown {
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (k === 'rules') continue;
      o[k] = canon((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}
export function stateDigest(s: SimState): number {
  return fnvString(JSON.stringify(canon(s)));
}

/** The pre-v5 hashState, verbatim except the version slot is a parameter (proves "v4 hash == old code with 4"). */
function legacyHash(s: SimState, version: number): number {
  const x = s as SimState & { btnBuf?: number; autoHop?: number; spotted?: number };
  let h = FNV_OFFSET;
  h = fnvInt(h, version);
  h = fnvInt(h, s.tick);
  h = fnvInt(h, s.ticks);
  h = fnvInt(h, s.rng);
  const g = s.grid;
  h = fnvInt(h, g.w);
  h = fnvInt(h, g.d);
  for (let i = 0; i < g.level.length; i++) h = fnvInt(h, g.level[i]);
  for (let i = 0; i < g.occludes.length; i++) h = fnvInt(h, g.occludes[i]);
  for (let i = 0; i < g.propAt.length; i++) h = fnvInt(h, g.propAt[i]);
  const c = s.cat;
  for (const v of [c.x, c.z, c.level, c.fromX, c.fromZ, c.fromLevel, c.stepTicks, c.stepProgress, c.facing, c.act, c.actTimer, c.idleTicks, c.carrying, c.stashed])
    h = fnvInt(h, v);
  for (const u of s.humans)
    for (const v of [u.x, u.z, u.facing, u.state, u.timer, u.stateTicks, u.telegraph, u.fakeOut, u.lookFacing, u.eventDone, u.turns, u.lookStartTick])
      h = fnvInt(h, v);
  for (const p of s.props)
    for (const v of [p.kind, p.x, p.z, p.level, p.fromX, p.fromZ, p.fromLevel, p.state, p.swats, p.fallTimer, p.fallTicks, p.dir, p.chain, p.points, p.target, p.hit, p.seen, p.restTick])
      h = fnvInt(h, v);
  for (const v of [s.suspicion, s.maxSuspicion, s.seen, s.seenCount, s.score, s.combo, s.maxCombo, s.comboTimer, s.targetsHit, s.wish, s.framed, s.eventActive, s.lastCall, s.firstCrashTick, s.stamp, s.caughtTick, s.ended, s.finalScore, x.btnBuf ?? 0, x.autoHop ?? 0, x.spotted ?? 0])
    h = fnvInt(h, v);
  return h >>> 0;
}

const inp = (dir: Dir8, speed: Speed, buttons = 0): TickInput => ({ dir, speed, buttons });
function hold(out: TickInput[], i: TickInput, n: number): void {
  for (let k = 0; k < n; k++) out.push(i);
}

/** Scripted openings (the moves a first-timer makes), then seeded pseudo-random play to the end. */
export function goldenInputs(script: number, inputSeed: number, total: number): TickInput[] {
  const out: TickInput[] = [];
  switch (script % 3) {
    case 0: // walk north, hop up, swat along the counter
      hold(out, inp(1, 2), 30);
      hold(out, inp(1, 2, BTN_JUMP), 1);
      hold(out, NO_INPUT, 14);
      for (let k = 0; k < 6; k++) {
        hold(out, inp(k % 2 ? 3 : 7, 1), 14);
        hold(out, inp(1, 0, BTN_SWAT), 1);
        hold(out, NO_INPUT, 9);
      }
      break;
    case 1: // freeze through the first look, then trot around swatting
      hold(out, NO_INPUT, 300);
      for (let k = 0; k < 8; k++) {
        hold(out, inp(((k * 3) % 8) + 1 as Dir8, 2), 21);
        hold(out, inp(0, 0, BTN_SWAT), 1);
        hold(out, inp(0, 0, BTN_JUMP), 1);
      }
      break;
    default: // grab-happy: wander and press GRAB / SWAT a lot
      for (let k = 0; k < 12; k++) {
        hold(out, inp(((k * 5) % 8) + 1 as Dir8, 1), 13);
        hold(out, inp(0, 0, k % 2 ? BTN_GRAB : BTN_SWAT), 1);
      }
  }
  let r = seedRng(inputSeed);
  while (out.length < total) {
    r = nextRng(r);
    const dir = rngInt(r, 9) as Dir8;
    r = nextRng(r);
    const speed = (1 + rngInt(r, 2)) as Speed;
    r = nextRng(r);
    const roll = rngInt(r, 100);
    const buttons = roll < 22 ? BTN_SWAT : roll < 36 ? BTN_JUMP : roll < 41 ? BTN_GRAB : 0;
    r = nextRng(r);
    const len = 1 + rngInt(r, 28);
    out.push(inp(dir, dir ? speed : 0, buttons));
    hold(out, inp(dir, dir ? speed : 0), len - 1);
    r = nextRng(r);
    if (rngInt(r, 4) === 0) hold(out, NO_INPUT, 5 + rngInt(r, 40));
  }
  return out.slice(0, total);
}

/**
 * Closed-loop seeded bot (recording only): freezes while a human telegraphs or looks, otherwise wanders, swats what
 * the auto-assist offers, jumps up onto counters and sometimes grabs. Gives the golden runs real crashes, combos,
 * dominos, stashes, event-window and last-call scoring.
 */
function botInputs(play: PlayableRoom, inputSeed: number, total: number): TickInput[] {
  const s = (initSim as InitSim4)(play, DEFAULT_CAT, opts4);
  const out: TickInput[] = [];
  const ev: SimEvent[] = [];
  let r = seedRng(inputSeed);
  let dir: Dir8 = 1;
  let left = 0;
  while (out.length < total) {
    r = nextRng(r);
    let i: TickInput = NO_INPUT;
    const alert = s.humans.some((h) => h.state === HumanSt.TELEGRAPH || h.state === HumanSt.LOOK);
    const brave = rngInt(r, 100) < 6; // now and then it gets greedy anyway
    if (!s.ended && (!alert || brave)) {
      const free = s.cat.stepTicks === 0 && s.cat.actTimer === 0;
      if (left <= 0) {
        r = nextRng(r);
        dir = (1 + rngInt(r, 8)) as Dir8;
        const goal = s.props.find((p, k) => p.state === 0 && p.kind !== 20 && (k * 31 + out.length) % 3 === 0);
        if (goal && rngInt(r, 100) < 70) {
          const dx = Math.sign(goal.x - s.cat.x);
          const dz = Math.sign(goal.z - s.cat.z);
          for (let d = 1; d <= 8; d++) if (DX[d] === dx && DZ[d] === dz) dir = d as Dir8;
        }
        r = nextRng(r);
        left = 7 + rngInt(r, 40);
      }
      left--;
      r = nextRng(r);
      const roll = rngInt(r, 100);
      const t = swatTarget(s);
      if (free && t.prop >= 0 && roll < 55) i = inp(0, 0, t.grab && roll < 20 ? BTN_GRAB : BTN_SWAT);
      else if (free && roll < 12) i = inp(dir, 2, BTN_JUMP);
      else i = inp(dir, roll < 60 ? 1 : 2);
    }
    out.push(i);
    if (!s.ended) stepSim(s, play, i, ev);
  }
  return out;
}

const opts4 = { simVersion: 4 } as const;
const packRuns = (r: InputRun[]): string => r.map((x) => x.join('.')).join(' ');
const unpackRuns = (t: string): InputRun[] => t.split(' ').map((x) => x.split('.').map(Number) as InputRun);
type RunToEnd4 = (p: PlayableRoom, c: typeof DEFAULT_CAT, i: readonly TickInput[], o?: { simVersion?: number }) => ReturnType<typeof runToEnd>;
type InitSim4 = (p: PlayableRoom, c: typeof DEFAULT_CAT, o?: { simVersion?: number }) => SimState;

function playOut(play: PlayableRoom, inputs: readonly TickInput[]): { s: SimState; events: SimEvent[] } {
  const s = (initSim as InitSim4)(play, DEFAULT_CAT, opts4);
  const events: SimEvent[] = [];
  const cap = s.ticks + CUDDLE_TICKS + 2;
  while (!s.ended && s.tick < cap) stepSim(s, play, inputs[s.tick] ?? NO_INPUT, events);
  return { s, events };
}

async function buildPlays(): Promise<{ name: string; play: PlayableRoom }[]> {
  const content = await import('../content');
  const rooms: { name: string; room: import('../types').RoomDef; dayNo?: number }[] = [
    { name: 'glass', room: content.glassRoom() },
  ];
  content.KITCHEN_VARIANTS.forEach((_, i) => rooms.push({ name: `kitchen-v${i + 1}`, room: content.dailyRoom(i + 1), dayNo: i + 1 }));
  rooms.push({ name: 'preview-0', room: content.dailyRoom(0), dayNo: 0 });
  rooms.push({ name: 'preview-m4', room: content.dailyRoom(-4), dayNo: -4 });
  const out: { name: string; play: PlayableRoom }[] = [];
  for (const r of rooms)
    for (const mode of ['ranked', 'practice', 'ftue'] as RunMode[])
      out.push({ name: `${r.name}/${mode}`, play: content.resolve(r.room, mode, r.dayNo) });
  return out;
}

function loadFixture(): GoldenFile {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as GoldenFile;
}
function playOf(f: GoldenFile, name: string): PlayableRoom {
  const p = f.plays[name];
  const { shellKey, ...rest } = p;
  return { ...rest, shell: f.shells[shellKey] } as PlayableRoom;
}

describe('v4 golden replays (SIM_VERSION 4 rule set, bit-exact)', () => {
  if (RECORD) {
    it('records the fixture', async () => {
      const plays = await buildPlays();
      const file: GoldenFile = {
        note: 'Recorded with the v4 rule code before W1-SIM v5 rules. Never re-record unless v4 rules changed on purpose.',
        shells: {},
        plays: {},
        runs: [],
      };
      plays.forEach(({ name, play }, i) => {
        const shellKey = `shell-${play.shell.id}`;
        file.shells[shellKey] = play.shell;
        const { shell: _s, ...rest } = play;
        file.plays[name] = { ...rest, shellKey };
        const inputSeed = 0x5eed0000 + i * 7919;
        const total = play.mode === 'ftue' ? 1300 : 2400;
        const inputs = i % 3 === 2 ? goldenInputs(i, inputSeed, total) : botInputs(play, inputSeed, total);
        const res = (runToEnd as RunToEnd4)(play, DEFAULT_CAT, inputs, opts4);
        const { s, events } = playOut(play, inputs);
        file.runs.push({
          name,
          mode: play.mode,
          inputSeed,
          script: i,
          finalScore: res.score,
          stamp: res.stamp,
          ticks: res.ticks,
          events: res.events.length,
          eventsDigest: fnvString(JSON.stringify(events)),
          stateDigest: stateDigest(s),
          inputs: packRuns(encodeInputs(inputs)),
          legacyHash5: res.finalHash,
        });
      });
      writeFileSync(FIXTURE, JSON.stringify(file) + '\n');
      expect(file.runs.length).toBe(30);
    });
    return;
  }

  const f = loadFixture();
  it('has 30 runs over 10 rooms and 3 modes', () => {
    expect(f.runs.length).toBe(30);
    expect(new Set(f.runs.map((r) => r.mode))).toEqual(new Set(['ranked', 'practice', 'ftue']));
  });
  for (const rec of f.runs) {
    it(`${rec.name} replays exactly under rules 4`, () => {
      const play = playOf(f, rec.name);
      const inputs = decodeInputs(unpackRuns(rec.inputs));
      const res = (runToEnd as RunToEnd4)(play, DEFAULT_CAT, inputs, opts4);
      const { s, events } = playOut(play, inputs);
      expect(res.score).toBe(rec.finalScore);
      expect(res.stamp).toBe(rec.stamp);
      expect(res.ticks).toBe(rec.ticks);
      expect(res.events.length).toBe(rec.events);
      expect(fnvString(JSON.stringify(res.events))).toBe(rec.eventsDigest);
      expect(fnvString(JSON.stringify(events))).toBe(rec.eventsDigest);
      expect(stateDigest(s)).toBe(rec.stateDigest);
      // hashState under rules 4 == the old code with the constant 4; the old code with 5 == the recording.
      expect(legacyHash(s, 5)).toBe(rec.legacyHash5);
      expect(hashState(s)).toBe(legacyHash(s, 4));
      expect(res.finalHash).toBe(legacyHash(s, 4));
      expect(res.simVersion).toBe(4);
    });
  }
});
