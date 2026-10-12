/**
 * The visitor's cat as a character (docs/plans/yourcat-polish.md §4.3, §11), replacing the GIF
 * `PlayableCat`. Driven from its own 720 x 480 sheet with CSS `background-position` and `steps()` at
 * `--s` = 3 on phones, 4 on md+ (integer scales only, §1.5). It stands on the stone with its feet on
 * its box's stone line and a stepped oval shadow, idles at 8 fps with a 6 px hop every 6 s (three
 * times), and pauses offscreen. Tap or hold: squash, loaf for at least 1.2 s, 3 to 5 pixel hearts,
 * a purr and the caption "X purrs.". Double tap: one jump. It faces the side of the last tap.
 * Reduced motion keeps the petting: a 120 ms opacity swap to the loaf frame, the purr and the caption,
 * with no loop, hop or hearts.
 *
 * `blink` (S6, the paid screen): the sit row stays on frame 0 and blinks every 4 s (frames 0, 1, 2,
 * 1, 0 in steps at the row's 8 fps) instead of looping. A new `mode` swaps the resting row at once;
 * under reduced motion it cross-fades frame 0 of the old row into frame 0 of the new one in 120 ms.
 *
 * Round 3 (R2-02, R2-05, R2-06):
 * - `walk` moves the cat `dx` px along the stone with the walk row (8 frames over the walk) and a
 *   linear translateX, facing where it goes; it stays there. Reduced motion: a 120 ms fade in place.
 * - Hearts sit on a 2x pixel grid (12 px phones, 18 px md+, crisp edges); a pet floats 3 to 5 spread
 *   over ±16 px, each swaying ±4 px as it rises. The meeting heart (`heartOnce`) rises in front of the
 *   cat's face, between it and whoever it faces.
 * - Releasing a pet bounces the cat for one sprite frame (125 ms, stretched up); three pets in 5 s
 *   end the loaf in one groom (row 2, once).
 * - The jump out of the frame peaks at -64 px on phones and -96 px on md+.
 * - The caption is `text-p5` in a 44 px tall box that pets the cat too (a mouse or touch shortcut;
 *   the button stays the accessible control).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { playHomeSound } from "@/components/home/homeSfx";
import { useInView } from "./motion";
import { ANIMS, FEET_Y, SHEET, type SpriteAnim } from "./spriteSheet";

/**
 * The cat's own keyframes (transform and opacity only): the swaying heart, the one-frame release
 * bounce and the jump out of the frame with its apex in `--yc-apex`. Reduced motion: the heart only
 * fades, the bounce and the jump are gone.
 */
export const PET_CAT_CSS = `
@keyframes yc-pc-heart {
  0% { opacity: 0; transform: none; }
  15% { opacity: 1; }
  40% { transform: translate(var(--yc-sway, 4px), calc(var(--yc-rise, 24px) * -.55)); }
  75% { transform: translate(calc(var(--yc-sway, 4px) * -1), calc(var(--yc-rise, 24px) * -.88)); }
  100% { opacity: 0; transform: translate(0, calc(var(--yc-rise, 24px) * -1)); }
}
@keyframes yc-pc-bounce { 0% { transform: scale(.94, 1.08); } 100% { transform: none; } }
@keyframes yc-pc-jump {
  0% { transform: translate(var(--yc-jx, -56px), calc(var(--yc-apex, -64px) * .375)); animation-timing-function: steps(3, end); }
  50% { transform: translate(calc(var(--yc-jx, -56px) / 2), var(--yc-apex, -64px)); animation-timing-function: steps(3, end); }
  100% { transform: none; }
}
.yc-pc-heart { animation: yc-pc-heart var(--yc-dur, 600ms) linear var(--yc-delay, 0ms) both; }
.yc-pc-bounce { animation: yc-pc-bounce 125ms steps(1, end) both; transform-origin: bottom; }
@media (prefers-reduced-motion: reduce) {
  .yc-pc-heart { animation: yc-heart-calm 600ms linear var(--yc-delay, 0ms) both; }
  .yc-pc-bounce { animation: none; }
}
`;

export type PetCatEntrance = "none" | "jumpOut" | "walkIn" | "peek";

