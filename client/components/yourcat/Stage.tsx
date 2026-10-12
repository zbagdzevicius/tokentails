/**
 * The `/yourcat` stage (docs/plans/yourcat-polish.md §2.5, §3, §11): the landing's painted night sky,
 * the glowing altar cropped from the landing ground, and on md+ the night ruins foot plate, with the
 * frame standing on the altar's stone line. It stays mounted from S1 to S3 at a fixed height, so
 * nothing on the page moves when its contents change (no layout shift):
 * `h-[clamp(320px,44svh,400px)]` on phones, `md:h-[clamp(560px,66svh,620px)]` from md up.
 *
 * Slots: `frame` (centred, its legs on the stone line), `companion` (left of the frame, overlapping
 * its bottom-left by ~40 px on phones so 360 px fits, 20 on md+; or, with `companionSide="right"`, just
 * right of the cat), `cat` (right of the frame, overlapping its right
 * leg by ~30 px when shifted, 40 px on a centred phone frame so 390 px fits, 48 px on md+, 84 px for a
 * 6x cat on md+; a
 * `PetCat` puts its own paws on the line) and `overlay` (the whole stage, above everything; it lets
 * pointer events through, so an interactive overlay child sets `pointer-events-auto`). On phones
 * `shifted` moves the frame group 40 px left (transform only), so a cat on the right fits at 360 px.
 * The whole stage is the drop zone when `onDrop` is given. On phones the stage clips horizontally
 * (`overflow-x: clip`), so a cat's transparent sheet box never makes the page scroll sideways.
 *
 * The painting reads as the landing's full-bleed world (R1-03, R2-03). On phones the stage paints its
 * own sky (masked on all four sides) with six CSS fireflies; on xl it fills the first screen under the
 * header. From md up the sky is not the stage's:
 * `StudioSky` paints it behind the whole page as a 100svh full-bleed layer, like the landing hero,
 * with the landing's ruins-and-flowers side plates and 18 fireflies; the stage keeps the altar and the
 * night foot plate. Both skies use the warm `/yourcat/sky.webp` (the landing's `hero-bg`, 1600 px),
 * preloaded by the page, over a CSS gradient in the same colours (R2-10). Transform and opacity only;
 * under reduced motion the sky holds still and the fireflies pause.
 *
 * A companion that needs its own room (the friend view's empty frame, marked `data-yc-room`) moves
 * the frame group right instead of overlapping it: on phones by `max(0, 224px - 50vw)` (27 px at 390,
 * 44 px at 360), on md+ by 40 px; the cat slot overlaps the frame by the same extra amount, so the
 * cat keeps its place inside the stage (R1-11).
 */
