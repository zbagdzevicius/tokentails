import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import { labelSet } from "./labels";
import { CHIP_STYLE, ChipKind, TONES } from "./tiers";

interface EvidenceChipProps {
  kind: ChipKind;
  isApp: boolean;
  className?: string;
}

/** A tier or status chip: words plus an icon, never colour alone (plan F7.2). */
export const EvidenceChip = ({ kind, isApp, className }: EvidenceChipProps) => {
  const { tone, icon } = CHIP_STYLE[kind];
  const labels = labelSet(isApp);
  return (
    <span
      data-chip={kind}
      // What the chip means, on hover and long-press ("IN-GAME": game numbers, never money).
      title={labels.explain[kind]}
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 align-middle font-primary text-[11px] uppercase leading-none tracking-wide md:text-[12px]",
        TONES[tone].className,
        className
      )}
    >
      <PixelIcon name={icon} size={12} />
      {labels.chip[kind]}
    </span>
  );
};

export default EvidenceChip;
