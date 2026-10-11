/*
 * AI cost measurement (bet #3, docs/plans/yourcat-v2.md section 3.3). One usage type for every paid
 * call: the `/yourcat` classifier (OpenAI), the pixel avatar and the portraits (Gemini).
 *
 * Amounts are micro-euros (1 EUR = 1,000,000). A rate in EUR per million tokens is therefore exactly
 * micro-euros per token.
 *
 * Default rates, set on 2026-10-11:
 * - Gemini (`gemini-3.1-flash-image-preview`, "3.1 Flash Image" on ai.google.dev/gemini-api/docs/pricing,
 *   read that day): $1.50 per 1M input tokens, $7.50 per 1M text output tokens, images $0.0336 (1K),
 *   $0.0504 (2K) and $0.113 (4K) each.
 * - OpenAI `gpt-4o-mini`: $0.15 per 1M input tokens, $0.60 per 1M output tokens (the published rate;
 *   the pricing page could not be read from the build machine, so confirm it).
 * Converted at 1 EUR = 1.15 USD and rounded up. Every rate can be overridden by its env variable.
 */

export interface AiUsage {
    provider: 'openai' | 'gemini';
    model: string;
    inputTokens: number;
    /** Text output tokens. */
    outputTokens: number;
    /** Generated images (0 for the classifier). */
    images: number;
    imageSize: '1K' | '2K' | '4K' | null;
}
export type OnAiUsage = (usage: AiUsage) => void;
export interface AiCallOptions {
    onUsage?: OnAiUsage;
    signal?: AbortSignal;
}

export type AiKind = 'yourcat' | 'portrait-preview' | 'manual';

export const MICRO = 1_000_000;

const DEFAULT_RATES = {
    AI_COST_OPENAI_INPUT_EUR_PER_MTOK: 0.14,
    AI_COST_OPENAI_OUTPUT_EUR_PER_MTOK: 0.53,
    AI_COST_GEMINI_INPUT_EUR_PER_MTOK: 1.31,
    AI_COST_GEMINI_OUTPUT_EUR_PER_MTOK: 6.53,
    AI_COST_GEMINI_IMAGE_EUR_1K: 0.03,
    AI_COST_GEMINI_IMAGE_EUR_2K: 0.044,
    AI_COST_GEMINI_IMAGE_EUR_4K: 0.099,
    AI_COST_FALLBACK_IMAGE_EUR: 0.08,
    AI_COST_FALLBACK_TEXT_EUR: 0.01,
    AI_ALERT_COST_PER_UPLOAD_EUR: 0.1,
    AI_ALERT_COST_PER_PREVIEW_EUR: 0.4,
} as const;

export type AiCostSetting = keyof typeof DEFAULT_RATES;

/** A non-negative number from the environment, else the default. Read per call (`.env` loads late). */
export function envEuros(name: AiCostSetting, env: NodeJS.ProcessEnv = process.env): number {
    const raw = env[name];
    if (raw !== undefined && raw.trim() !== '') {
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0) {
            return value;
        }
    }
    return DEFAULT_RATES[name];
}

const toMicro = (euros: number) => Math.round(euros * MICRO);

const tokens = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** Price of one generated image at `size`. */
export function imagePriceMicroEur(size: AiUsage['imageSize'], env: NodeJS.ProcessEnv = process.env): number {
    if (size === '4K') {
        return toMicro(envEuros('AI_COST_GEMINI_IMAGE_EUR_4K', env));
    }
    if (size === '2K') {
        return toMicro(envEuros('AI_COST_GEMINI_IMAGE_EUR_2K', env));
    }
    return toMicro(envEuros('AI_COST_GEMINI_IMAGE_EUR_1K', env));
}

/**
 * Text tokens at the provider's token rates, plus each generated image at its per-image price for the
 * size (Google prices image output per image by resolution, so one output token rate would under-count).
 */
