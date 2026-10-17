import { HttpException, HttpStatus } from '@nestjs/common';

/*
 * Moon Rave checkout errors (cat-rave/CHECKOUT-SPEC.md section 4). Bodies are `{ statusCode, code, message }`
 * (the `/yourcat` and `/badcat` shape), codes prefixed `RAVE_`. Kept here, not in shared/errors.ts.
 */

export type RaveNameFieldIndex = number | 'rest';

export interface RaveNameFieldError {
    index: RaveNameFieldIndex;
    code: string;
}

export const raveError = (status: HttpStatus, code: string, message: string, extra: Record<string, unknown> = {}) =>
    new HttpException({ statusCode: status, code, message, ...extra }, status);

export const RAVE_ERRORS = {
    /** Every checkout route while RAVE_CHECKOUT_ENABLED is off. */
    notFound: () => raveError(HttpStatus.NOT_FOUND, 'RAVE_NOT_FOUND', 'Not found'),
    off: (reason: string) =>
        raveError(HttpStatus.SERVICE_UNAVAILABLE, 'RAVE_OFF', 'Checkout is not available right now', { reason }),
    cap: () =>
        raveError(HttpStatus.SERVICE_UNAVAILABLE, 'RAVE_CAP', 'Today’s Moon Rave tickets are sold out. Try tomorrow!'),
    busy: () => raveError(HttpStatus.SERVICE_UNAVAILABLE, 'RAVE_BUSY', 'Checkout is busy, try again in a few minutes'),
    amount: (message = 'Pick 1, 5, or a whole number of cats from 10') =>
        raveError(HttpStatus.BAD_REQUEST, 'RAVE_AMOUNT', message),
    method: () => raveError(HttpStatus.BAD_REQUEST, 'RAVE_METHOD', 'This payment method is not available'),
    invalid: (message: string) => raveError(HttpStatus.BAD_REQUEST, 'RAVE_INVALID', message),
    names: (fields: RaveNameFieldError[]) =>
        raveError(HttpStatus.BAD_REQUEST, 'RAVE_NAME', 'Some cat names are not allowed', { fields }),
    xHandle: (code: 'X_HANDLE_INVALID' | 'X_HANDLE_BLOCKED') =>
        raveError(
            HttpStatus.BAD_REQUEST,
            'RAVE_X_HANDLE',
            code === 'X_HANDLE_BLOCKED' ? 'That X handle is not allowed' : 'Use @handle or an x.com profile link',
            { fieldCode: code }
        ),
    keyReused: () =>
        raveError(HttpStatus.CONFLICT, 'RAVE_KEY_REUSED', 'This checkout was already started with other details'),
    stripe: () => raveError(HttpStatus.BAD_GATEWAY, 'RAVE_STRIPE', 'The card checkout could not start, try again'),
    orderNotFound: () => raveError(HttpStatus.NOT_FOUND, 'RAVE_ORDER_NOT_FOUND', 'No such order'),
    orderState: (message: string) => raveError(HttpStatus.CONFLICT, 'RAVE_ORDER_STATE', message),
    txMismatch: (message: string) => raveError(HttpStatus.BAD_REQUEST, 'RAVE_TX_MISMATCH', message),
    txUsed: () => raveError(HttpStatus.CONFLICT, 'RAVE_TX_USED', 'This transaction belongs to another order'),
    webhookUnavailable: () =>
        raveError(HttpStatus.SERVICE_UNAVAILABLE, 'RAVE_WEBHOOK_UNAVAILABLE', 'Webhook secret is not configured'),
    badSignature: () => raveError(HttpStatus.BAD_REQUEST, 'RAVE_BAD_SIGNATURE', 'Invalid webhook signature'),
};
