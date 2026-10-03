import { Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

/**
 * The Firebase Admin calls of the identity lifecycle (F5.5), behind one small interface so specs can
 * replace them. Every call is best effort where the plan allows it: a Firebase user that is already
 * gone counts as deleted.
 */
export interface IFirebaseIdentity {
    /** Verifies a Firebase ID token (without the `fb` prefix). Throws when it is invalid or expired. */
    verifyIdToken(token: string): Promise<{ uid: string; firebase?: { sign_in_provider?: string } }>;
    /** Deletes Firebase users by uid. Returns how many are gone (deleted now or already missing). */
    deleteUsers(uids: string[]): Promise<number>;
    /**
     * The guest paths (idle cleanup, erase, merge `done`): deletes only the uids whose Firebase user
     * is still anonymous (no linked provider). A guest that linked an email/password credential it
     * never verified keeps a guest doc but owns a real login now, which must survive. Users already
     * gone count as deleted; when the lookup fails nothing is deleted. Returns how many are gone.
     */
    deleteAnonymousUsers(uids: string[]): Promise<number>;
    /** Verifies an App Check token from `x-firebase-appcheck`. Throws when it is invalid. */
    verifyAppCheck(token: string): Promise<void>;
    /**
     * Whether the Firebase user still exists. False only for `auth/user-not-found`; any other error
     * (Firebase unreachable) counts as existing, so an outage never blocks sign-in or sign-up.
     */
    userExists(uid: string): Promise<boolean>;
}

const logger = new Logger('FirebaseIdentity');

const DELETE_BATCH = 1000;
/** `admin.auth().getUsers` accepts at most 100 identifiers per call. */
const LOOKUP_BATCH = 100;

export const firebaseIdentity: IFirebaseIdentity = {
    async verifyIdToken(token) {
        return admin.auth().verifyIdToken(token);
    },

    async deleteUsers(uids) {
        const unique = [...new Set(uids.filter(uid => typeof uid === 'string' && uid))];
        let gone = 0;
        for (let index = 0; index < unique.length; index += DELETE_BATCH) {
            const batch = unique.slice(index, index + DELETE_BATCH);
            try {
                const result = await admin.auth().deleteUsers(batch);
                // A uid that no longer exists is reported as a success by deleteUsers.
                gone += result.successCount;
                if (result.failureCount) {
                    logger.warn(`deleteUsers: ${result.failureCount} of ${batch.length} uids could not be deleted`);
                }
            } catch (error) {
                logger.error(`deleteUsers failed for a batch of ${batch.length}`, (error as Error)?.message);
            }
        }
        return gone;
    },

    async deleteAnonymousUsers(uids) {
        const unique = [...new Set(uids.filter(uid => typeof uid === 'string' && uid))];
        const anonymous: string[] = [];
        let missing = 0;
        let kept = 0;
        for (let index = 0; index < unique.length; index += LOOKUP_BATCH) {
            const batch = unique.slice(index, index + LOOKUP_BATCH);
            try {
                const result = await admin.auth().getUsers(batch.map(uid => ({ uid })));
                missing += result.notFound.length;
                for (const user of result.users) {
                    if (user.providerData?.length) {
                        kept += 1;
                    } else {
                        anonymous.push(user.uid);
                    }
                }
            } catch (error) {
                logger.error(`getUsers failed for a batch of ${batch.length}, none deleted`, (error as Error)?.message);
            }
        }
        if (kept) {
            logger.warn(`deleteAnonymousUsers: kept ${kept} guest uids that have a linked provider`);
        }
        return missing + (anonymous.length ? await firebaseIdentity.deleteUsers(anonymous) : 0);
    },

    async verifyAppCheck(token) {
        await admin.appCheck().verifyToken(token);
    },

    async userExists(uid) {
        try {
            await admin.auth().getUser(uid);
            return true;
        } catch (error) {
            if ((error as { code?: string })?.code === 'auth/user-not-found') {
                return false;
            }
            logger.warn(`getUser failed, treating the user as existing: ${(error as Error)?.message}`);
            return true;
        }
    },
};

/** `fb`-prefixed Firebase token from a lowercase header (`accesstoken`, `x-guest-token`), or null. */
export function firebaseTokenFromHeader(value: unknown): string | null {
    if (typeof value !== 'string' || value.length <= 2 || !value.startsWith('fb')) {
        return null;
    }
    return value.slice(2);
}
