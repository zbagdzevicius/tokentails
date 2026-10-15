/**
 * The host side of the Heist's treat channel (founder request, Oct 15, 2026: send the treat from
 * the Heist's own screen, never navigate away). The Heist side is
 * `catnip-heist/src/embed/treat-bridge.ts`; the strings below must match it
 * (`__test__/heist-treat-parity.test.ts`). This is its own channel, so the save bridge
 * (`shared/heist-bridge.ts`) is unchanged.
 *
 *   Heist -> host:  treat-hello, treat-send { reqId, chainId?, cat? }, treat-me { reqId }
 *   host -> Heist:  treat-ready, treat-result { reqId, outcome }, treat-me-result { reqId, today }
 *
 * A send goes through `sendTreat({ source: 'heist' })`: the signed-in account first, else the guest
 * route. One send at a time; a repeated `reqId` gets the same answer. It never navigates and never
 * opens the sign-in sheet. Origin and source checks are hygiene (the frame is same-origin).
 *
 * No React, no DOM globals: the window and the senders are passed in, so it is unit-tested.
 */
import type { DonateMe, TreatSend } from "@/components/codex/impact/treat";

export const HEIST_TREAT_CHANNEL = "tt-heist-treat";
export const HEIST_TREAT_VERSION = 1;
export const HEIST_TREAT_MAX_FIELD = 64;

export type HeistTreatOutcome =
  | { kind: "sent"; receipt?: string }
  | { kind: "already" }
  | { kind: "used-up" }
  | { kind: "paused" }
  | { kind: "failed" }
  | { kind: "unavailable" };

export type HeistTreatToday = "none" | "sent" | "unknown";

/** Maps a `sendTreat` answer to what the Heist's panel shows. */
export function heistOutcome(send: TreatSend): HeistTreatOutcome {
  switch (send.kind) {
    case "sent":
      return send.receipt ? { kind: "sent", receipt: send.receipt } : { kind: "sent" };
    case "already-today":
      return { kind: "already" };
    case "budget-spent":
      return { kind: "used-up" };
    case "paused":
      return { kind: "paused" };
    default:
      // failed, retry (offline or the per-IP limiter), signed-out, not-eligible: try again.
      return { kind: "failed" };
  }
}

/** Today's treat from `GET /shelter/donate/me` (or the guest one); null is a failed read. */
export function heistToday(me: DonateMe | null): HeistTreatToday {
  if (!me) return "unknown";
  const status = me.today?.status;
  return status === "PENDING" || status === "SENT" || status === "CONFIRMED" ? "sent" : "none";
}

export interface TreatHostWindow {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface TreatHostTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface TreatHostOptions {
  win: TreatHostWindow;
  origin: string;
  /** The iframe's window; null until it exists. */
  target: () => TreatHostTarget | null;
  send: (req: { chainId?: number }) => Promise<TreatSend>;
  me: () => Promise<DonateMe | null>;
  /** A send finished (analytics). */
  onSent?(send: TreatSend, cat: string | undefined): void;
}

export interface TreatHost {
  dispose(): void;
}

const MAX_CACHED = 20;

export function createTreatHost(opts: TreatHostOptions): TreatHost {
  const { win, origin } = opts;
  let disposed = false;
  let inFlight: Promise<HeistTreatOutcome> | null = null;
  const answers = new Map<string, Promise<HeistTreatOutcome>>();

  const post = (type: string, extra: Record<string, unknown> = {}) => {
    const target = opts.target();
    if (!target || !origin || disposed) return;
    try {
      target.postMessage({ channel: HEIST_TREAT_CHANNEL, v: HEIST_TREAT_VERSION, type, ...extra }, origin);
    } catch {
      // The frame navigated away or was removed.
    }
  };

  const validReq = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= HEIST_TREAT_MAX_FIELD;

  const doSend = (chainId: number | undefined, cat: string | undefined): Promise<HeistTreatOutcome> => {
    // One send at a time: a second request while one is out waits for the same answer.
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let send: TreatSend;
      try {
        send = await opts.send(chainId ? { chainId } : {});
      } catch {
        send = { kind: "retry" };
      }
      try {
        opts.onSent?.(send, cat);
      } catch {
        // Analytics never breaks the treat.
      }
      return heistOutcome(send);
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const onMessage = (event: MessageEvent) => {
    if (disposed) return;
    const target = opts.target();
    if (!target || event.source !== (target as unknown) || event.origin !== origin) return;
    const d = event.data as Record<string, unknown> | null;
    if (!d || typeof d !== "object" || d.channel !== HEIST_TREAT_CHANNEL || d.v !== HEIST_TREAT_VERSION) return;
    switch (d.type) {
      case "treat-hello":
        post("treat-ready");
        break;
      case "treat-send": {
        if (!validReq(d.reqId)) return;
        const reqId = d.reqId;
        const chainId =
          typeof d.chainId === "number" && Number.isInteger(d.chainId) && d.chainId > 0 && d.chainId <= 2 ** 40 ? d.chainId : undefined;
        const cat = typeof d.cat === "string" ? d.cat.slice(0, HEIST_TREAT_MAX_FIELD) : undefined;
        let answer = answers.get(reqId);
        if (!answer) {
          answer = doSend(chainId, cat);
          answers.set(reqId, answer);
          if (answers.size > MAX_CACHED) answers.delete(answers.keys().next().value as string);
        }
        void answer.then((outcome) => post("treat-result", { reqId, outcome }));
        break;
      }
      case "treat-me": {
        if (!validReq(d.reqId)) return;
        const reqId = d.reqId;
        void opts
          .me()
          .catch(() => null)
          .then((me) => post("treat-me-result", { reqId, today: heistToday(me) }));
        break;
      }
      default:
        break;
    }
  };

  // No unasked `treat-ready`: the frame may still be on about:blank. The Heist says hello again
  // before every read and send, so a hello sent before this listener existed is not needed.
  win.addEventListener("message", onMessage);

  return {
    dispose() {
      disposed = true;
      win.removeEventListener("message", onMessage);
    },
  };
}
