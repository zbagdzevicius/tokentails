// @vitest-environment happy-dom
/**
 * Party play latency pass (MULTIPLAYER.md §4.2, §4.3): the NetHost measures click-to-applied input latency from the
 * TURN acks and leads the own hero per render frame on the interpolated view (never the snapshot).
 */
import { describe, expect, it } from 'vitest';
import { NetHost, PREDICT_MAX_MS } from '../../src/net/net-host';
import { Op } from '../../src/sim/api';
import type { MatchMsg } from '../../src/net/proto';
import type { CoreOut } from '../../src/net/net-core';
import type { ViewEntity, ViewFrame } from '../../src/render/interp';

const match = { t: 'match', room: 'r', config: { seed: 5, picks: ['clem', 'sage', 'lambo', 'gabe', 'pixel', 'stilts'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: ['A', 'B', null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 13 } as unknown as MatchMsg;

function setup() {
  let now = 1000;
  let seq = 0;
  let fromCore: ((m: CoreOut) => void) | null = null;
  const socket = { listen: () => undefined, sendCmd: () => ++seq, sendJson: () => undefined, sendHash: () => undefined, beatNow: () => undefined, rttMs: 60, lastTurn: 0 };
  const h = new NetHost(socket as never, match, {
    visibility: false,
    now: () => now,
    makeWorker: (onMsg) => {
      fromCore = onMsg as (m: CoreOut) => void;
      return { post: () => undefined, close: () => undefined };
    },
  });
  h.join();
  const turn = (lastTurn: number, ack: number) => fromCore!({ t: 'turn', lastTurn, modeMask: 0, acks: [undefined, ack], B: 1, waiting: false, holds: 0 });
  return { h, turn, tick: (ms: number) => (now += ms), get now() { return now; } };
}

const frame = (x: number, y: number, speed = 0): ViewFrame => {
  const me = { id: 1, kind: 'hero', team: 0, slot: 1, hero: 'sage', x, y, fx: x, fy: y, yaw: 0, speed, hp: 1, maxHp: 1, shield: 0, state: 'idle', facing: 0, buffs: 0 } as unknown as ViewEntity;
  return { tick: 0, latest: {} as never, entities: [me], byId: new Map([[1, me]]), projectiles: [], zones: [] };
};

describe('NetHost latency (§4.2, §4.3)', () => {
  it('measures input latency from the acking TURN; before any sample it is RTT + 2 turns', () => {
    const t = setup();
    const first = t.h.inputLatencyMs();
    expect(first).toBeGreaterThan(60 + 2 * 66);
    expect(first).toBeLessThan(220);
    t.h.send({ op: Op.Move, x: 20_000, y: 20_000 });
    t.tick(180);
    t.turn(10, 1);
    expect(t.h.inputLatencyMs()).toBeGreaterThan(180);
    expect(t.h.inputLatencyMs()).toBeLessThan(200);
    expect(t.h.net().inputMs).toBe(Math.round(t.h.inputLatencyMs()));
    expect(t.h.inputLatencyMs()).toBeLessThanOrEqual(PREDICT_MAX_MS);
    t.h.dispose();
  });

  it('a Move leads the drawn hero on the next frame and turns it to the target; the snapshot is untouched', () => {
    const t = setup();
    t.h.send({ op: Op.Move, x: 30_000, y: 20_000 });
    const f0 = frame(20_000, 20_000);
    t.h.present(f0);
    let f = f0;
    for (let i = 0; i < 6; i++) {
      t.tick(16);
      f = frame(20_000, 20_000);
      t.h.present(f);
    }
    const me = f.byId.get(1)!;
    expect(me.fx).toBeGreaterThan(20_000 + 100);
    expect(me.fy).toBeCloseTo(20_000, 0);
    expect(me.yaw).toBeCloseTo(0, 3);
    expect(me.x).toBe(20_000);
    t.h.dispose();
  });
});
