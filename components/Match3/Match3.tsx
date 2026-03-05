import { useEffect } from "react";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import dynamic from "next/dynamic";
import { cdnFile } from "@/constants/utils";
import { Match3Levels } from "./Match3Levels";
import { getMatch3LevelIndex, isMatch3LevelId, MATCH3_ARENA_BG } from "./match3.config";

const Match3Game = dynamic(() => import("./config"), { ssr: false });

function Match3() {
  const { level, setLevel } = useGame();
  const { profile } = useProfile();

  const bestScoreForLevel = (() => {
    if (!level || !isMatch3LevelId(level)) {
      return 0;
    }
    const levelIndex = getMatch3LevelIndex(level);
    if (levelIndex < 0) {
      return 0;
    }
    const rawScores = Array.isArray(profile?.match3Score) ? profile.match3Score : [];
    const numeric = Number(rawScores[levelIndex] ?? 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0;
    }
    return Math.floor(numeric);
  })();

  useEffect(() => {
    if (level && !isMatch3LevelId(level)) {
      setLevel(null);
    }
  }, [level, setLevel]);

  return (
    <div
      id="app"
      className="relative z-20 max-h-screen overflow-y-auto"
      style={{
        backgroundImage: `url(${MATCH3_ARENA_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {!level && <Match3Levels setSelectedLevel={setLevel} />}
      {level && isMatch3LevelId(level) && (
        <div className="relative h-screen max-h-screen w-full overflow-hidden">
          <Match3Game key={`${level}-${bestScoreForLevel}`} level={level} bestScore={bestScoreForLevel} />
          <button
            type="button"
            onClick={() => setLevel(null)}
            className="absolute right-3 top-3 z-[100] md:right-4 md:top-4"
          >
            <img
              draggable={false}
              src={cdnFile("icons/close.webp")}
              className="h-auto w-14 opacity-90 drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)] transition-all duration-300 hover:scale-110 hover:brightness-125 md:w-20"
              alt="close"
            />
          </button>
        </div>
      )}
    </div>
  );
}

export default Match3;
