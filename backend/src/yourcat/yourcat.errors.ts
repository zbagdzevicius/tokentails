import { HttpException, HttpStatus } from '@nestjs/common';
import { YourcatErrorCode } from './yourcat.contracts';

/**
 * A `/yourcat` (or `/image/portrait`) error. There is no global exception filter, so the body is
 * exactly this object: `statusCode` must be in it (docs/plans/yourcat-v2.md section 2.1).
 */
export function yourcatError(status: HttpStatus, code: YourcatErrorCode, message: string): HttpException {
    return new HttpException({ statusCode: status, code, message }, status);
}

/** The copy each code answers with. The client shows its own text by `code`; these are fallbacks. */
export const YOURCAT_ERRORS = {
    disabled: () =>
        yourcatError(HttpStatus.SERVICE_UNAVAILABLE, 'YOURCAT_DISABLED', 'Photo cats are paused right now.'),
    consentRequired: () =>
        yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_CONSENT_REQUIRED', 'Confirm the photo statement first.'),
    fileRequired: (message = 'Send exactly one photo.') =>
        yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_FILE_REQUIRED', message),
    fileTooLarge: () =>
        yourcatError(HttpStatus.PAYLOAD_TOO_LARGE, 'YOURCAT_FILE_TOO_LARGE', 'The photo is larger than we accept.'),
    fileType: () => yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_FILE_TYPE', 'Use a JPEG, PNG, WebP or HEIC photo.'),
    notDecodable: () => yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_NOT_DECODABLE', 'We could not open this photo.'),
    nameInvalid: (message: string) => yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_NAME_INVALID', message),
    ipDailyCap: () =>
        yourcatError(HttpStatus.TOO_MANY_REQUESTS, 'YOURCAT_IP_DAILY_CAP', 'Today’s photo limit is reached.'),
    userDailyCap: () =>
        yourcatError(HttpStatus.TOO_MANY_REQUESTS, 'YOURCAT_USER_DAILY_CAP', 'Today’s photo limit is reached.'),
    failureDailyCap: () =>
        yourcatError(
            HttpStatus.TOO_MANY_REQUESTS,
            'YOURCAT_FAILURE_DAILY_CAP',
            'Too many photos could not be used today.'
        ),
    budgetExhausted: () =>
        yourcatError(HttpStatus.SERVICE_UNAVAILABLE, 'YOURCAT_BUDGET_EXHAUSTED', 'Today’s photo cats are all made.'),
    appCheckRequired: () =>
        yourcatError(HttpStatus.UNAUTHORIZED, 'YOURCAT_APP_CHECK_REQUIRED', 'Reload the page and try again.'),
    appCheckInvalid: () =>
        yourcatError(HttpStatus.UNAUTHORIZED, 'YOURCAT_APP_CHECK_INVALID', 'Reload the page and try again.'),
    noClientIp: () =>
        yourcatError(HttpStatus.SERVICE_UNAVAILABLE, 'YOURCAT_NO_CLIENT_IP', 'Photo cats are paused right now.'),
    noCat: () =>
        yourcatError(HttpStatus.UNPROCESSABLE_ENTITY, 'YOURCAT_NO_CAT', 'We could not find a cat in this photo.'),
    personVisible: () =>
        yourcatError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'YOURCAT_PERSON_VISIBLE',
            'Use a photo with only your cat in it.'
        ),
    classifyFailed: () =>
        yourcatError(HttpStatus.BAD_GATEWAY, 'YOURCAT_CLASSIFY_FAILED', 'We could not read this photo. Try again.'),
    familyInvalid: () => yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_FAMILY_INVALID', 'Pick one of the looks.'),
    notFound: () => yourcatError(HttpStatus.NOT_FOUND, 'YOURCAT_NOT_FOUND', 'Cat not found.'),
    photoExpired: () =>
        yourcatError(HttpStatus.GONE, 'YOURCAT_PHOTO_EXPIRED', 'The photo of this cat is no longer stored.'),
    portraitDisabled: () =>
        yourcatError(HttpStatus.SERVICE_UNAVAILABLE, 'YOURCAT_PORTRAIT_DISABLED', 'Portraits are paused right now.'),
    portraitExists: () =>
        yourcatError(HttpStatus.CONFLICT, 'YOURCAT_PORTRAIT_EXISTS', 'This portrait is already paid for.'),
} as const;
