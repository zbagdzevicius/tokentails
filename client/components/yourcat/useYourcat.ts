/**
 * The `/yourcat` state machine (docs/plans/yourcat-v2.md §1): status, the record, the upload, the
 * late pixel portrait poll, the paid-return poll and visibility handling.
 *
 * - The status is fetched on mount and again whenever the page becomes visible, so a cached "open"
 *   never hides a spent budget for long.
 * - When POST /yourcat answers with the pixel portrait still `pending`, S2 stays (R2-01): the meter's
 *   "Coat" segment fills, the heading says "Almost there", and GET /yourcat/:id is polled every 1.5 s.
 *   S3 starts once the portrait is `ready` and decoded (or `failed`), or after `PORTRAIT_WAIT_MS`,
 *   when it falls back to the pending path below.
 * - On S3 the pixel portrait is polled at 1.5, 1.5, 1.5, 1.5, 2.5 s, then every 4 s, and stops as soon
 *   as it is `ready` or `failed`, or 60 s after the record was made (the server then reads it as failed).
 * - The visitor's own daily cap (`*_DAILY_CAP`) is remembered for this tab and UTC day in
 *   sessionStorage (R2-09): S1 then shows the spent state before another photo is chosen.
 * - The paid return polls every 4 s for up to 10 minutes.
 * - Nothing is polled while the tab is hidden; polling resumes on `visibilitychange`.
 * - A shared link (`?cat=<shareId>`, docs/plans/yourcat-polish.md §4 S0, §8) opens the friend view:
 *   the shared cat comes from the public `GET /yourcat/public/:shareId`. A 404, a network error or an
 *   invalid id drops `cat` from the address (`history.replaceState`, the UTM parameters stay) and
 *   shows S1 with no message.
 */
import { analytics } from "@/analytics";
import { buildGrowthEvent, elapsedSeconds } from "@/analytics/growth-events";
import { YOURCAT_API, YourcatRequestError } from "@/api/yourcat-api";
import type { YourcatPortraitStatus, YourcatPublicView, YourcatStatusView, YourcatView } from "@/models/yourcat";
import Router from "next/router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ERROR_TEXT,
  failureEventCode,
  PRIVACY_NOTICE_VERSION,
  S1,
  uploadErrorCopy,
  type ErrorCopy,
  type RequestFailure,
} from "./copy";
import { fetchPinkPawCandidates, type PinkPawCandidate } from "./pinkPawPick";
import { prepareUpload, type PreparedUpload } from "./prepareUpload";
import { warmCardFonts } from "./shareCard";
import { scanRemainingMs } from "./motion";
import { decodeRevealImage } from "./pixelateReveal";
import { loadUtm, readShareId, readUtm, storeUtm } from "./utm";

export type Screen = "upload" | "working" | "manual" | "reveal" | "paid" | "friend";

/** A shared cat shown on the friend view (S0). */
export interface FriendCat {
  shareId: string;
  view: YourcatPublicView;
}

/**
 * Drops `cat` from the address bar and keeps every other parameter (the UTMs). Never throws. Through
 * the Next router once it is ready (its own hydration update would otherwise put the old query back);
 * with no router (tests, embeds) through the History API.
 */
export function dropShareParam(): void {
  const run = () => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("cat")) return;
      url.searchParams.delete("cat");
      const query = url.searchParams.toString();
      const next = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
      if (Router.router) {
        void Router.replace(next, undefined, { shallow: true, scroll: false }).catch(() => undefined);
        return;
      }
      window.history.replaceState(window.history.state, "", next);
    } catch {
      // An old browser or a sandboxed frame: the address keeps the parameter, the page still shows S1.
    }
  };
  // Wait (briefly) for the router's own query update after hydration, then replace.
  let tries = 0;
  const whenReady = () => {
    try {
      if (Router.router && !Router.isReady && tries++ < 30) {
        setTimeout(whenReady, 100);
        return;
      }
    } catch {
      // No router singleton: the History API path.
    }
    run();
  };
  whenReady();
}

