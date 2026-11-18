/**
 * The clip harness's stand-in for the sim Worker (after tools/trailer/fake-worker.ts): the real `MatchSession` runs on
 * a ClipRun (clip-driver.ts) that advances only when the harness asks. Differences from the trailer's worker: any
 * mode (map, mutator, variant, explicit picks) and FULL VISION: the snapshot carries every unit (no fog of war), and
 * the events of both teams (team 1's private ones, XP / Fish / pings / barks, are left out so no stray "+12" pops on
 * the enemy). Commands the UI sends are dropped: every human seat is a player-bot pilot.
 */
import { replayRecord, snapshot, SIM_VERSION } from '../../src/sim/index';
import type { SimEvent, Snapshot } from '../../src/sim/api';
import { encodeSnap, type ClientMsg, type HostMsg } from '../../src/host/protocol';
import { ClipRun, type ClipTake } from './clip-driver';

const PRIVATE = new Set(['xp', 'fish', 'ping', 'bark', 'talentOffer', 'buy']);

export class ClipWorker extends EventTarget {
  static take: ClipTake | null = null;
  static last: ClipWorker | null = null;
  /** Full vision (default on). */
  static fullVision = true;
  run: ClipRun | null = null;
  private endSent = false;
  onTick: ((tick: number, events: readonly SimEvent[]) => void) | null = null;

  constructor(_url?: unknown, _opts?: unknown) {
    super();
    ClipWorker.last = this;
  }

  private post(msg: HostMsg): void {
    this.dispatchEvent(new MessageEvent('message', { data: msg }));
  }

  private snap(withEvents: SimEvent[] | null): Snapshot {
    const run = this.run as ClipRun;
    const s0 = snapshot(run.match, 0);
    if (!ClipWorker.fullVision) return s0;
    if (withEvents) {
      const s1 = snapshot(run.match, 1);
      const seen = new Set(s0.events.map((e) => JSON.stringify(e)));
      for (const e of s1.events) if (!PRIVATE.has(e.type) && !seen.has(JSON.stringify(e))) s0.events.push(e);
    }
    const all = snapshot(run.match, 2 as 0);
    const have = new Set(s0.entities.map((e) => e.id));
    for (const e of all.entities) if (!have.has(e.id)) s0.entities.push(e);
    s0.entities.sort((a, b) => a.id - b.id);
    return s0;
  }

  postMessage(msg: ClientMsg): void {
    if (msg.t !== 'join') return;
    const spec = ClipWorker.take;
    if (!spec) throw new Error('ClipWorker: no take set');
    if (spec.hero !== msg.hero) throw new Error(`ClipWorker: the take plays ${spec.hero}, the session asked for ${msg.hero}`);
    const run = new ClipRun(spec);
    this.run = run;
    this.endSent = false;
    const map = spec.map && spec.map !== 'crossing' ? spec.map : undefined;
    const mutator = spec.mutator && spec.mutator !== 'none' ? spec.mutator : undefined;
    queueMicrotask(() => {
      this.post({ t: 'welcome', matchId: `clip-${spec.seed.toString(16)}`, seed: spec.seed >>> 0, simVersion: SIM_VERSION, slot: 0, team: 0, picks: run.picks.slice(), tricks: run.tricks.slice(), ...(map ? { map } : {}), ...(mutator ? { mutator } : {}) } as HostMsg);
      this.post({ t: 'snap', buf: encodeSnap(this.snap(null)) });
    });
  }

  pumpTo(tick: number): void {
    const run = this.run;
    if (!run || this.endSent || run.tick >= tick) return;
    const events: SimEvent[] = [];
    let last: Snapshot | null = null;
    while (run.tick < tick && !run.ended) {
      const raw = run.stepOnce();
      this.onTick?.(run.tick - 1, raw);
      const fin = run.tick >= tick || !!run.ended;
      // events every tick (they are per step); the entity merge only on the snapshot that is posted
      if (fin) last = this.snap([]);
      else last = snapshot(run.match, 0);
      if (!fin && ClipWorker.fullVision) {
        const s1 = snapshot(run.match, 1);
        const seen = new Set(last.events.map((e) => JSON.stringify(e)));
        for (const e of s1.events) if (!PRIVATE.has(e.type) && !seen.has(JSON.stringify(e))) last.events.push(e);
      }
      for (const e of last.events) events.push(e);
    }
    if (!last) return;
    if (events.length) this.post({ t: 'events', tick: last.clock.tick, list: events });
    this.post({ t: 'snap', buf: encodeSnap(last) });
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
