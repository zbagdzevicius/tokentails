/**
 * The party socket (docs/plans/moba/MULTIPLAYER.md §2.4, §4.1, §4.5): one WebSocket to the relay with `hello`,
 * resume, reconnect (exponential backoff 250 ms to 5 s with jitter), command sequence numbers and the unacked queue,
 * BEATs and the RTT estimate. Sends on input, never on rAF. Lazy: never imported from the first-load graph.
 *
 * B3 rules: the relay drops any CMD with seq <= its lastSeq. `welcome` (on resume) and `match` return lastSeq; the
 * socket discards everything up to it and continues from lastSeq + 1. After a reconnect it re-sends only unacked
 * commands younger than 500 ms, and none at all if the slot was piloted in between (TURN mode bits say so).
 */
import {
  Frame,
  PROTO,
  PROTO_MIN,
  RELAY_SHARD_RE,
  SUBPROTOCOL,
  WS_PATH,
  decodeServerBinary,
  encodeBeat,
  encodeCmdFrame,
  encodeHash,
  parseServerJson,
  type ClientJson,
  type ServerBinary,
  type ServerJson,
} from './proto';

export const BACKOFF_MIN_MS = 250;
export const BACKOFF_MAX_MS = 5000;
/** In a match a lost socket retries at least every 2 s (LIVE-MATCH-DEPLOYS.md §6): the room waits for nobody. */
export const BACKOFF_MAX_MATCH_MS = 2000;
/**
 * A planned move (close 1012, `room_gone`, `server_moving`, `room_elsewhere`, `party_elsewhere`): the relay says when to
 * come back; at most this many quick retries in a row, then the normal backoff (two draining relays never make a
 * client hammer them).
 */
export const MOVE_RETRIES = 6;
export const MOVE_JITTER_MS = 100;
/**
 * The socket opens while the party ticket is still being fetched (LATENCY-PLAN C2): `hello` waits for the ticket at
 * most this long, then goes as a guest. It matches the embed host's own ticket wait (PARTY_TICKET_WAIT_MS in
 * integrate.ts), so a slow token refresh still signs the player in.
 */
export const TICKET_WAIT_MS = 6000;
/**
 * The relay closes a socket without `hello` 5 s after the upgrade (party-limits.ts helloTimeoutMs). A socket still
 * waiting for the ticket this long after it opened is swapped for a fresh one (a new 5 s window), quietly.
 */
export const HELLO_HOLD_MS = 4000;
/**
 * A party ticket lives 60 s and is single use per relay process. A reconnect after this long (a phone back from the
 * background, a network drop, a move to the other relay instance or a deploy) asks the host for a fresh one: the old
 * ticket would be refused there, and the player would come back as a guest (a generated name, no presence, so friends
 * could not invite them).
 */
export const TICKET_FRESH_MS = 40_000;
/**
 * Relay shards (PROTO 9, LIVE-MATCH-DEPLOYS.md §15): `relay_redirect` names the shard to dial. At most this many
 * redirects within REDIRECT_WINDOW_MS; past that the socket goes back to the front door (two relays that disagree
 * never bounce a player between them).
 */
export const REDIRECT_MAX = 3;
export const REDIRECT_WINDOW_MS = 30_000;
/**
 * Connects in a row that end before a `welcome` (not a planned move) before the socket tries the next relay it knows: a
 * shard's own path, then the front door, then the shards `GET /pawlegends/relays` lists (the front door's relay may be
 * down while another shard serves).
 */
export const SHARD_FAILS_MAX = 2;

/**
 * The relay shards that serve now, the `mm` lease holder first (`GET /pawlegends/relays` on the API, §15). Never throws:
 * an error or a timeout is an empty list.
 */
