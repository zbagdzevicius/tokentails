import {
    AiUsage,
    costMicroEur,
    exceedsCostAlert,
    fallbackCostMicroEur,
    geminiImageUsage,
    measuredOrFallback,
} from './ai-cost';

const env = {} as NodeJS.ProcessEnv;

describe('ai-cost', () => {
    it('prices text tokens at the provider rates (EUR per million tokens = micro-euros per token)', () => {
        const usage: AiUsage = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            inputTokens: 1_000_000,
            outputTokens: 100_000,
            images: 0,
            imageSize: null,
        };
        expect(costMicroEur(usage, env)).toBe(Math.round(1_000_000 * 0.14 + 100_000 * 0.53));
        expect(
            costMicroEur(usage, {
                AI_COST_OPENAI_INPUT_EUR_PER_MTOK: '1',
                AI_COST_OPENAI_OUTPUT_EUR_PER_MTOK: '0',
            } as any)
        ).toBe(1_000_000);
    });

    it('prices each generated image by its size', () => {
        const image = (imageSize: AiUsage['imageSize'], images = 1): AiUsage => ({
            provider: 'gemini',
            model: 'gemini-3.1-flash-image-preview',
            inputTokens: 0,
            outputTokens: 0,
            images,
            imageSize,
        });
        expect(costMicroEur(image('1K'), env)).toBe(30_000);
        expect(costMicroEur(image('2K'), env)).toBe(44_000);
        expect(costMicroEur(image('4K'), env)).toBe(99_000);
        expect(costMicroEur(image('4K', 2), env)).toBe(198_000);
        expect(costMicroEur(image('1K'), { AI_COST_GEMINI_IMAGE_EUR_1K: '0.05' } as any)).toBe(50_000);
    });

    it('charges the flat fallback when usage is missing or the call timed out', () => {
        expect(fallbackCostMicroEur('text', null, env)).toBe(10_000);
        expect(fallbackCostMicroEur('image', '1K', env)).toBe(80_000);
        expect(fallbackCostMicroEur('image', '4K', env)).toBe(320_000);
        expect(measuredOrFallback([], { kind: 'image', imageSize: '1K' }, env)).toBe(80_000);
        expect(measuredOrFallback([], { kind: 'text' }, env)).toBe(10_000);
    });

    it('has per-kind alert thresholds: a €0.30 preview does not trigger the upload alert', () => {
        expect(exceedsCostAlert('portrait-preview', 300_000, env)).toBe(false);
        expect(exceedsCostAlert('portrait-preview', 400_001, env)).toBe(true);
        expect(exceedsCostAlert('yourcat', 100_000, env)).toBe(false);
        expect(exceedsCostAlert('yourcat', 100_001, env)).toBe(true);
        expect(exceedsCostAlert('manual', 9_999_999, env)).toBe(false);
    });

    it('reads Gemini usage metadata: prompt tokens, text tokens and returned images', () => {
        const usage = geminiImageUsage(
            {
                usageMetadata: {
                    promptTokenCount: 1300,
                    candidatesTokenCount: 1130,
                    candidatesTokensDetails: [
                        { modality: 'IMAGE', tokenCount: 1120 },
                        { modality: 'TEXT', tokenCount: 10 },
                    ],
                },
                candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
            },
            '1K'
        );
        expect(usage).toMatchObject({ inputTokens: 1300, outputTokens: 10, images: 1, imageSize: '1K' });
        expect(geminiImageUsage({}, '4K')).toMatchObject({ images: 0, imageSize: null, inputTokens: 0 });
    });
});
