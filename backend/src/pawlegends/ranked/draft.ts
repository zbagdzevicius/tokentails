/*
 * Ranked draft (docs/plans/moba/SOCIAL-RANKED.md §7.13, gaps round 6): a ban phase before the pick, as Wild Rift and
 * Mobile Legends run at their higher ranks. Pure helpers; the party state machine (party/party.service.ts) runs the
 * phase and the relay (party/party-relay.ts) re-rolls the room seed so the sim's bots never field a banned hero.
 *
 * - From `fromIdx` (Tabby III: every tier above the entry tier Kitten) for the best player in the match, on a socket of
 *   PROTO_DRAFT or newer (an older game keeps the blind pick it knows).
 * - Each team bans `bansPerTeam` champion of the OTHER team's species (cats ban a dog, dogs a cat; a mirror bans its
 *   own species). Every human on the team votes; the team's ban is the most-voted hero, a tie goes to the vote of the
 *   lowest seat. A team of players that casts no vote bans nothing. A team of bots (Ranked vs AI's opponents) bans one
 *   champion the way `botBan` picks it, labelled "Bot ban".
 * - `banMs` for the votes (it ends early when every human voted), then the 30 s pick as before; a banned champion is
 *   off the grid for both teams, the timeout auto-lock and the bots.
 *
 * Why one ban a team: each species has six free champions any week (three starters and three on rotation), heroes are
 * unique within a team, and two bans can land on one species in a mirror, so four stay free for three players.
 */

export const RANKED_DRAFT = Object.freeze({
    /** The lowest tier index (of the best player in the match) that drafts: Tabby III. */
    fromIdx: 3,
    banMs: 15_000,
    bansPerTeam: 1,
});

/**
 * The bots' ban order: the sim v30 pooled win rate, highest first (docs/plans/moba/V30-BALANCE.md §1), per species.
 * A hero missing here (a new champion) comes after these in roster order.
 */
export const BOT_BAN_ORDER: Readonly<Record<'cat' | 'dog', readonly string[]>> = Object.freeze({
    cat: Object.freeze([
        'aviete',
        'clem',
        'stilts',
        'bengas',
        'duchess',
        'sage',
        'pixel',
        'lambo',
        'mochi',
        'gabe',
        'meatball',
        'ziggy',
    ]),
    dog: Object.freeze([
        'frankie',
        'howler',
        'chili',
        'cacklejaw',
        'bravo',
        'biscuit',
        'champ',
        'rocket',
        'domino',
        'brutus',
        'nugget',
        'marshmallow',
    ]),
});

export type DraftBanBy = 'team' | 'bot' | 'none';

export interface DraftVote {
    slot: number;
    hero: string;
}

/** The team's ban from its players' votes: the most votes, a tie to the lowest seat's vote; none: null. Pure. */
export function teamBan(votes: readonly DraftVote[]): string | null {
    if (!votes.length) return null;
    const count = new Map<string, number>();
    for (const v of votes) count.set(v.hero, (count.get(v.hero) ?? 0) + 1);
    const top = Math.max(...count.values());
    const tied = new Set([...count].filter(([, n]) => n === top).map(([h]) => h));
    return [...votes].sort((a, b) => a.slot - b.slot).find(v => tied.has(v.hero))!.hero;
}

/**
 * A bot team's ban: the first hero of the target species in `BOT_BAN_ORDER` that is free to everyone this week (a
 * player is sure to own it), not already banned and in this sim; else the first such hero at all. Pure.
 */
export function botBan(
    species: 'cat' | 'dog',
    heroes: readonly string[],
    sideOf: (hero: string) => string | null,
    banned: readonly string[],
    isFree: (hero: string) => boolean = () => true
): string | null {
    const order = [...BOT_BAN_ORDER[species], ...heroes.filter(h => !BOT_BAN_ORDER[species].includes(h))].filter(
        h => heroes.includes(h) && sideOf(h) === species && !banned.includes(h)
    );
    return order.find(isFree) ?? order[0] ?? null;
}

/**
 * A room seed whose bot seats field no banned hero (the sim draws the bots' heroes from the seed: `fillPicksParty`).
 * Tries `seed` first, then `next()` up to `tries` times; null when none is clean (the caller keeps the first seed).
 */
export function draftSeed(
    seed: number,
    bans: readonly string[],
    botSlots: readonly number[],
    picksOf: (seed: number) => readonly string[],
    next: () => number,
    tries = 400
): number | null {
    if (!bans.length || !botSlots.length) return seed;
    let s = seed;
    for (let i = 0; i <= tries; i++) {
        const picks = picksOf(s);
        if (botSlots.every(slot => !bans.includes(picks[slot]))) return s;
        s = next();
    }
    return null;
}
