import { cdnFile } from "@/constants/utils";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Crown, Gem, Medal, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";
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

export const ProgressStylePickerModal = ({
  selectedStyle,
  onStyleChange,
}: ProgressStylePickerModalProps) => {
  const [open, setOpen] = useState(false);
  const [isStylePickedOnce, setIsStylePickedOnce] = useState(false);

  const currentStyle = styles.find((style) => style.id === selectedStyle) || styles[0];
  const CurrentIcon = currentStyle.icon;
  const displayName = isStylePickedOnce ? currentStyle.name : "Pick Style";
  const canRenderPortal = typeof window !== "undefined";

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
        className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        <CurrentIcon className="w-2.5 h-2.5" />
        <span>{displayName}</span>
        <ChevronDown className="w-2 h-2" />
      </button>

      {canRenderPortal &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <>
                <motion.button
                  type="button"
                  aria-label="Close style picker"
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-[230] bg-black/80"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />

                <div className="fixed inset-0 z-[240] flex items-end justify-center p-3 pointer-events-none md:p-0 md:pb-8">
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Select style"
                    className="pointer-events-auto relative w-full max-h-[86vh] overflow-y-auto rounded-t-[10px] border border-yellow-900 bg-gradient-to-b from-yellow-100/98 to-orange-100/98 backdrop-blur-md md:w-[min(980px,94vw)] md:rounded-2xl"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply pointer-events-none"
                      alt="style picker pattern"
                    />
                    <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
                    <div className="relative z-10 flex items-center justify-between px-4 pb-1 pt-3">
                      <div className="w-6" />
                      <h3 className="text-display text-lg tracking-[0.1em] text-center text-yellow-900">
                        Select Style
                      </h3>
                      <button
                        type="button"
                        aria-label="Close style picker"
                        onClick={() => setOpen(false)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-yellow-900/50 bg-yellow-50/90 text-yellow-900 transition-colors hover:bg-yellow-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="px-4 pb-6 relative z-10">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {styles.map((style) => {
                          const isSelected = selectedStyle === style.id;

                          return (
                            <motion.button
                              type="button"
                              key={style.id}
                              onClick={() => handleSelectStyle(style.id)}
                              whileTap={{ scale: 0.98 }}
                              className={`relative flex flex-col items-center gap-2 p-3 rounded-sm border transition-all duration-300 ${
                                isSelected
                                  ? "border-yellow-900 bg-yellow-50 shadow-[0_4px_0_0_rgba(120,53,15,0.18)]"
                                  : "border-yellow-900/60 bg-yellow-50/80 hover:border-yellow-900 hover:bg-yellow-50"
                              }`}
                            >
                              <div className="w-full aspect-[3/4] rounded-sm overflow-hidden mb-1">
                                <img
                                  src={cdnFile(`portrait/${style.id}.webp`)}
                                  alt={style.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>

                              <div className="text-center">
                                <p
                                  className={`text-xs tracking-[0.1em] uppercase font-medium ${
                                    isSelected ? "text-yellow-900" : "text-yellow-900/90"
                                  }`}
                                >
                                  {style.name}
                                </p>
                                <p className="text-[10px] text-yellow-900/80 mt-0.5 leading-tight">
                                  {style.description}
                                </p>
                              </div>

                              {isSelected && (
                                <motion.div
                                  layoutId="selected-progress-style"
                                  className="absolute inset-0 border-2 border-primary rounded-sm pointer-events-none"
                                  transition={{
                                    type: "spring",
                                    bounce: 0.2,
                                    duration: 0.6,
                                  }}
                                />
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                </div>
              </>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
};
