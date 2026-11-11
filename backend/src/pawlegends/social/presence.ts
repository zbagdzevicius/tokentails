import { PRESENCE, PresenceState } from './social.contracts';

/*
 * Presence (SOCIAL-RANKED.md §4), pure parts. One row per registered account: the relay writes `relay` on a phase
 * change (party, queue, match), the API pulse writes `api` from the menus; `exp` (TTL) drops a silent row after 2 min.
 * Read rule: a fresh relay state wins, else a fresh API pulse is "online", else offline. Invisible players read as
 * offline to everyone.
 */

export interface PresenceRow {
    _id: string;
    relay?: { state: 'party' | 'queue' | 'match'; party?: string; joinable?: boolean; mode?: string; at: Date } | null;
    api?: { at: Date } | null;
    rk?: number;
    exp?: Date;
}

export interface PresenceView {
    state: PresenceState;
    /** The party is joinable (lobby, a free seat, not locked). */
    joinable?: boolean;
    /** The party code: only for accepted, unblocked friends (the caller decides). */
    party?: string;
}

const ms = (d: Date | string | undefined | null) => (d ? new Date(d).getTime() : 0);

export function readPresence(row: PresenceRow | null | undefined, nowMs: number, invisible = false): PresenceView {
    if (!row || invisible) return { state: 'offline' };
    if (row.relay && nowMs - ms(row.relay.at) < PRESENCE.relayFreshMs) {
        const v: PresenceView = { state: row.relay.state };
        if (row.relay.state === 'party' && row.relay.party) {
            v.party = row.relay.party;
            v.joinable = !!row.relay.joinable;
        }
        return v;
    }
    if (row.api && nowMs - ms(row.api.at) < PRESENCE.apiFreshMs) return { state: 'online' };
    return { state: 'offline' };
}

/** The `$set`/`$max` of a presence write (relay or API). `exp` only moves forward. */
export function presenceUpdate(
    part: { relay: NonNullable<PresenceRow['relay']> } | { api: { at: Date } },
    now: Date,
    rk?: 0 | 1
): Record<string, unknown> {
    return {
        $set: { ...part, ...(rk === undefined ? {} : { rk }) },
        $max: { exp: new Date(now.getTime() + PRESENCE.ttlMs) },
    };
}