export function costMicroEur(usage: AiUsage, env: NodeJS.ProcessEnv = process.env): number {
    const openai = usage.provider === 'openai';
    const inputRate = envEuros(openai ? 'AI_COST_OPENAI_INPUT_EUR_PER_MTOK' : 'AI_COST_GEMINI_INPUT_EUR_PER_MTOK', env);
    const outputRate = envEuros(
        openai ? 'AI_COST_OPENAI_OUTPUT_EUR_PER_MTOK' : 'AI_COST_GEMINI_OUTPUT_EUR_PER_MTOK',
        env
    );
    const text = tokens(usage.inputTokens) * inputRate + tokens(usage.outputTokens) * outputRate;
    const images = tokens(usage.images) * imagePriceMicroEur(usage.imageSize, env);
    return Math.round(text + images);
}

/**
 * The flat charge when a response has no usage data, or the call timed out or was aborted (the
 * provider still bills): `AI_COST_FALLBACK_TEXT_EUR` for a text call, `AI_COST_FALLBACK_IMAGE_EUR` per
 * 1K image (x2 for 2K, x4 for 4K).
 */
export function fallbackCostMicroEur(
    kind: 'text' | 'image',
    imageSize: AiUsage['imageSize'] = '1K',
    env: NodeJS.ProcessEnv = process.env
): number {
    if (kind === 'text') {
        return toMicro(envEuros('AI_COST_FALLBACK_TEXT_EUR', env));
    }
    const factor = imageSize === '4K' ? 4 : imageSize === '2K' ? 2 : 1;
    return toMicro(envEuros('AI_COST_FALLBACK_IMAGE_EUR', env) * factor);
}

/** The measured cost of the usages reported by one or more calls, or the fallback when none came. */
export function measuredOrFallback(
    usages: AiUsage[],
    fallback: { kind: 'text' | 'image'; imageSize?: AiUsage['imageSize'] },
    env: NodeJS.ProcessEnv = process.env
): number {
    if (!usages.length) {
        return fallbackCostMicroEur(fallback.kind, fallback.imageSize ?? '1K', env);
    }
    return usages.reduce((sum, usage) => sum + costMicroEur(usage, env), 0);
}

/** Per-kind alert threshold: a `/yourcat` upload above €0.10, a preview above €0.40 (reserved at €0.30). */
export function costAlertThresholdMicroEur(kind: AiKind, env: NodeJS.ProcessEnv = process.env): number | null {
    if (kind === 'yourcat') {
        return toMicro(envEuros('AI_ALERT_COST_PER_UPLOAD_EUR', env));
    }
    if (kind === 'portrait-preview') {
        return toMicro(envEuros('AI_ALERT_COST_PER_PREVIEW_EUR', env));
    }
    return null;
}

export function exceedsCostAlert(kind: AiKind, costMicro: number, env: NodeJS.ProcessEnv = process.env): boolean {
    const threshold = costAlertThresholdMicroEur(kind, env);
    return threshold !== null && costMicro > threshold;
}

export const microToEur = (micro: number) => Math.round(micro / 10_000) / 100;

/**
 * The usage of one Gemini image call (bet #3 cost accounting): prompt tokens, text output tokens (the
 * image tokens are priced per image instead) and the number of returned images.
 */
export function geminiImageUsage(result: any, imageSize: AiUsage['imageSize']): AiUsage {
    const metadata = result?.usageMetadata || {};
    const parts: any[] = result?.candidates?.[0]?.content?.parts || [];
    const images = parts.filter(part => part?.inlineData?.data).length;
    const details: any[] = Array.isArray(metadata.candidatesTokensDetails) ? metadata.candidatesTokensDetails : [];
    const textTokens = details.length
        ? details
              .filter(detail => String(detail?.modality || '').toUpperCase() === 'TEXT')
              .reduce((sum, detail) => sum + (Number(detail?.tokenCount) || 0), 0)
        : images
        ? 0
        : Number(metadata.candidatesTokenCount) || 0;
    return {
        provider: 'gemini',
        model: 'gemini-3.1-flash-image-preview',
        inputTokens: Number(metadata.promptTokenCount) || 0,
        outputTokens: textTokens + (Number(metadata.thoughtsTokenCount) || 0),
        images,
        imageSize: images ? imageSize : null,
    };
}
