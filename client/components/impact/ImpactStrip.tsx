import type { PublicImpact } from "@/api/impact-api";
import { Claim, type ClaimFaceParts } from "@/components/claims/Claim";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { publicFact } from "@/components/claims/facts";
import { PixelIcon, type PixelIconName } from "@/components/shared/PixelIcon";
import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { GIVEN_DIRECTLY_ID } from "./GivenDirectly";
import { stripFigures, type LiveFigure } from "./live";
import { localClock, timeLeft, type PawView } from "./pawView";
import { useClock } from "./useClock";

interface ImpactStripProps {
  impact: PublicImpact | null;
  paw: PawView;
  onOpenImpact: () => void;
  /** The public snapshot is still loading: the money tiles show as empty slots. */
  loading?: boolean;
  isApp?: boolean;
  /** Controlled pause, shared with the lobby's other motion (components/game/lobbyMotion.ts). */
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  /** Fill the parent's width instead of the default `min(92vw, 54rem)`. */
  fill?: boolean;
  /** Narrower boards: the tiles take two rows. */
  stacked?: boolean;
  /** The narrowest boards (the md edge): three rows, so no tile or chip is cut. */
  narrow?: boolean;
  /** Test seam for the paw countdown. */
  now?: Date | null;
  className?: string;
}

/**
 * The registry's short wording of F-026 ("$40K+ donated in crypto and goods") for the board, or null when the
 * entry is not public or has no short wording. The drawer still shows the full words.
 */
export function givenDirectlyShort(): string | null {
  return publicFact(GIVEN_DIRECTLY_ID)?.short ?? null;
}

/** "0.86 USDC" → figure "0.86", unit "USDC"; "$0.86 · FX 2026-10-18" → "$0.86", "· FX 2026-10-18". */
export function splitAmount(amount: string): { figure: string; unit: string } {
  const m = /^(\S+)\s+(.+)$/.exec(amount);
  return m ? { figure: m[1], unit: m[2] } : { figure: amount, unit: "" };
}

/** App builds' "· FX 2026-10-18" unit: the FX date, shown once per slot instead of after every coin. */
const FX_UNIT = /^·\s*FX\s+(\S+)$/;

/** "18 Oct 2026" → "18 Oct" for the tile face; the full date stays in its tooltip and accessible name. */
function shortDate(date: string | null): string | null {
  return date ? date.replace(/\s\d{4}$/, "") : null;
}

/* One look for every slot on the board: a dark inset well under the gold frame. */
const SLOT =
  "relative flex min-w-0 flex-col justify-center gap-[0.25rem] rounded-lg border-2 border-tt-gold-500/35 bg-tt-night-950/60 px-[0.6rem] py-[0.3rem] shadow-[inset_0_2px_0_rgb(0_0_0/0.45),0_1px_0_rgb(var(--tt-gold-400)/0.12)]";
/* Tile widths keep one rhythm: the paw and the company-reported slot hug their content, the
   money slots share the rest (shelters, with up to three coins, get more). */
const GROW_TREATS = "flex-[1_1_auto]";
const GROW_SHELTERS = "flex-[1.6_1_auto]";
/* The tile's caption: small gold caps with its icon. */
const LABEL =
  "flex min-w-0 items-center gap-[0.3rem] whitespace-nowrap font-primary text-[length:max(11px,0.7rem)] uppercase leading-none tracking-wider text-tt-gold-400";
/* Scoreboard numerals. */
const FIGURE =
  "font-primary text-[length:max(22px,1.6rem)] leading-none text-tt-cream [text-shadow:0_2px_0_rgb(var(--tt-night-950))]";
/* The company-reported slot's figure: a step smaller than the on-chain numerals. */
const FIGURE_SM =
  "font-primary text-[length:max(17px,1.25rem)] leading-none text-tt-cream/90 [text-shadow:0_2px_0_rgb(var(--tt-night-950))]";
/* Coin symbols as written ("USDC.e", not "USDC.E"). */
const UNIT = "font-primary text-[length:max(11px,0.75rem)] leading-none tracking-wide text-tt-cream/80";
/* Date (and the app's FX date) beside a figure. */
const META =
  "flex shrink-0 items-center gap-x-[0.35rem] whitespace-nowrap font-primary text-[length:max(10px,0.65rem)] uppercase leading-none tracking-wide text-tt-muted";

const TileIcon = ({ name, src }: { name?: PixelIconName; src?: string }) =>
  src ? (
    <img src={src} alt="" aria-hidden="true" draggable={false} className="pixelated h-[0.95rem] w-[0.95rem] shrink-0 object-contain" />
  ) : (
    <span aria-hidden="true" className="shrink-0">
      <PixelIcon name={name ?? "heart"} size={14} />
    </span>
  );

