/** Platform public API (GDD 13.3 platform/*, 13.6 save data, 14 analytics). Never throws. */
import { SIM_VERSION, type AnalyticsEvent, type AnalyticsProps, type DayRecord, type EnvInfo, type PlatformApi, type Profile, type Store, type TreatMeter } from '../types';
import { createStore as createStoreImpl } from './storage';
import { detectEnv as detectEnvImpl, platformOf } from './env';
import { classifyEntry, configureAnalytics, flush, linkAttribution, readConsent, setAnalyticsConsent, setAnalyticsSender, track, writeConsent } from './analytics';
import { createPosthogSender, POSTHOG_CAPTURE_URL } from './posthog';
import { KEY_DAYS, KEY_PREVIEW_DAYS, KEY_PROFILE, readDayRecord, sanitizeProfile, writeDayRecord, CLUB_MAX_CATS, mergeProfileSave, profileFor } from './records';
import { getEntitlements } from './entitlements';
import { baseUrl, createA2hs, registerServiceWorker as registerSw, type A2hsController } from './pwa';
import { icsReminder } from './ics';

export { track };
export { STORE_PREFIX, type StorageLike, type MemoryStore } from './storage';
export {
  SHORT_URL,
  detectInApp,
  detectIOS,
  detectAndroidChrome,
  sanitizePresaleUrl,
  sanitizeApiUrl,
  apiUrlFor,
  API_BY_HOST,
  sanitizePosthogKey,
  sanitizeShortUrl,
  readEnvSource,
  platformOf,
  type EnvSource,
} from './env';
export {
  flush as flushAnalytics,
  configureAnalytics,
  setAnalyticsConsent,
  setAnalyticsSender,
  analyticsQueue,
  analyticsCommon,
  clearAnalytics,
  resetAnalytics,
  readConsent,
  writeConsent,
  classifyEntry,
  linkAttribution,
  CONSENT_KEY,
  type TrackedEvent,
  type ConsentState,
  type AnalyticsConfig,
} from './analytics';
export { createPosthogSender, posthogBodies, POSTHOG_EU_HOST, POSTHOG_CAPTURE_URL } from './posthog';
export { getEntitlements, FREE_ENTITLEMENTS, CLUB_ENTITLEMENTS, type Entitlements } from './entitlements';
export {
  KEY_ENTITLEMENTS,
  decodeEntitlementToken,
  sanitizeEntitlements,
  cachedEntitlementToken,
  entitlementsExpired,
  cosmeticsForSkus,
  ownsCosmetic,
  OWNED_SKUS,
} from './entitlements';
export { openPresale } from './checkout';
export {
  PINK_PAW_CATS,
  PINK_PAW_SHELTER,
  PINK_PAW_LINE,
  PINK_PAW_STATUS_AS_OF,
  PINK_PAW_JSON,
  FOUND_A_HOME,
  accompliceFor,
  pinkPawAdoptUrl,
  pinkPawCatSpec,
  pinkPawWaiting,
  pinkPawAlumni,
  pinkPawSnapshot,
  parsePinkPawSnapshot,
  loadPinkPawCats,
  stillWaiting,
  alumni,
  pinkPawBadge,
  setLivePinkPawStatus,
  livePinkPawStatus,
  pinkPawGuestSpecs,
  fridayCriminal,
  pinkPawFaceUrl,
  type PinkPawCat,
  type PinkPawStatus,
  type PinkPawSnapshot,
} from './pink-paw';
export { loadCameos, cameosEnabled, type Cameo } from './cameos';
export {
  KEY_PROFILE,
  KEY_DAYS,
  KEY_PREVIEW_DAYS,
  DAYS_CAP,
  FREE_MAX_CATS,
  CLUB_MAX_CATS,
  defaultProfile,
  sanitizeProfile,
  sanitizePrefs,
  sanitizeCat,
  sanitizeDayRecord,
  profileFor,
  editableCats,
  mergeProfileSave,
  readDays,
  pruneDays,
  readDayRecord,
  writeDayRecord,
  type DayMap,
} from './records';
export { icsReminder, icsText, icsFold, icsEscape, parseReminderTime, ICS_MIME } from './ics';
export { qrSvg, QR_MAX_BYTES } from './qr';
export { createA2hs, swUrl, swScope, swSkipReason, buildId, baseUrl, A2HS_MIN_DAILIES, type A2hsController, type A2hsState } from './pwa';

