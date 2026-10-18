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
  /** Narrow boards: the tiles wrap onto two rows. */
  stacked?: boolean;
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

/** "18 Oct 2026" → "18 Oct" for the tile face; the full date stays in its tooltip and accessible name. */
function shortDate(date: string | null): string | null {
  return date ? date.replace(/\s\d{4}$/, "") : null;
}

/* One look for every slot on the board: a dark inset well under the gold frame. */
const SLOT =
  "relative flex min-w-0 flex-col justify-center gap-[0.2rem] rounded-lg border-2 border-tt-gold-500/35 bg-tt-night-950/60 px-[0.6rem] py-[0.3rem] shadow-[inset_0_2px_0_rgb(0_0_0/0.45),0_1px_0_rgb(var(--tt-gold-400)/0.12)]";
/* The tile's caption: small gold caps with its icon. */
const LABEL =
  "flex min-w-0 items-center gap-[0.3rem] whitespace-nowrap font-primary text-[length:max(11px,0.7rem)] uppercase leading-none tracking-wider text-tt-gold-400";
/* Scoreboard numerals. */
const FIGURE =
  "font-primary text-[length:max(18px,1.3rem)] leading-none text-tt-cream [text-shadow:0_2px_0_rgb(var(--tt-night-950))]";
const UNIT = "font-primary text-[length:max(11px,0.7rem)] uppercase leading-none tracking-wide text-tt-cream/80";
/* Date and chips under a figure. */
const META =
  "flex min-w-0 flex-wrap items-center gap-x-[0.35rem] gap-y-0.5 font-primary text-[length:max(11px,0.7rem)] uppercase leading-none tracking-wide text-tt-muted";

const TileIcon = ({ name, src }: { name?: PixelIconName; src?: string }) =>
  src ? (
    <img src={src} alt="" aria-hidden="true" draggable={false} className="pixelated h-[0.95rem] w-[0.95rem] shrink-0 object-contain" />
  ) : (
    <span aria-hidden="true" className="shrink-0">
      <PixelIcon name={name ?? "heart"} size={14} />
    </span>
  );

/** The date with a calendar glyph; the full "as of" date on hover. */
const AsOf = ({ date }: { date: string | null }) =>
  date ? (
    <span className="whitespace-nowrap" title={`As of ${date}`} data-testid="board-asof">
      {shortDate(date)}
    </span>
  ) : null;

/**
 * Today's paw as a stamp card: one stamp per run, the runs left and how long today's runs still
 * count. The full sentence is in the screen-reader text.
 */
