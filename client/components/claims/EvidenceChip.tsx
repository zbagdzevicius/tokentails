import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import { labelSet } from "./labels";
import { CHIP_STYLE, ChipKind, TONES } from "./tiers";

interface EvidenceChipProps {
  kind: ChipKind;
  isApp: boolean;
  /**
   * Board tiles: the label's first part only ("ON-CHAIN" for "ON-CHAIN · SHELTER WALLET"), with the
   * full label and its meaning in the tooltip and in the accessible name.
   */
  compact?: boolean;
  className?: string;
}

/** A tier or status chip: words plus an icon, never colour alone (plan F7.2). */
export const EvidenceChip = ({ kind, isApp, compact = false, className }: EvidenceChipProps) => {
  const { tone, icon } = CHIP_STYLE[kind];
  const labels = labelSet(isApp);
  const full = labels.chip[kind];
  const short = compact ? full.split(" · ")[0] : full;
  // Board tiles: LIVE is a small pixel dot plus its word; the other chips are square pixel tags.
  const liveDot = compact && kind === "live";
  return (
    <span
      data-chip={kind}
      // What the chip means, on hover and long-press ("IN-GAME": game numbers, never money).
      title={short === full ? labels.explain[kind] : `${full}: ${labels.explain[kind]}`}
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap align-middle font-primary uppercase leading-none tracking-wide",
        compact ? "rounded-[2px] border-2 px-1 py-px text-[10px]" : "rounded-md border px-1.5 py-0.5 text-[11px] md:text-[12px]",
        liveDot ? "border-transparent bg-transparent px-0 text-tt-mint" : TONES[tone].className,
        className
      )}
    >
      {liveDot ? (
        <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 bg-current shadow-[0_0_4px_currentColor]" />
      ) : (
        <PixelIcon name={icon} size={compact ? 10 : 12} />
      )}
      {short === full ? (
        full
      ) : (
        <>
          <span aria-hidden="true">{short}</span>
          <span className="sr-only">{full}</span>
        </>
      )}
    </span>
  );
};

export default EvidenceChip;
