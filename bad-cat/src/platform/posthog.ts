/**
 * PostHog EU sender (GDD 14, FULL-PLAN decision 6): one fetch POST of a batch to `/capture/`, no SDK, no
 * cookies, `keepalive` so a batch sent on pagehide still leaves. Used only when a project key is set AND
 * the player granted consent (analytics.ts decides that; this file only formats and posts).
 * Constants copied from `shared/analytics-core.ts` (packages never import across the repo).
 */
import type { AnalyticsEvent, AnalyticsProps } from '../types';

export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';
export const POSTHOG_CAPTURE_URL = `${POSTHOG_EU_HOST}/capture/`;
/** keepalive bodies are capped at 64 KiB by browsers; stay well below. */
export const POSTHOG_MAX_BODY = 56_000;

export interface PosthogEvent {
  event: AnalyticsEvent;
  props: AnalyticsProps;
  at: number;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; keepalive: boolean; credentials: 'omit'; mode: 'cors' }) => Promise<unknown>;

export interface PosthogOptions {
  key: string;
  /** Anonymous id (device id after consent, else the page-load session id). */
  distinctId: () => string;
  fetch?: FetchLike;
  url?: string;
}

/** The JSON bodies for a batch, split so each stays under POSTHOG_MAX_BODY. Pure. */
export function posthogBodies(key: string, distinctId: string, batch: readonly PosthogEvent[]): string[] {
  const rows = batch.map((e) =>
    JSON.stringify({
      event: e.event,
      timestamp: new Date(e.at).toISOString(),
      properties: { ...e.props, distinct_id: distinctId, $lib: 'bad-cat', $process_person_profile: false },
    }),
  );
  const head = `{"api_key":${JSON.stringify(key)},"batch":[`;
  const out: string[] = [];
  let cur: string[] = [];
  let size = head.length + 2;
  for (const r of rows) {
    if (r.length + head.length + 4 > POSTHOG_MAX_BODY) continue; // a single oversized event is dropped
    if (cur.length && size + r.length + 1 > POSTHOG_MAX_BODY) {
      out.push(`${head}${cur.join(',')}]}`);
      cur = [];
      size = head.length + 2;
    }
    cur.push(r);
    size += r.length + 1;
  }
  if (cur.length) out.push(`${head}${cur.join(',')}]}`);
  return out;
}

/** A sender for `setAnalyticsSender`. Never throws; network errors drop the batch. */
export function createPosthogSender(opts: PosthogOptions): (batch: readonly PosthogEvent[]) => void {
  const url = opts.url ?? POSTHOG_CAPTURE_URL;
  return (batch) => {
    try {
      const f = opts.fetch ?? ((globalThis as { fetch?: FetchLike }).fetch?.bind(globalThis) as FetchLike | undefined);
      if (!f || batch.length === 0) return;
      for (const body of posthogBodies(opts.key, opts.distinctId(), batch)) {
        void Promise.resolve(
          f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit', mode: 'cors' }),
        ).catch(() => undefined);
      }
    } catch {
      /* dropped */
    }
  };
}
