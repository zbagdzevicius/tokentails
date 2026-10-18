/**
 * Protocol (POC.md §11.2, §15 item 13): every client and host message type round-trips through both real
 * serialisations, structured clone (the Worker's postMessage) and the WebSocket wire format (`encodeWire` /
 * `decodeWire`); and the Worker transport (local-host.worker.ts over a real MessageChannel) and a mock WebSocket
 * transport (socket-host.ts) produce identical snapshot streams for the same seed and commands.
 */
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostCore } from '../../src/host/host-core';
import {
  decodeSnap,
  decodeWire,
  encodeSnap,
  encodeWire,
  isClientMsg,
  isHostMsg,
  type ClientMsg,
  type HostMsg,
  type WireFrame,
} from '../../src/host/protocol';
import { serveOverSocket, type SocketLike } from '../../src/host/socket-host';
import { encodeCommand } from '../../src/sim/commands';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, fillPicks, snapshot, step } from '../../src/sim/index';

const JOIN = { t: 'join', slot: 0, hero: 'sage', trick: 'hiss', difficulty: 'normal', seed: 4242 } as const;

const EVERY_OP: Command[] = [
  { op: Op.Move, x: 40000, y: 20000 },
  { op: Op.AttackMove, x: 52000, y: 31000 },
  { op: Op.Attack, id: 9 },
  { op: Op.Cast, slot: 2, x: 47000, y: 29500, id: 4 },
  { op: Op.Trick, x: 41000, y: 30000 },
  { op: Op.Stop },
  { op: Op.Nap },
  { op: Op.Talent, tier: 1, choice: 1 },
];

/** One of every client message, and one of every host message from a real match (welcome, snap, events, end). */
function samples(): { client: ClientMsg[]; host: HostMsg[] } {
  const client: ClientMsg[] = [
    { ...JOIN },
    { t: 'join', slot: 0, hero: 'clem', trick: 'pounce', difficulty: 'easy', speed: 8 },
    ...EVERY_OP.map((c, i): ClientMsg => ({ t: 'cmd', tick: 100 + i, bytes: encodeCommand(c) })),
    { t: 'leave' },
    { t: 'pause', paused: true },
    { t: 'pause', paused: false },
  ];
  const core = new HostCore();
  // Seed 301: the idle human's team holds out past Sunset (Normal 6:00), so the samples include a `sunset` event (sim v8;
  // seed 308 before).
  const host: HostMsg[] = [core.join({ ...JOIN, seed: 301 }), core.initial()!];
  core.command(encodeCommand({ op: Op.Move, x: 30000, y: 30000 }));
  for (let i = 0; i < 2000 && !core.ended; i++) host.push(...core.advance(30));
  return { client, host };
}

/** Comparable form: snaps decoded, Uint8Arrays as plain arrays. */
const plain = (m: ClientMsg | HostMsg): unknown => {
  if (m.t === 'snap') return { t: 'snap', snap: decodeSnap(m.buf) };
  if (m.t === 'cmd') return { t: 'cmd', tick: m.tick, bytes: Array.from(m.bytes) };
  return JSON.parse(JSON.stringify(m));
};

