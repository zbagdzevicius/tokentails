import { DEFAULT_TAILS_MODE, TAILS_MODES, type TailsMode } from "@/shared-contracts/copy";
import { apiUrl } from "./api";

/*
 * `GET /user/token-status` (plan G5 "Vault", decision #39). Public and cached by the backend
 * (`public, max-age=300`). It answers `{ mode, tgeAt }`; POINTS is the default and the only mode
 * until counsel approves the Vault notice.
 *
 * Two rules the PROGRESS VAULT tab depends on:
 * - App builds never call it (`isApp` short-circuits before any request), so a store build can
 *   never show the Vault, whatever the backend says.
 * - Any failure (network, timeout, non-2xx, a body that is not exactly the expected shape) means
 *   POINTS, so a blocked request hides the Vault instead of showing it.
 */

export interface TokenStatus {
  mode: TailsMode;
  /** ISO date; only ever set in TOKEN mode (the backend sends null in POINTS mode). */
  tgeAt: string | null;
}

export const POINTS_STATUS: TokenStatus = Object.freeze({ mode: DEFAULT_TAILS_MODE, tgeAt: null });

export const TOKEN_STATUS_TIMEOUT_MS = 3000;
export const TOKEN_STATUS_QUERY_KEY = "token-status";

export function tokenStatusUrl(base: string | undefined = apiUrl || process.env.NEXT_PUBLIC_BE_URL): string | null {
  return base ? `${String(base).replace(/\/+$/, "")}/user/token-status` : null;
}

/** The body as the client trusts it: an unknown mode or a bad date falls back to POINTS. */
export function normalizeTokenStatus(raw: unknown): TokenStatus {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return POINTS_STATUS;
  const record = raw as { mode?: unknown; tgeAt?: unknown };
  const mode = (TAILS_MODES as readonly unknown[]).includes(record.mode) ? (record.mode as TailsMode) : null;
  if (!mode || mode === DEFAULT_TAILS_MODE) return POINTS_STATUS;
  const tgeAt =
    typeof record.tgeAt === "string" && !Number.isNaN(Date.parse(record.tgeAt)) ? record.tgeAt : null;
  return { mode, tgeAt };
}

export interface TokenStatusOptions {
  /** True in Capacitor app builds: no request is made and POINTS is returned. */
  isApp: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  base?: string;
}

/** Reads the Vault mode. Never throws; POINTS on any failure and always in app builds. */
export async function fetchTokenStatus({
  isApp,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  signal,
  timeoutMs = TOKEN_STATUS_TIMEOUT_MS,
  base,
}: TokenStatusOptions): Promise<TokenStatus> {
  if (isApp) return POINTS_STATUS;
  const url = tokenStatusUrl(base);
  if (!fetchImpl || !url) return POINTS_STATUS;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return POINTS_STATUS;
    return normalizeTokenStatus(await res.json());
  } catch {
    return POINTS_STATUS;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** The VAULT tab renders only on web, and only when the backend says TOKEN. */
export function vaultVisible(status: TokenStatus | null | undefined, isApp: boolean): boolean {
  return !isApp && status?.mode === "TOKEN";
}