export interface PetCatProps {
  spriteImg: string;
  name: string;
  /** `pet`: the button's name ("Pet Mochi"); `tap`: the resting caption ("Tap Mochi"); `purrs`: after a pet ("Mochi purrs."). */
  labels: { pet: string; tap: string; purrs: string };
  scale?: { base: 2 | 3 | 4; md?: 3 | 4 | 6 };
  mode?: "idle" | "sit" | "loaf";
  facing?: "left" | "right";
  entrance?: PetCatEntrance;
  interactive?: boolean;
  sound?: boolean;
  reducedMotion: boolean;
  /** Increment to float one heart (the meeting beat, §4.4). */
  heartOnce?: number;
  /** The sit row holds frame 0 and blinks every `BLINK_EVERY_MS` instead of looping (S6). Static under reduced motion. */
  blink?: boolean;
  /**
   * Walk `dx` px along the stone over `ms` (a new `id` walks again; the same `id` with a new `dx`
   * only moves the cat, as after a resize). The cat stays where the walk ends.
   */
  walk?: PetCatWalk | null;
  onEntranceEnd?(): void;
}

export interface PetCatWalk {
  id: number;
  dx: number;
  ms: number;
}

/** Static class tables, so Tailwind sees every `--s` value. */
const BASE_SCALE: Record<2 | 3 | 4, string> = { 2: "[--s:2]", 3: "[--s:3]", 4: "[--s:4]" };
const MD_SCALE: Record<3 | 4 | 6, string> = { 3: "md:[--s:3]", 4: "md:[--s:4]", 6: "md:[--s:6]" };

/** The loaf after a pet lasts at least this long (§4.3). */
export const LOAF_MIN_MS = 1200;
/** Two pointerdowns closer than this are a double tap (one jump). */
export const DOUBLE_TAP_MS = 300;
const ENTRANCE_MS: Record<Exclude<PetCatEntrance, "none">, number> = { jumpOut: 480, walkIn: 480, peek: 320 };
const REDUCED_FADE_MS = 120;
/** The slow blink on the sit row (S6): one blink every 4 s, frames 0 -> 1 -> 2 -> 1 -> 0 in steps. */
export const BLINK_EVERY_MS = 4000;
export const BLINK_FRAMES: readonly number[] = [1, 2, 1, 0];
const HEART_LIFE_MS = 700;
/** A pet's hearts spread over ±HEART_SPREAD px and sway ±HEART_SWAY px as they rise (R2-06). */
export const HEART_SPREAD = 16;
export const HEART_SWAY = 4;
/** Three pets within GROOM_WINDOW_MS end the loaf in one groom (row 2, once). */
export const GROOM_PETS = 3;
export const GROOM_WINDOW_MS = 5000;
/** The release bounce holds one sprite frame at the row's 8 fps. */
export const RELEASE_BOUNCE_MS = 125;
/**
 * The cat's nose inside its 48 px cell when it faces left (the sheet faces right: the body spans
 * x 12 to 36 on every base sheet, so mirrored the nose is at 11). The meeting puts it a small gap
 * from the shelter frame and floats its heart in that gap.
 */
export const NOSE_X_FACING_LEFT = 11;

type Heart = { id: number; x: number; delay: number; sway: number; front: boolean };

/** The heart's offsets for a pet of `count`: spread evenly over ±HEART_SPREAD (±2 px jitter), alternating sway. */
export function heartSpread(count: number, random: () => number = Math.random): { x: number; sway: number; delay: number }[] {
  if (count <= 1) return [{ x: 0, sway: HEART_SWAY, delay: 0 }];
  return Array.from({ length: count }, (_, index) => {
    const even = -HEART_SPREAD + (index * 2 * HEART_SPREAD) / (count - 1);
    const x = Math.max(-HEART_SPREAD, Math.min(HEART_SPREAD, Math.round(even + (random() * 4 - 2))));
    return { x, sway: index % 2 === 0 ? HEART_SWAY : -HEART_SWAY, delay: index * 70 };
  });
}

/** A 6x6 pixel heart in `tt-pink` on a 2x grid: 12 px on phones, 18 px (3x) from md up. */
function PixelHeart() {
  return (
    <svg
      viewBox="0 0 6 6"
      width={12}
      height={12}
      aria-hidden="true"
      shapeRendering="crispEdges"
      className="block h-3 w-3 fill-tt-pink md:h-[18px] md:w-[18px]"
      data-testid="yourcat-heart-svg"
    >
      <rect x="0" y="1" width="2" height="2" />
      <rect x="4" y="1" width="2" height="2" />
      <rect x="1" y="0" width="1" height="1" />
      <rect x="4" y="0" width="1" height="1" />
      <rect x="2" y="1" width="2" height="1" />
      <rect x="0" y="2" width="6" height="1" />
      <rect x="1" y="3" width="4" height="1" />
      <rect x="2" y="4" width="2" height="1" />
    </svg>
  );
}

