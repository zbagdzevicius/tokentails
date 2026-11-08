/**
 * One soak room (tests/e2e/mp/soak.mjs bundles this file for Node and forks one process per room): 6 casual PvP
 * clients through the casual queue, or 3 co-op clients through a friend party, each built from the game's own net code
 * (PartySocket, NetHost with the inline NetCore, LockstepRunner and Pacer), ticketed accounts, scripted inputs from the
 * snapshots, and random drops (a network drop with resume, a reload, a long absence a bot covers).
 *
 * Checks per room: every client's hash trail agrees at every common 30-tick mark, no `resync`, the same final hash and
 * ticks on every client, the referee's verdict (`verified`, same hash and ticks), each seat's result through the
 * `/live` party save (and a second post refused as a duplicate), and the replay record re-simmed locally.
 *
 * Reports one JSON result to the parent (process.send) and exits. Config: SOAK_ROOM (JSON, see RoomConfig).
 */
import { PartySocket, type SocketEnv, type SocketLike } from '../../../../src/net/socket';
import { NetHost, type PartyEnd } from '../../../../src/net/net-host';
import type { HostListener } from '../../../../src/host/local-host';
import { Frame, type MatchMsg, type ServerJson } from '../../../../src/net/proto';
import { Op, NO_TARGET, type Command, type EntitySnap, type PartyReplayRecord, type PvpReplayRecord, type Snapshot } from '../../../../src/sim/api';
import { SIM_VERSION } from '../../../../src/sim/version';
import { HERO_IDS } from '../../../../src/data/heroes/index';
import { TRICK_IDS } from '../../../../src/data/tricks';
import { heroSideOf } from '../../../../src/sim/server';
import { verifyPartyReplay, verifyPvpReplay } from '../../../../src/sim/party';
import { CORE, LANE_WAYPOINTS, mirrorX } from '../../../../src/data/map';

declare const __SIM_HASH__: string;

interface RoomConfig {
  relay: string;
  mode: 'pvp' | 'coop';
  index: number;
  seed: number;
  /** Chance this room has drops at all (each picks 1 or 2 clients). */
  dropRate: number;
  /** PvP: chance one team votes surrender after 5:00. */
  surrenderRate: number;
  /** Hard cap on the room's wall time (ms). */
  maxMs: number;
}

