import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import { playHomeSound } from "@/components/home/homeSfx";
import { trackEvent } from "@/components/GoogleTagManager";
import type { YourcatPortraitStatus, YourcatStatusView, YourcatView } from "@/models/yourcat";
import Link from "next/link";
import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BODY, HEADLINE, Headline, NIGHT_PILL, PANEL, PrimaryAction } from "./brand";
import { Burst } from "./Burst";
import { S6 } from "./copy";
import { Frame } from "./Frame";
import { saveRemoteImage } from "./share";
import { framePosition, SHEET } from "./spriteSheet";
import { InSlot } from "./studio";

export const PAID_SEEN_PREFIX = "tt.yourcat.paid.";

/**
 * The paid screen's frame (polish spec S6): the inner box is 2:3, 128 x 192 on phones and 256 x 384
 * from md up. The painting-state avatar sits centred on the cream mat at 96 px / 192 px (1 or 2 px per
 * avatar cell), quantised to an eighth of its 96 cells.
 */
export const PAID_FRAME_INNER = Object.freeze({ w: 128, h: 192, mdW: 256, mdH: 384 });
export const PAID_QUANTISE_CELLS = 12;
/** The veil wipe (std easing) and its reduced-motion fade, in ms. */
export const PAID_WIPE_MS = 900;
export const PAID_FADE_MS = 300;
export const PAID_BURST = 12;
/** The paw pulse: one cycle every 2 s, four cycles, then still (M9). */
export const PAW_PULSE = Object.freeze({ periodMs: 2000, cycles: 4 });

/** Records reported on this page when the browser gives no storage at all. */
const seenWithoutStorage = new Set<string>();

/**
 * True the first time this record's paid order is seen in this browser: a `localStorage` dedupe, so
 * a second tab or a reload of the paid return does not report it again (one paid portrait per record;
 * a repeat checkout answers 409). Without `localStorage` (private mode, blocked site data) it falls
 * back to this tab's `sessionStorage`, then to this page.
 */
export function firstPaidSighting(yourcatId: string): boolean {
  const key = `${PAID_SEEN_PREFIX}${yourcatId}`;
  for (const read of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const storage = read();
      if (storage.getItem(key)) return false;
      storage.setItem(key, "1");
      return true;
    } catch {
      // This storage is missing or refuses writes: try the next one.
    }
  }
  if (seenWithoutStorage.has(key)) return false;
  seenWithoutStorage.add(key);
  return true;
}

// ---- the frame contents ------------------------------------------------------------------------

/** The pixel avatar drawn once onto a 12 x 12 canvas and shown pixelated (the "still painting" look). */
function QuantisedAvatar({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof Image === "undefined") return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const image = new Image();
    image.decoding = "async";
    let live = true;
    image.onload = () => {
      if (!live || !ctx) return;
      try {
        ctx.imageSmoothingEnabled = true;
        ctx.clearRect(0, 0, PAID_QUANTISE_CELLS, PAID_QUANTISE_CELLS);
        ctx.drawImage(image, 0, 0, PAID_QUANTISE_CELLS, PAID_QUANTISE_CELLS);
      } catch {
        // A blocked draw leaves the cream mat, which still reads as "painting".
      }
    };
    image.src = src;
    return () => {
      live = false;
      image.onload = null;
    };
  }, [src]);
  return (
    <canvas
      ref={canvasRef}
      width={PAID_QUANTISE_CELLS}
      height={PAID_QUANTISE_CELLS}
      aria-hidden="true"
      className="pixelated block h-24 w-24 md:h-48 md:w-48"
      style={{ imageRendering: "pixelated" }}
      data-testid="yourcat-paid-quantised"
    />
  );
}

/** Idle frame 0 of the sprite at 2x on phones and 4x from md up (integer scales only). */
function SpriteFrame({ spriteImg }: { spriteImg: string }) {
  const style = (scale: number): CSSProperties => ({
    width: SHEET.cell * scale,
    height: SHEET.cell * scale,
    backgroundImage: `url("${spriteImg}")`,
    backgroundSize: `${SHEET.width * scale}px ${SHEET.height * scale}px`,
    backgroundPosition: framePosition("idle", 0, scale),
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  });
  return (
    <>
      <span aria-hidden="true" className="pixelated block md:hidden" style={style(2)} data-testid="yourcat-paid-sprite" />
      <span aria-hidden="true" className="pixelated hidden md:block" style={style(4)} />
    </>
  );
}

/** Where the paid frame is: veiled while painting, wiping the veil away, or hung. */
export type PaidPhase = "painting" | "revealing" | "ready";

export interface PaidFrameContentProps {
  avatarUrl: string | null;
  spriteImg: string;
  portraitUrl: string | null;
  status: YourcatPortraitStatus;
  reducedMotion: boolean;
  /**
   * The visitor's cat on the altar beside the frame (the stage's `cat` slot, as on S3), drawn for the
   * current phase: the page sits it while painting and stands it facing the frame once `ready`.
   */
  renderCat?(phase: PaidPhase): ReactNode;
}

