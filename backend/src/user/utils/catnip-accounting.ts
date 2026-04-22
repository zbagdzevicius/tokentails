import { catnipChaosLevelCatnipCaps, match3LevelCatnipCaps } from 'src/game/game.schema';

type LevelScores = unknown[] | null | undefined;
type LegacyLevelScores = unknown[] | Record<string, unknown> | null | undefined;

export interface ICatnipAccountingSnapshot {
    catnipChaos: number[];
    match3: number[];
    catnipChaosCount: number;
    match3Count: number;
    catnipCount: number;
}

export interface ICatnipSanitizationUpdate {
    set: Record<string, number>;
    unset: Record<string, ''>;
}

const toLevelValueArray = (values: LegacyLevelScores): unknown[] => {
    if (Array.isArray(values)) {
        return values;
    }
    if (!values || typeof values !== 'object') {
        return [];
    }

    const mapped: unknown[] = [];
    Object.entries(values).forEach(([key, value]) => {
        const index = Number(key);
        if (Number.isInteger(index) && index >= 0) {
            mapped[index] = value;
        }
    });

    return mapped;
};

const normalizeScore = (value: unknown, cap: number): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(cap, Math.floor(numeric)));
};

export const normalizeLevelScores = (values: LevelScores | Record<string, unknown>, levelCaps: number[]): number[] => {
    const rawValues = toLevelValueArray(values);
    return levelCaps.map((cap, index) => normalizeScore(rawValues[index], cap));
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export const buildCatnipAccountingSnapshot = (
    rawCatnipChaos: LevelScores,
    rawMatch3: LevelScores
): ICatnipAccountingSnapshot => {
    const catnipChaos = normalizeLevelScores(rawCatnipChaos, catnipChaosLevelCatnipCaps);
    const match3 = normalizeLevelScores(rawMatch3, match3LevelCatnipCaps);
    const catnipChaosCount = sum(catnipChaos);
    const match3Count = sum(match3);

    return {
        catnipChaos,
        match3,
        catnipChaosCount,
        match3Count,
        catnipCount: catnipChaosCount + match3Count,
    };
};

export const buildCatnipSanitizationUpdate = (
    rawCatnipChaos: LevelScores | Record<string, unknown>,
    rawMatch3: LevelScores | Record<string, unknown>
): ICatnipSanitizationUpdate => {
    const rawCatnipChaosValues = toLevelValueArray(rawCatnipChaos);
    const rawMatch3Values = toLevelValueArray(rawMatch3);
    const normalized = buildCatnipAccountingSnapshot(rawCatnipChaosValues, rawMatch3Values);
    const set: Record<string, number> = {};
    const unset: Record<string, ''> = {};

    for (let index = 0; index < rawCatnipChaosValues.length; index += 1) {
        if (index >= normalized.catnipChaos.length) {
            unset[`catnipChaos.${index}`] = '';
            continue;
        }
        const normalizedValue = normalized.catnipChaos[index];
        const current = Number(rawCatnipChaosValues[index]);
        if (!Number.isFinite(current) || current !== normalizedValue) {
            set[`catnipChaos.${index}`] = normalizedValue;
        }
    }

    for (let index = 0; index < rawMatch3Values.length; index += 1) {
        if (index >= normalized.match3.length) {
            unset[`match3.${index}`] = '';
            continue;
        }
        const normalizedValue = normalized.match3[index];
        const current = Number(rawMatch3Values[index]);
        if (!Number.isFinite(current) || current !== normalizedValue) {
            set[`match3.${index}`] = normalizedValue;
        }
    }

    return { set, unset };
};
