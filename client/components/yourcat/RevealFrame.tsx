import { useEffect, useRef, useState } from "react";
import {
  CROSSFADE_MS,
  LATE_BLOCKS,
  LATE_STEP_MS,
  loadRevealImage,
  REDUCED_FADE_MS,
  REVEAL_BLOCKS,
  REVEAL_STEP_MS,
  runPixelate,
} from "./pixelateReveal";
import { SpriteStill } from "./ui";

export interface RevealFrameProps {
  /** The visitor's photo (object URL); present only for a fresh upload. */
  photoUrl: string | null;
  /** The pixel portrait when it is ready. */
  avatarUrl: string | null;
  spriteImg: string;
  /** Run the first-time reveal (not for a returning visitor or a manual cat). */
  animate: boolean;
  reducedMotion: boolean;
  label: string;
}

const CANVAS_PX = 384;

/**
 * The result in its gold frame. First time: the photo is pixelated in steps (32 → 16 → 8 px, about
 * 200 ms each), cross-fades (200 ms) into the pixel portrait if it is ready, else into the sprite's
 * frame 0 at 8x. The frame itself lands first (scale 0.96 → 1, ease-out back, one frame after mount),
 * so the pixelate and the cross-fade play inside a visible frame. A portrait that arrives later gets
 * its own pixelate-in from 16 px over 300 ms. Reduced motion: 120 ms cross-fades, nothing moves.
 */
export function RevealFrame({ photoUrl, avatarUrl, spriteImg, animate, reducedMotion, label }: RevealFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<"pixelate" | "fade" | "done">(animate && photoUrl ? "pixelate" : "done");
  const [landed, setLanded] = useState(!animate);
  const [lateReveal, setLateReveal] = useState(false);
  const shownAvatar = useRef<string | null>(avatarUrl);

  // The first-time reveal. The frame lands at once (after the first paint, so its transition runs);
  // the pixelate and the cross-fade then play inside it.
  useEffect(() => {
    if (!animate) return;
    const land = setTimeout(() => setLanded(true), 16);
    if (!photoUrl) return () => clearTimeout(land);
    let cancelled = false;
    const fadeMs = reducedMotion ? REDUCED_FADE_MS : CROSSFADE_MS;
    void (async () => {
      if (!reducedMotion) {
        const image = await loadRevealImage(photoUrl);
        const canvas = canvasRef.current;
        if (image && canvas && !cancelled) {
          try {
            await runPixelate(canvas, image, REVEAL_BLOCKS, REVEAL_STEP_MS, () => cancelled);
          } catch {
            // No 2D canvas (very old browser or a test DOM): straight to the fade.
          }
        }
      }
      if (cancelled) return;
      setPhase("fade");
      setTimeout(() => {
        if (!cancelled) setPhase("done");
      }, fadeMs);
    })();
    return () => {
      cancelled = true;
      clearTimeout(land);
    };
    // The reveal runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A pixel portrait that arrives after the reveal gets its own small pixelate-in.
  useEffect(() => {
    if (!avatarUrl || shownAvatar.current === avatarUrl || phase !== "done") return;
    shownAvatar.current = avatarUrl;
    let cancelled = false;
    setLateReveal(true);
    void (async () => {
      if (!reducedMotion) {
        const image = await loadRevealImage(avatarUrl);
        const canvas = canvasRef.current;
        if (image && canvas && !cancelled) {
          try {
            await runPixelate(canvas, image, LATE_BLOCKS, LATE_STEP_MS, () => cancelled);
          } catch {
            // Straight to the image.
          }
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, REDUCED_FADE_MS));
      }
      if (!cancelled) setLateReveal(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarUrl, phase, reducedMotion]);

  const showCanvas = phase === "pixelate" || (lateReveal && !reducedMotion);
  const resultVisible = phase !== "pixelate" && !(lateReveal && !reducedMotion);
  const fadeStyle = { transition: `opacity ${reducedMotion ? REDUCED_FADE_MS : CROSSFADE_MS}ms ease-out` };

  return (
    <div
      className="yc-land relative aspect-square w-full max-w-[384px] overflow-hidden rounded-md border-8 border-tt-gold-500 bg-tt-night-800"
      data-in={landed || reducedMotion ? "true" : "false"}
      style={reducedMotion ? { transform: "none", opacity: 1 } : undefined}
      data-testid="yourcat-frame"
    >
      {photoUrl && animate && phase !== "done" && (
        <img
          src={photoUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ ...fadeStyle, opacity: phase === "fade" ? 0 : reducedMotion ? 1 : 0 }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_PX}
        height={CANVAS_PX}
        aria-hidden="true"
        className="pixelated absolute inset-0 h-full w-full"
        style={{ opacity: showCanvas ? 1 : 0 }}
      />
      <div className="absolute inset-0 flex items-center justify-center" style={{ ...fadeStyle, opacity: resultVisible ? 1 : 0 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={label} className="pixelated h-full w-full object-cover" data-testid="yourcat-avatar" />
        ) : (
          <SpriteStill spriteImg={spriteImg} scale="fill" label={label} />
        )}
      </div>
    </div>
  );
}
