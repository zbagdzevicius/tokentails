import { ConflictException, HttpException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CatRepository } from 'src/cat/cat.repository';
import { ICat, Tier } from 'src/cat/cat.schema';
import { GameRepository } from 'src/game/game.repository';
import { isIdentityBackfillDone } from 'src/common/decorators/auth-user.decorator';
import { accountConflict, emailUnverified } from 'src/common/guards/auth-errors';
import { GUEST_TAILS_LIFETIME_CAP } from 'src/shared-contracts/caps';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { canonicalEmail } from './guest/canonical-email';
import { disposableEmail, isDisposableEmail } from './guest/disposable-domains';
import { firebaseIdentity, IFirebaseIdentity } from './guest/firebase-identity';
import { IGuestLifecycleDeps, runGuestMerge, startGuestMerge } from './guest/guest-lifecycle';
import { GUEST_NAME, identityConfig, LAST_SEEN_INTERVAL_MS } from './guest/identity-config';
import { IpWindowThrottle } from './guest/ip-throttle';
import { ensureStarterCat, starterCatInsert, transientGuestProfile } from './guest/starter';
import { FirebaseUser } from './strategies/interface/firebase-sdk.interface';
import { UserRepository } from './user.repository';
import { recomputeAfterGuestMerge } from './utils/live-game';
import { ONBOARDING_VERSION, User } from './user.schema';
import { earnTailsInc } from './tails-ledger';

import * as StellarSdk from '@stellar/stellar-sdk';
import { EncryptionService } from 'src/shared/encryption.service';

export const ANONYMOUS_PROVIDER = 'anonymous';

/**
 * A token whose email counts as verified: `email_verified === true` only.
 *
 * Deviation from F5.2 1a (which also trusted `sign_in_provider` google.com/apple.com): a Firebase
 * user created with an unverified password for someone else's address can link its own Google
 * account and sign in with it. Firebase then keeps the primary email unverified while
 * `sign_in_provider` is `google.com`, so trusting the provider would bind that token to the owner's
 * account. Firebase already sets `email_verified: true` for real Google and Apple identities.
 */
export function isVerifiedToken(token: Pick<FirebaseUser, 'email_verified'>): boolean {
    return token?.email_verified === true;
}

export function generateRandomNumber() {
    const randomNumber = Math.floor(Math.random() * 100000000000) + 100;
    const randomString = randomNumber;
    return randomString;
}

/** Lowercased, trimmed email, or null when the value is not a usable address. */
export function normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const email = value.trim().toLowerCase();
    return email.includes('@') ? email : null;
}

/** Context of the request being authenticated (the client IP for the new-account throttle). */
export interface IResolveContext {
    ip?: string;
}

/** 409 for a guest whose progress is being merged into another account right now (F5.5). */
const guestMidMerge = () =>
    new ConflictException({ statusCode: 409, message: 'Guest progress is being saved to an account, retry' });

/**
 * Identity resolution (plan F5.2): uid first, guests, verified-only email binding, in-place guest
 * promotion, and idempotent account and starter creation.
 */
