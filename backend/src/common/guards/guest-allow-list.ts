import { AllowGuestOptions } from '../decorators/allow-guest.decorator';

/**
 * Every route a guest may call, reviewed in one place (plan F5.4, decision #9). Everything else
 * behind `AppAuthGuard` answers a guest with 403 GUEST_FORBIDDEN: no spin, quests, adopt, buy, gift,
 * stake, redeem, tickets, referral or claims.
 *
 * A route is listed here AND carries `@AllowGuest()` with the same options; `guard-migration.spec.ts`
 * fails when the two differ. Keys are `METHOD /controller/path`, exactly as Nest registers them.
 *
 * `POST /user/guest/merge` is NOT listed: the caller is the registered target account; the guest is
 * identified by its anonymous token in `x-guest-token`. `DELETE /user/me` and
 * `POST /user/catbassadors/referral` are registered-only too.
 *
 * Exceptions: the portrait checkouts of bet #3 (`POST /yourcat/:id/portrait-checkout`), a card purchase
 * of a digital portrait of the guest's own cat; the founder decides it in docs/plans/yourcat-v2.md §10.
 */
export const GUEST_ALLOW_LIST: Readonly<Record<string, Readonly<AllowGuestOptions>>> = {
    // The transient template profile renders menus and Meet your cat before anything is written.
    'GET /user/profile': { transient: true },
    // F5.5: creates the guest doc and starter (idempotent). The one route that turns a transient
    // guest into a persisted one.
    'POST /user/guest/session': { transient: true },
    // "Erase guest progress" (G1). Transient too, so it also deletes an anonymous user with no doc.
    'DELETE /user/guest': { transient: true },
    // The one score writer. A transient guest gets 428 and creates its session once (F5.7).
    'POST /user/catbassadors/live': {},
    // Feeding the guest's own cat. The reward goes to pendingTails, never spendable Tails (G1).
    'PUT /cat/:id': {},
    // Read-only previews of the guest's own progress ("you would be #N").
    'GET /user/cats': {},
    'GET /user/airdrop/progression': {},
    'GET /user/leaderboard/position': {},
    'GET /user/leaderboard/catnip/position': {},
    'GET /user/leaderboard/paw-match/:level/position': {},
    'GET /user/leaderboard/rescuers/position': {},
    // Meet your cat (G3), once the guest session exists: commit the guest's own starter (once),
    // rename it (owner and starter only), and follow real shelter cats.
    'POST /user/starter': {},
    'PUT /cat/:id/name': {},
    'POST /user/following/:blessingId': {},
    'DELETE /user/following/:blessingId': {},
    // Bet #3 /yourcat: a guest turns one photo into its own cat (capped per IP, per user and by the AI budget).
    'POST /yourcat': {},
    'POST /yourcat/manual': {},
    'GET /yourcat/me': { transient: true },
    'GET /yourcat/:id': {},
    'PATCH /yourcat/:id': {},
    'DELETE /yourcat/:id': {},
    // Exception to decision #9 (no buying as a guest): a card purchase of the HD portrait of the guest's own
    // cat. Stripe collects the email; see the file header and yourcat-v2.md §10.
    'POST /yourcat/:id/portrait-checkout': {},
    // The portrait preview is a paid generation: guests allowed, under the same caps (bet #3).
    'POST /image/portrait': {},
    // Regenerate: guests only for images they own (the handler checks `owner`), same caps.
    'PUT /image/portrait/:id/regenerate': {},
    // Bad Cat Daily Phase 2: read-only, the guest's own run of a day ("you scored N; sign in to rank") and its
    // account summary. Guests never appear on the board itself.
    'GET /badcat/board/:day/me': { transient: true },
    'GET /badcat/account': { transient: true },
};
