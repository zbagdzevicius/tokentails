/*
 * Peer-visible names (MULTIPLAYER.md D8, §5.2): no player free text ever reaches another player. A member shows as
 * "<adjective> <catalog or breed name>" with a card, else "<adjective> <cat noun>". Deterministic from the member id;
 * duplicates in a party get " 2". The custom cat name is only in the owner's own copy (party.service.ts).
 */
import { createHash } from 'crypto';

export const ADJECTIVES: readonly string[] = [
    'Sunny',
    'Fluffy',
    'Brave',
    'Sleepy',
    'Zippy',
    'Gentle',
    'Bouncy',
    'Curious',
    'Happy',
    'Jolly',
    'Lucky',
    'Mighty',
    'Nimble',
    'Plucky',
    'Quick',
    'Rusty',
    'Silky',
    'Snowy',
    'Sparky',
    'Spotty',
    'Stripy',
    'Swift',
    'Tiny',
    'Witty',
    'Cozy',
    'Dandy',
    'Dizzy',
    'Fancy',
    'Frosty',
    'Fuzzy',
    'Giddy',
    'Golden',
    'Hasty',
    'Honey',
    'Jumpy',
    'Kind',
    'Lively',
    'Merry',
    'Misty',
    'Peppy',
    'Perky',
    'Polite',
    'Proud',
    'Rosy',
    'Shiny',
    'Sly',
    'Smiley',
    'Snappy',
    'Soft',
    'Starry',
    'Sugar',
    'Sweet',
    'Tidy',
    'Velvet',
    'Wiggly',
    'Wild',
    'Wise',
    'Zesty',
    'Breezy',
    'Calm',
    'Cheery',
    'Clever',
    'Daring',
    'Eager',
];
export const NOUNS: readonly string[] = [
    'Tabby',
    'Kitten',
    'Whiskers',
    'Paws',
    'Mittens',
    'Tiger',
    'Panther',
    'Lynx',
    'Bobcat',
    'Ocelot',
    'Puma',
    'Calico',
    'Siamese',
    'Persian',
    'Bengal',
    'Ragdoll',
    'Sphynx',
    'Manx',
    'Tuxedo',
    'Ginger',
    'Shadow',
    'Pebble',
    'Biscuit',
    'Muffin',
    'Noodle',
    'Pickle',
    'Pudding',
    'Waffle',
    'Mochi',
    'Nugget',
    'Pretzel',
    'Sprout',
    'Button',
    'Cookie',
    'Pumpkin',
    'Peanut',
    'Comet',
    'Cosmo',
    'Pixel',
    'Rocket',
    'Ziggy',
    'Bean',
    'Tofu',
    'Toffee',
    'Clover',
    'Maple',
    'Olive',
    'Pepper',
    'Poppy',
    'Sage',
    'Willow',
    'Hazel',
    'Juniper',
    'Basil',
    'Truffle',
    'Marble',
    'Socks',
    'Bubbles',
    'Fudge',
    'Sushi',
    'Nacho',
    'Taco',
    'Dumpling',
    'Churro',
];

const pick = (id: string, salt: string, list: readonly string[]) =>
    list[createHash('sha256').update(`${salt}:${id}`).digest().readUInt32BE(0) % list.length];

/** The peer-visible name of a member: `catalog` is the card's catalog or breed name (never a custom name). */
export function memberName(id: string, catalog?: string | null): string {
    const adj = pick(id, 'adj', ADJECTIVES);
    const noun = catalog && /^[A-Za-z][A-Za-z '-]{0,23}$/.test(catalog) ? catalog : pick(id, 'noun', NOUNS);
    return `${adj} ${noun}`;
}

/** Names for a party, deduplicated with " 2", " 3" in join order. */
export function dedupeNames(names: readonly string[]): string[] {
    const seen = new Map<string, number>();
    return names.map(n => {
        const k = (seen.get(n) ?? 0) + 1;
        seen.set(n, k);
        return k === 1 ? n : `${n} ${k}`;
    });
}
