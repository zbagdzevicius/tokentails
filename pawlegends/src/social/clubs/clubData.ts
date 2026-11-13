/**
 * Clubs and good-teammate kudos, the game's mirror (docs/plans/moba/CLUBS-KUDOS.md). The real copy is
 * `backend/src/pawlegends/clubs/clubs.contracts.ts`; `tests/unit/clubs.test.ts` deep-compares the two. Pure.
 *
 * Club names are two words from these lists, never typed text, for every age band. The chests are deterministic
 * (the next Legends Pass free-row item the player does not own, else Yarn): nothing random, so no odds to show.
 */

export const CLUB_LIMITS = Object.freeze({
  members: 30,
  winsPerMemberPerDay: 6,
  chatPage: 30,
  rejoinMs: 60 * 60 * 1000,
});

export const CLUB_CHEST_TIERS: readonly number[] = Object.freeze([8, 20, 40]);
export const KUDOS_CHEST_TIERS: readonly number[] = Object.freeze([3, 8, 15]);

export const CLUB_NAME_FIRST: readonly string[] = Object.freeze([
  'Sunny', 'Brave', 'Sleepy', 'Zippy', 'Mighty', 'Nimble', 'Plucky', 'Swift', 'Cozy', 'Frosty', 'Golden', 'Lucky',
  'Midnight', 'Thunder', 'Velvet', 'Wild', 'Starry', 'Rusty', 'Silver', 'Fuzzy', 'Daring', 'Jolly', 'Misty', 'Crimson',
]);

export const CLUB_NAME_SECOND: readonly string[] = Object.freeze([
  'Paws', 'Whiskers', 'Pouncers', 'Rascals', 'Tails', 'Claws', 'Purrs', 'Biscuits', 'Comets', 'Lanterns', 'Rockets', 'Mittens',
  'Zoomies', 'Puddings', 'Sparks', 'Howlers', 'Bandits', 'Legends', 'Nappers', 'Sprinters', 'Bolts', 'Rivals', 'Barkers', 'Prowlers',
]);

export const clubNameText = (a: number, b: number): string => `${CLUB_NAME_FIRST[a] ?? CLUB_NAME_FIRST[0]} ${CLUB_NAME_SECOND[b] ?? CLUB_NAME_SECOND[0]}`;

/** A random name pick (the "new name" die). `rand` returns [0, 1). */
export function rollClubName(rand: () => number = Math.random): [number, number] {
  return [Math.floor(rand() * CLUB_NAME_FIRST.length) % CLUB_NAME_FIRST.length, Math.floor(rand() * CLUB_NAME_SECOND.length) % CLUB_NAME_SECOND.length];
}

/** What the server reads: the two list positions. */
export const clubNameArg = (n: readonly [number, number]): string => `${n[0]}.${n[1]}`;

/** `cl 7kq2m9` → `CL-7KQ2M9` when it looks like a club code, else null (the server checks the rest). */
export function normalClubCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.startsWith('CL') && s.length === 8) s = s.slice(2);
  s = s.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  return /^[0-9A-HJKMNP-TV-Z]{6}$/.test(s) ? `CL-${s}` : null;
}

/** The progress toward the next tier: `{need, have, pct}`; null once every tier is reached. Pure. */
export function nextTier(tiers: readonly number[], n: number): { need: number; have: number; index: number } | null {
  const i = tiers.findIndex((t) => n < t);
  return i < 0 ? null : { need: tiers[i], have: n, index: i };
}

/** "3d 4h" / "5h" / "40m" until a reset. Pure. */
export function untilText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.max(1, m)}m`;
}

export interface ClubMemberView {
  mid: string;
  name: string;
  av?: unknown;
  owner: boolean;
  you: boolean;
  wins: number;
}

export interface ClubView {
  code: string;
  name: string;
  size: number;
  cap: number;
  owner: boolean;
  thread: string;
  tier: 'text' | 'quick';
  members: ClubMemberView[];
  chest: {
    week: string;
    endsAt: string;
    wins: number;
    tiers: number[];
    claimed: number[];
    open: number;
    mine: number;
    perDay: number;
    next: { id: string; name: string };
  };
}

export interface KudosView {
  month: string;
  endsAt: string;
  n: number;
  tiers: number[];
  paid: number[];
  got: { id: string; name: string }[];
  next: { id: string; name: string };
}

export interface ClubsState {
  club: ClubView | null;
  kudos: KudosView | null;
  got?: { id: string; name: string }[];
}

/** A `club.get` / club action answer, or null when it is not one. Never throws. */
export function parseClubsState(body: unknown): ClubsState | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!('club' in b)) return null;
  const club = b.club && typeof b.club === 'object' ? (b.club as ClubView) : null;
  if (club && (typeof club.code !== 'string' || typeof club.name !== 'string' || !Array.isArray(club.members) || !club.chest)) return null;
  const kudos = b.kudos && typeof b.kudos === 'object' && typeof (b.kudos as KudosView).n === 'number' ? (b.kudos as KudosView) : null;
  const got = Array.isArray(b.got) ? (b.got as { id: string; name: string }[]).filter((g) => g && typeof g.name === 'string') : undefined;
  return { club, kudos, ...(got ? { got } : {}) };
}

/** The player-facing text of a club or kudos error code. */
export function clubErrorText(code: string | undefined, status: number): string {
  if (status === 0) return 'No connection. Try again';
  if (status === 429 && code !== 'PAWLEGENDS_CLUB_COOLDOWN' && code !== 'PAWLEGENDS_CLUB_RATE') return 'Too many tries. Wait a minute';
  switch (code) {
    case 'PAWLEGENDS_CLUB_UNAVAILABLE':
      return 'That club can’t be joined';
    case 'PAWLEGENDS_CLUB_INVALID':
      return 'Check the club code';
    case 'PAWLEGENDS_CLUB_ALREADY':
      return 'Leave your club first';
    case 'PAWLEGENDS_CLUB_COOLDOWN':
      return 'Wait an hour after leaving a club';
    case 'PAWLEGENDS_CLUB_RATE':
      return 'Too many new clubs today';
    case 'PAWLEGENDS_CLUB_NEED_WIN':
      return 'Win a match this week to share the chest';
    case 'PAWLEGENDS_CLUB_OWNER':
      return 'Only the owner can do that';
    case 'PAWLEGENDS_NEED_ACCOUNT':
      return 'Sign in first';
    default:
      return 'Something went wrong. Try again';
  }
}
