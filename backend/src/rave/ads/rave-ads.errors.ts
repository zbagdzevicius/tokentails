import { HttpStatus } from '@nestjs/common';
import { raveError } from '../rave.errors';

/* Moon Rave ad space errors: `{ statusCode, code, message, fieldCode? }`, codes prefixed `RAVE_AD_`. */

export const RAVE_AD_ERRORS = {
    off: (reason: string) =>
        raveError(HttpStatus.SERVICE_UNAVAILABLE, 'RAVE_AD_OFF', 'Ad checkout is not available right now', { reason }),
    invalid: (message: string) => raveError(HttpStatus.BAD_REQUEST, 'RAVE_AD_INVALID', message),
    slot: () => raveError(HttpStatus.BAD_REQUEST, 'RAVE_AD_SLOT', 'Pick one of the 20 ad slots'),
    tooManyHolds: () =>
        raveError(
            HttpStatus.TOO_MANY_REQUESTS,
            'RAVE_AD_HOLDS',
            'You already have slots on hold. Finish paying for one, or wait 15 minutes.'
        ),
    slotTaken: () =>
        raveError(HttpStatus.CONFLICT, 'RAVE_AD_SLOT_TAKEN', 'Someone just took that slot. Pick another one.'),
    name: (fieldCode: string) =>
        raveError(HttpStatus.BAD_REQUEST, 'RAVE_AD_NAME', 'Use 2–32 letters or numbers for the name (no links)', {
            fieldCode,
        }),
    url: (fieldCode: string) =>
        raveError(HttpStatus.BAD_REQUEST, 'RAVE_AD_URL', 'Use a full https:// link to a public website', { fieldCode }),
    xHandle: (fieldCode: string) =>
        raveError(HttpStatus.BAD_REQUEST, 'RAVE_AD_X_HANDLE', 'Use @handle or an x.com profile link', { fieldCode }),
    image: (fieldCode: string) =>
        raveError(
            HttpStatus.BAD_REQUEST,
            'RAVE_AD_IMAGE',
            fieldCode === 'IMAGE_TOO_LARGE'
                ? 'The image is over 2 MB'
                : fieldCode === 'IMAGE_REQUIRED'
                ? 'Add an image for your ad'
                : 'Use a PNG, JPG or WebP image',
            { fieldCode }
        ),
    keyReused: () =>
        raveError(HttpStatus.CONFLICT, 'RAVE_AD_KEY_REUSED', 'This checkout was already started with other details'),
    storage: () =>
        raveError(HttpStatus.SERVICE_UNAVAILABLE, 'RAVE_AD_STORAGE', 'The image could not be stored, try again'),
    stripe: () => raveError(HttpStatus.BAD_GATEWAY, 'RAVE_AD_STRIPE', 'The card checkout could not start, try again'),
    adNotFound: () => raveError(HttpStatus.NOT_FOUND, 'RAVE_AD_NOT_FOUND', 'No such ad'),
    state: (message: string) => raveError(HttpStatus.CONFLICT, 'RAVE_AD_STATE', message),
};