const cfg = JSON.parse(process.env.SOAK_ROOM ?? '{}') as RoomConfig;
const RELAY = cfg.relay;
const WS_URL = `${RELAY.replace(/^http/, 'ws')}/pawlegends/ws`;
const t0 = Date.now();
const cpu0 = process.cpuUsage();
const log = (...a: unknown[]) => {
  if (process.env.SOAK_VERBOSE === '1') console.error(`[room ${cfg.index} +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
};

/** mulberry32: a seeded stream per room and client (a failing room reruns with its seed). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)] };
}
const R = rng(cfg.seed);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]);
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${RELAY}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json()) as T;
}
async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const r = await fetch(`${RELAY}${path}`);
  return { status: r.status, body: (await r.json()) as T };
}

// ------------------------------------------------------------------------------------------------ one client

interface DropPlan {
  kind: 'drop' | 'reload' | 'away';
  /** ms after the match went live. */
  atMs: number;
  /** reload / away: how long the tab stays closed (ms). */
  gapMs: number;
}

class Client {
  socket!: PartySocket;
  host: NetHost | null = null;
  match: MatchMsg | null = null;
  snap: Snapshot | null = null;
  readonly store = new Map<string, string>();
  readonly json: ServerJson[] = [];
  private waiters: (() => void)[] = [];
  readonly r: ReturnType<typeof rng>;
  /** Tick → hash this client sent the relay (only hashes sent outside a catch-up, as the game does). */
  readonly hashes = new Map<number, number>();
  readonly inputMs: number[] = [];
  readonly turnGapMs: number[] = [];
  private lastTurnAt = 0;
  resyncs = 0;
  holds = 0;
  catchups = 0;
  reconnects = 0;
  reloads = 0;
  stalls = 0;
  longestStallMs = 0;
  rejoinMs: number[] = [];
  notes = new Map<string, number>();
  errors: string[] = [];
  end: { outcome: string; ticks: number; finalHash: string; record: PartyReplayRecord | PvpReplayRecord | null; party: PartyEnd | undefined } | null = null;
  closed = false;
  /** In the gap of a reload or absence (no socket, no host). */
  offline = false;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private progressAt = 0;
  private progressTurn = -1;
  private stallSince = 0;
  surrenderAtMs = -1;
  liveAt = 0;
  plan: DropPlan | null = null;
  dropDone = false;
  lostSeat = false;
  private awaitMatchSince = 0;
  private outage = false;
  /** When the relay welcomed this client back without its seat, and when its match ended. */
  lostAt = 0;
  endAt = 0;
  private hostAt = 0;

  constructor(
    readonly idx: number,
    readonly accountId: string,
    private ticket: string,
  ) {
    this.r = rng(cfg.seed * 31 + idx * 7919 + 1);
  }

  get slot(): number {
    return this.match?.you.slot ?? -1;
  }
  get team(): 0 | 1 {
    return cfg.mode === 'pvp' && this.slot >= 3 ? 1 : 0;
  }

  private env(): SocketEnv {
    const self = this;
    return {
      open(url, protocol) {
        const ws = new WebSocket(url, protocol);
        ws.binaryType = 'arraybuffer';
        // a new connection: the gap since the last TURN on the old one is an outage, not turn jitter
        self.lastTurnAt = 0;
        // a thin wrapper: TURN arrival times for the inter-arrival histogram, everything else passed through
        const like: SocketLike = {
          get readyState() {
            return ws.readyState;
          },
          get binaryType() {
            return ws.binaryType;
          },
          set binaryType(v: string) {
            ws.binaryType = v as BinaryType;
          },
          get bufferedAmount() {
            return ws.bufferedAmount;
          },
          send: (d) => ws.send(d as never),
          close: (code, reason) => ws.close(code, reason),
          onopen: null,
          onclose: null,
          onerror: null,
          onmessage: null,
        };
        ws.onopen = (e) => like.onopen?.(e);
        ws.onclose = (e) => like.onclose?.({ code: e.code });
        ws.onerror = (e) => like.onerror?.(e);
        ws.onmessage = (e) => {
          if (e.data instanceof ArrayBuffer && new Uint8Array(e.data)[0] === Frame.TURN) {
            const now = performance.now();
            if (self.lastTurnAt && self.host && !self.end) self.turnGapMs.push(now - self.lastTurnAt);
            self.lastTurnAt = now;
          }
          like.onmessage?.({ data: e.data });
        };
        return like;
      },
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      random: () => this.r.next(),
      store: { get: (k) => this.store.get(k) ?? null, set: (k, v) => void this.store.set(k, v), del: (k) => void this.store.delete(k) },
    };
  }

  /** Open a socket as the game does (PartyClient: hello with the ticket and guest key, then `connect`). */
  connect(): void {
    this.lastTurnAt = 0;
    this.socket = new PartySocket(
      WS_URL,
      {
        sim: SIM_VERSION,
        simHash: __SIM_HASH__,
        build: 'soak',
        ticket: this.ticket,
        guestKey: `soak${cfg.index}x${this.idx}x${this.accountId.slice(-8)}`,
        hint: { maxDifficulty: 'hard', newbie: false, matches: 12 } as never,
      },
      this.env(),
    );
    const s = this.socket;
    // hashes the game sends to the relay: the trail compared across clients
    const sendHash = s.sendHash.bind(s);
    s.sendHash = (tick: number, hash: number) => {
      this.hashes.set(tick, hash >>> 0);
      sendHash(tick, hash);
    };
    s.tap({
      json: (m) => this.onJson(m),
      state: (st) => {
        // one outage emits `reconnecting` on the close and again on each retry: count the outage once
        if (st === 'reconnecting' && !this.outage) {
          this.outage = true;
          this.reconnects++;
        } else if (st === 'open') this.outage = false;
      },
    });
    s.connect();
  }

  private onJson(m: ServerJson): void {
    if (this.closed) return;
    this.json.push(m);
    if (this.json.length > 400) this.json.splice(0, 200);
    if (m.t === 'resync') this.resyncs++;
    if (m.t === 'error') {
      this.errors.push(m.code);
      if (m.code === 'bad_ticket' || m.code === 'seat_taken' || m.code === 'room_gone') log(`client ${this.idx} error ${m.code}`);
    }
    if (m.t === 'match') {
      this.awaitMatchSince = 0;
      // the game builds its NetHost after the match screen loads (a macrotask later): never twice for one room
      if (!this.host || this.match?.room !== m.room) {
        const match = m;
        setTimeout(() => this.startHost(match), 5);
      }
    }
    // after a drop or a reload the relay sends `match` again right after `welcome` when it took the socket back into
    // its seat; a welcome with no match (a fresh member) is a lost seat
    if (m.t === 'welcome' && this.match && !this.end) this.awaitMatchSince = Date.now();
    this.waiters.splice(0).forEach((w) => w());
  }

  last<T extends ServerJson['t']>(t: T): Extract<ServerJson, { t: T }> | undefined {
    for (let i = this.json.length - 1; i >= 0; i--) if (this.json[i].t === t) return this.json[i] as Extract<ServerJson, { t: T }>;
    return undefined;
  }

  async until<T>(pred: () => T | null | undefined | false, ms = 30_000, what = 'condition'): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = pred();
      if (v) return v;
      if (Date.now() > end) throw new Error(`client ${this.idx}: timeout waiting for ${what}`);
      await new Promise<void>((r) => {
        const t = setTimeout(r, 100);
        this.waiters.push(() => {
          clearTimeout(t);
          r();
        });
      });
    }
  }

  send(m: Parameters<PartySocket['sendJson']>[0]): void {
    this.socket.sendJson(m);
  }

  private startHost(m: MatchMsg): void {
    if (this.closed || this.offline) return;
    if (this.host && this.match?.room === m.room) return;
    this.host?.dispose();
    this.match = m;
    const host = new NetHost(this.socket, m, {
      worker: false,
      visibility: false,
      notify: (n) => this.notes.set(n.key, (this.notes.get(n.key) ?? 0) + 1),
      track: (e, p) => {
        if (e === 'mp_rejoin' && typeof p.ms === 'number') this.rejoinMs.push(p.ms);
      },
    });
    this.host = host;
    // the measured send-to-applied samples (the same ones as mp_net.input_p50 / p95)
    const samples = host.inputSamples;
    const push = samples.push.bind(samples);
    samples.push = (...v: number[]) => {
      this.inputMs.push(...v);
      return push(...v);
    };
    const listener: HostListener = {
      welcome: () => undefined,
      snap: (s) => {
        this.snap = s;
      },
      events: () => undefined,
      end: (r, replay) => {
        const party = (replay as { party?: PartyEnd }).party;
        this.endAt = Date.now();
        this.end = { outcome: replay.outcome, ticks: r.ticks, finalHash: r.finalHash, record: party?.record ?? null, party };
        log(`client ${this.idx} slot ${this.slot} end ${replay.outcome} ${r.ticks} ${r.finalHash}`);
      },
      error: (msg) => void this.errors.push(`host:${msg}`),
    };
    host.listen(listener);
    host.join();
    if (!this.liveAt) this.liveAt = Date.now();
    this.hostAt = Date.now();
    this.progressAt = Date.now();
    this.progressTurn = -1;
    if (!this.inputTimer) this.inputTimer = setInterval(() => this.tick(), 250);
  }

  /** Every 250 ms: maybe one scripted command, stall bookkeeping, drops and surrender. */
  private nextCmdAt = 0;
  private tick(): void {
    if (this.closed || this.end) return;
    const now = Date.now();
    if (this.awaitMatchSince && now - this.awaitMatchSince > 8000) {
      this.lostAt = this.awaitMatchSince;
      this.awaitMatchSince = 0;
      this.lostSeat = true;
      log(`client ${this.idx} slot ${this.slot}: welcomed back without its seat (${this.errors.join(',')})`);
    }
    // stall: the match is live, this client is connected, and no TURN arrived for 3 s (5 s grace after a host start)
    if (this.host && !this.offline && now - this.hostAt > 5000) {
      const turn = this.socket.receivedTurn;
      if (turn !== this.progressTurn) {
        if (this.stallSince) this.longestStallMs = Math.max(this.longestStallMs, now - this.stallSince);
        this.stallSince = 0;
        this.progressTurn = turn;
        this.progressAt = now;
      } else if (this.socket.open && now - this.progressAt > 3000 && !this.stallSince) {
        this.stalls++;
        this.stallSince = this.progressAt;
        log(`client ${this.idx} stall at turn ${turn}`);
      }
      const n = this.host.net();
      this.holds = Math.max(this.holds, n.holds);
      this.catchups = Math.max(this.catchups, n.catchups);
    }
    if (this.plan && !this.dropDone && this.liveAt && now - this.liveAt >= this.plan.atMs) {
      this.dropDone = true;
      void this.runDrop(this.plan);
    }
    if (this.surrenderAtMs >= 0 && this.liveAt && now - this.liveAt >= this.surrenderAtMs && this.host && !this.offline) {
      this.surrenderAtMs = -1;
      this.host.send({ op: Op.Forfeit });
    }
    if (!this.host || this.offline || now < this.nextCmdAt) return;
    this.nextCmdAt = now + 300 + this.r.int(500);
    const cmd = this.pickCommand();
    if (cmd) this.host.send(cmd);
  }

  /** A plausible player: fight a visible enemy hero in range, else push the lane to the enemy core. */
  private lane = 0;
  private pickCommand(): Command | null {
    const s = this.snap;
    if (!s) return null;
    const me = s.entities.find((e) => e.kind === 'hero' && e.slot === this.slot);
    if (!me || me.state === 'dead') return null;
    const d2 = (e: EntitySnap) => (e.x - me.x) ** 2 + (e.y - me.y) ** 2;
    const enemies = s.entities.filter((e) => e.kind === 'hero' && e.team !== this.team && e.state !== 'dead' && d2(e) < 9000 ** 2).sort((a, b) => d2(a) - d2(b));
    const foe = enemies[0];
    const roll = this.r.next();
    if (foe && roll < 0.4) {
      const ready = [0, 1, 2, 3].filter((k) => (me.cooldowns?.[k] ?? 0) === 0);
      if (ready.length) return { op: Op.Cast, slot: this.r.pick(ready) as 0 | 1 | 2 | 3, x: foe.x, y: foe.y, id: this.r.next() < 0.5 ? foe.id : NO_TARGET };
      return { op: Op.Attack, id: foe.id };
    }
    if (foe && roll < 0.6) return { op: Op.Attack, id: foe.id };
    if (foe && roll < 0.7) {
      // a sidestep (kiting, dodging a skillshot)
      return { op: Op.Move, x: me.x + (this.r.int(5001) - 2500), y: me.y + (this.r.int(5001) - 2500) };
    }
    if (roll < 0.72) return { op: Op.Talent, tier: this.r.int(3) as 0 | 1 | 2, choice: this.r.int(2) as 0 | 1 };
    if (roll < 0.75 && (me.cooldowns?.[4] ?? 0) === 0) return { op: Op.Trick, x: me.x + (this.team === 0 ? 3000 : -3000), y: me.y };
    if (this.r.next() < 0.05) this.lane = this.r.int(2);
    const wp = this.lane === 0 ? LANE_WAYPOINTS.sunny : LANE_WAYPOINTS.puddle;
    const flip = (x: number) => (this.team === 0 ? x : mirrorX(x));
    const enemyCore = { x: this.team === 0 ? mirrorX(CORE.x) : CORE.x, y: CORE.y };
    // own half: walk the lane's waypoints; past the river: the enemy core
    const ownHalf = this.team === 0 ? me.x < 50000 : me.x > 50000;
    const target = ownHalf ? wp.map(([x, y]) => ({ x: flip(x), y })).find((p) => (this.team === 0 ? p.x > me.x + 2000 : p.x < me.x - 2000)) ?? enemyCore : enemyCore;
    return { op: Op.AttackMove, x: target.x, y: target.y };
  }

  /** A drop: the network (the socket resumes by itself), a reload (a new socket with the resume token and a fresh ticket), or a long absence. */
  private async runDrop(p: DropPlan): Promise<void> {
    log(`client ${this.idx} slot ${this.slot} ${p.kind} (${p.gapMs} ms)`);
    if (p.kind === 'drop') {
      this.socket.drop();
      return;
    }
    // a closed tab: the host and socket go away; sessionStorage (the resume token) survives a reload
    this.offline = true;
    this.reloads++;
    this.host?.dispose();
    this.host = null;
    this.snap = null;
    this.socket.close(false);
    await sleep(p.gapMs);
    if (this.closed) return;
    // the embed host mints a new single-use ticket for the reloaded page
    const t = await post<{ ticket: string }>('/soak/ticket', { accountId: this.accountId });
    this.ticket = t.ticket;
    this.offline = false;
    this.connect();
  }

  dispose(): void {
    this.closed = true;
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.host?.dispose();
    this.socket?.close(true);
  }
}

// ------------------------------------------------------------------------------------------------ the room

const ipc = (m: unknown) => process.send?.(m);
let lockWait: (() => void) | null = null;
process.on('message', (m: { t?: string }) => {
  if (m?.t === 'lock-ok') lockWait?.();
});
const queueLock = () =>
  new Promise<void>((r) => {
    if (!process.send) return r();
    lockWait = r;
    ipc({ t: 'lock' });
  });

const heroesOf = (side: string) => HERO_IDS.filter((h) => heroSideOf(h) === side);

async function lobbyPvp(cs: Client[]): Promise<void> {
  await queueLock();
  try {
    for (const c of cs) c.send({ t: 'mm.join', queue: 'casual', side: 'any' });
    const found = await Promise.all(cs.map((c) => c.until(() => c.last('mm.found'), 60_000, 'mm.found')));
    const ids = new Set(found.map((f) => f.match));
    if (ids.size !== 1) throw new Error(`queue: the 6 clients were split over ${ids.size} matches`);
    cs.forEach((c, i) => c.send({ t: 'mm.accept', match: found[i].match!, yes: true }));
    await Promise.all(cs.map((c) => c.until(() => (c.last('party') as { phase?: string } | undefined)?.phase === 'pick', 30_000, 'pick')));
  } finally {
    ipc({ t: 'unlock' });
  }
  const used: Record<number, Set<string>> = { 0: new Set(), 1: new Set() };
  for (const c of cs) {
    const v = c.last('party') as unknown as { mm: { team: 0 | 1; species: [string, string] } };
    const free = heroesOf(v.mm.species[v.mm.team]).filter((h) => !used[v.mm.team].has(h));
    const hero = c.r.pick(free);
    used[v.mm.team].add(hero);
    c.send({ t: 'pick.lock', hero, trick: c.r.pick(TRICK_IDS) });
  }
}

async function lobbyCoop(cs: Client[]): Promise<void> {
  const [lead, ...rest] = cs;
  lead.send({ t: 'party.create', difficulty: R.pick(['easy', 'normal', 'hard'] as const) });
  const view = await lead.until(() => lead.last('party'), 30_000, 'party');
  for (const c of rest) c.send({ t: 'party.join', code: view.code });
  await lead.until(() => (lead.last('party')?.members.length ?? 0) === cs.length, 30_000, 'members');
  lead.send({ t: 'party.start' });
  await Promise.all(cs.map((c) => c.until(() => c.last('party')?.phase === 'pick', 30_000, 'pick')));
  const side = R.pick(['cat', 'dog']);
  const heroes = heroesOf(side);
  const order = [...heroes].sort(() => R.next() - 0.5);
  lead.send({ t: 'pick.lock', hero: order[0], trick: R.pick(TRICK_IDS) });
  await lead.until(() => lead.last('party')?.members.find((m) => m.id === lead.last('party')!.you)?.locked, 15_000, 'leader lock');
  rest.forEach((c, i) => c.send({ t: 'pick.lock', hero: order[i + 1], trick: c.r.pick(TRICK_IDS) }));
}

async function main(): Promise<void> {
  const n = cfg.mode === 'pvp' ? 6 : 3;
  const accts = await post<{ accountId: string; ticket: string }[]>('/soak/tickets', { n });
  const cs = accts.map((a, i) => new Client(i, a.accountId, a.ticket));
  const result: Record<string, unknown> = { index: cfg.index, mode: cfg.mode, seed: cfg.seed, ok: false, problems: [] as string[] };
  const problems = result.problems as string[];
  try {
    for (const c of cs) c.connect();
    await Promise.all(cs.map((c) => c.until(() => c.last('welcome'), 20_000, 'welcome')));
    if (cfg.mode === 'pvp') await lobbyPvp(cs);
    else await lobbyCoop(cs);
    // loading: the game reports progress, then `loaded` once its match module is in
    await Promise.all(cs.map((c) => c.until(() => ['loading', 'match'].includes(c.last('party')?.phase ?? ''), 60_000, 'loading')));
    for (const c of cs) {
      c.send({ t: 'load', pct: 50 });
      c.send({ t: 'loaded' });
    }
    await Promise.all(cs.map((c) => c.until(() => c.host, 30_000, 'match')));
    const room = cs[0].match!.room;
    result.room = room;
    log(`room ${room} live (${cfg.mode})`);

    // drops: 1 or 2 clients, a network drop, a reload or a long absence, between 0:20 and 5:00
    if (R.next() < cfg.dropRate) {
      const k = 1 + R.int(2);
      const who = [...cs].sort(() => R.next() - 0.5).slice(0, k);
      for (const c of who) {
        const kind = R.pick(['drop', 'drop', 'reload', 'away'] as const);
        c.plan = { kind, atMs: 20_000 + R.int(280_000), gapMs: kind === 'reload' ? 2000 + R.int(8000) : kind === 'away' ? 18_000 + R.int(20_000) : 0 };
      }
    }
    result.drops = cs.filter((c) => c.plan).map((c) => ({ slot: c.slot, ...c.plan }));
    if (cfg.mode === 'pvp' && R.next() < cfg.surrenderRate) {
      const team = R.int(2);
      const at = 305_000 + R.int(60_000);
      for (const c of cs) if (c.team === team) c.surrenderAtMs = at;
      result.surrender = { team, atMs: at };
    }

    // play until every client's NetHost reports the end (the sim's end plus the relay's `end`)
    await Promise.all(cs.map((c) => c.until(() => c.end || c.lostSeat, cfg.maxMs, 'end')));
    // a client that came back after its room ended (a surrender passed while it was away) has no seat to get back
    const done0 = cs.filter((c) => c.end);
    const roomEndAt = done0.length ? Math.min(...done0.map((c) => c.endAt)) : Infinity;
    const lost = cs.filter((c) => c.lostSeat && !c.end && c.lostAt < roomEndAt - 3000);
    if (lost.length) problems.push(`seat lost after a drop: ${lost.map((c) => `slot ${c.slot} (${c.plan?.kind}; errors ${c.errors.join(',') || 'none'})`).join(', ')}`);
    const done = cs.filter((c) => c.end);
    if (!done.length) throw new Error('no client reached the end');
    const wallMs = Date.now() - Math.min(...cs.map((c) => c.liveAt));
    result.wallMs = wallMs;
    for (const c of cs) {
      c.host?.dispose();
      c.host = null;
    }

    // 1. the clients agree with each other
    const ends = done.map((c) => c.end!);
    const hashes = new Set(ends.map((e) => e.finalHash));
    const ticks = new Set(ends.map((e) => e.ticks));
    if (hashes.size !== 1) problems.push(`final hash differs between clients: ${[...hashes].join(',')}`);
    if (ticks.size !== 1) problems.push(`final ticks differ between clients: ${[...ticks].join(',')}`);
    let common = 0;
    let differ = 0;
    const allTicks = new Set(cs.flatMap((c) => [...c.hashes.keys()]));
    for (const t of allTicks) {
      const vals = cs.filter((c) => c.hashes.has(t)).map((c) => c.hashes.get(t)!);
      if (vals.length < 2) continue;
      common++;
      if (new Set(vals).size > 1) differ++;
    }
    result.trail = { marks: common, differ };
    if (differ) problems.push(`hash trail differs at ${differ} of ${common} marks`);
    const resyncs = cs.reduce((n, c) => n + c.resyncs, 0);
    if (resyncs) problems.push(`${resyncs} resync(s)`);
    if (cfg.mode === 'pvp') {
      const t0w = done.filter((c) => c.team === 0).map((c) => c.end!.outcome);
      const t1w = done.filter((c) => c.team === 1).map((c) => c.end!.outcome);
      if (t0w.length && t1w.length && (new Set(t0w).size !== 1 || new Set(t1w).size !== 1 || t0w[0] === t1w[0])) problems.push(`PvP outcomes inconsistent: team0 ${t0w} team1 ${t1w}`);
    }

    // 2. the referee's verdict (the relay verifies the TURN log three ways before `verified`)
    let stored: Record<string, any> | null = null;
    for (let i = 0; i < 60; i++) {
      const r = await get<Record<string, any>>(`/soak/room?id=${room}`);
      if (r.status === 200 && r.body.status !== 'live') {
        stored = r.body;
        if (r.body.verdict) break;
      }
      await sleep(500);
    }
    const v = stored?.verdict;
    result.verdict = v ? { outcome: v.outcome, winner: v.winner, ticks: v.ticks, reason: v.reason, verified: v.verified } : null;
    result.logBytes = stored?.logBytes ?? 0;
    if (!stored || stored.status !== 'ended') problems.push(`room status ${stored?.status ?? 'missing'}`);
    else if (!v?.verified) problems.push('verdict not verified');
    else if (v.finalHash !== ends[0].finalHash || v.ticks !== ends[0].ticks) problems.push(`verdict ${v.finalHash}/${v.ticks} differs from the clients ${ends[0].finalHash}/${ends[0].ticks}`);

    // 3. each seat's result through the /live party save; a second post of the first one is a duplicate
    const saves: Record<string, number> = {};
    for (const c of done) {
      const e = c.end!;
      if (e.party?.scored === false) {
        saves.unscored = (saves.unscored ?? 0) + 1;
        continue;
      }
      const body = { v: 2, room, slot: c.slot, simVersion: e.record?.simVersion ?? SIM_VERSION, ticks: e.ticks, outcome: e.outcome, finalHash: e.finalHash };
      const r = await post<{ ok: boolean; status?: number; code?: string; message?: string }>('/soak/live', { userId: c.accountId, pawlegends: body });
      const key = r.ok ? 'saved' : `${r.status}:${r.code}`;
      saves[key] = (saves[key] ?? 0) + 1;
      // a seat a bot flew most of the match is refused by the AFK rule (409): expected only for a long absence
      if (!r.ok && !(r.code === 'PAWLEGENDS_PARTY_AFK' && c.plan?.kind === 'away')) problems.push(`/live slot ${c.slot}: ${r.status} ${r.code} ${r.message}`);
    }
    const first = done.find((c) => c.end!.party?.scored !== false);
    if (first) {
      const e = first.end!;
      const again = await post<{ ok: boolean; status?: number }>('/soak/live', {
        userId: first.accountId,
        pawlegends: { v: 2, room, slot: first.slot, simVersion: e.record?.simVersion ?? SIM_VERSION, ticks: e.ticks, outcome: e.outcome, finalHash: e.finalHash },
      });
      if (again.ok || again.status !== 409) problems.push(`duplicate /live save not refused (${again.status})`);
    }
    result.saves = saves;

    // 4. the client's replay record re-simmed (the record the game holds for the result screen)
    const rec = ends.find((e) => e.record)?.record ?? null;
    if (rec) {
      const vr = cfg.mode === 'pvp' ? verifyPvpReplay(rec) : verifyPartyReplay(rec);
      result.replay = { ok: vr.ok, ...(vr.ok ? {} : { why: (vr as { error?: string }).error }) };
      if (!vr.ok) problems.push(`local replay verify failed: ${JSON.stringify(vr)}`);
      else if ((vr as { finalHash?: string }).finalHash && (vr as { finalHash?: string }).finalHash !== ends[0].finalHash) problems.push('local replay hash differs');
    } else problems.push('no replay record');

    result.ok = problems.length === 0;
  } catch (e) {
    // the relay refused the room for capacity (its loop or referee gate on a loaded host): not a defect, the
    // orchestrator counts it and starts another room
    if (!result.room && cs.some((c) => c.errors.includes('server_busy'))) result.refused = true;
    problems.push(String((e as Error)?.message ?? e));
  }
  const cpu = process.cpuUsage(cpu0);
  const all = (f: (c: Client) => number[]) => cs.flatMap(f);
  Object.assign(result, {
    ticks: cs[0]?.end?.ticks ?? 0,
    outcome: cs[0]?.end?.outcome ?? null,
    inputP50: pct(all((c) => c.inputMs), 0.5),
    inputP95: pct(all((c) => c.inputMs), 0.95),
    inputN: all((c) => c.inputMs).length,
    turnGapP50: pct(all((c) => c.turnGapMs), 0.5),
    turnGapP95: pct(all((c) => c.turnGapMs), 0.95),
    turnGapMax: pct(all((c) => c.turnGapMs), 1),
    stalls: cs.reduce((n, c) => n + c.stalls, 0),
    longestStallMs: Math.max(0, ...cs.map((c) => c.longestStallMs)),
    holds: cs.reduce((n, c) => n + c.holds, 0),
    reconnects: cs.reduce((n, c) => n + c.reconnects, 0),
    reloads: cs.reduce((n, c) => n + c.reloads, 0),
    rejoinMs: all((c) => c.rejoinMs),
    resyncs: cs.reduce((n, c) => n + c.resyncs, 0),
    errors: [...new Set(cs.flatMap((c) => c.errors))],
    clientCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    clientRssMb: Math.round(process.memoryUsage().rss / 1e6),
    elapsedMs: Date.now() - t0,
  });
  for (const c of cs) c.dispose();
  ipc({ t: 'result', result });
  if (!process.send) console.log(JSON.stringify(result));
  setTimeout(() => process.exit(0), 200);
}

void main();