export async function fetchRelayShards(api: string, timeoutMs = 3000): Promise<string[]> {
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    const res = await fetch(`${api.replace(/\/+$/, '')}/pawlegends/relays`, ctl ? { signal: ctl.signal } : {});
    if (t) clearTimeout(t);
    if (!res.ok) return [];
    const body = (await res.json()) as { shards?: { shard?: unknown; state?: unknown; leader?: unknown }[] };
    return (body.shards ?? [])
      .filter((x) => typeof x.shard === 'string' && RELAY_SHARD_RE.test(x.shard) && x.state !== 'draining')
      .sort((a, b) => Number(!!b.leader) - Number(!!a.leader))
      .map((x) => x.shard as string);
  } catch {
    return [];
  }
}
export const RESEND_WITHIN_MS = 500;
export const BEAT_MS = 500;
const RTT_SAMPLES = 64;

export interface SocketLike {
  readonly readyState: number;
  binaryType: string;
  bufferedAmount?: number;
  send(data: string | ArrayBufferLike | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((e: unknown) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export interface SocketEnv {
  open(url: string, protocol: string): SocketLike;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
  random(): number;
  store?: { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void };
}

export interface HelloInfo {
  sim: number;
  simHash: string;
  build: string;
  ticket?: string;
  guestKey?: string;
  hint?: { maxDifficulty: string; newbie: boolean; matches?: number; watch?: boolean };
}

export interface SocketListener {
  json?(m: ServerJson): void;
  binary?(f: ServerBinary, raw: Uint8Array): void;
  state?(s: 'connecting' | 'open' | 'reconnecting' | 'closed'): void;
}

const TOKEN_KEY = 'pl.party.resume';
/** The relay shard this tab was last sent to (sessionStorage, as the resume token). */
const SHARD_KEY = 'pl.party.relay';

/**
 * The resume token lives in sessionStorage only (this tab, survives a reload, gone with the tab): never localStorage,
 * where any script on the origin could read it later. An older build's localStorage copy is removed on first use.
 */
export function browserSocketEnv(): SocketEnv {
  const store = {
    get: (k: string) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* private mode */
      }
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k: string, v: string) => {
      try {
        sessionStorage.setItem(k, v);
      } catch {
        /* private mode */
      }
    },
    del: (k: string) => {
      try {
        sessionStorage.removeItem(k);
      } catch {
        /* private mode */
      }
    },
  };
  return {
    open: (url, protocol) => new WebSocket(url, protocol) as unknown as SocketLike,
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    random: () => Math.random(),
    store,
  };
}

interface Unacked {
  seq: number;
  bytes: Uint8Array;
  atMs: number;
}

export class PartySocket {
  private ws: SocketLike | null = null;
  private listener: SocketListener = {};
  private attempt = 0;
  private reconnectTimer: unknown = null;
  private beatTimer: unknown = null;
  private stopped = false;
  /** The seat moved to another tab: never retry. */
  elsewhere = false;
  token: string | null;
  member: string | null = null;
  seq = 0;
  readonly unacked: Unacked[] = [];
  /** The slot this socket plays (for TURN acks and mode bits). */
  slot = -1;
  /** The slot was piloted since the last ack: unacked commands are dropped, never re-sent. */
  private pilotedSince = false;
  rttMs = 0;
  /** The relay's clock minus ours (ms, from `welcome.serverMs`): vote deadlines are relay time. */
  serverOffsetMs = 0;
  private rttSamples: number[] = [];
  lastTurn = 0;
  /**
   * The highest turn received (TURN or CATCHUP). BEAT reports it: the relay's reclaim check asks "is the stream
   * reaching this client", and the applied turn lags it by the jitter buffer (up to 5 turns) on purpose.
   */
  receivedTurn = -1;
  private room = '';
  inMatch = false;
  reconnects = 0;
  private queued: string[] = [];
  /** The relay asked for a quick reconnect (`retryMs` of a move code), or null. */
  private moveRetryMs: number | null = null;
  private moveRetries = 0;
  /**
   * The `hello.proto` this socket sends (M1A-IMPL.md §5.5). An older relay answers a newer proto with `update_required`
   * before `welcome`: the socket retries once with PROTO_MIN (party play works, Quick Play hides).
   */
  proto: number = PROTO;
  /** The relay speaks Quick Play (`welcome.proto` ≥ 2). */
  mm = false;
  private welcomedOnce = false;
  /** §15: the relay shard to dial (`<url>/<shard>`), or null for the front door. */
  shard: string | null = null;
  /** §15: recent redirects (env time) and connects to the shard that ended before a `welcome`. */
  private redirects: number[] = [];
  private dialFails = 0;
  /** Shards to try next when the current path keeps failing (from `discoverWith`), and the lookup itself. */
  private candidates: string[] = [];
  private discoverFn: (() => Promise<string[]>) | null = null;
  private discovering = false;
  /** A `welcome` came on the current socket (a redirect after it means the ticket was spent: fetch a fresh one). */
  private welcomedHere = false;
  private freshTicket = false;

