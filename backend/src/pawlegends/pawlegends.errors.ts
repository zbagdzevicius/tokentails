import { HttpException, HttpStatus } from '@nestjs/common';

/** Error bodies `{ statusCode, code, message }`, codes prefixed `PAWLEGENDS_` (the Bad Cat store shape). */
export const pawlegendsError = (status: HttpStatus, code: string, message: string) =>
    new HttpException({ statusCode: status, code, message }, status);

export const PAWLEGENDS_ERRORS = {
    invalid: (message: string) => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', message),
    stripeUnavailable: () =>
        pawlegendsError(HttpStatus.SERVICE_UNAVAILABLE, 'PAWLEGENDS_STRIPE_UNAVAILABLE', 'Checkout is not configured'),
    webhookUnavailable: () =>
        pawlegendsError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'PAWLEGENDS_WEBHOOK_UNAVAILABLE',
            'Webhook secret is not configured'
        ),
    secretMissing: () =>
        pawlegendsError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'PAWLEGENDS_ENTITLEMENT_UNAVAILABLE',
            'Entitlements are not configured'
        ),
    badSignature: () =>
        pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_BAD_SIGNATURE', 'Invalid webhook signature'),
    badToken: () => pawlegendsError(HttpStatus.UNAUTHORIZED, 'PAWLEGENDS_BAD_TOKEN', 'Invalid or expired token'),
    underAge: (message: string) => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_UNDER_16', message),
    spendCap: () =>
        pawlegendsError(
            HttpStatus.FORBIDDEN,
            'PAWLEGENDS_SPEND_CAP',
            'This purchase would go over the 30-day spending limit'
        ),
    alreadyOwned: () => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_ALREADY_OWNED', 'Already owned'),
    soldOut: () => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_SOLD_OUT', 'All Founder Legend seats are taken'),
    needsFounder: () =>
        pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEEDS_FOUNDER', 'The upgrade is for Founder owners'),
    emailUnavailable: () =>
        pawlegendsError(HttpStatus.SERVICE_UNAVAILABLE, 'PAWLEGENDS_EMAIL_UNAVAILABLE', 'Email is not configured'),
    notFound: () => pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_NOT_FOUND', 'Not found'),
};
