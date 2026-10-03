import { SetMetadata } from '@nestjs/common';

export const ALLOW_GUEST_KEY = 'tt:allowGuest';

export interface AllowGuestOptions {
    /**
     * Also admit a transient guest: an anonymous Firebase user with no guest document yet. Without
     * it such a caller gets 428 GUEST_SESSION_REQUIRED and the client creates the session first.
     */
    transient?: boolean;
}

/**
 * Opens a route behind `AppAuthGuard` to guest users (plan F5.4). Every use must be listed in
 * `GUEST_ALLOW_LIST` (src/common/guards/guest-allow-list.ts); a reflection spec keeps the two equal.
 */
export const AllowGuest = (options: AllowGuestOptions = {}) =>
    SetMetadata<string, Required<AllowGuestOptions>>(ALLOW_GUEST_KEY, { transient: !!options.transient });