/** The avatar poll schedule: 1.5 s four times, then 2.5 s, then every 4 s. */
export function avatarPollDelay(attempt: number): number {
  if (attempt < 4) return 1500;
  if (attempt === 4) return 2500;
  return 4000;
}

export const AVATAR_DEADLINE_MS = 60_000;
/** The S2 scan's period before and after the body has left (§4 S2 beats A and B). */
export const SCAN_PERIOD_MS = { sending: 1800, sent: 1200 } as const;
/** The longest the visual screen waits for the scan pass to end before S3 (§4 S2 "Response arrives"). */
export const SCAN_HOLD_CAP_MS = 400;
export const PAID_POLL_MS = 4000;
/** S2's wait for the pixel portrait after POST answered `pending` (R2-01): the poll and the cap. */
export const PORTRAIT_POLL_MS = 1500;
export const PORTRAIT_WAIT_MS = 25_000;

// ---- S2 "Almost there" (R2-01) ---------------------------------------------------------------------

/**
 * Whether S2 is waiting for the pixel portrait. The hook returns it as `portraitWait`; it is also kept
 * here so `WorkingStep` can read it without a new prop through the page (`usePortraitWait`).
 */
let portraitWaitNow = false;
const portraitWaitListeners = new Set<() => void>();
function setPortraitWaitStore(value: boolean) {
  if (portraitWaitNow === value) return;
  portraitWaitNow = value;
  portraitWaitListeners.forEach((listener) => listener());
}
function subscribePortraitWait(listener: () => void) {
  portraitWaitListeners.add(listener);
  return () => {
    portraitWaitListeners.delete(listener);
  };
}
/** True while S2 holds for the pixel portrait ("Almost there"). */
export function usePortraitWait(): boolean {
  return useSyncExternalStore(subscribePortraitWait, () => portraitWaitNow, () => false);
}

// ---- the visitor's own daily cap (R2-09) -----------------------------------------------------------

export const OWN_CAP_KEY = "tt-yourcat-own-cap";
const OWN_CAP_CODES = new Set(["YOURCAT_IP_DAILY_CAP", "YOURCAT_USER_DAILY_CAP", "YOURCAT_FAILURE_DAILY_CAP"]);
/** The server's day (the caps are counted per UTC day). */
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** True when this failure is the visitor's own daily cap. */
export function isOwnCap(failure: RequestFailure | null | undefined): boolean {
  return !!failure && failure.kind === "code" && OWN_CAP_CODES.has(failure.code);
}

/** Remembers the cap for this tab and UTC day. Never throws (private mode, blocked storage). */
export function rememberOwnCap(now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(OWN_CAP_KEY, utcDay(now));
  } catch {
    // Not remembered: S1 offers the upload again and the server answers with the cap.
  }
}

/**
 * Whether the visitor's own cap is reached in this tab today. The hook returns it as `ownCapped`; it is
 * also kept here so `UploadStep` and `WorkingStep` can read it without a new prop (`useOwnCapped`).
 */
let ownCappedNow = false;
const ownCappedListeners = new Set<() => void>();
function setOwnCappedStore(value: boolean) {
  if (ownCappedNow === value) return;
  ownCappedNow = value;
  ownCappedListeners.forEach((listener) => listener());
}
function subscribeOwnCapped(listener: () => void) {
  ownCappedListeners.add(listener);
  return () => {
    ownCappedListeners.delete(listener);
  };
}
/** True once the visitor's own daily cap is known for this tab today (S1 shows the spent state). */
export function useOwnCapped(): boolean {
  return useSyncExternalStore(subscribeOwnCapped, () => ownCappedNow, () => false);
}

/** True while a cap remembered in this tab is from the current UTC day. Never throws. */
export function ownCapToday(now: number = Date.now()): boolean {
  try {
    return window.sessionStorage.getItem(OWN_CAP_KEY) === utcDay(now);
  } catch {
    return false;
  }
}
export const PAID_POLL_LIMIT_MS = 10 * 60_000;

