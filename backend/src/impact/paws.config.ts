/*
 * Nightly paw settlement settings (plan G4 "Paws", decision #26). Every variable is optional.
 *
 * - PAWS_SETTLEMENT_ENABLED  'true' lets the settlement send its one ShelterSplit donate per day.
 *                            Default off: paws, the Merkle root and the memo are still built and
 *                            stored (in-game, never money), but no transaction is sent.
 * - PAWS_DAILY_BUDGET        most the settlement pays in one day, in wei (18 decimals). Default
 *                            1 USDC. Decision #26: size it to DAU and revisit monthly; every
 *                            settlement stores `suggestedBudgetWei` (30-day average paws x amount).
 * - PAWS_AMOUNT              what one paw is worth before the budget cap, in wei. Default 0.01 USDC
 *                            (C-003). The day pays min(budget, paws x amount), shared pro rata, so no
 *                            one is ever told the budget is used up.
 *
 * The chain, RPC, ShelterSplit address and hot wallet are the SHELTER_* variables
 * (shelter-onchain.config.ts). The crons run only where IMPACT_JOBS_ENABLED is on (impact.config.ts).
 */

/** 1 USDC, 18 decimals. */
export const DEFAULT_PAWS_DAILY_BUDGET_WEI = '1000000000000000000';
/** 0.01 USDC, 18 decimals. */
export const DEFAULT_PAWS_AMOUNT_WEI = '10000000000000000';
/** Upper bound for either value (1,000,000 USDC): a typo can never drain the hot wallet. */
export const MAX_PAWS_WEI = BigInt('1000000000000000000000000');

export interface PawsConfig {
    sendEnabled: boolean;
    dailyBudgetWei: bigint;
    amountWei: bigint;
}

function wei(value: string | undefined, fallback: string): bigint {
    const trimmed = (value || '').trim();
    if (!/^\d+$/.test(trimmed)) {
        return BigInt(fallback);
    }
    const parsed = BigInt(trimmed);
    return parsed > MAX_PAWS_WEI ? BigInt(fallback) : parsed;
}

export function readPawsConfig(env: NodeJS.ProcessEnv = process.env): PawsConfig {
    // Never on under Jest, even with a developer's env loaded: specs inject their own config.
    const underTest = !!env.JEST_WORKER_ID || env.NODE_ENV === 'test';
    return {
        sendEnabled: !underTest && (env.PAWS_SETTLEMENT_ENABLED || '').trim().toLowerCase() === 'true',
        dailyBudgetWei: wei(env.PAWS_DAILY_BUDGET, DEFAULT_PAWS_DAILY_BUDGET_WEI),
        amountWei: wei(env.PAWS_AMOUNT, DEFAULT_PAWS_AMOUNT_WEI),
    };
}

/** min(budget, paws x amount). */
export function settlementAmountWei(pawCount: number, config: Pick<PawsConfig, 'dailyBudgetWei' | 'amountWei'>) {
    const full = BigInt(Math.max(0, Math.floor(pawCount))) * config.amountWei;
    return full < config.dailyBudgetWei ? full : config.dailyBudgetWei;
}

/** Each paw's pro-rata share of the day's amount (floored). Never shown per paw below a cent. */
export function perPawWei(amountWei: bigint, pawCount: number): bigint {
    return pawCount > 0 ? amountWei / BigInt(pawCount) : BigInt(0);
}

/** Decision #26 sizing aid: the budget that would pay every paw in full on an average day. */
export function suggestedBudgetWei(recentDailyPaws: number[], amountWei: bigint): bigint {
    const days = recentDailyPaws.filter(n => Number.isFinite(n) && n >= 0);
    if (!days.length) {
        return BigInt(0);
    }
    const average = Math.ceil(days.reduce((sum, n) => sum + n, 0) / days.length);
    return BigInt(average) * amountWei;
}