  /**
   * `url` is the front door (`…/pawlegends/ws`); a redirect (PROTO 9) appends the shard. The shard a tab was sent to is
   * remembered next to its resume token, so a reload dials the relay that holds its party.
   */
  constructor(private readonly url: string, private readonly hello: HelloInfo, private readonly env: SocketEnv = browserSocketEnv()) {
    this.token = env.store?.get(TOKEN_KEY) ?? null;
    const shard = env.store?.get(SHARD_KEY) ?? null;
    this.shard = shard && RELAY_SHARD_RE.test(shard) ? shard : null;
  }

  /** The URL the next connect dials: the front door, or the shard's own path. */
  get dialUrl(): string {
    if (!this.shard) return this.url;
    const base = this.url.replace(/\/+$/, '');
    return base.endsWith(WS_PATH) ? `${base}/${this.shard}` : this.url;
  }

  private setShard(shard: string | null): void {
    this.shard = shard && RELAY_SHARD_RE.test(shard) ? shard : null;
    this.dialFails = 0;
    if (this.shard) this.env.store?.set(SHARD_KEY, this.shard);
    else this.env.store?.del(SHARD_KEY);
  }

  /** Where the relay shards are (`fetchRelayShards`): asked when every known path failed. */
  discoverWith(fn: () => Promise<string[]>): void {
    this.discoverFn = fn;
  }

  /** A connect ended before `welcome`: after SHARD_FAILS_MAX in a row, the next relay this socket knows. */
  private dialFailed(): void {
    if (++this.dialFails < SHARD_FAILS_MAX) return;
    const next = this.candidates.shift();
    if (next !== undefined) return this.setShard(next);
    // every known shard tried (or none known): the front door, and ask where the shards are now
    this.setShard(null);
    if (!this.discoverFn || this.discovering) return;
    this.discovering = true;
    let ask: Promise<string[]>;
    try {
      ask = this.discoverFn();
    } catch {
      ask = Promise.resolve([]);
    }
    void ask
      .then((list) => {
        this.candidates = list.filter((x) => RELAY_SHARD_RE.test(x));
      })
      .catch(() => undefined)
      .finally(() => {
        this.discovering = false;
      });
  }

  listen(l: SocketListener): void {
    this.listener = l;
  }

  private emitState(st: 'connecting' | 'open' | 'reconnecting' | 'closed'): void {
    this.side.state?.(st);
    this.listener.state?.(st);
  }

  /** The party client's own view of the socket (lane P): every JSON frame and state, whoever holds `listen`. */
  private side: SocketListener = {};
  tap(l: SocketListener): void {
    this.side = l;
  }

  /** The party ticket still being fetched (LATENCY-PLAN C2): `hello` waits for it, at most TICKET_WAIT_MS. */
  private ticketWait: Promise<void> | null = null;
  /** Where a fresh ticket comes from on a reconnect (the host), and when the held one arrived (env time). */
  private ticketSource: (() => Promise<string | null>) | null = null;
  private ticketAtMs = 0;

  /** The player is signed in (the host's account): a first hello that went without a ticket is retried once. */
  private signedIn: (() => boolean) | null = null;
  /** The hello on the current socket carried no ticket. */
  private helloTicketless = false;
  private ticketRetried = false;

  /**
   * Reconnects fetch a fresh ticket from `fn` once the held one is older than TICKET_FRESH_MS (signed-in players).
   * `signedIn`: a signed-in player's first hello that went without a ticket (the host answered late or not at all, e.g.
   * the app's sign-in still starting) is retried once with a fresh ticket before its `welcome` counts, so the relay
   * never takes them for a guest for the whole session (a generated name such as "Sly Calico" instead of their
   * nickname, founder 2026-11-20).
   */
  refreshTicketsWith(fn: () => Promise<string | null>, signedIn?: () => boolean): void {
    this.ticketSource = fn;
    this.signedIn = signedIn ?? null;
  }

