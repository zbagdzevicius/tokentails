/**
 * Sends the shelter treat from inside the Heist, without leaving the game (founder request,
 * 2026-10-15: "send a treat from that modal itself without navigating away").
 *
 * Two senders, one shape (`TreatSender`):
 *
 * - **Bridge** (embedded in the `/heist` host page): its own message channel `tt-heist-treat` v1,
 *   separate from the save bridge (`shared/heist-bridge.ts` stays as it is). The host answers
 *   `treat-ready` to `treat-hello`, then sends with `sendTreat({ source: 'heist' })`, so a signed-in
 *   player uses the account and anyone else the guest route. Host side:
 *   `client/components/heist/treatBridge.ts`.
 *
 *     Heist -> host:  treat-hello, treat-send { reqId, chainId?, cat? }, treat-me { reqId }
 *     host -> Heist:  treat-ready, treat-result { reqId, outcome }, treat-me-result { reqId, today }
 *
 *   Same-origin and `event.source` checks are hygiene, as on the save bridge. No answer to a
 *   `treat-send` within 20 s is `failed` (with retry); a bridge send never falls back to a direct
 *   POST, so one tap is at most one treat.
 * - **Direct** (standalone, or no `treat-ready` within 1.5 s): `POST {apiUrl}/shelter/donate/guest`
 *   with `{ source: 'heist', chainId? }` and `GET {apiUrl}/shelter/donate/guest/me`. Same-origin
 *   builds on tokentails.com reach the API through its CORS list; any other host has no `apiUrl`
 *   and is `unavailable` (the panel offers a copyable tokentails.com/heist link, never a redirect).
 *
 * Nothing here navigates. A receipt is only ever an https URL the panel opens in a new tab.
 */

export const TREAT_BRIDGE_CHANNEL = 'tt-heist-treat';
export const TREAT_BRIDGE_VERSION = 1;
/** How long a bridge sender waits for the host's `treat-ready` before it sends directly. */
export const TREAT_HELLO_WAIT_MS = 1500;
/** How long a bridge send waits for its `treat-result`. */
export const TREAT_BRIDGE_ANSWER_MS = 20000;
/** How long a direct POST may take. */
export const TREAT_DIRECT_TIMEOUT_MS = 15000;
/** Longest `reqId` and `cat` accepted on the channel. */
export const TREAT_MAX_FIELD = 64;

/** The Heist's treat states that a send can end in. */
export type TreatOutcome =
  | { kind: 'sent'; receipt?: string }
  | { kind: 'already' }
  | { kind: 'used-up' }
  | { kind: 'paused' }
  /** `timedOut`: no answer in time, so the treat may still have gone out (see treat.ts). */
  | { kind: 'failed'; timedOut?: true }
  | { kind: 'unavailable' };

export const TREAT_OUTCOME_KINDS = ['sent', 'already', 'used-up', 'paused', 'failed', 'unavailable'] as const;

/** Today's treat for this player: one already went out, none yet, or the read failed. */
export type TreatToday = 'none' | 'sent' | 'unknown';

export interface TreatSendRequest {
  /** The network to send on (the live rail's chain); omitted, the backend's main chain. */
  chainId?: number;
  /** The rescued cat, for the host's analytics only. */
  cat?: string;
}

export interface TreatSender {
  /** 'bridge' once the host answered, 'direct' with an API, 'none' without one. */
  readonly mode: 'bridge' | 'direct' | 'none';
  today(): Promise<TreatToday>;
  send(req?: TreatSendRequest): Promise<TreatOutcome>;
  dispose?(): void;
}

/** An https URL, or undefined. A receipt is never a script, data or same-tab link. */
export function safeReceipt(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.length > 512) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const validChain = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 2 ** 40;
const cleanField = (s: unknown) => (typeof s === 'string' ? s.slice(0, TREAT_MAX_FIELD) : undefined);

/** A treat outcome from the channel, or null when it is not one. */
export function parseOutcome(raw: unknown): TreatOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (!TREAT_OUTCOME_KINDS.includes(kind as never)) return null;
  if (kind === 'sent') {
    const receipt = safeReceipt((raw as { receipt?: unknown }).receipt);
    return receipt ? { kind, receipt } : { kind };
  }
  return { kind } as TreatOutcome;
}

