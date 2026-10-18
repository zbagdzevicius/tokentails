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
  return (
    <span
      data-chip={kind}
      // What the chip means, on hover and long-press ("IN-GAME": game numbers, never money).
      title={short === full ? labels.explain[kind] : `${full}: ${labels.explain[kind]}`}
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 align-middle font-primary text-[11px] uppercase leading-none tracking-wide md:text-[12px]",
        TONES[tone].className,
        className
      )}
    >
      <PixelIcon name={icon} size={12} />
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