  /**
   * Open the socket. `ticket` (the first connect): a party ticket still being fetched; the WebSocket upgrade runs in
   * parallel with it, and `hello` carries it when it settles in time (else the hello goes as a guest).
   */
  connect(ticket?: Promise<string | null>): void {
    const fresh = this.freshTicket;
    this.freshTicket = false;
    if (ticket) this.ticketWait = this.waitTicket(ticket);
    // a reconnect of a signed-in player: a fresh ticket once the held one may be spent or expired (the guest stays one);
    // after a redirect that followed a welcome the ticket is spent on every relay (§15): always a fresh one
    else if (!this.ticketWait && this.ticketSource && this.hello.ticket && (fresh || this.env.now() - this.ticketAtMs >= TICKET_FRESH_MS)) {
      let fresh: Promise<string | null>;
      try {
        fresh = this.ticketSource();
      } catch {
        fresh = Promise.resolve(null);
      }
      this.ticketWait = this.waitTicket(fresh);
    }
    this.stopped = false;
    // before the first `welcome` there is nothing to reconnect to: a bounce off a draining relay is still "connecting"
    this.emitState(this.attempt === 0 || !this.welcomedOnce ? 'connecting' : 'reconnecting');
    this.welcomedHere = false;
    const ws = this.env.open(this.dialUrl, SUBPROTOCOL);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const send = () => {
        // closed (or replaced) while the ticket was still on its way: nothing to say
        if (this.ws !== ws || ws.readyState !== 1 || this.stopped) return;
        const h: ClientJson = { t: 'hello', proto: this.proto, sim: this.hello.sim, simHash: this.hello.simHash, build: this.hello.build };
        if (this.hello.ticket) h.ticket = this.hello.ticket;
        this.helloTicketless = !this.hello.ticket;
        if (this.hello.guestKey) h.guestKey = this.hello.guestKey;
        if (this.hello.hint) h.hint = this.hello.hint;
        if (this.token) h.resume = { token: this.token };
        ws.send(JSON.stringify(h));
      };
      const wait = this.ticketWait;
      if (!wait) {
        send();
        return;
      }
      // still waiting near the relay's hello timeout: reopen (at most once, since TICKET_WAIT_MS < 2 * HELLO_HOLD_MS)
      const hold = this.env.setTimer(() => {
        if (this.ws !== ws || this.stopped || this.ticketWait !== wait) return;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close(4000, 'ticket');
        this.ws = null;
        this.connect();
      }, HELLO_HOLD_MS);
      void wait.then(() => {
        this.env.clearTimer(hold);
        send();
      });
    };
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = (e) => this.onClose(e.code);
    ws.onerror = () => undefined;
  }

