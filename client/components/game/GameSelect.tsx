import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CAT_FRAME_PX, PixelCat } from "@/components/onboarding/PixelCat";
import { starterLook } from "@/components/onboarding/starters";
import { heroFor, onboardingStore, useOnboardingSnapshot } from "@/components/onboarding/store";
import { useReducedMotion } from "@/components/onboarding/useReducedMotion";
import { cdnFile, getNextDayMidnight } from "@/constants/utils";
import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import type { ICat } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import { StatusType } from "@/models/status";
import classNames from "classnames";
import { MuteToggle } from "@/components/audio/AudioControls";
import { HUD_AUDIO_COLUMN, HUD_MUTE_RIGHT, HUD_MUTE_TOP } from "@/components/audio/hudPlacement";
import { ImpactChip, ImpactStrip } from "@/components/impact/ImpactStrip";
import { openProgress } from "@/components/impact/progressTab";
import {
  LOBBY_TILE,
  LOBBY_TILE_BADGE,
  LOBBY_TILE_LABEL,
  LOBBY_TILE_SKY,
  LOBBY_TILE_STACK,
  MeetShelterCatsButton,
  RescueTile,
  ShelterTile,
} from "@/components/impact/RescueTile";
import { useLobbyImpact } from "@/components/impact/useLobbyImpact";
import { GameEvents } from "../Phaser/events";
import { DEFAULT_SPRITE_BOX, MD, lobbyLayout, type SpriteBox } from "./lobbyLayout";
import { PixelButton } from "../shared/PixelButton";
import { StatusBar } from "../shared/game/StatusBar";
import { GameSelectModal } from "../shared/GameSelectModal";

interface IProps {
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
}

const gameTypeImages: Partial<Record<GameType, string>> = {
  [GameType.HOME]: cdnFile("game/select/home.webp"),
};

/** The lobby HOME tile: the same solid frame as RESCUE, its art reads MY HOME. */
const HomeTile = ({ setGameType }: { setGameType: (gameType: GameType | null) => void }) => (
  <button
    type="button"
    aria-label="Home"
    className={classNames(LOBBY_TILE, LOBBY_TILE_SKY, "overflow-hidden")}
    onClick={() => setGameType(GameType.HOME)}
  >
    <img
      draggable={false}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      src={gameTypeImages[GameType.HOME]}
    />
  </button>
);

/** Night HUD plate (plan G6): the panel behind lobby HUD clusters, on the night palette. */
const NIGHT_PLATE =
  "bg-tt-night-800/85 border-2 border-tt-gold-500/60 shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] lowfx:shadow-[0_4px_0_rgb(var(--tt-night-950))]";

/** Viewport size (the initial containing block, the box the scene background covers) and safe areas. */
function useLobbyViewport() {
  const [view, setView] = useState<{
    width: number;
    height: number;
    safeTop: number;
    safeBottom: number;
    safeLeft: number;
    safeRight: number;
  } | null>(null);
  useEffect(() => {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)";
    document.body.appendChild(probe);
    const update = () => {
      const style = getComputedStyle(probe);
      setView({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        safeTop: parseFloat(style.paddingTop) || 0,
        safeBottom: parseFloat(style.paddingBottom) || 0,
        safeLeft: parseFloat(style.paddingLeft) || 0,
        safeRight: parseFloat(style.paddingRight) || 0,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      probe.remove();
    };
  }, []);
  return view;
}

/**
 * The box of the 48 px frame a cat sprite paints (its first frame): the rows put its feet on the
 * circle and the plate just over its head, the columns keep the tiles clear of it. Images that
 * cannot be read (a CDN without CORS) keep the default box.
 */
function useSpriteBox(src: string): SpriteBox {
  const [box, setBox] = useState<(SpriteBox & { src: string }) | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        const h = img.naturalHeight;
        // A sheet holds square frames side by side: read the first one.
        const w = Math.min(img.naturalWidth, h);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx || !w || !h) return;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        let first = -1;
        let last = -1;
        let minX = w;
        let maxX = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 16) {
              if (first < 0) first = y;
              last = y;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }
        }
        if (first < 0) return;
        const unit = CAT_FRAME_PX / h;
        // One px of slack around it: other animation frames can reach a little further.
        setBox({
          src,
          head: Math.max(0, Math.floor(first * unit) - 1),
          feet: Math.ceil((last + 1) * unit),
          left: Math.max(0, Math.floor(minX * unit) - 1),
          right: Math.min(CAT_FRAME_PX, Math.ceil((maxX + 1) * unit) + 1),
        });
      } catch {
        // A tainted canvas (no CORS): keep the default box.
      }
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return box && box.src === src ? box : DEFAULT_SPRITE_BOX;
}

