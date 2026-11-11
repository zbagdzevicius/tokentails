/**
 * Own-input latency at 0 / 50 / 150 ms RTT on the real net code (docs/plans/moba/BENCHMARKS.md, PARITY.md §3.11).
 *
 * What is real: the relay's turn clock and command intake (backend `Room`, the same class the live relay runs), the
 * wire codec (TURN / CMD / BEAT / HASH frames), the client's NetHost (send path, MoveCoalescer, ack-based latency
 * samples, cosmetic prediction in `present`), NetCore stepping the real sim, and the Pacer with its playout buffer.
 * What is modelled: the network, as an ordered (TCP-like) delay line of RTT/2 each way plus seeded exponential jitter,
 * and the player, who taps a Move every 250 to 700 ms (slower than the coalescer's one Move per turn, so tap time is
 * send time). Everything runs on vitest fake timers, so the numbers do not depend on how loaded the machine is.
 *
 * Measured per tap:
 * - `visible`: tap to the first 60 fps render frame where the own hero is drawn moving (NetHost.present, prediction).
 * - `auth`: tap to the local sim applying the command (NetHost's own ack sample: the TURN that acks it was stepped).
 *   Add one frame (~17 ms) to see it drawn.
 * Bytes: TURN + ECHO down, CMD + BEAT + HASH up, payload only (no WebSocket / TLS / TCP headers).
 *
 * `PAWLEGENDS_MEASURE_OUT=<file>` writes the JSON (tools/measure.mjs does). The asserts are the §3.11 targets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../../../backend/src/pawlegends/party/room';
import { NetHost } from '../../src/net/net-host';
import { NetCore, type CoreIn, type CoreOut } from '../../src/net/net-core';
import { Pacer } from '../../src/net/pacer';
import { Frame, decodeServerBinary, encodeBeat, encodeCmdFrame, encodeEcho, encodeHash, type MatchMsg } from '../../src/net/proto';
import { fillPicksParty } from '../../src/sim/party';
import { Op } from '../../src/sim/api';
import type { ViewEntity, ViewFrame } from '../../src/render/interp';
import { writeFileSync } from 'node:fs';

export interface RttProfile {
  rttMs: number;
  /** Mean of the exponential one-way jitter (ms). */
  jitterMs: number;
  /**
   * §3.11 authoritative p95 target (ms). 0 / 50 ms: the ≤ 30 and 60 ms rows. 150 ms: halfway between the 120 and
   * 200 ms rows. The jittery link averages ≈ 210 ms of RTT with its jitter both ways: the 200 ms row (casual ceiling).
   */
  authP95Target: number;
}

export const PROFILES: RttProfile[] = [
  { rttMs: 0, jitterMs: 0, authP95Target: 170 },
  { rttMs: 50, jitterMs: 4, authP95Target: 200 },
  { rttMs: 150, jitterMs: 10, authP95Target: 325 },
  // a jittery phone link (exponential spikes up to 180 ms one way): the playout buffer grows
  { rttMs: 150, jitterMs: 30, authP95Target: 400 },
];

const VISIBLE_P95_TARGET = 50;
const SECONDS = 90;
const FRAME_MS = 1000 / 60;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : 0;
};

/** An ordered delay line: RTT/2 plus jitter, never overtaking (one TCP stream per direction). */
function line(oneWayMs: number, jitterMs: number, rand: () => number) {
  let last = 0;
  return (fn: () => void) => {
    const now = Date.now();
    const j = jitterMs > 0 ? Math.min(jitterMs * 6, -Math.log(rand() || 1e-9) * jitterMs) : 0;
    const at = Math.max(last, now + oneWayMs + j);
    last = at;
    setTimeout(fn, Math.max(0, Math.round(at - now)));
  };
}

export interface RttResult {
  rttMs: number;
  jitterMs: number;
  authP95Target: number;
  taps: number;
  visible: { p50: number; p95: number; max: number };
  /** N1: tap of a Cast to the first frame that starts its predicted wind-up pose. */
  castVisible: { n: number; p50: number; p95: number; max: number };
  auth: { p50: number; p95: number; max: number };
  hostStats: { n: number; p50: number; p95: number };
  buffer: number;
  bytesDownPerMin: number;
  bytesUpPerMin: number;
}

