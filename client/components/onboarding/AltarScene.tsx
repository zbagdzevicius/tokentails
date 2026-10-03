import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLatest } from "./useLatest";

/**
 * The landing's altar (plan G3 step 1-2), rebuilt from the same layers the landing hero uses:
 * the night sky, the altar with its orbs, and (only while "Your cat awaits…" plays) the painted
 * tabby. All layers share one 2752x1536 canvas, so they stay aligned at any viewport.
 *
 * The art box covers the stage like `object-fit: cover`, but anchored so the altar's centre sits
 * at `anchorY` of the stage height: on phones the panel below takes the lower half, and the altar
 * must stay visible above it. Children are positioned in art-box coordinates through `place()`.
 */
export const ALTAR_ART = {
  sky: cdnFile("landing/hero-bg.webp"),
  altar: cdnFile("landing/hero-grounds.webp"),
  paintedCat: cdnFile("landing/hero-cat.webp"),
  title: cdnFile("landing/hero-await.webp"),
} as const;

const ART_W = 2752;
const ART_H = 1536;
const ART_ASPECT = ART_W / ART_H;

/** Where the painted tabby stands on the altar, as fractions of the art box. */
export const ALTAR_SPOT = Object.freeze({
  /** Horizontal centre of the cat. */
  x: 0.517,
  /** The cat's feet (above its painted shadow). */
  feet: 0.79,
  /** Painted cat height without the shadow, as a fraction of the art height. */
  catHeight: 0.255,
});

export interface AltarBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Cover-fit of the art in a `width` x `height` stage, with the altar spot at `anchorY` of the
 * stage height when the art is taller than the stage (clamped so no gap shows above the art).
 */
export function altarBox(width: number, height: number, anchorY = 0.86): AltarBox {
  const boxW = Math.max(width, height * ART_ASPECT);
  const boxH = boxW / ART_ASPECT;
  const left = (width - boxW) / 2;
  const wanted = height * anchorY - ALTAR_SPOT.feet * boxH;
  // Never leave a gap above the art; below it, the stage's night fill shows (under the panel).
  const top = Math.min(0, Math.max(height - boxH, wanted));
  return { left, top, width: boxW, height: boxH };
}

interface AltarSceneProps {
  /** Show the painted tabby (step "Your cat awaits…"). */
  paintedCat?: boolean;
  /** 0..1: the painted cat's opacity (the crossfade to pixel Scout). */
  paintedOpacity?: number;
  /** Dim the art behind a panel. */
  dim?: boolean;
  anchorY?: number;
  reducedMotion?: boolean;
  /** Called once the sky and altar images have loaded (or failed). */
  onReady?: () => void;
  /** Rendered inside the art box; receives the box size for placement. */
  children?: (box: AltarBox) => ReactNode;
  className?: string;
}

export const AltarScene = ({
  paintedCat,
  paintedOpacity = 1,
  dim,
  anchorY,
  reducedMotion,
  onReady,
  children,
  className,
}: AltarSceneProps) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<AltarBox | null>(null);
  const loaded = useRef(0);
  const readyRef = useLatest(onReady);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setBox(altarBox(rect.width, rect.height, anchorY));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchorY]);

  const layerLoaded = () => {
    loaded.current += 1;
    if (loaded.current === 2) readyRef.current?.();
  };

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      data-testid="altar-scene"
      className={clsx("absolute inset-0 overflow-hidden bg-tt-night-900", className)}
    >
      <div
        className="absolute"
        style={
          box
            ? { left: box.left, top: box.top, width: box.width, height: box.height }
            : { inset: 0 }
        }
      >
        <img
          src={ALTAR_ART.sky}
          alt=""
          draggable={false}
          onLoad={layerLoaded}
          onError={layerLoaded}
          className={clsx(
            "pixelated absolute inset-0 h-full w-full object-cover",
            !reducedMotion && "animate-hoverSlow",
          )}
        />
        <img
          src={ALTAR_ART.altar}
          alt=""
          draggable={false}
          onLoad={layerLoaded}
          onError={layerLoaded}
          className="pixelated absolute inset-0 h-full w-full object-cover"
        />
        {paintedCat && (
          <img
            src={ALTAR_ART.paintedCat}
            alt=""
            draggable={false}
            data-testid="altar-painted-cat"
            className={clsx(
              "pixelated absolute inset-0 h-full w-full object-cover",
              reducedMotion ? "transition-none" : "transition-opacity duration-700 ease-out",
            )}
            style={{ opacity: paintedOpacity }}
          />
        )}
        {box && children?.(box)}
      </div>
      {/* The glow of the altar spills onto the panel, and the panel edge fades into night. */}
      <div
        className={clsx(
          "pointer-events-none absolute inset-0 transition-colors duration-500",
          dim ? "bg-tt-night-950/45" : "bg-transparent",
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-tt-night-900" />
    </div>
  );
};

/**
 * CSS for a pixel sprite of `scale` standing on the altar spot. The 48 px frames put the cat's feet
 * on row `feetRow` and its centre on column 24.5.
 */
export function altarSpriteStyle(box: AltarBox, scale: number, feetRow = 37) {
  const size = 48 * scale;
  return {
    position: "absolute" as const,
    left: Math.round(ALTAR_SPOT.x * box.width - 24.5 * scale),
    top: Math.round(ALTAR_SPOT.feet * box.height - feetRow * scale),
    width: size,
    height: size,
  };
}

/** The integer scale at which a pixel cat roughly matches the painted tabby's height. */
export function altarSpriteScale(box: AltarBox, catRows = 24, max = 8, min = 2): number {
  const target = ALTAR_SPOT.catHeight * box.height * 0.9;
  return Math.max(min, Math.min(max, Math.floor(target / catRows)));
}
