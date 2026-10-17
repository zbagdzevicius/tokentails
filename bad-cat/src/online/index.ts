/**
 * Phase 2 online services (GDD 10, 13.8, 17.3): Token Tails accounts, ranked saves through the one score route
 * (`POST /user/catbassadors/live`, type BAD_CAT, replay-verified on the server), the daily board, short links with
 * server OG cards, the public room feed, the live treat meter, live Pink Paw statuses, "/yourcat" import, web push and
 * the creator dashboard.
 *
 * Online whenever the game has an API origin (EnvInfo.apiUrl: VITE_BADCAT_API_URL, else the production API on
 * tokentails.com); each feature then follows the backend's GET /badcat/status. Without an origin every call answers
 * null / false / 'off' and makes ZERO requests.
 * Accounts also need an auth origin (VITE_BADCAT_AUTH_ORIGIN, or the page itself on tokentails.com).
 */
import {
  BADCAT_ROUTES,
  type AccountResponse,
  type BadcatRunLogBody,
  type BadcatSaveResponse,
  type BoardMeResponse,
  type BoardResponse,
  type CreatorDashboard,
  type EntitlementResponse,
  type EnvInfo,
  type FeedResponse,
  type FeedRoom,
  type OnlineApi,
  type OnlineFeatures,
  type OnlineSession,
  type RankedSaveOutcome,
  type RoomPublishResponse,
  type RunResult,
  type ShortLinkRequest,
  type ShortLinkResponse,
  type Store,
  type TreatMeter,
  type YourcatImport,
} from '../types';
import { encodeInputs } from '../sim';
import { parseTreatMeter } from '../platform';
import { authOriginFor, createAuthBridge, type AuthBridge } from './auth';
import { createHttp, sanitizeBase, type FetchLike, type Http } from './http';
import { createPushClient, type PushClient } from './push';
import { importFromYourcat } from './yourcat';

export { authOriginFor, createAuthBridge, parseSession, AUTH_CHANNEL } from './auth';
export { createHttp, sanitizeBase, accessToken } from './http';
export { importFromYourcat, FAMILY_COATS } from './yourcat';
export { urlBase64ToBytes } from './push';

/** The one score route (CLAUDE.md: game scores are saved only here). */
export const LIVE_ROUTE = '/user/catbassadors/live';
/** Pink Paw's public gallery (shared/pink-paw.ts pinkPawGalleryPath). */
export const PINK_PAW_GALLERY = '/shelter/rozine-pedute/gallery';
export const KEY_RANK_QUEUE = 'rankQueue';
/** Queued ranked runs kept at most this long (the backend's grace window is 1-7 days). */
export const QUEUE_MAX_AGE_MS = 3 * 86_400_000;
export const QUEUE_MAX = 5;

export const NO_FEATURES: OnlineFeatures = Object.freeze({
  accounts: false,
  scores: false,
  boards: false,
  shortLinks: false,
  feed: false,
  meter: false,
  push: false,
  streakEmail: false,
  creatorDashboard: false,
  livePinkPaw: false,
  yourcat: false,
});

export interface OnlineEnvRaw {
  authOrigin?: string;
}

/** VITE_BADCAT_AUTH_ORIGIN (config, not a switch). */
export function readOnlineEnvRaw(): OnlineEnvRaw {
  try {
    const e = (import.meta.env ?? {}) as Record<string, string | boolean | undefined>;
    return {
      authOrigin: typeof e.VITE_BADCAT_AUTH_ORIGIN === 'string' ? e.VITE_BADCAT_AUTH_ORIGIN : undefined,
    };
  } catch {
    return {};
  }
}

interface QueuedRun {
  log: BadcatRunLogBody;
  at: number;
}

export interface OnlineDeps {
  env: Pick<EnvInfo, 'apiUrl' | 'dev'>;
  store: Store;
  raw?: OnlineEnvRaw;
  fetch?: FetchLike;
  now?: () => number;
  /** Test seams. */
  bridge?: AuthBridge | null;
  push?: PushClient;
  location?: { origin: string; hostname: string; href: string };
}

type Status = Partial<Record<keyof OnlineFeatures, boolean>> & { enabled?: boolean };

