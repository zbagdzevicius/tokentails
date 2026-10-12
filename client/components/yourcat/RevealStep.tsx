import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import { playHomeSound } from "@/components/home/homeSfx";
import type { YourcatAvatarStatus, YourcatView } from "@/models/yourcat";
import Link from "next/link";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BODY, CAPTION, ChipCheck, DANGER_PILL, H2, HEADLINE, Headline, NIGHT_PILL, PANEL, PrimaryAction } from "./brand";
import { Burst } from "./Burst";
import type { CardFormat } from "./cardLayout";
import { cardText, displayName, NAME_MAX, S2, S3, STATUS_COPY } from "./copy";
import { Frame } from "./Frame";
import { CLOCK, EASE, hapticReveal } from "./motion";
import { NOSE_X_FACING_LEFT, PetCat, type PetCatWalk } from "./PetCat";
import { pickPinkPawCat, pinkPawArtStyle, type PinkPawCandidate } from "./pinkPawPick";
import { canShareFile, copyShareText, downloadFile, isInAppBrowser, shareCardFile, type ShareOutcome } from "./share";
import { HeadingBlock, InSlot, useCueListener, useStageConfig, useStudio, type StudioCue } from "./studio";
import { ALERT, INLINE_LINK, INPUT, TEXT_LINK } from "./ui";
import { useShareCards, variantKey, type CardVariant } from "./useShareCards";
import { buildShareUrl } from "./utm";
import { Meter, type SegmentState } from "./WorkingStep";
import { SHEET } from "./spriteSheet";

export const NAME_DEBOUNCE_MS = 300;
/**
 * The level-up flare under the cat's paws at the step-out: one play, 1.5x (96 px), 900 ms (§4.2).
 * A transparent animated WebP keyed from black (`/flare-effect/effects/lvlup.gif`, left untouched), so
 * it needs no blend mode: `mix-blend-screen` drew a black box inside the stage's stacking contexts.
 */
export const STEP_OUT_GIF = "/yourcat/flare.webp";
export const STEP_OUT_GIF_MS = 900;
/** When no cue arrives (an image that never loads), the scene settles on its own after this long. */
export const CLOCK_SAFETY_MS = 4000;
/**
 * The meeting (§4.4, R2-02): the cream frame slides in and the cat walks over to it (CLOCK.MEETING_WALK,
 * 120 ms fade under reduced motion), then sits facing it with one heart. MEETING_SIT_MS is the
 * fallback when the walk cannot be measured (no layout): the sit then comes this long after the frame.
 */
export const MEETING_SIT_MS = 300;
/** The gap between the shelter frame and the cat's nose once it has walked over: phones, md+. */
export const MEETING_GAP = Object.freeze({ phone: 8, md: 16 });
/** The md+ controls under the card wait for its print, then fade in this staggered (R2-04): pills, toggle, actions. */
export const PRINT_STAGGER_MS: readonly number[] = [0, 80, 160];
export const PRINT_FADE_MS = 240;
export const PRINT_FADE_RM_MS = 120;
/** The meeting block, the coat line and the toggle fade in with the shelter frame (§4.4). */
export const MEETING_FADE_MS = 240;
export const MEETING_FADE_RM_MS = 120;
/**
 * A Story/Post switch animates the card's box from the old aspect to the new one (§4.5 "a 300 ms out
 * FLIP"): one WAAPI transform from the old box to the new, origin top left, while the art inside is
 * counter-scaled (`formatFlipFrames`), so the box morphs and the card art never squashes. Reduced
 * motion: no transform, a 120 ms opacity lift instead.
 */
export const FORMAT_FLIP_MS = 300;
export const FORMAT_FLIP_RM_MS = 120;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The FLIP's first keyframe: the new box drawn where and as large as the old one (page coordinates). */
export function formatFlipFrom(
  previous: { left: number; top: number; width: number; height: number },
  next: { left: number; top: number; width: number; height: number },
): string | null {
  if (!(previous.width > 0) || !(previous.height > 0) || !(next.width > 0) || !(next.height > 0)) return null;
  const dx = Math.round((previous.left - next.left) * 100) / 100;
  const dy = Math.round((previous.top - next.top) * 100) / 100;
  const sx = Math.round((previous.width / next.width) * 1000) / 1000;
  const sy = Math.round((previous.height / next.height) * 1000) / 1000;
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return null;
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

/** Keyframes per FLIP: enough that the art's counter-scale stays within ~0.1 % of 1 between them. */
export const FORMAT_FLIP_STEPS = 10;

/**
 * The FLIP's keyframes: the box goes from the old rect to the new one (translate and scale, origin top
 * left) and its art layer gets the inverse scale at every step, centred in the box, so the art is
 * always drawn at its true size (cropped by the box while it is narrower, on night while it is wider)
 * and never squashed. Linear in progress between the keyframes; the caller sets the easing on both.
 */
export function formatFlipFrames(
  previous: { left: number; top: number; width: number; height: number },
  next: { left: number; top: number; width: number; height: number },
  steps: number = FORMAT_FLIP_STEPS,
): { box: Keyframe[]; art: Keyframe[] } | null {
  if (!formatFlipFrom(previous, next)) return null;
  const r = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
  const dx = previous.left - next.left;
  const dy = previous.top - next.top;
  const sx = previous.width / next.width;
  const sy = previous.height / next.height;
  const box: Keyframe[] = [];
  const art: Keyframe[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const p = step / steps;
    const x = sx + (1 - sx) * p;
    const y = sy + (1 - sy) * p;
    const offset = r(p, 4);
    box.push({ offset, transformOrigin: "0 0", transform: `translate(${r(dx * (1 - p), 2)}px, ${r(dy * (1 - p), 2)}px) scale(${r(x, 4)}, ${r(y, 4)})` });
    // In the box's own (pre-scale) space: centre the true-size art in the scaled box, then undo its scale.
    const ax = ((x - 1) * next.width) / (2 * x);
    const ay = ((y - 1) * next.height) / (2 * y);
    art.push({ offset, transformOrigin: "0 0", transform: `translate(${r(ax, 2)}px, ${r(ay, 2)}px) scale(${r(1 / x, 4)}, ${r(1 / y, 4)})` });
  }
  return { box, art };
}

/** The card slot stays blank after the clock; "Preparing card…" shows only if the card is this late. */
export const CARD_LATE_MS = 600;

/** A phone (below md): the sticky share bar with "More"; md+ gets the column 2 actions row. */
const PHONE_QUERY = "(max-width: 767px)";
function isPhone(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
  } catch {
    return false;
  }
}
function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return phone;
}

