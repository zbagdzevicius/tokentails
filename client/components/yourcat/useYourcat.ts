/**
 * The `/yourcat` state machine (docs/plans/yourcat-v2.md §1): status, the record, the upload, the
 * late pixel portrait poll, the paid-return poll and visibility handling.
 *
 * - The status is fetched on mount and again whenever the page becomes visible, so a cached "open"
 *   never hides a spent budget for long.
 * - The pixel portrait is polled at 1.5, 1.5, 1.5, 1.5, 2.5 s, then every 4 s, and stops as soon as
 *   it is `ready` or `failed`, or 60 s after the record was made (the server then reads it as failed).
 * - The paid return polls every 4 s for up to 10 minutes.
 * - Nothing is polled while the tab is hidden; polling resumes on `visibilitychange`.
 */
import { analytics } from "@/analytics";
import { buildGrowthEvent, elapsedSeconds } from "@/analytics/growth-events";
import { YOURCAT_API, YourcatRequestError } from "@/api/yourcat-api";
import type { YourcatPortraitStatus, YourcatStatusView, YourcatView } from "@/models/yourcat";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { loadUtm, readUtm, storeUtm } from "./utm";

export type Screen = "upload" | "working" | "manual" | "reveal" | "paid";

/** The avatar poll schedule: 1.5 s four times, then 2.5 s, then every 4 s. */
export function avatarPollDelay(attempt: number): number {
  if (attempt < 4) return 1500;
  if (attempt === 4) return 2500;
  return 4000;
}

export const AVATAR_DEADLINE_MS = 60_000;
export const PAID_POLL_MS = 4000;
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
}

export interface UploadTiming {
  /** When the file was chosen (`Date.now()`), for `secondsToReveal`. */
  selectedAt: number | null;
  /** When S3 showed the fresh record. */
  revealedAt: number | null;
}

export function useYourcat({ authReady, isApp, onRecord }: YourcatOptions) {
  const [status, setStatus] = useState<YourcatStatusView | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("upload");
  const [record, setRecordState] = useState<YourcatView | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
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

  const preparedRef = useRef<PreparedUpload | null>(null);
  const pendingNameRef = useRef("");
  const candidatesRef = useRef<Promise<PinkPawCandidate[]> | null>(null);
  const onRecordRef = useRef(onRecord);
  const mountedRef = useRef(true);
  useEffect(() => {
    onRecordRef.current = onRecord;
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const runUpload = useCallback(
    async (prepared: PreparedUpload) => {
      setError(null);
      setSent(false);
      setScreen("working");
      const startedAt = Date.now();
      try {
        const view = await YOURCAT_API.upload(prepared.file, prepared.filename, {
          noticeVersion: PRIVACY_NOTICE_VERSION,
          onSent: () => mountedRef.current && setSent(true),
        });
        if (!mountedRef.current) return;
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
        setFresh(true);
        onRecordRef.current?.(view, "created");
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
        if (!mountedRef.current) return;
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
        // The budget or the kill switch may have changed: the S1 state follows the server.
        if (failure.kind === "code" && (failure.code === "YOURCAT_BUDGET_EXHAUSTED" || failure.code === "YOURCAT_DISABLED")) {
          void loadStatus();
        }
      }
    },
    [loadStatus, setRecord],
  );

  const chooseFile = useCallback(
    async (file: File, source: "picker" | "drop") => {
      setFileError(null);
      setError(null);
      const selectedAt = Date.now();
      const prepared = await prepareUpload(file);
      if (!mountedRef.current) return;
      if (!prepared.ok) {
        setFileError(prepared.reason === "type" ? S1.fileType : S1.fileSize);
        return;
      }
      preparedRef.current = prepared;
      setTiming({ selectedAt, revealedAt: null });
      setPhotoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        // The resized JPEG displays everywhere; an undecodable original (HEIC outside Safari) may not.
        return URL.createObjectURL(prepared.resized ? prepared.file : file);
      });
      // While the request runs: the Pink Paw gallery and the card fonts (§5.1, §5.4).
      candidatesRef.current = fetchPinkPawCandidates();
      warmCardFonts();
      const utm = loadUtm();
      analytics.track(
        buildGrowthEvent("upload_started", {
          surface: "yourcat",
          source,
          fileType: prepared.fileType,
          sizeBucket: prepared.sizeBucket,
          resized: prepared.resized,
          ...utm,
        }),
      );
      await runUpload(prepared);
    },
    [runUpload],
  );

  const retry = useCallback(() => {
    if (preparedRef.current) void runUpload(preparedRef.current);
  }, [runUpload]);

  const backToStart = useCallback(() => {
    setError(null);
    setScreen("upload");
  }, []);

  const openManual = useCallback(() => {
    setError(null);
    setScreen("manual");
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

  return {
    status,
    statusFailed,
    avatarStatus,
    booting,
    screen,
    record,
    fresh,
    photoUrl,
    sent,
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
      clearFileError: () => setFileError(null),
    },
  };
}

export type YourcatState = ReturnType<typeof useYourcat>;
