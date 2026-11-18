/**
 * Replay viewer core (docs/plans/moba/MATCH-MOMENTS.md §2): re-runs a stored ReplayRecord with the frozen sim, the
 * same way `runReplay` does, and speaks the LocalHost protocol (welcome, snap, events, end) so the normal match view
 * draws it. Read-only towards the sim: it only calls the sim's public API (createMatch, step, snapshot, result).
 *
 * Two matches run from one record:
 * - the scout runs ahead as fast as the device allows, keeps a keyframe (a deep copy of the match) every
 *   KEYFRAME_TICKS, notes the player's deaths and takedowns, and checks the end state against the saved hash;
 * - the play match is what the viewer shows; `start(at)` copies the nearest keyframe at or before `at` and steps from
 *   there, so a seek costs at most KEYFRAME_TICKS of sim work.
 * A device that needs longer than SEEK_CAP_MS for one keyframe gap is too slow for the viewer (`slow`).
 * No DOM, no Worker globals, no timers: the caller (loop.ts) decides when work happens.
 */
import { decodeStream, fromBase64 } from '../sim/commands';
import { createMatch, fillPicks, result, snapshot, step, tickOf, SIM_VERSION } from '../sim/index';
import { fillPicksParty } from '../sim/party';
import { HighlightDetector } from './highlights/detect';
import { kindOf, probe } from './highlights/probe';
import { HZ, SAMPLE, type HighlightReel } from './highlights/rules';
import { bindMap, mapIndex } from '../sim/map/runtime';
import { LIMITS_BY_MAP } from '../data/limits';
import { HUMAN_SLOT, teamOfSlot, teamSizeOf, type Command, type Difficulty, type HeroId, type Match, type MatchResult, type PartySeat, type ReplayRecord, type SimEvent, type Slot, type Team, type TimedCommand, type TrickId } from '../sim/api';
import { encodeSnap, type EndMsg, type EventsMsg, type HostMsg, type SnapMsg, type WelcomeMsg } from '../host/protocol';
import { deepClone } from './clone';

/** One keyframe every 30 s of match time (30 ticks a second). */
export const KEYFRAME_TICKS = 900;
/** A seek (one keyframe gap of sim work) must fit in this; a slower device gets "not available on this device". */
export const SEEK_CAP_MS = 1500;

export type ReplayError = 'version' | 'party' | 'decode';

/** What the viewer's bar shows: how far the scout got, the player's deaths and takedowns, and the end check. */
export interface ReplayInfo {
  /** The record's tick count (the bar's length). */
  total: number;
  /** Ticks the scout has run (seekable up to here). */
  scouted: number;
  /** Ticks where the player's hero went down. */
  deaths: number[];
  /** Ticks where the player's hero took down an enemy hero. */
  takedowns: number[];
  /** The scout reached the end. */
  done: boolean;
  /** At the end: the re-run reached the saved end state hash (null until done). */
  ok: boolean | null;
  /** The device is too slow for seeking within SEEK_CAP_MS. */
  slow: boolean;
}

/** HIGHLIGHTS.md §1: what the detector needs beyond the record (names come from the main thread's hero copy). */
export interface HighlightLoad {
  /** Display name per hero slot. */
  names?: readonly string[];
  /** Ticks of the player's emotes (the optional sidecar). */
  emotes?: readonly number[];
}

/**
 * A record the viewer re-runs: a solo ReplayRecord (v1: `hero`, `trick`, one `inputs` stream), or a party (v2) or PvP
 * (v3) record (`humans`, one `inputs` stream per human seat). `me` is the seat the viewer watches from (the player's
 * own; default slot 0).
 */
export type ReplayRecordLike = Pick<ReplayRecord, 'seed' | 'difficulty' | 'ticks' | 'map' | 'mutator' | 'simVersion' | 'finalHash' | 'outcome'> & {
  v?: number;
  hero?: HeroId;
  trick?: TrickId;
  inputs: string | readonly string[];
  humans?: readonly PartySeat[];
  mode?: 'pvp';
  fillDifficulty?: readonly [Difficulty, Difficulty];
  me?: number;
  party?: unknown;
};

