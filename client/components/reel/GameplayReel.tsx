import { useReducedMotion } from "@/components/globe/useReducedMotion";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import reelManifest from "./reel-manifest.json";

/**
 * The landing gameplay reel (plan G7 "Landing reel"; decision #53: the Heist is in the reel).
 *
 * Clips are rendered by the deterministic capture driver (`client/e2e/capture/`) and listed in
 * `reel-manifest.json` next to this file, each tagged with the `lookVersion` it was captured in.
 *
 * Playback policy:
 * - lazy: no `src` until the reel scrolls near the viewport (IntersectionObserver); `preload="none"`;
 * - muted, looped, inline; it plays only while in view;
 * - a visible pause/play control under the video (WCAG 2.2.2 Pause, Stop, Hide), its label the
 *   only state signal (no `aria-pressed` on top of a changing label);
 * - under `prefers-reduced-motion: reduce` only the poster shows, and nothing moves until the
 *   viewer presses play;
 * - one tab per clip (a tablist with arrow-key navigation); each video has an aria label.
 *
 * Files are served from the site origin (`/reel/...`); the CDN upload is a deferred manual step.
 */

export interface ReelClip {
  id: string;
  /** Tab label. */
  label: string;
  /** One-line description, used as the video's accessible name. */
  title: string;
  /** Shown under the video. */
  caption: string;
  /** Site-relative paths under public/. */
  src: string;
  poster: string;
  width: number;
  height: number;
  durationMs: number;
  bytes: number;
  lookVersion: string;
}

export interface ReelManifest {
  schemaVersion: number;
  lookVersion: string;
  clips: ReelClip[];
}

export const REEL_MANIFEST = reelManifest as ReelManifest;

/** Max bytes per clip (plan G7). The capture driver enforces it; the component drops oversize clips. */
export const MAX_CLIP_BYTES = 1.5 * 1024 * 1024;

export function usableClips(manifest: ReelManifest = REEL_MANIFEST): ReelClip[] {
  return (manifest.clips ?? []).filter(
    (clip) => !!clip.src && !!clip.poster && clip.bytes > 0 && clip.bytes <= MAX_CLIP_BYTES,
  );
}

/** Whether there is anything to mount (the landing mounts the reel only when true). */
export const hasReelClips = usableClips().length > 0;

const OBSERVER_ROOT_MARGIN = "300px 0px";
const asset = (path: string) => (/^(https?:)?\//.test(path) ? path : `/${path}`);

export interface GameplayReelProps {
  /** Defaults to the generated manifest; tests pass their own. */
  clips?: ReelClip[];
  className?: string;
}

export function GameplayReel({ clips: clipsProp, className = "" }: GameplayReelProps) {
  const clips = clipsProp ?? usableClips();
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const [index, setIndex] = useState(0);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  // null: follow the motion preference; true/false: the viewer pressed pause or play.
  const [userPaused, setUserPaused] = useState<boolean | null>(null);

  const paused = userPaused ?? reducedMotion;
  const clip = clips[Math.min(index, clips.length - 1)];
  const playing = !!clip && near && inView && !paused;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNear(true);
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (!latest) return;
        if (latest.isIntersecting) setNear(true);
        setInView(latest.isIntersecting);
      },
      { rootMargin: OBSERVER_ROOT_MARGIN },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      const attempt = video.play();
      // Autoplay policy or a missing decoder can reject; the poster stays up.
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
    } else {
      video.pause();
    }
  }, [playing, index, near]);

  const select = useCallback(
    (next: number, focus = false) => {
      if (!clips.length) return;
      const wrapped = (next + clips.length) % clips.length;
      setIndex(wrapped);
      if (focus) tabRefs.current[wrapped]?.focus();
    },
    [clips.length],
  );

  if (!clip) return null;

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight") select(index + 1, true);
    else if (event.key === "ArrowLeft") select(index - 1, true);
    else if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(clips.length - 1, true);
    else return;
    event.preventDefault();
  };

  const panelId = `${baseId}-panel`;
  const showVideo = near && !(reducedMotion && userPaused !== false);

  return (
    <section
      ref={rootRef}
      aria-label="Gameplay reel"
      data-testid="gameplay-reel"
      data-look-version={clip.lookVersion}
      className={`relative w-full px-4 md:px-8 lg:px-16 py-10 md:py-14 ${className}`}
    >
      <div className="max-w-[1100px] mx-auto">
        <p className="font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-muted">Real gameplay</p>
        <h2 className="mt-1 font-primary font-bold uppercase leading-none text-p2 md:text-h5 lg:text-h4 text-tt-cream drop-shadow-lg">
          See it before you play
        </h2>

        <div role="tablist" aria-label="Game modes" className="mt-4 flex flex-wrap gap-2">
          {clips.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${c.id}`}
              aria-selected={i === index}
              aria-controls={panelId}
              tabIndex={i === index ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={onTabKey}
              className={`min-h-[44px] rounded-xl border-2 px-4 font-primary text-p5 uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 ${
                i === index
                  ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
                  : "border-tt-cream/60 bg-tt-night-800/80 text-tt-cream hover:border-tt-cream"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${clip.id}`}
          className="mt-4 rounded-2xl border-4 border-tt-cream/80 bg-tt-night-900 overflow-hidden"
        >
          <div className="relative w-full" style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
            {showVideo ? (
              <video
                key={clip.id}
                ref={videoRef}
                src={asset(clip.src)}
                poster={asset(clip.poster)}
                aria-label={clip.title}
                muted
                loop
                playsInline
                preload="none"
                className="absolute inset-0 h-full w-full object-cover pixelated"
                data-testid="gameplay-reel-video"
              />
            ) : (
              <img
                key={`${clip.id}-poster`}
                src={asset(clip.poster)}
                alt={clip.title}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover pixelated"
                data-testid="gameplay-reel-poster"
              />
            )}
          </div>
          {/* The control sits under the video, not on it, so it never reads as part of the game's
              own UI (task 6d review, finding 3). One state signal: the label (finding 7). */}
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="flex-1 text-p5 md:text-p4 text-tt-cream/90" data-testid="gameplay-reel-caption">
              {clip.caption}
            </p>
            <button
              type="button"
              onClick={() => setUserPaused(!paused)}
              aria-label={paused ? "Play gameplay video" : "Pause gameplay video"}
              data-testid="gameplay-reel-toggle"
              className="shrink-0 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border-2 border-tt-cream bg-tt-night-900/85 px-3 font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
            >
              <span aria-hidden className="text-p4 leading-none">
                {paused ? "▶" : "❚❚"}
              </span>
              <span>{paused ? "Play" : "Pause"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GameplayReel;
