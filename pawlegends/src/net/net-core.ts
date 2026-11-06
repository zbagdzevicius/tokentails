/**
 * The party client's sim core (docs/plans/moba/MULTIPLAYER.md §4.1, §4.2, §4.4, §4.5). Runs inside the net-host
 * worker (or inline when Workers fail, the same retry and fallback as the LocalHost). Transport-free and timer-free:
 * the caller feeds TURN bodies and calls `pace(now)` once per 66.7 ms slot.
 *
 * Determinism rule (§1.4): the local sim only ever applies decoded TURN bytes, the player's own commands included.
 * The match is created from the relay's `match.config`, so every client and the referee run the same inputs.
 */
import { decodeCommand } from '../sim/commands';
import { createMatch, hash, hashTrail, playerBotCommands, createPlayerBotFor, result, snapshot, step, tickOf, type MatchHandle } from '../sim/index';
import { fillPicksParty, partyReplayRecord } from '../sim/party';
import type { Command, MatchResult, PartyReplayRecord, SimEvent } from '../sim/api';
import { encodeSnap } from '../host/protocol';
import { decodeTurnBody, splitTurnBodies, type TurnFrame } from './proto';
import { LockstepRunner } from './lockstep';
import { goldenHash, type GoldenSim } from './golden';

export interface NetStart {
  config: { seed: number; picks: string[]; tricks: string[]; difficulty: string; humans: number[] };
  slot: number;
}

export type CoreOut =
  | { t: 'selftest'; ok: boolean; hash: string }
  | { t: 'snap'; buf: ArrayBuffer }
  | { t: 'events'; tick: number; list: SimEvent[] }
  | { t: 'hash'; tick: number; hash: number }
  | {
      t: 'turn';
      lastTurn: number;
      modeMask: number;
      acks: (number | undefined)[];
      B: number;
      waiting: boolean;
      holds: number;
      /** Turns a bot flew each slot so far, counted turn by turn (a fast-forward included). */
      pilotTurns?: number[];
      /** The turn this player's current bot-flown stretch began (-1: flown by the player). */
      pilotFrom?: number;
    }
  | { t: 'progress'; pct: number; done: boolean }
  | { t: 'gap'; expected: number }
  | { t: 'end'; result: MatchResult; record: PartyReplayRecord | null };

export type CoreIn =
  | { t: 'selftest'; golden: string }
  | { t: 'start'; start: NetStart }
  | { t: 'turns'; bytes: ArrayBuffer }
  | { t: 'pace'; now: number }
  | { t: 'rebuild' }
  | { t: 'paused'; paused: boolean }
  | { t: 'hidden'; hidden: boolean }
  | { t: 'drain' };

/** A TURN entry's sim command, or null when it does not decode (skipped by every client and the referee alike). */
function safeDecode(bytes: Uint8Array): Command | null {
  try {
    return decodeCommand(bytes);
  } catch {
    return null;
  }
}

/** Turns behind live above which the core fast-forwards without snapshots (a reload or a resync from turn 0). */
export const FAST_FORWARD_TURNS = 45;
/** Turns stepped per fast-forward slice (one macrotask), so progress can be posted. */
export const FF_SLICE = 450;

export class NetCore {
  private m: MatchHandle | null = null;
  private start_: NetStart | null = null;
  readonly runner = new LockstepRunner<TurnFrame>();
  /** The last turn applied (-1 = none). */
  applied = -1;
  /** The highest turn queued. */
  private queued = -1;
  private trailSent = 0;
  private endSent = false;
  private fastForward = false;
  private ffTarget = 0;
  private ffFrom = 0;
  private hidden = false;
  lastMask = 0;
  /** Per slot: turns a bot flew it (from the TURN mode bits of every applied turn). */
  readonly pilotTurns = [0, 0, 0, 0, 0, 0];
  /** The turn this player's current bot-flown stretch began, or -1. */
  pilotFrom = -1;

  constructor(private readonly post: (m: CoreOut, transfer?: Transferable[]) => void) {}

  /** The golden self-test (§2.1): this build's sim against the vendored backend bundle's value. */
  selftest(golden: string): boolean {
    const sim: GoldenSim = {
      createMatch: (c) => createMatch(c as never),
      step: (m, a, b) => step(m as MatchHandle, a as Command[], b as Command[][]),
      hash: (m) => hash(m as MatchHandle),
      fillPicksParty: (s, h) => fillPicksParty(s, h as never),
      createPlayerBotFor: (m, p, s) => createPlayerBotFor(m as MatchHandle, p as never, s),
      playerBotCommands: (m, b) => playerBotCommands(m as MatchHandle, b as never),
    };
    const h = (goldenHash(sim) >>> 0).toString(16).padStart(8, '0');
    const ok = golden !== '' && h === golden;
    this.post({ t: 'selftest', ok, hash: h });
    return ok;
  }

  start(s: NetStart): void {
    this.start_ = s;
    this.rebuild();
  }

  /** Recreate the match from the config (desync recovery, §4.4): the next turns are applied from turn 0. */
  rebuild(): void {
    const s = this.start_;
    if (!s) return;
    this.m = createMatch({ seed: s.config.seed, picks: s.config.picks as never, tricks: s.config.tricks as never, difficulty: s.config.difficulty as never, humans: s.config.humans });
    this.applied = -1;
    this.queued = -1;
    this.pilotTurns.fill(0);
    this.pilotFrom = -1;
    this.trailSent = 0;
    this.endSent = false;
    this.runner.clear();
    this.post({ t: 'snap', buf: encodeSnap(snapshot(this.m, 0)) });
  }

