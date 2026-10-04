import { bgStyle, cdnFile } from "@/constants/utils";
import { HUD_LEFT, HUD_RIGHT, HUD_TOP } from "@/components/audio/hudPlacement";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { useGame } from "@/context/GameContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import {
  getCatnipBreakdown,
  TOTAL_CATNIP_CAP,
} from "@/constants/catnip-accounting";
interface IGameStat {
  title: string;
  image: string;
  stat: string | number;
  bg: string;
  text: string;
  onClick: () => void;
}

export const GameStatSection = ({
  title,
  image,
  stat,
  bg,
  onClick,
}: IGameStat) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center font-secondary rounded-xl w-16 p-1 bg-gradient-to-r ${bg}`}
    >
      <div className="text-p4 whitespace-nowrap">{title}</div>
      <div className="flex items-center gap-1 -mt-1">
        <img draggable={false} className="w-6 h-6" src={image} />
        <div className="text-p2">{stat}</div>
      </div>
    </button>
  );
};

export const GameStatsSection = ({
  profile,
  setOpenedModal,
}: {
  profile: IProfile;
  setOpenedModal: (modal: GameModal) => void;
}) => {
  const { gameType } = useGame();
  const catnipBreakdown = getCatnipBreakdown({
    catnipChaos: profile?.catnipChaos,
    match3: profile?.match3,
  });

  if (!profile) {
    return <></>;
  }
  return (
    <div>
      {/* Corner panels, inset past the notch and the landscape camera cutout (hudPlacement). */}
      <div className="fixed flex-col pb-safe z-30 flex justify-between" style={{ top: HUD_TOP, right: HUD_RIGHT }}>
        {/* A real button (keyboard and screen readers). The picker's X no longer sits over it:
            GameSelectModal puts its X on the frame's stone post (plan G14). */}
        <button
          type="button"
          onClick={() => setOpenedModal(GameModal.PROFILE)}
          className="flex hover:brightness-110 flex-col w-20 relative items-center font-secondary rounded-xl pt-4 border-4 border-yellow-900 text-inherit focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
          style={bgStyle("min-4")}
        >
          {profile.cat && (
            <span className="relative -mb-4 block">
              <img
                draggable={false}
                alt=""
                className="w-20 h-20 -mt-8 pixelated"
                src={profile.cat?.catImg}
              />
            </span>
          )}
          <span className="text-p5 font-primary flex items-center gap-1">
            <span>ABOUT ME</span>
          </span>
        </button>
      </div>
      <div data-testid="hud-stats" className="fixed pb-safe z-20 flex flex-col justify-between" style={{ top: HUD_TOP, left: HUD_LEFT }}>
        <div
          onClick={() => setOpenedModal(GameModal.PROFILE)}
          className="flex hover:brightness-110 flex-col w-20 relative items-center font-primary rounded-xl px-1 py-1 whitespace-pre-line border-4 border-yellow-900"
          style={bgStyle("min-4")}
        >
          <div className="text-p5 flex items-center gap-1">
            <img
              draggable={false}
              className="h-4"
              src={cdnFile("logo/logo.webp")}
            />
            <div>TAILS</div>
          </div>
          <div className="flex items-center gap-2 bg-tt-cream/50 border border-yellow-900 rounded-lg w-full justify-center">
            <div className="text-[length:max(12px,0.75rem)] leading-snug">{profile?.tails?.toFixed(0) || 0}</div>
          </div>
          <div className="text-p5 flex items-center gap-1">
            <CatnipIcon size={16} alt="" />
            <div>CATNIP</div>
          </div>
          <div className="flex items-center text-[length:max(12px,0.75rem)] leading-snug bg-green-300/50 border border-yellow-900 rounded-lg w-full justify-center">
            {catnipBreakdown.totalCount} / {TOTAL_CATNIP_CAP}
          </div>
        </div>
        <div className="flex flex-col items-center ">
          {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
            <button
              type="button"
              onClick={() => setOpenedModal(GameModal.CODEX)}
              style={bgStyle("min-4")}
              className="group w-20 flex flex-col items-center font-primary text-p2 transition-all duration-300 hover:scale-110 px-0.5 py-0.5 rounded-xl relative border-4 border-yellow-900 overflow-hidden cursor-pointer shadow-[0_6px_0_0_rgba(120,53,15,0.25)]"
            >
              <img
                src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-multiply pointer-events-none"
                alt=""
              />
              <img
                src={cdnFile("cards/backgrounds/legendary-sparkle.webp")}
                className="absolute -top-3 left-1/2 -translate-x-1/2 h-8 w-8 object-contain opacity-60 animate-spin-slow pointer-events-none"
                alt=""
              />
              <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-r from-tt-cream/0 via-tt-cream/70 to-tt-cream/0 animate-pulse pointer-events-none" />
              <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-tt-cream border border-yellow-900 animate-ping pointer-events-none" />
              <img
                src={cdnFile("codex/codex-1.webp")}
                className="h-9 -my-1 -mb-1 relative z-10 drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-110"
              />
              <div className="text-[length:max(12px,0.75rem)] leading-snug tracking-[-0.04em] whitespace-nowrap pt-1 -mt-1 relative z-10 rounded-md border border-yellow-900 bg-yellow-50/90 px-px font-bold">
                PROGRESS
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
