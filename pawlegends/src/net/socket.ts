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
  SUBPROTOCOL,
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
  hint?: { maxDifficulty: string; newbie: boolean };
}

export interface SocketListener {
  json?(m: ServerJson): void;
  binary?(f: ServerBinary, raw: Uint8Array): void;
  state?(s: 'connecting' | 'open' | 'reconnecting' | 'closed'): void;
}

const TOKEN_KEY = 'pl.party.resume';

export function browserSocketEnv(): SocketEnv {
  const store = {
    get: (k: string) => {
      try {
        return sessionStorage.getItem(k) ?? localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k: string, v: string) => {
      try {
        sessionStorage.setItem(k, v);
        localStorage.setItem(k, v);
      } catch {
        /* private mode */
      }
    },
    del: (k: string) => {
      try {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
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
  private rttSamples: number[] = [];
  lastTurn = 0;
  inMatch = false;
  reconnects = 0;
  private queued: string[] = [];

  constructor(private readonly url: string, private readonly hello: HelloInfo, private readonly env: SocketEnv = browserSocketEnv()) {
    this.token = env.store?.get(TOKEN_KEY) ?? null;
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

  connect(): void {
    this.stopped = false;
    this.emitState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = this.env.open(this.url, SUBPROTOCOL);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const h: ClientJson = { t: 'hello', proto: PROTO, sim: this.hello.sim, simHash: this.hello.simHash, build: this.hello.build };
      if (this.hello.ticket) h.ticket = this.hello.ticket;
      if (this.hello.guestKey) h.guestKey = this.hello.guestKey;
      if (this.hello.hint) h.hint = this.hello.hint;
      if (this.token) h.resume = { token: this.token };
      ws.send(JSON.stringify(h));
    };
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = (e) => this.onClose(e.code);
    ws.onerror = () => undefined;
  }

  private onMessage(data: unknown): void {
    if (typeof data === 'string') {
      let m: ServerJson;
      try {
        m = parseServerJson(data);
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        this.attempt = 0;
        this.member = m.member;
        this.token = m.resumeToken;
        this.env.store?.set(TOKEN_KEY, m.resumeToken);
        if (typeof m.lastSeq === 'number') this.applyLastSeq(m.lastSeq, true);
        this.emitState('open');
        for (const q of this.queued.splice(0)) this.ws?.send(q);
      } else if (m.t === 'match') {
        this.slot = m.you.slot;
        this.inMatch = true;
        this.applyLastSeq(m.lastSeq, true);
        this.startBeats();
      } else if (m.t === 'error' && m.code === 'seat_elsewhere') {
        this.elsewhere = true;
        this.stopped = true;
      } else if (m.t === 'end') {
        this.inMatch = false;
        this.stopBeats();
      }
      this.side.json?.(m);
      this.listener.json?.(m);
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
    if (f.type === Frame.TURN) this.onTurnMeta(f.f.modeMask, f.f.acks);
    else if (f.type === Frame.CATCHUP) for (const t of f.f.turns) this.onTurnMeta(t.modeMask, t.acks);
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

  /** p95 jitter over the last 64 samples (|sample - EWMA|). */
  get jitterP95(): number {
    const d = this.rttSamples.map((s) => Math.abs(s - this.rttMs)).sort((a, b) => a - b);
    return d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 0;
  }

  private onClose(code: number): void {
    this.ws = null;
    this.stopBeats();
    if (this.stopped || this.elsewhere) {
      this.emitState('closed');
      return;
    }
    this.pilotedSince = this.inMatch ? this.pilotedSince : false;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempt);
    const delay = Math.round(base / 2 + this.env.random() * (base / 2));
    this.attempt++;
    this.reconnects++;
    this.emitState('reconnecting');
    this.reconnectTimer = this.env.setTimer(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
    void code;
  }

  /** The backoff delay range of the next reconnect (tests). */
  static backoff(attempt: number): [number, number] {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
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
      if (this.open) this.ws!.send(encodeBeat({ lastTurn: Math.max(0, this.lastTurn), clientMs: Math.floor(this.env.now()) >>> 0 }));
      this.beatTimer = this.env.setTimer(beat, BEAT_MS);
    };
    beat();
  }

  /** Send a BEAT now (right before `back`, so the relay sees the caught-up turn). */
  beatNow(): void {
    if (this.open) this.ws!.send(encodeBeat({ lastTurn: Math.max(0, this.lastTurn), clientMs: Math.floor(this.env.now()) >>> 0 }));
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
    }
    this.ws?.close(1000, 'bye');
    this.ws = null;
  }

  /** Test seam: drop the connection as a network failure would. */
  drop(): void {
    this.ws?.close(4999, 'drop');
  }
}
