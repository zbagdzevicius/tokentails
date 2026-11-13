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
import { bindMap, mapIndex } from '../sim/map/runtime';
import { LIMITS_BY_MAP } from '../data/limits';
import { HUMAN_SLOT, teamOfSlot, type Command, type Match, type MatchResult, type ReplayRecord, type SimEvent, type Team, type TimedCommand } from '../sim/api';
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

export type ReplayRecordLike = Pick<ReplayRecord, 'seed' | 'difficulty' | 'hero' | 'trick' | 'inputs' | 'ticks' | 'map' | 'mutator' | 'simVersion' | 'finalHash' | 'outcome'> & { party?: unknown };

/** Can this device's sim re-run the record? A record from another sim version or a party match cannot. Pure. */
export function replayable(r: Pick<ReplayRecordLike, 'simVersion'> & { party?: unknown }, simVersion = SIM_VERSION): ReplayError | null {
  if (r.party !== undefined) return 'party';
  return r.simVersion === simVersion ? null : 'version';
}

interface Run {
  m: Match;
  /** Next command index into `cmds`. */
  ci: number;
}

const eventsOf = (m: Match): readonly SimEvent[] => (m as unknown as { events?: SimEvent[] }).events ?? [];

export class ReplayCore {
  private record: ReplayRecordLike | null = null;
  private cmds: TimedCommand[] = [];
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

  load(record: ReplayRecordLike, simVersion = SIM_VERSION): ReplayError | null {
    const why = replayable(record, simVersion);
    if (why) return why;
    const key = `${record.seed}:${record.finalHash}:${record.ticks}`;
    if (key === this.key && this.record) return null;
    try {
      bindMap(mapIndex(record.map));
      const max = LIMITS_BY_MAP[record.map === 'hearthwood' ? 'hearthwood' : 'crossing'].maxTicks;
      this.limit = Math.min(record.ticks, max);
      this.cmds = decodeStream(fromBase64(record.inputs), this.limit - 1);
    } catch {
      return 'decode';
    }
    this.record = record;
    this.key = key;
    this.picks = fillPicks(record.seed, record.hero, record.trick, record.map);
    this.team = teamOfSlot(HUMAN_SLOT, record.map);
    this.keys = new Map();
    const fresh = this.fresh();
    this.keys.set(0, deepClone(fresh));
    this.scout = { m: fresh, ci: 0 };
    this.play = null;
    this.measured = 0;
    this.msPerTick = 0;
    Object.assign(this.info, { total: this.limit, scouted: 0, deaths: [], takedowns: [], done: false, ok: null, slow: false });
    return null;
  }

  private fresh(): Match {
    const r = this.record!;
    const { picks, tricks } = this.picks!;
    return createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, ...(r.map === undefined ? {} : { map: r.map }), ...(r.mutator === undefined || r.mutator === 'none' ? {} : { mutator: r.mutator }) });
  }

  /** The first command index at or after `tick` (binary search). */
  private cmdAt(tick: number): number {
    let lo = 0;
    let hi = this.cmds.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cmds[mid].tick < tick) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** One tick of `run` with its recorded commands. */
  private stepRun(run: Run): void {
    const t = tickOf(run.m);
    const batch: Command[] = [];
    while (run.ci < this.cmds.length && this.cmds[run.ci].tick === t) batch.push(this.cmds[run.ci++].cmd);
    step(run.m, batch);
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
      for (const e of eventsOf(s.m)) {
        if (e.type !== 'death') continue;
        if (e.id === HUMAN_SLOT) {
          this.info.deaths.push(e.tick);
          changed = true;
        } else if (e.killer === HUMAN_SLOT && e.id < this.picks!.picks.length) {
          this.info.takedowns.push(e.tick);
          changed = true;
        }
      }
      if (t % KEYFRAME_TICKS === 0) this.keys.set(t, deepClone(s.m));
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
      slot: HUMAN_SLOT,
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
