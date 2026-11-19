import { PRESENCE, PresenceState } from './social.contracts';

/*
 * Presence (SOCIAL-RANKED.md §4), pure parts. One row per registered account: the relay writes `relay` on a phase
 * change (party, queue, match), the API pulse writes `api` from the menus; `exp` (TTL) drops a silent row after 2 min.
 * Read rule: a fresh relay state wins, else a fresh API pulse is "online", else offline. Invisible players read as
 * offline to everyone.
 */

export interface PresenceRow {
    _id: string;
    relay?: {
        state: 'party' | 'queue' | 'match';
        party?: string;
        joinable?: boolean;
        mode?: string;
        room?: string;
        /** `match` (round 6): the champion played, when the match clock started (epoch ms). `q`: a ranked queue. */
        hero?: string;
        t0?: number;
        q?: string;
        at: Date;
    } | null;
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
    /** SPECTATE.md: a watchable match's room id (Watch on the friend row): accepted, unblocked friends only. */
    room?: string;
    /** Online in the menus but set Away (LoL's status); never on a party, queue or match state. */
    away?: true;
    /** `match`: the champion played (a hero id); `queue`/`match`: the queue ("ranked", "casual"...); `match`: since. */
    hero?: string;
    mode?: string;
    since?: number;
}

const MODES = new Set(['ranked', 'casual', 'classic', 'bots', 'custom']);
const HERO = /^[a-z][a-z0-9]{0,23}$/;

const ms = (d: Date | string | undefined | null) => (d ? new Date(d).getTime() : 0);

export function readPresence(row: PresenceRow | null | undefined, nowMs: number, invisible = false): PresenceView {
    if (!row || invisible) return { state: 'offline' };
    if (row.relay && nowMs - ms(row.relay.at) < PRESENCE.relayFreshMs) {
        const v: PresenceView = { state: row.relay.state };
        if (row.relay.state === 'party' && row.relay.party) {
            v.party = row.relay.party;
            v.joinable = !!row.relay.joinable;
        }
        if (row.relay.state === 'match' && typeof row.relay.room === 'string' && /^[a-z0-9]{12}$/.test(row.relay.room))
            v.room = row.relay.room;
        if (row.relay.state === 'match') {
            const r = row.relay;
            if (typeof r.hero === 'string' && HERO.test(r.hero)) v.hero = r.hero;
            if (typeof r.mode === 'string' && MODES.has(r.mode)) v.mode = r.mode;
            // a start up to a minute ahead (the countdown) or within a day: anything else is a clock to ignore
            if (
                typeof r.t0 === 'number' &&
                Number.isFinite(r.t0) &&
                r.t0 <= nowMs + 60_000 &&
                nowMs - r.t0 < 86_400_000
            )
                v.since = Math.min(r.t0, nowMs);
        }
        if (row.relay.state === 'queue' && row.relay.q === 'ranked') v.mode = 'ranked';
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
