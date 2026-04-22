import { USER_API } from "@/api/user-api";
import { cdnFile } from "@/constants/utils";
import {
  CATNIP_CHAOS_TOTAL_CAP,
  getCatnipBreakdown,
  MATCH3_TOTAL_CAP,
} from "@/constants/catnip-accounting";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import {
  MATCH3_LEVELS,
  MATCH3_LEVEL_BY_ID,
  MATCH3_LEVELS_PER_WORLD,
  MATCH3_TILE_ASSETS,
  MATCH3_TILE_BY_TYPE,
  MATCH3_WORLD_COUNT,
  getMatch3LevelIndex,
  getMatch3WorldByLevelId,
} from "./match3.config";

interface IProps {
  setSelectedLevel: (level: string) => void;
}

const PAW_MATCH_LEADERBOARD_TOP = 120;

export const Match3Levels = ({ setSelectedLevel }: IProps) => {
  const { profile } = useProfile();
  const normalizedBestMatch3Score = useMemo(() => {
    const rawScores = Array.isArray(profile?.match3Score) ? profile.match3Score : [];
    return MATCH3_LEVELS.map((_level, index) => {
      const numeric = Number(rawScores[index] ?? 0);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
      }
      return Math.floor(numeric);
    });
  }, [profile?.match3Score]);
  const totalMatch3Score = useMemo(() => {
    const explicitTotal = Number(profile?.match3ScoreCount ?? 0);
    if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
      return Math.floor(explicitTotal);
    }
    return normalizedBestMatch3Score.reduce((acc, value) => acc + value, 0);
  }, [profile?.match3ScoreCount, normalizedBestMatch3Score]);
  const catnipBreakdown = useMemo(
    () =>
      getCatnipBreakdown({
        catnipChaos: profile?.catnipChaos,
        match3: profile?.match3,
      }),
    [profile?.catnipChaos, profile?.match3],
  );
  const normalizedBestCatnip = catnipBreakdown.match3;
  const match3CatnipEarned = catnipBreakdown.match3Count;
  const maxMatch3Catnip = MATCH3_TOTAL_CAP;
  const purrsuitCatnipEarned = catnipBreakdown.catnipChaosCount;
  const totalCatnipPool = catnipBreakdown.totalCount;

  const levelMeta = useMemo(() => {
    return MATCH3_LEVELS.map((level, index) => {
      const best = normalizedBestCatnip[index] || 0;
      const bestScore = normalizedBestMatch3Score[index] || 0;
      const unlockRequirement =
        index > 0 ? Math.max(1, Math.round(MATCH3_LEVELS[index - 1].catnipCap * 0.2)) : 0;
      const isUnlocked =
        index === 0 || (normalizedBestCatnip[index - 1] || 0) >= unlockRequirement;
      const stars =
        best >= level.catnipCap
          ? 3
          : best >= Math.round(level.catnipCap * 0.72)
            ? 2
            : best >= Math.round(level.catnipCap * 0.38)
              ? 1
              : 0;

      return {
        level,
        index,
        best,
        bestScore,
        unlockRequirement,
        isUnlocked,
        stars,
      };
    });
  }, [normalizedBestCatnip, normalizedBestMatch3Score]);

  const suggestedLevelIndex = useMemo(() => {
    const firstIncompleteUnlocked = levelMeta.find(
      (meta) => meta.isUnlocked && meta.best < meta.level.catnipCap,
    );

    if (firstIncompleteUnlocked) {
      return firstIncompleteUnlocked.index;
    }

    let latestUnlocked = 0;
    levelMeta.forEach((meta) => {
      if (meta.isUnlocked) {
        latestUnlocked = meta.index;
      }
    });
    return latestUnlocked;
  }, [levelMeta]);

  const suggestedWorldIndex = getMatch3WorldByLevelId(
    MATCH3_LEVELS[suggestedLevelIndex]?.id || MATCH3_LEVELS[0].id,
  );
  const [worldOverrideIndex, setWorldOverrideIndex] = useState<number | null>(null);
  const activeWorldIndex = worldOverrideIndex ?? suggestedWorldIndex;

  const suggestedLevel = levelMeta[suggestedLevelIndex];
  const suggestedObjective =
    MATCH3_TILE_BY_TYPE[suggestedLevel?.level.objectiveType || MATCH3_TILE_ASSETS[0].type];

  const worldStats = useMemo(() => {
    return Array.from({ length: MATCH3_WORLD_COUNT }, (_, worldIndex) => {
      const start = worldIndex * MATCH3_LEVELS_PER_WORLD;
      const end = start + MATCH3_LEVELS_PER_WORLD;
      const levels = levelMeta.slice(start, end);
      const unlocked = levels.filter((level) => level.isUnlocked).length;
      const earnedStars = levels.reduce((acc, level) => acc + level.stars, 0);
      const maxStars = levels.length * 3;
      return {
        worldIndex,
        unlocked,
        total: levels.length,
        earnedStars,
        maxStars,
      };
    });
  }, [levelMeta]);

  const worldStart = activeWorldIndex * MATCH3_LEVELS_PER_WORLD;
  const worldLevels = levelMeta.slice(worldStart, worldStart + MATCH3_LEVELS_PER_WORLD);
  const [leaderboardLevelId, setLeaderboardLevelId] = useState<string | null>(
    suggestedLevel?.level.id ?? MATCH3_LEVELS[0]?.id ?? null,
  );

  const selectedLeaderboardLevelId = leaderboardLevelId ?? worldLevels[0]?.level.id ?? MATCH3_LEVELS[0].id;
  const selectedLeaderboardLevel = MATCH3_LEVEL_BY_ID[selectedLeaderboardLevelId] ?? MATCH3_LEVELS[0];
  const selectedLeaderboardLevelIndex = getMatch3LevelIndex(selectedLeaderboardLevel.id);
  const profileId = profile?._id ?? null;
  const { data: levelLeaderboardProfiles, isLoading: isLeaderboardLoading } = useQuery({
    queryKey: ["paw-match-level-leaderboard", selectedLeaderboardLevelId],
    queryFn: () =>
      USER_API.leaderboardPawMatchLevel(selectedLeaderboardLevelId, PAW_MATCH_LEADERBOARD_TOP),
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
  const { data: myLeaderboardPositionData, isLoading: isMyPositionLoading } = useQuery({
    queryKey: ["paw-match-level-position", selectedLeaderboardLevelId, profileId],
    queryFn: () => USER_API.leaderboardPawMatchLevelPosition(selectedLeaderboardLevelId),
    enabled: !!profileId,
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const levelLeaderboardRows = useMemo(() => {
    const rows = (levelLeaderboardProfiles ?? [])
      .map((player, playerIndex) => {
        const levelScore = Math.max(0, Number(player.levelScore ?? 0));
        const totalScore = Math.max(0, Number(player.match3ScoreCount ?? 0));

        return {
          rank: 0,
          playerId: player._id || `${player.name || "anon"}-${playerIndex}`,
          playerName: player.name || "Anonymous Cat",
          levelScore,
          totalScore,
        };
      })
      .filter((row) => row.levelScore > 0)
      .sort(
        (a, b) =>
          b.levelScore - a.levelScore ||
          b.totalScore - a.totalScore ||
          a.playerName.localeCompare(b.playerName),
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));

    const myLevelScoreFromProfile = Math.max(
      0,
      Number(normalizedBestMatch3Score[selectedLeaderboardLevelIndex] ?? 0),
    );
    const myLevelScoreFromApi = Math.max(
      0,
      Number(myLeaderboardPositionData?.levelScore ?? 0),
    );
    const myLevelScore = Math.max(myLevelScoreFromProfile, myLevelScoreFromApi);
    const myTotalScoreFromApi = Math.max(
      0,
      Number(myLeaderboardPositionData?.match3ScoreCount ?? 0),
    );
    const myPlayerId = profileId || "__me";
    const isAlreadyIncluded = rows.some((row) => row.playerId === myPlayerId);
    if (myLevelScore > 0 && !isAlreadyIncluded) {
      rows.push({
        rank: 0,
        playerId: myPlayerId,
        playerName: profile?.name || "You",
        levelScore: myLevelScore,
        totalScore: Math.max(totalMatch3Score, myTotalScoreFromApi),
      });
    }

    return rows
      .sort(
        (a, b) =>
          b.levelScore - a.levelScore ||
          b.totalScore - a.totalScore ||
          a.playerName.localeCompare(b.playerName),
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [
    levelLeaderboardProfiles,
    selectedLeaderboardLevelIndex,
    profileId,
    normalizedBestMatch3Score,
    myLeaderboardPositionData?.levelScore,
    myLeaderboardPositionData?.match3ScoreCount,
    profile?.name,
    totalMatch3Score,
  ]);

  const topLeaderboardRows = levelLeaderboardRows.slice(0, 8);
  const myLeaderboardRank = useMemo(() => {
    if (typeof myLeaderboardPositionData?.position === "number") {
      return myLeaderboardPositionData.position;
    }
    const fallbackId = profileId || "__me";
    const row = levelLeaderboardRows.find((entry) => entry.playerId === fallbackId);
    return row?.rank ?? null;
  }, [myLeaderboardPositionData?.position, levelLeaderboardRows, profileId]);
  const myLevelScoreForSelectedLevel = useMemo(() => {
    const explicit = Number(myLeaderboardPositionData?.levelScore ?? 0);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.floor(explicit);
    }
    return Math.max(
      0,
      Math.floor(Number(normalizedBestMatch3Score[selectedLeaderboardLevelIndex] ?? 0)),
    );
  }, [
    myLeaderboardPositionData?.levelScore,
    normalizedBestMatch3Score,
    selectedLeaderboardLevelIndex,
  ]);

  return (
    <div className="relative z-20 flex flex-col items-center px-4 pb-16 pt-24 text-yellow-100 animate-opacity">
      <img
        src={cdnFile("tail/cat-promo.webp")}
        className="absolute -top-6 right-1 w-20 opacity-90 md:right-10 md:w-32"
        draggable={false}
        alt="cat mascot"
      />

      <Tag>PAW MATCH</Tag>
      <p className="mt-2 max-w-xl text-center font-primary text-p5 md:text-p4 text-yellow-100/95 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
        Build streaks, clear goals, and chain combos for max catnip rewards.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 font-primary">
        <div className="flex min-w-[9.6rem] flex-col items-center gap-x-2 rounded-lg border-2 border-yellow-200/80 bg-[#2b1b59]/95 px-2 pb-2 pt-1 shadow-[0_6px_0_0_rgba(34,19,73,0.65)] backdrop-blur-[2px]">
          <div className="flex items-center gap-1 text-p4 text-yellow-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            <img
              draggable={false}
              className="h-4 w-4"
              src={cdnFile("logo/catnip.webp")}
              alt="catnip"
            />
            <div>PAW MATCH</div>
          </div>
          <div className="flex w-full items-center justify-center rounded-lg border-2 border-yellow-300/80 bg-[#f8e8b8] px-2 text-p5 text-yellow-900 shadow-[inset_0_-2px_0_rgba(122,59,21,0.35)]">
            {match3CatnipEarned}/{maxMatch3Catnip}
          </div>
        </div>

        <div className="flex min-w-[9.6rem] flex-col items-center gap-x-2 rounded-lg border-2 border-yellow-200/80 bg-[#2b1b59]/95 px-2 pb-2 pt-1 shadow-[0_6px_0_0_rgba(34,19,73,0.65)] backdrop-blur-[2px]">
          <div className="flex items-center gap-1 text-p4 text-yellow-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            <img
              draggable={false}
              className="h-4 w-4"
              src={cdnFile("logo/catnip.webp")}
              alt="catnip"
            />
            <div>PURRSUIT</div>
          </div>
          <div className="flex w-full items-center justify-center rounded-lg border-2 border-yellow-300/80 bg-[#f8e8b8] px-2 text-p5 text-yellow-900 shadow-[inset_0_-2px_0_rgba(122,59,21,0.35)]">
            {purrsuitCatnipEarned}/{CATNIP_CHAOS_TOTAL_CAP}
          </div>
        </div>

        <div className="flex min-w-[9.6rem] flex-col items-center gap-x-2 rounded-lg border-2 border-yellow-200/80 bg-[#2b1b59]/95 px-2 pb-2 pt-1 shadow-[0_6px_0_0_rgba(34,19,73,0.65)] backdrop-blur-[2px]">
          <div className="flex items-center gap-1 text-p4 text-yellow-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            <img
              draggable={false}
              className="h-4 w-4"
              src={cdnFile("logo/catnip.webp")}
              alt="catnip"
            />
            <div>TOTAL POOL</div>
          </div>
          <div className="flex w-full items-center justify-center rounded-lg border-2 border-yellow-300/80 bg-[#f8e8b8] px-2 text-p5 text-yellow-900 shadow-[inset_0_-2px_0_rgba(122,59,21,0.35)]">
            {totalCatnipPool}
          </div>
        </div>
      </div>

      {suggestedLevel && (
        <div className="mt-4 w-full max-w-5xl rounded-2xl border-4 border-yellow-900 bg-gradient-to-br from-indigo-900/85 via-purple-900/80 to-pink-900/70 p-4 shadow-[0_10px_0_0_rgba(120,53,15,0.35)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-secondary text-p6 uppercase tracking-[0.16em] text-yellow-100/90">
                Continue Your Journey
              </div>
              <div className="mt-1 flex items-center gap-2 font-primary text-p3 text-yellow-100">
                <span>Level {suggestedLevel.level.id}</span>
                <span className="text-yellow-300">•</span>
                <span>{suggestedLevel.level.name}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-secondary text-p6 uppercase text-yellow-100/90">
                <span className="rounded-md border border-yellow-200/60 bg-black/35 px-2 py-1">
                  Goal {suggestedLevel.level.targetScore}
                </span>
                <span className="rounded-md border border-yellow-200/60 bg-black/35 px-2 py-1">
                  {suggestedLevel.level.timeLimit}s
                </span>
                <span className="rounded-md border border-yellow-200/60 bg-black/35 px-2 py-1">
                  Cap {suggestedLevel.level.catnipCap} catnip
                </span>
                <span className="rounded-md border border-yellow-200/60 bg-black/35 px-2 py-1">
                  Best score {suggestedLevel.bestScore.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 rounded-md border border-yellow-200/60 bg-black/35 px-2 py-1">
                  <img
                    src={suggestedObjective.src}
                    className="h-4 w-4 object-contain"
                    draggable={false}
                    alt={suggestedObjective.label}
                  />
                  {suggestedObjective.label} x{suggestedLevel.level.objectiveTarget}
                </span>
              </div>
            </div>
            <PixelButton
              text={`PLAY LEVEL ${suggestedLevel.level.id}`}
              onClick={() => setSelectedLevel(suggestedLevel.level.id)}
            />
          </div>
        </div>
      )}

      <div className="relative mt-4 w-full max-w-5xl overflow-hidden rounded-xl border-2 border-yellow-300/80 bg-[#24154a]/90 px-[7px] py-2 shadow-[0_8px_0_0_rgba(36,21,74,0.55)] backdrop-blur-[2px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(250,204,21,0.18)_0%,rgba(250,204,21,0)_42%),radial-gradient(circle_at_86%_22%,rgba(244,114,182,0.2)_0%,rgba(244,114,182,0)_45%),radial-gradient(circle_at_50%_110%,rgba(56,189,248,0.16)_0%,rgba(56,189,248,0)_50%),linear-gradient(160deg,rgba(18,9,43,0.88)_0%,rgba(44,18,90,0.72)_50%,rgba(76,23,85,0.72)_100%)]" />
        <div className="pointer-events-none absolute -left-12 top-8 h-28 w-28 rounded-full bg-yellow-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -right-10 bottom-6 h-24 w-24 rounded-full bg-pink-400/20 blur-2xl" />
        <div className="relative z-10 grid grid-cols-2 gap-[7px] sm:grid-cols-3 lg:grid-cols-6">
          {worldStats.map((world) => (
            <button
              key={world.worldIndex}
              type="button"
              onClick={() => {
                setWorldOverrideIndex(world.worldIndex);

                const nextWorldStart = world.worldIndex * MATCH3_LEVELS_PER_WORLD;
                const nextWorldLevels = levelMeta.slice(
                  nextWorldStart,
                  nextWorldStart + MATCH3_LEVELS_PER_WORLD,
                );
                const isCurrentInNextWorld = nextWorldLevels.some(
                  (meta) => meta.level.id === selectedLeaderboardLevelId,
                );
                if (!isCurrentInNextWorld) {
                  const nextFallbackLevelId =
                    nextWorldLevels.find((meta) => meta.isUnlocked)?.level.id ??
                    nextWorldLevels[0]?.level.id;
                  if (nextFallbackLevelId) {
                    setLeaderboardLevelId(nextFallbackLevelId);
                  }
                }
              }}
              className={`w-full min-w-0 rounded-lg border px-[9px] py-[7px] text-left leading-[1.15] transition-all duration-200 ${
                activeWorldIndex === world.worldIndex
                  ? "border-yellow-300 bg-[#f8e8b8] text-yellow-900 shadow-[0_4px_0_0_rgba(122,59,21,0.35)]"
                  : "border-yellow-300/85 bg-[#1f1543]/95 text-yellow-50 shadow-[0_4px_0_0_rgba(16,9,35,0.7)] hover:border-yellow-200 hover:bg-[#2b1d59]"
              }`}
            >
              <div
                className={`font-secondary text-[13px] uppercase tracking-[0.03em] md:text-[14px] lg:text-[15px] ${
                  activeWorldIndex === world.worldIndex
                    ? "text-yellow-900"
                    : "text-yellow-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"
                }`}
              >
                World {world.worldIndex + 1}
              </div>
              <div
                className={`font-secondary text-[11px] uppercase md:text-[12px] lg:text-[13px] ${
                  activeWorldIndex === world.worldIndex
                    ? "text-yellow-900/90"
                    : "text-yellow-100/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                }`}
              >
                {world.unlocked}/{world.total} unlocked • {world.earnedStars}/{world.maxStars} stars
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 w-full max-w-5xl rounded-2xl border-4 border-yellow-900 bg-gradient-to-br from-indigo-950/85 via-purple-900/80 to-pink-900/70 p-4 shadow-[0_8px_0_0_rgba(120,53,15,0.35)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-secondary text-p6 uppercase tracking-[0.16em] text-yellow-100/90">
              Paw Match Leaderboard
            </div>
            <div className="mt-1 flex items-center gap-2 font-primary text-p4 text-yellow-100">
              <span>Level {selectedLeaderboardLevel.id}</span>
              <span className="text-yellow-300">•</span>
              <span>{selectedLeaderboardLevel.name}</span>
            </div>
            <div className="mt-1 font-secondary text-[11px] uppercase text-yellow-100/85">
              Ranked by highest score on this level
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {worldLevels.map((meta) => {
              const isActive = meta.level.id === selectedLeaderboardLevelId;
              return (
                <button
                  key={meta.level.id}
                  type="button"
                  onClick={() => setLeaderboardLevelId(meta.level.id)}
                  className={`rounded-md border px-2 py-1 font-secondary text-[11px] uppercase transition-all duration-200 ${
                    isActive
                      ? "border-yellow-200 bg-yellow-300/30 text-yellow-100"
                      : "border-yellow-900/70 bg-black/25 text-yellow-100/85 hover:border-yellow-300/80"
                  }`}
                >
                  L{meta.level.id}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border-2 border-yellow-200/45 bg-black/35">
          <div className="grid grid-cols-[3.2rem_minmax(0,1fr)_6rem] border-b border-yellow-200/35 bg-yellow-300/20 px-2 py-1 font-secondary text-[11px] uppercase tracking-[0.08em] text-yellow-100">
            <div className="text-center">Rank</div>
            <div>Player</div>
            <div className="text-right">Score</div>
          </div>
          {(isLeaderboardLoading || isMyPositionLoading) && (
            <div className="px-3 py-4 text-center font-secondary text-[11px] uppercase text-yellow-100/85">
              Loading leaderboard...
            </div>
          )}
          {!isLeaderboardLoading &&
            !isMyPositionLoading &&
            topLeaderboardRows.length === 0 &&
            myLevelScoreForSelectedLevel <= 0 && (
            <div className="px-3 py-4 text-center font-secondary text-[11px] uppercase text-yellow-100/85">
              No public runs yet for this level
            </div>
          )}
          {!isLeaderboardLoading &&
            !isMyPositionLoading &&
            topLeaderboardRows.map((row, index) => {
              const isMe = row.playerId === (profile?._id || "__me");
              return (
                <div
                  key={`${row.playerId}-${row.rank}`}
                  className={`grid grid-cols-[3.2rem_minmax(0,1fr)_6rem] items-center px-2 py-[6px] ${
                    index % 2 === 0 ? "bg-black/10" : "bg-black/20"
                  } ${isMe ? "ring-1 ring-yellow-200/70" : ""}`}
                >
                  <div className="text-center font-secondary text-p6 text-yellow-100">#{row.rank}</div>
                  <div className="truncate font-primary text-p6 text-yellow-100">{row.playerName}</div>
                  <div className="text-right font-secondary text-p6 text-yellow-100">{row.levelScore}</div>
                </div>
              );
            })}
        </div>

        {(myLeaderboardRank || myLevelScoreForSelectedLevel > 0) && (
          <div className="mt-2 text-center font-secondary text-[11px] uppercase tracking-[0.1em] text-yellow-100/90">
            Your best: {myLevelScoreForSelectedLevel.toLocaleString()} score
            {myLeaderboardRank ? ` • Rank #${myLeaderboardRank}` : ""}
          </div>
        )}
      </div>

      <div className="relative mt-4 flex w-full max-w-5xl flex-wrap justify-center gap-4 bg-gradient-to-b from-yellow-900/20 to-yellow-900/70 px-4 pb-10 pt-6 md:rounded-lg md:border-2 md:border-yellow-300/40">
        {worldLevels.map((meta) => {
          const { level, best, bestScore, isUnlocked, stars, unlockRequirement, index } = meta;
          const objective = MATCH3_TILE_BY_TYPE[level.objectiveType];
          const starText = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
          const isSuggested = index === suggestedLevelIndex;

          return (
            <div key={level.id} className="relative z-10 flex w-[10.2rem] flex-col items-center">
              <button
                type="button"
                onClick={() => {
                  if (isUnlocked) {
                    setSelectedLevel(level.id);
                  }
                }}
                style={{
                  backgroundImage: `url(${cdnFile("landing/game-bg-2.webp")})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                className={`clickable relative flex h-[6.65rem] w-[6.65rem] flex-col items-center justify-center border-4 border-yellow-900 transition-all ${
                  isUnlocked
                    ? "hover:scale-110 hover:border-yellow-300 hover:brightness-110"
                    : "opacity-80"
                } ${isSuggested ? "ring-2 ring-yellow-200" : ""} glow-box`}
              >
                <div className="absolute left-0 top-0 rounded-br-md bg-black/40 px-1 py-[2px] font-secondary text-[12px] uppercase leading-none tracking-[0.06em] text-yellow-100">
                  L{level.id}
                </div>
                <div className="absolute right-0 top-0 rounded-bl-md bg-black/45 px-1 py-[2px] font-secondary text-[12px] uppercase leading-none text-yellow-100">
                  {starText}
                </div>

                {isSuggested && isUnlocked && (
                  <div className="absolute -top-2 rounded-md border border-yellow-200/80 bg-pink-600/90 px-2 py-0.5 font-secondary text-[12px] uppercase tracking-[0.08em] text-yellow-50">
                    NEXT
                  </div>
                )}

                <div className="mt-1 flex items-center gap-1 rounded-md bg-black/35 px-1 py-[2px]">
                  <img
                    src={objective.src}
                    className="h-[18px] w-[18px] object-contain"
                    draggable={false}
                    alt={objective.label}
                  />
                  <span className="font-secondary text-[13px] uppercase leading-none text-yellow-100">
                    x{level.objectiveTarget}
                  </span>
                </div>

                {!isUnlocked && (
                  <div className="absolute inset-0 z-20 flex h-full w-full items-center justify-center rounded-lg bg-black/50 p-1">
                    <img
                      className="h-8 w-8"
                      src={cdnFile("purrquest/sprites/key.png")}
                      draggable={false}
                      alt="locked"
                    />
                  </div>
                )}

                <div className="absolute -bottom-[1.55rem] z-30 flex flex-col items-center gap-[2px]">
                  <span className="rounded-md border border-yellow-900 bg-yellow-200/85 px-1.5 font-secondary text-[14px] uppercase leading-none text-yellow-900">
                    Score {bestScore.toLocaleString()}
                  </span>
                  <span className="flex items-center rounded-md border border-yellow-900 bg-yellow-300/70 px-1.5 font-primary text-[16px] leading-none text-yellow-900">
                    <img
                      src={cdnFile("logo/catnip.webp")}
                      className="mr-1 h-4 w-4"
                      draggable={false}
                      alt="catnip"
                    />
                    {best}/{level.catnipCap}
                  </span>
                </div>
              </button>

              <div className="mt-8 text-center font-primary text-[19px] leading-none text-yellow-100 md:text-[20px]">
                {level.name}
              </div>
              <div className="mt-1 rounded-md border border-yellow-200/45 bg-black/30 px-2 py-[3px] font-secondary text-[14px] uppercase leading-none text-yellow-100/90">
                {level.timeLimit}s • Goal {level.targetScore}
              </div>
              {!isUnlocked && (
                <div className="mt-1 text-center font-secondary text-[14px] uppercase leading-none text-yellow-100/85">
                  Need {unlockRequirement}+ from prev level
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 rounded-xl border-4 border-yellow-900 bg-black/35 px-4 py-2">
        {MATCH3_TILE_ASSETS.map((tile) => (
          <div
            key={tile.type}
            className="flex items-center gap-1 rounded-md bg-yellow-100/90 px-2 py-1 font-secondary text-p6 text-yellow-900"
          >
            <img
              src={tile.src}
              className="h-4 w-4 object-contain"
              draggable={false}
              alt={tile.label}
            />
            <span>{tile.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center font-secondary text-p6 text-yellow-100/80">
        Tip: each level has a catnip cap. Chain combos and finish strong to hit max rewards.
      </p>
    </div>
  );
};
