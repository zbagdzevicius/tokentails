import { useEffect, useState } from "react";
import { PixelCat, useIntegerScale } from "@/components/onboarding/PixelCat";
import { starterLook } from "@/components/onboarding/starters";
import { heroFor, onboardingStore, useOnboardingSnapshot } from "@/components/onboarding/store";
import { useReducedMotion } from "@/components/onboarding/useReducedMotion";
import { cdnFile } from "@/constants/utils";
import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import type { ICat } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import { StatusType } from "@/models/status";
import classNames from "classnames";
import { useCallback } from "react";
import { MuteToggle } from "@/components/audio/AudioControls";
import { HUD_AUDIO_COLUMN, HUD_AUDIO_RIGHT, HUD_MUTE_TOP } from "@/components/audio/hudPlacement";
import { ImpactStrip } from "@/components/impact/ImpactStrip";
import { openProgress } from "@/components/impact/progressTab";
import { MeetShelterCatsButton, RescueTile, ShelterTile } from "@/components/impact/RescueTile";
import { useLobbyImpact } from "@/components/impact/useLobbyImpact";
import { GameEvents } from "../Phaser/events";
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

const GameSelectItem = ({
  gameType,
  setGameType,
}: {
  gameType: GameType;
  setGameType: (gameType: GameType | null) => void;
}) => {
  return (
    <button
      type="button"
      aria-label={gameType === GameType.HOME ? "Home" : gameType}
      className={classNames(
        "flex flex-col gap-1 transition relative glow-box opacity-50 brightness-125 hover:opacity-100 hover:brightness-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
        {
          "-rotate-6 hover:rotate-0": gameType === GameType.HOME,
        },
      )}
      onClick={() => setGameType(gameType)}
    >
      <img
        draggable={false}
        alt=""
        className="rem:w-[80px] hover:brightness-110 rem:min-w-[80px] rounded-xl hover:animate-hover border-[3px] border-yellow-900"
        src={gameTypeImages[gameType]}
      />
    </button>
  );
};

/** Night HUD plate (plan G6): the panel behind lobby HUD clusters, on the night palette. */
const NIGHT_PLATE =
  "bg-tt-night-800/85 border-2 border-tt-gold-500/60 shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] lowfx:shadow-[0_4px_0_rgb(var(--tt-night-950))]";

/**
 * The lobby hero slot (plan G3 step 7): the active cat, large, at an integer CSS scale of its
 * 48 px frame (never fractional, `image-rendering: pixelated`), on a gold nameplate. Right after
 * Meet your cat it shows the starter that was just committed (before the profile refresh), skips
 * its entrance animation (no second intro) and says which mode opens next.
 */
