/**
 * The Cat Yard HOME's HUD, laid out like the Heist's yard: GO BACK and SHELTER in the top-left
 * corner on the safe area, the title at the top, and the feed panel at the bottom centre. The
 * panel's measured height goes to the yard (homeYardMode), which lifts its name card above it.
 * Nothing covers the garden's centre.
 */
import { useEffect, useRef } from "react";
import classNames from "classnames";
import type { ICat } from "@/models/cats";
import { StatusType } from "@/models/status";
import { NIGHT_PLATE } from "@/components/game/nightPlate";
import { PixelButton } from "@/components/shared/PixelButton";
import { StatusBar } from "@/components/shared/game/StatusBar";
import { isHungry } from "./homeYardCats";
import { setHomeFeedPanelHeight } from "./homeYardMode";

interface Props {
  cat: ICat | null | undefined;
  onBack: () => void;
  onShelter: () => void;
  onFeed: () => void;
}

/** Reports the feed panel's height while it shows (0 once it hides). */
function useFeedPanelHeight(shown: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!shown || !el) {
      setHomeFeedPanelHeight(0);
      return;
    }
    const measure = () => setHomeFeedPanelHeight(el.getBoundingClientRect().height);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      setHomeFeedPanelHeight(0);
    };
  }, [shown]);
  return ref;
}

export const YardHomeHud = ({ cat, onBack, onShelter, onFeed }: Props) => {
  const hungry = !!cat && isHungry(cat);
  const feedRef = useFeedPanelHeight(hungry);
  return (
    <>
      <div
        className="fixed z-hud flex gap-2"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))", left: "max(0.75rem, env(safe-area-inset-left))" }}
        data-testid="home-yard-nav"
      >
        <PixelButton text="← GO BACK" onClick={onBack} />
        <PixelButton text="SHELTER" onClick={onShelter} />
      </div>
      <div
        className="pointer-events-none fixed left-1/2 z-hud -translate-x-1/2 text-center top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] md:top-[max(1rem,env(safe-area-inset-top))]"
        aria-hidden="true"
      >
        <p className="whitespace-nowrap font-primary text-p1 uppercase leading-none text-tt-cream [text-shadow:0_3px_0_rgb(var(--tt-night-950))] md:text-h6">
          My Home
        </p>
      </div>
      {hungry && cat && (
        <div
          ref={feedRef}
          className={classNames("fixed left-1/2 z-hud flex -translate-x-1/2 flex-col items-center gap-2 px-3 pb-3 pt-2", NIGHT_PLATE)}
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          data-testid="home-yard-feed"
        >
          <PixelButton text={`FEED ${cat.name}`} onClick={onFeed} />
          <div className="w-36">
            <StatusBar status={cat.status?.[StatusType.EAT] ?? 0} type={StatusType.EAT} />
          </div>
        </div>
      )}
    </>
  );
};

export default YardHomeHud;