/** Hours and minutes until `target`, refreshed every 20 s (no ticking seconds in the lobby). */
function useTimeLeft(target: Date | string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, new Date(target).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * The rendered width of an element outside the lobby (the guest pill lives in Game.tsx), kept
 * current with a ResizeObserver; 0 until it is found.
 */
function useElementWidth(selector: string, enabled: boolean): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let observer: ResizeObserver | null = null;
    let timer: number | undefined;
    const attach = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) {
        timer = window.setTimeout(attach, 250);
        return;
      }
      const read = () => setWidth(Math.ceil(el.getBoundingClientRect().width));
      read();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(read);
        observer.observe(el);
      }
    };
    attach();
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [selector, enabled]);
  return enabled ? width : 0;
}

/** The guest pill (Game.tsx) is on screen: the same rule Game uses to show it. */
function useGuestPillShown(): boolean {
  const auth = useOptionalFirebaseAuth();
  const status = auth?.authStatus;
  return status === "guest" || status === "signed-out" || (status === "profile-error" && !!auth?.user?.isAnonymous);
}

/**
 * The daily spin as a lobby tile, the same card as HOME: SPIN over the coin with a READY badge
 * when a spin is waiting, else NEXT SPIN, a smaller coin and the time left until midnight.
 */
const DailySpin = ({ canSpin, onOpen }: { canSpin: boolean; onOpen: () => void }) => {
  const left = useTimeLeft(getNextDayMidnight());
  return (
    <button
      type="button"
      data-testid="lobby-daily-spin"
      disabled={!canSpin}
      aria-label={canSpin ? "DAILY SPIN" : `Daily spin: next spin in ${left}`}
      onClick={onOpen}
      className={classNames(
        LOBBY_TILE,
        LOBBY_TILE_SKY,
        LOBBY_TILE_STACK,
        !canSpin && "cursor-default hover:translate-y-0 hover:brightness-100",
      )}
    >
      <span className={LOBBY_TILE_LABEL}>{canSpin ? "SPIN" : "NEXT SPIN"}</span>
      <img
        draggable={false}
        alt=""
        aria-hidden="true"
        className={classNames("pixelated", canSpin ? "h-[46%] w-[46%]" : "h-[30%] w-[30%]")}
        src={cdnFile("logo/coin.webp")}
      />
      {!canSpin && (
        <span className="font-primary text-[length:max(13px,0.85rem)] uppercase leading-none text-tt-night-950">{left}</span>
      )}
      {canSpin && (
        <span aria-hidden="true" className={LOBBY_TILE_BADGE}>
          READY
        </span>
      )}
    </button>
  );
};

/**
 * The lobby (plan G3 step 7): a composed scene on the landing's night backdrop. The active cat,
 * at an integer CSS scale of its 48 px frame (`image-rendering: pixelated`), stands on the
 * backdrop's own altar, its feet on the rune circle (lobbyLayout.ts places everything around that
 * anchor). Right after Meet your cat it shows the starter that was just committed (before the
 * profile refresh), skips its entrance animation (no second intro) and says which mode opens next.
 */