// -----------------------------------------------------------------------------------------------
// Direct sender
// -----------------------------------------------------------------------------------------------

type FetchLike = (
  input: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; credentials?: 'omit'; cache?: 'no-store' },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The DONATE_* code of an error body (`{ code }` or `{ message: { code } }`). */
function codeOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const own = (body as { code?: unknown }).code;
  if (typeof own === 'string') return own;
  const nested = (body as { message?: unknown }).message;
  if (nested && typeof nested === 'object' && typeof (nested as { code?: unknown }).code === 'string') return (nested as { code: string }).code;
  return null;
}

/** Maps an HTTP answer from `POST /shelter/donate/guest` to the Heist's outcome. Pure. */
export function outcomeFromResponse(status: number, body: unknown): TreatOutcome {
  if (status >= 200 && status < 300) {
    const receipt = safeReceipt((body as { explorerUrl?: unknown } | null)?.explorerUrl);
    return receipt ? { kind: 'sent', receipt } : { kind: 'sent' };
  }
  switch (codeOf(body)) {
    case 'DONATE_ALREADY_TODAY':
      return { kind: 'already' };
    case 'DONATE_BUDGET_SPENT':
      return { kind: 'used-up' };
    case 'DONATE_PAUSED':
      return { kind: 'paused' };
    case 'DONATE_SEND_FAILED':
      return { kind: 'failed' };
    default:
      break;
  }
  // Older backends answered 503 for a closed jar; a bare 429 is the per-IP limiter (try again).
  if (status === 409 || status === 503) return { kind: 'paused' };
  return { kind: 'failed' };
}

export interface DirectSenderOptions {
  apiUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /**
   * The page is on a Token Tails host (rail.ts DEFAULT_API_BY_HOST), where the API's CORS list
   * allows it, so a network error is a flaky connection, not a block: keep offering the retry.
   */
  homeSite?: boolean;
}

