import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../shared-contracts/errors';
import { foldCatName, normalizeCatName, CAT_NAME_MESSAGES } from '../../shared-contracts/name';
import { ADJECTIVES } from '../party/party-names';
import { pawlegendsError } from '../pawlegends.errors';

/*
 * Nicknames (docs/plans/moba/SOCIAL-RANKED.md §2.3): a registered player picks the name every other player sees
 * (friends, boards, clubs, chat, match history, the party lobby and the match). The first change is free (guest and
 * generated names included); every later one costs NAME_CHANGE.yarn Yarn and waits NAME_CHANGE.cooldownDays after the
 * previous change, like a summoner name change. One rule set: shared/name.ts `normalizeCatName` (Latin letters, 2–16
 * characters, the profanity and reserved lists), plus the extra reserved words below and the generated-name shape.
 * Unique case- and accent-insensitively on the folded skeleton (`nickKey`: `Bob`, `BOB`, `B0b` and `Böb` are one name).
 * The price lives here and only here; the game shows what `GET /pawlegends/name` answers.
 */
export const NAME_CHANGE = Object.freeze({
    /** Yarn per change after the first (the cheapest champion is 2,500). */
    yarn: 1500,
    /** Days between two changes once the free one is used (stops impersonation churn). */
    cooldownDays: 7,
    /** Old names kept on the profile for moderation (newest last). */
    historyMax: 20,
});

/** Names no player may take: system words of the game, on top of shared/name.ts's staff and brand list. */
export const NICK_RESERVED: readonly string[] = Object.freeze([
    'pawlegends',
    'paw legends',
    'guest',
    'teammate',
    'player',
    'bot',
    'system',
    'support',
    'moderator',
    'developer',
    'dev',
    'gm',
]);

const ADJ = new Set(ADJECTIVES.map(a => a.toLowerCase()));

/** "Sunny Tabby" shapes the game generates for other players: an adjective of party-names.ts and one more word. */
export function looksGenerated(name: string): boolean {
    const words = name.toLowerCase().split(/[ '-]+/);
    return (
        words.length >= 2 && words.length <= 3 && ADJ.has(words[0]) && (words.length === 2 || /^\d+$/.test(words[2]))
    );
}

export type NickCheck = { ok: true; name: string; key: string } | { ok: false; code: string; message: string };

/** The one check of a wanted nickname (pure): the normalized name and its uniqueness key, or the refusal. */
export function checkNick(input: unknown): NickCheck {
    const r = normalizeCatName(input, { reserved: NICK_RESERVED });
    if (!r.ok) return { ok: false, code: r.code, message: CAT_NAME_MESSAGES[r.code] };
    if (looksGenerated(r.name))
        return { ok: false, code: ErrorCode.NAME_RESERVED, message: CAT_NAME_MESSAGES[ErrorCode.NAME_RESERVED] };
    const key = foldCatName(r.name);
    if (key.length < 2) return { ok: false, code: ErrorCode.NAME_CHARS, message: CAT_NAME_MESSAGES.NAME_CHARS };
    return { ok: true, name: r.name, key };
}

export const NAME_ERRORS = {
    needAccount: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to choose your name'),
    invalid: (code: string, message: string) =>
        new HttpException(
            { statusCode: HttpStatus.BAD_REQUEST, code: 'PAWLEGENDS_NAME_INVALID', reason: code, message },
            HttpStatus.BAD_REQUEST
        ),
    taken: () => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_NAME_TAKEN', 'That name is taken. Try another one.'),
    same: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_NAME_SAME', 'That is already your name'),
    yarn: () => pawlegendsError(HttpStatus.PAYMENT_REQUIRED, 'PAWLEGENDS_NAME_YARN', 'Not enough Yarn'),
    cooldown: (nextAt: number) =>
        new HttpException(
            {
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                code: 'PAWLEGENDS_NAME_COOLDOWN',
                nextAt,
                message: 'You changed your name recently',
            },
            HttpStatus.TOO_MANY_REQUESTS
        ),
    busy: () => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_NAME_BUSY', 'Another name change is running'),
    changed: () =>
        pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_NAME_CHANGED', 'Your name changed meanwhile. Try again'),
};