import { useRef, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { EASE } from "./motion";

/**
 * The walkable stone line of `public/yourcat/altar-strip.webp`, as a fraction of the strip's height
 * from its bottom: just behind the centre of the lit rune disc, so the frame's legs stand on the disc
 * and its front half glows in front of them. Measured on the 1200 x 340 crop
 * (`cwebp -crop 442 881 1868 529 -resize 1200 340 -q 82 -alpha_q 90 -m 6` of
 * `/landing/hero-ground.webp`; the disc spans y 132 to 193, the line is y 153).
 */
export const ALTAR_SURFACE = 0.55;

/** The altar strip's aspect: 1200 x 340. */
export const ALTAR_ASPECT = 1200 / 340;

/**
 * Soft edges on all four sides: a horizontal and a vertical linear mask, intersected (R1-03). The
 * stage's own sky shows on phones only; from md up `StudioSky` paints the page.
 */
export const SKY_MASK =
  "[mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent),linear-gradient(to_bottom,transparent,#000_14%,#000_78%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in] [mask-repeat:no-repeat]";
export const ALTAR_MASK =
  "[mask-image:linear-gradient(to_right,transparent,#000_9%,#000_91%,transparent),linear-gradient(to_bottom,transparent,#000_28%,#000_86%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in] [mask-repeat:no-repeat]";

/** The warm painted sky (the landing's `hero-bg` at 1600 x 894, 31 KB); the page preloads it (R2-10). */
export const SKY_SRC = "/yourcat/sky.webp";
export const SKY_SIZE = Object.freeze({ width: 1600, height: 894 });

/**
 * The sky's colours as a CSS gradient, painted under the image so the first frame (and a failed
 * load) already reads as the sunset sky: sampled from `SKY_SRC` at 2, 15, 30, 42, 50, 56, 62, 70, 80
 * and 95 % of its height, with the sun's glow at the horizon.
 */
export const SKY_FALLBACK =
  "radial-gradient(ellipse 38% 16% at 50% 57%, rgb(252 190 118 / .85), rgb(252 190 118 / 0)), linear-gradient(to bottom, #0e1030 2%, #1f1d49 15%, #2c2459 30%, #613969 42%, #aa5b69 50%, #d98268 56%, #997b7b 62%, #5d5a73 70%, #2b3759 80%, #212b48 95%)";

/**
 * The landing hero's side plates (ruins and flowers), cropped from `/landing/hero-cat-with-ground.webp`
 * (2752 x 1536) without the altar or the cat: `cwebp -crop 0 0 640 1536 -resize 0 1000 -q 80` (left)
 * and `-crop 2140 0 612 1536` (right). md+ only (a `<picture>` source), never fetched on phones.
 */
export const SIDE_PLATES = Object.freeze({
  left: Object.freeze({ src: "/yourcat/plate-left.webp", width: 417, height: 1000 }),
  right: Object.freeze({ src: "/yourcat/plate-right.webp", width: 399, height: 1000 }),
});

/** The plates fade toward the studio and at their cropped top edge (no hard line in the sky). */
export const PLATE_MASK = Object.freeze({
  left: "[mask-image:linear-gradient(to_right,#000_60%,transparent),linear-gradient(to_bottom,transparent,#000_22%)] [mask-composite:intersect] [-webkit-mask-composite:source-in] [mask-repeat:no-repeat]",
  right: "[mask-image:linear-gradient(to_left,#000_60%,transparent),linear-gradient(to_bottom,transparent,#000_22%)] [mask-composite:intersect] [-webkit-mask-composite:source-in] [mask-repeat:no-repeat]",
});

export interface Firefly {
  x: number;
  y: number;
  size: number;
  dx: number;
  dy: number;
  dur: number;
  delay: number;
}

/**
 * The stage's fireflies on phones (the landing's `Fireflies`, at low density and laid out by hand so
 * the server and the client agree): left/top in % of the sky, size in px, drift in px, duration and
 * delay in s.
 */
export const STAGE_FIREFLIES: ReadonlyArray<Firefly> = Object.freeze([
  { x: 9, y: 58, size: 4, dx: 14, dy: -18, dur: 11, delay: 0 },
  { x: 22, y: 34, size: 3, dx: -10, dy: -12, dur: 14, delay: 2.5 },
  { x: 84, y: 44, size: 4, dx: -16, dy: -10, dur: 12, delay: 1.2 },
  { x: 92, y: 66, size: 3, dx: 8, dy: -20, dur: 16, delay: 4 },
  { x: 68, y: 22, size: 3, dx: 12, dy: 10, dur: 18, delay: 3.1 },
  { x: 36, y: 16, size: 3, dx: -14, dy: 8, dur: 15, delay: 5.2 },
]);

/** The page sky's fireflies on md+ (~18, R2-03): in % of the 100svh layer, denser over the plates. */
export const PAGE_FIREFLIES: ReadonlyArray<Firefly> = Object.freeze([
  { x: 4, y: 62, size: 4, dx: 16, dy: -18, dur: 12, delay: 0 },
  { x: 9, y: 38, size: 3, dx: -10, dy: -14, dur: 15, delay: 2.2 },
  { x: 13, y: 78, size: 4, dx: 12, dy: -16, dur: 11, delay: 4.6 },
  { x: 17, y: 52, size: 3, dx: 14, dy: 10, dur: 17, delay: 1.1 },
  { x: 21, y: 24, size: 3, dx: -12, dy: 12, dur: 16, delay: 6.3 },
  { x: 27, y: 68, size: 4, dx: -14, dy: -12, dur: 13, delay: 3.4 },
  { x: 33, y: 14, size: 3, dx: 10, dy: 8, dur: 18, delay: 5.1 },
  { x: 41, y: 33, size: 3, dx: -16, dy: -8, dur: 14, delay: 0.7 },
  { x: 50, y: 20, size: 3, dx: 12, dy: 12, dur: 19, delay: 7.2 },
  { x: 58, y: 42, size: 3, dx: 14, dy: -10, dur: 15, delay: 2.9 },
  { x: 64, y: 12, size: 3, dx: -10, dy: 10, dur: 17, delay: 4.1 },
  { x: 71, y: 28, size: 3, dx: 12, dy: -14, dur: 16, delay: 6.8 },
  { x: 78, y: 70, size: 4, dx: -12, dy: -18, dur: 12, delay: 1.6 },
  { x: 83, y: 46, size: 3, dx: 16, dy: 8, dur: 14, delay: 3.8 },
  { x: 87, y: 18, size: 3, dx: -14, dy: 12, dur: 18, delay: 5.6 },
  { x: 91, y: 58, size: 4, dx: -16, dy: -14, dur: 13, delay: 0.4 },
  { x: 95, y: 34, size: 3, dx: -10, dy: 14, dur: 16, delay: 2.4 },
  { x: 97, y: 80, size: 4, dx: -12, dy: -16, dur: 11, delay: 4.9 },
]);

function Fireflies({ flies, reducedMotion, testId }: { flies: ReadonlyArray<Firefly>; reducedMotion: boolean; testId: string }) {
  return (
    <div className="absolute inset-0" data-testid={testId} data-static={reducedMotion ? "true" : undefined}>
      {flies.map((fly, index) => (
        <span
          key={index}
          className="yc-firefly"
          style={
            {
              left: `${fly.x}%`,
              top: `${fly.y}%`,
              "--yc-fly-size": `${fly.size}px`,
              "--yc-fly-dx": `${fly.dx}px`,
              "--yc-fly-dy": `${fly.dy}px`,
              "--yc-dur": `${fly.dur}s`,
              "--yc-delay": `${fly.delay}s`,
              animationPlayState: reducedMotion ? "paused" : undefined,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * The sky picture. The page preloads it (R2-10), so it is fetched at the default priority, never
 * `fetchpriority="low"`; the layer under it paints `SKY_FALLBACK` until it decodes.
 */
function SkyImage({ drift = false, reducedMotion, testId }: { drift?: boolean; reducedMotion: boolean; testId: string }) {
  return (
    <img
      src={SKY_SRC}
      alt=""
      width={SKY_SIZE.width}
      height={SKY_SIZE.height}
      decoding="async"
      draggable={false}
      className={`pixelated absolute inset-x-0 -top-[6%] h-[112%] w-full object-cover ${drift && !reducedMotion ? "animate-hoverSlow motion-reduce:animate-none" : ""}`}
      data-testid={testId}
    />
  );
}

/** A 1 x 1 transparent GIF: what a side plate's `<img>` shows below md, so phones never fetch a plate. */
export const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * One side plate. It is the md+ LCP candidate (the biggest painted box above the fold), so it is
 * eager, not lazy: a `<picture>` whose md+ `<source>` is the plate and whose `<img>` is a blank pixel,
 * so the preload scanner fetches it at once on md+ and phones (where the layer is hidden) never do.
 */
function SidePlate({ side }: { side: "left" | "right" }) {
  const plate = SIDE_PLATES[side];
  const place = side === "left" ? "left-0 object-right" : "right-0 object-left";
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={plate.src} width={plate.width} height={plate.height} />
      <img
        src={BLANK_PIXEL}
        alt=""
        width={plate.width}
        height={plate.height}
        decoding="async"
        draggable={false}
        className={`pixelated absolute bottom-0 h-[74%] w-auto max-w-[24vw] object-cover ${place} ${PLATE_MASK[side]}`}
        data-testid={`yourcat-page-plate-${side}`}
      />
    </picture>
  );
}

/** The page sky's height: one screen, and never shorter than the stacked md layout's stage bottom. */
export const STUDIO_SKY_HEIGHT = "h-[max(100svh,860px)]";

/**
 * From md up: the painted world behind the whole studio, full-bleed like the landing hero
 * (`index.tsx`): the warm sky over its CSS gradient, the ruins-and-flowers side plates (md+ only), 18
 * fireflies and the landing's fade into the night page. The page renders it first inside its
 * `relative` wrapper, and the studio grid after it is `relative`, so the grid paints on top without a
 * new stacking context. Transform and opacity only; under reduced motion the sky holds still and the
 * fireflies pause. Hidden on phones, where the stage paints its own sky.
 */
export function StudioSky({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 hidden overflow-hidden md:block ${STUDIO_SKY_HEIGHT}`}
      style={{ backgroundImage: SKY_FALLBACK }}
      data-testid="yourcat-page-sky"
    >
      <SkyImage drift reducedMotion={reducedMotion} testId="yourcat-page-sky-image" />
      <SidePlate side="left" />
      <SidePlate side="right" />
      <Fireflies flies={PAGE_FIREFLIES} reducedMotion={reducedMotion} testId="yourcat-page-fireflies" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-tt-night-900" data-testid="yourcat-page-sky-fade" />
    </div>
  );
}

/** The marker a companion sets when it needs its own room left of the frame (the friend view). */
export const COMPANION_ROOM_ATTR = "data-yc-room";

/**
 * Fixed stage heights (§3); the tests pin them. On the xl studio the stage also fills the first
 * screen under the 104 px header (R2-03), so the altar stands at the bottom of the painting with no
 * empty night band under it; the height still depends only on the viewport, never on the content.
 */
export const STAGE_HEIGHT_CLASS = "h-[clamp(320px,44svh,400px)] md:h-[clamp(560px,66svh,620px)] xl:min-h-[calc(100svh-104px)]";

/**
 * The room a marked companion gets (R1-11), as `:has()` variants so the page needs no new prop: the
 * frame group moves right, the companion stands a gap away from the frame (6 px on phones, 24 on
 * md+) instead of overlapping it, and the cat overlaps the frame by the same extra amount.
 */
export const ROOM_SHIFT =
  "group/yc max-md:has-[[data-yc-room]]:translate-x-[max(0px,calc(224px_-_50vw))] md:has-[[data-yc-room]]:translate-x-10";
const ROOM_COMPANION = "group-has-[[data-yc-room]]/yc:mr-1.5 md:group-has-[[data-yc-room]]/yc:mr-6";
const ROOM_CAT =
  "max-md:group-has-[[data-yc-room]]/yc:-ml-[calc(40px_+_max(0px,calc(224px_-_50vw)))] md:group-has-[[data-yc-room]]/yc:-ml-[88px]";

/**
 * The cat's spot at 6x on md+ (R2-05): a 288 px sprite box whose painted cat starts 72 px in (sheet
 * columns 12 to 36 at rest). The slot overlaps the frame by 84 px instead of 48, so the cat stands
 * 12 px over the frame's right leg ("just stepped out") and even its widest frame (the walk row,
 * mirrored: columns 8 to 39) stays clear of the xl column-2 panel at 1280 and 1440 (e2e "the cat
 * never overlaps column 2"). Keyed on `PetCat`'s md scale class `md:[--s:6]` (pinned in the stage
 * test), so no prop is needed.
 */
export const CAT_SPOT_MD6 = "md:[&:has([class~='md:[--s:6]'])]:-ml-[84px]";

export interface StageProps {
  frame: ReactNode;
  companion?: ReactNode;
  cat?: ReactNode;
  overlay?: ReactNode;
  /**
   * Where the companion stands: `left` of the frame (the default: the shelter frame, the example cat,
   * the friend view's empty frame) or `right`, just after the cat, so the two face each other on the
   * altar (for the meeting beat). The cat keeps its spot either way.
   */
  companionSide?: "left" | "right";
  shifted?: boolean;
  reducedMotion: boolean;
  onDrop?(file: File): void;
  onDragState?(over: boolean): void;
  className?: string;
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types as ArrayLike<string>).includes("Files");
}

export function Stage({ frame, companion, cat, overlay, companionSide = "left", shifted = false, reducedMotion, onDrop, onDragState, className }: StageProps) {
  const depthRef = useRef(0);
  const dropZone = typeof onDrop === "function";

  const setOver = (over: boolean) => onDragState?.(over);
  const right = companionSide === "right";
  // z-10: the cat walks in front of the frame (the meeting beat), so it stays above the frame's own
  // z-indexed layers (photo badge, labels) and stays pettable; the overlay (z-20) is above it.
  const catSpot = `absolute bottom-0 left-full z-10 flex items-end md:-ml-12 ${CAT_SPOT_MD6} ${shifted ? "-ml-[30px]" : "-ml-10"} ${ROOM_CAT}`;

  const dragHandlers = dropZone
    ? {
        onDragEnter: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          depthRef.current += 1;
          if (depthRef.current === 1) setOver(true);
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          depthRef.current = Math.max(0, depthRef.current - 1);
          if (depthRef.current === 0) setOver(false);
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          depthRef.current = 0;
          setOver(false);
          const file = event.dataTransfer?.files?.[0];
          if (file) onDrop?.(file);
        },
      }
    : {};

  return (
    <div
      className={`relative w-full max-md:overflow-x-clip ${STAGE_HEIGHT_CLASS} ${className ?? ""}`}
      data-testid="yourcat-stage"
      data-shifted={shifted ? "true" : undefined}
      data-drop-zone={dropZone ? "true" : undefined}
      {...dragHandlers}
    >
      {/* Painted backdrop: decorative, never in the accessibility tree. The sky is the phones' own
          (from md up `StudioSky` paints the page); the altar and the foot stay inside the stage. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 max-md:overflow-hidden" data-testid="yourcat-stage-art">
        <div className={`absolute inset-0 md:hidden ${SKY_MASK}`} style={{ backgroundImage: SKY_FALLBACK }} data-testid="yourcat-stage-sky-layer">
          <SkyImage reducedMotion={reducedMotion} testId="yourcat-stage-sky" />
          <Fireflies flies={STAGE_FIREFLIES} reducedMotion={reducedMotion} testId="yourcat-stage-fireflies" />
        </div>
        <img
          src="/landing/plates/hub-night-near-v1.png"
          alt=""
          width={1376}
          height={384}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="pixelated absolute inset-x-0 bottom-[12%] hidden aspect-[1376/384] w-full object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent),linear-gradient(to_bottom,transparent,#000_45%)] [mask-composite:intersect] [-webkit-mask-composite:source-in] md:block"
          data-testid="yourcat-stage-foot"
        />
        <div className="absolute inset-x-0 bottom-0 aspect-[1200/340]" data-testid="yourcat-stage-altar">
          <img
            src="/yourcat/altar-strip.webp"
            alt=""
            width={1200}
            height={340}
            decoding="async"
            draggable={false}
            className={`pixelated absolute inset-0 h-full w-full ${ALTAR_MASK}`}
          />
        </div>
      </div>

      {/* The actors, standing on the altar's stone line. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 aspect-[1200/340]" data-testid="yourcat-stage-ground">
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: `${ALTAR_SURFACE * 100}%` }} data-testid="yourcat-stage-surface">
          <div
            className={`pointer-events-auto relative flex items-end ${shifted ? "max-md:-translate-x-10" : ""} ${ROOM_SHIFT} ${
              reducedMotion ? "" : "transition-transform duration-[320ms]"
            }`}
            style={reducedMotion ? undefined : { transitionTimingFunction: EASE.spring }}
            data-testid="yourcat-stage-group"
          >
            <div className="relative" data-testid="yourcat-slot-frame">
              {frame}
            </div>
            {companion && !right && (
              <div className={`absolute bottom-0 right-full -mr-10 flex items-end md:-mr-5 ${ROOM_COMPANION}`} data-testid="yourcat-slot-companion">
                {companion}
              </div>
            )}
            {cat && !right && (
              <div className={catSpot} data-testid="yourcat-slot-cat">
                {cat}
              </div>
            )}
            {right && (cat || companion) && (
              <div className={`${catSpot} gap-1 md:gap-3`} data-testid="yourcat-slot-right">
                {cat && (
                  <div className="flex items-end" data-testid="yourcat-slot-cat">
                    {cat}
                  </div>
                )}
                {companion && (
                  <div className="flex items-end" data-testid="yourcat-slot-companion" data-side="right">
                    {companion}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {overlay && (
        <div className="pointer-events-none absolute inset-0 z-20" data-testid="yourcat-slot-overlay">
          {overlay}
        </div>
      )}
    </div>
  );
}
