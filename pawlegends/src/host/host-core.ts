/**
 * The LocalHost's transport-free core (POC.md §11.2): one match, the human's queued commands, team-filtered
 * snapshots and the replay. The Worker (local-host.worker.ts) and the in-thread fallback (local-host.ts) both drive
 * this class, so they produce the same message stream for the same seed and inputs. No DOM, no Worker globals, no
 * timers: the caller decides when a tick happens.
 */
import { decodeCommand } from '../sim/commands';
import { createMatch, fillPicks, replayRecord, result, snapshot, step, tickOf, SIM_VERSION } from '../sim/index';
import { HUMAN_SLOT, teamOfSlot, type Command, type Match, type SimEvent, type Team } from '../sim/api';
import { encodeSnap, type EndMsg, type EventsMsg, type HostMsg, type JoinMsg, type SnapMsg, type WelcomeMsg } from './protocol';

/** A uint32 seed from the platform RNG (never used inside the sim; the seed is an input like any other). */
export function drawSeed(): number {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] >>> 0;
  } catch {
    return (Date.now() ^ 0x9e3779b9) >>> 0;
  }
}

export const MAX_SPEED = 64;
export const clampSpeed = (s: unknown): number => {
  const n = typeof s === 'number' && Number.isFinite(s) ? Math.round(s) : 1;
  return Math.max(1, Math.min(MAX_SPEED, n));
};

let matchCounter = 0;

export class HostCore {
  private match: Match | null = null;
  private pending: Command[] = [];
  private team: Team = 0;
  private endSent = false;
  speed = 1;

  get joined(): boolean {
    return this.match !== null;
  }

  get ended(): boolean {
    return this.endSent;
  }

  get tick(): number {
    return this.match ? tickOf(this.match) : 0;
  }

  /** Start the match and answer with `welcome`. The human is always slot 0 in the POC (§6.8). */
  join(msg: JoinMsg): WelcomeMsg {
    const seed = typeof msg.seed === 'number' && Number.isInteger(msg.seed) && msg.seed >= 0 && msg.seed <= 0xffffffff ? msg.seed >>> 0 : drawSeed();
    const { picks, tricks } = fillPicks(seed, msg.hero, msg.trick);
    this.match = createMatch({ seed, picks, tricks, difficulty: msg.difficulty });
    this.team = teamOfSlot(HUMAN_SLOT);
    this.pending = [];
    this.endSent = false;
    this.speed = clampSpeed(msg.speed);
    matchCounter++;
    return {
      t: 'welcome',
      matchId: `local-${seed.toString(16).padStart(8, '0')}-${matchCounter}`,
      seed,
      simVersion: SIM_VERSION,
      slot: HUMAN_SLOT,
      team: this.team,
      picks: picks.slice(),
      tricks: tricks.slice(),
    };
  }

  /** Queue one encoded command for the next tick. Malformed bytes are dropped (the sim never sees them). */
  command(bytes: Uint8Array): boolean {
    if (!this.match || this.endSent) return false;
    try {
      this.pending.push(decodeCommand(bytes));
      return true;
    } catch {
      return false;
    }
  }

  /** The tick-0 snapshot (before the first step), so the client can draw the map at once. */
  initial(): SnapMsg | null {
    return this.match ? { t: 'snap', buf: encodeSnap(snapshot(this.match, this.team)) } : null;
  }

  /**
   * Run up to `n` ticks. The queued commands go into the first one (the sim keeps the latest). Returns at most one
   * `events` message (every event of the run, in tick order), one `snap` of the last state, and `end` once.
   */
  advance(n: number): HostMsg[] {
    const m = this.match;
    if (!m || this.endSent) return [];
    const events: SimEvent[] = [];
    let last = this.tick;
    for (let i = 0; i < n; i++) {
      const cmds = this.pending.length > 0 ? this.pending : undefined;
      this.pending = [];
      step(m, cmds);
      const s = snapshot(m, this.team);
      for (const e of s.events) events.push(e);
      last = s.clock.tick;
      if (i === n - 1 || result(m)) {
        const out: HostMsg[] = [];
        if (events.length > 0) out.push({ t: 'events', tick: last, list: events } satisfies EventsMsg);
        out.push({ t: 'snap', buf: encodeSnap(s) } satisfies SnapMsg);
        const r = result(m);
        const rec = replayRecord(m);
        if (r && rec) {
          this.endSent = true;
          out.push({ t: 'end', outcome: r.outcome, stats: r.stats, result: r, replay: rec } satisfies EndMsg);
        }
        return out;
      }
    }
    return [];
  }
}
