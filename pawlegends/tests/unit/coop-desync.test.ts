/**
 * The founder's 2026-11-14 co-op report: two friends in one 3v3 party saw each other, but different enemies and towers,
 * and a score that read as "their takedowns summed, ours not". Causes and their guards:
 *  1. a member on another sim build was seated anyway (the relay now refuses; the client never plays a room of another
 *     build, and a fatal update_required is never cleared by a `match`);
 *  2. HASH reporting switched itself off after a short catch-up (a resync, a 31–45 turn CATCHUP, a brief hide), so the
 *     referee never saw the drift;
 *  3. the last match's disposed host answered the rematch's `match` with a sync from its own turn count.
 * Plus: one co-op world on two clients fed the same TURN bytes stays identical (enemies, towers, takedowns).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../../../backend/src/pawlegends/party/room';
import { NetCore } from '../../src/net/net-core';
import { NetHost } from '../../src/net/net-host';
import { decodeServerBinary, type MatchMsg, type ServerJson } from '../../src/net/proto';
import { encodeCommand } from '../../src/sim/commands';
import { createPlayerBotFor, playerBotCommands, result, snapshot, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { SIM_VERSION } from '../../src/sim/version';
import { initialParty, matchBuildOk, reduceParty, screenOf, type PartyState } from '../../src/party/partyClient';
import type { PartyView } from '../../src/net/proto';

/** A 3v3 co-op party: two humans (slots 0 and 1), a bot ally and three bot enemies. */
function config(seed: number) {
  const seats = [
    { slot: 0, hero: 'clem' as const, trick: 'pounce' as const },
    { slot: 1, hero: 'sage' as const, trick: 'snack' as const },
  ];
  const { picks, tricks } = fillPicksParty(seed, seats);
  return { seed, picks: picks as string[], tricks: tricks as string[], difficulty: 'normal', humans: [0, 1] };
}

/** TURN bodies of a relay room whose two humans are player bots thinking on `brain` (a world fed the same turns). */
function relayTurns(cfg: ReturnType<typeof config>, turns: number): Uint8Array[] {
  const bodies: Uint8Array[] = [];
  const room = new Room({ id: 'r', humans: [0, 1], occupied: [0, 1], difficulty: 'normal', forfeitFrom: 0, nowMs: 0, startMs: 0 }, { turn: (_f, b) => bodies.push(b), json: () => undefined, catchup: () => undefined });
  room.connect(0, 0);
  room.connect(1, 0);
  room.loaded(0);
  room.loaded(1);
  const brain = new NetCore(() => undefined);
  brain.start({ config: cfg, slot: 0 });
  const m = () => (brain as unknown as { m: MatchHandle }).m;
  const bots = [createPlayerBotFor(m(), 'normal', 0), createPlayerBotFor(m(), 'normal', 1)];
  const seq = [0, 0];
  let now = 0;
  room.advance(0);
  for (let turn = 0; turn < turns; turn++) {
    now += 200 / 3;
    for (let s = 0; s < 2; s++) for (const c of playerBotCommands(m(), bots[s])) room.intake(s, ++seq[s], encodeCommand(c), now);
    room.beat(0, turn, now);
    room.beat(1, turn, now);
    room.advance(now + 1);
    brain.turns(bodies[bodies.length - 1], true);
    brain.pace(now + 1e6);
  }
  return bodies;
}