describe('protocol (§11.2, §15 item 13)', { timeout: 120000 }, () => {
  it('snap round-trips a snapshot (minus events), with projectiles and zones', () => {
    const { picks, tricks } = fillPicks(3, 'sage', 'pounce');
    const m = createMatch({ seed: 3, picks, tricks, difficulty: 'easy' });
    for (let t = 0; t < 400; t++) step(m, t === 0 ? [{ op: Op.Move, x: 40000, y: 20000 }] : []);
    for (const team of [0, 1] as const) {
      const s = snapshot(m, team);
      expect(decodeSnap(encodeSnap(s))).toEqual({ ...s, events: [] });
    }
    const s = snapshot(m, 0);
    s.projectiles.push({ index: 4, team: 1, owner: 3, x: 1, y: -2, vx: 160, vy: -90, kind: 2 });
    s.zones.push({ index: 7, team: 2, owner: -1, x: 50000, y: 30000, radius: 4000, ttl: 24, kind: 1 });
    // Sim v4: pickups (kind, sub) and a hero's bounty streak travel too.
    s.entities.push({ id: 63, kind: 'pickup', team: 2, slot: 0, sub: 'frenzy', x: 50000, y: 52000, hp: 0, maxHp: 0, shield: 0, state: 'idle', facing: 0, buffs: 0 });
    s.entities.push({ id: 64, kind: 'pickup', team: 1, slot: 1, sub: 'snack', x: 80000, y: 8000, hp: 0, maxHp: 0, shield: 0, state: 'idle', facing: 0, buffs: 0 });
    const hero = s.entities.find((e) => e.kind === 'hero')!;
    hero.bountyStreak = 4;
    expect(decodeSnap(encodeSnap(s))).toEqual({ ...s, events: [] });
  });

  it('the samples cover every message type', () => {
    const { client, host } = samples();
    expect(new Set(client.map((m) => m.t))).toEqual(new Set(['join', 'cmd', 'leave', 'pause']));
    expect(new Set(host.map((m) => m.t))).toEqual(new Set(['welcome', 'snap', 'events', 'end']));
    const kinds = new Set(host.flatMap((m) => (m.t === 'events' ? m.list.map((e) => e.type) : [])));
    for (const k of ['hit', 'cast', 'death', 'levelup', 'talentOffer', 'tower', 'sunset']) expect(kinds.has(k as never), k).toBe(true);
  });

  it('every message round-trips through structured clone (the Worker postMessage)', () => {
    const { client, host } = samples();
    for (const m of [...client, ...host]) {
      const back = structuredClone(m) as ClientMsg | HostMsg;
      expect(back.t).toBe(m.t);
      expect(plain(back)).toEqual(plain(m));
      if (back.t === 'cmd') expect(back.bytes).toBeInstanceOf(Uint8Array);
    }
  });

  it('every message round-trips through the WebSocket wire format', () => {
    const { client, host } = samples();
    for (const m of [...client, ...host]) {
      const frame = encodeWire(m);
      expect(typeof frame === 'string' || frame instanceof ArrayBuffer).toBe(true);
      expect(frame instanceof ArrayBuffer).toBe(m.t === 'snap');
      const back = decodeWire(frame);
      expect(back).not.toBeNull();
      expect(plain(back!)).toEqual(plain(m));
      expect(isClientMsg(back) || isHostMsg(back)).toBe(true);
    }
    expect(decodeWire('not json')).toBeNull();
    expect(decodeWire('{"t":"nope"}')).toBeNull();
    expect(decodeWire('{"t":"cmd","tick":1}')).toBeNull();
  });

  it('type guards', () => {
    for (const t of ['join', 'cmd', 'leave', 'pause']) expect(isClientMsg({ t })).toBe(true);
    for (const t of ['welcome', 'snap', 'events', 'end']) expect(isHostMsg({ t })).toBe(true);
    expect(isClientMsg({ t: 'snap' })).toBe(false);
    expect(isHostMsg({ t: 'join' })).toBe(false);
    expect(isHostMsg(null)).toBe(false);
    expect(isClientMsg(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Worker vs mock WebSocket

/** A connected pair of in-memory sockets; frames are delivered on a later macrotask, like a real socket. */
function socketPair(): [SocketLike, SocketLike] {
  const make = (): SocketLike & { peer?: { deliver(f: WireFrame): void }; deliver(f: WireFrame): void } => {
    const fns: ((e: { data: WireFrame }) => void)[] = [];
    return {
      send(frame) {
        const copy = frame instanceof ArrayBuffer ? frame.slice(0) : frame;
        setImmediate(() => this.peer!.deliver(copy));
      },
      addEventListener(_t, fn) {
        fns.push(fn);
      },
      deliver(f) {
        for (const fn of fns) fn({ data: f });
      },
    };
  };
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise<void>((r) => setImmediate(r));
};

interface Client {
  send(m: ClientMsg): void;
  received: HostMsg[];
}

/** Drive a transport: join, then 20 s of fake wall time with a command every ~0.7 s. Returns the host messages. */
async function drive(client: Client): Promise<string[]> {
  client.send({ ...JOIN });
  await flush();
  for (let frame = 0; frame < 600; frame++) {
    if (frame % 21 === 0) {
      const c = EVERY_OP[(frame / 21) % EVERY_OP.length];
      client.send({ t: 'cmd', tick: frame, bytes: encodeCommand(c.op === Op.Nap ? { op: Op.Move, x: 30000 + frame * 40, y: 30000 } : c) });
      await flush();
    }
    vi.advanceTimersByTime(1000 / 30);
    await flush();
  }
  client.send({ t: 'leave' });
  await flush();
  // matchId carries a per-process counter (local-<seed>-<n>); everything else must match byte for byte.
  return client.received.map((m) => JSON.stringify(plain(m.t === 'welcome' ? { ...m, matchId: m.matchId.replace(/-\d+$/, '') } : m)));
}

describe('transports (§15 item 13)', { timeout: 120000 }, () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { self?: unknown }).self;
  });

  it('the Worker and a mock WebSocket produce identical message streams for the same seed and commands', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

    // Worker: the real local-host.worker.ts module, its `self` one end of a real MessageChannel (structured clone,
    // transferred snap buffers).
    const ch = new MessageChannel();
    const workerSide = ch.port1 as MessagePort & { addEventListener: (t: string, fn: (e: MessageEvent) => void) => void };
    (globalThis as { self?: unknown }).self = workerSide;
    await import('../../src/host/local-host.worker');
    workerSide.start();
    const worker: Client = { received: [], send: (m) => ch.port2.postMessage(m) };
    ch.port2.on('message', (m: HostMsg) => worker.received.push(m));
    const viaWorker = await drive(worker);
    ch.port1.close();

    // Mock WebSocket: the same TickLoop behind serveOverSocket, frames through encodeWire / decodeWire.
    const [server, clientEnd] = socketPair();
    serveOverSocket(server, {
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    const ws: Client = { received: [], send: (m) => clientEnd.send(encodeWire(m)) };
    clientEnd.addEventListener('message', (e) => {
      const m = decodeWire(e.data);
      if (m && isHostMsg(m)) ws.received.push(m);
    });
    const viaSocket = await drive(ws);

    const snaps = viaWorker.filter((s) => s.startsWith('{"t":"snap"'));
    expect(snaps.length).toBeGreaterThan(500);
    expect(viaWorker[0]).toContain('"t":"welcome"');
    expect(viaWorker.some((s) => s.startsWith('{"t":"events"'))).toBe(true);
    // The match moved: the human's hero is not at its tick-0 position at the end.
    expect(snaps[snaps.length - 1]).not.toBe(snaps[0]);
    expect(viaSocket).toEqual(viaWorker);
  });
});