const style = (vars: Record<string, string | number>) => vars as CSSProperties;

/** Shown or held invisible in its reserved box (no shift), fading in over `ms`. */
const fadeBox = (shown: boolean, ms: number): CSSProperties => ({
  opacity: shown ? 1 : 0,
  visibility: shown ? "visible" : "hidden",
  transition: `opacity ${ms}ms linear, visibility ${ms}ms linear`,
});

/**
 * A control row held invisible in its box until the card prints (R2-04, md+), then faded in after
 * `delay` with the out easing; reduced motion: a 120 ms opacity change, no stagger.
 */
export const printFade = (shown: boolean, delay: number, reducedMotion: boolean): CSSProperties =>
  reducedMotion
    ? fadeBox(shown, PRINT_FADE_RM_MS)
    : {
        opacity: shown ? 1 : 0,
        visibility: shown ? "visible" : "hidden",
        transition: shown ? `opacity ${PRINT_FADE_MS}ms ${EASE.out} ${delay}ms, visibility 0ms linear ${delay}ms` : "none",
      };

/** The shelter's own name, read from the frame's label ("Zare, a real cat at Pink Paw"), so the plate needs no new copy. */
export function shelterPlate(catName: string, frameAlt: (name: string) => string): string {
  const shelter = /\bat (.+)$/.exec(frameAlt(catName))?.[1]?.trim();
  return shelter ? `${catName} · ${shelter}` : catName;
}

/**
 * An element's box in its `ancestor`'s layout coordinates, from `offsetLeft`/`offsetWidth` up the
 * offset-parent chain: no CSS transform or animation moves it (the stage group's shift, the frame's
 * step back, the shelter frame's slide-in, the cat's entrance and walk). Null when `ancestor` is not in
 * the chain or there is no layout (jsdom, a hidden tab), so the caller falls back.
 */
export function layoutBox(node: HTMLElement, ancestor: HTMLElement): { left: number; right: number; width: number } | null {
  let left = 0;
  let current: HTMLElement | null = node;
  while (current && current !== ancestor) {
    left += current.offsetLeft;
    const parent: Element | null = current.offsetParent;
    if (!(parent instanceof HTMLElement)) return null;
    current = parent;
  }
  if (current !== ancestor || !(node.offsetWidth > 0)) return null;
  return { left, right: left + node.offsetWidth, width: node.offsetWidth };
}

/**
 * How far the visitor's cat walks (px, negative is left) so its nose stops `gap` px right of the
 * shelter frame: from the untransformed boxes of the cat's slot child and the companion slot. Null
 * when there is no layout (a hidden tab, jsdom); 0 when it already stands there or further left.
 */
export function meetingWalkDx(
  cat: { left: number; width: number },
  shelter: { right: number; width: number },
  gap: number,
): number | null {
  if (!(cat.width > 0) || !(shelter.width > 0)) return null;
  const scale = cat.width / SHEET.cell;
  const dx = Math.round(shelter.right + gap - (cat.left + NOSE_X_FACING_LEFT * scale));
  return Math.min(0, dx);
}

export interface RevealStepProps {
  record: YourcatView;
  /** The avatar state as shown (a portrait still pending after the deadline reads as failed). */
  avatarStatus: YourcatAvatarStatus;
  /** The page runs the transformation clock in the frame (a fresh upload or a just-made manual cat). */
  clocked: boolean;
  /** The cat came from the manual pick: it was picked, not matched. */
  manual?: boolean;
  /** Uploads are open (false while the budget is spent or paused): "start over" then promises no new photo. */
  uploadsOpen?: boolean;
  /** The photo is still in memory (a fresh upload this page view): "Watch again" can replay the clock. */
  canReplay?: boolean;
  /** The random public id of this cat, for the per-cat share link (§8). */
  shareId?: string | null;
  reducedMotion: boolean;
  nameError: string | null;
  onRename: (name: string) => Promise<YourcatView | null>;
  onDelete: () => Promise<boolean>;
  onStartOver: () => void;
  isGuest: boolean;
  onCreateAccount?: () => void;
  /** Seconds from the file selection to this reveal, or null when not measured here. */
  secondsToReveal: number | null;
  shelterCandidates: () => Promise<PinkPawCandidate[]>;
  toast: (message: string) => void;
}