/** The moment the avatar poll gives up: 60 s after the record was made, never later than 60 s after it arrived. */
export function avatarDeadline(createdAt: string, receivedAt: number): number {
  const made = Date.parse(createdAt);
  const base = Number.isFinite(made) ? Math.min(made, receivedAt) : receivedAt;
  return base + AVATAR_DEADLINE_MS;
}

const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** Runs `onVisible` each time the page becomes visible and `onHidden` each time it is hidden. */
function useVisibility(onVisible: () => void, onHidden?: () => void) {
  const visibleRef = useRef(onVisible);
  const hiddenRef = useRef(onHidden);
  useEffect(() => {
    visibleRef.current = onVisible;
    hiddenRef.current = onHidden;
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => (isHidden() ? hiddenRef.current?.() : visibleRef.current());
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
}

export interface UploadErrorState {
  copy: ErrorCopy;
  failure: RequestFailure | null;
}

export interface YourcatOptions {
  /** The auth runtime has an identity (or the page has no provider): the API can be called. */
  authReady: boolean;
  /** App build: no upload and no prices. */
  isApp: boolean;
  /** Called with every record the server returns (the page updates the profile). */
  onRecord?: (view: YourcatView, change: "created" | "renamed" | "loaded") => void;
  /** Reduced motion: no S2 scan, so a response shows S3 at once. */
  reducedMotion?: boolean;
  /** Runs right before a fresh S3 replaces S2 (the page scrolls the stage into view before the clock). */
  beforeReveal?: () => void;
}

export interface UploadTiming {
  /** When the file was chosen (`Date.now()`), for `secondsToReveal`. */
  selectedAt: number | null;
  /** When S3 showed the fresh record. */
  revealedAt: number | null;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * S2's wait for the pixel portrait (R2-01): GET /yourcat/:id every `PORTRAIT_POLL_MS` (none while the
 * tab is hidden). Resolves with the record once the portrait is `ready` and its image has decoded (a
 * portrait that will not decode still goes: the clock loads it itself), as soon as it is `failed`, or
 * with the last record seen once `PORTRAIT_WAIT_MS` has passed. `live()` false ends it early.
 */
export async function waitForPortrait(view: YourcatView, live: () => boolean): Promise<YourcatView> {
  const deadline = Date.now() + PORTRAIT_WAIT_MS;
  let latest = view;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return latest;
    await wait(Math.min(PORTRAIT_POLL_MS, left));
    if (!live() || Date.now() >= deadline) return latest;
    if (isHidden()) continue;
    let next: YourcatView;
    try {
      next = await YOURCAT_API.get(view.id);
    } catch {
      continue;
    }
    if (!live()) return latest;
    latest = next;
    if (next.avatar.status === "ready" && next.avatar.url) {
      await decodeRevealImage(next.avatar.url);
      return next;
    }
    if (next.avatar.status !== "pending") return next;
  }
}

export function useYourcat({ authReady, isApp, onRecord, reducedMotion = false, beforeReveal }: YourcatOptions) {
  const [status, setStatus] = useState<YourcatStatusView | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("upload");
  const [record, setRecordState] = useState<YourcatView | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  /** POST /yourcat has answered with the cat (the meter's "Coat" segment), before S3 shows. */
  const [responded, setResponded] = useState(false);
  const [error, setError] = useState<UploadErrorState | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarTimedOut, setAvatarTimedOut] = useState(false);
  const [paidLate, setPaidLate] = useState(false);
  const [timing, setTiming] = useState<UploadTiming>({ selectedAt: null, revealedAt: null });
  /** The shown record was deleted on the server (GET answers 404 now): nothing is polled for it. */
  const [deleted, setDeleted] = useState(false);
  /** The shown cat came from the manual pick (§1.5): S3 says it was picked, not matched. */
  const [manual, setManual] = useState(false);
  /** A manual cat made on this page view: S3 runs the short gather and step-out once. */
  const [manualFresh, setManualFresh] = useState(false);
  /** The friend's shared cat (S0), and whether the friend view is the screen shown. */
  const [friend, setFriend] = useState<FriendCat | null>(null);
  const [friendOpen, setFriendOpen] = useState(false);
  /** A `?cat=` link is still being read: the page keeps S1 until it answers. */
  const [friendPending, setFriendPending] = useState(false);
  /** S2 holds for the pixel portrait after POST answered `pending` (R2-01). */
  const [portraitWait, setPortraitWaitState] = useState(false);
  /** The visitor's own daily cap was reached in this tab today (R2-09): uploads read as closed. */
  const [ownCapped, setOwnCappedState] = useState(false);

  /** The prepared file and how it was chosen, kept for "Try again". */
  const preparedRef = useRef<{ prepared: PreparedUpload; source: "picker" | "drop" } | null>(null);
  const pendingNameRef = useRef("");
  const candidatesRef = useRef<Promise<PinkPawCandidate[]> | null>(null);
  const onRecordRef = useRef(onRecord);
  const motionRef = useRef({ reducedMotion, beforeReveal });
  const mountedRef = useRef(true);
  /** Each upload attempt's number: a newer attempt (or unmount) ends an older one's portrait wait. */
  const runRef = useRef(0);
  const setPortraitWait = useCallback((value: boolean) => {
    setPortraitWaitState(value);
    setPortraitWaitStore(value);
  }, []);
  const setOwnCapped = useCallback((value: boolean) => {
    setOwnCappedState(value);
    setOwnCappedStore(value);
  }, []);
  useEffect(() => {
    onRecordRef.current = onRecord;
    motionRef.current = { reducedMotion, beforeReveal };
  });
  useEffect(() => {
    mountedRef.current = true;
    // Read after mount (the static export renders without storage), before the status answers.
    if (ownCapToday()) setOwnCapped(true);
    return () => {
      mountedRef.current = false;
      setPortraitWaitStore(false);
      setOwnCappedStore(false);
    };
  }, [setOwnCapped]);

  const setRecord = useCallback((view: YourcatView | null) => {
    setRecordState(view);
    setReceivedAt(Date.now());
    setAvatarTimedOut(false);
    setDeleted(false);
  }, []);

  // ---- status ------------------------------------------------------------------------------

  const loadStatus = useCallback(async () => {
    if (isApp) return;
    try {
      const next = await YOURCAT_API.status();
      if (!mountedRef.current) return;
      setStatus(next);
      setStatusFailed(false);
    } catch {
      if (mountedRef.current) setStatusFailed(true);
    }
  }, [isApp]);

  useEffect(() => {
    // Incoming UTM parameters are kept for `upload_started` (§5.5).
    if (typeof window !== "undefined") storeUtm(readUtm(window.location.search));
    void loadStatus();
  }, [loadStatus]);

  // ---- a friend's shared cat (S0) ----------------------------------------------------------------

  useEffect(() => {
    if (isApp || typeof window === "undefined") return;
    const search = window.location.search;
    const shareId = readShareId(search);
    if (!shareId) {
      // `?cat=` with an invalid id: drop it quietly and show S1.
      if (new URLSearchParams(search).has("cat")) dropShareParam();
      return;
    }
    let cancelled = false;
     
    setFriendPending(true);
    // Public and unauthenticated: no guest session or accesstoken is needed to look at a friend's cat.
    YOURCAT_API.publicCat(shareId).then(
      (view) => {
        if (cancelled || !mountedRef.current) return;
        setFriend({ shareId, view });
        setFriendOpen(true);
        setFriendPending(false);
      },
      () => {
        if (cancelled || !mountedRef.current) return;
        dropShareParam();
        setFriendPending(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isApp]);

  // ---- the visitor's record, the paid return -------------------------------------------------

  useEffect(() => {
    if (isApp) {
      setBooting(false);
      return;
    }
    if (!authReady) return;
    let cancelled = false;
    void (async () => {
      // So the tap only sends the upload: the guest document and one App Check token, ahead of time.
      void YOURCAT_API.ensureGuest().then(() => YOURCAT_API.prefetchAppCheck());
      const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
      const yc = params.get("yc");
      let found: YourcatView | null = null;
      if (yc && /^[0-9a-f]{24}$/i.test(yc)) {
        try {
          found = await YOURCAT_API.get(yc);
        } catch {
          found = null;
        }
      }
      if (!found) {
        try {
          found = await YOURCAT_API.me();
        } catch {
          found = null;
        }
      }
      if (cancelled) return;
      if (found) {
        setRecord(found);
        setFresh(false);
        // A record with no photo and no pixel portrait is a manual cat (`avatar.status` 'none').
        setManual(!found.photo.stored && found.avatar.status === "none");
        onRecordRef.current?.(found, "loaded");
        candidatesRef.current = fetchPinkPawCandidates();
        setScreen(params.get("paid") === "1" && yc === found.id ? "paid" : "reveal");
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, isApp, setRecord]);

  // ---- upload ------------------------------------------------------------------------------

  /** Sends the prepared file. Every attempt, the first and each "Try again", reports `upload_started`. */
  const runUpload = useCallback(
    async (prepared: PreparedUpload, source: "picker" | "drop") => {
      const run = ++runRef.current;
      const live = () => mountedRef.current && runRef.current === run;
      setError(null);
      setSent(false);
      setResponded(false);
      setPortraitWait(false);
      setScreen("working");
      const startedAt = Date.now();
      let sentNow = false;
      analytics.track(
        buildGrowthEvent("upload_started", {
          surface: "yourcat",
          source,
          fileType: prepared.fileType,
          sizeBucket: prepared.sizeBucket,
          resized: prepared.resized,
          ...loadUtm(),
        }),
      );
      try {
        const view = await YOURCAT_API.upload(prepared.file, prepared.filename, {
          noticeVersion: PRIVACY_NOTICE_VERSION,
          onSent: () => {
            sentNow = true;
            if (mountedRef.current) setSent(true);
          },
        });
        if (!live()) return;
        setResponded(true);
        analytics.track(
          buildGrowthEvent("upload_done", {
            surface: "yourcat",
            outcome: "ready",
            family: view.family,
            avatarStatus: view.avatar.status,
            seconds: elapsedSeconds(startedAt),
          }),
        );
        // R2-01: the portrait is still being drawn. S2 stays ("Almost there") and polls, so the reveal
        // lands on the real portrait; after `PORTRAIT_WAIT_MS` S3 takes the pending path instead.
        let shown = view;
        if (view.avatar.status === "pending") {
          setPortraitWait(true);
          shown = await waitForPortrait(view, live);
          if (!live()) return;
        }
        // The visual screen holds until the current scan pass ends (at most 400 ms), so S3 starts on a
        // clean frame instead of cutting a pass in half. Reduced motion has no scan, so no hold.
        if (!motionRef.current.reducedMotion) {
          const hold = scanRemainingMs(
            startedAt,
            sentNow ? SCAN_PERIOD_MS.sent : SCAN_PERIOD_MS.sending,
            Date.now(),
            SCAN_HOLD_CAP_MS,
          );
          if (hold > 0) await wait(hold);
          if (!live()) return;
        }
        motionRef.current.beforeReveal?.();
        setPortraitWait(false);
        setRecord(shown);
        setFresh(true);
        setManual(false);
        setManualFresh(false);
        onRecordRef.current?.(shown, "created");
        setTiming((current) => ({ ...current, revealedAt: Date.now() }));
        // The name typed during the wait is saved once the record exists; S3 shows at once.
        const name = pendingNameRef.current.trim();
        if (name) {
          YOURCAT_API.rename(view.id, name).then(
            (renamed) => {
              if (!mountedRef.current) return;
              setNameError(null);
              setRecordState((current) => (current && current.id === renamed.id ? renamed : current));
              onRecordRef.current?.(renamed, "renamed");
            },
            (renameError) => {
              if (!mountedRef.current) return;
              setNameError(
                renameError instanceof YourcatRequestError && renameError.code === "YOURCAT_NAME_INVALID" && renameError.serverMessage
                  ? renameError.serverMessage
                  : ERROR_TEXT.generic,
              );
            },
          );
        }
        setScreen("reveal");
      } catch (caught) {
        if (!live()) return;
        setPortraitWait(false);
        const failure: RequestFailure =
          caught instanceof YourcatRequestError ? caught.failure : { kind: "network" };
        analytics.track(
          buildGrowthEvent("upload_done", {
            surface: "yourcat",
            outcome: "error",
            errorCode: failureEventCode(failure),
            seconds: elapsedSeconds(startedAt),
          }),
        );
        setError({ copy: uploadErrorCopy(failure), failure });
        // The visitor's own cap: S1 shows the spent state until the server's day ends (R2-09).
        if (isOwnCap(failure)) {
          rememberOwnCap();
          setOwnCapped(true);
        }
        // The budget or the kill switch may have changed: the S1 state follows the server.
        if (failure.kind === "code" && (failure.code === "YOURCAT_BUDGET_EXHAUSTED" || failure.code === "YOURCAT_DISABLED")) {
          void loadStatus();
        }
      }
    },
    [loadStatus, setRecord, setPortraitWait, setOwnCapped],
  );

  const chooseFile = useCallback(
    async (file: File, source: "picker" | "drop") => {
      setFileError(null);
      setError(null);
      if (friendOpen) {
        setFriendOpen(false);
        dropShareParam();
      }
      const selectedAt = Date.now();
      const prepared = await prepareUpload(file);
      if (!mountedRef.current) return;
      if (!prepared.ok) {
        setFileError(prepared.reason === "type" ? S1.fileType : S1.fileSize);
        return;
      }
      preparedRef.current = { prepared, source };
      setTiming({ selectedAt, revealedAt: null });
      setPhotoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        // The resized JPEG displays everywhere; an undecodable original (HEIC outside Safari) may not.
        return URL.createObjectURL(prepared.resized ? prepared.file : file);
      });
      // While the request runs: the Pink Paw gallery and the card fonts (§5.1, §5.4).
      candidatesRef.current = fetchPinkPawCandidates();
      warmCardFonts();
      await runUpload(prepared, source);
    },
    [friendOpen, runUpload],
  );

  const retry = useCallback(() => {
    const last = preparedRef.current;
    if (last) void runUpload(last.prepared, last.source);
  }, [runUpload]);

  const backToStart = useCallback(() => {
    setError(null);
    setScreen("upload");
  }, []);

  const openManual = useCallback(() => {
    setError(null);
    setFriendOpen(false);
    setScreen("manual");
  }, []);

  /** The friend view's "See your cat": the visitor's own S3. */
  const showOwnCat = useCallback(() => {
    setFriendOpen(false);
    dropShareParam();
    setScreen("reveal");
  }, []);

  const updatePendingName = useCallback((name: string) => {
    pendingNameRef.current = name;
    setPendingName(name);
  }, []);

  // ---- manual ------------------------------------------------------------------------------

  const makeManual = useCallback(
    async (family: string, name: string): Promise<RequestFailure | null> => {
      const startedAt = Date.now();
      setBusy(true);
      analytics.track(
        buildGrowthEvent("upload_started", {
          surface: "yourcat",
          source: "manual",
          fileType: "none",
          sizeBucket: "none",
          resized: false,
          ...loadUtm(),
        }),
      );
      try {
        const view = await YOURCAT_API.manual(family, name);
        if (!mountedRef.current) return null;
        analytics.track(
          buildGrowthEvent("upload_done", {
            surface: "yourcat",
            outcome: "ready",
            family: view.family,
            avatarStatus: view.avatar.status,
            seconds: elapsedSeconds(startedAt),
          }),
        );
        setRecord(view);
        setFresh(false);
        setManual(true);
        setManualFresh(true);
        setTiming({ selectedAt: null, revealedAt: null });
        onRecordRef.current?.(view, "created");
        if (!candidatesRef.current) candidatesRef.current = fetchPinkPawCandidates();
        setScreen("reveal");
        return null;
      } catch (caught) {
        const failure: RequestFailure = caught instanceof YourcatRequestError ? caught.failure : { kind: "network" };
        analytics.track(
          buildGrowthEvent("upload_done", {
            surface: "yourcat",
            outcome: "error",
            errorCode: failureEventCode(failure),
            seconds: elapsedSeconds(startedAt),
          }),
        );
        return failure;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [setRecord],
  );

  // ---- rename, delete, start over ------------------------------------------------------------

  /** Saves the card name; resolves with the accepted record or null (the message is in `nameError`). */
  const rename = useCallback(
    async (name: string): Promise<YourcatView | null> => {
      if (!record) return null;
      const clean = name.trim();
      if (!clean || (record.named && clean === record.name)) {
        setNameError(null);
        return record;
      }
      try {
        const next = await YOURCAT_API.rename(record.id, clean);
        if (!mountedRef.current) return null;
        setNameError(null);
        setRecordState(next);
        onRecordRef.current?.(next, "renamed");
        return next;
      } catch (caught) {
        if (!mountedRef.current) return null;
        setNameError(
          caught instanceof YourcatRequestError && caught.code === "YOURCAT_NAME_INVALID" && caught.serverMessage
            ? caught.serverMessage
            : ERROR_TEXT.generic,
        );
        return null;
      }
    },
    [record],
  );

  const startOver = useCallback(() => {
    setFriendOpen(false);
    setScreen("upload");
    setError(null);
    setFileError(null);
    setNameError(null);
  }, []);

  /**
   * Deletes the photo and the pixel portrait. True on success. The cat stays (as the dialog says), so S3
   * stays: the record is updated here (no photo, no pixel portrait) and the card falls back to the game
   * look. A paid portrait still painting keeps its block; the server no longer serves the deleted record,
   * so its poll stops and the email delivers it.
   */
  const deleteRecord = useCallback(async (): Promise<boolean> => {
    if (!record) return false;
    try {
      await YOURCAT_API.remove(record.id);
    } catch {
      return false;
    }
    if (!mountedRef.current) return true;
    setRecordState((current) =>
      current && current.id === record.id
        ? {
            ...current,
            avatar: { status: "none", url: null },
            photo: { stored: false, deleteAfter: null },
          }
        : current,
    );
    setDeleted(true);
    setFresh(false);
    setPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    return true;
  }, [record]);

  const showCard = useCallback(() => setScreen("reveal"), []);

  /** Reads the record again (after 409 PORTRAIT_EXISTS, the order's state is shown). */
  const refreshFromServer = useCallback(async () => {
    if (!record) return;
    try {
      const next = await YOURCAT_API.get(record.id);
      if (mountedRef.current) setRecordState(next);
    } catch {
      // Keep what is shown.
    }
  }, [record]);

  // ---- the late pixel portrait ---------------------------------------------------------------

  const avatarPending = !!record && record.avatar.status === "pending" && !avatarTimedOut;
  const recordId = record?.id;
  const createdAt = record?.createdAt;
  useEffect(() => {
    if (!avatarPending || !recordId || !createdAt) return;
    const deadline = avatarDeadline(createdAt, receivedAt);
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let stopped = false;

    const giveUp = () => {
      stopped = true;
      setAvatarTimedOut(true);
    };
    const schedule = () => {
      if (stopped || timer || inFlight || isHidden()) return;
      const now = Date.now();
      if (now >= deadline) {
        giveUp();
        return;
      }
      timer = setTimeout(tick, Math.min(avatarPollDelay(attempt), deadline - now));
    };
    const tick = async () => {
      timer = null;
      if (stopped || isHidden()) return;
      if (Date.now() >= deadline) {
        giveUp();
        return;
      }
      attempt += 1;
      inFlight = true;
      try {
        const next = await YOURCAT_API.get(recordId);
        inFlight = false;
        if (stopped) return;
        if (next.avatar.status !== "pending") {
          stopped = true;
          setRecordState(next);
          return;
        }
      } catch {
        inFlight = false;
      }
      schedule();
    };
    const onVisibility = () => {
      if (isHidden()) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [avatarPending, recordId, createdAt, receivedAt]);

  // ---- the paid return (S6) and an order seen on S3 -----------------------------------------

  const portraitStatus: YourcatPortraitStatus = record?.portrait.status ?? "none";
  const pollPaid =
    !!recordId &&
    !deleted &&
    (screen === "paid" ? portraitStatus !== "ready" && portraitStatus !== "failed" : portraitStatus === "painting");
  useEffect(() => {
    if (!pollPaid || !recordId) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const schedule = () => {
      if (stopped || timer || isHidden()) return;
      if (Date.now() - startedAt >= PAID_POLL_LIMIT_MS) {
        stopped = true;
        setPaidLate(true);
        return;
      }
      timer = setTimeout(tick, PAID_POLL_MS);
    };
    const tick = async () => {
      timer = null;
      if (stopped || isHidden()) return;
      try {
        const next = await YOURCAT_API.get(recordId);
        if (stopped) return;
        setRecordState(next);
        if (next.portrait.status === "ready" || next.portrait.status === "failed") {
          stopped = true;
          return;
        }
      } catch {
        // Try again on the next beat.
      }
      schedule();
    };
    const onVisibility = () => {
      if (isHidden()) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollPaid, recordId]);

  // The status again whenever the page becomes visible (§1.0).
  useVisibility(() => void loadStatus());

  // Object URLs die with the page.
  const photoRef = useRef<string | null>(null);
  useEffect(() => {
    photoRef.current = photoUrl;
  }, [photoUrl]);
  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current);
    },
    [],
  );

  const shelterCandidates = useCallback((): Promise<PinkPawCandidate[]> => {
    if (!candidatesRef.current) candidatesRef.current = fetchPinkPawCandidates();
    return candidatesRef.current;
  }, []);

  /** The avatar state as the page shows it: a portrait still pending after the deadline reads as failed. */
  const avatarStatus = record ? (record.avatar.status === "pending" && avatarTimedOut ? "failed" : record.avatar.status) : "none";

  // The friend view sits in front of S1 and of a returning visitor's S3 (never an upload, the manual
  // pick or the paid return).
  const shownScreen: Screen =
    friendOpen && friend && (screen === "upload" || (screen === "reveal" && !fresh)) ? "friend" : screen;

  // The visitor's own cap closes uploads for them today, wherever the page asks `uploadsOpen` (R2-09).
  const shownStatus = status && ownCapped && status.uploadsOpen ? { ...status, uploadsOpen: false } : status;

  return {
    status: shownStatus,
    statusFailed,
    avatarStatus,
    booting,
    screen: shownScreen,
    record,
    /** The random public id of the visitor's cat, for the per-cat share link (§8). */
    shareId: record?.shareId ?? null,
    friend,
    friendPending,
    /** "Watch again" re-runs the step-out from the photo still in memory (a fresh upload this page view). */
    canReplay: fresh && !!photoUrl,
    fresh,
    manual,
    manualFresh,
    photoUrl,
    sent,
    responded,
    /** S2 holds for the pixel portrait ("Almost there", R2-01). */
    portraitWait,
    /** The visitor's own daily cap was reached in this tab today (R2-09). */
    ownCapped,
    error,
    fileError,
    pendingName,
    nameError,
    busy,
    avatarTimedOut,
    paidLate,
    timing,
    actions: {
      chooseFile,
      retry,
      backToStart,
      openManual,
      makeManual,
      updatePendingName,
      rename,
      startOver,
      deleteRecord,
      showCard,
      refreshFromServer,
      shelterCandidates,
      showOwnCat,
      clearFileError: () => setFileError(null),
    },
  };
}

export type YourcatState = ReturnType<typeof useYourcat>;
