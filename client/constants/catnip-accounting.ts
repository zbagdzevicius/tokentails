import { MATCH3_LEVELS } from "@/components/Match3/match3.config";
import { catnipChaosLevelsList } from "@/components/Phaser/map";
import {
  CATNIP_CHAOS_ENDLESS_CAP,
  CATNIP_CHAOS_LEVEL_CAP,
} from "@/shared-contracts/caps";

type LevelScores = unknown[] | null | undefined;

export interface ICatnipBreakdown {
  catnipChaos: number[];
  match3: number[];
  catnipChaosCount: number;
  match3Count: number;
  totalCount: number;
}

export interface ICatnipStateLike {
  catnipChaos?: LevelScores;
  match3?: LevelScores;
}

// Caps per level follow the Phaser level list; the values come from the generated copy of
// shared/caps.ts (plan F2), the same table the backend enforces. Endless is 500 (decision #57).
// NOT the same table as `CATNIP_CHAOS_LEVEL_CAPS` in `@/shared-contracts/caps`, despite the name:
// this one has one entry per playable Phaser level (79), the shared one one per backend level slot
// (97). Each index agrees; only the length and the totals differ. Use this one for what a player can
// earn in the client UI, the shared one for anything that must match backend validation. The 97 vs
// 79 mismatch is bug #1 in docs/plans/alignment-log/1a.md.
export const CATNIP_CHAOS_LEVEL_CAPS = catnipChaosLevelsList.map(
  (_level, index) =>
    index === 0 ? CATNIP_CHAOS_ENDLESS_CAP : CATNIP_CHAOS_LEVEL_CAP,
);
export const MATCH3_LEVEL_CAPS = MATCH3_LEVELS.map((level) => level.catnipCap);
export const CATNIP_CHAOS_TOTAL_CAP = CATNIP_CHAOS_LEVEL_CAPS.reduce(
  (acc, cap) => acc + cap,
  0,
);
export const MATCH3_TOTAL_CAP = MATCH3_LEVEL_CAPS.reduce(
  (acc, cap) => acc + cap,
  0,
);
export const TOTAL_CATNIP_CAP = CATNIP_CHAOS_TOTAL_CAP + MATCH3_TOTAL_CAP;

const normalizeScore = (value: unknown, cap: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(cap, Math.floor(numeric)));
};

export const normalizeLevelScores = (
  values: LevelScores,
  levelCaps: number[],
): number[] => {
  const rawValues = Array.isArray(values) ? values : [];
  return levelCaps.map((cap, index) => normalizeScore(rawValues[index], cap));
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export const getCatnipBreakdown = (
  state: ICatnipStateLike | null | undefined,
): ICatnipBreakdown => {
  const catnipChaos = normalizeLevelScores(
    state?.catnipChaos,
    CATNIP_CHAOS_LEVEL_CAPS,
  );
  const match3 = normalizeLevelScores(state?.match3, MATCH3_LEVEL_CAPS);
  const catnipChaosCount = sum(catnipChaos);
  const match3Count = sum(match3);

  return {
    catnipChaos,
    match3,
    catnipChaosCount,
    match3Count,
    totalCount: catnipChaosCount + match3Count,
  };
};

export const buildCatnipProfilePatch = (
  state: ICatnipStateLike | null | undefined,
) => {
  const breakdown = getCatnipBreakdown(state);
  return {
    catnipChaos: breakdown.catnipChaos,
    catnipChaosCount: breakdown.catnipChaosCount,
    match3: breakdown.match3,
    match3Count: breakdown.match3Count,
    catnipCount: breakdown.totalCount,
  };
};
