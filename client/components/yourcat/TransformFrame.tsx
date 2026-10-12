/**
 * Everything inside the Frame's inner box from S1 to S3 (docs/plans/yourcat-polish.md §4 S2, §4.2,
 * §11): the empty silhouette, the S2 beats (scan, paint motes, push-in, the 1/16 quantise overlay,
 * the failure desaturation), the 1,450 ms transformation clock on one canvas, the white flash, the
 * pending label, the reduced-motion "Your photo" badge and the late-avatar mini gather.
 *
 * It fills its parent (`absolute inset-0`). Timing comes from `startCueClock` (one rAF loop), the
 * drawing from `pixelateReveal.ts`; the page reacts to the cues (`hold` → Frame bump, `stepOut` →
 * PetCat jump, Burst, meow, haptic, `title` → H1, `done` → replay pill). No framer-motion: WAAPI and
 * CSS transitions only, transform and opacity only, and a calm twin for every motion.
 */
import { GOLD } from "@/design/tokens";
import { useEffect, useRef, useState } from "react";
import { FrameSilhouette } from "./Frame";
import { CLOCK, EASE, startCueClock, type Cue } from "./motion";
import {
  BEAT_C_CELLS,
  blockForCells,
  buildLateGatherCues,
  buildRevealCues,
  canvasSide,
  drawPixelated,
  drawRevealStep,
  drawTarget,
  GATHER_BLOCKS,
  loadRevealImage,
  PENDING_CELLS,
  type RevealCue,
  type RevealSource,
  type RevealTarget,
} from "./pixelateReveal";

export type TransformMode = "empty" | "working" | "reveal" | "settled" | "manual";

export interface TransformFrameProps {
  photoUrl: string | null;
  avatarUrl: string | null;
  spriteImg: string;
  mode: TransformMode;
  working?: { sent: boolean; beatC: boolean; failed: boolean };
  reducedMotion: boolean;
  /** The accessible name of the result ("Mochi, Ginger pixel cat"); the silhouette label when empty. */
  label: string;
  /** "Painting your pixel portrait…"; pass "" when the portrait failed (no label, quantised photo stays). */
  pendingLabel: string;
  /** "Your photo" (reduced-motion badge). */
  photoBadgeLabel: string;
  /** Increment to run the clock again from the in-memory photo. */
  replayToken?: number;
  onCue?(cue: RevealCue): void;
  onAvatarLanded?(): void;
}

/** One scan pass: 1,800 ms while sending, 1,200 ms once the body was sent (restarts when `sent` flips). */
export const SCAN_MS = { sending: 1800, sent: 1200 } as const;
export const MOTE_COUNT = 10;
export const MOTE_STAGGER_MS = 180;
export const PUSH_IN_MS = 8000;
export const OVERLAY_FADE_MS = 1200;
export const OVERLAY_OPACITY = 0.35;
export const FLASH_MS = 180;
/** How long the clock waits for a ready avatar before it gathers into the pending target. */
export const AVATAR_WAIT_MS = 800;
/** The manual cat: a 300 ms gather of the sprite frame, then step out. */
export const MANUAL_GATHER_STEP_MS = 75;

type Stage = "photo" | "clock" | "final";
type FinalKind = "avatar" | "pending" | "sprite";

const SPRITE_CROP = { x: 0, y: 0, w: 48, h: 48 };

const canAnimate = (el: Element | null): el is HTMLElement & { animate: Element["animate"] } =>
  !!el && typeof (el as HTMLElement).animate === "function";

/** Deterministic mote spots (percent of the box). */
const MOTES = Array.from({ length: MOTE_COUNT }, (_, i) => ({
  left: 8 + ((i * 37) % 84),
  top: 45 + ((i * 53) % 45),
  life: 1400 + ((i * 290) % 800),
}));