/** The world as a player sees it: enemy units (position, HP), every tower and core HP, takedowns and towers per team. */
function seen(m: MatchHandle): string {
  const s = snapshot(m, 0);
  const r = Math.round;
  return JSON.stringify({
    kills: s.score.kills,
    towers: s.score.towers,
    hp: s.entities.filter((e) => e.kind === 'tower' || e.kind === 'core').map((e) => `${e.id}:${r(e.hp)}`),
    enemies: s.entities.filter((e) => e.team === 1 && (e.kind === 'hero' || e.kind === 'minion')).map((e) => `${e.id}:${r(e.x)},${r(e.y)},${r(e.hp)}`),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('co-op party: one world on every client', { timeout: 300_000 }, () => {
  it('two clients on the same TURN bytes: identical hash, enemies, towers and takedowns at every 10 s mark', () => {
    const cfg = config(4242);
    const bodies = relayTurns(cfg, 2400); // 160 s
    const a = new NetCore(() => undefined);
    const b = new NetCore(() => undefined);
    a.start({ config: cfg, slot: 0 });
    b.start({ config: cfg, slot: 1 });
    const ma = () => (a as unknown as { m: MatchHandle }).m;
    const mb = () => (b as unknown as { m: MatchHandle }).m;
    let marks = 0;
    for (let i = 0; i < bodies.length; i++) {
      a.turns(bodies[i], true);
      b.turns(bodies[i], true);
      a.pace(1e9 + i);
      b.pace(1e9 + i);
      if (a.applied === b.applied && a.applied > 0 && a.applied % 150 === 0) {
        expect(a.worldHash).toBe(b.worldHash);
        expect(seen(ma())).toBe(seen(mb()));
        marks++;
      }
    }
    for (let i = 0; i < 10; i++) {
      a.pace(2e9 + i * 100);
      b.pace(2e9 + i * 100);
    }
    expect(marks).toBeGreaterThan(10);
    expect(a.applied).toBe(b.applied);
    expect(a.worldHash).toBe(b.worldHash);
    expect(seen(ma())).toBe(seen(mb()));
    // the match really played (takedowns or tower damage happened), so equal means equal, not empty
    const w = JSON.parse(seen(ma())) as { kills: number[]; hp: string[]; enemies: string[] };
    expect(w.hp.length).toBeGreaterThan(0);
    expect(w.kills[0] + w.kills[1] + w.enemies.length).toBeGreaterThan(0);
    expect(result(ma())?.finalHash).toBe(result(mb())?.finalHash);
  });

  it('a client on another build drifts at once (why the relay must never seat one): its hash differs', () => {
    const cfg = config(4242);
    const bodies = relayTurns(cfg, 300);
    const a = new NetCore(() => undefined);
    const b = new NetCore(() => undefined);
    a.start({ config: cfg, slot: 0 });
    // a stand-in for another sim build: the same turns stepped by a world that differs
    b.start({ config: { ...cfg, seed: cfg.seed + 1 }, slot: 1 });
    for (let i = 0; i < bodies.length; i++) {
      a.turns(bodies[i], true);
      b.turns(bodies[i], true);
      a.pace(1e9 + i);
      b.pace(1e9 + i);
    }
    expect(a.worldHash).not.toBe(b.worldHash);
  });
});

/** A NetHost on a fake socket, fed `bodies` as live TURN frames; returns the HASH frames it sent. */
function hostRun(bodies: Uint8Array[], opts: { resyncAt?: number; catchupAt?: number } = {}) {
  vi.useFakeTimers();
  let t = 0;
  let listener: { json(m: ServerJson): void; binary(f: ReturnType<typeof decodeServerBinary>, raw: Uint8Array): void } | null = null;
  let hashes = 0;
  const json: Record<string, unknown>[] = [];
  const socket = {
    listen: (l: typeof listener) => (listener = l),
    sendCmd: () => 1,
    sendJson: (m: Record<string, unknown>) => json.push(m),
    sendHash: () => hashes++,
    beatNow: () => undefined,
    rttStats: () => ({ n: 0 }),
    rttMs: 50,
    lastTurn: 0,
    receivedTurn: -1,
    backlogged: false,
  };
  const match = { t: 'match', room: 'r', config: config(7), cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: [], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: SIM_VERSION } as unknown as MatchMsg;
  const h = new NetHost(socket as never, match, { worker: false, visibility: false, now: () => t });
  h.join();
  const feed = (k: number) => {
    const raw = new Uint8Array([0x81, ...bodies[k]]);
    socket.receivedTurn = Math.max(socket.receivedTurn, k);
    listener!.binary(decodeServerBinary(raw), raw);
  };
  for (let turn = 0; turn < bodies.length; turn++) {
    if (turn === opts.resyncAt) {
      // the relay's resync: a rebuild, then turns from 0 again (a short catch-up: no fast-forward)
      listener!.json({ t: 'resync', reason: 'desync' } as ServerJson);
      for (let k = 0; k < turn; k++) feed(k);
    }
    feed(turn);
    t += 200 / 3;
    vi.advanceTimersByTime(200 / 3);
  }
  const catching = h.catchingUp;
  h.dispose();
  return { hashes, catching, json, listener: listener!, host: h };
}

describe('NetHost: HASH reporting never switches itself off', { timeout: 300_000 }, () => {
  const bodies = relayTurns(config(7), 600);

  it('after a resync whose catch-up is short (≤ 45 turns), HASH frames resume', () => {
    const normal = hostRun(bodies);
    const afterResync = hostRun(bodies, { resyncAt: 20 });
    expect(normal.hashes).toBeGreaterThan(30);
    // before the fix: 1 (the one from before the resync), for the rest of the match
    expect(afterResync.hashes).toBeGreaterThan(normal.hashes - 5);
    expect(afterResync.catching).toBe(false);
  });
});

describe('NetHost: the last match never touches the rematch', () => {
  it('a disposed host ignores the next room`s match frame (no sync from its old turn count)', () => {
    const r = hostRun(relayTurns(config(7), 60));
    const before = r.json.length;
    r.listener.json({ t: 'match', room: 'r2', you: { slot: 1 } } as unknown as ServerJson);
    expect(r.json.length).toBe(before);
  });
});

const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'K7QX2M',
  phase: 'match',
  leader: 'a',
  difficulty: 'easy',
  openSeats: false,
  locked: false,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on' },
    { id: 'b', name: 'Brave Sage', guest: true, conn: 'on' },
  ],
  you: 'b',
  ...over,
});
const welcome: ServerJson = { t: 'welcome', proto: 1, member: 'b', resumeToken: 'tok', serverMs: 0 };
const run = (s: PartyState, ...ms: ServerJson[]) => {
  const fx = [];
  for (const m of ms) {
    const r = reduceParty(s, { e: 'server', m });
    s = r.state;
    fx.push(...r.effects);
  }
  return { s, fx };
};

