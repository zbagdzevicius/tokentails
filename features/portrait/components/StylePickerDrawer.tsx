import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Gem, Medal, Sparkles, ChevronDown } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/features/portrait/ui/drawer";
import { Button } from "@/features/portrait/ui/button";

const catKing = "/portrait/example-cat-king.jpg";
const catDuchess = "/portrait/example-cat-duchess.jpg";
const catGeneral = "/portrait/example-cat-general.jpg";

export type PortraitStyle = "ai" | "king" | "duchess" | "general";

interface StylePickerDrawerProps {
  selectedStyle: PortraitStyle;
  onStyleChange: (style: PortraitStyle) => void;
}

const styles: {
  id: PortraitStyle;
  name: string;
  description: string;
  icon: typeof Crown;
  preview?: string | any;
}[] = [
  {
    id: "ai",
    name: "AI Choice",
    description: "Let AI select the perfect style",
    icon: Sparkles,
  },
  {
    id: "king",
    name: "Monarch",
    description: "Regal & commanding presence",
    icon: Crown,
    preview: catKing,
  },
  {
    id: "duchess",
    name: "Aristocrat",
    description: "Elegant & refined nobility",
    icon: Gem,
    preview: catDuchess,
  },
  {
    id: "general",
    name: "Commander",
    description: "Military distinction & honor",
    icon: Medal,
    preview: catGeneral,
  },
];

export const StylePickerDrawer = ({
  selectedStyle,
  onStyleChange,
}: StylePickerDrawerProps) => {
  const [open, setOpen] = useState(false);

  const currentStyle = styles.find((s) => s.id === selectedStyle) || styles[0];
  const CurrentIcon = currentStyle.icon;
  const displayName = selectedStyle === "ai" ? "Pick Style" : currentStyle.name;

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
                  {style.preview ? (
                    <div className="w-full aspect-[3/4] rounded-sm overflow-hidden mb-1">
                      <img
                        src={style.preview}
                        alt={style.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-sm bg-muted/20 flex items-center justify-center mb-1">
                      <Icon
                        className={`w-8 h-8 ${
                          isSelected ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                    </div>
                  )}

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
