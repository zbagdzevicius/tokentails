import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/features/portrait/ui/drawer";
import { railCopyState, type RailCopyState } from "@/api/impact-api";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { useImpact } from "@/hooks/useImpact";
import Link from "next/link";

interface AboutUsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The words follow the rail (plan G11), from the same reading the landing uses
 * (`railCopyState`), so a paused rail reads "paused" everywhere. Amounts and payouts live on
 * /impact with their dates.
 */
export const RAIL_LINE_COPY: Record<RailCopyState, string> = {
  soon: "Real shelter treats open soon.",
  paused:
    "Shelter treats are paused right now. Past treats are listed on our impact page.",
  open: "Shelter treats are open now. Every one is listed on our impact page.",
  exhausted:
    "Today's shelter treats are used up. They open again at 00:00 UTC, and each one is listed on our impact page.",
};

/** Fetches the snapshot only while the drawer is open. */
const RailLine = () => {
  const { impact } = useImpact();
  return <>{RAIL_LINE_COPY[railCopyState(impact?.rail.state)]}</>;
};

export const AboutUsModal = ({ open, onOpenChange }: AboutUsModalProps) => {
  const isApp = isAppBuild();
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
              Token Tails is a cat game with real shelter cats in it. Play with
              your virtual cat, collect shelter cats, and check every real-world
              number, with its date and source, on our impact page.
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
                Collect Token Tails cards drawn from real cats at partner
                shelters.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Pet Portraits:</strong>{" "}
                Transform your beloved pet into a royal masterpiece. Our
                AI-powered portrait service creates stunning, personalized
                artwork.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Real-World Impact:</strong>{" "}
                {open ? <RailLine /> : null}
              </p>
            </div>
          </div>

          {/* Impact: every number lives on /impact with its date and source (plan G11). */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-center">
            <h3 className="text-lg font-semibold text-foreground">
              Our Impact
            </h3>
            <p className="text-sm text-muted-foreground">
              Payouts, rescue cats and reach, each with its date, status and
              source.
            </p>
            {isApp ? (
              <button
                type="button"
                onClick={() => void openWebImpact()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-foreground/30 px-4 text-sm font-semibold text-foreground"
              >
                See the impact page
              </button>
            ) : (
              <Link
                href="/impact"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-foreground/30 px-4 text-sm font-semibold text-foreground"
              >
                See the impact page
              </Link>
            )}
          </div>

          {/* Vision */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Our Vision
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We envision a world where no cat or dog goes without a home, and
              where a game can introduce millions of people to the shelter cats
              waiting for one. One tail at a time.
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
