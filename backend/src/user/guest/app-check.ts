import { Logger } from '@nestjs/common';
import { IFirebaseIdentity } from './firebase-identity';

/*
 * Firebase App Check verification, shared by `POST /user/guest/session` (no replay protection, as
 * before) and the bet #3 AI gate (`consume: true`: a limited-use token is accepted once, so a script
 * cannot replay one real token; docs/plans/yourcat-v2.md section 3.1, layer 3).
 */

export type AppCheckResult = 'verified' | 'missing' | 'invalid' | 'replayed';

const logger = new Logger('AppCheck');

/**
 * `'missing'` without a token, `'invalid'` when Firebase rejects it, `'replayed'` when `consume` is on
 * and the token was already consumed, else `'verified'`. Never throws; the caller decides what each
 * result means (`enforce` only changes the log line).
 */
export async function verifyAppCheckToken(
    firebase: Pick<IFirebaseIdentity, 'verifyAppCheck' | 'verifyAppCheckConsuming'>,
    token: unknown,
    { enforce, consume }: { enforce: boolean; consume: boolean }
): Promise<AppCheckResult> {
    if (typeof token !== 'string' || !token) {
        return 'missing';
    }
    try {
        if (consume) {
            if (!firebase.verifyAppCheckConsuming) {
                throw new Error('this identity adapter cannot consume App Check tokens');
            }
            const { alreadyConsumed } = await firebase.verifyAppCheckConsuming(token);
            return alreadyConsumed ? 'replayed' : 'verified';
        }
        await firebase.verifyAppCheck(token);
        return 'verified';
    } catch (error) {
        if (!enforce) {
            logger.warn(`App Check token is invalid (not enforced): ${(error as Error)?.message}`);
        }
        return 'invalid';
    }
}