const LobbyScene = ({
  setGameType,
  onMyPets,
  onPlay,
  onRescue,
}: {
  setGameType: (gameType: GameType | null) => void;
  onMyPets: () => void;
  onPlay: () => void;
  onRescue: () => void;
}) => {
  const lobbyImpact = useLobbyImpact();
  const { setOpenedModal } = useGame();
  // One pause for the lobby's motion: the strip's control also stops the RESCUE heart (WCAG 2.2.2).
  const [motionPaused, setMotionPaused] = useState(false);
  // MEET SHELTER CATS (plan G4): the Shelter scene in one tap from the lobby, through the same
  // crash-proof storefront path Home's SHELTER button uses.
  const onShelter = () => setGameType(GameType.SHELTER);
  const { profile } = useProfile();
  const { heroCat: committedHero, justFinished, firstRunLabel } = useOnboardingSnapshot();
  const reducedMotion = useReducedMotion();
  const view = useLobbyViewport();
  const pill = useGuestPillShown();
  const pillWidth = useElementWidth('[data-testid="guest-pill"] > button', pill);
  const [stripHeight, setStripHeight] = useState(0);
  // The plate row's natural width (the full name, not its truncation, plus MY PETS).
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const petsRef = useRef<HTMLSpanElement | null>(null);
  const [plateWidth, setPlateWidth] = useState(0);
  const stripObserver = useRef<ResizeObserver | null>(null);
  const stripRef = useCallback((node: HTMLDivElement | null) => {
    stripObserver.current?.disconnect();
    stripObserver.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setStripHeight(Math.ceil(node.getBoundingClientRect().height)));
    observer.observe(node);
    stripObserver.current = observer;
  }, []);
  const profileCat = profile?.cat as (ICat & { starterBreed?: string; isStarter?: boolean }) | undefined;
  const heroCat = heroFor(committedHero, profileCat?._id, !!profileCat);
  // A starter shows its ceremony art (the same family the backend stores), other cats their GIF.
  const starter = profileCat?.isStarter && profileCat.starterBreed ? starterLook(profileCat.starterBreed) : null;
  const name = heroCat?.name || profileCat?.name || "";
  const image = heroCat?.image || starter?.idle || profileCat?.catImg || "";
  const still = heroCat?.still || starter?.still;
  const sprite = useSpriteBox(image);
  const layout = useMemo(
    () => lobbyLayout({ ...(view ?? { width: 1280, height: 800 }), pill, pillWidth, plateWidth, stripHeight, sprite }),
    [view, pill, pillWidth, plateWidth, stripHeight, sprite],
  );
  // Re-measured when the name or the root size (the viewport) changes; 24 px is the label padding.
  useEffect(() => {
    const nameW = nameRef.current?.scrollWidth ?? 0;
    const petsW = petsRef.current?.offsetWidth ?? 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nameW) setPlateWidth(Math.ceil(nameW + 24 + (petsW ? 12 + petsW : 0)));
  }, [name, view, firstRunLabel]);
  // The post-ceremony "no second intro" lasts one lobby entrance.
  useEffect(
    () => () => {
      if (onboardingStore.get().justFinished) onboardingStore.set({ justFinished: false });
    },
    [],
  );
  // Large screens step the root size up while the lobby is shown, so the whole HUD scales with the
  // scene (styles/globals.scss, lobbyRem).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-lobby-hud", "");
    return () => root.removeAttribute("data-lobby-hud");
  }, []);

  const { stage, cat, plate, logo, strip, leftWing, rightWing, dock, mode, shadow, chip } = layout;
  const width = view?.width ?? 1280;
  const phone = width < MD;
  const hasCat = !!(profileCat || heroCat);
  const appear = !justFinished && !reducedMotion;
  const wingClass = (wing: typeof leftWing) =>
    classNames(
      "pointer-events-none absolute flex [&>*]:pointer-events-auto",
      wing.direction === "row" ? "flex-row items-end" : "flex-col items-center",
    );
  const wingStyle = (wing: typeof leftWing) =>
    ({ left: wing.left, right: wing.right, top: wing.top, gap: Math.round(0.75 * layout.rem), "--lobby-tile": `${layout.tile}px` }) as CSSProperties;
  // PLAY (PixelButton lg) is drawn wider than its layout box (scaled 1.25 on phones, 2 from md up,
  // times the dock's own scale): margins keep PACKS and EVENTS clear of it. Its box is ~6.5rem.
  const playDrawn = (phone ? 1.25 : 2) * dock.playScale;
  const playBleed = Math.round(0.9 * (playDrawn - 1) * 3.25 * layout.rem);
  const sideButton = (text: string, onClick: () => void) => (
    <span
      className="inline-flex"
      style={dock.buttonScale !== 1 ? { transform: `scale(${dock.buttonScale})` } : undefined}
    >
      <PixelButton onClick={onClick} text={text} className="min-h-[44px] min-w-[6.75rem]" />
    </span>
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-hud overflow-hidden"
      data-testid="lobby-scene"
      data-mode={mode}
      data-circle={`${Math.round(stage.cx)} ${Math.round(stage.cy)} ${Math.round(stage.rx)} ${Math.round(stage.ry)}`}
      // Placed from the measured viewport: hidden for the one frame before it is known.
      style={{ visibility: view ? undefined : "hidden" }}
    >
      {strip.visible && (
        <div
          ref={stripRef}
          className="absolute -translate-x-1/2"
          style={{ left: width / 2, top: strip.top, width: strip.width }}
        >
          <ImpactStrip
            impact={lobbyImpact.impact}
            paw={lobbyImpact.paw}
            onOpenImpact={onRescue}
            paused={motionPaused}
            onPausedChange={setMotionPaused}
            fill
            stacked={strip.stacked}
            className="hidden md:flex [@media(max-height:640px)]:hidden"
          />
        </div>
      )}

      <img
        draggable={false}
        alt="Token Tails"
        src={cdnFile("logo/logo-text.webp")}
        data-testid="lobby-logo"
        className="absolute select-none drop-shadow-[0_6px_18px_rgb(var(--tt-night-950)/0.6)]"
        style={{ left: logo.left, top: logo.top, width: logo.width, height: logo.height }}
      />

      {chip.visible && (
        <ImpactChip
          paw={lobbyImpact.paw}
          onOpenImpact={onRescue}
          className="absolute"
          style={{ left: chip.left, top: chip.top, width: chip.width, minHeight: chip.height }}
        />
      )}

      {hasCat ? (
        <div
          data-testid="lobby-hero"
          data-sprite-rows={`${sprite.head} ${sprite.feet}`}
          data-sprite-cols={`${sprite.left} ${sprite.right}`}
          className={classNames("absolute", appear && "animate-appear")}
          style={{ left: cat.left, top: cat.top, width: cat.size, height: cat.size }}
        >
          {/* The name (a caption, not a button) and MY PETS float a clear gap over the cat's head,
              centred on the circle; both are the button's height, their words on one line (the
              label's text sits up by the button's bottom bevel). */}
          <div
            className="absolute flex -translate-x-1/2 items-center justify-center gap-3"
            style={{
              left: stage.cx - cat.left,
              bottom: cat.top + cat.size - plate.bottom,
              height: plate.height,
              maxWidth: plate.maxWidth,
              width: "max-content",
            }}
          >
            <span
              data-testid="lobby-hero-name"
              title={name}
              className="flex h-full min-w-0 items-center rounded-lg bg-tt-night-800/60 px-3 pb-[3px] font-primary text-p3 uppercase leading-none text-tt-gold-400 [text-shadow:0_2px_0_rgb(var(--tt-night-950))]"
            >
              <span ref={nameRef} className="truncate">
                {name}
              </span>
            </span>
            {!firstRunLabel && (
              <span ref={petsRef} className="pointer-events-auto shrink-0">
                <PixelButton onClick={onMyPets} text="MY PETS" className="min-h-[44px]" />
              </span>
            )}
          </div>
          {/* Contact shadow: the cat stands on the altar rather than floating over it. */}
          <span
            aria-hidden="true"
            data-testid="lobby-hero-shadow"
            className="pointer-events-none absolute rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.45),rgb(0_0_0/0))]"
            style={{
              left: shadow.cx - cat.left - shadow.width / 2,
              top: shadow.cy - cat.top - shadow.height / 2,
              width: shadow.width,
              height: shadow.height,
            }}
          />
          <PixelCat
            src={image}
            still={still}
            reducedMotion={reducedMotion}
            scale={layout.scale}
            alt={name ? `${name}, your cat` : "Your cat"}
            testId="lobby-hero-cat"
            className="absolute left-0 top-0"
          />
        </div>
      ) : (
        <div
          className="absolute -translate-x-1/2 -translate-y-full animate-pulse"
          style={{ left: stage.cx, top: layout.feetY }}
        >
          <img src={cdnFile("logo/paw.webp")} alt="" className="w-24 min-w-24 animate-spin-slow" />
        </div>
      )}

      {/* RESCUE (impact) and MEET SHELTER CATS; SHELTER sits next to the altar. */}
      <div data-testid="lobby-rescue" className={wingClass(leftWing)} style={wingStyle(leftWing)}>
        <RescueTile lifetimePaws={lobbyImpact.lifetimePaws} onOpen={onRescue} paused={motionPaused} />
        <MeetShelterCatsButton onOpen={onShelter} className="md:hidden" />
        <ShelterTile onOpen={onShelter} className="hidden md:flex" />
      </div>
      {/* HOME (next to the altar) and the daily spin. */}
      <div
        data-testid="lobby-home"
        className={classNames(wingClass(rightWing), rightWing.direction === "row" && "flex-row")}
        style={wingStyle(rightWing)}
      >
        <HomeTile setGameType={setGameType} />
        {profile && (
          <DailySpin canSpin={!!profile.canRedeemLives} onOpen={() => setOpenedModal(GameModal.SPIN_WHEEL)} />
        )}
      </div>

      {/* PACKS, PLAY, EVENTS on the altar steps, like the landing's PLAY GAME row. */}
      <div
        data-testid="lobby-dock"
        className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center [&>*]:pointer-events-auto"
        style={{ left: stage.cx, top: dock.centerY, gap: dock.gap }}
      >
        {profile && sideButton("PACKS", () => setOpenedModal(GameModal.PACKS))}
        {firstRunLabel ? (
          <p
            role="status"
            data-testid="lobby-first-run"
            className={classNames(
              "max-w-[min(14rem,34vw)] px-3 py-2 text-center font-secondary text-p4 uppercase tracking-wider text-tt-cream",
              NIGHT_PLATE,
            )}
          >
            Up next: {firstRunLabel}
          </p>
        ) : (
          hasCat && (
            <span
              style={{
                marginLeft: playBleed,
                marginRight: playBleed,
                transform: dock.playScale !== 1 ? `scale(${dock.playScale})` : undefined,
              }}
            >
              <PixelButton size="lg" text="PLAY" onClick={onPlay} />
            </span>
          )
        )}
        {profile && sideButton("EVENTS", () => setOpenedModal(GameModal.QUESTS))}
      </div>

      {layout.mascots.visible && (
        <>
          <img
            src="/mascots/actions/play_games.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute -rotate-3 select-none drop-shadow-xl"
            style={{ left: "max(1rem, env(safe-area-inset-left))", bottom: layout.mascots.bottom, width: layout.mascots.width }}
          />
          <img
            src="/mascots/tasks/celebrating_finishing_work.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute rotate-3 select-none drop-shadow-xl"
            style={{ right: "max(1rem, env(safe-area-inset-right))", bottom: layout.mascots.bottom, width: layout.mascots.width }}
          />
        </>
      )}
    </div>
  );
};

