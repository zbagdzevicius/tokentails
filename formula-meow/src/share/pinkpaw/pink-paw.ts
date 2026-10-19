// Copied from bad-cat/src/platform/pink-paw.ts at 4889ed41 (snapshot + helpers only; copy, never import).
/**
 * Pink Paw (Rožinė pėdutė) cast for the daily accomplice (GDD 3.4, 4.6). M0 ships a small static snapshot;
 * M1 replaces it with `public/pink-paw-cats.json` from `tools/sync-pink-paw.mjs` (GET /cat/sale).
 *
 * Honesty: names, ids and statuses come from the shelter's data (the Catnip Heist snapshot of
 * 2026-10-04, catnip-heist/src/ui/levels/rescue-cats.ts). A local copy cannot know when a cat is adopted,
 * so `statusAsOf` must be shown with the status. Colours/patterns are a stylised match of each cat's
 * coat for the toon renderer, not a claim about the cat; bios say only what the shelter's data says.
 */
import { rgb565, type CatSpec, type Pattern } from '../../types';

export const PINK_PAW_SHELTER = 'Pink Paw (Rožinė pėdutė)';
export const PINK_PAW_LINE = 'Real cat at Pink Paw shelter, Lithuania';
export const PINK_PAW_STATUS_AS_OF = '2026-10-04';
export const PINK_PAW_SITE = 'https://tokentails.com';

export type PinkPawStatus = 'WAITING' | 'RECOVERING' | 'ADOPTED';

export interface PinkPawCat {
  id: string; // Token Tails backend id (24 hex)
  name: string;
  status: PinkPawStatus;
  /** Stylised coat for the toon renderer. */
  pattern: Pattern;
  base: number; // 0xRRGGBB
  secondary: number;
  tertiary: number;
  eyes: number; // EYE_COLORS index
  bio: string;
  /** Shelter page for adoption (default: pinkPawAdoptUrl). */
  adoptUrl?: string;
  /** Same-origin licensed photo path under `pink-paw/` (face decal); null/absent = none shipped. */
  photo?: string | null;
}

export const PINK_PAW_CATS: readonly PinkPawCat[] = Object.freeze([
  { id: '6992227d890a12f52a317e22', name: 'Gabė', status: 'WAITING', pattern: 'solid', base: 0xeadfcf, secondary: 0x5a4434, tertiary: 0xf6f0e6, eyes: 2, bio: 'Seal-point face. Waiting at Pink Paw.' },
  { id: '69a5341d3ee4d7b657941bb8', name: 'Medutis', status: 'WAITING', pattern: 'tabby', base: 0xe39a4f, secondary: 0xb46a2c, tertiary: 0xf7e3c8, eyes: 0, bio: 'Ginger. Waiting at Pink Paw.' },
  { id: '6987c3a51fc0c504e354d2cc', name: 'Tita', status: 'WAITING', pattern: 'solid', base: 0xc9c7cc, secondary: 0x9c9aa2, tertiary: 0xefedf0, eyes: 1, bio: 'Pale grey, long hair. Waiting at Pink Paw.' },
  { id: '699221a0890a12f52a317dca', name: 'Aukste', status: 'WAITING', pattern: 'solid', base: 0xf4efe7, secondary: 0xe0904a, tertiary: 0xf4efe7, eyes: 0, bio: 'White with ginger patches. Waiting at Pink Paw.' },
  { id: '6a085bc0a885f725f7a94d0a', name: 'Unis', status: 'WAITING', pattern: 'tabby', base: 0x9a9aa2, secondary: 0x55555f, tertiary: 0xefebe4, eyes: 1, bio: 'Grey tabby. Waiting at Pink Paw.' },
  { id: '6a30473c1d6649b19b03622b', name: 'Lambo', status: 'WAITING', pattern: 'tabby', base: 0x6e5440, secondary: 0x3a2a20, tertiary: 0xcdb79c, eyes: 0, bio: 'Dark brown tabby. Waiting at Pink Paw.' },
  { id: '6a30507d1d6649b19b036626', name: 'Mora', status: 'WAITING', pattern: 'solid', base: 0x4a4850, secondary: 0x2e2c33, tertiary: 0x77757c, eyes: 3, bio: 'Dark smoke coat. Waiting at Pink Paw.' },
  { id: '69d27ed0a885f725f7a52631', name: 'Vane', status: 'WAITING', pattern: 'solid', base: 0xf6f4f0, secondary: 0xe6e1d8, tertiary: 0xffffff, eyes: 2, bio: 'White, long hair. Waiting at Pink Paw.' },
] as PinkPawCat[]);

/** The cat's page on tokentails.com (adopt link on the result screen). */
export function pinkPawAdoptUrl(cat: Pick<PinkPawCat, 'id'>, site: string = PINK_PAW_SITE): string {
  return `${site.replace(/\/+$/, '')}/cats/${encodeURIComponent(cat.id)}`;
}

/** Playable/renderable CatSpec for a Pink Paw cat (name clipped to 12 chars). */
export function pinkPawCatSpec(cat: PinkPawCat): CatSpec {
  return {
    pattern: cat.pattern,
    ears: 'normal',
    tail: 'normal',
    body: 'normal',
    eyes: cat.eyes,
    base: rgb565(cat.base),
    secondary: rgb565(cat.secondary),
    tertiary: rgb565(cat.tertiary),
    collar: 0,
    hat: 0,
    name: cat.name.slice(0, 12),
  };
}

/** Adoptable cats only (ADOPTED cats move to the alumni list). */
export function pinkPawWaiting(): PinkPawCat[] {
  return PINK_PAW_CATS.filter((c) => c.status !== 'ADOPTED');
}
export function pinkPawAlumni(): PinkPawCat[] {
  return PINK_PAW_CATS.filter((c) => c.status === 'ADOPTED');
}

