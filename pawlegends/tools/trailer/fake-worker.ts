/**
 * The trailer's stand-in for the sim Worker (tools/trailer/README.md). `LocalHost` builds its Worker with
 * `new Worker(...)`; the harness swaps the global for this class, so the real `MatchSession` runs unchanged on a take
 * (take-driver.ts) that advances only when the harness asks: `pumpTo(tick)` steps the sim and posts the same
 * `events` / `snap` / `end` messages the real Worker posts (HostCore's stream: team-filtered snapshot events, one
 * snapshot per batch). Commands the UI sends are dropped: in a take, slot 0 is the player-bot plus the script.
 */
import { replayRecord, snapshot, SIM_VERSION } from '../../src/sim/index';
import type { SimEvent } from '../../src/sim/api';
import { encodeSnap, type ClientMsg, type HostMsg } from '../../src/host/protocol';
import { TakeRun, type TakeSpec } from './take-driver';

export class FakeWorker extends EventTarget {
  /** The take the next `join` plays (set by the harness before the session starts). */
  static take: TakeSpec | null = null;
  /** The last FakeWorker made (one match at a time). */
  static last: FakeWorker | null = null;
  run: TakeRun | null = null;
  private endSent = false;
  /** Called after every stepped tick with that tick's raw events (the harness's key-tick log and hash check). */
  onTick: ((tick: number, events: readonly SimEvent[]) => void) | null = null;

  constructor(_url?: unknown, _opts?: unknown) {
    super();
    FakeWorker.last = this;
  }

  private post(msg: HostMsg): void {
    this.dispatchEvent(new MessageEvent('message', { data: msg }));
  }

  postMessage(msg: ClientMsg): void {
    if (msg.t !== 'join') return;
    const spec = FakeWorker.take;
    if (!spec) throw new Error('FakeWorker: no take set');
    if (spec.hero !== msg.hero) throw new Error(`FakeWorker: the take plays ${spec.hero}, the session asked for ${msg.hero}`);
    const run = new TakeRun(spec);
    this.run = run;
    this.endSent = false;
    // a real Worker answers asynchronously
    queueMicrotask(() => {
      this.post({ t: 'welcome', matchId: `trailer-${spec.seed.toString(16)}`, seed: spec.seed >>> 0, simVersion: SIM_VERSION, slot: 0, team: 0, picks: run.picks.slice(), tricks: run.tricks.slice() });
      this.post({ t: 'snap', buf: encodeSnap(snapshot(run.match, 0)) });
    });
  }

  /** Step the take until its tick is at least `tick`; post the batch. */
  pumpTo(tick: number): void {
    const run = this.run;
    if (!run || this.endSent || run.tick >= tick) return;
    const events: SimEvent[] = [];
    let snap = null;
    while (run.tick < tick && !run.ended) {
      const raw = run.stepOnce();
      this.onTick?.(run.tick - 1, raw);
      snap = snapshot(run.match, 0);
      for (const e of snap.events) events.push(e);
    }
    if (!snap) return;
    if (events.length) this.post({ t: 'events', tick: snap.clock.tick, list: events });
    this.post({ t: 'snap', buf: encodeSnap(snap) });
    const r = run.ended;
    const rec = replayRecord(run.match);
    if (r && rec && !this.endSent) {
      this.endSent = true;
      this.post({ t: 'end', outcome: r.outcome, stats: r.stats, result: r, replay: rec });
    }
  }

  terminate(): void {
    this.run = null;
  }
}
