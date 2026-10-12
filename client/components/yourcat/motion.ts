/**
 * Motion primitives for `/yourcat` (docs/plans/yourcat-polish.md §4, §11): the easings, the
 * transformation clock's cue times, one rAF cue clock, the S2 scan gate, the S1 photo flight, the
 * reveal haptic and an in-view hook. Transform and opacity only; every helper has a calm path for
 * `prefers-reduced-motion` (§1.7). No framer-motion: CSS keyframes (`YourcatMotionStyles`) and WAAPI.
 */
import { useEffect, useState, type RefObject } from "react";

export const EASE = Object.freeze({
  out: "cubic-bezier(.2,.8,.2,1)",
  spring: "cubic-bezier(.34,1.56,.64,1)",
  std: "cubic-bezier(.4,0,.2,1)",
  /** The pet cat's idle hop (§4.3). */
  hop: "cubic-bezier(.3,1.6,.5,1)",
});

/** The 1,450 ms transformation clock (§4.2), in ms from its start. */
export const CLOCK = Object.freeze({
  HOLD: 0,
  CRACK_START: 150,
  CRACK_STEP: 120,
  GATHER_START: 750,
  GATHER_STEP: 75,
  STEP_OUT: 1050,
  TITLE: 1170,
  DONE: 1450,
  PURR_AFTER_STEP_OUT: 600,
  MEETING_AFTER_DONE: 400,
  /** The meeting walk (R2-02): the cat crosses the altar to the shelter frame on the walk row. */
  MEETING_WALK: 700,
  /** Reduced motion: the cat fades to its sit beside the shelter frame instead. */
  MEETING_WALK_RM: 120,
  RM_HOLD: 600,
  RM_FADE: 400,
});

export interface Cue {
  at: number;
  run(): void;
}

export interface CueClockOptions {
  now?(): number;
  raf?(cb: (time: number) => void): number;
  caf?(id: number): void;
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function defaultRaf(cb: (time: number) => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  return setTimeout(() => cb(defaultNow()), 16) as unknown as number;
}

function defaultCaf(id: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

/**
 * Fires each cue once, when the elapsed time since the call reaches its `at`, from ONE
 * `requestAnimationFrame` loop (never chained timeouts, so a slow frame cannot push later cues out of
 * order). Cues at or before 0 fire synchronously. Cues fire in `at` order; one that throws does not
 * stop the rest. The loop ends after the last cue. Returns a cancel function (idempotent).
 */
export function startCueClock(cues: Cue[], opts: CueClockOptions = {}): () => void {
  const now = opts.now ?? defaultNow;
  const raf = opts.raf ?? defaultRaf;
  const caf = opts.caf ?? defaultCaf;
  const queue = cues.map((cue, order) => ({ cue, order })).sort((a, b) => a.cue.at - b.cue.at || a.order - b.order);
  const start = now();
  let next = 0;
  let frame: number | null = null;
  let cancelled = false;

  const fireDue = () => {
    const elapsed = now() - start;
    while (!cancelled && next < queue.length && queue[next].cue.at <= elapsed) {
      const { cue } = queue[next];
      next += 1;
      try {
        cue.run();
      } catch {
        // A cue is cosmetic: the clock keeps time for the others.
      }
    }
  };

  const tick = () => {
    frame = null;
    if (cancelled) return;
    fireDue();
    if (!cancelled && next < queue.length) frame = raf(tick);
  };

  fireDue();
  if (!cancelled && next < queue.length) frame = raf(tick);

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (frame !== null) caf(frame);
    frame = null;
  };
}

/**
 * How long until the current S2 scan pass ends (§4 S2 "Response arrives"), capped at `cap` ms, so
 * the reveal waits for the line to finish its sweep but never for more than 400 ms. A pass that ends
 * exactly now returns 0; a scan that has not started yet counts as a whole pass.
 */
export function scanRemainingMs(startedAt: number, periodMs: number, now: number, cap = 400): number {
  if (!(periodMs > 0) || !Number.isFinite(now) || !Number.isFinite(startedAt)) return 0;
  const elapsed = now - startedAt;
  // The scan has only just started (or the clocks disagree): a whole pass is still to run.
  if (elapsed <= 0) return Math.max(0, Math.min(cap, periodMs));
  const into = elapsed % periodMs;
  const remaining = into === 0 ? 0 : periodMs - into;
  return Math.max(0, Math.min(cap, remaining));
}

/**
 * The S1 flight (§4 S1 "On select"): a fixed `<img>` of `src` flies from `from` (the CTA's rect) into
 * `to` (the frame's inner box) with WAAPI translate and scale over `ms`, out easing, then is removed.
 * Reduced motion: the photo cross-fades in place over the frame in 150 ms. Resolves when the copy is
 * gone (immediately where WAAPI is missing); never rejects.
 */
export function flyTo(src: string, from: DOMRect, to: HTMLElement, ms: number = 420, reduced: boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    let img: HTMLImageElement | null = null;
    const finish = () => {
      img?.remove();
      img = null;
      resolve();
    };
    try {
      if (typeof document === "undefined") return finish();
      const target = to.getBoundingClientRect();
      img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.setAttribute("data-yc-flight", "");
      const box = reduced ? target : from;
      Object.assign(img.style, {
        position: "fixed",
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${Math.max(1, box.width)}px`,
        height: `${Math.max(1, box.height)}px`,
        objectFit: "cover",
        transformOrigin: "0 0",
        pointerEvents: "none",
        zIndex: "2147483000",
        margin: "0",
        borderRadius: "0",
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(img);
      if (typeof img.animate !== "function") return finish();
      const animation = reduced
        ? img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "linear", fill: "forwards" })
        : img.animate(
            [
              { transform: "translate(0px, 0px) scale(1, 1)", opacity: 0.9 },
              {
                transform: `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(${
                  target.width / Math.max(1, from.width)
                }, ${target.height / Math.max(1, from.height)})`,
                opacity: 1,
              },
            ],
            { duration: Math.max(0, ms), easing: EASE.out, fill: "forwards" },
          );
      animation.onfinish = finish;
      animation.oncancel = finish;
    } catch {
      finish();
    }
  });
}

/** The step-out buzz (§4.2): 12 on, 40 off, 18 on, where `navigator.vibrate` exists. Never under reduced motion. */
export function hapticReveal(reduced: boolean): void {
  if (reduced) return;
  try {
    if (typeof navigator === "undefined") return;
    navigator.vibrate?.([12, 40, 18]);
  } catch {
    // Haptics are a garnish.
  }
}

/**
 * Whether the element is in the viewport. Starts false; where IntersectionObserver is missing it
 * reports true, so nothing waits forever. With `once`, it stays true after the first intersection.
 */
export function useInView(ref: RefObject<Element | null>, { once = false }: { once?: boolean } = {}): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible && once) {
        setInView(true);
        observer.disconnect();
        return;
      }
      setInView(visible);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, once]);
  return inView;
}