/** localStorage under `bcd:v1:`; falls back to memory when storage throws. */
export function createStore(prefix = 'bcd:v1:'): Store {
  return createStoreImpl(prefix);
}
export function detectEnv(): EnvInfo {
  return detectEnvImpl();
}

/** Validate `treat-meter.json` (hand-edited monthly). */
export function parseTreatMeter(raw: unknown): TreatMeter | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.month !== 'string' || !/^\d{4}-\d{2}$/.test(r.month)) return null;
  if (typeof r.cents !== 'number' || !Number.isInteger(r.cents) || r.cents < 0) return null;
  const currency = typeof r.currency === 'string' && /^[a-z]{3}$/.test(r.currency) ? r.currency : 'usd';
  const collars = typeof r.collars === 'number' && Number.isInteger(r.collars) && r.collars >= 0 ? r.collars : 0;
  const updated = typeof r.updated === 'string' ? r.updated.slice(0, 32) : '';
  return { month: r.month, cents: r.cents, currency, collars, updated };
}

type FetchJson = (url: string, init?: { cache?: string; credentials?: string }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Static same-origin JSON next to the game (never the API, never a third party). */
export async function treatMeter(opts: { fetch?: FetchJson; base?: string } = {}): Promise<TreatMeter | null> {
  try {
    const f = opts.fetch ?? ((globalThis as { fetch?: FetchJson }).fetch?.bind(globalThis) as FetchJson | undefined);
    if (!f) return null;
    const res = await f(`${opts.base ?? baseUrl()}treat-meter.json`, { cache: 'no-cache', credentials: 'same-origin' });
    if (!res.ok) return null;
    return parseTreatMeter(await res.json());
  } catch {
    return null;
  }
}

/** "€12.40 for Pink Paw this month" helper for the home screen. */
export function formatTreatMeter(m: TreatMeter, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency.toUpperCase() }).format(m.cents / 100);
  } catch {
    return `${(m.cents / 100).toFixed(2)} ${m.currency.toUpperCase()}`;
  }
}

