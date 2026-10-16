import { buildCatPrompt, generateCat, parseScreenedAnswer } from './ai.utils';

// The OpenAI client is created at import time; the spec answers for it.
const mockCreate = jest.fn();
jest.mock('openai', () => ({
    OpenAI: jest.fn(() => ({ chat: { completions: { create: (...args: unknown[]) => mockCreate(...args) } } })),
}));
const create = mockCreate;
jest.mock('dotenv', () => ({ config: jest.fn() }));

/** The classifier prompt exactly as it was before bet #3 (ability type FIRE). */
const ORIGINAL_PROMPT = `
You will be shown an image of a cat. Your task is to do two things:

1. Identify the cat’s type based on its visual appearance from the following categories:

- **BLACK** – A cat that is entirely black.
- **MAINE** – A rugged, fluffy cat with a mix of dark gray and black stripes, resembling a Maine Coon.
- **MERLOT** – Similar to MAINE, but more wine-toned or reddish in its dark fur.
- **YELLOW** – A ginger, orange, or golden-yellow colored cat.
- **GREY** – Solid gray all over.
- **WHITE** – Completely white, no other colors.
- **SIAMESE** – Cream-colored body with darker face, ears, paws, and tail.
- **BALINESE** – Like SIAMESE but longer fur.
- **MIST** – Similar to SIAMESE with a hazier or clouded look.
- **PINKIE** – Mostly white with a splash of pink or another color.
- **PEACHES** – White mixed with orange or ginger patches.
- **OREO** – A black and white cat with clear contrast.
- **FOLD** – White-orange cat with folded ears.
- **OBSIDIAN** – All black with colorful, striking eyes.
- **SAVANHAN** – Brown cat with orange or tiger-like stripes.
- **OBI** – Fully brown cat.
- **OLIVE** – Light gray cat with soft gray stripes.
- **PICKLES** – Gray cat with dark gray stripes.
- **RASCAL** – Orange cat with white patches.
- **SABLE** – Dark brown cat with some white.
- **FICUS** – Mostly dark cat with bits of white.
- **TROUFAS** – Entirely black, fluffier or richer than regular black cat.

2. Then write a short, funny story about the cat for an NFT collection. The story should:
- Be centered around its FIRE nature.
- Avoid using the cat’s name.
- End with a twist or an absurd punchline.
- Be no more than 100 characters.

Respond in this format only:
Cat type: [type]. Story: [story].
`;

const answer = (content: string) => ({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 900, completion_tokens: 30 },
});

describe('generateCat', () => {
    beforeEach(() => create.mockReset());

    it('without options the prompt is unchanged', () => {
        expect(buildCatPrompt('FIRE')).toBe(ORIGINAL_PROMPT);
        expect(buildCatPrompt('FIRE', true)).toContain('Person: [yes|no]. Cat type: [type|NONE]. Story: [story].');
        expect(buildCatPrompt('FIRE', true)).toContain(
            'If no real cat is clearly visible, answer Cat type: NONE. If any person, face or body part of a person is visible, answer Person: yes.'
        );
    });

    it('an existing caller sends the old prompt and no request options', async () => {
        create.mockResolvedValue(answer('Cat type: BLACK. Story: It ate the moon.'));
        const result = await generateCat('Tom', 'https://img');
        const [body, requestOptions] = create.mock.calls[0];
        expect(body.messages[0].content[0].text).toMatch(/^\nYou will be shown an image of a cat\./);
        expect(body.messages[0].content[0].text).not.toContain('Person:');
        expect(requestOptions).toBeUndefined();
        expect(result).toMatchObject({ name: 'Tom', origin: 'BLACK' });
        expect((result as any).screen).toBeUndefined();
    });

    it('with screen: Person: yes -> personVisible', async () => {
        create.mockResolvedValue(answer('Person: yes. Cat type: GREY. Story: Naps.'));
        const result: any = await generateCat('Tom', 'data:image/webp;base64,AAAA', { screen: true });
        expect(result.screen).toEqual({ isCat: true, personVisible: true });
        expect(result.origin).toBe('GREY');
    });

    it('with screen: Cat type: NONE -> isCat false and the screen only', async () => {
        create.mockResolvedValue(answer('Person: no. Cat type: NONE. Story: none.'));
        await expect(generateCat('Tom', 'data:x', { screen: true })).resolves.toEqual({
            screen: { isCat: false, personVisible: false },
        });
    });

    it('with screen: an unparsable answer fails closed (null)', async () => {
        create.mockResolvedValue(answer('I think this is a lovely cat.'));
        await expect(generateCat('Tom', 'data:x', { screen: true })).resolves.toBeNull();
    });

    it('reports usage and passes the abort signal to the request', async () => {
        create.mockResolvedValue(answer('Person: no. Cat type: Yellow cat. Story: Zoom.'));
        const onUsage = jest.fn();
        const controller = new AbortController();
        await generateCat('Tom', 'data:x', { screen: true, onUsage, signal: controller.signal });
        expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
        expect(onUsage).toHaveBeenCalledWith({
            provider: 'openai',
            model: 'gpt-4o-mini',
            inputTokens: 900,
            outputTokens: 30,
            images: 0,
            imageSize: null,
        });
    });

    it('an aborted request returns null', async () => {
        create.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(generateCat('Tom', 'data:x', { screen: true })).resolves.toBeNull();
    });
});

describe('parseScreenedAnswer', () => {
    it('parses the three fields, tolerating case and a missing story', () => {
        expect(parseScreenedAnswer('person: No. cat type: oreo. story: Ha.')).toEqual({
            screen: { isCat: true, personVisible: false },
            origin: 'oreo',
            story: 'Ha',
        });
        expect(parseScreenedAnswer('Person: yes. Cat type: NONE.')?.screen).toEqual({
            isCat: false,
            personVisible: true,
        });
        expect(parseScreenedAnswer('Cat type: BLACK. Story: x')).toBeNull();
        expect(parseScreenedAnswer(null)).toBeNull();
    });
});