  /**
   * The first `welcome` of a signed-in player whose hello went without a ticket: once, a fresh ticket and a new socket
   * (nothing was flushed yet and no seat is held, so nothing is lost). True when it retried.
   */
  private retryTicketless(): boolean {
    if (this.welcomedOnce || this.ticketRetried || !this.helloTicketless || !this.ticketSource || this.inMatch) return false;
    let signed = false;
    try {
      signed = !!this.signedIn?.();
    } catch {
      signed = false;
    }
    if (!signed) return false;
    this.ticketRetried = true;
    let fresh: Promise<string | null>;
    try {
      fresh = this.ticketSource();
    } catch {
      fresh = Promise.resolve(null);
    }
    const ws = this.ws;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close(4000, 'ticket');
    }
    this.ws = null;
    this.connect(fresh);
    return true;
  }

  /** Settles when the ticket is in `hello` (or failed, or took longer than TICKET_WAIT_MS: a guest hello). Never rejects. */
  private waitTicket(ticket: Promise<string | null>): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.env.clearTimer(timer);
        this.ticketWait = null;
        resolve();
      };
      const timer = this.env.setTimer(finish, TICKET_WAIT_MS);
      ticket.then(
        (t) => {
          // a ticket after TICKET_WAIT_MS (the guest hello went out) is dropped: the seat keeps the identity it joined with
          if (!done && t) {
            this.hello.ticket = t;
            this.ticketAtMs = this.env.now();
          }
          finish();
        },
        finish,
      );
    });
  }

  private onMessage(data: unknown): void {
    if (typeof data === 'string') {
      let moveNow = false;
      let m: ServerJson;
      try {
        m = parseServerJson(data);
      } catch {
        return;
      }
      // a relay older than this build refuses PROTO 2 before `welcome`: retry once as PROTO 1 (no Quick Play)
      if (m.t === 'error' && m.code === 'update_required' && !this.welcomedOnce && this.proto > PROTO_MIN) {
        this.proto = PROTO_MIN;
        this.attempt = 0;
        this.ws?.close(4000, 'proto');
        return;
      }
      if (m.t === 'welcome' && this.retryTicketless()) return;
      if (m.t === 'welcome') {
        this.welcomedOnce = true;
        this.welcomedHere = true;
        this.dialFails = 0;
        this.candidates = [];
        this.mm = typeof m.proto === 'number' && m.proto >= 2;
        this.attempt = 0;
        this.moveRetries = 0;
        this.moveRetryMs = null;
        this.member = m.member;
        if (typeof m.serverMs === 'number' && Number.isFinite(m.serverMs)) this.serverOffsetMs = m.serverMs - Date.now();
        this.token = m.resumeToken;
        this.env.store?.set(TOKEN_KEY, m.resumeToken);
        if (typeof m.lastSeq === 'number') this.applyLastSeq(m.lastSeq, true);
        this.emitState('open');
        for (const q of this.queued.splice(0)) this.ws?.send(q);
      } else if (m.t === 'match') {
        // a new room (the rematch on the same socket) starts its turn count again; a resume keeps it
        if (m.room !== this.room) {
          this.room = m.room;
          this.receivedTurn = -1;
          this.lastTurn = 0;
        }
        this.slot = m.you.slot;
        this.inMatch = true;
        this.applyLastSeq(m.lastSeq, true);
        this.startBeats();
      } else if (m.t === 'error' && (m.code === 'server_moving' || m.code === 'room_elsewhere' || m.code === 'party_elsewhere' || (m.code === 'room_gone' && typeof m.retryMs === 'number'))) {
        // a planned move (a deploy): the close that follows reconnects after `retryMs`, not after a backoff
        this.moveRetryMs = Math.max(0, Math.min(5000, typeof m.retryMs === 'number' ? m.retryMs : 250));
        // the relay closes these sockets right after the error; behind the load balancer that close reaches the client
        // about 1 s later (measured Nov 20 on api.tokentails.com). Hang up now and come back after `retryMs`.
        if (m.code !== 'room_gone') moveNow = true;
      } else if (m.t === 'error' && m.code === 'relay_redirect') {
        // §15: dial the shard that holds what we asked for, now; the listener asks again after the next welcome
        const now = this.env.now();
        this.redirects = this.redirects.filter((t) => now - t < REDIRECT_WINDOW_MS);
        this.redirects.push(now);
        const shard = typeof m.shard === 'string' && RELAY_SHARD_RE.test(m.shard) ? m.shard : null;
        // too many in a row: back to the front door (it serves us, or sends us on once more later)
        this.setShard(this.redirects.length > REDIRECT_MAX ? null : shard);
        if (this.welcomedHere) this.freshTicket = true;
        this.moveRetryMs = 0;
        moveNow = true;
      } else if (m.t === 'error' && m.code === 'seat_elsewhere') {
        this.elsewhere = true;
        this.stopped = true;
      } else if (m.t === 'end') {
        this.inMatch = false;
        this.stopBeats();
      }
      this.side.json?.(m);
      this.listener.json?.(m);
      if (moveNow) this.hangUp();
      return;
    }
    const raw = data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array);
    let f: ServerBinary;
    try {
      f = decodeServerBinary(raw);
    } catch {
      return;
    }
    if (f.type === Frame.ECHO) {
      this.sampleRtt(this.env.now() - f.f.clientMs);
      return;
    }
    if (f.type === Frame.TURN) {
      this.onTurnMeta(f.f.modeMask, f.f.acks);
      this.receivedTurn = Math.max(this.receivedTurn, f.f.turn);
    } else if (f.type === Frame.CATCHUP) {
      for (const t of f.f.turns) this.onTurnMeta(t.modeMask, t.acks);
      const last = f.f.turns[f.f.turns.length - 1];
      if (last) this.receivedTurn = Math.max(this.receivedTurn, last.turn);
    }
    this.listener.binary?.(f, raw);
  }

  private onTurnMeta(mask: number, acks: (number | undefined)[]): void {
    if (this.slot < 0) return;
    if ((mask >>> this.slot) & 1) this.pilotedSince = true;
    const a = acks[this.slot];
    if (a !== undefined) {
      this.applyLastSeq(a, false);
      this.pilotedSince = (mask >>> this.slot) & 1 ? true : false;
    }
  }

  /** Drop everything up to `lastSeq`; continue numbering after it. On a resume, re-send young unacked commands. */
  private applyLastSeq(lastSeq: number, resume: boolean): void {
    while (this.unacked.length && this.unacked[0].seq <= lastSeq) this.unacked.shift();
    if (this.seq < lastSeq) this.seq = lastSeq;
    if (!resume) return;
    const now = this.env.now();
    if (this.pilotedSince) {
      this.unacked.length = 0;
      return;
    }
    const young = this.unacked.filter((u) => now - u.atMs < RESEND_WITHIN_MS);
    this.unacked.length = 0;
    for (const u of young) this.sendCmd(u.bytes);
  }

  private sampleRtt(ms: number): void {
    if (!(ms >= 0 && ms < 30_000)) return;
    this.rttMs = this.rttMs === 0 ? ms : this.rttMs * 0.8 + ms * 0.2;
    this.rttSamples.push(ms);
    if (this.rttSamples.length > RTT_SAMPLES) this.rttSamples.shift();
  }

  /**
   * RTT percentiles over the last 64 ECHO samples, and the p95 jitter (`mp_net`, LATENCY-PLAN M1). Read-only: the
   * estimate the game uses stays the EWMA `rttMs`.
   */
  rttStats(): { p50: number; p95: number; jitterP95: number; n: number } {
    const n = this.rttSamples.length;
    if (!n) return { p50: 0, p95: 0, jitterP95: 0, n: 0 };
    const s = [...this.rttSamples].sort((a, b) => a - b);
    const at = (q: number) => s[Math.min(n - 1, Math.floor(n * q))];
    return { p50: Math.round(at(0.5)), p95: Math.round(at(0.95)), jitterP95: Math.round(this.jitterP95), n };
  }

  /** p95 jitter over the last 64 samples (|sample - EWMA|). */
  get jitterP95(): number {
    const d = this.rttSamples.map((s) => Math.abs(s - this.rttMs)).sort((a, b) => a - b);
    return d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 0;
  }

  /** Close the current socket on our side and run the reconnect path at once (its own close event is ignored). */
  private hangUp(): void {
    const ws = this.ws;
    if (!ws || this.stopped) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close(4000, 'move');
    } catch {
      /* already closing */
    }
    this.onClose(1012);
  }

  private onClose(code: number): void {
    this.ws = null;
    this.stopBeats();
    if (this.stopped || this.elsewhere) {
      this.emitState('closed');
      return;
    }
    this.pilotedSince = this.inMatch ? this.pilotedSince : false;
    // §15: a path that keeps failing before any welcome (its relay is down): the next relay this socket knows
    if (!this.welcomedHere && this.moveRetryMs === null && code !== 1012 && code !== 4000 && code !== 4013 && code !== 4014) this.dialFailed();
    const planned = code === 1012 || code === 4013 || code === 4014 || this.moveRetryMs !== null;
    let delay: number;
    if (planned && this.moveRetries < MOVE_RETRIES) {
      // LIVE-MATCH-DEPLOYS.md §6: the relay is moving the room, come back at once (a little jitter spreads a room)
      delay = Math.round((this.moveRetryMs ?? 0) + this.env.random() * MOVE_JITTER_MS);
      this.moveRetries++;
      this.attempt = 0;
    } else {
      const max = this.inMatch ? BACKOFF_MAX_MATCH_MS : BACKOFF_MAX_MS;
      const base = Math.min(max, BACKOFF_MIN_MS * 2 ** this.attempt);
      delay = Math.round(base / 2 + this.env.random() * (base / 2));
      this.attempt++;
    }
    this.moveRetryMs = null;
    this.reconnects++;
    this.emitState(this.welcomedOnce ? 'reconnecting' : 'connecting');
    this.reconnectTimer = this.env.setTimer(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  /** The backoff delay range of the next reconnect (tests); `inMatch` caps it at 2 s. */
  static backoff(attempt: number, inMatch = false): [number, number] {
    const base = Math.min(inMatch ? BACKOFF_MAX_MATCH_MS : BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
    return [base / 2, base];
  }

  get open(): boolean {
    return this.ws !== null && this.ws.readyState === 1 && this.member !== null;
  }

  sendJson(m: ClientJson): void {
    const s = JSON.stringify(m);
    if (this.open) this.ws!.send(s);
    else if (m.t !== 'sync' && this.queued.length < 16) this.queued.push(s);
  }

  /** One command (sim `encodeCommand` bytes): numbered, kept until acked, sent at once when open. */
  /** The open socket still holds bytes it has not handed to the network (an uplink stall). */
  get backlogged(): boolean {
    return this.open && (this.ws!.bufferedAmount ?? 0) > 0;
  }

  sendCmd(bytes: Uint8Array): number {
    const seq = ++this.seq;
    this.unacked.push({ seq, bytes, atMs: this.env.now() });
    if (this.unacked.length > 64) this.unacked.shift();
    if (this.open) this.ws!.send(encodeCmdFrame({ seq, cmd: bytes }));
    return seq;
  }

  sendHash(tick: number, hash: number): void {
    if (this.open) this.ws!.send(encodeHash({ tick, hash }));
  }

  private startBeats(): void {
    this.stopBeats();
    const beat = () => {
      if (this.open) this.ws!.send(encodeBeat({ lastTurn: this.beatTurn, clientMs: Math.floor(this.env.now()) >>> 0 }));
      this.beatTimer = this.env.setTimer(beat, BEAT_MS);
    };
    beat();
  }

  /** Send a BEAT now (right before `back`, so the relay sees the caught-up turn). */
  beatNow(): void {
    if (this.open) this.ws!.send(encodeBeat({ lastTurn: this.beatTurn, clientMs: Math.floor(this.env.now()) >>> 0 }));
  }

  /** What a BEAT reports: the highest turn received (never below the applied one). */
  private get beatTurn(): number {
    return Math.max(0, this.lastTurn, this.receivedTurn);
  }

  private stopBeats(): void {
    if (this.beatTimer !== null) this.env.clearTimer(this.beatTimer);
    this.beatTimer = null;
  }

  /** Leave for good (forget the resume token). */
  close(forget = false): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) this.env.clearTimer(this.reconnectTimer);
    this.stopBeats();
    if (forget) {
      this.token = null;
      this.env.store?.del(TOKEN_KEY);
      this.setShard(null);
    }
    this.ws?.close(1000, 'bye');
    this.ws = null;
  }

  /**
   * Reconnect now, on a fresh connection (the load balancer picks a relay again), after `ms` plus a little jitter. A
   * join whose code this relay did not know tries again this way (LIVE-MATCH-DEPLOYS.md §14). Keeps the resume token.
   */
  bounce(ms = 0): void {
    if (this.stopped || this.elsewhere) return;
    this.moveRetryMs = Math.max(0, Math.min(5000, ms));
    if (this.ws) this.ws.close(4000, 'bounce');
    else if (this.reconnectTimer === null) this.connect();
  }

  /** Test seam: drop the connection as a network failure would. */
  drop(): void {
    this.ws?.close(4999, 'drop');
  }
}