export function runProfile(p: RttProfile, seed = 11): RttResult {
  const rand = rng(seed * 1000 + p.rttMs);
  const up = line(p.rttMs / 2, p.jitterMs, rand);
  const down = line(p.rttMs / 2, p.jitterMs, rand);
  const { picks, tricks } = fillPicksParty(seed, [{ slot: 0, hero: 'clem', trick: 'pounce' }]);
  const config = { seed, picks: picks as string[], tricks: tricks as string[], difficulty: 'easy', humans: [0] };
  let bytesDown = 0;
  let bytesUp = 0;

  // --- the relay side (backend Room)
  let deliverTurn: (frame: Uint8Array) => void = () => undefined;
  const t0 = Date.now();
  const room = new Room(
    { id: 'measure', humans: [0], occupied: [0], difficulty: 'easy', forfeitFrom: 0, nowMs: t0, startMs: t0 + 500 },
    {
      turn: (frame) => {
        bytesDown += frame.length;
        down(() => deliverTurn(frame));
      },
      json: () => undefined,
      catchup: () => undefined,
    },
  );
  room.connect(0, t0);
  room.loaded(0);
  let stopped = false;
  const serverLoop = () => {
    if (stopped) return;
    room.advance(Date.now());
    setTimeout(serverLoop, Math.max(1, Math.ceil(room.msToNextTurn(Date.now()))));
  };
  setTimeout(serverLoop, 1);

  // --- the client side (NetHost with an inline NetCore + Pacer on the same fake clock)
  let seq = 0;
  let listener: { binary?: (f: ReturnType<typeof decodeServerBinary>, raw: Uint8Array) => void } = {};
  const tapAt = new Map<number, number>();
  const socket = {
    rttMs: p.rttMs,
    lastTurn: 0,
    receivedTurn: 0,
    backlogged: false,
    serverOffsetMs: 0,
    listen: (l: typeof listener) => void (listener = l),
    sendCmd: (bytes: Uint8Array) => {
      const s = ++seq;
      const frame = encodeCmdFrame({ seq: s, cmd: bytes });
      bytesUp += frame.length;
      up(() => room.intake(0, s, bytes, Date.now()));
      return s;
    },
    sendJson: () => undefined,
    sendHash: (tick: number, hash: number) => void (bytesUp += encodeHash({ tick, hash }).length),
    beatNow: () => undefined,
    reconnects: 0,
    rttStats: () => ({ p50: p.rttMs, p95: p.rttMs, jitterP95: 0, n: 1 }),
  };
  deliverTurn = (frame) => {
    const f = decodeServerBinary(frame);
    if (f.type === Frame.TURN) socket.receivedTurn = Math.max(socket.receivedTurn, f.f.turn);
    listener.binary?.(f, frame);
  };
  const beat = () => {
    if (stopped) return;
    const b = encodeBeat({ lastTurn: socket.receivedTurn, clientMs: Date.now() >>> 0 });
    bytesUp += b.length;
    const lastTurn = socket.receivedTurn;
    up(() => {
      room.beat(0, lastTurn, Date.now());
      // the relay answers at most one ECHO per 250 ms (every BEAT here, at 500 ms)
      bytesDown += encodeEcho({ clientMs: 0, serverMs: Date.now() >>> 0 }).length;
    });
    setTimeout(beat, 500);
  };
  setTimeout(beat, 1);

  const match = { t: 'match', room: 'measure', config, cosmetics: { heroSkins: [] }, you: { slot: 0 }, names: ['A', null, null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 500, lastSeq: 0 } as unknown as MatchMsg;
  const now = () => Date.now();
  const host = new NetHost(socket as never, match, {
    visibility: false,
    now,
    planner: (_sx, _sy, tx, ty) => [{ x: tx, y: ty }],
    makeWorker: (onMsg) => {
      const core = new NetCore((m: CoreOut) => onMsg(m), now);
      const pacer = new Pacer(core, { now, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }, (err) => {
        throw err;
      });
      return {
        post: (m: CoreIn) => {
          core.handle(m);
          if (m.t === 'start') pacer.start();
          else if (m.t === 'turns' || m.t === 'drain' || m.t === 'hidden' || m.t === 'rebuild') pacer.kick();
        },
        close: () => pacer.stop(),
      };
    },
  });
  host.join();

  // --- the player: a Move every 250..700 ms; 60 fps frames through the cosmetic prediction
  const X = 20_000;
  const Y = 30_000;
  const visible: number[] = [];
  let pendingTap: number | null = null;
  const startAt = t0 + 1500;
  const endAt = startAt + SECONDS * 1000;
  const tap = () => {
    if (Date.now() >= endAt) return;
    const a = rand() * Math.PI * 2;
    const d = 2000 + rand() * 6000;
    const at = Date.now();
    host.send({ op: Op.Move, x: Math.round(X + Math.cos(a) * d), y: Math.round(Y + Math.sin(a) * d) });
    tapAt.set(seq, at);
    if (pendingTap === null) pendingTap = at;
    setTimeout(tap, 250 + rand() * 450);
  };
  setTimeout(tap, startAt - t0);
  // N1 (predict-action.ts): a Cast Q every 1.5..2.5 s; castVisible is the tap to the first frame that starts its pose
  const castVisible: number[] = [];
  let castTap: number | null = null;
  const castTapNow = () => {
    if (Date.now() >= endAt) return;
    castTap = Date.now();
    host.send({ op: Op.Cast, slot: 0, x: X + 3000, y: Y, id: 255 });
    setTimeout(castTapNow, 1500 + rand() * 1000);
  };
  setTimeout(castTapNow, startAt - t0 + 700);
  const frame = (): ViewFrame => {
    const me = { id: 0, kind: 'hero', team: 0, slot: 0, hero: 'clem', x: X, y: Y, fx: X, fy: Y, yaw: 0, speed: 0, hp: 1, maxHp: 1, shield: 0, state: 'idle', facing: 0, buffs: 0, cooldowns: [0, 0, 0, 0, 0] } as unknown as ViewEntity;
    return { tick: 100_000, latest: {} as never, entities: [me], byId: new Map([[0, me]]), projectiles: [], zones: [] };
  };
  // a frame clock with a random phase against the taps
  let nextFrame = t0 + rand() * FRAME_MS;
  const render = () => {
    if (stopped) return;
    const f = frame();
    host.present(f);
    const pred = host.takePredicted();
    if (castTap !== null && pred?.shown.some((a) => a.kind === 'cast')) {
      castVisible.push(Date.now() - castTap);
      castTap = null;
    }
    const me = f.byId.get(0)!;
    if (pendingTap !== null && Math.hypot(me.fx - X, me.fy - Y) >= 1) {
      visible.push(Date.now() - pendingTap);
      pendingTap = null;
      // the next tap is measured from a standing walker again
      host.predictor.reset();
    }
    nextFrame += FRAME_MS;
    setTimeout(render, Math.max(0, Math.round(nextFrame - Date.now())));
  };
  setTimeout(render, Math.max(0, Math.round(nextFrame - t0)));

  vi.advanceTimersByTime(endAt - t0 + 2000);
  stopped = true;
  const auth = host.inputSamples.slice();
  const stats = host.inputStats();
  const net = host.net();
  host.dispose();
  vi.clearAllTimers();
  const minutes = SECONDS / 60;
  return {
    rttMs: p.rttMs,
    jitterMs: p.jitterMs,
    authP95Target: p.authP95Target,
    taps: tapAt.size,
    visible: { p50: pct(visible, 0.5), p95: pct(visible, 0.95), max: Math.round(Math.max(0, ...visible)) },
    castVisible: { n: castVisible.length, p50: pct(castVisible, 0.5), p95: pct(castVisible, 0.95), max: Math.round(Math.max(0, ...castVisible)) },
    auth: { p50: pct(auth, 0.5), p95: pct(auth, 0.95), max: Math.round(Math.max(0, ...auth)) },
    hostStats: stats,
    buffer: net.buffer,
    bytesDownPerMin: Math.round(bytesDown / minutes),
    bytesUpPerMin: Math.round(bytesUp / minutes),
  };
}

describe('own-input latency on the real net code (BENCHMARKS.md, PARITY §3.11)', { timeout: 600_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('meets the §3.11 targets at 0, 50 and 150 ms RTT (and 150 ms with heavy jitter)', () => {
    const results = PROFILES.map((p) => runProfile(p));
    for (const r of results)
      console.log(
        `rtt ${r.rttMs} ms (jitter ${r.jitterMs}): ${r.taps} taps, visible p50/p95 ${r.visible.p50}/${r.visible.p95} ms, ` +
          `applied p50/p95 ${r.auth.p50}/${r.auth.p95} ms (max ${r.auth.max}), B ${r.buffer}, ` +
          `cast visible p50/p95 ${r.castVisible.p50}/${r.castVisible.p95} ms (${r.castVisible.n} casts), ` +
          `down ${(r.bytesDownPerMin / 1024).toFixed(1)} KB/min, up ${(r.bytesUpPerMin / 1024).toFixed(1)} KB/min`,
      );
    const out = process.env.PAWLEGENDS_MEASURE_OUT;
    if (out) writeFileSync(out, JSON.stringify({ seconds: SECONDS, results }, null, 2));
    for (const r of results) {
      expect(r.taps).toBeGreaterThan(SECONDS);
      expect(r.hostStats.n).toBeGreaterThan(SECONDS);
      expect(r.visible.p95).toBeLessThanOrEqual(VISIBLE_P95_TARGET);
      // N1: a predicted cast starts its wind-up on the next frame at any RTT (one frame, ≤ 17 ms)
      expect(r.castVisible.n).toBeGreaterThan(SECONDS / 3);
      expect(r.castVisible.p95).toBeLessThanOrEqual(Math.ceil(FRAME_MS));
      expect(r.auth.p95).toBeLessThanOrEqual(r.authP95Target);
      // the authoritative path can never beat the network
      expect(r.auth.p50).toBeGreaterThanOrEqual(r.rttMs);
    }
  });
});
