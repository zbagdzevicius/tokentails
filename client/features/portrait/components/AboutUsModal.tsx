import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/features/portrait/ui/drawer";
import { cdnFile } from "@/constants/utils";

interface AboutUsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AboutUsModal = ({ open, onOpenChange }: AboutUsModalProps) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="text-center pb-4 flex-shrink-0">
          <DrawerTitle className="text-2xl font-bold tracking-wide">
            About Token Tails
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground mt-2">
            Our Mission & Story
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Mission Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Our Mission
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Token Tails is a revolutionary platform that combines digital
              collectibles with real-world impact. Our mission is to save stray
              cats and dogs by creating a play-to-save ecosystem where every
              action in our game directly contributes to animal welfare.
            </p>
          </div>

          {/* What We Do Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              What We Do
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Digital Trading Cards:
                </strong>{" "}
                Collect unique Token Tails cards that represent real cats and
                dogs in need. Each card you collect and trade helps fund rescue
                operations and shelter support.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Pet Portraits:</strong>{" "}
                Transform your beloved pet into a royal masterpiece. Our
                AI-powered portrait service creates stunning, personalized
                artwork while supporting our mission to help strays.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Real-World Impact:</strong>{" "}
                Every purchase, trade, and interaction in Token Tails
                contributes to our partnerships with shelters worldwide, helping
                to feed, house, and find homes for animals in need.
              </p>
            </div>
          </div>

          {/* Impact Stats */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-foreground text-center">
              Our Impact
            </h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">800+</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Strays Saved
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">12+</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Countries
                </p>
              </div>
            </div>
          </div>

          {/* Vision */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Our Vision
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We envision a world where no cat or dog goes without a home, where
              digital innovation meets compassionate action, and where every
              player becomes a hero for animals in need. Join us in making a
              difference, one tail at a time.
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