/** One sheet layer showing `anim`, looping with `steps()` or fixed on `frame`. */
function SheetLayer({
  spriteImg,
  anim,
  loop,
  frame = 0,
  iterations,
  frameMs,
  className = "",
  style,
}: {
  spriteImg: string;
  anim: SpriteAnim;
  loop: boolean;
  frame?: number;
  iterations?: number;
  frameMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { row, frames, fps } = ANIMS[anim];
  const layerStyle = {
    "--yc-frames": frames,
    "--yc-frame-ms": `${frameMs ?? Math.round(1000 / fps)}ms`,
    "--yc-iter": iterations === undefined ? "infinite" : String(iterations),
    backgroundImage: `url("${spriteImg}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `calc(${SHEET.width}px * var(--s)) calc(${SHEET.height}px * var(--s))`,
    backgroundPosition: `calc(var(--yc-cell) * ${-(loop ? 0 : frame % frames)}) calc(var(--yc-cell) * ${-row})`,
    imageRendering: "pixelated",
    ...style,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={`pixelated absolute inset-0 block ${loop ? "yc-sprite" : ""} ${className}`}
      style={layerStyle}
      data-anim={anim}
      data-row={row}
      data-frame={loop ? undefined : frame % frames}
    />
  );
}

export function PetCat({
  spriteImg,
  name,
  labels,
  scale = { base: 3, md: 4 },
  mode = "idle",
  facing = "right",
  entrance = "none",
  interactive = true,
  sound = true,
  reducedMotion,
  heartOnce,
  blink = false,
  walk = null,
  onEntranceEnd,
}: PetCatProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);
  const [face, setFace] = useState<"left" | "right">(facing);
  const [petted, setPetted] = useState(false);
  const [loafing, setLoafing] = useState(false);
  const [grooming, setGrooming] = useState(0);
  const [jumping, setJumping] = useState(0);
  const [squash, setSquash] = useState(0);
  const [bounce, setBounce] = useState(0);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [entering, setEntering] = useState<PetCatEntrance>(entrance);
  const lastDownRef = useRef(0);
  const loafSinceRef = useRef(0);
  const holdingRef = useRef(false);
  const petTimesRef = useRef<number[]>([]);
  const groomNextRef = useRef(false);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const heartIdRef = useRef(0);
  const entranceEndRef = useRef(onEntranceEnd);

  useEffect(() => {
    entranceEndRef.current = onEntranceEnd;
  }, [onEntranceEnd]);

  const later = useCallback((ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      run();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // A new facing from the page (the meeting beat turns the cat to the shelter frame) wins until the next tap.
  useEffect(() => {
    setFace(facing);
  }, [facing]);

  // The entrance plays once per mount (or per new entrance value); then the resting pose.
  useEffect(() => {
    setEntering(entrance);
    if (entrance === "none") return;
    const ms = reducedMotion ? REDUCED_FADE_MS : ENTRANCE_MS[entrance];
    const timer = setTimeout(() => {
      setEntering("none");
      entranceEndRef.current?.();
    }, ms);
    return () => clearTimeout(timer);
  }, [entrance, reducedMotion]);

  // The walk: the walk row while a new walk id is under way (never under reduced motion, which fades).
  const [arrivedId, setArrivedId] = useState<number | null>(walk?.id ?? null);
  const walking = !!walk && walk.id !== arrivedId && !reducedMotion && walk.ms > 0;
  useEffect(() => {
    if (!walk || walk.id === arrivedId) return;
    const timer = setTimeout(() => setArrivedId(walk.id), reducedMotion ? REDUCED_FADE_MS : Math.max(0, walk.ms));
    return () => clearTimeout(timer);
  }, [walk, arrivedId, reducedMotion]);

  const floatHearts = useCallback(
    (count: number, front = false) => {
      const fresh: Heart[] = heartSpread(count).map((spot) => ({ id: (heartIdRef.current += 1), ...spot, front }));
      setHearts((current) => [...current, ...fresh]);
      const ids = new Set(fresh.map((heart) => heart.id));
      later(HEART_LIFE_MS + (count - 1) * 70, () => setHearts((current) => current.filter((heart) => !ids.has(heart.id))));
    },
    [later],
  );

  // heartOnce: one heart per increment (never on mount), in front of the cat's face.
  const heartSeenRef = useRef(heartOnce);
  useEffect(() => {
    if (heartOnce === undefined || heartOnce === heartSeenRef.current) return;
    heartSeenRef.current = heartOnce;
    floatHearts(1, true);
  }, [heartOnce, floatHearts]);

  const endLoafLater = useCallback(() => {
    const left = Math.max(0, LOAF_MIN_MS - (Date.now() - loafSinceRef.current));
    later(left, () => {
      if (holdingRef.current || Date.now() - loafSinceRef.current < LOAF_MIN_MS - 5) return;
      setLoafing(false);
      // Three pets in a row: the cat grooms once before it rests (never under reduced motion).
      if (groomNextRef.current && !reducedMotion) {
        groomNextRef.current = false;
        setGrooming((value) => value + 1);
        const { frames, fps } = ANIMS.groom;
        later(Math.round((frames * 1000) / fps), () => setGrooming(0));
      }
    });
  }, [later, reducedMotion]);

  /** A pointerdown on the cat or its caption; `rect` is the box whose halves set the facing. */
  const petDown = (clientX: number, rect: DOMRect | null | undefined) => {
    if (!interactive) return;
    const now = Date.now();
    if (rect && rect.width > 0 && Number.isFinite(clientX)) setFace(clientX < rect.left + rect.width / 2 ? "left" : "right");
    const doubleTap = now - lastDownRef.current < DOUBLE_TAP_MS;
    lastDownRef.current = now;
    holdingRef.current = true;
    setPetted(true);
    setGrooming(0);
    if (sound) playHomeSound("purr");
    if (doubleTap && !reducedMotion) {
      setLoafing(false);
      setJumping((value) => value + 1);
      const { frames, fps } = ANIMS.jump;
      later(Math.round((frames * 1000) / fps), () => setJumping(0));
      return;
    }
    petTimesRef.current = [...petTimesRef.current.filter((at) => now - at < GROOM_WINDOW_MS), now];
    if (petTimesRef.current.length >= GROOM_PETS) {
      petTimesRef.current = [];
      groomNextRef.current = true;
    }
    loafSinceRef.current = now;
    setLoafing(true);
    if (!reducedMotion) {
      setSquash((value) => value + 1);
      floatHearts(3 + Math.floor(Math.random() * 3));
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => petDown(event.clientX, event.currentTarget.getBoundingClientRect());

  const release = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (!reducedMotion) setBounce((value) => value + 1);
    endLoafLater();
  };

  // A keyboard press (Enter or Space) pets once: a click without a pointerdown.
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!interactive || event.detail !== 0) return;
    setPetted(true);
    if (sound) playHomeSound("purr");
    loafSinceRef.current = Date.now();
    setLoafing(true);
    if (!reducedMotion) floatHearts(3);
    endLoafLater();
  };

  const rest: SpriteAnim = mode === "sit" ? "sit" : mode === "loaf" ? "loaf" : "idle";

  // Reduced motion: a new resting row cross-fades from the old one's frame 0 (120 ms), never on mount.
  const [fadeFrom, setFadeFrom] = useState<{ anim: SpriteAnim; id: number } | null>(null);
  const restSeenRef = useRef(rest);
  useEffect(() => {
    const previous = restSeenRef.current;
    if (previous === rest) return;
    restSeenRef.current = rest;
    if (!reducedMotion) return;
    const id = Date.now();
    setFadeFrom({ anim: previous, id });
    const timer = setTimeout(() => setFadeFrom((current) => (current?.id === id ? null : current)), REDUCED_FADE_MS);
    return () => clearTimeout(timer);
  }, [rest, reducedMotion]);
  const entranceAnim: SpriteAnim | null = reducedMotion
    ? null
    : entering === "jumpOut"
      ? "jump"
      : entering === "walkIn"
        ? "walk"
        : entering === "peek"
          ? "idle"
          : null;
  const pose: SpriteAnim = jumping
    ? "jump"
    : entranceAnim ?? (walking ? "walk" : loafing ? "loaf" : grooming ? "groom" : rest);
  const paused = !inView;
  const shownFace: "left" | "right" = walking && walk ? (walk.dx < 0 ? "left" : "right") : face;

  // The slow blink: sit frame 0, and every 4 s frames 1, 2, 1, 0 at the row's frame rate. It waits
  // while the cat is petted, entering or offscreen, and never runs under reduced motion.
  const blinking = blink && !reducedMotion && pose === "sit";
  const [blinkFrame, setBlinkFrame] = useState(0);
  useEffect(() => {
    if (!blinking || paused) return;
    const stepMs = Math.round(1000 / ANIMS.sit.fps);
    const steps: ReturnType<typeof setTimeout>[] = [];
    const cycle = setInterval(() => {
      setBlinkFrame(BLINK_FRAMES[0]);
      BLINK_FRAMES.slice(1).forEach((frame, index) => {
        steps.push(setTimeout(() => setBlinkFrame(frame), (index + 1) * stepMs));
      });
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(cycle);
      steps.forEach(clearTimeout);
      setBlinkFrame(0);
    };
  }, [blinking, paused]);
  const scaleClass = `${BASE_SCALE[scale.base]} ${scale.md ? MD_SCALE[scale.md] : ""}`;
  const entranceClass = entering === "none" ? "" : { jumpOut: "yc-jump-out", walkIn: "yc-walk-in", peek: "yc-peek" }[entering];
  const caption = petted ? labels.purrs : labels.tap;
  const hop = !reducedMotion && rest === "idle" && pose === "idle" && entering === "none" && !walk;

  const rootStyle = {
    "--yc-cell": `calc(${SHEET.cell}px * var(--s))`,
    width: "var(--yc-cell)",
    height: "var(--yc-cell)",
    // Feet on the box's bottom line: the cell's empty rows below the paws hang under it.
    marginBottom: `calc(${FEET_Y - SHEET.cell}px * var(--s))`,
    ...(walk
      ? {
          transform: `translateX(${Math.round(walk.dx)}px)`,
          transition: walking ? `transform ${walk.ms}ms linear` : undefined,
          animation: reducedMotion && walk.id !== arrivedId ? `yc-fade-in ${REDUCED_FADE_MS}ms linear both` : undefined,
        }
      : null),
  } as CSSProperties;

  let layerAnimation: CSSProperties | undefined;
  if (reducedMotion && entering !== "none") layerAnimation = { animation: `yc-fade-in ${REDUCED_FADE_MS}ms linear both` };
  // The jump keeps its class (and duration) but takes the cat's own arc, whose apex grows on md+.
  else if (entering === "jumpOut") layerAnimation = { animationName: "yc-pc-jump" };

  return (
    <div
      ref={rootRef}
      className={`relative shrink-0 ${scaleClass} [--yc-apex:-64px] [--yc-jx:-56px] md:[--yc-apex:-96px] md:[--yc-jx:-84px] ${paused ? "yc-paused" : ""}`}
      style={rootStyle}
      data-testid="yourcat-petcat"
      data-pose={pose}
      data-facing={shownFace}
      data-blink={blinking ? "true" : undefined}
      data-reduced={reducedMotion ? "true" : undefined}
      data-walk={walk ? (walking ? "walking" : "arrived") : undefined}
    >
      <style>{PET_CAT_CSS}</style>
      {/* The stepped oval shadow under the paws. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 20 4"
        shapeRendering="crispEdges"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 fill-tt-night-950/50"
        style={{ width: "calc(20px * var(--s))", height: "calc(4px * var(--s))", top: `calc(${FEET_Y - 2}px * var(--s))` }}
      >
        <rect x="4" y="0" width="12" height="1" />
        <rect x="1" y="1" width="18" height="2" />
        <rect x="4" y="3" width="12" height="1" />
      </svg>

      <div className={`absolute inset-0 ${entering === "peek" && !reducedMotion ? "overflow-hidden" : ""}`}>
        <div className={`absolute inset-0 ${entranceClass}`} style={layerAnimation}>
          <div className={`absolute inset-0 ${hop ? "yc-hop" : ""}`}>
            <button
              type="button"
              className="absolute inset-0 block min-h-11 min-w-11 cursor-pointer touch-manipulation select-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream disabled:cursor-default"
              aria-label={labels.pet}
              disabled={!interactive}
              onPointerDown={onPointerDown}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              onClick={onClick}
              onContextMenu={(event) => event.preventDefault()}
              data-testid="yourcat-petcat-button"
              data-name={name}
            >
              {/* Facing (instant), the squash press and the release bounce live on separate layers, so none cancels another. */}
              <span className="absolute inset-0 block" style={shownFace === "left" ? { transform: "scaleX(-1)" } : undefined}>
                <span key={`b-${bounce}`} className={`absolute inset-0 block origin-bottom ${bounce ? "yc-pc-bounce" : ""}`} data-bounce={bounce || undefined}>
                  <span key={squash} className={`absolute inset-0 block origin-bottom ${squash ? "yc-squash" : ""}`}>
                    {reducedMotion ? (
                      <>
                        <SheetLayer
                          key={`rest-${rest}`}
                          spriteImg={spriteImg}
                          anim={rest}
                          loop={false}
                          className="transition-opacity duration-[120ms] ease-linear"
                          style={{
                            opacity: loafing && rest !== "loaf" ? 0 : 1,
                            ...(fadeFrom ? { animation: `yc-fade-in ${REDUCED_FADE_MS}ms linear both` } : null),
                          }}
                        />
                        {rest !== "loaf" && (
                          <SheetLayer
                            spriteImg={spriteImg}
                            anim="loaf"
                            loop={false}
                            className="transition-opacity duration-[120ms] ease-linear"
                            style={{ opacity: loafing ? 1 : 0 }}
                          />
                        )}
                        {fadeFrom && (
                          <SheetLayer
                            key={`from-${fadeFrom.id}`}
                            spriteImg={spriteImg}
                            anim={fadeFrom.anim}
                            loop={false}
                            style={{ animation: `yc-fade-out ${REDUCED_FADE_MS}ms linear both` }}
                            className="pointer-events-none"
                          />
                        )}
                      </>
                    ) : (
                      <SheetLayer
                        key={`${pose}-${jumping}-${grooming}`}
                        spriteImg={spriteImg}
                        anim={pose}
                        loop={!blinking}
                        frame={blinking ? blinkFrame : 0}
                        iterations={pose === "jump" || pose === "groom" ? 1 : undefined}
                        frameMs={
                          entering === "jumpOut"
                            ? Math.round(ENTRANCE_MS.jumpOut / ANIMS.jump.frames)
                            : walking && walk
                              ? Math.round(walk.ms / ANIMS.walk.frames)
                              : undefined
                        }
                      />
                    )}
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {hearts.length > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 [--yc-rise:24px] md:[--yc-rise:36px]"
          style={{ top: "calc(8px * var(--s))" }}
        >
          {hearts.map((heart) => (
            <span
              key={heart.id}
              className="absolute block -translate-x-1/2"
              style={{
                // The meeting heart floats in front of the face (between the cat and whoever it faces).
                left: heart.front
                  ? `calc(${shownFace === "left" ? -1 : 1} * (${SHEET.cell / 2 - NOSE_X_FACING_LEFT}px * var(--s) + 8px))`
                  : `${heart.x}px`,
              }}
              data-testid="yourcat-heart"
              data-x={heart.front ? "front" : heart.x}
            >
              <span
                className={`block ${reducedMotion ? "" : "yc-pc-heart"}`}
                style={
                  {
                    "--yc-delay": `${heart.delay}ms`,
                    "--yc-sway": `${heart.sway}px`,
                    "--yc-dur": "600ms",
                    ...(reducedMotion ? { animation: `yc-heart-calm 600ms linear ${heart.delay}ms both` } : null),
                  } as CSSProperties
                }
              >
                <PixelHeart />
              </span>
            </span>
          ))}
        </span>
      )}

      {/* The caption: text-p5 in a 44 px box under the paws; pressing it pets the cat too. */}
      <p
        aria-live="polite"
        className={`absolute left-1/2 flex min-h-11 w-max max-w-[60vw] -translate-x-1/2 select-none items-center justify-center px-2 text-center text-p5 text-tt-lilac [text-shadow:0_1px_0_rgb(var(--tt-night-950)),0_0_6px_rgb(var(--tt-night-950))] ${
          interactive ? "cursor-pointer touch-manipulation" : "pointer-events-none"
        }`}
        style={{ top: `calc(${FEET_Y}px * var(--s) - 6px)` }}
        onPointerDown={interactive ? (event) => petDown(event.clientX, rootRef.current?.getBoundingClientRect()) : undefined}
        onPointerUp={interactive ? release : undefined}
        onPointerLeave={interactive ? release : undefined}
        onPointerCancel={interactive ? release : undefined}
        data-testid="yourcat-petcat-caption"
      >
        <span className="block truncate">{caption}</span>
      </p>
    </div>
  );
}