export function TransformFrame(props: TransformFrameProps) {
  const { photoUrl, avatarUrl, spriteImg, mode, working, reducedMotion, label, pendingLabel, photoBadgeLabel, replayToken = 0 } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const scanRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const motesRef = useRef<HTMLDivElement | null>(null);

  // The latest callbacks, without restarting the clock when the page re-renders.
  const cbRef = useRef({ onCue: props.onCue, onAvatarLanded: props.onAvatarLanded });
  useEffect(() => {
    cbRef.current = { onCue: props.onCue, onAvatarLanded: props.onAvatarLanded };
  }, [props.onCue, props.onAvatarLanded]);

  const clocked = (mode === "reveal" && !!photoUrl) || mode === "manual";
  const [stage, setStage] = useState<Stage>(clocked ? "photo" : "final");
  const [finalKind, setFinalKind] = useState<FinalKind>(avatarUrl ? "avatar" : "sprite");
  const [landedAvatar, setLandedAvatar] = useState<string | null>(null);
  const [overlayOn, setOverlayOn] = useState(false);
  const [rmFaded, setRmFaded] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [slowAvatar, setSlowAvatar] = useState<string | null>(null);
  const targetRef = useRef<RevealTarget | null>(null);

  const sizeCanvas = (canvas: HTMLCanvasElement) => {
    const root = rootRef.current;
    const w = root?.clientWidth || 192;
    const h = root?.clientHeight || w;
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const side = canvasSide(w, dpr);
    canvas.width = side;
    canvas.height = Math.max(1, Math.round((side * h) / w));
  };

  // ---- S2: the scan line (A 1,800 ms, B 1,200 ms), stopped and faded on failure -----------------
  const sent = !!working?.sent;
  const failed = !!working?.failed;
  const beatC = !!working?.beatC;
  useEffect(() => {
    const scan = scanRef.current;
    if (mode !== "working" || reducedMotion || !canAnimate(scan)) return;
    if (failed) {
      const fade = scan.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear", fill: "forwards" });
      return () => fade.cancel();
    }
    const pass = scan.animate([{ transform: "translateY(-100%)" }, { transform: "translateY(0%)" }], {
      duration: sent ? SCAN_MS.sent : SCAN_MS.sending,
      iterations: Infinity,
      easing: "ease-in-out",
    });
    return () => pass.cancel();
  }, [mode, sent, failed, reducedMotion]);

  // Beat B: ten gold motes lift off the photo, once.
  useEffect(() => {
    const box = motesRef.current;
    if (mode !== "working" || !sent || failed || reducedMotion || !box) return;
    const animations: Animation[] = [];
    Array.from(box.children).forEach((child, i) => {
      if (!canAnimate(child)) return;
      animations.push(
        child.animate(
          [
            { transform: "translateY(0px)", opacity: 0 },
            { transform: "translateY(-16px)", opacity: 1, offset: 0.35 },
            { transform: "translateY(-40px)", opacity: 0 },
          ],
          { duration: MOTES[i].life, delay: i * MOTE_STAGGER_MS, easing: EASE.out, fill: "both" },
        ),
      );
    });
    return () => animations.forEach((a) => a.cancel());
  }, [mode, sent, failed, reducedMotion]);

  // Beat C: the photo pushes in, and a 1/16 quantised copy fades in to .35 (drawn once).
  useEffect(() => {
    if (mode !== "working" || !beatC || !photoUrl) return;
    let cancelled = false;
    let push: Animation | null = null;
    const photo = photoRef.current;
    if (!reducedMotion && !failed && canAnimate(photo)) {
      push = photo.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }], {
        duration: PUSH_IN_MS,
        easing: "linear",
        fill: "forwards",
      });
    }
    void loadRevealImage(photoUrl).then((image) => {
      const canvas = overlayRef.current;
      if (cancelled || !image || !canvas) return;
      try {
        canvas.width = BEAT_C_CELLS;
        canvas.height = BEAT_C_CELLS;
        drawPixelated(canvas, image, 0, { smooth: true });
        setOverlayOn(true);
      } catch {
        // No 2D canvas: no overlay.
      }
    });
    return () => {
      cancelled = true;
      push?.cancel();
    };
  }, [mode, beatC, photoUrl, reducedMotion, failed]);

  // ---- S3: the transformation clock --------------------------------------------------------------
  useEffect(() => {
    if (!clocked) {
      setStage("final");
      setFinalKind(avatarUrl ? "avatar" : "sprite");
      return;
    }
    let cancelled = false;
    let stop: (() => void) | null = null;
    setStage("photo");
    setRmFaded(false);
    setShowPending(false);
    setSlowAvatar(null);
    const cue = (name: RevealCue) => cbRef.current.onCue?.(name);

    const flash = () => {
      const el = flashRef.current;
      if (!reducedMotion && canAnimate(el)) {
        el.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: FLASH_MS, easing: EASE.out, fill: "forwards" });
      }
    };

    const run = async () => {
      if (mode === "manual") {
        const sheet = await loadRevealImage(spriteImg);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const target: RevealTarget | null = sheet ? { image: sheet, minBlock: 0, crop: SPRITE_CROP } : null;
        targetRef.current = target;
        const done = (name: RevealCue) => () => cue(name);
        let cues: Cue[];
        if (reducedMotion || !target || !canvas) {
          cues = [
            { at: 0, run: () => setStage("final") },
            { at: 0, run: done("hold") },
            { at: 120, run: done("stepOut") },
            { at: 120, run: done("title") },
            { at: 120, run: done("done") },
          ];
        } else {
          sizeCanvas(canvas);
          const steps = GATHER_BLOCKS.length * MANUAL_GATHER_STEP_MS;
          cues = [
            { at: 0, run: () => setStage("clock") },
            { at: 0, run: done("hold") },
            ...GATHER_BLOCKS.map((block, i) => ({ at: i * MANUAL_GATHER_STEP_MS, run: () => drawTarget(canvas, target, block) })),
            { at: steps, run: () => (flash(), setStage("final")) },
            { at: steps, run: done("stepOut") },
            { at: steps + CLOCK.TITLE - CLOCK.STEP_OUT, run: done("title") },
            { at: steps + CLOCK.DONE - CLOCK.STEP_OUT, run: done("done") },
          ];
        }
        setFinalKind("sprite");
        stop = startCueClock(cues);
        return;
      }

      // A fresh upload: the photo, and the avatar if it is already there.
      const [photo, avatar] = await Promise.all([
        loadRevealImage(photoUrl as string),
        avatarUrl ? loadRevealImage(avatarUrl, AVATAR_WAIT_MS) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const canvas = canvasRef.current;
      const pending = (image: RevealSource): RevealTarget => ({
        image,
        minBlock: blockForCells(PENDING_CELLS),
        tint: GOLD[400],
      });
      const target: RevealTarget | null = avatar ? { image: avatar, minBlock: 0 } : photo ? pending(photo) : null;
      targetRef.current = target;
      setFinalKind(avatar ? "avatar" : "pending");
      if (avatar && avatarUrl) setLandedAvatar(avatarUrl);
      // The portrait is in this run: it lands with the step-out (the frame shows it from there on). Told
      // before the "stepOut" cue, so the page fills the meter without a second pulse.
      const avatarIn = avatar ? () => cbRef.current.onAvatarLanded?.() : () => undefined;

      if (reducedMotion || !photo || !target || !canvas) {
        // The calm twin: the sharp photo for 600 ms, then a 400 ms linear cross-fade to the target.
        if (canvas && target) {
          try {
            sizeCanvas(canvas);
            drawTarget(canvas, target, 0);
          } catch {
            // No 2D canvas: the avatar <img> (or nothing) shows.
          }
        }
        const end = CLOCK.RM_HOLD + CLOCK.RM_FADE;
        stop = startCueClock([
          { at: 0, run: () => cue("hold") },
          { at: CLOCK.RM_HOLD, run: () => (setStage("final"), setRmFaded(true)) },
          { at: end, run: () => (setShowPending(true), avatarIn(), cue("stepOut")) },
          { at: end, run: () => cue("title") },
          { at: end, run: () => cue("done") },
        ]);
        return;
      }

      sizeCanvas(canvas);
      const cues = buildRevealCues(CLOCK, {
        draw: (step) => {
          try {
            drawRevealStep(canvas, step, photo, target, GOLD[400]);
          } catch {
            // A drawing failure must not stop the cues.
          }
        },
        cue: (name) => {
          if (name === "hold") setStage("clock");
          if (name === "stepOut") {
            flash();
            setShowPending(true);
            avatarIn();
          }
          if (name === "done") setStage("final");
          cue(name);
        },
      });
      stop = startCueClock(cues);
    };
    void run();
    return () => {
      cancelled = true;
      stop?.();
    };
    // The clock runs once per mode change and per replay; avatar changes go to the late gather.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clocked, mode, replayToken, photoUrl, reducedMotion]);

  // ---- a pixel portrait that lands after the clock: mini gather ------------------------------------
  useEffect(() => {
    if (!clocked || mode !== "reveal" || stage !== "final" || finalKind !== "pending" || !avatarUrl) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    const landed = () => {
      setSlowAvatar(null);
      setLandedAvatar(avatarUrl);
      setFinalKind("avatar");
      setShowPending(false);
      cbRef.current.onAvatarLanded?.();
    };
    void loadRevealImage(avatarUrl).then((avatar) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      // No decode in time (a slow CDN): a hidden <img> keeps loading it and lands it when it arrives,
      // while the frame keeps the pending target; nothing claims the portrait before it shows.
      if (!avatar) {
        setSlowAvatar(avatarUrl);
        return;
      }
      if (reducedMotion || !canvas) {
        landed();
        return;
      }
      const target: RevealTarget = { image: avatar, minBlock: 0 };
      targetRef.current = target;
      stop = startCueClock(
        buildLateGatherCues((block) => {
          try {
            drawTarget(canvas, target, block);
          } catch {
            // Straight to the image.
          }
        }, landed),
      );
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [clocked, mode, stage, finalKind, avatarUrl, reducedMotion]);

  // ---- render --------------------------------------------------------------------------------------
  if (mode === "empty") {
    return (
      <div className="absolute inset-0" data-testid="yourcat-transform" data-mode="empty">
        <FrameSilhouette label={label} />
      </div>
    );
  }

  const photoLayer = (mode === "working" || (clocked && mode === "reveal")) && !!photoUrl;
  const photoVisible = mode === "working" || stage === "photo" || (reducedMotion && !rmFaded);
  const canvasVisible = clocked && (stage === "clock" || (finalKind === "pending" && (stage === "final" || reducedMotion)));
  const shownAvatar = clocked ? (finalKind === "avatar" ? (landedAvatar ?? avatarUrl) : null) : avatarUrl;
  const avatarVisible = !!shownAvatar && (!clocked || stage === "final");
  const spriteVisible = !shownAvatar && ((!clocked && mode !== "working") || (mode === "manual" && stage === "final"));
  const pendingVisible = mode === "reveal" && clocked && finalKind === "pending" && showPending && !!pendingLabel;
  const badgeVisible = reducedMotion && mode === "reveal" && !!photoUrl;
  const desaturate = mode === "working" && failed;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 overflow-hidden"
      role="img"
      aria-label={label}
      data-testid="yourcat-transform"
      data-mode={mode}
      data-stage={stage}
      data-target={clocked ? finalKind : undefined}
    >
      {photoLayer && (
        <img
          ref={photoRef}
          src={photoUrl as string}
          alt=""
          aria-hidden="true"
          data-testid="yourcat-photo"
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: photoVisible ? 1 : 0,
            filter: desaturate ? "grayscale(.6)" : "none",
            // The calm twin cross-fades the photo away on top of the target.
            zIndex: reducedMotion ? 2 : undefined,
            transition: reducedMotion ? `opacity ${CLOCK.RM_FADE}ms linear` : "filter 300ms cubic-bezier(.4,0,.2,1)",
          }}
        />
      )}

      {mode === "working" && (
        <>
          <canvas
            ref={overlayRef}
            aria-hidden="true"
            data-testid="yourcat-quantise"
            className="absolute inset-0 h-full w-full"
            style={{
              imageRendering: "pixelated",
              opacity: overlayOn && beatC ? OVERLAY_OPACITY : 0,
              transition: `opacity ${OVERLAY_FADE_MS}ms linear`,
              filter: desaturate ? "grayscale(.6)" : "none",
            }}
          />
          {!reducedMotion && (
            <div ref={scanRef} aria-hidden="true" data-testid="yourcat-scan" className="pointer-events-none absolute inset-0" style={{ transform: "translateY(-100%)" }}>
              <div
                className="absolute inset-x-0 bottom-[2px] h-6"
                style={{ background: "linear-gradient(transparent, rgb(var(--tt-gold-400) / .35))" }}
              />
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-tt-gold-400" />
            </div>
          )}
          {!reducedMotion && sent && !failed && (
            <div ref={motesRef} aria-hidden="true" data-testid="yourcat-motes" className="pointer-events-none absolute inset-0">
              {MOTES.map((mote, i) => (
                <span
                  key={i}
                  className="absolute h-1 w-1 bg-tt-gold-400"
                  style={{ left: `${mote.left}%`, top: `${mote.top}%`, opacity: 0 }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {clocked && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          data-testid="yourcat-reveal-canvas"
          className="absolute inset-0 h-full w-full"
          style={{
            imageRendering: "pixelated",
            opacity: canvasVisible ? 1 : 0,
          }}
        />
      )}

      {shownAvatar && (
        <img
          src={shownAvatar}
          alt=""
          aria-hidden="true"
          data-testid="yourcat-avatar"
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            imageRendering: "pixelated",
            opacity: avatarVisible ? 1 : 0,
            transition: reducedMotion ? "opacity 120ms linear" : undefined,
          }}
        />
      )}

      {slowAvatar && finalKind === "pending" && (
        <img
          src={slowAvatar}
          alt=""
          aria-hidden="true"
          data-testid="yourcat-avatar-slow"
          className="absolute inset-0 h-full w-full opacity-0"
          onLoad={() => {
            setLandedAvatar(slowAvatar);
            setFinalKind("avatar");
            setShowPending(false);
            setSlowAvatar(null);
            cbRef.current.onAvatarLanded?.();
          }}
        />
      )}

      {spriteVisible && (
        <div
          aria-hidden="true"
          data-testid="yourcat-sprite-frame"
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${spriteImg}")`,
            backgroundSize: "1500% 1000%",
            backgroundPosition: "0 0",
            backgroundRepeat: "no-repeat",
            imageRendering: "pixelated",
          }}
        />
      )}

      {pendingVisible && (
        <span
          data-testid="yourcat-pending-label"
          className="absolute z-[3] inset-x-2 bottom-2 mx-auto w-fit max-w-[calc(100%-1rem)] truncate rounded-full bg-tt-cream px-3 py-1 text-center text-p6 text-tt-night-900"
        >
          {pendingLabel}
        </span>
      )}

      {badgeVisible && (
        <img
          src={photoUrl as string}
          alt=""
          aria-hidden="true"
          title={photoBadgeLabel}
          data-testid="yourcat-photo-badge"
          className="absolute left-0 top-0 z-[3] h-16 w-16 border-2 border-tt-cream object-cover"
        />
      )}

      {!reducedMotion && clocked && (
        <div ref={flashRef} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: 0 }} />
      )}
    </div>
  );
}

export default TransformFrame;
