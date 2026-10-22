import { HttpException, HttpStatus } from '@nestjs/common';

/*
 * Tails Club errors. Bodies are `{ statusCode, code, key, message }` (the rave / badcat shape plus `key`):
 * `code` is prefixed `CLUB_`, `key` is the short name the landing's `ERR` map reads (`busy`, `alreadyMember`,
 * `keyReused`, `off`, `invalid`, `stripe`, `notFound`, `badToken`, `portalOff`).
 */

export const clubError = (
    status: HttpStatus,
    code: string,
    key: string,
    message: string,
    extra: Record<string, unknown> = {}
) => new HttpException({ statusCode: status, code, key, message, ...extra }, status);

export const CLUB_ERRORS = {
    off: (reason: string) =>
        clubError(HttpStatus.SERVICE_UNAVAILABLE, 'CLUB_OFF', 'off', 'Tails Club is not open right now', { reason }),
    busy: () =>
        clubError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'CLUB_BUSY',
            'busy',
            'Too many sign-ups right now, try again in a few minutes.'
        ),
    invalid: (message: string) => clubError(HttpStatus.BAD_REQUEST, 'CLUB_INVALID', 'invalid', message),
    keyReused: () =>
        clubError(
            HttpStatus.CONFLICT,
            'CLUB_KEY_REUSED',
            'keyReused',
            'This checkout was already started with other details'
        ),
    alreadyMember: () =>
        clubError(HttpStatus.CONFLICT, 'CLUB_ALREADY_MEMBER', 'alreadyMember', 'This email is already a member.'),
    stripe: () => clubError(HttpStatus.BAD_GATEWAY, 'CLUB_STRIPE', 'stripe', "Couldn't start checkout. Try again."),
    notFound: () => clubError(HttpStatus.NOT_FOUND, 'CLUB_NOT_FOUND', 'notFound', 'No such membership'),
    badToken: () => clubError(HttpStatus.FORBIDDEN, 'CLUB_BAD_TOKEN', 'badToken', 'This link has expired'),
    portalOff: () =>
        clubError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'CLUB_PORTAL_OFF',
            'portalOff',
            'Email links are not available right now. Email hello@tokentails.com.'
        ),
    webhookUnavailable: () =>
        clubError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'CLUB_WEBHOOK_UNAVAILABLE',
            'off',
            'Webhook secret is not configured'
        ),
    badSignature: () => clubError(HttpStatus.BAD_REQUEST, 'CLUB_BAD_SIGNATURE', 'invalid', 'Invalid webhook signature'),
};