/** Random id per page load (never stored). */
export function newSessionId(): string {
  try {
    const b = new Uint8Array(12);
    (globalThis.crypto as Crypto).getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

/** Stable 50/50 arm from random bytes. */
function randomArm(): 'A' | 'B' {
  try {
    const b = new Uint8Array(1);
    (globalThis.crypto as Crypto).getRandomValues(b);
    return b[0] & 1 ? 'B' : 'A';
  } catch {
    return Math.random() < 0.5 ? 'A' : 'B';
  }
}

/** Ranked dailies recorded on this device (launch days + preview days): the A2HS gate. */
export function dailyCount(store: Store): number {
  try {
    const n = (k: string) => {
      const v = store.get<unknown>(k, {});
      return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : 0;
    };
    return n(KEY_DAYS) + n(KEY_PREVIEW_DAYS);
  } catch {
    return 0;
  }
}

export const KEY_ANALYTICS_ID = 'aid';

export interface PlatformOptions {
  store?: Store;
  env?: EnvInfo;
  /** Page URL + referrer for the `entry` prop (default: the live location). */
  href?: string;
  referrer?: string;
  /** Test hooks. */
  fetch?: typeof fetch;
  consentStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  win?: unknown;
}

function liveHref(): { href: string; referrer: string } {
  try {
    const g = globalThis as { location?: { href?: string }; document?: { referrer?: string } };
    return { href: g.location?.href ?? '', referrer: g.document?.referrer ?? '' };
  } catch {
    return { href: '', referrer: '' };
  }
}

export function createPlatform(opts: PlatformOptions = {}): PlatformApi {
  const env = opts.env ?? detectEnvImpl();
  const store = opts.store ?? createStoreImpl();
  const sid = newSessionId();
  const consentStore = opts.consentStorage;
  let a2hsCtl: A2hsController | null = null;

  const loadProfile = (): Profile => {
    const raw = store.get<unknown>(KEY_PROFILE, null);
    const p = sanitizeProfile(raw, CLUB_MAX_CATS);
    if (raw === null) store.set(KEY_PROFILE, p); // pin createdAt on first boot
    return p;
  };
  const maxCats = (): number => {
    try {
      return getEntitlements(store).maxCats;
    } catch {
      return 1;
    }
  };

  // Common props (GDD 14). day_no / room_id are set by the UI per screen via configureAnalytics({ common }).
  try {
    const loc = opts.href !== undefined ? { href: opts.href, referrer: opts.referrer ?? '' } : liveHref();
    const first = (() => {
      try {
        return (loadProfile().sessions | 0) === 0;
      } catch {
        return true;
      }
    })();
    configureAnalytics({
      dev: env.dev,
      common: {
        sim_version: SIM_VERSION,
        platform: platformOf(env),
        in_app_browser: env.inApp,
        entry: loc.href ? classifyEntry(loc.href, loc.referrer) : 'direct',
        is_first_session: first,
        ...linkAttribution(loc.href),
      },
    });
  } catch {
    /* analytics is optional */
  }

  // PostHog EU: only with a key; events leave only after consent (setAnalyticsConsent below).
  if (env.posthogKey) {
    const key = env.posthogKey;
    const distinctId = (): string => {
      try {
        let id = store.get<string | null>(KEY_ANALYTICS_ID, null);
        if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) {
          id = newSessionId();
          store.set(KEY_ANALYTICS_ID, id); // only reached after consent (the sender runs only then)
        }
        return id;
      } catch {
        return sid;
      }
    };
    configureAnalytics({ endpoint: POSTHOG_CAPTURE_URL });
    setAnalyticsSender(createPosthogSender({ key, distinctId, fetch: opts.fetch as never }));
    setAnalyticsConsent(readConsent(consentStore) === 'granted');
    try {
      const w = (opts.win ?? globalThis) as { addEventListener?(t: string, f: () => void): void };
      w.addEventListener?.('pagehide', () => void flush());
    } catch {
      /* ignore */
    }
  }

  return {
    env,
    store,
    track(event: AnalyticsEvent, props?: AnalyticsProps) {
      track(event, props);
    },
    profile(): Profile {
      try {
        return profileFor(loadProfile(), maxCats());
      } catch {
        return sanitizeProfile(null);
      }
    },
    saveProfile(p: Profile): boolean {
      try {
        const prev = sanitizeProfile(store.get<unknown>(KEY_PROFILE, null), CLUB_MAX_CATS);
        return store.set(KEY_PROFILE, mergeProfileSave(prev, p, maxCats()));
      } catch {
        return false;
      }
    },
    dayRecord(dayNo: number): DayRecord | null {
      try {
        return readDayRecord(store, dayNo);
      } catch {
        return null;
      }
    },
    saveDayRecord(dayNo: number, r: DayRecord): boolean {
      try {
        return writeDayRecord(store, dayNo, r);
      } catch {
        return false;
      }
    },
    presaleUrl(): string | null {
      return env.presaleUrl;
    },
    vibrate(ms: number): void {
      try {
        const nav = (globalThis as { navigator?: Navigator }).navigator;
        if (nav && typeof nav.vibrate === 'function') nav.vibrate(Math.max(0, Math.min(1000, Math.floor(ms))));
      } catch {
        /* iOS has no vibrate; ignore */
      }
    },
    consent() {
      return readConsent(consentStore);
    },
    setConsent(granted: boolean) {
      writeConsent(!!granted, consentStore);
      // Without a PostHog key there is no sender: granting consent still sends nothing.
    },
    sessionId() {
      return sid;
    },
    abArm(): 'A' | 'B' {
      try {
        const raw = store.get<Record<string, unknown> | null>(KEY_PROFILE, null);
        const p = sanitizeProfile(raw, CLUB_MAX_CATS);
        if (p.abArm) return p.abArm;
        p.abArm = randomArm();
        store.set(KEY_PROFILE, p);
        return p.abArm;
      } catch {
        return 'A';
      }
    },
    icsReminder(time: string, url: string): Blob {
      return icsReminder(time, url);
    },
    a2hs() {
      try {
        if (!a2hsCtl) a2hsCtl = createA2hs(env, { win: opts.win as never, track });
        return a2hsCtl.state(dailyCount(store));
      } catch {
        return { available: false, ios: false, prompt: async () => false };
      }
    },
    registerServiceWorker(): void {
      try {
        // Capture beforeinstallprompt as early as possible (it fires once, near load).
        if (!a2hsCtl) a2hsCtl = createA2hs(env, { win: opts.win as never, track });
        registerSw(env, opts.win as never);
      } catch {
        /* ignore */
      }
    },
    treatMeter() {
      return treatMeter({ fetch: opts.fetch as never });
    },
  };
}