/**
 * What the stage frame holds on the paid screen (polish spec S6, §11). While painting: the pixel
 * avatar (else the sprite) on a cream mat, quantised, under a 30% cream veil with "Painting…". When
 * the poll says ready: the veiled layer wipes away top to bottom (clip-path, 900 ms std) over the
 * painted portrait (object-cover, smoothing on); at the end of the wipe, one 12-pixel burst and one
 * purr, as the cat (`renderCat("ready")`) stands and faces the frame. A page that opens already ready
 * shows the portrait at once, with no burst or purr. Reduced motion: the layer fades out in 300 ms,
 * then the purr, no burst. It fills the parent inner box (`PAID_FRAME_INNER`).
 */
export function PaidFrameContent({ avatarUrl, spriteImg, portraitUrl, status, reducedMotion, renderCat }: PaidFrameContentProps) {
  const ready = status === "ready" && !!portraitUrl;
  const [phase, setPhase] = useState<PaidPhase>(ready ? "ready" : "painting");
  const [burst, setBurst] = useState(false);
  const purred = useRef(false);
  const revealedRef = useRef(false);

  // The end of the wipe (or the reduced-motion fade): the burst and the purr, once per page.
  useEffect(() => {
    if (phase === "revealing") revealedRef.current = true;
    if (phase !== "ready" || !revealedRef.current || purred.current) return;
    purred.current = true;
    playHomeSound("purr");
    if (!reducedMotion) setBurst(true);
    // `reducedMotion` is read at the end of the wipe, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (!ready) {
      setPhase("painting");
      return;
    }
    if (phase !== "painting") return;
    // It turned ready on this page (the poll): reveal it.
    setPhase("revealing");
    // Ends the reveal even where `animationend` never fires (no styles, a background tab).
    const timer = setTimeout(() => setPhase("ready"), (reducedMotion ? PAID_FADE_MS : PAID_WIPE_MS) + 100);
    return () => clearTimeout(timer);
    // `phase` is read, not tracked: the reveal starts on the change to ready only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reducedMotion]);

  const painting = (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-tt-cream ${phase === "revealing" ? "yc-wipe" : ""}`}
      style={phase === "revealing" && reducedMotion ? { animation: `yc-fade-out ${PAID_FADE_MS}ms linear both` } : undefined}
      onAnimationEnd={() => setPhase((current) => (current === "revealing" ? "ready" : current))}
      data-testid="yourcat-paid-veil"
      data-wipe={phase === "revealing" ? (reducedMotion ? "fade" : "wipe") : undefined}
    >
      {avatarUrl ? <QuantisedAvatar src={avatarUrl} /> : <SpriteFrame spriteImg={spriteImg} />}
      <span aria-hidden="true" className="absolute inset-0 bg-tt-cream/30" />
      <span className="absolute inset-x-0 bottom-2 flex justify-center">
        <span className="rounded-full bg-tt-cream px-2 py-0.5 font-primary text-p6 uppercase tracking-wide text-tt-night-900 shadow-[0_2px_0_rgb(var(--tt-night-950)/.4)]">
          {S6.paintingLabel}
        </span>
      </span>
    </div>
  );

  return (
    <div className="absolute inset-0" data-testid="yourcat-paid-frame" data-phase={phase}>
      {ready && (
        <img
          src={portraitUrl ?? undefined}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          decoding="async"
          data-testid="yourcat-paid-portrait"
        />
      )}
      {phase !== "ready" && painting}
      {burst && !reducedMotion && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0" data-testid="yourcat-paid-burst" data-count={PAID_BURST}>
          <Burst count={PAID_BURST} reducedMotion={reducedMotion} onDone={() => setBurst(false)} />
        </span>
      )}
      {renderCat && <InSlot slot="cat">{renderCat(phase)}</InSlot>}
    </div>
  );
}

// ---- the panel ---------------------------------------------------------------------------------

/** The drawn pixel paw (not an emoji glyph). */
function Paw({ pulse }: { pulse: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={`pixelated h-12 w-12 text-tt-gold-400 md:h-16 md:w-16 ${pulse ? "yc-paw" : ""}`}
      data-testid="yourcat-paid-paw"
      data-pulse={pulse ? `${PAW_PULSE.periodMs}ms x${PAW_PULSE.cycles}` : "off"}
    >
      <g fill="currentColor">
        <rect x="1" y="3" width="2" height="3" />
        <rect x="4" y="1" width="2" height="3" />
        <rect x="7" y="1" width="2" height="3" />
        <rect x="9" y="3" width="2" height="3" />
        <rect x="3" y="6" width="6" height="4" />
        <rect x="4" y="10" width="4" height="1" />
        <rect x="2" y="7" width="1" height="2" />
        <rect x="9" y="7" width="1" height="2" />
      </g>
    </svg>
  );
}

/** A screen heading without glowing key words (late, failed, confirming). */
const PlainHeading = forwardRef<HTMLHeadingElement, { children: ReactNode }>(({ children }, ref) => (
  <h1 ref={ref} tabIndex={-1} className={HEADLINE}>
    {children}
  </h1>
));
PlainHeading.displayName = "PlainHeading";

/** "Download 4K": a blob save on this page, else the image opens in a new tab and this becomes its link. */
function DownloadPortrait({ url, name }: { url: string; name: string }) {
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState(false);
  if (opened) return <PrimaryAction text={S6.download} href={url} />;
  return (
    <PrimaryAction
      text={S6.download}
      busy={saving}
      onClick={async () => {
        setSaving(true);
        const outcome = await saveRemoteImage(url, name);
        setSaving(false);
        if (outcome === "opened") setOpened(true);
      }}
    />
  );
}

export interface PaidStateProps {
  record: YourcatView;
  name: string;
  portrait: YourcatStatusView["portrait"] | null;
  /** Still painting after 10 minutes of polling. */
  late: boolean;
  onBack: () => void;
  /** Only the paid return (S6) reports `portrait_paid`; the same state shown on a later S3 does not. */
  reportPaid?: boolean;
  /**
   * Show the finished portrait inside the panel. Defaults to the inline use on S3 (no `reportPaid`),
   * which has no stage; the paid screen shows it in the stage frame (`PaidFrameContent`) instead.
   */
  showPortrait?: boolean;
  reducedMotion?: boolean;
}

/**
 * S6 "The painting is hung" (`/yourcat?yc=<id>&paid=1`), and inline under S3 while a paid portrait is
 * painted (polish spec S6). It renders only the panel; the stage frame on the paid screen holds
 * `PaidFrameContent`. `portrait_paid` (and GTM `purchase`) fires the first time `painting` or `ready`
 * is seen on the paid return. The paw pulses every 2 s and stops after 4 cycles.
 */
export const PaidState = forwardRef<HTMLHeadingElement, PaidStateProps>(
  ({ record, name, portrait, late, onBack, reportPaid = false, showPortrait = !reportPaid, reducedMotion = false }, ref) => {
    const status = record.portrait.status;

    useEffect(() => {
      if (!reportPaid || (status !== "painting" && status !== "ready")) return;
      if (!portrait || !firstPaidSighting(record.id)) return;
      analytics.track(
        buildGrowthEvent("portrait_paid", {
          surface: "yourcat",
          priceCents: portrait.priceCents,
          currency: portrait.currency,
          status,
        }),
      );
      trackEvent("purchase", {
        currency: portrait.currency,
        value: portrait.priceCents / 100,
        item_name: "HD portrait",
      });
    }, [reportPaid, status, portrait, record.id]);

    const back = (
      <button type="button" className={NIGHT_PILL} onClick={onBack}>
        {S6.back(name)}
      </button>
    );
    const shell = (children: ReactNode, state: string) => (
      <section className={`${PANEL} flex flex-col items-center gap-4 text-center`} data-testid="yourcat-paid" data-state={state}>
        {children}
      </section>
    );

    if (status === "ready" && record.portrait.url) {
      return shell(
        <>
          <Headline ref={ref} parts={S6.readyTitleParts} />
          {showPortrait && (
            <Frame inner={{ w: 128, h: 192, mdW: 192, mdH: 288 }} reducedMotion={reducedMotion}>
              <img
                src={record.portrait.url}
                alt={S6.portraitAlt(name)}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                data-testid="yourcat-paid-inline-portrait"
              />
            </Frame>
          )}
          <DownloadPortrait url={record.portrait.url} name={name} />
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/game" className={NIGHT_PILL}>
              {S6.play(name)}
            </Link>
            {back}
          </div>
        </>,
        "ready",
      );
    }

    if (status === "failed" || late) {
      return shell(
        <>
          <PlainHeading ref={ref}>{S6.lateTitle}</PlainHeading>
          <p className={`${BODY} max-w-xl`}>{status === "failed" ? S6.failed : S6.late}</p>
          {back}
        </>,
        status === "failed" ? "failed" : "late",
      );
    }

    if (status === "painting") {
      return shell(
        <>
          <Paw pulse={!reducedMotion} />
          <Headline ref={ref} parts={S6.paintingTitleParts(name)} />
          <p className={`${BODY} max-w-xl`} aria-live="polite">
            {S6.paintingBody}
          </p>
          {back}
        </>,
        "painting",
      );
    }

    return shell(
      <>
        <PlainHeading ref={ref}>{S6.confirming}</PlainHeading>
        {back}
      </>,
      "confirming",
    );
  },
);

PaidState.displayName = "PaidState";