/** The seats a record's streams belong to (a solo record: slot 0 only), or null when the shape is wrong. Pure. */
export function seatsOf(r: Pick<ReplayRecordLike, 'inputs' | 'humans' | 'hero' | 'trick'>): { slots: number[]; streams: string[] } | null {
  if (typeof r.inputs === 'string') return r.hero && r.trick ? { slots: [HUMAN_SLOT], streams: [r.inputs] } : null;
  if (!Array.isArray(r.inputs) || !Array.isArray(r.humans) || r.humans.length === 0 || r.humans.length !== r.inputs.length) return null;
  if (!r.inputs.every((x) => typeof x === 'string') || r.humans[0].slot !== 0) return null;
  return { slots: r.humans.map((h) => h.slot), streams: r.inputs.slice() };
}

/** Can this device's sim re-run the record? Only a record from this sim version can. Pure. */
export function replayable(r: Pick<ReplayRecordLike, 'simVersion'> & { party?: unknown }, simVersion = SIM_VERSION): ReplayError | null {
  if (r.party !== undefined) return 'party';
  return r.simVersion === simVersion ? null : 'version';
}

interface Run {
  m: Match;
  /** Next command index into each seat's stream. */
  ci: number[];
}

const eventsOf = (m: Match): readonly SimEvent[] => (m as unknown as { events?: SimEvent[] }).events ?? [];

export class ReplayCore {
  private record: ReplayRecordLike | null = null;
  /** One decoded command stream per human seat (`slots[i]` plays `cmds[i]`). */
  private cmds: TimedCommand[][] = [];
  private slots: number[] = [HUMAN_SLOT];
  /** The seat the viewer watches from. */
  private me = HUMAN_SLOT;
  private limit = 0;
  private team: Team = 0;
  private picks: ReturnType<typeof fillPicks> | null = null;
  /** Keyframes by tick (tick 0 is the fresh match). */
  private keys = new Map<number, Match>();
  private scout: Run | null = null;
  private play: Run | null = null;
  private endSent = false;
  /** Average sim cost (ms per tick) measured by the scout. */
  msPerTick = 0;
  private measured = 0;
  readonly info: ReplayInfo = { total: 0, scouted: 0, deaths: [], takedowns: [], done: false, ok: null, slow: false };
  speed = 1;

  /** The loaded record's identity (the same record loads once, so its keyframes survive a seek). */
  key: string | null = null;
  /** HIGHLIGHTS.md: the detector riding the scout, and its reel once the scout reached the end. */
  private detector: HighlightDetector | null = null;
  reel: HighlightReel | null = null;
  /** A scan (the results strip): the scout keeps no keyframes. */
  private scanOnly = false;

  load(record: ReplayRecordLike, simVersion = SIM_VERSION, o: { highlights?: HighlightLoad | null; scanOnly?: boolean } = {}): ReplayError | null {
    const why = replayable(record, simVersion);
    if (why) return why;
    const key = `${record.seed}:${record.finalHash}:${record.ticks}`;
    if (key === this.key && this.record) return null;
    this.scanOnly = !!o.scanOnly;
    const seats = seatsOf(record);
    if (!seats) return 'decode';
    try {
      bindMap(mapIndex(record.map));
      const max = (LIMITS_BY_MAP[record.map ?? 'crossing'] ?? LIMITS_BY_MAP.crossing).maxTicks;
      this.limit = Math.min(record.ticks, max);
      this.cmds = seats.streams.map((s) => decodeStream(fromBase64(s), this.limit - 1));
      this.picks = record.humans ? fillPicksParty(record.seed, record.humans, record.map) : fillPicks(record.seed, record.hero!, record.trick!, record.map);
    } catch {
      return 'decode';
    }
    this.slots = seats.slots;
    this.me = typeof record.me === 'number' && seats.slots.includes(record.me) ? record.me : HUMAN_SLOT;
    this.record = record;
    this.key = key;
    this.team = teamOfSlot(this.me, record.map);
    this.keys = new Map();
    const fresh = this.fresh();
    if (!this.scanOnly) this.keys.set(0, deepClone(fresh));
    this.scout = { m: fresh, ci: this.cmds.map(() => 0) };
    this.reel = null;
    this.detector = null;
    if (o.highlights) {
      const { picks, tricks } = this.picks;
      const map = record.map ?? 'crossing';
      try {
        this.detector = new HighlightDetector({
          seed: record.seed,
          key,
          simVersion: record.simVersion,
          slots: picks.length,
          teamSize: teamSizeOf(map),
          ticks: this.limit,
          mutator: record.mutator ?? 'none',
          tricks,
          names: picks.map((h, s) => o.highlights?.names?.[s] ?? h),
          // every slot without a human seat is a bot
          bots: picks.map((_, s) => !this.slots.includes(s)),
          vsBots: record.mode !== 'pvp',
          me: this.me,
          kindOf: kindOf(fresh),
          ...(o.highlights.emotes ? { emotes: o.highlights.emotes } : {}),
        });
      } catch {
        this.detector = null;
      }
    }
    this.play = null;
    this.measured = 0;
    this.msPerTick = 0;
    Object.assign(this.info, { total: this.limit, scouted: 0, deaths: [], takedowns: [], done: false, ok: null, slow: false });
    return null;
  }