/** Keeps focus inside the dialog while it is open; Escape closes it. */
function trapKeys(event: KeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]'),
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** The delete confirmation: focus stays inside; "Keep" (the safe choice) is the primary and has focus first. */
function ConfirmDialog({
  text,
  extra,
  error,
  busy,
  onConfirm,
  onClose,
}: {
  text: string;
  extra?: string;
  /** A failed delete, shown in the dialog so the visitor can keep or try again from there. */
  error?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // The safe choice first: a second Enter or Space must not delete without reading the question.
    ref.current?.querySelector<HTMLElement>('[data-testid="yourcat-primary"] button')?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-tt-night-950/80 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yourcat-delete-text"
        aria-describedby={extra ? "yourcat-delete-extra" : undefined}
        className={`${PANEL} max-w-md bg-tt-night-800`}
        onKeyDown={(event) => trapKeys(event, onClose)}
      >
        <p id="yourcat-delete-text" className={BODY}>
          {text}
        </p>
        {extra && (
          <p id="yourcat-delete-extra" className={`${CAPTION} mt-2`}>
            {extra}
          </p>
        )}
        {error && (
          <p className={`${ALERT} mt-3`} role="alert" data-testid="yourcat-delete-error">
            {error}
          </p>
        )}
        {/* Keeping is the primary; deleting is the quiet pill with the warning border. */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-4">
          <button type="button" className={DANGER_PILL} disabled={busy} onClick={onConfirm}>
            {S3.deleteYes}
          </button>
          <PrimaryAction text={S3.deleteNo} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

/** The phone sheet behind "More" (§4.5): the Story/Post choice, Download and Copy link. */
function MoreSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end bg-tt-night-950/70 animate-tt-scrim-in" onClick={onClose} data-testid="yourcat-more-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yourcat-more-title"
        className="w-full rounded-t-2xl border-t-2 border-tt-gold-400/40 bg-tt-night-800 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-tt-cream animate-tt-sheet-in"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => trapKeys(event, onClose)}
        data-testid="yourcat-more-sheet"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="yourcat-more-title" className={H2}>
            {S3.more.title}
          </h2>
          <button type="button" className={NIGHT_PILL} onClick={onClose}>
            {S3.more.close}
          </button>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Story / Post as two night pills in a radio group. */
function FormatPills({ format, onChange, style }: { format: CardFormat; onChange: (format: CardFormat) => void; style?: CSSProperties }) {
  return (
    <div role="radiogroup" aria-label={S3.formatLabel} className="flex gap-2" style={style} data-testid="yourcat-format-pills">
      {(["story", "post"] as const).map((value) => (
        <label
          key={value}
          className={`${NIGHT_PILL} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-tt-cream ${
            format === value ? "!bg-tt-gold-400 !text-tt-night-900" : ""
          }`}
        >
          <input type="radio" name="yourcat-format" value={value} checked={format === value} onChange={() => onChange(value)} className="sr-only" />
          {value === "story" ? S3.story : S3.post}
        </label>
      ))}
    </div>
  );
}

/** The pencil icon of the rename pill. */
const Pencil = () => (
  <svg viewBox="0 0 12 12" className="h-4 w-4" aria-hidden="true" shapeRendering="crispEdges">
    <g fill="currentColor">
      <rect x="8" y="1" width="2" height="1" />
      <rect x="7" y="2" width="4" height="1" />
      <rect x="6" y="3" width="4" height="1" />
      <rect x="5" y="4" width="4" height="1" />
      <rect x="4" y="5" width="4" height="1" />
      <rect x="3" y="6" width="4" height="1" />
      <rect x="2" y="7" width="4" height="1" />
      <rect x="1" y="8" width="3" height="2" />
      <rect x="1" y="10" width="2" height="1" />
    </g>
  </svg>
);

/**
 * The card preview: sized to its format's aspect (no letterbox), printed in once, then cross-faded on
 * changes. Its box is always reserved, but nothing is drawn in it (no border, glow or text) until the
 * show is over and there is something to say: the card itself, a failure, or "Preparing card…" once
 * the card is `late`.
 */
function CardPreview({
  format,
  current,
  failed,
  late,
  wide,
  label,
  reducedMotion,
  onLongPress,
  holdHandlers,
}: {
  format: CardFormat;
  current: CardVariant | null;
  failed: boolean;
  /** The card is still not ready CARD_LATE_MS after the show ended. */
  late: boolean;
  /** In-app browsers show the card large. */
  wide: boolean;
  label: string;
  reducedMotion: boolean;
  onLongPress?: () => void;
  holdHandlers?: Record<string, () => void>;
}) {
  // The FLIP on a format change: the box's page rect after every render; a new format animates from it.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const artFlipRef = useRef<Animation | null>(null);
  const lastBox = useRef<{ format: CardFormat; rect: { left: number; top: number; width: number; height: number } } | null>(null);
  const flipRef = useRef<Animation | null>(null);
  useIsoLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const previous = lastBox.current;
    if (previous && previous.format === format) {
      // Same format: only remember where the box is (when no FLIP is moving it).
      if (!flipRef.current || flipRef.current.playState !== "running") {
        const box = node.getBoundingClientRect();
        lastBox.current = { format, rect: { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height } };
      }
      return;
    }
    flipRef.current?.cancel();
    flipRef.current = null;
    artFlipRef.current?.cancel();
    artFlipRef.current = null;
    const box = node.getBoundingClientRect();
    const rect = { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height };
    lastBox.current = { format, rect };
    if (!previous || typeof node.animate !== "function") return;
    try {
      if (reducedMotion) {
        flipRef.current = node.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: FORMAT_FLIP_RM_MS, easing: "linear" });
        return;
      }
      const frames = formatFlipFrames(previous.rect, rect);
      if (!frames) return;
      const timing = { duration: FORMAT_FLIP_MS, easing: EASE.out };
      flipRef.current = node.animate(frames.box, timing);
      artFlipRef.current = artRef.current?.animate(frames.art, timing) ?? null;
    } catch {
      // A missed FLIP only loses the motion: the box is already at its new size.
    }
  });
  const [layers, setLayers] = useState<{ url: string; first: boolean }[]>([]);
  useEffect(() => {
    if (!current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayers((now) => {
      if (now.length && now[now.length - 1].url === current.url) return now;
      // Keep the old image under the new one while it fades in (220 ms), then drop it.
      return [...now.slice(-1), { url: current.url, first: now.length === 0 }];
    });
  }, [current]);
  const ratio = format === "story" ? "1080 / 1920" : "1080 / 1350";
  const widthByHeight = format === "story" ? "calc(52svh * 9 / 16)" : "calc(52svh * 4 / 5)";
  const top = layers[layers.length - 1];
  const message = layers.length === 0 && (failed || late) ? (failed ? S3.cardFailed : S3.preparing) : null;
  const drawn = layers.length > 0 || !!message;
  return (
    <div
      ref={boxRef}
      className={`relative mx-auto overflow-hidden rounded-lg border-2 md:w-[400px] xl:mx-0 [@media(min-width:768px)_and_(min-height:1000px)]:w-[420px] ${
        drawn ? "border-tt-cream/60 bg-tt-night-800 shadow-[0_0_24px_rgb(var(--tt-gold-400)/.25)]" : "border-transparent"
      } ${top?.first ? "yc-print" : message ? "yc-fade-in" : ""}`}
      style={{ aspectRatio: ratio, width: wide ? `min(100%, 36rem)` : `min(100%, ${widthByHeight})` }}
      data-testid="yourcat-card-preview"
      data-format={format}
      data-drawn={drawn ? "true" : "false"}
    >
      {/* The art layer: counter-scaled during a Story/Post FLIP, so the card art never squashes. */}
      <div ref={artRef} className="absolute inset-0" data-testid="yourcat-card-art">
        {message && <div className={`${CAPTION} absolute inset-0 flex items-center justify-center p-4 text-center`}>{message}</div>}
        {layers.map((layer, index) => {
          const last = index === layers.length - 1;
          return (
           
            <img
              key={layer.url}
              src={layer.url}
              alt={last ? label : ""}
              aria-hidden={last ? undefined : true}
              className={`absolute inset-0 h-full w-full ${last && !layer.first ? "yc-fade-in [--yc-dur:220ms]" : ""}`}
              onAnimationEnd={() => {
                if (last) setLayers((now) => now.slice(-1));
              }}
              onContextMenu={last ? onLongPress : undefined}
              {...(last ? holdHandlers : {})}
            />
          );
        })}
        {top?.first && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="yc-sheen-once absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-tt-cream/30 to-transparent [--yc-delay:420ms]" />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * S3 "it steps out" (docs/plans/yourcat-polish.md §4.2 to §4.5). The page's frame runs the
 * transformation clock; this screen reacts to its cues: the frame bumps, the cat jumps out of its own
 * portrait onto the stone with the flare, a burst, a meow, a buzz and then a purr, the headline lands,
 * "Watch again" appears, and a real Pink Paw cat's cream frame slides onto the altar for a quiet
 * meeting. Then the card (sized to its format, printed in), the toggle that puts the shelter cat on it,
 * the actions (a sticky Share / Play / More bar on phones, a column 2 row on md+), the meeting block,
 * one footer line and the guest note.
 */
export const RevealStep = forwardRef<HTMLHeadingElement, RevealStepProps>((props, ref) => {
  const { record, avatarStatus, clocked, reducedMotion, nameError, onRename, onDelete, onStartOver } = props;
  const manual = !!props.manual;
  const uploadsOpen = props.uploadsOpen !== false;
  const studio = useStudio();
  const phone = usePhone();
  const name = displayName(record.name, record.named);
  const family = record.familyLabel;

  // ---- the clock's beats ---------------------------------------------------------------------------
  // "pre": the cat is still in the portrait; "out": it has stepped out; "done": the clock ended.
  const [phase, setPhase] = useState<"pre" | "out" | "done">(clocked ? "pre" : "done");
  const [titleIn, setTitleIn] = useState(!clocked);
  const [stepToken, setStepToken] = useState(0);
  const [bursts, setBursts] = useState<{ id: number; count: number }[]>([]);
  const [gif, setGif] = useState(0);
  const [meeting, setMeeting] = useState<"none" | "in" | "sat">("none");
  const [heart, setHeart] = useState(0);
  // The meeting walk (R2-02): measured from the cat's slot child and the companion slot.
  const [walk, setWalk] = useState<PetCatWalk | null>(null);
  const catWrapRef = useRef<HTMLDivElement | null>(null);
  const shelterRef = useRef<HTMLDivElement | null>(null);
  // Bumped by a replay, so a meeting timer from the previous run never lands in the next one.
  const meetRunRef = useRef(0);
  const walkIdRef = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => {
      all.forEach(clearTimeout);
      all.clear();
    };
  }, []);

  const addBurst = useCallback((count: number) => {
    if (reducedMotion) return;
    setBursts((now) => [...now, { id: Date.now() + Math.random(), count }]);
  }, [reducedMotion]);

  // The cat has stepped out on this run of the clock (a ref: the frame's cues arrive in one tick).
  const steppedRef = useRef(false);
  // The frame shows the pixel portrait (§4.1 meter segment 3): only the frame's own signal sets it.
  const [landed, setLanded] = useState(false);

  const stepOut = useCallback(() => {
    steppedRef.current = true;
    studio.frame.current?.bump("settle");
    setPhase("out");
    setStepToken((value) => value + 1);
    if (!reducedMotion) setGif((value) => value + 1);
    addBurst(28);
    playHomeSound("meow");
    hapticReveal(reducedMotion);
    later(CLOCK.PURR_AFTER_STEP_OUT, () => playHomeSound("purr"));
  }, [addBurst, later, reducedMotion, studio.frame]);

  const onCue = useCallback(
    (cue: StudioCue) => {
      if (cue === "hold") studio.frame.current?.bump("hold");
      else if (cue === "stepOut") stepOut();
      else if (cue === "title") setTitleIn(true);
      else if (cue === "done") setPhase("done");
    },
    [stepOut, studio.frame],
  );
  useCueListener({
    onCue,
    onAvatarLanded: () => {
      setLanded(true);
      // A portrait that was there for the clock lands with the step-out itself; only a late one pulses.
      if (!steppedRef.current) return;
      studio.frame.current?.bump("pulse");
      addBurst(8);
    },
  });

  // A clock that never answers (an image that does not load) still ends in the settled scene.
  const [runs, setRuns] = useState(0);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });
  useEffect(() => {
    if (!clocked) return;
    const timer = setTimeout(() => {
      if (phaseRef.current === "pre") stepOut();
      setPhase("done");
      setTitleIn(true);
    }, CLOCK_SAFETY_MS);
    return () => clearTimeout(timer);
  }, [clocked, stepOut, runs]);

  // Phones: from the shelter frame's arrival, the portrait steps back so the three never overlap (Stage `meeting`).
  useStageConfig({ shifted: phase !== "pre", meeting: meeting !== "none" });

  // ---- name: the pencil opens the rename row; the card follows it (debounced); a refused name keeps the last accepted
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(record.named ? record.name : "");
  const [debounced, setDebounced] = useState(draft);
  const [accepted, setAccepted] = useState(record.named ? record.name : "");
  const [saving, setSaving] = useState(false);
  // Once the visitor edits the name, a name arriving from the server no longer overwrites it.
  const touchedRef = useRef(false);
  const pencilRef = useRef<HTMLButtonElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(draft), NAME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    // The server's name wins when it changes (the name typed during the wait lands after S3 shows,
    // another tab): the card and, while untouched, the field follow it at once.
    if (!record.named) return;
     
    setAccepted(record.name);
    if (!touchedRef.current) {
      setDraft(record.name);
      setDebounced(record.name);
    }
  }, [record.named, record.name]);
  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);
  const cardName = (nameError ? accepted : debounced).trim();
  // The name and the card must agree before a file leaves: not while the name debounces or saves.
  const nameSettling = saving || draft.trim() !== debounced.trim();

  const save = useCallback(async () => {
    const value = draft.trim();
    if (!value) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    try {
      const next = await onRename(value);
      if (next) {
        setAccepted(next.name);
        setRenaming(false);
      }
    } finally {
      setSaving(false);
    }
  }, [draft, onRename]);

  // ---- format, Pink Paw ----------------------------------------------------------------------------
  const [format, setFormat] = useState<CardFormat>(() => (isPhone() ? "story" : "post"));
  const [shelter, setShelter] = useState<PinkPawCandidate | null>(null);
  // The gallery answered (with or without a cat): until then the meeting's boxes stay reserved.
  const [shelterSettled, setShelterSettled] = useState(false);
  const [withShelter, setWithShelter] = useState(true);
  const [artFailed, setArtFailed] = useState(false);
  const { shelterCandidates } = props;
  useEffect(() => {
    let cancelled = false;
    void shelterCandidates()
      .then((candidates) => {
        if (!cancelled) setShelter(pickPinkPawCat(candidates, record.id));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setShelterSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shelterCandidates, record.id]);
  // The null rule (§4.4): no candidate, or its art failed, means nothing at all.
  const meetCat = shelter && !artFailed ? shelter : null;
  const panelOn = !!meetCat && withShelter;
  // The meeting block, the coat line and the toggle appear with the shelter frame, at every width; with
  // no shelter cat the coat line appears once the clock has ended and the gallery has answered.
  const meetShown = phase === "done" && (meetCat ? meeting !== "none" : shelterSettled);
  const meetFade = fadeBox(meetShown, reducedMotion ? MEETING_FADE_RM_MS : MEETING_FADE_MS);
  // The toggle's row is held while the gallery may still name a cat.
  const toggleRow = !!meetCat || !shelterSettled;

  // The meeting beat: 400 ms after the clock's end (at once without a clock) the cream frame slides in.
  useEffect(() => {
    if (!meetCat || phase !== "done" || meeting !== "none") return;
    const run = meetRunRef.current;
    later(clocked ? CLOCK.MEETING_AFTER_DONE : 0, () => {
      if (run === meetRunRef.current) setMeeting("in");
    });
  }, [meetCat, phase, meeting, clocked, later]);

  const measureWalk = useCallback((): number | null => {
    const cat = catWrapRef.current;
    const slot = shelterRef.current?.parentElement;
    if (!cat || !slot) return null;
    // Layout boxes in the stage group, never the painted rects: a measure taken while the group's
    // shift, the frame's step back or the slide-in still runs (a slow phone) would leave the cat over
    // the portrait for good. Both slots live in the group, so it is their common offset parent.
    // Outside a stage group (no layout engine, a test host) the painted rects stand in.
    const group = cat.closest<HTMLElement>('[data-testid="yourcat-stage-group"]');
    const inGroup = group ? [layoutBox(cat, group), layoutBox(slot, group)] : [null, null];
    const [catBox, slotBox] = inGroup[0] && inGroup[1] ? inGroup : [cat.getBoundingClientRect(), slot.getBoundingClientRect()];
    if (!catBox || !slotBox) return null;
    const gap = catBox.width / SHEET.cell >= 5 ? MEETING_GAP.md : MEETING_GAP.phone;
    return meetingWalkDx(catBox, slotBox, gap);
  }, []);

  // With the frame in place, the cat walks over to it (walk row, ~700 ms), then sits facing it and
  // one heart rises between them. Reduced motion: it fades to the sit beside the frame (120 ms).
  useEffect(() => {
    if (meeting !== "in") return;
    const run = meetRunRef.current;
    const dx = measureWalk();
    const walks = dx !== null && dx < 0;
    const ms = reducedMotion ? CLOCK.MEETING_WALK_RM : CLOCK.MEETING_WALK;
    if (walks) setWalk({ id: (walkIdRef.current += 1), dx, ms });
    const sit = () => {
      if (run !== meetRunRef.current) return;
      setMeeting("sat");
      setHeart((value) => value + 1);
    };
    if (reducedMotion && walks) sit();
    else later(walks ? ms : MEETING_SIT_MS, sit);
  }, [meeting, measureWalk, reducedMotion, later]);

  // Any later layout change moves the cat to the frame's new place (no new walk): a resize, and any
  // size change of the stage group, the cat or the shelter slot (late CSS or fonts on a slow phone,
  // which once left the cat over the portrait when the first measure ran early). Measured from layout
  // boxes (`layoutBox`), which the slide-in, the step-out and the walk's own transforms never move, and
  // again whenever a transition or animation in the group ends. A first measure that found no layout
  // gets its move here too.
  const meetingOn = meeting !== "none";
  useEffect(() => {
    if (!meetingOn || typeof window === "undefined") return;
    const sync = () => {
      const dx = measureWalk();
      if (dx === null) return;
      setWalk((now) => {
        if (now) return now.dx === dx ? now : { ...now, dx };
        return dx < 0 ? { id: (walkIdRef.current += 1), dx, ms: 0 } : now;
      });
    };
    window.addEventListener("resize", sync);
    const watched = [
      catWrapRef.current?.closest<HTMLElement>('[data-testid="yourcat-stage-group"]'),
      catWrapRef.current,
      shelterRef.current?.parentElement,
    ].filter((node): node is HTMLElement => !!node);
    const observer = typeof ResizeObserver === "function" && watched.length ? new ResizeObserver(sync) : null;
    watched.forEach((node) => observer?.observe(node));
    // A class change that moves a slot without resizing it (the S3 shift's margins) ends with the
    // group's own transition: measure again when any transition or animation in the group ends.
    const group = watched[0]?.dataset.testid === "yourcat-stage-group" ? watched[0] : null;
    group?.addEventListener("transitionend", sync);
    group?.addEventListener("animationend", sync);
    return () => {
      window.removeEventListener("resize", sync);
      observer?.disconnect();
      group?.removeEventListener("transitionend", sync);
      group?.removeEventListener("animationend", sync);
    };
  }, [meetingOn, measureWalk]);

  // ---- the share cards ---------------------------------------------------------------------------
  const avatarUrl = avatarStatus === "ready" ? record.avatar.url : null;
  const { variants, failed } = useShareCards({
    recordId: record.id,
    name: cardName,
    familyLabel: family,
    avatarUrl,
    spriteImg: record.cat.spriteImg,
    shelter: meetCat,
    preferred: variantKey(format, panelOn),
    textFor: (panel) => cardText(cardName, !!cardName, family, panel && meetCat ? meetCat.name : null),
  });
  // The card prints once the step-out show is over (the show stays one clean take on a phone).
  const showOver = phase === "done";
  const current = showOver ? variants[variantKey(format, panelOn)] ?? null : null;
  // "Preparing card…" in the slot only when the card is still missing CARD_LATE_MS after the show.
  const [cardLate, setCardLate] = useState(false);
  const cardMissing = showOver && !current;
  useEffect(() => {
    if (!cardMissing || cardLate) return;
    const timer = setTimeout(() => setCardLate(true), CARD_LATE_MS);
    return () => clearTimeout(timer);
  }, [cardMissing, cardLate]);
  // R2-04: on md+ the pills, the toggle and the actions wait in their boxes for the card's print (or
  // its failure, or "Preparing card…"), then stay; a replay hides them again with the card.
  const printReady = !!current || (showOver && failed) || (cardLate && cardMissing);
  const [printedOnce, setPrintedOnce] = useState(false);
  useEffect(() => {
    if (printReady && !printedOnce) setPrintedOnce(true);
  }, [printReady, printedOnce]);
  const controlsShown = showOver && (printReady || printedOnce);

  // ---- sharing -------------------------------------------------------------------------------------
  const [inApp, setInApp] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const copyFieldRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
     
    setInApp(isInAppBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent));
  }, []);
  useEffect(() => {
    // Evaluated on the real file; kept while the next generation renders, so "Share" stays in place.
     
    if (current) setCanShare(canShareFile(current.file));
  }, [current]);
  useEffect(() => {
    if (copyFallback) copyFieldRef.current?.select();
  }, [copyFallback]);

  const report = (method: "web-share" | "download" | "copy-link" | "long-press") =>
    analytics.track(
      buildGrowthEvent("card_shared", {
        surface: "yourcat",
        format: method === "copy-link" ? "none" : format,
        method,
        withShelterCat: method === "copy-link" ? false : panelOn,
        avatarStatus,
        secondsToReveal: props.secondsToReveal,
      }),
    );

  // The card text names the cat exactly as the card it goes with; the link text uses the saved name.
  const shareText = (medium: "card" | "link") =>
    S3.shareText(
      medium === "card" && current ? displayName(current.name, !!current.name) : name,
      buildShareUrl(medium, medium === "card" ? format : "link", props.shareId),
      medium === "card" ? (panelOn && meetCat ? meetCat.name : null) : meetCat && withShelter ? meetCat.name : null,
    );

  const onShare = () => {
    if (!current || nameSettling) return;
    // No await before this call: iOS keeps the tap's user activation for navigator.share.
    void shareCardFile(current.file, shareText("card")).then((outcome: ShareOutcome) => {
      if (outcome === "web-share" || outcome === "download") report(outcome);
      if (outcome === "download") props.toast(S3.saved);
    });
  };
  const onDownload = () => {
    if (!current || nameSettling) return;
    if (downloadFile(current.file)) {
      report("download");
      props.toast(S3.saved);
    }
  };
  const onCopy = async () => {
    const text = shareText("link");
    if ((await copyShareText(text)) === "copy-link") {
      setCopyFallback(null);
      report("copy-link");
      props.toast(S3.copied);
    } else {
      setCopyFallback(text);
    }
  };
  // In-app browsers get the large card at once; pressing and holding it is recorded once (a save itself
  // cannot be detected): `contextmenu` where the webview fires it, else a 500 ms touch hold.
  const longPressReported = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLongPress = () => {
    if (longPressReported.current) return;
    longPressReported.current = true;
    report("long-press");
  };
  const startHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(onLongPress, 500);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => endHold, []);

  // ---- delete --------------------------------------------------------------------------------------
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const deleteLinkRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const setHeading = (node: HTMLHeadingElement | null) => {
    headingRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const openDialog = () => {
    setDeleteError(false);
    setConfirming(true);
  };
  const closeDialog = () => {
    setConfirming(false);
    setDeleteError(false);
    setTimeout(() => deleteLinkRef.current?.focus(), 0);
  };
  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(false);
    const ok = await onDelete();
    setDeleting(false);
    if (ok) {
      setConfirming(false);
      props.toast(S3.deleted);
      // The delete link is gone with the photo: focus goes to the screen heading (§1.6).
      setTimeout(() => headingRef.current?.focus(), 0);
    } else {
      // The dialog stays open with the reason, so Keep and Delete (again) are right there.
      setDeleteError(true);
    }
  };
  const paintingPaid = record.portrait.status === "painting";

  // ---- the kicker: the meter while the portrait is drawn, then the chip ------------------------------
  // Segment 3 fills when the frame shows the portrait (its landing), not when the record says "ready".
  const avatarShown = avatarStatus === "ready" && (!clocked || landed);
  const portraitSegment: SegmentState =
    avatarStatus === "failed" ? "failed" : avatarShown || avatarStatus === "none" ? "done" : "active";
  const meterText =
    avatarStatus === "failed" ? S3.drawFailed(name) : avatarShown || avatarStatus === "none" ? S2.meter.ready : S2.meter.painting;
  // A returning visit, a manual cat, or a landed portrait once the clock has ended: the chip "In the game".
  const showChip = !clocked || manual || avatarStatus === "none" || (avatarShown && phase === "done");

  const ready = !!current && !nameSettling;
  const fileOk = !inApp && !failed;
  // Share where Web Share takes the file, else Download; Copy link where no file can leave (in-app, no canvas).
  // Until the card exists the button keeps its own label, disabled (no width jump in the row); it says
  // "Preparing card…" only once the card is late (CARD_LATE_MS after the show), like the card slot.
  const fileLabel = canShare ? S3.share : S3.download;
  const primary = fileOk ? (
    <PrimaryAction text={!ready && cardLate && cardMissing ? S3.preparing : fileLabel} disabled={!ready} onClick={canShare ? onShare : onDownload} />
  ) : (
    <PrimaryAction text={S3.copyLink} onClick={() => void onCopy()} />
  );
  const playLink = (
    <Link href="/game" className={NIGHT_PILL}>
      {S3.play(name)}
    </Link>
  );
  const copyButton = (
    <button type="button" className={NIGHT_PILL} onClick={() => void onCopy()}>
      {S3.copyLink}
    </button>
  );
  const stickBar = phone && showOver && (!!current || failed);
  const meetingTitle = meetCat ? S3.meeting.title(name, meetCat.name) : null;
  const plate = meetCat ? shelterPlate(meetCat.name, S3.meeting.frameAlt) : "";
  const coatLine = S3.coatLine(name, record.family, family, manual);

  return (
    <>
      <HeadingBlock
        kicker={
          showChip ? (
            <span key="chip" className="yc-fade-in [--yc-dur:220ms]">
              <ChipCheck>{S2.inGame}</ChipCheck>
            </span>
          ) : (
            <Meter segments={["done", "done", portraitSegment]} text={meterText} />
          )
        }
        after={
          renaming ? (
            <form
              className="flex w-full max-w-md items-start gap-2 self-center xl:self-start"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor="yourcat-rename" className="sr-only">
                  {S3.renameLabel}
                </label>
                <input
                  ref={renameRef}
                  id="yourcat-rename"
                  className={INPUT}
                  type="text"
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={NAME_MAX}
                  value={draft}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "yourcat-name-error" : undefined}
                  onChange={(event) => {
                    touchedRef.current = true;
                    setDraft(event.target.value.slice(0, NAME_MAX));
                  }}
                  onBlur={() => void save()}
                />
                {nameError && (
                  <p id="yourcat-name-error" className={ALERT} role="alert">
                    {nameError}
                  </p>
                )}
              </div>
              <button type="submit" className={NIGHT_PILL} disabled={saving}>
                {S3.renameSave}
              </button>
            </form>
          ) : null
        }
      >
        <Headline
          ref={setHeading}
          parts={S3.title(name)}
          className={`${HEADLINE} ${titleIn ? (clocked ? "yc-title yc-glow-on" : "") : "opacity-0"}`}
        />
        <button
          ref={pencilRef}
          type="button"
          className={`${NIGHT_PILL} shrink-0 !px-3 ${titleIn ? "" : "invisible"}`}
          aria-label={S3.rename(name)}
          aria-expanded={renaming}
          onClick={() => setRenaming((open) => !open)}
          data-testid="yourcat-rename"
        >
          <Pencil />
        </button>
      </HeadingBlock>

      {/* The altar: the visitor's cat on the right once it has stepped out, the cream shelter frame on the left. */}
      <InSlot slot="cat">
        {phase !== "pre" && (
          <div ref={catWrapRef} className="relative" data-testid="yourcat-cat">
            <PetCat
              key={`cat-${stepToken}`}
              spriteImg={record.cat.spriteImg}
              name={name}
              labels={{ pet: S3.pet.pet(name), tap: S3.pet.tap(name), purrs: S3.pet.purrs(name) }}
              scale={{ base: 3, md: 6 }}
              mode={meeting === "sat" ? "sit" : "idle"}
              facing={meeting !== "none" ? "left" : "right"}
              entrance={clocked && stepToken > 0 && !reducedMotion ? "jumpOut" : "none"}
              heartOnce={heart}
              walk={walk}
              captionStart={meeting !== "none"}
              reducedMotion={reducedMotion}
            />
            {gif > 0 && <StepOutFlare key={`flare-${gif}`} />}
          </div>
        )}
      </InSlot>
      {meetCat && meeting !== "none" && (
        <InSlot slot="companion">
          <div ref={shelterRef} className="yc-slide-in relative -rotate-[4deg] md:rotate-0" data-testid="yourcat-shelter-frame">
            <Frame tone="cream" inner={{ w: 48, h: 72, mdW: 128, mdH: 192 }} reducedMotion={reducedMotion} label={S3.meeting.frameAlt(meetCat.name)}>
              {/* The art is cropped to its cat (focus and zoom per painting), so the cat fills the 2:3 glass. */}
              <img
                src={meetCat.image}
                alt=""
                className="h-full w-full object-cover"
                style={pinkPawArtStyle(meetCat.name)}
                onError={() => setArtFailed(true)}
                data-testid="yourcat-shelter-art"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-tt-night-950/25" />
            </Frame>
            {/* The cream name plate under the frame: "ZARE · PINK PAW" (two lines on phones, where the frame is narrow). */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-full mt-1.5 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-sm bg-tt-cream px-1.5 py-0.5 text-center font-primary text-p6 uppercase leading-none tracking-wide text-tt-night-900 shadow-[0_2px_0_rgb(var(--tt-night-950)/.5)] md:flex-row md:gap-1 md:px-2 md:py-1"
              data-testid="yourcat-shelter-plate"
            >
              {plate.split(" · ").map((part, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <span className="hidden md:inline">·</span>}
                  {part}
                </span>
              ))}
            </span>
          </div>
        </InSlot>
      )}
      <InSlot slot="overlay">
        {phase === "done" && props.canReplay && clocked && !manual && (
          <button
            type="button"
            className={`${NIGHT_PILL} yc-fade-in pointer-events-auto absolute right-2 top-2`}
            aria-label={S3.replay.aria(name)}
            onClick={() => {
              steppedRef.current = false;
              // The meeting and the controls replay with the clock.
              meetRunRef.current += 1;
              setMeeting("none");
              setWalk(null);
              setPrintedOnce(false);
              setPhase("pre");
              setTitleIn(true);
              setRuns((value) => value + 1);
              studio.replay();
            }}
            data-testid="yourcat-replay"
          >
            {S3.replay.label}
          </button>
        )}
      </InSlot>
      <InSlot slot="frameFx">
        {bursts.map((burst) => (
          <Burst
            key={burst.id}
            count={burst.count}
            reducedMotion={reducedMotion}
            onDone={() => setBursts((now) => now.filter((item) => item.id !== burst.id))}
          />
        ))}
      </InSlot>

      {/* The card and its choices: under the stage on phones, column 2 on md+. */}
      <InSlot slot="panel">
        <section className="flex w-full flex-col items-center gap-3 xl:items-stretch" data-testid="yourcat-share" aria-label={S3.share}>
          <CardPreview
            format={format}
            current={current}
            failed={showOver && failed}
            late={cardLate && cardMissing}
            wide={inApp}
            label={S3.cardAlt(name, family)}
            reducedMotion={reducedMotion}
            onLongPress={inApp ? onLongPress : undefined}
            holdHandlers={
              inApp ? { onTouchStart: startHold, onTouchEnd: endHold, onTouchMove: endHold, onTouchCancel: endHold } : undefined
            }
          />
          {/* The toggle row: the switch (held in its box until the meeting), and on md+ the Story/Post pills on the right. */}
          {(toggleRow || !phone) && (
            <div
              className={`flex w-full min-h-11 items-center gap-3 ${phone ? "justify-center" : "justify-between"}`}
              data-testid="yourcat-toggle-row"
            >
              {meetCat ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={withShelter}
                  className="inline-flex min-h-11 min-w-0 items-center gap-3 rounded-full px-2 text-left text-p5 md:text-p4 text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-cream"
                  style={phone ? meetFade : printFade(meetShown && controlsShown, PRINT_STAGGER_MS[1], reducedMotion)}
                  onClick={() => setWithShelter((value) => !value)}
                >
                  <span
                    aria-hidden="true"
                    className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-2 border-tt-gold-500 transition-colors ${
                      withShelter ? "bg-tt-gold-400" : "bg-tt-night-600"
                    }`}
                  >
                    <span
                      className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-tt-night-900 transition-transform duration-[180ms] motion-reduce:transition-none"
                      style={{ transform: withShelter ? "translateX(20px)" : "none", transitionTimingFunction: "cubic-bezier(.34,1.56,.64,1)" }}
                    />
                  </span>
                  {S3.meeting.toggle(meetCat.name)}
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
              {!phone && <FormatPills format={format} onChange={setFormat} style={printFade(controlsShown, PRINT_STAGGER_MS[0], reducedMotion)} />}
            </div>
          )}
          {inApp && !failed && (
            <div className="flex flex-col items-center gap-1 text-center" data-testid="yourcat-long-press">
              <p className={BODY}>{S3.longPress}</p>
              <p className={CAPTION}>{S3.inAppHint}</p>
            </div>
          )}
          {!phone && (
            // One row, left-aligned on xl: the primary unscaled and the pills a little narrower, so the three fit 420 px.
            <div
              className="flex w-full flex-wrap items-center justify-center gap-3 xl:justify-start [&_.glow-box:hover]:!scale-105 [&_.glow-box]:!scale-100 [&_[data-testid=yourcat-primary]]:mx-0 [&>a]:whitespace-nowrap [&>button]:whitespace-nowrap xl:[&>a]:px-2.5 xl:[&>button]:px-2.5"
              style={printFade(controlsShown, PRINT_STAGGER_MS[2], reducedMotion)}
              data-testid="yourcat-actions"
              data-sticky="false"
              data-shown={controlsShown ? "true" : "false"}
            >
              {primary}
              {fileOk && copyButton}
              {playLink}
            </div>
          )}
          {copyFallback && (
            <div className="flex w-full flex-col gap-1">
              <input ref={copyFieldRef} className={INPUT} readOnly value={copyFallback} aria-describedby="yourcat-copy-hint" />
              <p id="yourcat-copy-hint" className={CAPTION}>
                {S3.copyFallback}
              </p>
            </div>
          )}
        </section>
      </InSlot>

      {/* The meeting block, the footer line and the guest note: column 1 under the stage on md+. */}
      <InSlot slot="extras">
        <div className="mt-4 flex w-full flex-col gap-4 xl:mt-6" data-testid="yourcat-reveal">
          <section
            className={`${PANEL} flex flex-col gap-2`}
            style={meetFade}
            aria-hidden={meetShown ? undefined : true}
            data-testid="yourcat-meeting"
            data-shown={meetShown ? "true" : "false"}
          >
            <p className={BODY} data-testid="yourcat-coat-line">
              {coatLine}
            </p>
            {meetCat && meetingTitle && (
              <>
                <Headline level={2} parts={meetingTitle} />
                <p className={BODY}>{S3.meeting.body(meetCat.name)}</p>
              </>
            )}
          </section>

          <p className="flex flex-wrap items-center justify-center gap-x-2 text-p6 xl:justify-start" data-testid="yourcat-footer-line">
            {record.photo.stored || record.avatar.status !== "none" ? (
              <>
                <button ref={deleteLinkRef} type="button" className={TEXT_LINK} onClick={openDialog}>
                  {S3.deleteLink}
                </button>
                <span aria-hidden="true" className="text-tt-muted">
                  ·
                </span>
              </>
            ) : null}
            <button type="button" className={TEXT_LINK} onClick={onStartOver}>
              {uploadsOpen ? STATUS_COPY.startOver : STATUS_COPY.startOverPlain}
            </button>
          </p>

          {props.isGuest && (
            <div className="flex flex-col gap-1 text-center xl:text-left" data-testid="yourcat-guest-note">
              <p className={CAPTION}>
                {S3.guestNote(name)}{" "}
                <button type="button" className={INLINE_LINK} onClick={props.onCreateAccount}>
                  {S3.createAccount}
                </button>
              </p>
              <p className="text-p6 text-tt-muted">{S3.guestCaveat(name)}</p>
            </div>
          )}
          {/* Room for the sticky bar, so it never covers the last line. */}
          {stickBar && <div aria-hidden="true" className="h-20 md:hidden" />}
        </div>
      </InSlot>

      {stickBar &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="yc-bar-in fixed inset-x-0 bottom-0 z-40 border-t-2 border-tt-gold-400/30 bg-tt-night-900/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
            data-testid="yourcat-actions"
            data-sticky="true"
          >
            <div className="mx-auto flex max-w-md items-center justify-between gap-2">
              {/* The landing button at its unscaled size, so three actions fit a 360 px bar. */}
              <div className="flex min-w-0 flex-1 justify-start [&_.glow-box:hover]:!scale-105 [&_.glow-box]:!scale-100 [&_[data-testid=yourcat-primary]]:mx-0">
                {primary}
              </div>
              {playLink}
              <button
                ref={moreRef}
                type="button"
                className={NIGHT_PILL}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
              >
                {S3.more.label}
              </button>
            </div>
          </div>,
          document.body,
        )}
      {moreOpen && (
        <MoreSheet
          onClose={() => {
            setMoreOpen(false);
            setTimeout(() => moreRef.current?.focus(), 0);
          }}
        >
          <FormatPills format={format} onChange={setFormat} />
          {fileOk && (
            <button type="button" className={NIGHT_PILL} disabled={!ready} onClick={onDownload}>
              {S3.download}
            </button>
          )}
          {copyButton}
        </MoreSheet>
      )}

      {confirming && (
        <ConfirmDialog
          text={S3.deleteConfirm(name, family)}
          extra={paintingPaid ? S3.deletePaidPending : undefined}
          error={deleteError ? S3.deleteFailed : null}
          busy={deleting}
          onClose={closeDialog}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </>
  );
});

/** The level-up flare at the cat's paws: one play at 1.5x, then gone (§4.2). Its own alpha, no blend mode. */
function StepOutFlare() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setOn(false), STEP_OUT_GIF_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!on) return null;
  return (
     
    <img
      src={STEP_OUT_GIF}
      alt=""
      aria-hidden="true"
      width={96}
      height={96}
      className="pixelated pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={style({ bottom: -24 })}
      data-testid="yourcat-flare"
    />
  );
}
