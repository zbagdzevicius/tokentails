import { randomInt } from 'crypto';
import { ADJECTIVES, NOUNS } from './party-names';

/*
 * Casual fill bots as players (founder, 2026-11-19: "while match is found, in-game shouldn't appear as BOT but as
 * generated user name, country, champ like as usual"). Each bot seat of a casual (not ranked) Quick Play match gets one
 * persona when the pick opens: a name in the generated "<adjective> <cat noun>" shape every player without a chosen
 * name shows (party-names.ts; nickname.ts reserves that shape, so it never equals a real player's chosen nickname, and
 * both lists are curated, so it is profanity-safe), a country flag weighted towards the match's own players, a default
 * champion avatar, and later a champion it locks like a player (party.service.ts). The same persona names the seat in
 * the lobby, the pick, loading, the match and the results; history keeps the seat a bot (`u: null`) with the persona
 * beside it for display only. Ranked never gets personas: its bots stay labelled (SOCIAL-RANKED.md §8.1).
 */

/** A persona as the relay keeps it (party.service.ts `PartyCasual.personas`). */
export interface BotPersona {
    slot: number;
    name: string;
    /** ISO country flag; null shows a paw (a player who hid it). */
    cc: string | null;
    /** The avatar icon (`h:<hero>`, a default champion icon). */
    av: { i: string };
    /** The champion it locked in the pick (absent until it locks). */
    hero?: string;
    trick?: string;
    /** When it locks, server clock ms (never sent). */
    lockAtMs?: number;
}

/** What a client sees of a persona: the party view's `mm.fill` and the match frame's `personas`. */
export interface BotPersonaView {
    slot: number;
    name: string;
    cc?: string;
    av?: { i: string };
    hero?: string;
    locked?: boolean;
}

/**
 * The flags a persona draws when no player in the match shows one: the home region's (eu) most common player
 * countries, some more than once (a weighted draw).
 */
export const PERSONA_REGION_FLAGS: readonly string[] = Object.freeze([
    'LT',
    'LT',
    'PL',
    'PL',
    'DE',
    'DE',
    'GB',
    'GB',
    'FR',
    'ES',
    'IT',
    'NL',
    'LV',
    'EE',
    'SE',
    'FI',
    'UA',
    'RO',
    'CZ',
    'PT',
    'US',
]);

/** Shares of the flag draw: a flag of a player in the match, the region list, else hidden (a paw). */
export const PERSONA_FLAG_SHARES = Object.freeze({ players: 0.55, hidden: 0.15 });

const CC = /^[A-Z]{2}$/;

export interface PersonaInput {
    /** The bot seats, in slot order. */
    slots: readonly number[];
    /** The flags the match's players show (null or absent: hidden or unknown). */
    playerFlags: readonly (string | null | undefined)[];
    /** Names already in the match (the players'); a persona never repeats one. */
    taken: readonly string[];
    /** Champions for the avatar icon. */
    heroes: readonly string[];
    /** A uniform draw in [0, 1) (tests pass a seeded one). */
    rand?: () => number;
}

const defaultRand = (): number => randomInt(0, 1_000_000) / 1_000_000;
const pickOf = <T>(list: readonly T[], rand: () => number): T => list[Math.floor(rand() * list.length) % list.length];

/** One persona per bot seat. Pure apart from the default draw. */
export function makePersonas(i: PersonaInput): BotPersona[] {
    const rand = i.rand ?? defaultRand;
    const used = new Set(i.taken.map(n => n.toLowerCase()));
    const flags = i.playerFlags.filter((c): c is string => typeof c === 'string' && CC.test(c));
    const out: BotPersona[] = [];
    for (const slot of i.slots) {
        let name = '';
        for (let tries = 0; tries < 50; tries++) {
            const n = `${pickOf(ADJECTIVES, rand)} ${pickOf(NOUNS, rand)}`;
            if (!used.has(n.toLowerCase()) || tries === 49) {
                name = n;
                break;
            }
        }
        used.add(name.toLowerCase());
        const r = rand();
        const cc =
            r < PERSONA_FLAG_SHARES.hidden
                ? null
                : flags.length && r < PERSONA_FLAG_SHARES.hidden + PERSONA_FLAG_SHARES.players
                ? pickOf(flags, rand)
                : pickOf(PERSONA_REGION_FLAGS, rand);
        const icon = i.heroes.length ? pickOf(i.heroes, rand) : 'clem';
        out.push({ slot, name, cc, av: { i: `h:${icon}` } });
    }
    return out;
}

/** The wire view of a persona; `hideHero` in a casual pick for the other team (its heroes stay hidden). */
export function personaView(p: BotPersona, hideHero = false): BotPersonaView {
    const v: BotPersonaView = { slot: p.slot, name: p.name, av: { ...p.av } };
    if (p.cc) v.cc = p.cc;
    if (p.hero && !hideHero) {
        v.hero = p.hero;
        v.locked = true;
    }
    return v;
}

/**
 * The champion a persona locks: one of its team's species no teammate (player or persona) holds or hovers and no ban
 * takes, drawn at random (the sim's own fill rule: each hero of the side once before a repeat), leaving a teammate who
 * still chooses its last options (`spare`); else any of the species nobody on the team locked; else none (the sim fills
 * the seat). Pure apart from the draw.
 */
export function personaHero(o: {
    heroes: readonly string[];
    sideOf: (hero: string) => string | null;
    species: string;
    /** Heroes the team's players and personas hold or hover. */
    taken: readonly string[];
    /** Heroes the team's players locked (never repeated). */
    locked: readonly string[];
    banned?: readonly string[];
    /** Heroes left alone while another is free: the last ones a teammate still choosing may pick. */
    spare?: readonly string[];
    rand?: () => number;
}): string | undefined {
    const rand = o.rand ?? defaultRand;
    const kin = o.heroes.filter(h => o.sideOf(h) === o.species && !(o.banned ?? []).includes(h));
    const fresh = kin.filter(h => !o.taken.includes(h));
    const polite = fresh.filter(h => !(o.spare ?? []).includes(h));
    const pool = polite.length ? polite : fresh.length ? fresh : kin.filter(h => !o.locked.includes(h));
    return pool.length ? pickOf(pool, rand) : undefined;
}
