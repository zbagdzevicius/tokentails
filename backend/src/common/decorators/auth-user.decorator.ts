import { createParamDecorator, ExecutionContext, MethodNotAllowedException } from '@nestjs/common';

/** The request user set by `AppAuthGuard`: a user document, a persisted guest, or a transient guest (F5.2). */
export interface IAuthUser {
    _id?: unknown;
    permission?: number;
    isGuest?: boolean;
    /** An anonymous Firebase user with no guest document yet. Nothing has been written for it. */
    transient?: boolean;
    /** The token uid of a transient guest (a persisted doc lists its uids in `firebaseUids`). */
    firebaseUid?: string;
    firebaseUids?: string[];
    /** True only on the request that promoted this guest to a registered account (F5.2 step 1e). */
    promotedNow?: boolean;
    /** Persisted: the promotion was not reported by GET /user/profile yet. */
    promotionUnnotified?: boolean;
    [key: string]: unknown;
}

/** Guests never earn Tails or appear on boards (plan F5, G1). */
export const isGuestUser = (user: IAuthUser | undefined | null): boolean =>
    !!user && (!!user.isGuest || !!user.transient);

/**
 * Filter for every leaderboard and board-derived reward query: guests keep their scores (the merge
 * carries them over, F5.2) but never rank or earn from a board. `$ne: true` also matches legacy docs
 * without the field. Kept for existing call sites; new code calls `notGuestFilter()`.
 */
export const NOT_GUEST_FILTER = Object.freeze({ isGuest: { $ne: true } }) as { isGuest: { $ne: true } };

/** The strict form, which the partial `{isGuest: false}` board indexes serve (F5.1). */
export const STRICT_NOT_GUEST_FILTER = Object.freeze({ isGuest: false }) as { isGuest: false };

/**
 * True once `scripts/backfill-identity-fields.js --apply` has written `isGuest: false` on every
 * legacy user (F5.3). Read per call, because `.env` is loaded after the modules are imported.
 */
export const isIdentityBackfillDone = (env: NodeJS.ProcessEnv = process.env) => env.IDENTITY_BACKFILL_DONE === 'true';

/**
 * The guest filter for boards, counts and crons. Before the backfill it is `{isGuest: {$ne: true}}`
 * (legacy docs have no field); after it, `IDENTITY_BACKFILL_DONE=true` switches to `{isGuest: false}`,
 * so leaderboard queries use the partial `isGuest: false` indexes (IXSCAN instead of a scan).
 */
export const notGuestFilter = (env: NodeJS.ProcessEnv = process.env): { isGuest: { $ne: true } } | { isGuest: false } =>
    isIdentityBackfillDone(env) ? { ...STRICT_NOT_GUEST_FILTER } : { ...NOT_GUEST_FILTER };

/** The whole `req.user`, for handlers that need more than `USER_ID`. */
export const AUTH_USER: () => ParameterDecorator = createParamDecorator((_data, ctx: ExecutionContext): IAuthUser => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) {
        throw new MethodNotAllowedException('user not found');
    }
    return request.user;
});