export const GameSelect = ({ setGameType, gameType }: IProps) => {
  const { cat } = useCat();
  const { setOpenedModal } = useGame();
  const { profile } = useProfile();
  const [showGameSelectModal, setShowGameSelectModal] = useState(false);

  const onFeedClick = useCallback(() => {
    GameEvents.CAT_EAT.push();
  }, []);
  return (
    <>
      {gameType && (
      <div
        className={classNames(
          "fixed left-1/2 right-1/2 translate-x-[50%] z-hud flex flex-col gap-2 items-center pb-safe pt-2 lg:pt-10",
          {
            "top-1/2 -translate-y-1/2": gameType === GameType.HOME,
            "top-4": gameType && gameType !== GameType.HOME,
          },
        )}
      >
        {gameType && (
          <span
            className={classNames("", {
              "mt-40 md:mt-36":
                gameType === GameType.HOME && (cat?.status.EAT || 0) >= 4,
              "mt-64 md:mt-56":
                gameType === GameType.HOME && (cat?.status.EAT || 0) < 4,
            })}
          >
            <span className="flex gap-2">
              <PixelButton
                text="← GO BACK"
                onClick={() => setGameType(null)}
              />
              {gameType === GameType.HOME && (
                <PixelButton
                  text="SHELTER"
                  onClick={() => setGameType(GameType.SHELTER)}
                />
              )}
              {gameType === GameType.SHELTER && (
                <PixelButton
                  text="HOME"
                  onClick={() => setGameType(GameType.HOME)}
                />
              )}
            </span>
          </span>
        )}
        {gameType === GameType.HOME && cat && (cat.status.EAT || 0) < 4 && (
          <div className={classNames("flex flex-col items-center gap-2 px-3 pb-3 pt-1", NIGHT_PLATE)}>
            <PixelButton text="Feed To Control" onClick={onFeedClick} />

            {cat && (
              <div className="w-36">
                <StatusBar
                  status={cat.status[StatusType.EAT]!}
                  type={StatusType.EAT}
                />
              </div>
            )}
          </div>
        )}
      </div>
      )}
      {!gameType && (
        <LobbyScene
          setGameType={setGameType}
          onMyPets={() => setOpenedModal(GameModal.CATS)}
          onPlay={() => setShowGameSelectModal(true)}
          onRescue={() => openProgress(setOpenedModal, "impact")}
        />
      )}

      {/* Lobby HUD mute (plan G14 "Audio"), under Settings. Shown with the profile, like Settings,
          ABOUT ME and the music player (GameContext), so it never floats alone while loading.
          Outside the centred HUD column, whose transform would make it the containing block of a fixed element. */}
      {!gameType && profile && (
        <div className={HUD_AUDIO_COLUMN} style={{ top: HUD_MUTE_TOP, right: HUD_MUTE_RIGHT }}>
          <MuteToggle />
        </div>
      )}

      {showGameSelectModal && (
        <GameSelectModal
          onClose={() => setShowGameSelectModal(false)}
          setGameType={setGameType}
        />
      )}
    </>
  );
};
