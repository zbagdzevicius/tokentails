import { ForbiddenException, HttpStatus } from '@nestjs/common';

/**
 * Disposable-domain check for NEW registered accounts (decision #5: no Identity Platform upgrade;
 * the backend blocks throwaway inboxes and App Check is the main defence). Existing accounts are
 * never blocked by it. Extend with `DISPOSABLE_EMAIL_DOMAINS` (comma separated).
 *
 * A short list of the most common providers, not an exhaustive feed: the goal is to make farming
 * referral and starter rewards with fresh inboxes slower, not impossible.
 */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = Object.freeze([
    '10minutemail.com',
    '20minutemail.com',
    'dispostable.com',
    'dropmail.me',
    'emailondeck.com',
    'fakeinbox.com',
    'getairmail.com',
    'getnada.com',
    'guerrillamail.biz',
    'guerrillamail.com',
    'guerrillamail.de',
    'guerrillamail.net',
    'guerrillamail.org',
    'guerrillamailblock.com',
    'inboxkitten.com',
    'mail.tm',
    'maildrop.cc',
    'mailinator.com',
    'mailinator.net',
    'mailnesia.com',
    'mintemail.com',
    'mohmal.com',
    'moakt.com',
    'mytemp.email',
    'sharklasers.com',
    'spam4.me',
    'temp-mail.io',
    'temp-mail.org',
    'tempail.com',
    'tempmail.com',
    'tempmail.dev',
    'tempmailo.com',
    'tempr.email',
    'throwawaymail.com',
    'trashmail.com',
    'trashmail.de',
    'yopmail.com',
    'yopmail.fr',
    'yopmail.net',
]);

export function emailDomain(email: string): string {
    const at = email.lastIndexOf('@');
    return at >= 0
        ? email
              .slice(at + 1)
              .trim()
              .toLowerCase()
        : '';
}

/** True for a disposable domain or any subdomain of one (`x.mailinator.com`). */
export function isDisposableEmail(email: string, extraDomains: readonly string[] = []): boolean {
    const domain = emailDomain(email);
    if (!domain) {
        return false;
    }
    return [...DISPOSABLE_EMAIL_DOMAINS, ...extraDomains].some(
        listed => domain === listed || domain.endsWith(`.${listed}`)
    );
}

/**
 * 403 for a disposable inbox. No shared error code exists for it yet (shared/errors.ts is outside
 * this task; requested in docs/plans/alignment-log/2a.md), so the client shows the message.
 */
export const disposableEmail = () =>
    new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Use a permanent email address to create an account',
    });
