import { ConflictException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from 'src/shared-contracts/errors';

/**
 * Auth error codes, sent in the body as `{ statusCode, code, message }` (plan F5.6).
 *
 * The literals come from the generated copy of the repo-root `shared/errors.ts`
 * (`src/shared-contracts/errors`), so the backend, client and CMS share one uppercase vocabulary.
 */
export const AUTH_ERROR = {
    GUEST_FORBIDDEN: ErrorCode.GUEST_FORBIDDEN,
    GUEST_SESSION_REQUIRED: ErrorCode.GUEST_SESSION_REQUIRED,
    EMAIL_UNVERIFIED: ErrorCode.EMAIL_UNVERIFIED,
    ACCOUNT_CONFLICT: ErrorCode.ACCOUNT_CONFLICT,
} as const;

export type AuthErrorCode = typeof AUTH_ERROR[keyof typeof AUTH_ERROR];

/** 428 Precondition Required: Nest 9 has no named exception for it. */
export const GUEST_SESSION_REQUIRED_STATUS = HttpStatus.PRECONDITION_REQUIRED;

/** A guest reached a route without `@AllowGuest()`. */
export const guestForbidden = () =>
    new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: AUTH_ERROR.GUEST_FORBIDDEN,
        message: 'Create an account to do this',
    });

/** A guest without a persisted session reached a route that needs one. */
export const guestSessionRequired = () =>
    new HttpException(
        {
            statusCode: GUEST_SESSION_REQUIRED_STATUS,
            code: AUTH_ERROR.GUEST_SESSION_REQUIRED,
            message: 'Start a guest session first',
        },
        GUEST_SESSION_REQUIRED_STATUS
    );

/** The token's email is not verified, so it may not bind to or resolve this account. */
export const emailUnverified = () =>
    new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: AUTH_ERROR.EMAIL_UNVERIFIED,
        message: 'Verify your email address to sign in',
    });

/**
 * Another account already uses this email (F5.2 step 1b, 1d). The client runs the guest merge path:
 * sign in to the existing account, then `POST /user/guest/merge` with `x-guest-token`.
 */
export const accountConflict = () =>
    new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: AUTH_ERROR.ACCOUNT_CONFLICT,
        message: 'An account with this email already exists. Sign in to it to keep your progress.',
    });
