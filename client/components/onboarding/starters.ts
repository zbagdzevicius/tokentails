import { StarterBreed, STARTER_BREEDS } from "@/shared-contracts/enums";

/**
 * The five starters of Meet your cat (plan G3, decision #19). Art is served from the app origin
 * (`client/public/cats/starters/<id>/`), so the ceremony needs no CDN upload:
 *
 * - `idle.gif`: the 48x48 idle loop from the cat-assets pipeline.
 * - `still.png`: its first frame, shown under reduced motion.
 * - Scout uses the RASCAL base family (same 15x10 grid of 48 px frames as the yellow family, so
 *   the in-game sheet works as is). The commissioned backpack and bandana layer (#24) is deferred.
 *
 * The look the backend stores on commit is `STARTER_ART` in `backend/src/user/guest/starter.ts`;
 * the families and variants here match it one for one.
 */
export interface StarterLook {
  breed: StarterBreed;
  /** Default name, used by SKIP and when the player keeps it. */
  name: string;
  /** One short line on the choose card. */
  tagline: string;
  /** cat-assets family and variant, for the log and the backend look. */
  family: string;
  variant: string;
  idle: string;
  still: string;
  /** Only Scout: "The one from the altar". */
  badge?: string;
}

const art = (id: string) => ({
  idle: `/cats/starters/${id}/idle.gif`,
  still: `/cats/starters/${id}/still.png`,
});

export const STARTERS: Readonly<Record<StarterBreed, StarterLook>> = Object.freeze({
  [StarterBreed.SCOUT]: {
    breed: StarterBreed.SCOUT,
    name: "Scout",
    tagline: "Loves long walks",
    family: "RASCAL",
    variant: "base",
    badge: "The one from the altar",
    ...art("scout"),
  },
  [StarterBreed.PINKIE]: {
    breed: StarterBreed.PINKIE,
    name: "Pinkie",
    tagline: "Makes everyone smile",
    family: "PINKIE",
    variant: "hearted-red",
    ...art("pinkie"),
  },
  [StarterBreed.SHADOW]: {
    breed: StarterBreed.SHADOW,
    name: "Shadow",
    tagline: "Quiet and quick",
    family: "BLACK",
    variant: "hat-cylinder-black",
    ...art("shadow"),
  },
  [StarterBreed.MISTY]: {
    breed: StarterBreed.MISTY,
    name: "Misty",
    tagline: "Finds the warm spot",
    family: "GREY",
    variant: "hat-wizard-blue",
    ...art("misty"),
  },
  [StarterBreed.SUNNY]: {
    breed: StarterBreed.SUNNY,
    name: "Sunny",
    tagline: "Chases every sunbeam",
    family: "SIAMESE",
    variant: "wing-white",
    ...art("sunny"),
  },
});

/** Display order: Scout first and preselected. */
export const STARTER_ORDER: ReadonlyArray<StarterBreed> = STARTER_BREEDS;

export const DEFAULT_STARTER = StarterBreed.SCOUT;

export function starterLook(breed: StarterBreed | string | null | undefined): StarterLook {
  return (breed && STARTERS[breed as StarterBreed]) || STARTERS[DEFAULT_STARTER];
}

/** Every image the ceremony shows, for the loading step's preload. */
export const STARTER_IMAGES: ReadonlyArray<string> = STARTER_ORDER.flatMap((breed) => [
  STARTERS[breed].idle,
  STARTERS[breed].still,
]);
