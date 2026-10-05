/**
 * MY HOME as the Cat Yard (shared/home-yard.ts): the Heist's voxel garden, golden-hour light and
 * camera, with the player's own cats wandering in it. Browser only (Game.tsx loads it with
 * next/dynamic, ssr: false).
 *
 * Everything HOME did stays: the HUD (GameSelect) still pushes CAT_EAT; here the active cat runs to
 * the bowls and eats, then CAT_EATEN fires and setCatStatus saves EAT (the tails reward and the
 * "Good job" toast come with it). SELECT on another cat's name card runs the same select flow as
 * the Phaser speech bubble. No scores are written.
 *
 * Falls back to the Phaser HOME (`fallback`) when WebGL is missing, the module does not load or has
 * another API version, the yard is not ready in time, or NEXT_PUBLIC_HOME_YARD switches it off.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CAT_API } from "@/api/cat-api";
import { reportAppError } from "@/analytics";
import { GameEvents } from "@/components/Phaser/events";
import { getReducedMotionOverride, getRenderTierSetting } from "@/components/Phaser/look/settings";
import { prefersReducedMotion } from "@/components/onboarding/useReducedMotion";
import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { StatusType } from "@/models/status";
import type { HomeYardAPI, HomeYardModule } from "@/shared-contracts/home-yard";
import { findOwnedCat, homeYardCats, isHungry } from "./homeYardCats";
import { homeYardEnabled, setHomeYardMode } from "./homeYardMode";
import { playHomeSound } from "./homeSfx";
import { HOME_YARD_ASSET_BASE, HomeYardLoadError, loadHomeYard } from "./loadHomeYard";
import { useSelectHomeCat } from "./useSelectHomeCat";

/** The yard must be ready (sheets loaded, cats placed) within this, or HOME falls back. */
export const HOME_YARD_TIMEOUT_MS = 15_000;

/** Room for the HOME HUD's feed panel under the yard's name card (CSS px above the safe area). */
export const CARD_ABOVE_FEED_PX = 132;
export const CARD_BOTTOM_PX = 16;

interface Props {
  /** The Phaser HOME, shown whenever the yard cannot be. */
  fallback: ReactNode;
  /** Injectable for tests. */
  loader?: () => Promise<HomeYardModule>;
  timeoutMs?: number;
  enabled?: boolean;
}

type State = "loading" | "ready" | "failed";

function reducedMotionNow(): boolean {
  const override = getReducedMotionOverride();
  if (override === "on") return true;
  if (override === "off") return false;
  return prefersReducedMotion();
}