describe('party client: a room of another build is never played', () => {
  it('matchBuildOk: version and (when sent) source hash must both match', () => {
    expect(matchBuildOk({ simVersion: 28, simHash: 'aa' }, 28, 'aa')).toBe(true);
    expect(matchBuildOk({ simVersion: 28 }, 28, 'aa')).toBe(true);
    expect(matchBuildOk({ simVersion: 27, simHash: 'aa' }, 28, 'aa')).toBe(false);
    expect(matchBuildOk({ simVersion: 28, simHash: 'bb' }, 28, 'aa')).toBe(false);
  });

  it('a match on another sim version: no match starts, the seat is given back, Update shows', () => {
    const m = { t: 'match', room: 'r1', you: { slot: 1 }, simVersion: SIM_VERSION - 1 } as unknown as MatchMsg;
    const { s, fx } = run(initialParty('create'), welcome, view(), m);
    expect(fx.some((f) => f.t === 'match')).toBe(false);
    expect(fx).toContainEqual({ t: 'send', msg: { t: 'bye' } });
    expect(s.error?.code).toBe('update_required');
    expect(screenOf(s)).toBe('error');
  });

  it('update_required is never cleared by a match that follows it (the relay`s old order)', () => {
    const m = { t: 'match', room: 'r1', you: { slot: 1 }, simVersion: SIM_VERSION } as unknown as MatchMsg;
    const { s, fx } = run(initialParty('create'), welcome, view(), { t: 'error', code: 'update_required' }, m);
    expect(fx.some((f) => f.t === 'match')).toBe(false);
    expect(s.inMatch).toBe(false);
    expect(screenOf(s)).toBe('error');
  });

  it('a teammate on an older build: a note, the lobby stays', () => {
    const { s, fx } = run(initialParty('create'), welcome, view({ phase: 'lobby' }), { t: 'error', code: 'party_update' });
    expect(fx.some((f) => f.t === 'note')).toBe(true);
    expect(screenOf(s)).toBe('lobby');
  });

  it('the same build plays as before', () => {
    const m = { t: 'match', room: 'r1', you: { slot: 1 }, simVersion: SIM_VERSION } as unknown as MatchMsg;
    const { s, fx } = run(initialParty('create'), welcome, view(), m);
    expect(fx.filter((f) => f.t === 'match')).toHaveLength(1);
    expect(screenOf(s)).toBe('match');
  });
});
