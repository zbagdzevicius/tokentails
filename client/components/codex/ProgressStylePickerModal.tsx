import { GameModal } from "@/components/ui/GameModal";
import { cdnFile } from "@/constants/utils";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import clsx from "clsx";
import { ChevronDown, Crown, Gem, Medal, Sparkles } from "lucide-react";
import { useState } from "react";

interface ProgressStylePickerModalProps {
  selectedStyle: PortraitStyle;
  onStyleChange: (style: PortraitStyle) => void;
}

const styles: {
  id: PortraitStyle;
  name: string;
  description: string;
  icon: typeof Crown;
}[] = [
  {
    id: PortraitStyle.HIGHNESS,
    name: "Highness",
    description: "Let us choose the perfect style for you",
    icon: Sparkles,
  },
  {
    id: PortraitStyle.MONARCH,
    name: "Monarch",
    description: "Regal & commanding presence",
    icon: Crown,
  },
  {
    id: PortraitStyle.ARISTOCRAT,
    name: "Aristocrat",
    description: "Elegant & refined nobility",
    icon: Gem,
  },
  {
    id: PortraitStyle.COMMANDER,
    name: "Commander",
    description: "Military distinction & honor",
    icon: Medal,
  },
];

/**
 * The portrait style picker opened from the Codex "immortalize your pet" flow. A GameModal sheet
 * (bottom sheet on phones, centred panel from `md`) on the nested layer, because it opens from
 * inside the Codex modal (plan G6 "Overlay migration").
 */
export const ProgressStylePickerModal = ({
  selectedStyle,
  onStyleChange,
}: ProgressStylePickerModalProps) => {
  const [open, setOpen] = useState(false);
  const [isStylePickedOnce, setIsStylePickedOnce] = useState(false);

  const currentStyle = styles.find((style) => style.id === selectedStyle) || styles[0];
  const CurrentIcon = currentStyle.icon;

  const handleSelectStyle = (style: PortraitStyle) => {
    onStyleChange(style);
    setIsStylePickedOnce(true);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        // The visible words come first in the name (WCAG label in name), then the current style.
        aria-label={`${isStylePickedOnce ? "Change style" : "Pick style"}, now ${currentStyle.name}`}
        // A 44 px target (px, not rem: phones scale rem with the viewport), a ghost action.
        className="flex min-h-[44px] items-center gap-1.5 px-3 font-primary text-p5 uppercase tracking-wide text-tt-gold-400 underline-offset-4 transition-colors hover:text-tt-cream hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-tt-gold-400 motion-reduce:transition-none"
      >
        <CurrentIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{isStylePickedOnce ? "Change style" : "Pick style"}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>

      <GameModal
        open={open}
        onOpenChange={setOpen}
        title="Select style"
        name="progress-style-picker"
        surface="sheet"
        size="xl"
        layer="modal-nested"
      >
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Portrait styles">
          {styles.map((style) => {
            const isSelected = selectedStyle === style.id;
            const Icon = style.icon;

            return (
              <li key={style.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectStyle(style.id)}
                  className={clsx(
                    "group relative flex h-full w-full flex-col items-center gap-2 rounded-md p-2 text-left transition-colors duration-200 md:p-3",
                    "outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-tt-night-800",
                    "active:translate-y-px motion-reduce:active:translate-y-0",
                    isSelected
                      ? "bg-tt-night-600 ring-2 ring-tt-gold-400"
                      : "bg-tt-night-900/70 ring-1 ring-tt-gold-500/30 hover:bg-tt-night-600/70 hover:ring-tt-gold-500/70"
                  )}
                >
                  <span className="block aspect-[3/4] w-full overflow-hidden rounded-sm bg-tt-night-950">
                    <img
                      src={cdnFile(`portrait/${style.id}.webp`)}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="flex w-full flex-col items-center text-center">
                    <span className="flex items-center gap-1 font-sans font-semibold text-p4 uppercase tracking-wider text-tt-cream">
                      <Icon
                        aria-hidden="true"
                        className={clsx("h-3.5 w-3.5", isSelected ? "text-tt-gold-400" : "text-tt-muted")}
                      />
                      {style.name}
                    </span>
                    <span className="mt-0.5 font-sans text-p6 leading-tight text-tt-muted">
                      {style.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </GameModal>
    </>
  );
};
