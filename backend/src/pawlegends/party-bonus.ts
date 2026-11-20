import { AFK_REASONS } from './party/room';
import type { StoredRoom } from './party/room-store';
export { PARTY_XP_BONUS, partyXpBonusPct } from './pawlegends-catalog';

/*
 * Party XP bonus (docs/plans/moba/PARTY-XP.md; founder, Nov 20: "create a feature that party gives 50%+ xp boost").
 * A verified party match played with at least one other human from the player's own pre-made party pays more Season
 * XP: +50% with one party mate, +75% with two or more. Computed ONLY in the `/live` party writer
 * (`savePawlegendsPartyMatch` → `addSeasonXp`), from the stored room, never from the client.
 *
 * - Pre-made groups are fixed by the relay when the room starts (`premadeAtStart`, stored as `StoredRoom.premade`): a
 *   friends' own party room is one group of every member; a Quick Play room keeps only the friend party that queued
 *   together (strangers and backfills are never mates); casual PvP uses the matchmaker's `premade` groups.
 * - A mate counts only when the seat still holds a ticketed human that is not the same account or guest key, and the
 *   seat was not flown by a bot for more than half the match (the AFK rule that already gates the save).
 * - The bonus multiplies the match part of Season XP (result + takedowns, scaled per minute); the first win of the day
 *   stays a flat bonus. A match over the daily cap pays nothing, so the bonus is 0 too. Yarn, catnip, mastery and the
 *   account level (a match count) are unaffected.
 */

/** The party the relay starts a room from (the fields `premadeAtStart` reads). */
export interface PremadeParty {
    members: { id: string; slot?: number }[];
    mm?: {
        strangers: ReadonlySet<string>;
        host: boolean;
        casual?: { premade?: number[][] };
    };
}

const sorted = (g: number[]) => [...new Set(g)].sort((a, b) => a - b);

/**
 * The pre-made slot groups of a room at its start (groups of 2 or more only). Pure.
 * - Casual PvP and 5v5 Classic: the matchmaker's groups.
 * - Quick Play co-op: the hosting friend party's members (never the strangers it was matched with).
 * - A friends' own party room: every member.
 */
export function premadeAtStart(p: PremadeParty): number[][] {
    if (p.mm?.casual)
        return (p.mm.casual.premade ?? [])
            .filter(g => Array.isArray(g) && g.every(n => Number.isInteger(n) && n >= 0))
            .map(sorted)
            .filter(g => g.length > 1);
    if (p.mm && !p.mm.host) return [];
    const friends = p.members
        .filter(m => Number.isInteger(m.slot) && (m.slot as number) >= 0 && !p.mm?.strangers.has(m.id))
        .map(m => m.slot as number);
    const g = sorted(friends);
    return g.length > 1 ? [g] : [];
}

/** Other humans from this slot's pre-made group who really played the room (see the header). Pure. */
export function partyMatesOf(
    room: Pick<StoredRoom, 'occupants' | 'pilotTicks'> & { premade?: unknown },
    slot: number,
    ticks: number
): number {
    const groups = Array.isArray(room.premade) ? (room.premade as unknown[]) : [];
    const group = groups.find(
        (g): g is number[] => Array.isArray(g) && g.every(n => Number.isInteger(n)) && g.includes(slot)
    );
    if (!group) return 0;
    const me = room.occupants.find(o => o.slot === slot);
    let mates = 0;
    for (const s of new Set(group)) {
        if (s === slot) continue;
        const o = room.occupants.find(x => x.slot === s);
        if (!o || !o.ticketed || (!o.accountId && !o.guestKeyHash)) continue;
        if (
            me &&
            ((o.accountId && o.accountId === me.accountId) || (o.guestKeyHash && o.guestKeyHash === me.guestKeyHash))
        )
            continue;
        const t = room.pilotTicks?.[String(s)] ?? {};
        const afk = AFK_REASONS.reduce((n, k) => n + (Number(t[k]) || 0), 0);
        if (afk * 2 > ticks) continue;
        mates++;
    }
    return mates;
}