/** A pixel clock for the paw countdown, drawn on a 7 px grid. */
const ClockGlyph = () => (
  <svg aria-hidden="true" viewBox="0 0 7 7" width="10" height="10" shapeRendering="crispEdges" fill="currentColor" className="shrink-0">
    <path d="M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM1 5h1v1H1zM5 5h1v1H5zM2 6h3v1H2zM3 2h1v2H3zM4 3h1v1H4z" />
  </svg>
);

/** The short date; the full "as of" date on hover. */
const AsOf = ({ date }: { date: string | null }) =>
  date ? (
    <span className="whitespace-nowrap" title={`As of ${date}`} data-testid="board-asof">
      {shortDate(date)}
    </span>
  ) : null;

/**
 * Today's paw as a stamp card: one paw stamp per run (gold once earned), the runs left and how long
 * today's runs still count. The full sentence is in the screen-reader text.
 */
const PawTile = ({ view, now: nowProp, className }: { view: PawView; now?: Date | null; className?: string }) => {
  const ticking = useClock();
  const now = nowProp === undefined ? ticking : nowProp;
  const left = now ? timeLeft(view.closesAt, now) : null;
  const clock = view.closesAt && left ? localClock(view.closesAt) : null;
  const countdown = left ? `${left} left today${clock ? ` (until ${clock})` : ""}` : null;
  const runs = view.runs;
  const remaining = runs ? Math.max(0, runs.needed - runs.done) : 0;
  const short =
    view.state === "progress"
      ? `${remaining} more run${remaining === 1 ? "" : "s"}`
      : view.state === "earned"
      ? "Earned!"
      : view.text;

  return (
    <div data-testid="paw-progress" data-paw-state={view.state} className={clsx(SLOT, className)}>
      <span className="sr-only" data-testid="paw-text">
        {view.text}
        {countdown ? `. ${countdown}.` : ""}
      </span>
      <span aria-hidden="true" className={LABEL}>
        <TileIcon src={cdnFile("logo/paw.webp")} />
        Today&apos;s paw
        {left && (
          <span
            data-testid="paw-countdown"
            title={countdown ?? undefined}
            className="ml-auto inline-flex items-center gap-[0.25rem] pl-2 text-tt-muted"
          >
            <ClockGlyph />
            {left}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-[0.45rem]">
        {runs && (
          <span className="flex shrink-0 items-center gap-[0.25rem]" data-testid="paw-stamps">
            {Array.from({ length: runs.needed }, (_, i) => (
              <span
                key={i}
                data-done={i < runs.done || undefined}
                className={clsx(
                  "inline-flex h-[max(22px,1.4rem)] w-[max(22px,1.4rem)] items-center justify-center rounded-[3px] border-2",
                  i < runs.done
                    ? "border-tt-gold-500 bg-tt-gold-400 text-tt-gold-ink shadow-[0_2px_0_rgb(var(--tt-gold-shadow))]"
                    : "border-tt-gold-500/50 bg-tt-night-900/80 text-tt-gold-400/40"
                )}
              >
                <PixelIcon name="paw" size={14} />
              </span>
            ))}
          </span>
        )}
        <span
          title={view.text}
          className={clsx(
            "min-w-0 truncate font-primary uppercase leading-none",
            runs ? "text-[length:max(14px,0.95rem)] text-tt-cream" : "max-w-[11rem] text-[length:max(12px,0.75rem)] text-tt-cream/90"
          )}
        >
          {short}
        </span>
      </span>
    </div>
  );
};

/**
 * A money tile: the caption with its chips on one line, then the amount(s) as scoreboard numerals
 * (one per coin, never summed) with the as-of date (and in app builds the FX date, once).
 */
const MoneyFace = ({
  label,
  icon,
  parts,
  date,
  chips,
}: {
  label: string;
  icon: ReactNode;
  parts: string[];
  date: string | null;
  chips: ReactNode;
}) => {
  const amounts = parts.map((part) => {
    const { figure, unit } = splitAmount(part);
    const fx = FX_UNIT.exec(unit)?.[1] ?? null;
    return { part, figure, unit: fx ? "" : unit, fx };
  });
  const fx = amounts.find((a) => a.fx)?.fx ?? null;
  return (
    <>
      {/* Caption and chips share a line; if the slot is ever too tight the chips drop below, never over. */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-[0.6rem] gap-y-[0.2rem]">
        <span className={clsx(LABEL, "shrink-0")}>
          {icon}
          {label}
        </span>
        <span className="ml-auto flex shrink-0 items-center">{chips}</span>
      </span>
      <span className="flex min-w-0 items-baseline gap-x-[0.6rem]">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-[0.7rem] gap-y-[0.2rem]" data-testid="board-amounts">
          {amounts.map(({ part, figure, unit }) => (
            <span key={part} data-testid="board-amount" className="inline-flex items-baseline gap-[0.2rem] whitespace-nowrap">
              <span className={FIGURE}>{figure}</span>
              {unit && <span className={UNIT}>{unit}</span>}
            </span>
          ))}
        </span>
        <span className={clsx(META, "ml-auto")}>
          {fx && <span data-testid="board-fx">FX {fx}</span>}
          <AsOf date={date} />
        </span>
      </span>
    </>
  );
};

const FIGURE_LOOK: Record<string, { label: string; icon: ReactNode }> = {
  // claim: L-treats (a caption for the figure; the accessible name says "Token Tails has sent …")
  "L-treats": { label: "Treats sent", icon: <TileIcon name="gift" /> },
  // claim: L-disbursed (a caption for the figure; the accessible name says "Token Tails has sent … to shelters")
  "L-disbursed": { label: "Paid to shelters", icon: <TileIcon src={cdnFile("logo/heart.webp")} /> },
};

const MoneyTile = ({ figure, isApp, className }: { figure: LiveFigure; isApp: boolean; className?: string }) => {
  const look = FIGURE_LOOK[figure.id] ?? { label: "", icon: null };
  const parts = figure.parts?.length ? figure.parts : figure.values.amount ? [figure.values.amount] : [];
  return (
    <Claim
      id={figure.id}
      values={figure.values}
      liveAsOf={figure.asOf}
      tier={figure.tier}
      isApp={isApp}
      variant="tile"
      className={clsx(SLOT, "hover:border-tt-gold-400/80", className)}
      face={({ date, chips }: ClaimFaceParts) => (
        <MoneyFace label={look.label} icon={look.icon} parts={parts} date={date} chips={chips} />
      )}
    />
  );
};

/**
 * The md+ lobby impact board (plan G4 "Client"): a gold-framed scoreboard of slots. Today's paw as
 * stamps, then what Token Tails has sent (treats, and to shelters one numeral per coin, never
 * summed), then the company-reported direct donations, a step smaller; MY IMPACT, PROOF and the
 * pause on the right. Every money slot is a <Claim> (its drawer, its tier and status chips, its
 * as-of date); the slots' accessible names are the full sentences. Nothing rotates or announces
 * itself (`aria-live="off"`). The pause stops the lobby's looping motion (lobbyMotion.ts, WCAG 2.2.2).
 * One row on wide boards, two on `stacked`, three on `narrow` ones, so nothing is ever cut.
 */
export const ImpactStrip = ({
  impact,
  paw,
  onOpenImpact,
  loading = false,
  isApp = isAppBuild(),
  paused: pausedProp,
  onPausedChange,
  fill = false,
  stacked = false,
  narrow = false,
  now,
  className,
}: ImpactStripProps) => {
  const [pausedLocal, setPausedLocal] = useState(false);
  const paused = pausedProp ?? pausedLocal;
  const setPaused = (next: boolean) => {
    setPausedLocal(next);
    onPausedChange?.(next);
  };
  const rows = narrow ? 3 : stacked ? 2 : 1;
  const figures = stripFigures(impact, isApp);
  const treats = figures.find((f) => f.id === "L-treats") ?? null;
  const shelters = figures.find((f) => f.id === "L-disbursed") ?? null;
  const given = givenDirectlyShort();
  const pauseTitle = paused ? "Lobby animations paused. Play them again" : "Pause the lobby animations";

  const proofClass =
    "inline-flex min-h-[24px] items-center justify-center gap-1 px-1 font-primary text-[length:max(12px,0.75rem)] uppercase leading-none text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400";

  const actions = (
    <div className={clsx("flex shrink-0 items-center gap-[0.5rem] pl-[0.15rem]", rows > 1 && "ml-auto")}>
      <button
        type="button"
        onClick={onOpenImpact}
        className="min-h-[2.25rem] whitespace-nowrap rounded-lg border-2 border-tt-gold-500 bg-tt-gold-400 px-[0.8rem] font-primary text-[length:max(13px,0.85rem)] uppercase leading-none text-tt-gold-ink shadow-[0_3px_0_rgb(var(--tt-gold-shadow))] hover:brightness-105 active:translate-y-px active:shadow-[0_2px_0_rgb(var(--tt-gold-shadow))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream"
      >
        My impact
      </button>
      {isApp ? (
        <button type="button" onClick={() => void openWebImpact()} className={proofClass}>
          Proof <PixelIcon name="external-link" size={11} />
        </button>
      ) : (
        <Link href="/impact" className={proofClass}>
          Proof
        </Link>
      )}
      {/* The lobby's pause (WCAG 2.2.2): stops every looping animation on screen and stills the cat GIFs.
          Paused, it shows a gold play triangle in a gold-rimmed well (not a second gold button). */}
      <button
        type="button"
        data-testid="impact-strip-pause"
        data-paused={paused || undefined}
        aria-pressed={paused}
        aria-label="Pause lobby animations"
        title={pauseTitle}
        onClick={() => setPaused(!paused)}
        className={clsx(
          "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 bg-tt-night-950/70 after:absolute after:-inset-1 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
          paused
            ? "border-tt-gold-400 text-tt-gold-400 shadow-[0_0_8px_rgb(var(--tt-gold-400)/0.45)]"
            : "border-tt-gold-500/50 text-tt-gold-400/80 hover:border-tt-gold-500 hover:text-tt-cream"
        )}
      >
        {/* Pixel pause bars / play triangle, drawn on a 7 px grid. */}
        <svg aria-hidden="true" viewBox="0 0 7 7" width="12" height="12" shapeRendering="crispEdges" fill="currentColor">
          {paused ? <path d="M1 0h1v7H1zM2 1h1v5H2zM3 2h1v3H3zM4 3h1v1H4z" /> : <path d="M1 0h2v7H1zM4 0h2v7H4z" />}
        </svg>
      </button>
    </div>
  );

  // The money slots, or what stands in for them: empty slots while loading, a plain line when the
  // snapshot could not be read (no figure is better than a wrong "none yet"), the future-tense
  // empty state when nothing has been paid.
  const unavailable = !impact && !loading;
  const placeholder =
    figures.length > 0 ? null : loading ? (
      <>
        <span className="sr-only">Loading the impact figures.</span>
        {[GROW_TREATS, GROW_SHELTERS].map((grow) => (
          <span
            key={grow}
            aria-hidden="true"
            data-testid="impact-strip-skeleton"
            className={clsx(SLOT, grow, "min-w-[9rem]")}
          >
            <span className="h-[0.6rem] w-[5rem] rounded-sm bg-tt-gold-400/20" />
            <span className="h-[1.4rem] w-[7rem] rounded-sm bg-tt-cream/15" />
          </span>
        ))}
      </>
    ) : unavailable ? (
      <span
        data-testid="impact-strip-unavailable"
        className={clsx(SLOT, "min-w-0 flex-1 font-secondary text-[length:max(13px,0.85rem)] leading-tight text-tt-cream/90")}
      >
        The live figures could not load. PROOF has the full record.
      </span>
    ) : (
      // claim: L-treats (empty state: nothing is sent yet, so the line is future tense)
      <span
        data-testid="impact-strip-empty"
        className={clsx(SLOT, "min-w-0 flex-1 font-secondary text-[length:max(13px,0.85rem)] leading-tight text-tt-cream/90")}
      >
        No treat-rail payouts yet. The first goes out when the rail opens.
      </span>
    );

  const treatsTile = treats && <MoneyTile key="treats" figure={treats} isApp={isApp} className={GROW_TREATS} />;
  const sheltersTile = shelters && <MoneyTile key="shelters" figure={shelters} isApp={isApp} className={GROW_SHELTERS} />;
  const givenTile = given && (
    // claim: F-026 (its registry `short` wording; the drawer shows the full words, the slot its
    // COMPANY-REPORTED chip and its date)
    <Claim
      key="given"
      id={GIVEN_DIRECTLY_ID}
      text={given}
      isApp={isApp}
      variant="tile"
      className={clsx(SLOT, rows === 1 ? "flex-none" : "flex-[1_1_auto]", "hover:border-tt-gold-400/80")}
      face={({ figure, rest, date, chips }: ClaimFaceParts) => (
        <>
          <span className={LABEL}>
            <TileIcon src={cdnFile("logo/chest.webp")} />
            {rest}
          </span>
          <span className="flex min-w-0 items-baseline gap-x-[0.5rem]">
            {figure && <span className={FIGURE_SM}>{figure}</span>}
            <span className={clsx(META, "ml-auto")}>
              <AsOf date={date} />
              {chips}
            </span>
          </span>
        </>
      )}
    />
  );

  const ROW = "flex min-w-0 items-stretch gap-[0.35rem]";
  let body: ReactNode;
  if (rows === 1) {
    body = (
      <>
        <PawTile view={paw} now={now} className="shrink-0" />
        <div data-testid="impact-strip-rail" className={clsx(ROW, "flex-1")}>
          {treatsTile}
          {sheltersTile}
          {placeholder}
          {givenTile}
        </div>
        {actions}
      </>
    );
  } else if (rows === 2) {
    // Today's paw, the company-reported slot and the buttons on top; the on-chain money below.
    body = (
      <>
        <div className={ROW}>
          <PawTile view={paw} now={now} className="flex-[1_1_auto]" />
          {givenTile}
          {actions}
        </div>
        <div data-testid="impact-strip-rail" className={ROW}>
          {treatsTile}
          {sheltersTile}
          {placeholder}
        </div>
      </>
    );
  } else {
    // The md edge: today's paw and the buttons; treats and the company-reported slot; shelters.
    body = (
      <>
        <div className={ROW}>
          <PawTile view={paw} now={now} className="flex-1" />
          {actions}
        </div>
        <div data-testid="impact-strip-rail" className={ROW}>
          {treatsTile}
          {givenTile}
        </div>
        <div className={ROW}>
          {sheltersTile}
          {placeholder}
        </div>
      </>
    );
  }

  return (
    <section
      data-testid="impact-strip"
      data-rows={rows}
      data-stacked={rows > 1 || undefined}
      aria-label="Rescue impact"
      aria-live="off"
      className={clsx(
        "pointer-events-auto relative flex gap-[0.35rem] rounded-xl border-[3px] border-tt-gold-500 bg-[linear-gradient(to_bottom,rgb(var(--tt-night-700)/0.95),rgb(var(--tt-night-900)/0.95))] p-[0.35rem] text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)),inset_0_2px_0_rgb(var(--tt-gold-400)/0.25),0_0_24px_rgb(var(--tt-gold-400)/0.12)] backdrop-blur-sm lowfx:backdrop-blur-none",
        fill ? "w-full" : "w-[min(92vw,54rem)]",
        rows === 1 ? "items-stretch" : "flex-col",
        className
      )}
    >
      {/* Pixel rivets on the frame's corners. */}
      {["left-1 top-1", "right-1 top-1", "left-1 bottom-1", "right-1 bottom-1"].map((at) => (
        <span key={at} aria-hidden="true" className={clsx("pointer-events-none absolute h-1 w-1 bg-tt-gold-500/70", at)} />
      ))}
      {body}
    </section>
  );
};

interface ImpactChipProps {
  paw: PawView;
  onOpenImpact: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The impact strip in one tap-sized line, for screens with no room for the strip (phones, short
 * landscape): MY IMPACT with today's paw (the run checklist and its line) and a chevron; a tap opens
 * the IMPACT tab, where the figures show with their dates and tier chips. It quotes no money figure
 * itself, because a figure always travels with its label and date (docs/CLAIMS.md R12).
 */
export const ImpactChip = ({ paw, onOpenImpact, className, style }: ImpactChipProps) => (
  <button
    type="button"
    data-testid="impact-chip"
    onClick={onOpenImpact}
    aria-label={`My impact. ${paw.text}`}
    style={style}
    className={clsx(
      "pointer-events-auto flex items-center gap-3 rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800/90 px-3 py-0.5 text-left text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] backdrop-blur-sm transition lowfx:backdrop-blur-none hover:border-tt-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
      className
    )}
  >
    <span aria-hidden="true" className="shrink-0 text-tt-pink">
      <PixelIcon name="heart" size={20} />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-px">
      <span className="font-primary text-p5 uppercase leading-none tracking-wide text-tt-gold-400">My impact</span>
      <span data-testid="impact-chip-paw" className="line-clamp-2 font-secondary text-[length:max(12px,0.75rem)] leading-tight">
        {paw.text}
      </span>
    </span>
    {paw.runs && (
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
        {Array.from({ length: paw.runs.needed }, (_, i) => (
          <span
            key={i}
            className={clsx(
              "inline-flex h-4 w-4 items-center justify-center rounded-sm border-2",
              i < paw.runs!.done
                ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
                : "border-tt-cream/50 bg-tt-night-900/70 text-transparent"
            )}
          >
            <PixelIcon name="check" size={10} />
          </span>
        ))}
      </span>
    )}
    <span aria-hidden="true" className="shrink-0 text-tt-gold-400">
      <PixelIcon name="chevron-right" size={16} />
    </span>
  </button>
);

export default ImpactStrip;
