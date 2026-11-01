import {
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    UnauthorizedException,
} from '@nestjs/common';
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
    EMAIL_DISPOSABLE: ErrorCode.EMAIL_DISPOSABLE,
    GUEST_MERGE_IN_PROGRESS: ErrorCode.GUEST_MERGE_IN_PROGRESS,
    ACCOUNT_DELETED: ErrorCode.ACCOUNT_DELETED,
    ACCOUNT_MISSING: ErrorCode.ACCOUNT_MISSING,
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

/**
 * The guest doc of this uid is being merged into another account (another tab, or a merge that
 * stopped half way and could not be finished inline). The client retries.
 */
export const guestMergeInProgress = () =>
    new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: AUTH_ERROR.GUEST_MERGE_IN_PROGRESS,
        message: 'Guest progress is being saved to an account, retry',
    });

/** The account of this sign-in was deleted (DELETE /user/me). The client signs out. */
export const accountDeleted = () =>
    new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: AUTH_ERROR.ACCOUNT_DELETED,
        message: 'This account was deleted',
    });

/** The token resolved, but no profile document could be read for it. The client signs out. */
export const accountMissing = () =>
    new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: AUTH_ERROR.ACCOUNT_MISSING,
        message: 'This account could not be found',
    });