@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);

    /** F5.2 step 4: new registered accounts per IP per hour. */
    readonly newAccountThrottle = new IpWindowThrottle(
        () => identityConfig().newAccountsPerIpPerHour,
        'Too many new accounts from this network. Try again later.'
    );

    /** F5.5: guest sessions per IP per hour, a backstop behind App Check. */
    readonly guestSessionThrottle = new IpWindowThrottle(
        () => identityConfig().guestSessionsPerIpPerHour,
        'Too many guest sessions from this network. Try again later.'
    );

    // Parallel first requests of one uid share one creation. Across replicas the upserts race, and
    // the unique indexes (starter_per_owner now, firebaseUids_unique after the F5.3 migration) plus
    // the E11000 re-read settle it.
    private readonly inFlight = new Map<string, Promise<any>>();

    /** Firebase Admin calls (user existence for the insert paths, merges); replaced in specs. */
    firebase: IFirebaseIdentity = firebaseIdentity;

    constructor(
        protected repository: UserRepository,
        private catRepository: CatRepository,
        private encryptionService: EncryptionService,
        // Optional so the older specs can build the service without games; only the server-side bind
        // of a guest to a Firebase-less account (promoteGuest 1b) needs it.
        @Optional() private gameRepository?: GameRepository
    ) {}

    /**
     * 401 when the token's Firebase user no longer exists. Called only on the rare insert paths
     * (new account, new guest doc): `checkRevoked` is off, so the ID token of a user deleted by
     * `DELETE /user/me`, a merge or an erase stays valid for up to an hour and would otherwise
     * re-create an account (Apple 5.1.1(v)) or a zombie guest doc.
     */
    private async assertFirebaseUserExists(uid: string): Promise<void> {
        if (!(await this.firebase.userExists(uid))) {
            throw new UnauthorizedException('This sign-in no longer exists');
        }
    }

    private guestLifecycleDeps(): IGuestLifecycleDeps | null {
        if (!this.gameRepository) {
            return null;
        }
        return {
            users: this.users,
            cats: this.cats,
            games: this.gameRepository.model,
            firebase: this.firebase,
            // The same callback as the controller's merge: it also carries the guest's cleared flags
            // and Heist progress, so both merge paths give one result (2a review fix #1).
            recomputeTotals: recomputeAfterGuestMerge(this.repository as any, this.users as any),
            logger: this.logger,
        };
    }

    private singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
        const running = this.inFlight.get(key);
        if (running) {
            return running;
        }
        const promise = run().finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, promise);
        return promise;
    }

    private get users() {
        return this.repository.model;
    }

    private get cats() {
        return this.catRepository.model;
    }

    /** Entry point of the `appauth` strategy: splits on `firebase.sign_in_provider` (F5.2). */
    async getFirebaseUser(token: FirebaseUser, context: IResolveContext = {}): Promise<any> {
        if (token?.firebase?.sign_in_provider === ANONYMOUS_PROVIDER) {
            return this.resolveGuest(token.uid);
        }
        return this.resolveRegistered(token, context);
    }

    /**
     * F5.2 step 1: an anonymous token resolves to its guest doc, or to a transient request user when
     * no doc exists yet. Nothing is written for a transient guest.
     */
    async resolveGuest(uid: string): Promise<any> {
        if (typeof uid !== 'string' || !uid) {
            throw new UnauthorizedException();
        }
        const doc = await this.users.findOne({ firebaseUids: uid }).lean();
        if (doc) {
            if ((doc as any).deletedAt) {
                throw new UnauthorizedException();
            }
            await this.touchLastSeen(doc);
            return doc;
        }
        return transientGuestProfile(uid);
    }

    /**
     * Finds a registered account by email, lowercased or exactly as given, so legacy mixed-case
     * addresses still match before `backfill-identity-fields.js` lowercases them. Uses the native
     * driver because the schema's `lowercase` setter would lowercase the exact spelling too.
     */
    async findByEmail(email: string, extraFilter: Record<string, unknown> = {}): Promise<any | null> {
        const lower = email.trim().toLowerCase();
        const spellings = [...new Set([lower, email.trim()])];
        const base = { isGuest: { $ne: true }, deletedAt: { $exists: false }, ...extraFilter };
        const options = { sort: { createdAt: 1 as const } };
        const exact = await this.users.collection.findOne({ email: { $in: spellings }, ...base }, options);
        if (exact || isIdentityBackfillDone()) {
            return exact;
        }
        // Until backfill-identity-fields.js has lowercased every email, a legacy doc may be stored as
        // `Player@Example.COM` (manager-created accounts). Anchored, escaped, case-insensitive: it
        // still walks the email index, and it runs only when the uid and the exact spellings missed.
        const pattern = `^${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
        return this.users.collection.findOne({ email: { $regex: pattern, $options: 'i' }, ...base }, options);
    }

    /**
     * F5.2 step 2, any provider other than anonymous (email required).
     * 1. A doc owning the uid resolves (a guest doc is promoted in place).
     * 2. Else a doc with the email: attach or bind the uid only for a verified token (403 otherwise).
     * 3. No doc and not verified: 403 EMAIL_UNVERIFIED (behind AUTH_ENFORCE_EMAIL_VERIFIED).
     * 4. No doc and verified: upsert by uid, then the starter cat.
     */
    async resolveRegistered(token: FirebaseUser, context: IResolveContext = {}): Promise<any> {
        // Never look up by a missing email: { email: undefined } is sent to Mongo as
        // { email: null } and would match any stored user without an email.
        const email = normalizeEmail(token?.email);
        const uid = typeof token?.uid === 'string' && token.uid ? token.uid : null;
        if (!email || !uid) {
            throw new UnauthorizedException();
        }
        const verified = isVerifiedToken(token);
        const config = identityConfig();

        // 1. A doc that already owns this uid.
        const owner = await this.users.findOne({ firebaseUids: uid }).lean();
        if (owner) {
            if ((owner as any).deletedAt) {
                throw new UnauthorizedException();
            }
            if ((owner as any).isGuest) {
                return this.promoteGuest(owner, token, email, verified, context.ip || 'unknown');
            }
            // Decision #3, final rollout step: existing unverified password accounts verify first.
            if (config.requireVerifiedExisting && !verified && !(owner as any).emailVerifiedAt) {
                throw emailUnverified();
            }
            if (verified && !(owner as any).emailVerifiedAt) {
                await this.users.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: new Date() } });
            }
            await this.touchLastSeen(owner);
            return owner;
        }

        // 2. Email lookup (W1 security hotfix, F5.2 step 2). An unverified token never binds to or
        // resolves a doc that does not already own its uid: anyone can create a Firebase password
        // account for someone else's address. 403 EMAIL_UNVERIFIED, nothing written.
        // With enforcement on, the answer is 403 whether or not a doc has the email, so no lookup
        // runs: before the email backfill it would be a case-insensitive index scan, repeated by
        // every poll of the client's "verify your email" state.
        if (!verified && config.enforceEmailVerified) {
            throw emailUnverified();
        }
        const existing = await this.findByEmail(token.email!);
        if (existing) {
            if (!verified) {
                throw emailUnverified();
            }
            const now = new Date();
            try {
                await this.users.updateOne(
                    { _id: existing._id },
                    {
                        $addToSet: { firebaseUids: uid },
                        $set: {
                            email,
                            emailCanonical: canonicalEmail(email),
                            isGuest: false,
                            emailVerifiedAt: existing.emailVerifiedAt || now,
                            lastSeenAt: now,
                        },
                    }
                );
            } catch (error) {
                // After the F5.3 migration: a parallel request bound this uid to another doc, or the
                // lowercased email now collides with a second legacy doc (to be merged by hand, #2).
                if (isDuplicateKeyError(error)) {
                    throw accountConflict();
                }
                throw error;
            }
            return {
                ...existing,
                email,
                isGuest: false,
                firebaseUids: [...new Set([...(existing.firebaseUids || []), uid])],
            };
        }

        // 3. No account and an unverified token: nothing is created (no user, cat or wallet). With
        // enforcement on this was already answered before the lookup above.

        // 4. New account.
        return this.singleFlight(`registered:${uid}`, () =>
            this.createRegistered(token, email, uid, verified, context.ip || 'unknown')
        );
    }

    private async createRegistered(
        token: FirebaseUser,
        email: string,
        uid: string,
        verified: boolean,
        ip: string
    ): Promise<any> {
        const config = identityConfig();
        if (isDisposableEmail(email, config.extraDisposableDomains)) {
            throw disposableEmail();
        }
        this.newAccountThrottle.check(ip);
        await this.assertFirebaseUserExists(uid);

        // Generated before the upsert and persisted only on insert.
        const wallets = this.generateWallets();
        const now = new Date();
        const userId = new Types.ObjectId();
        let doc: any;
        try {
            doc = await this.users
                .findOneAndUpdate(
                    { firebaseUids: uid },
                    {
                        $setOnInsert: {
                            _id: userId,
                            name: token?.name || email.split('@')[0] || 'anonymous',
                            email,
                            emailCanonical: canonicalEmail(email),
                            firebaseUids: [uid],
                            isGuest: false,
                            ...(verified ? { emailVerifiedAt: now } : {}),
                            promotedAt: now,
                            lastSeenAt: now,
                            onboarding: { state: 'pending', version: ONBOARDING_VERSION },
                            canRedeemLives: true,
                            wallets,
                            cats: [],
                        },
                    },
                    { upsert: true, new: true }
                )
                .lean();
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            // Another replica inserted this uid first, or (after the F5.3 migration) the email index
            // rejected a second account for the same address: 409 ACCOUNT_CONFLICT (F5.2 step 1d).
            doc = await this.users.findOne({ firebaseUids: uid }).lean();
            if (!doc) {
                throw accountConflict();
            }
        }
        if (doc._id?.toString() === userId.toString()) {
            this.newAccountThrottle.record(ip);
        }

        await ensureStarterCat(this.cats, this.users, doc._id);
        return this.users.findOne({ _id: doc._id }).lean();
    }

    /**
     * F5.2 steps 1a-1e: a guest doc whose uid now signs in with a real provider (the anonymous user
     * was linked) becomes a registered account in place: same `_id`, scores and starter.
     */
    private async promoteGuest(
        guest: any,
        token: FirebaseUser,
        email: string,
        verified: boolean,
        ip: string
    ): Promise<any> {
        // 1a. Verified only; the guest doc is untouched and keeps playing.
        if (!verified) {
            throw emailUnverified();
        }
        // A merge of this guest into another account is running (another tab): its Game rows,
        // starter and Firebase user are about to move or go, so it cannot be promoted now.
        if (guest.mergedInto) {
            throw guestMidMerge();
        }
        // 1b. The email belongs to another account: the client runs the merge path. Nothing written.
        // Except when that account has no live Firebase user (portrait-order buyers, manager-created
        // accounts, legacy docs whose Firebase user was deleted): the client's "sign in to the
        // existing account" would get this same uid back, so the server binds it instead.
        const collision = await this.findByEmail(token.email!, { _id: { $ne: guest._id } });
        if (collision) {
            if (await this.hasLiveFirebaseUser(collision, token.uid)) {
                throw accountConflict();
            }
            return this.bindGuestToFirebaselessAccount(guest, collision, token.uid, email, ip);
        }
        if (isDisposableEmail(email, identityConfig().extraDisposableDomains)) {
            throw disposableEmail();
        }
        // A promotion creates a registered account (wallet, tokenized starter, the referral window),
        // so it counts against the same per-IP quota as a new sign-up (2a review fix #2). Checked
        // before any write: a 429 leaves the guest doc as it was.
        this.newAccountThrottle.check(ip);

        const wallets = this.generateWallets();
        const aliasMerged = await this.guestTailsMergedByAliases(email, guest._id);
        let current = guest;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const now = new Date();
            const pending = Math.max(0, Math.floor(Number(current.pendingTails) || 0));
            // The lifetime cap is per inbox, not per alias (2a review finding #5).
            const alreadyMerged = (Number(current.guestMergedTails) || 0) + aliasMerged;
            const credit = Math.max(0, Math.min(pending, GUEST_TAILS_LIFETIME_CAP - alreadyMerged));
            const name =
                !current.name || current.name === GUEST_NAME ? token?.name || email.split('@')[0] : current.name;

            let promoted: any;
            try {
                // 1c. One atomic write. `pendingTails` must be unchanged since the read, so a feed
                // that lands in between is never lost; the loop re-reads and retries.
                promoted = await this.users
                    .findOneAndUpdate(
                        {
                            _id: current._id,
                            isGuest: true,
                            mergedInto: { $exists: false },
                            pendingTails: current.pendingTails ?? null,
                        },
                        {
                            $set: {
                                isGuest: false,
                                email,
                                emailCanonical: canonicalEmail(email),
                                emailVerifiedAt: now,
                                wallets,
                                name,
                                promotedAt: now,
                                lastSeenAt: now,
                                canRedeemLives: true,
                                // Read and cleared once by GET /user/profile (1e), whichever request
                                // promoted.
                                promotionUnnotified: true,
                            },
                            // F5.2 1c: `tails` and `tailsEarned` by the credit (earnTailsInc, G5);
                            // monthTails follows every other Tails credit.
                            $inc: { ...earnTailsInc(credit), monthTails: credit, guestMergedTails: credit },
                            $unset: { pendingTails: 1 },
                        },
                        { new: true }
                    )
                    .lean();
            } catch (error) {
                // 1d. Unique email index backstop.
                if (isDuplicateKeyError(error)) {
                    throw accountConflict();
                }
                throw error;
            }

            if (promoted) {
                this.newAccountThrottle.record(ip);
                // The starter stops being excluded from public lists and gets its token id.
                await this.cats.updateMany(
                    { owner: promoted._id, isStarter: true, isGuestStarter: true },
                    { $unset: { isGuestStarter: 1 } }
                );
                await this.cats.updateMany(
                    { owner: promoted._id, isStarter: true, tokenId: { $exists: false } },
                    { $set: { tokenId: generateRandomNumber() } }
                );
                await ensureStarterCat(this.cats, this.users, promoted._id);
                const fresh = await this.users.findOne({ _id: promoted._id }).lean();
                // 1e. Only this request reports the promotion (it triggers the referral send, F5.7).
                return { ...(fresh || promoted), promotedNow: true };
            }

            // Promoted by a parallel request, or pendingTails moved: re-read.
            current = await this.users.findOne({ _id: guest._id }).lean();
            if (!current) {
                throw new UnauthorizedException();
            }
            if (!current.isGuest) {
                return current;
            }
            if (current.mergedInto) {
                throw guestMidMerge();
            }
        }
        throw new ConflictException({ statusCode: 409, message: 'Account is being saved, retry' });
    }

    /**
     * Guest Tails already credited to OTHER accounts of the same inbox (Gmail aliases,
     * guest/canonical-email.ts), so `me+1@gmail.com`, `me+2@gmail.com`... share one
     * GUEST_TAILS_LIFETIME_CAP. Only once IDENTITY_BACKFILL_DONE=true: the lookup needs the
     * `email_canonical` index the identity migration builds, and legacy docs need the backfilled
     * field. Before that it is 0 (the per-IP NewAccountThrottle is the only limit).
     */
    private async guestTailsMergedByAliases(email: string, exceptId: unknown): Promise<number> {
        const inbox = canonicalEmail(email);
        if (!inbox || !isIdentityBackfillDone()) {
            return 0;
        }
        const aliases = await this.users
            .find(
                { emailCanonical: inbox, _id: { $ne: exceptId }, guestMergedTails: { $gt: 0 } },
                { guestMergedTails: 1 }
            )
            .limit(50)
            .lean();
        return (aliases as any[]).reduce((sum, alias) => sum + (Number(alias.guestMergedTails) || 0), 0);
    }

    /** Whether any uid of `account` other than `exceptUid` still has a Firebase user. */
    private async hasLiveFirebaseUser(account: any, exceptUid: string): Promise<boolean> {
        const uids: string[] = (account.firebaseUids || []).filter((uid: string) => uid && uid !== exceptUid);
        for (const uid of uids) {
            if (await this.firebase.userExists(uid)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Promotion 1b for an existing account without a live Firebase user: the guest's (now linked)
     * uid becomes that account's sign-in and the guest progress is merged into it.
     *
     * Order, so a crash at any point converges:
     * 1. Claim the merge (guest.mergedInto, and the target's 30-day slot). A resume cron finishing it
     *    from here deletes the guest's Firebase user; the Google or Apple credential is then free and
     *    the next sign-in binds a fresh uid through step 2 (verified).
     * 2. Pull the uid off the guest doc, so the merge's `done` step never deletes it.
     * 3. Bind it on the account, only if the account still has no other live uid.
     * 4. Run the merge.
     * If the target already merged a guest in the last 30 days, the account is bound anyway (the
     * person must be able to sign in) and the guest progress is erased instead of merged.
     */
    private async bindGuestToFirebaselessAccount(
        guest: any,
        target: any,
        uid: string,
        email: string,
        ip: string
    ): Promise<any> {
        const deps = this.guestLifecycleDeps();
        if (!deps) {
            throw accountConflict();
        }
        // Counted like a promotion (2a review fix #2): checked before the merge claim, recorded once
        // the uid is bound.
        this.newAccountThrottle.check(ip);
        let claimed: any = null;
        try {
            claimed = await startGuestMerge(deps, guest._id, target._id);
        } catch (error) {
            if (!(error instanceof HttpException) || error.getStatus() !== 429) {
                throw error;
            }
        }
        if (claimed) {
            await this.users.updateOne({ _id: guest._id, mergedInto: target._id }, { $pull: { firebaseUids: uid } });
        } else {
            await this.users.updateOne(
                { _id: guest._id, isGuest: true, mergedInto: { $exists: false } },
                { $pull: { firebaseUids: uid } }
            );
        }

        const now = new Date();
        const staleUids: string[] = (target.firebaseUids || []).filter((value: string) => value !== uid);
        try {
            await this.users.updateOne(
                {
                    _id: target._id,
                    isGuest: { $ne: true },
                    deletedAt: { $exists: false },
                    // Unchanged since the liveness check: a uid bound in between is never replaced.
                    ...(staleUids.length ? { firebaseUids: staleUids } : { 'firebaseUids.0': { $exists: false } }),
                },
                {
                    $set: {
                        firebaseUids: [uid],
                        email,
                        emailCanonical: canonicalEmail(email),
                        isGuest: false,
                        emailVerifiedAt: target.emailVerifiedAt || now,
                        promotedAt: target.promotedAt || now,
                        lastSeenAt: now,
                        promotionUnnotified: true,
                    },
                }
            );
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw accountConflict();
            }
            throw error;
        }
        const bound = await this.users.findOne({ _id: target._id, firebaseUids: uid }).lean();
        if (!bound) {
            // Another uid was bound to the account in between: the normal merge path applies.
            throw accountConflict();
        }
        this.newAccountThrottle.record(ip);

        if (claimed) {
            await runGuestMerge(deps, { ...claimed, mergedInto: target._id });
        } else {
            // No merge slot: the guest progress cannot be merged, and its doc no longer has a uid.
            await deps.games.deleteMany({ user: guest._id });
            await this.cats.deleteMany({ owner: guest._id });
            await this.users.deleteOne({ _id: guest._id, isGuest: true, mergedInto: { $exists: false } });
        }
        await ensureStarterCat(this.cats, this.users, target._id);
        const fresh = await this.users.findOne({ _id: target._id }).lean();
        return { ...fresh, promotedNow: true };
    }

    /**
     * 1e, once per promotion: whether the promotion of `user` is still unreported. Clears the flag
     * atomically, so exactly one GET /user/profile reports `promotedNow` even when the promoting
     * request was another route (`/live`, a poll).
     */
    async claimPromotionNotice(user: { _id?: unknown; promotionUnnotified?: boolean }): Promise<boolean> {
        if (!user?._id || !user.promotionUnnotified) {
            return false;
        }
        const result = await this.users.updateOne(
            { _id: user._id, promotionUnnotified: true },
            { $unset: { promotionUnnotified: 1 } }
        );
        return !!(result as { modifiedCount?: number }).modifiedCount;
    }

    /**
     * `POST /user/guest/session` (F5.5): idempotent upsert of the guest doc for an anonymous uid,
     * then the guest starter. No email, no wallet.
     */
    async createGuestSession(uid: string, ip: string): Promise<any> {
        if (typeof uid !== 'string' || !uid) {
            throw new UnauthorizedException();
        }
        const existing = await this.users.findOne({ firebaseUids: uid }).lean();
        if (existing && !(existing as any).isGuest) {
            throw new ConflictException({ statusCode: 409, message: 'Already signed in with an account' });
        }
        if (!existing) {
            this.guestSessionThrottle.check(ip);
            // A lingering token of a guest that was merged or erased must not re-create it.
            await this.assertFirebaseUserExists(uid);
        }
        return this.singleFlight(`guest:${uid}`, async () => {
            const now = new Date();
            const guestId = new Types.ObjectId();
            let doc: any;
            try {
                doc = await this.users
                    .findOneAndUpdate(
                        { firebaseUids: uid },
                        {
                            $setOnInsert: {
                                _id: guestId,
                                firebaseUids: [uid],
                                isGuest: true,
                                name: GUEST_NAME,
                                onboarding: { state: 'pending', version: ONBOARDING_VERSION },
                                pendingTails: 0,
                                guestMergedTails: 0,
                                lastSeenAt: now,
                                canRedeemLives: false,
                                cats: [],
                            },
                        },
                        { upsert: true, new: true }
                    )
                    .lean();
            } catch (error) {
                if (!isDuplicateKeyError(error)) {
                    throw error;
                }
                doc = await this.users.findOne({ firebaseUids: uid }).lean();
            }
            if (!doc?.isGuest) {
                throw new ConflictException({ statusCode: 409, message: 'Already signed in with an account' });
            }
            if (doc._id.toString() === guestId.toString()) {
                this.guestSessionThrottle.record(ip);
            }
            await ensureStarterCat(this.cats, this.users, doc._id, { guest: true });
            return this.users.findOne({ _id: doc._id }).lean();
        });
    }

    /** `lastSeenAt` at most once a day (F5.1). Never fails the request. */
    async touchLastSeen(doc: { _id?: unknown; lastSeenAt?: Date | string }): Promise<void> {
        const now = Date.now();
        const last = doc?.lastSeenAt ? new Date(doc.lastSeenAt).getTime() : 0;
        if (!doc?._id || now - last < LAST_SEEN_INTERVAL_MS) {
            return;
        }
        try {
            const cutoff = new Date(now - LAST_SEEN_INTERVAL_MS);
            await this.users.updateOne(
                { _id: doc._id, $or: [{ lastSeenAt: null }, { lastSeenAt: { $lt: cutoff } }] },
                { $set: { lastSeenAt: new Date(now) } }
            );
        } catch (error) {
            this.logger.warn(`lastSeenAt not written: ${(error as Error)?.message}`);
        }
    }

    generateWallets() {
        const stellar = this.generateStellarWallet();
        return {
            stellar,
        };
    }

    private generateStellarWallet() {
        const issuerKeypair = StellarSdk.Keypair.random();

        return {
            walletAddress: issuerKeypair.publicKey(),
            walletPrivateKey: this.encryptionService.encrypt(issuerKeypair.secret()),
        };
    }

    /**
     * A locked starter with the legacy Cleocatra look, for accounts created without Meet your cat
     * (createUser, the manager POST /user/profile). Kept under its old name for callers.
     */
    async generateACat(catId: Types.ObjectId = new Types.ObjectId(), userId: Types.ObjectId = new Types.ObjectId()) {
        return await this.catRepository.create({
            _id: catId,
            owner: userId,
            isStarter: true,
            ...starterCatInsert({ locked: true }),
        } as any);
    }

    async createCat(cat: Partial<ICat>) {
        return await this.catRepository.create({
            ...cat,
            name: cat.name,
            resqueStory: cat.resqueStory,
            type: cat.type,
            tier: Tier.COMMON,
            status: {
                EAT: 0,
            },
            spriteImg: cat.spriteImg,
            catImg: cat.catImg,
            createdAt: new Date(),
            tokenId: generateRandomNumber(),
        });
    }

    /**
     * Accounts created for someone else (portrait orders, `image.controller.ts`): lowercased email,
     * `isGuest: false`, a locked starter, and never `onboarding` (F5.2 step 3 of the list, G3).
     */
    async createUser(params: Partial<User>) {
        const wallets = this.generateWallets();

        const catId = new Types.ObjectId();
        const userId = new Types.ObjectId();
        await this.generateACat(catId, userId);
        const email = normalizeEmail(params.email) || undefined;
        return this.repository.create({
            _id: userId,
            name: params.name || email,
            email,
            emailCanonical: canonicalEmail(email) || undefined,
            isGuest: false,
            shelter: params.shelter ? new Types.ObjectId(params.shelter) : undefined,
            canRedeemLives: true,
            permission: params.permission,
            discount: params.discount,
            wallets,
            cat: catId,
            cats: [catId],
        });
    }
}
