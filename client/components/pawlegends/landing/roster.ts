/**
 * The Pawlegends landing roster (`/pawlegends`). Names, roles and blurbs are the game's own words
 * (`pawlegends/src/ui/heroText.ts` and `ui/heroText/<hero>.ts`; the five new dogs from DOGS-V13.md). `since` is the
 * sim version the hero ships in: `__test__/pawlegends/landing-roster.test.ts` checks every hero with
 * `since <= SIM_VERSION` against the game's `HERO_IDS`, so a cut dog (DOGS-V13 art gate: Howler, then Marshmallow)
 * fails CI instead of being advertised.
 *
 * `portrait` is null until real in-game art exists: the landing then shows a paw card, never a stand-in image.
 *
 * Only released heroes (`since <= GAME_SIM_VERSION`) with real art go in the pick grid and the counts. The rest are
 * the "new dogs" strip, headed "Coming next" until their sim version is out, so the page is right in any merge order.
 */
export type LandingSide = "cat" | "dog";

export interface LandingHero {
  id: string;
  /** As the game writes it (Avietė, Gabė: precomposed here; the markup writes them decomposed for Fredoka). */
  name: string;
  side: LandingSide;
  role: "Fighter" | "Marksman" | "Tank" | "Assassin" | "Mage" | "Support";
  breed?: string;
  blurb: string;
  /** File in `public/pawlegends/landing/`, or null (no real art yet). */
  portrait: string | null;
  since: number;
}

/**
 * The sim version of the game build this page links to (`pawlegends/src/sim/version.ts`). landing-roster.test.ts
 * fails until it matches the game, so a sim release that adds heroes also moves them onto the landing.
 */
export const GAME_SIM_VERSION = 13;

const P = (id: string, hash: string) => `/pawlegends/landing/portrait-${id}.${hash}.webp`;

export const LANDING_ROSTER: readonly LandingHero[] = Object.freeze([
  { id: "clem", name: "Clem", side: "cat", role: "Fighter", blurb: "A brave little knight who swings first and asks later.", portrait: P("clem", "9588cf21"), since: 1 },
  { id: "sage", name: "Sage", side: "cat", role: "Marksman", blurb: "Calm, patient and never out of arrows.", portrait: P("sage", "656605d9"), since: 1 },
  { id: "lambo", name: "Lambo", side: "cat", role: "Tank", blurb: "Big, soft and seven kilos of brave when friends are near.", portrait: P("lambo", "6e9fa33f"), since: 9 },
  { id: "aviete", name: "Avietė", side: "cat", role: "Assassin", blurb: "Hides in cozy corners, then steps out to show off that shiny coat.", portrait: P("aviete", "c95cd16f"), since: 9 },
  { id: "bengas", name: "Bengas", side: "cat", role: "Mage", blurb: "Turns heads wherever he goes. Burns whatever he toasts.", portrait: P("bengas", "a9b5ee3b"), since: 9 },
  { id: "gabe", name: "Gabė", side: "cat", role: "Support", blurb: "One look from those blue eyes and you’re under her spell.", portrait: P("gabe", "24c8d6de"), since: 9 },
  { id: "meatball", name: "Meatball", side: "cat", role: "Tank", blurb: "Rolls into dogs and bowls them off his friends.", portrait: P("meatball", "b08a9b87"), since: 11 },
  { id: "pixel", name: "Pixel", side: "cat", role: "Marksman", blurb: "Shoots from a cardboard robot she built herself.", portrait: P("pixel", "dac9c02e"), since: 11 },
  { id: "duchess", name: "Duchess", side: "cat", role: "Mage", blurb: "Floats about on her cushion. Three snubs and a dog can’t move.", portrait: P("duchess", "09a7d4f9"), since: 11 },
  { id: "stilts", name: "Stilts", side: "cat", role: "Assassin", blurb: "All legs and ears. Runs to build Stride, then pounces.", portrait: P("stilts", "2ce19c52"), since: 11 },
  { id: "brutus", name: "Sir Brutus", side: "dog", role: "Tank", breed: "Pug knight", blurb: "A pug of honour. Stands in front so friends do not have to.", portrait: P("brutus", "b8e8e407"), since: 1 },
  { id: "cacklejaw", name: "Cacklejaw", side: "dog", role: "Assassin", breed: "Hyena", blurb: "Giggles in the bushes. Then pounces.", portrait: P("cacklejaw", "e7dfabb6"), since: 1 },
  { id: "nugget", name: "Nugget", side: "dog", role: "Support", breed: "Pembroke corgi", blurb: "A loaf with legs. Herds cats, rushes to friends and heals by splooting.", portrait: null, since: 14 },
  { id: "marshmallow", name: "Marshmallow", side: "dog", role: "Mage", breed: "Samoyed puppy", blurb: "Pure smile. Snow on the ground, and cats who stay get frozen.", portrait: null, since: 14 },
  { id: "bravo", name: "Bravo", side: "dog", role: "Tank", breed: "Black pug", blurb: "A pug who lives for the drama. Slows cats, owns the stage, fakes his own death.", portrait: null, since: 14 },
  { id: "chili", name: "Chili", side: "dog", role: "Marksman", breed: "Chihuahua", blurb: "Tiny. Shaking. Furious. Gets faster the angrier he gets.", portrait: null, since: 14 },
  { id: "howler", name: "Howler", side: "dog", role: "Fighter", breed: "Siberian husky", blurb: "A husky with opinions. Every ability is a scream.", portrait: null, since: 14 },
] as LandingHero[]);

export const isReleased = (h: LandingHero): boolean => h.since <= GAME_SIM_VERSION;
/** Heroes players can pick today. */
export const liveRoster = (): LandingHero[] => LANDING_ROSTER.filter(isReleased);
export const landingCats = (): LandingHero[] => liveRoster().filter((h) => h.side === "cat");
export const landingDogs = (): LandingHero[] => liveRoster().filter((h) => h.side === "dog");
/** The pick grid: released heroes with real in-game art. */
export const gridHeroes = (): LandingHero[] => liveRoster().filter((h) => !!h.portrait);
/** The new-dogs strip: everyone not in the grid (no art yet, or not released yet). */
export const newcomers = (): LandingHero[] => LANDING_ROSTER.filter((h) => !isReleased(h) || !h.portrait);

/** Distinct roles on one side, in the order the tale-of-the-tape row lists them. */
const ROLE_ORDER = ["Fighter", "Marksman", "Tank", "Assassin", "Mage", "Support"] as const;
export const rolesOf = (side: LandingSide): string[] =>
  ROLE_ORDER.filter((r) => liveRoster().some((h) => h.side === side && h.role === r));

/** Spelled-out side counts for the lede ("Ten cats, seven dogs."). */
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
export const countWord = (n: number): string => WORDS[n] ?? String(n);
