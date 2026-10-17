import { HttpException, HttpStatus } from '@nestjs/common';

/** Error bodies `{ statusCode, code, message }` (the `/yourcat` shape), codes prefixed `BADCAT_`. */
export const badcatError = (status: HttpStatus, code: string, message: string) =>
    new HttpException({ statusCode: status, code, message }, status);

export const BADCAT_ERRORS = {
    /** Every route while BADCAT_ENABLED (or the route's feature flag) is off. */
    notFound: () => badcatError(HttpStatus.NOT_FOUND, 'BADCAT_NOT_FOUND', 'Not found'),
    invalid: (message: string) => badcatError(HttpStatus.BAD_REQUEST, 'BADCAT_INVALID', message),
    stripeUnavailable: () =>
        badcatError(HttpStatus.SERVICE_UNAVAILABLE, 'BADCAT_STRIPE_UNAVAILABLE', 'Checkout is not configured'),
    secretMissing: () =>
        badcatError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'BADCAT_ENTITLEMENT_UNAVAILABLE',
            'Entitlements are not configured'
        ),
    webhookUnavailable: () =>
        badcatError(HttpStatus.SERVICE_UNAVAILABLE, 'BADCAT_WEBHOOK_UNAVAILABLE', 'Webhook secret is not configured'),
    badSignature: () => badcatError(HttpStatus.BAD_REQUEST, 'BADCAT_BAD_SIGNATURE', 'Invalid webhook signature'),
    badToken: () => badcatError(HttpStatus.UNAUTHORIZED, 'BADCAT_BAD_TOKEN', 'Invalid or expired token'),
    notClub: () => badcatError(HttpStatus.FORBIDDEN, 'BADCAT_NOT_CLUB', 'Chaos Club only'),
    forbidden: () => badcatError(HttpStatus.FORBIDDEN, 'BADCAT_FORBIDDEN', 'Not your cameo'),
    soldOut: () => badcatError(HttpStatus.CONFLICT, 'BADCAT_SOLD_OUT', 'All founding places are taken'),
    conflict: (message: string) => badcatError(HttpStatus.CONFLICT, 'BADCAT_CONFLICT', message),
    noCustomer: () => badcatError(HttpStatus.NOT_FOUND, 'BADCAT_NO_CUSTOMER', 'No Stripe customer for this email'),
    tooLarge: () => badcatError(HttpStatus.PAYLOAD_TOO_LARGE, 'BADCAT_FACE_TOO_LARGE', 'Face PNG over 64 KB'),
};