const PawTile = ({ view, now: nowProp }: { view: PawView; now?: Date | null }) => {
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
    <div data-testid="paw-progress" data-paw-state={view.state} className={clsx(SLOT, "shrink-0")}>
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
            className="ml-auto inline-flex items-center gap-[0.2rem] pl-1 text-tt-muted"
          >
            {left}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-[0.4rem]">
        {runs && (
          <span className="flex shrink-0 items-center gap-[0.2rem]" data-testid="paw-stamps">
            {Array.from({ length: runs.needed }, (_, i) => (
              <span
                key={i}
                data-done={i < runs.done || undefined}
                className={clsx(
                  "inline-flex h-[1.15rem] w-[1.15rem] items-center justify-center rounded-[3px] border-2",
                  i < runs.done
                    ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink shadow-[0_2px_0_rgb(var(--tt-gold-shadow))]"
                    : "border-dashed border-tt-cream/60 bg-tt-night-900/80 text-tt-cream/55"
                )}
              >
                <PixelIcon name={i < runs.done ? "check" : "paw"} size={10} />
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

/** A money tile: a caption, the amount(s) as scoreboard numerals (one per coin), date and chips. */
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
}) => (
  <>
    <span className="flex min-w-0 flex-wrap items-center gap-x-[0.6rem] gap-y-[0.2rem]">
      <span className={LABEL}>
        {icon}
        {label}
      </span>
      <span className={clsx(META, "ml-auto flex-nowrap")}>
        <AsOf date={date} />
        {chips}
      </span>
    </span>
    <span className="flex min-w-0 items-baseline gap-x-[0.6rem]" data-testid="board-amounts">
      {parts.map((part) => {
        const { figure, unit } = splitAmount(part);
        return (
          <span key={part} data-testid="board-amount" className="inline-flex items-baseline gap-[0.2rem] whitespace-nowrap">
            <span className={FIGURE}>{figure}</span>
            {unit && <span className={UNIT}>{unit}</span>}
          </span>
        );
      })}
    </span>
  </>
);

const FIGURE_LOOK: Record<string, { label: string; icon: ReactNode }> = {
  // claim: L-treats (a caption for the figure; the accessible name says "Token Tails has sent …")
  "L-treats": { label: "Treats sent", icon: <TileIcon name="gift" /> },
  // claim: L-disbursed (a caption for the figure; the accessible name says "Token Tails has sent … to shelters")
  "L-disbursed": { label: "Paid to shelters", icon: <TileIcon src={cdnFile("logo/heart.webp")} /> },
};

const MoneyTile = ({ figure, isApp }: { figure: LiveFigure; isApp: boolean }) => {
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
      className={clsx(SLOT, "flex-auto hover:border-tt-gold-400/80")}
      face={({ date, chips }: ClaimFaceParts) => (
        <MoneyFace label={look.label} icon={look.icon} parts={parts} date={date} chips={chips} />
      )}
    />
  );
};

/**
 * The md+ lobby impact board (plan G4 "Client"): a gold-framed scoreboard of slots. Today's paw as
 * stamps, then what Token Tails has sent (treats, and to shelters one numeral per coin, never
 * summed), then the company-reported direct donations; MY IMPACT, PROOF and the pause on the right.
 * Every money slot is a <Claim> (its drawer, its tier and status chips, its as-of date); the slots'
 * accessible names are the full sentences. Nothing rotates or announces itself (`aria-live="off"`).
 * The pause stops the lobby's looping motion (lobbyMotion.ts, WCAG 2.2.2).
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
  now,
  className,
}: ImpactStripProps) => {
  const [pausedLocal, setPausedLocal] = useState(false);
  const paused = pausedProp ?? pausedLocal;
  const setPaused = (next: boolean) => {
    setPausedLocal(next);
    onPausedChange?.(next);
  };
  const figures = stripFigures(impact, isApp);
  const given = givenDirectlyShort();
  const pauseTitle = paused ? "Lobby animations paused. Play them again" : "Pause the lobby animations";

  const proofClass =
    "inline-flex min-h-[24px] items-center justify-center gap-1 px-1 font-primary text-[length:max(12px,0.75rem)] uppercase leading-none text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400";

  const actions = (
    <div className={clsx("flex shrink-0 items-center gap-[0.35rem] pl-[0.15rem]", stacked && "ml-auto")}>
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
      {/* The lobby's pause (WCAG 2.2.2): stops every looping animation on screen and stills the cat GIFs. */}
      <button
        type="button"
        data-testid="impact-strip-pause"
        aria-pressed={paused}
        aria-label="Pause lobby animations"
        title={pauseTitle}
        onClick={() => setPaused(!paused)}
        className={clsx(
          "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 after:absolute after:-inset-2 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
          paused
            ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
            : "border-tt-gold-500/50 bg-tt-night-950/60 text-tt-gold-400/80 hover:border-tt-gold-500 hover:text-tt-cream"
        )}
      >
        {/* Pixel pause bars / play triangle, drawn on a 7 px grid. */}
        <svg aria-hidden="true" viewBox="0 0 7 7" width="12" height="12" shapeRendering="crispEdges" fill="currentColor">
          {paused ? <path d="M1 0h1v7H1zM2 1h1v5H2zM3 2h1v3H3zM4 3h1v1H4z" /> : <path d="M1 0h2v7H1zM4 0h2v7H4z" />}
        </svg>
      </button>
    </div>
  );

  return (
    <section
      data-testid="impact-strip"
      data-stacked={stacked || undefined}
      aria-label="Rescue impact"
      aria-live="off"
      className={clsx(
        "pointer-events-auto relative flex items-stretch rounded-xl border-[3px] border-tt-gold-500 bg-[linear-gradient(to_bottom,rgb(var(--tt-night-700)/0.95),rgb(var(--tt-night-900)/0.95))] p-[0.35rem] text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)),inset_0_2px_0_rgb(var(--tt-gold-400)/0.25),0_0_24px_rgb(var(--tt-gold-400)/0.12)] backdrop-blur-sm lowfx:backdrop-blur-none",
        fill ? "w-full" : "w-[min(92vw,54rem)]",
        stacked ? "flex-wrap gap-[0.35rem]" : "gap-[0.35rem]",
        // Chips keep the board's small caps and stay on one line.
        "[&_[data-chip]]:px-1 [&_[data-chip]]:py-px [&_[data-chip]]:text-[length:max(10px,0.62rem)]",
        className
      )}
    >
      {/* Pixel rivets on the frame's corners. */}
      {["left-1 top-1", "right-1 top-1", "left-1 bottom-1", "right-1 bottom-1"].map((at) => (
        <span key={at} aria-hidden="true" className={clsx("pointer-events-none absolute h-1 w-1 bg-tt-gold-500/70", at)} />
      ))}

      <PawTile view={paw} now={now} />
      {/* Narrow boards: today's paw and the buttons on the first row, the money slots below. */}
      {stacked && actions}

      <div
        data-testid="impact-strip-rail"
        className={clsx("flex min-w-0 items-stretch gap-[0.35rem]", stacked ? "basis-full" : "flex-1")}
      >
        {figures.length > 0 ? (
          figures.map((f) => <MoneyTile key={f.id} figure={f} isApp={isApp} />)
        ) : loading ? (
          <>
            <span className="sr-only">Loading the impact figures.</span>
            {[0, 1].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                data-testid="impact-strip-skeleton"
                className={clsx(SLOT, "w-[9rem] shrink-0")}
              >
                <span className="h-[0.6rem] w-[5rem] rounded-sm bg-tt-gold-400/20" />
                <span className="h-[1.1rem] w-[6rem] rounded-sm bg-tt-cream/15" />
              </span>
            ))}
          </>
        ) : (
          // claim: L-treats (empty state: nothing is sent yet, so the line is future tense)
          <span
            data-testid="impact-strip-empty"
            className={clsx(SLOT, "min-w-0 flex-1 font-secondary text-[length:max(13px,0.85rem)] leading-tight text-tt-cream/90")}
          >
            No treat-rail payouts yet. The first goes out when the rail opens.
          </span>
        )}
        {given && (
          // claim: F-026 (its registry `short` wording; the drawer shows the full words, the slot its
          // COMPANY-REPORTED chip and its date)
          <Claim
            id={GIVEN_DIRECTLY_ID}
            text={given}
            isApp={isApp}
            variant="tile"
            className={clsx(SLOT, "min-w-0 flex-auto hover:border-tt-gold-400/80")}
            face={({ figure, rest, date, chips }: ClaimFaceParts) => (
              <>
                <span className={LABEL}>
                  <TileIcon src={cdnFile("logo/chest.webp")} />
                  <span className="truncate">{rest}</span>
                </span>
                <span className="flex min-w-0 items-center gap-x-[0.4rem]">
                  {figure && <span className={FIGURE}>{figure}</span>}
                  <span className={META}>
                    <AsOf date={date} />
                    {chips}
                  </span>
                </span>
              </>
            )}
          />
        )}
      </div>

      {!stacked && actions}
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
