import { cdnFile } from "@/constants/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/features/portrait/ui/drawer";
import { motion } from "framer-motion";
import { ChevronDown, Crown, Gem, Medal, Sparkles } from "lucide-react";
import { useState } from "react";

export enum PortraitStyle {
  HIGHNESS = "highness",
  MONARCH = "monarch",
  ARISTOCRAT = "aristocrat",
  COMMANDER = "commander",
}

interface StylePickerDrawerProps {
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

export const StylePickerDrawer = ({
  selectedStyle,
  onStyleChange,
}: StylePickerDrawerProps) => {
  const [open, setOpen] = useState(false);

  const currentStyle = styles.find((s) => s.id === selectedStyle) || styles[0];
  const CurrentIcon = currentStyle.icon;
  const [isStylePickedOnce, setIsStylePickedOnce] = useState(false);
  const displayName = isStylePickedOnce ? currentStyle.name : "Pick Style";

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors">
          <CurrentIcon className="w-2.5 h-2.5" />
          <span>{displayName}</span>
          <ChevronDown className="w-2 h-2" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-card border-border">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-display text-lg tracking-[0.1em] text-center text-foreground">
            Select Style
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {styles.map((style) => {
              const Icon = style.icon;
              const isSelected = selectedStyle === style.id;

              return (
                <motion.button
                  key={style.id}
                  onClick={() => {
                    onStyleChange(style.id);
                    setIsStylePickedOnce(true);
                    setOpen(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-sm border transition-all duration-300 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-transparent hover:border-muted-foreground"
                  }`}
                >
                  {/* Preview Image or Icon */}
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
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {style.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {style.description}
                    </p>
                  </div>

                  {isSelected && (
                    <motion.div
                      layoutId="selected-style"
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
      </DrawerContent>
    </Drawer>
  );
};