  private fresh(): Match {
    const r = this.record!;
    const { picks, tricks } = this.picks!;
    const map = r.map === undefined ? {} : { map: r.map };
    // the party and PvP records re-run like runSeats (sim/party.ts): the human seats, PvP's mode and fill bots
    if (r.humans) {
      if (r.mode === 'pvp') return createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, humans: this.slots, mode: 'pvp', fillDifficulty: [r.fillDifficulty?.[0] ?? 'hard', r.fillDifficulty?.[1] ?? 'hard'], ...map });
      return createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, humans: this.slots, ...map, ...(r.mutator === undefined || r.mutator === 'none' ? {} : { mutator: r.mutator }) });
    }
    return createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, ...map, ...(r.mutator === undefined || r.mutator === 'none' ? {} : { mutator: r.mutator }) });
  }

  /** The first command index at or after `tick` in each stream (binary search). */
  private cmdAt(tick: number): number[] {
    return this.cmds.map((list) => {
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].tick < tick) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    });
  }

  /** One tick of `run` with its recorded commands (slot 0's as the match's own, the other seats' as `others`). */
  private stepRun(run: Run): void {
    const t = tickOf(run.m);
    if (this.cmds.length === 1 && this.slots[0] === HUMAN_SLOT) {
      const list = this.cmds[0];
      const batch: Command[] = [];
      while (run.ci[0] < list.length && list[run.ci[0]].tick === t) batch.push(list[run.ci[0]++].cmd);
      step(run.m, batch);
      return;
    }
    const slot0: Command[] = [];
    const others: Command[][] = this.picks!.picks.map(() => []);
    for (let i = 0; i < this.cmds.length; i++) {
      const list = this.cmds[i];
      const out = this.slots[i] === HUMAN_SLOT ? slot0 : others[this.slots[i]];
      while (run.ci[i] < list.length && list[run.ci[i]].tick === t) out.push(list[run.ci[i]++].cmd);
    }
    step(run.m, slot0, others);
  }

  private running(run: Run): boolean {
    return tickOf(run.m) < this.limit && result(run.m) === null;
  }

  /**
   * Run the scout for at most `maxTicks` ticks or `budgetMs` ms (`now` reads the clock). Returns true when the info
   * changed (new deaths or takedowns, the end, the slow verdict).
   */
  scoutFor(maxTicks: number, budgetMs: number, now: () => number): boolean {
    const s = this.scout;
    if (!s || this.info.done) return false;
    const t0 = now();
    let changed = false;
    let n = 0;
    while (n < maxTicks && this.running(s)) {
      this.stepRun(s);
      n++;
      const t = tickOf(s.m);
      const evs = eventsOf(s.m);
      if (this.detector) {
        try {
          this.detector.feed(t, evs, t % SAMPLE === 0 ? probe(s.m, this.picks!.picks.length, t % HZ === 0) : null);
        } catch {
          // a detector fault never stops the replay: the strip falls back to the best moment
          this.detector = null;
        }
      }
      for (const e of evs) {
        if (e.type !== 'death') continue;
        if (e.id === this.me) {
          this.info.deaths.push(e.tick);
          changed = true;
        } else if (e.killer === this.me && e.id < this.picks!.picks.length) {
          this.info.takedowns.push(e.tick);
          changed = true;
        }
      }
      if (!this.scanOnly && t % KEYFRAME_TICKS === 0) this.keys.set(t, deepClone(s.m));
      if ((n & 31) === 0 && now() - t0 > budgetMs) break;
    }
    const ms = now() - t0;
    if (n >= 60) {
      // a running average over the measured ticks (the first chunk includes warm-up: it is the pessimistic side)
      this.msPerTick = (this.msPerTick * this.measured + ms) / (this.measured + n);
      this.measured += n;
      const slow = this.measured >= 300 && this.msPerTick * KEYFRAME_TICKS > SEEK_CAP_MS;
      if (slow !== this.info.slow) {
        this.info.slow = slow;
        changed = true;
      }
    }
    this.info.scouted = tickOf(s.m);
    if (!this.running(s)) {
      const r = result(s.m);
      this.info.done = true;
      this.info.ok = r ? r.finalHash === this.record!.finalHash : false;
      if (this.detector) {
        try {
          this.reel = this.detector.finish({ winner: r ? r.winner : -1, reason: r ? r.reason : 'safetyEnd', ticks: tickOf(s.m) });
        } catch {
          this.reel = null;
        }
        this.detector = null;
      }
      changed = true;
    }
    return changed || n > 0;
  }

  /** The nearest keyframe tick at or before `tick`. */
  keyAt(tick: number): number {
    let best = 0;
    for (const k of this.keys.keys()) if (k <= tick && k > best) best = k;
    return best;
  }

  /**
   * Put the play match at `at` (clamped to what the scout has run) and answer `welcome` plus the first snapshot.
   * Costs at most one keyframe gap of sim work.
   */
  start(at = 0): HostMsg[] {
    const r = this.record;
    if (!r || !this.picks) return [];
    const target = Math.max(0, Math.min(Math.floor(at), this.info.scouted, this.limit - 1));
    const k = this.keyAt(target);
    const run: Run = { m: deepClone(this.keys.get(k)!), ci: this.cmdAt(k) };
    while (tickOf(run.m) < target && this.running(run)) this.stepRun(run);
    this.play = run;
    this.endSent = false;
    const welcome: WelcomeMsg = {
      t: 'welcome',
      matchId: `replay-${(r.seed >>> 0).toString(16).padStart(8, '0')}`,
      seed: r.seed,
      simVersion: SIM_VERSION,
      slot: this.me as Slot,
      team: this.team,
      picks: this.picks.picks.slice(),
      tricks: this.picks.tricks.slice(),
      ...(r.map && r.map !== 'crossing' ? { map: r.map } : {}),
      ...(r.mutator && r.mutator !== 'none' ? { mutator: r.mutator } : {}),
    };
    const snap = snapshot(run.m, this.team);
    // the copied tick's events already happened: the first frame starts clean
    snap.events = [];
    return [welcome, { t: 'snap', buf: encodeSnap(snap) } satisfies SnapMsg];
  }

  get tick(): number {
    return this.play ? tickOf(this.play.m) : 0;
  }

  get ended(): boolean {
    return this.endSent;
  }

  get started(): boolean {
    return this.play !== null;
  }

  /** Run the play match up to `n` ticks; the same message shape as HostCore.advance (events, one snap, end once). */
  advance(n: number): HostMsg[] {
    const run = this.play;
    if (!run || this.endSent) return [];
    const events: SimEvent[] = [];
    let s = null as ReturnType<typeof snapshot> | null;
    // like HostCore: the events as the player's team sees them, collected from each tick's snapshot
    for (let i = 0; i < n && this.running(run); i++) {
      this.stepRun(run);
      s = snapshot(run.m, this.team);
      for (const e of s.events) events.push(e);
    }
    const out: HostMsg[] = [];
    if (!s) s = snapshot(run.m, this.team);
    if (events.length > 0) out.push({ t: 'events', tick: s.clock.tick, list: events } satisfies EventsMsg);
    out.push({ t: 'snap', buf: encodeSnap(s) } satisfies SnapMsg);
    if (!this.running(run)) {
      this.endSent = true;
      const res: MatchResult | null = result(run.m);
      if (res) out.push({ t: 'end', outcome: res.outcome, stats: res.stats, result: res, replay: this.record as ReplayRecord } satisfies EndMsg);
      else out.push({ t: 'end', outcome: this.record!.outcome, stats: [], result: { outcome: this.record!.outcome, winner: -1, reason: 'safetyEnd', ticks: tickOf(run.m), finalHash: '', stats: [] }, replay: this.record as ReplayRecord } satisfies EndMsg);
    }
    return out;
  }
}
