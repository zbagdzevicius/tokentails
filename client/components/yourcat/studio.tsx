/**
 * The `/yourcat` studio (docs/plans/yourcat-polish.md §3): one persistent `<Stage>` with one `<Frame>`
 * and one `<TransformFrame>` stays mounted from S1 to S3 (and on the manual pick and the friend view),
 * so the frame never changes size or position between screens; only its contents change.
 *
 * `YourCatPage` owns the grid, the stage and the frame contents. Each screen renders its heading block
 * in place (the H1 is server-rendered: it is the LCP element) and puts everything else into the page's
 * slots through portals: the frame's effects layer, the companion and cat spots on the altar, the overlay over the stage, the
 * panel (under the stage on phones, column 2 on md+) and the extras (column 1 under the stage on md+).
 * Screens set the stage's state (`useStageConfig`), reach the frame's `bump()` handle, listen to the
 * reveal clock's cues and ask for a replay.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { FrameHandle } from "./Frame";

export type StudioCue = "hold" | "stepOut" | "title" | "done";

/** What a screen may set on the persistent stage and frame. */
export interface StageConfig {
  /** Phones on S3: the frame moves 40 px left as the cat steps out (§3). */
  shifted?: boolean;
  /** The companion on the altar's left (default) or right after the cat (`Stage` `companionSide`). */
  companionSide?: "left" | "right";
  dragOver?: boolean;
  sheen?: boolean;
  onDrop?(file: File): void;
  onDragState?(over: boolean): void;
}

export interface StudioSlots {
  /** Over the frame's outer box (not clipped by the glass): the bursts. */
  frameFx: HTMLElement | null;
  companion: HTMLElement | null;
  cat: HTMLElement | null;
  overlay: HTMLElement | null;
  panel: HTMLElement | null;
  extras: HTMLElement | null;
}

/** The reveal clock's listener (the S3 screen). */
export interface CueListener {
  onCue?(cue: StudioCue): void;
  onAvatarLanded?(): void;
}

export interface Studio {
  slots: StudioSlots;
  frame: RefObject<FrameHandle | null>;
  /** The stage's outer box. */
  stage: RefObject<HTMLDivElement | null>;
  configure(config: StageConfig): void;
  listen(listener: CueListener | null): void;
  /** Runs the transformation clock again from the photo in memory. */
  replay(): void;
}

export const StudioContext = createContext<Studio | null>(null);

const NO_SLOTS: StudioSlots = { frameFx: null, companion: null, cat: null, overlay: null, panel: null, extras: null };
const NO_REF = { current: null };
const NOOP = () => undefined;
const DETACHED: Studio = {
  slots: NO_SLOTS,
  frame: NO_REF,
  stage: NO_REF,
  configure: NOOP,
  listen: NOOP,
  replay: NOOP,
};

/** The studio of the page; outside a page (a screen rendered alone) every slot is empty. */
export function useStudio(): Studio {
  return useContext(StudioContext) ?? DETACHED;
}

/** Applies `config` to the stage while the calling screen is mounted (and whenever a value changes). */
export function useStageConfig(config: StageConfig): void {
  const { configure } = useStudio();
  const handlers = useRef({ onDrop: config.onDrop, onDragState: config.onDragState });
  useEffect(() => {
    handlers.current = { onDrop: config.onDrop, onDragState: config.onDragState };
  });
  const hasDrop = !!config.onDrop;
  const hasDrag = !!config.onDragState;
  const { shifted, companionSide, dragOver, sheen } = config;
  useEffect(() => {
    configure({
      shifted,
      companionSide,
      dragOver,
      sheen,
      onDrop: hasDrop ? (file) => handlers.current.onDrop?.(file) : undefined,
      onDragState: hasDrag ? (over) => handlers.current.onDragState?.(over) : undefined,
    });
  }, [configure, shifted, companionSide, dragOver, sheen, hasDrop, hasDrag]);
  useEffect(() => () => configure({}), [configure]);
}

/** Listens to the reveal clock while the calling screen is mounted. */
export function useCueListener(listener: CueListener): void {
  const { listen } = useStudio();
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    listen({
      onCue: (cue) => latest.current.onCue?.(cue),
      onAvatarLanded: () => latest.current.onAvatarLanded?.(),
    });
    return () => listen(null);
  }, [listen]);
}

/** Renders `children` into one of the page's slots (nothing until the slot exists). */
export function InSlot({ slot, children }: { slot: keyof StudioSlots; children: ReactNode }) {
  const { slots } = useStudio();
  const node = slots[slot];
  return node ? createPortal(children, node) : null;
}

/** The kicker slot: a fixed 28 px row (§3 phones). */
export const KICKER_SLOT = "flex h-7 items-center justify-center gap-2 xl:justify-start";

/**
 * Column 2 of the xl studio sits on one night panel over the painted sky (R2-03): the heading block is
 * its top half (`NIGHT_COLUMN_TOP`), the page's panel slot its bottom half (`NIGHT_COLUMN_BOTTOM`), with
 * no row gap between them; S6, which has no heading block, takes the whole panel (`NIGHT_COLUMN`).
 * The surface reaches 26 px past the 420 px column on each side (24 px padding and the 2 px border), so
 * the content keeps its full 420 px. A 2 px gold hairline instead of the cream `PANEL` border, so the
 * cream panels inside it never double up; no `backdrop-filter`, so fixed sheets and toasts inside the panel keep the viewport as their box.
 */
const NIGHT_SURFACE =
  "xl:-mx-[26px] xl:w-auto xl:border-tt-gold-500/35 xl:bg-tt-night-900/85 xl:px-6 xl:shadow-[0_4px_0_rgb(var(--tt-night-950))]";
export const NIGHT_COLUMN_TOP = `${NIGHT_SURFACE} xl:rounded-t-2xl xl:border-2 xl:border-b-0 xl:pb-4 xl:pt-4`;
export const NIGHT_COLUMN_BOTTOM = `${NIGHT_SURFACE} xl:rounded-b-2xl xl:border-2 xl:border-t-0 xl:pb-6`;
export const NIGHT_COLUMN = `${NIGHT_SURFACE} xl:rounded-2xl xl:border-2 xl:py-6`;

/**
 * The heading block, the same on every screen: a 28 px kicker slot, then the H1 slot. On phones the
 * H1 slot is two lines tall (`min-h-[2em]` at the headline's size and line height 1, bottom-aligned),
 * so the stage under it never moves when the heading changes. On xl it sits in column 2, row 1, as the
 * top half of the column's night panel.
 */
export function HeadingBlock({ kicker, children, after }: { kicker?: ReactNode; children: ReactNode; after?: ReactNode }) {
  return (
    <div
      className={`flex w-full flex-col text-center xl:col-start-2 xl:row-start-1 xl:gap-2 xl:self-end xl:text-left ${NIGHT_COLUMN_TOP}`}
      data-testid="yourcat-heading"
    >
      <div className={KICKER_SLOT} data-testid="yourcat-kicker">
        {kicker}
      </div>
      <div className="flex min-h-[2em] items-end justify-center gap-3 font-primary text-h6 leading-none [&_h1]:!leading-none sm:text-h5 xl:min-h-0 xl:justify-start md:text-h4 xl:text-h3">
        {children}
      </div>
      {after}
    </div>
  );
}