const LobbyHero = ({
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
  // One pause for the lobby's motion: the strip's control also stops the RESCUE heart (WCAG 2.2.2).
  const [motionPaused, setMotionPaused] = useState(false);
  // MEET SHELTER CATS (plan G4): the Shelter scene in one tap from the lobby, through the same
  // crash-proof storefront path Home's SHELTER button uses.
  const onShelter = () => setGameType(GameType.SHELTER);
  const { profile } = useProfile();
  const { heroCat: committedHero, justFinished, firstRunLabel } = useOnboardingSnapshot();
  const reducedMotion = useReducedMotion();
  // The cat fills rows 6 to 40 of its 48 px frame, so the slot crops the empty rows (below).
  const scale = useIntegerScale({ widthFraction: 0.4, heightFraction: 0.28, cap: 240, min: 2, max: 5, initial: 3 });
  const profileCat = profile?.cat as (ICat & { starterBreed?: string; isStarter?: boolean }) | undefined;
  const heroCat = heroFor(committedHero, profileCat?._id, !!profileCat);
  // The post-ceremony "no second intro" lasts one lobby entrance.
  useEffect(
    () => () => {
      if (onboardingStore.get().justFinished) onboardingStore.set({ justFinished: false });
    },
    [],
  );

  if (!profileCat && !heroCat) {
    return (
      <div className="mt-48 md:mt-24 animate-pulse">
        <img src={cdnFile("logo/paw.webp")} alt="" className="w-24 min-w-24 animate-spin-slow" />
      </div>
    );
  }

  // A starter shows its ceremony art (the same family the backend stores), other cats their GIF.
  const starter = profileCat?.isStarter && profileCat.starterBreed ? starterLook(profileCat.starterBreed) : null;
  const name = heroCat?.name || profileCat?.name || "";
  const image = heroCat?.image || starter?.idle || profileCat?.catImg || "";
  const still = heroCat?.still || starter?.still;
  const appear = !justFinished && !reducedMotion;

  return (
    <div
      className={classNames(
        "relative flex min-w-0 flex-col items-center",
        appear && "animate-appear",
      )}
    >
      <img
        draggable={false}
        alt="Token Tails"
        src={cdnFile("logo/logo-text.webp")}
        className="relative z-10 h-auto w-[min(56vw,16rem)] max-md:mt-24 md:w-56 lg:w-64"
      />
      <div className="relative mt-2 flex flex-col items-center" data-testid="lobby-hero">
        {/* Altar glow under the cat. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 48 * scale * 1.8,
            height: 48 * scale * 1.2,
            background:
              "radial-gradient(closest-side, rgb(var(--tt-gold-400) / 0.32), rgb(var(--tt-gold-400) / 0.1) 60%, transparent 75%)",
          }}
        />
        <PixelCat
          src={image}
          still={still}
          reducedMotion={reducedMotion}
          scale={scale}
          alt={name ? `${name}, your cat` : "Your cat"}
          testId="lobby-hero-cat"
          className="relative"
          style={{ marginTop: -6 * scale, marginBottom: -10 * scale }}
        />
        <span
          data-testid="lobby-hero-name"
          className="relative mt-1 inline-block max-w-[80vw] truncate bg-tt-gold-400 px-4 py-0.5 font-primary text-p3 uppercase leading-tight text-tt-gold-ink shadow-[inset_0_-3px_0_rgb(var(--tt-gold-500)),0_3px_0_rgb(var(--tt-gold-shadow)),0_0_0_3px_rgb(var(--tt-gold-shadow))]"
        >
          {name}
        </span>
        {/* RESCUE (impact) on the cat's left; on phones its second action, MEET SHELTER CATS,
            sits under it. Beside the cat, not over it. */}
        <div
          className="absolute right-full top-1/2 mr-3 flex -translate-y-1/2 flex-col items-center gap-3 md:mr-6"
          data-testid="lobby-rescue"
        >
          <RescueTile lifetimePaws={lobbyImpact.lifetimePaws} onOpen={onRescue} paused={motionPaused} />
          <MeetShelterCatsButton onOpen={onShelter} className="md:hidden" />
        </div>
        {/* HOME on the right; from md up the Shelter has its own tile under it. */}
        <div className="absolute left-full top-1/2 ml-3 flex -translate-y-1/2 flex-col items-center gap-4 md:ml-6">
          <GameSelectItem setGameType={setGameType} gameType={GameType.HOME} />
          <ShelterTile onOpen={onShelter} className="hidden md:flex" />
        </div>
      </div>
      {firstRunLabel ? (
        <p
          role="status"
          data-testid="lobby-first-run"
          className={classNames(
            "mt-6 whitespace-nowrap px-4 py-2 font-secondary text-p4 uppercase tracking-wider text-tt-cream",
            NIGHT_PLATE,
          )}
        >
          Up next: {firstRunLabel}
        </p>
      ) : (
        <>
          <span className="relative z-20 pt-4">
            <PixelButton onClick={onMyPets} text="MY PETS" />
          </span>
          <div className="mt-8 flex flex-col items-start gap-1 md:mt-6 lg:mt-10">
            <PixelButton size="lg" text="PLAY" onClick={onPlay} />
          </div>
        </>
      )}
      <ImpactStrip
        impact={lobbyImpact.impact}
        paw={lobbyImpact.paw}
        onOpenImpact={onRescue}
        paused={motionPaused}
        onPausedChange={setMotionPaused}
        className="mt-8 hidden md:flex lg:mt-10 [@media(max-height:640px)]:hidden"
      />
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
      <div
        className={classNames(
          "fixed left-1/2 right-1/2 translate-x-[50%] z-hud flex flex-col gap-2 items-center pb-safe pt-2 lg:pt-10",
          {
            "top-1/2 -translate-y-1/2": gameType === GameType.HOME,
            "top-4": gameType && gameType !== GameType.HOME,
            "lg:top-20": !gameType,
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
        {!gameType && (
          <>
            <img
              src="/mascots/actions/play_games.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden md:block fixed bottom-4 left-4 w-24 lg:w-36 -rotate-6 pointer-events-none select-none z-[20] drop-shadow-xl"
            />
            <img
              src="/mascots/tasks/celebrating_finishing_work.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden md:block fixed bottom-4 right-4 w-24 lg:w-36 rotate-6 pointer-events-none select-none z-[20] drop-shadow-xl"
            />
            <LobbyHero
              setGameType={setGameType}
              onMyPets={() => setOpenedModal(GameModal.CATS)}
              onPlay={() => setShowGameSelectModal(true)}
              onRescue={() => openProgress(setOpenedModal, "impact")}
            />
          </>
        )}
      </div>

      {/* Lobby HUD mute (plan G14 "Audio"), under Settings. Shown with the profile, like Settings,
          ABOUT ME and the music player (GameContext), so it never floats alone while loading.
          Outside the centred HUD column, whose transform would make it the containing block of a fixed element. */}
      {!gameType && profile && (
        <div className={HUD_AUDIO_COLUMN} style={{ top: HUD_MUTE_TOP, right: HUD_AUDIO_RIGHT }}>
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