  get tick(): number {
    return this.m ? tickOf(this.m) : 0;
  }

  /** The world hash now (tests and desync tooling). */
  get worldHash(): number {
    return this.m ? hash(this.m) >>> 0 : 0;
  }

  get ended(): MatchResult | null {
    return this.m ? result(this.m) : null;
  }

  /** TURN bodies from TURN or CATCHUP frames (in order; old and duplicate turns are dropped, a gap is reported). */
  turns(bytes: Uint8Array, single = false): void {
    const frames = single ? [decodeTurnBody(bytes)] : splitTurnBodies(bytes);
    for (const f of frames) {
      if (f.turn <= this.queued) continue;
      if (f.turn !== this.queued + 1) {
        this.post({ t: 'gap', expected: this.queued + 1 });
        return;
      }
      this.queued = f.turn;
      this.runner.push(f);
    }
    if (!this.fastForward && this.runner.queue.length > FAST_FORWARD_TURNS) {
      this.fastForward = true;
      this.ffFrom = this.applied + 1;
      this.ffTarget = this.queued;
    }
  }

  setPaused(p: boolean): void {
    this.runner.paused = p;
  }

  setHidden(h: boolean): void {
    this.hidden = h;
  }

  /** One pacing slot. */
  pace(now: number): void {
    if (!this.m || this.hidden) return;
    if (this.fastForward) {
      this.ffSlice();
      return;
    }
    const due = this.runner.due(now);
    if (due.length === 0) {
      this.post({ t: 'turn', lastTurn: this.applied, modeMask: this.lastMask, acks: [], B: this.runner.B, waiting: this.runner.waiting(now), holds: this.runner.holds, pilotTurns: [...this.pilotTurns], pilotFrom: this.pilotFrom });
      return;
    }
    const events: SimEvent[] = [];
    for (const f of due) this.apply(f, events, true);
    this.publish(events, due[due.length - 1]);
  }

  private ffSlice(): void {
    const m = this.m!;
    const events: SimEvent[] = [];
    let last: TurnFrame | null = null;
    for (let i = 0; i < FF_SLICE && this.runner.queue.length > this.runner.B; i++) {
      last = this.runner.take(1)[0];
      this.apply(last, events, false);
      if (result(m)) break;
    }
    // the trail pushes during the fast-forward are never sent (HASH stops during catch-up)
    this.trailSent = hashTrail(m).length;
    const span = Math.max(1, this.ffTarget - this.ffFrom + 1);
    const done = this.runner.queue.length <= this.runner.B || result(m) !== null;
    this.post({ t: 'progress', pct: Math.min(100, Math.round(((this.applied - this.ffFrom + 1) / span) * 100)), done });
    if (done) {
      this.fastForward = false;
      this.publish([], last);
    }
  }

  private apply(f: TurnFrame, events: SimEvent[], live: boolean): void {
    const m = this.m!;
    this.applied = f.turn;
    this.lastMask = f.modeMask;
    for (let s = 0; s < 6; s++) if ((f.modeMask >>> s) & 1) this.pilotTurns[s]++;
    const mine = this.start_ ? ((f.modeMask >>> this.start_.slot) & 1) === 1 : false;
    if (mine && this.pilotFrom < 0) this.pilotFrom = f.turn;
    else if (!mine) this.pilotFrom = -1;
    for (let sub = 0; sub < 2 && !result(m); sub++) {
      const per: Command[][] = [[], [], []];
      for (const e of f.entries) {
        if (e.sub !== sub) continue;
        // defence in depth: the relay decodes every command before a TURN, and the referee skips the same way
        const c = safeDecode(e.cmd);
        if (c) per[e.slot].push(c);
      }
      step(m, per[0], per);
      if (live) {
        // the team-filtered events of this tick (as the LocalHost's HostCore reads them)
        for (const e of snapshot(m, 0).events) events.push(e);
        const trail = hashTrail(m);
        while (this.trailSent < trail.length) {
          this.post({ t: 'hash', tick: (this.trailSent + 1) * 30, hash: trail[this.trailSent] >>> 0 });
          this.trailSent++;
        }
      }
    }
  }

  private publish(events: SimEvent[], last: TurnFrame | null): void {
    const m = this.m!;
    const s = snapshot(m, 0);
    if (events.length) this.post({ t: 'events', tick: s.clock.tick, list: events });
    const buf = encodeSnap(s);
    this.post({ t: 'snap', buf }, [buf]);
    if (last) this.post({ t: 'turn', lastTurn: this.applied, modeMask: last.modeMask, acks: last.acks, B: this.runner.B, waiting: false, holds: this.runner.holds, pilotTurns: [...this.pilotTurns], pilotFrom: this.pilotFrom });
    const r = result(m);
    if (r && !this.endSent) {
      this.endSent = true;
      this.post({ t: 'end', result: r, record: partyReplayRecord(m) });
    }
  }

  handle(msg: CoreIn): void {
    switch (msg.t) {
      case 'selftest':
        this.selftest(msg.golden);
        return;
      case 'start':
        this.start(msg.start);
        return;
      case 'turns':
        this.turns(new Uint8Array(msg.bytes));
        return;
      case 'pace':
        this.pace(msg.now);
        return;
      case 'rebuild':
        this.rebuild();
        return;
      case 'paused':
        this.setPaused(msg.paused);
        return;
      case 'hidden':
        this.setHidden(msg.hidden);
        return;
      case 'drain':
        this.runner.drain();
        return;
    }
  }
}