export function HomeYard({ fallback, loader = loadHomeYard, timeoutMs = HOME_YARD_TIMEOUT_MS, enabled = homeYardEnabled() }: Props) {
  const { profile } = useProfile();
  const { cat, setCatStatus } = useCat();
  const { openedModal } = useGame();
  const selectCat = useSelectHomeCat();
  const { data: userCats } = useQuery({
    queryKey: ["user-cats", profile?._id],
    queryFn: () => CAT_API.cats(),
  });
  const [state, setState] = useState<State>(enabled ? "loading" : "failed");
  const hostRef = useRef<HTMLDivElement>(null);
  const yardRef = useRef<HomeYardAPI | null>(null);
  const feeding = useRef(false);

  const cats = useMemo(() => homeYardCats(userCats, profile?.cats, cat), [userCats, profile?.cats, cat]);
  // The yard's callbacks outlive renders: they read the latest values from here.
  const latest = useRef({ cats, cat, userCats, profileCats: profile?.cats, setCatStatus, selectCat });
  useEffect(() => {
    latest.current = { cats, cat, userCats, profileCats: profile?.cats, setCatStatus, selectCat };
  });

  // Which HOME is showing (mobile controls, HUD layout and backdrop follow it).
  useEffect(() => {
    setHomeYardMode(state === "failed" ? "phaser" : "yard");
  }, [state]);
  useEffect(() => () => setHomeYardMode(null), []);

  // Load the module and build the yard once; the cat list is pushed in by the effect below.
  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let api: HomeYardAPI | null = null;
    const fail = (error: unknown) => {
      if (!alive) return;
      alive = false;
      clearTimeout(timer);
      reportAppError("home_yard_fallback", error, {
        source: "manual",
        level: "scene",
        scene: "HomeYard",
        reason: error instanceof HomeYardLoadError ? error.reason : "error",
      });
      api?.dispose();
      api = null;
      yardRef.current = null;
      setState("failed");
    };
    const timer = setTimeout(() => fail(new HomeYardLoadError("Home yard was not ready in time", "timeout")), timeoutMs);

    const onFed = (id: string) => {
      const l = latest.current;
      playHomeSound("purr");
      if (id !== l.cat?._id) return;
      GameEvents.CAT_EATEN.push();
      if (isHungry(l.cat)) void l.setCatStatus({ type: StatusType.EAT, status: 4 });
    };

    loader()
      .then((mod) => {
        if (!alive) return null;
        try {
          api = mod.createHomeYard(host, {
            assetBase: HOME_YARD_ASSET_BASE,
            cats: latest.current.cats,
            quality: getRenderTierSetting(),
            reducedMotion: reducedMotionNow(),
            onChoose: (id) => {
              const l = latest.current;
              l.selectCat(findOwnedCat(id, l.userCats, l.profileCats));
            },
            onEating: () => playHomeSound("eat"),
            onFed,
            onSheetError: (id) => {
              const active = id === latest.current.cat?._id;
              reportAppError(
                active ? "player_texture_missing" : "npc_texture_missing",
                new Error(active ? "Player cat sheet failed" : "1 NPC sheets missing"),
                { source: "manual", level: "scene", scene: "HomeYard" },
              );
            },
          });
        } catch (error) {
          throw new HomeYardLoadError(`Home yard failed to start: ${(error as Error)?.message ?? error}`, "create");
        }
        yardRef.current = api;
        // End-to-end specs find cats on screen through this (never set in production).
        if ((window as unknown as { __TT_E2E__?: boolean }).__TT_E2E__) {
          (window as unknown as { __ttHomeYard?: HomeYardAPI }).__ttHomeYard = api;
        }
        return api.ready;
      })
      .then((ready) => {
        if (!alive || !ready) return;
        clearTimeout(timer);
        setState("ready");
        // `game_loaded` for HOME, as the Phaser scene sent it (no scene: the crash guard skips it).
        GameEvents.GAME_LOADED.push();
      })
      .catch(fail);

    return () => {
      alive = false;
      clearTimeout(timer);
      api?.dispose();
      yardRef.current = null;
    };
    // Built once per visit; later changes reach the yard through setCats / start / stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New cats, a new active cat, or a fed one.
  useEffect(() => {
    yardRef.current?.setCats(cats);
  }, [cats]);

  // No rendering under a game modal (the shop, the codex...).
  useEffect(() => {
    const yard = yardRef.current;
    if (!yard) return;
    if (openedModal) yard.stop();
    else yard.start();
  }, [openedModal, state]);

  // The HUD's feed button.
  useEffect(() => {
    const onEat = () => {
      const id = latest.current.cat?._id;
      const yard = yardRef.current;
      if (!id || !yard || feeding.current) return;
      feeding.current = true;
      void yard.feed(id).finally(() => {
        feeding.current = false;
      });
    };
    GameEvents.CAT_EAT.addEventListener(onEat);
    return () => GameEvents.CAT_EAT.removeEventListener(onEat);
  }, []);

  // A hungry cat meows a moment after HOME opens, and when a hungry cat becomes the active one.
  const hungry = isHungry(cat);
  useEffect(() => {
    if (state !== "ready" || !hungry) return;
    const t = setTimeout(() => playHomeSound("meow"), 2000);
    return () => clearTimeout(t);
  }, [state, cat?._id, hungry]);

  if (state === "failed") return <>{fallback}</>;

  const hostStyle = {
    "--chy-card-bottom": `${hungry ? CARD_ABOVE_FEED_PX : CARD_BOTTOM_PX}px`,
  } as CSSProperties;

  return (
    <div className="fixed inset-0 z-20" data-testid="home-yard" data-state={state}>
      <div ref={hostRef} className="absolute inset-0" style={hostStyle} />
      {state === "loading" && (
        <p
          role="status"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-secondary text-p3 uppercase tracking-wider text-tt-cream"
        >
          Opening your yard…
        </p>
      )}
    </div>
  );
}

export default HomeYard;