export function createDirectTreatSender(opts: DirectSenderOptions): TreatSender {
  const api = (opts.apiUrl || '').trim().replace(/\/+$/, '');
  const f = opts.fetch ?? (typeof fetch === 'function' ? (fetch.bind(globalThis) as unknown as FetchLike) : undefined);
  const timeoutMs = opts.timeoutMs ?? TREAT_DIRECT_TIMEOUT_MS;
  let networkFailures = 0;
  const mode: TreatSender['mode'] = api && f ? 'direct' : 'none';
  return {
    mode,
    async today() {
      if (!api || !f) return 'unknown';
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), 5000);
      try {
        const res = await f(`${api}/shelter/donate/guest/me`, { headers: { accept: 'application/json' }, signal: ctl?.signal, credentials: 'omit', cache: 'no-store' });
        if (!res.ok) return 'unknown';
        const body = (await res.json()) as { today?: { status?: unknown } | null } | null;
        const s = body?.today?.status;
        return s === 'PENDING' || s === 'SENT' || s === 'CONFIRMED' ? 'sent' : 'none';
      } catch {
        return 'unknown';
      } finally {
        clearTimeout(timer);
      }
    },
    async send(req = {}) {
      if (!api || !f) return { kind: 'unavailable' };
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ctl?.abort();
      }, timeoutMs);
      try {
        const payload = validChain(req.chainId) ? { source: 'heist', chainId: req.chainId } : { source: 'heist' };
        const res = await f(`${api}/shelter/donate/guest`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctl?.signal,
          credentials: 'omit',
        });
        networkFailures = 0;
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return outcomeFromResponse(res.status, body);
      } catch {
        if (timedOut) return { kind: 'failed', timedOut: true };
        // A blocked or failed request (CORS, offline): one retry is offered, then the link.
        networkFailures++;
        return networkFailures >= 2 && !opts.homeSite ? { kind: 'unavailable' } : { kind: 'failed' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// -----------------------------------------------------------------------------------------------
// Bridge sender
// -----------------------------------------------------------------------------------------------

export interface TreatBridgeWindow {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  location: { origin: string };
}

export interface TreatBridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeSenderOptions {
  win: TreatBridgeWindow;
  parent: TreatBridgeTarget | null;
  /** Used when the host never answers `treat-hello` (an old host page). */
  fallback: TreatSender;
  helloWaitMs?: number;
  answerMs?: number;
  newId?: () => string;
}

type Pending = { resolve(value: unknown): void; timer: ReturnType<typeof setTimeout> };

export function createBridgeTreatSender(opts: BridgeSenderOptions): TreatSender {
  const { win, parent, fallback } = opts;
  const origin = win.location.origin && win.location.origin !== 'null' ? win.location.origin : '';
  const helloWaitMs = opts.helloWaitMs ?? TREAT_HELLO_WAIT_MS;
  const answerMs = opts.answerMs ?? TREAT_BRIDGE_ANSWER_MS;
  let seq = 0;
  const newId = opts.newId ?? (() => `t${Date.now().toString(36)}${(++seq).toString(36)}`.slice(0, TREAT_MAX_FIELD));
  let ready = false;
  let disposed = false;
  const readyWaiters = new Set<(ok: boolean) => void>();
  const pending = new Map<string, Pending>();

  const post = (type: string, extra: Record<string, unknown> = {}) => {
    if (!parent || !origin || disposed) return;
    try {
      parent.postMessage({ channel: TREAT_BRIDGE_CHANNEL, v: TREAT_BRIDGE_VERSION, type, ...extra }, origin);
    } catch {
      // A detached parent.
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (disposed || !parent || event.source !== (parent as unknown) || event.origin !== origin) return;
    const d = event.data as { channel?: unknown; v?: unknown; type?: unknown; reqId?: unknown } | null;
    if (!d || typeof d !== 'object' || d.channel !== TREAT_BRIDGE_CHANNEL || d.v !== TREAT_BRIDGE_VERSION) return;
    if (d.type === 'treat-ready') {
      if (!ready) {
        ready = true;
        readyWaiters.forEach((w) => w(true));
        readyWaiters.clear();
      }
      return;
    }
    if ((d.type === 'treat-result' || d.type === 'treat-me-result') && typeof d.reqId === 'string') {
      const p = pending.get(d.reqId);
      if (!p) return;
      pending.delete(d.reqId);
      clearTimeout(p.timer);
      p.resolve(d);
    }
  };
  win.addEventListener('message', onMessage);
  post('treat-hello');

  const waitReady = () =>
    ready
      ? Promise.resolve(true)
      : new Promise<boolean>((resolve) => {
          const done = (ok: boolean) => {
            clearTimeout(timer);
            readyWaiters.delete(done);
            resolve(ok);
          };
          const timer = setTimeout(() => done(false), helloWaitMs);
          readyWaiters.add(done);
          post('treat-hello');
        });

  const ask = (type: 'treat-send' | 'treat-me', extra: Record<string, unknown>, ms: number) =>
    new Promise<unknown>((resolve) => {
      const reqId = newId();
      const timer = setTimeout(() => {
        pending.delete(reqId);
        resolve(null);
      }, ms);
      pending.set(reqId, { resolve, timer });
      post(type, { reqId, ...extra });
    });

  return {
    get mode() {
      return ready ? 'bridge' : fallback.mode;
    },
    async today() {
      if (!(await waitReady())) return fallback.today();
      const answer = (await ask('treat-me', {}, 5000)) as { today?: unknown } | null;
      const t = answer?.today;
      return t === 'none' || t === 'sent' ? t : 'unknown';
    },
    async send(req = {}) {
      if (!(await waitReady())) return fallback.send(req);
      const extra: Record<string, unknown> = {};
      if (validChain(req.chainId)) extra.chainId = req.chainId;
      const cat = cleanField(req.cat);
      if (cat) extra.cat = cat;
      const answer = (await ask('treat-send', extra, answerMs)) as { outcome?: unknown } | null;
      // No answer: the host may still be sending, so never POST directly after a bridge send.
      if (!answer) return { kind: 'failed', timedOut: true };
      return parseOutcome(answer.outcome) ?? { kind: 'failed' };
    },
    dispose() {
      disposed = true;
      win.removeEventListener('message', onMessage);
      pending.forEach((p) => clearTimeout(p.timer));
      pending.clear();
    },
  };
}
