import { Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';

/**
 * The once-a-day key for a treat sent without an account (POST /shelter/donate/guest, Oct 8, 2026).
 *
 * A donation row is keyed by a `user` ObjectId and the UTC day (unique index `user_day`). A caller
 * with no account gets a pseudo id instead: the first 12 bytes of HMAC-SHA256(salt, `day|ip`). The raw
 * address is never stored, the id changes every UTC day, and without the salt it cannot be tied back
 * to an address. It can never equal a real account id in practice (96 random-looking bits).
 *
 * Salt: SHELTER_TREAT_IP_SALT, else INVALIDATE_CACHE_SECRET (an existing server secret; HMAC keeps it
 * one-way), else a random per-process salt with one warning. With the per-process salt a restart or
 * a second replica would let one address send a second treat that day, so set the variable.
 */
const logger = new Logger('TreatGuestKey');
let processSalt: string | null = null;

export function treatIpSalt(env: NodeJS.ProcessEnv = process.env): string {
    const configured = env.SHELTER_TREAT_IP_SALT || env.INVALIDATE_CACHE_SECRET;
    if (configured) {
        return configured;
    }
    if (!processSalt) {
        processSalt = randomBytes(32).toString('hex');
        logger.warn(
            'SHELTER_TREAT_IP_SALT is not set: guest treats use a per-process salt (one extra treat per restart)'
        );
    }
    return processSalt;
}

/** A 24-hex ObjectId string for (day, ip); the same inputs and salt always give the same id. */
export function guestTreatId(ip: string, day: string, salt: string = treatIpSalt()): string {
    return createHmac('sha256', salt).update(`treat-guest|${day}|${ip}`).digest('hex').slice(0, 24);
}