export function createOnline(deps: OnlineDeps): OnlineApi {
  const raw = deps.raw ?? readOnlineEnvRaw();
  const base = sanitizeBase(deps.env.apiUrl ?? null, deps.env.dev);
  const enabled = !!base;
  const http: Http = createHttp(base, { fetch: deps.fetch });
  const now = deps.now ?? (() => Date.now());
  const loc = deps.location ?? (typeof location !== 'undefined' ? location : { origin: '', hostname: '', href: '' });
  const authOrigin = enabled ? authOriginFor(raw.authOrigin, loc, deps.env.dev) : null;
  let bridge: AuthBridge | null | undefined = deps.bridge;
  let featuresP: Promise<OnlineFeatures> | null = null;
  const sessionListeners = new Set<(s: OnlineSession | null) => void>();
  const push: PushClient = deps.push ?? createPushClient();

  const features = (): Promise<OnlineFeatures> => {
    if (!enabled) return Promise.resolve(NO_FEATURES);
    if (!featuresP) {
      featuresP = http.get<Status>(BADCAT_ROUTES.status).then((res) => {
        const s = res.ok && res.data ? res.data : {};
        const on = (k: keyof OnlineFeatures) => s.enabled === true && s[k] === true;
        const accounts = on('accounts') && !!authOrigin;
        return {
          accounts,
          scores: on('scores') && accounts,
          boards: on('boards'),
          shortLinks: on('shortLinks'),
          feed: on('feed'),
          meter: on('meter'),
          push: on('push'),
          streakEmail: on('streakEmail') && accounts,
          creatorDashboard: on('creatorDashboard') && accounts,
          livePinkPaw: true,
          yourcat: accounts,
        };
      });
    }
    return featuresP;
  };

  /** The bridge exists only once the server says accounts are on. */
  const auth = async (): Promise<AuthBridge | null> => {
    if (bridge !== undefined) return bridge;
    const f = await features();
    if (!f.accounts || !authOrigin || typeof document === 'undefined') return (bridge = null);
    try {
      bridge = createAuthBridge(authOrigin);
      bridge.onSession((s) => {
        for (const fn of sessionListeners) fn(s);
        if (s?.signedIn) void flushRanked();
      });
    } catch {
      bridge = null;
    }
    return bridge;
  };
  const token = async (): Promise<string | null> => (await auth())?.token() ?? null;

  // ----- ranked saves -----

  const queue = (): QueuedRun[] => {
    const list = deps.store.get<QueuedRun[]>(KEY_RANK_QUEUE, []);
    return Array.isArray(list) ? list.filter((q) => q && q.log && now() - q.at < QUEUE_MAX_AGE_MS) : [];
  };
  const saveQueue = (list: QueuedRun[]): void => {
    deps.store.set(KEY_RANK_QUEUE, list.slice(-QUEUE_MAX));
  };
  const enqueue = (log: BadcatRunLogBody): void => {
    const list = queue().filter((q) => q.log.dayNo !== log.dayNo);
    list.push({ log, at: now() });
    saveQueue(list);
  };
  const dequeue = (dayNo: number): void => saveQueue(queue().filter((q) => q.log.dayNo !== dayNo));

  const send = async (log: BadcatRunLogBody): Promise<RankedSaveOutcome> => {
    const t = await token();
    if (!t) return { status: 'signed_out' };
    const res = await http.post<BadcatSaveResponse & { code?: string }>(LIVE_ROUTE, { type: 'BAD_CAT', platform: 'web', badcat: log }, { token: t });
    const code = res.data && typeof (res.data as { code?: unknown }).code === 'string' ? (res.data as { code: string }).code : '';
    if (res.ok && res.data) {
      let rank: number | undefined;
      if ((await features()).boards) {
        const me = await http.get<BoardMeResponse>(`${BADCAT_ROUTES.board}/${log.dayNo}/me`, { token: t });
        if (me.ok && me.data && typeof me.data.rank === 'number') rank = me.data.rank;
      }
      return { status: 'saved', save: res.data, ...(rank ? { rank } : {}) };
    }
    if (res.status === 409) return { status: code === 'BADCAT_ALREADY_RANKED' ? 'already' : 'duplicate' };
    if (res.status === 400 && code === 'BADCAT_SIM_VERSION') return { status: 'stale_sim' };
    if (res.status === 400 && code === 'BADCAT_DAY_CLOSED') return { status: 'closed' };
    if (res.status === 404) return { status: 'off' }; // an older backend without the BAD_CAT branch
    if (res.status === 401 || res.status === 403 || res.status === 428) return { status: 'signed_out' };
    if (res.status === 400) return { status: 'rejected' };
    return { status: 'queued' };
  };

  /** Keep the run for later when it may still save (offline, signed out, a backend with an older sim). */
  const keep = (o: RankedSaveOutcome): boolean => o.status === 'queued' || o.status === 'signed_out' || o.status === 'stale_sim';

  const submitRanked = async (r: RunResult, ctx: { catCode?: string; name?: string }): Promise<RankedSaveOutcome> => {
    if (!enabled || r.mode !== 'ranked' || r.dayNo === undefined) return { status: 'off' };
    const f = await features();
    if (!f.scores) return { status: 'off' };
    const log: BadcatRunLogBody = {
      dayNo: r.dayNo,
      simVersion: r.simVersion,
      runs: encodeInputs(r.inputs).map((x) => [x[0], x[1], x[2], x[3]]) as [number, number, number, number][],
      finalHash: r.finalHash >>> 0,
      score: r.score,
      ...(ctx.catCode ? { catCode: ctx.catCode } : {}),
      ...(ctx.name ? { name: ctx.name.slice(0, 24) } : {}),
    };
    if (!log.runs.length || r.score <= 0) return { status: 'rejected' };
    const out = await send(log);
    if (keep(out)) enqueue(log);
    else dequeue(log.dayNo);
    return out;
  };

  let flushing: Promise<number> | null = null;
  const flushRanked = (): Promise<number> => {
    if (!enabled) return Promise.resolve(0);
    if (flushing) return flushing;
    flushing = (async () => {
      const f = await features();
      if (!f.scores) return 0;
      let saved = 0;
      for (const q of queue()) {
        const out = await send(q.log);
        if (out.status === 'saved') saved++;
        if (!keep(out)) dequeue(q.log.dayNo);
        if (out.status === 'signed_out' || out.status === 'queued') break;
      }
      return saved;
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  };

  const gated = async <T>(feature: keyof OnlineFeatures, run: () => Promise<T | null>): Promise<T | null> => {
    if (!enabled) return null;
    if (!(await features())[feature]) return null;
    return run();
  };
  const data = <T>(p: Promise<{ ok: boolean; data: T | null }>): Promise<T | null> => p.then((r) => (r.ok ? r.data : null));

  return {
    enabled,
    features,
    session: () => (bridge ? bridge.session() : null),
    onSession(fn) {
      sessionListeners.add(fn);
      void auth();
      return () => sessionListeners.delete(fn);
    },
    signIn(returnUrl) {
      void auth().then((b) => b?.signIn(returnUrl ?? loc.href));
    },
    async signOut() {
      await (await auth())?.signOut();
    },
    submitRanked,
    flushRanked,
    board: (dayNo) => gated('boards', () => data(http.get<BoardResponse>(`${BADCAT_ROUTES.board}/${Math.trunc(dayNo)}`))),
    boardMe: (dayNo) =>
      gated('boards', async () => {
        const t = await token();
        return t ? data(http.get<BoardMeResponse>(`${BADCAT_ROUTES.board}/${Math.trunc(dayNo)}/me`, { token: t })) : null;
      }),
    account: () =>
      gated('accounts', async () => {
        const t = await token();
        return t ? data(http.get<AccountResponse>(BADCAT_ROUTES.account, { token: t })) : null;
      }),
    claimPurchases: () =>
      gated('accounts', async () => {
        const t = await token();
        return t ? data(http.post<EntitlementResponse>(BADCAT_ROUTES.accountClaim, {}, { token: t })) : null;
      }),
    async setStreakEmail(on) {
      const r = await gated('streakEmail', async () => {
        const t = await token();
        return t ? data(http.post<{ ok: boolean; on: boolean }>(BADCAT_ROUTES.streakEmail, { on }, { token: t })) : null;
      });
      return !!r?.ok;
    },
    async shorten(longUrl, meta) {
      const short = await gated('shortLinks', async () => {
        let path = '';
        try {
          const u = new URL(longUrl);
          if (!u.pathname.startsWith('/badcat') || u.hash) return null;
          path = u.pathname + u.search;
        } catch {
          return null;
        }
        const body: ShortLinkRequest = { ...meta, path };
        return data(http.post<ShortLinkResponse>(BADCAT_ROUTES.link, body));
      });
      return short?.url && /^https:\/\//.test(short.url) ? short.url : longUrl;
    },
    publishRoom: (code, clear, feed) =>
      gated('feed', () => data(http.post<RoomPublishResponse>(BADCAT_ROUTES.room, { code, ...(clear ? { clear } : {}), feed }))),
    feed: (sort, cursor) => gated('feed', () => data(http.get<FeedResponse>(BADCAT_ROUTES.feed, { query: { sort, ...(cursor ? { cursor } : {}) } }))),
    room: (id) => gated('feed', () => (/^[A-Za-z0-9]{8}$/.test(id) ? data(http.get<FeedRoom>(`${BADCAT_ROUTES.room}/${id}`)) : Promise.resolve(null))),
    async playRoom(id) {
      await gated('feed', () => (/^[A-Za-z0-9]{8}$/.test(id) ? data(http.post(`${BADCAT_ROUTES.room}/${id}/play`, {})) : Promise.resolve(null)));
    },
    async reportRoom(id) {
      const r = await gated('feed', () => (/^[A-Za-z0-9]{8}$/.test(id) ? data(http.post<{ ok: boolean }>(`${BADCAT_ROUTES.room}/${id}/report`, {})) : Promise.resolve(null)));
      return !!r?.ok;
    },
    meter: (): Promise<TreatMeter | null> => gated('meter', async () => parseTreatMeter(await data(http.get<unknown>(BADCAT_ROUTES.meter)))),
    pinkPaw: () =>
      gated('livePinkPaw', async () => {
        const body = await data(http.get<{ atShelter?: unknown[]; adopted?: unknown[] }>(PINK_PAW_GALLERY));
        if (!body || !Array.isArray(body.atShelter) || !Array.isArray(body.adopted)) return null;
        const out: Record<string, 'WAITING' | 'RECOVERING' | 'ADOPTED'> = {};
        for (const c of [...body.atShelter, ...body.adopted]) {
          const cat = c as { id?: unknown; status?: unknown };
          if (typeof cat?.id !== 'string' || !/^[0-9a-f]{24}$/i.test(cat.id)) continue;
          const st = cat.status === 'ADOPTED' || cat.status === 'RECOVERING' || cat.status === 'WAITING' ? cat.status : null;
          if (st) out[cat.id.toLowerCase()] = st;
        }
        return out;
      }),
    yourcat: (): Promise<YourcatImport | null> =>
      gated('yourcat', async () => {
        const t = await token();
        if (!t) return null;
        const res = await data(http.get<{ item?: unknown }>('/yourcat/me', { token: t }));
        return importFromYourcat(res?.item ?? null);
      }),
    creator: (): Promise<CreatorDashboard | null> =>
      gated('creatorDashboard', async () => {
        const t = await token();
        return t ? data(http.get<CreatorDashboard>(BADCAT_ROUTES.creatorDashboard, { token: t })) : null;
      }),
    push: {
      supported: () => enabled && push.supported(),
      async state() {
        if (!enabled || !(await features()).push) return 'unsupported';
        return push.state();
      },
      async subscribe(localHour) {
        if (!enabled || !(await features()).push) return false;
        const key = await data(http.get<{ publicKey: string }>(BADCAT_ROUTES.pushKey));
        if (!key?.publicKey) return false;
        const sub = await push.subscribe(key.publicKey);
        if (!sub) return false;
        const res = await http.post<{ ok: boolean }>(BADCAT_ROUTES.pushSubscribe, {
          subscription: sub,
          hour: Math.max(0, Math.min(23, Math.trunc(localHour))),
          tzOffsetMin: new Date(now()).getTimezoneOffset(),
        });
        return res.ok;
      },
      async unsubscribe() {
        if (!enabled) return false;
        const endpoint = await push.unsubscribe();
        if (!endpoint) return false;
        await http.post(BADCAT_ROUTES.pushUnsubscribe, { endpoint });
        return true;
      },
    },
  };
}
