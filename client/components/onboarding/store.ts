import { useSyncExternalStore } from "react";

/**
 * Tiny shared state between Meet your cat (rendered by Game.tsx) and the lobby (GameSelect, which
 * GameContext renders without extra props). No React context, so neither parent needs changing.
 *
 * - `heroCat`: the starter that was just committed, so the lobby hero slot shows the new name and
 *   look at once, before the profile refresh lands. It only stands in for the cat it replaced
 *   (`replacesId`): once the profile shows another cat (the committed one, a switch in CatsModal,
 *   another account) the profile wins (`heroFor`). Game.tsx clears it after the refresh and on a
 *   uid change.
 * - `justFinished`: the ceremony just ended. The lobby skips its own entrance animation (no
 *   second intro); cleared when the hand-off opens the first mode or the lobby unmounts.
 */
export interface HeroCat {
  name: string;
  /** Animated look (GIF). */
  image: string;
  /** Still frame for reduced motion, when known. */
  still?: string;
  /** `_id` of the profile cat shown before the commit (the template or transient starter). */
  replacesId?: string | null;
}

/**
 * The hero override for the profile's current cat: only while the profile still shows the cat the
 * commit replaced (or no cat yet). Review 4a #4: a stale name never outlives the profile.
 */
export function heroFor(heroCat: HeroCat | null, profileCatId: string | null | undefined, hasProfileCat: boolean): HeroCat | null {
  if (!heroCat) return null;
  if (!hasProfileCat) return heroCat;
  return (profileCatId ?? null) === (heroCat.replacesId ?? null) ? heroCat : null;
}

export interface OnboardingSnapshot {
  heroCat: HeroCat | null;
  justFinished: boolean;
  /** The hand-off is about to open the first mode: the lobby says which one. */
  firstRunLabel: string | null;
}

const EMPTY: OnboardingSnapshot = { heroCat: null, justFinished: false, firstRunLabel: null };
let snapshot: OnboardingSnapshot = EMPTY;
const listeners = new Set<() => void>();

export const onboardingStore = {
  get: (): OnboardingSnapshot => snapshot,
  set(patch: Partial<OnboardingSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  },
  reset(): void {
    snapshot = EMPTY;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useOnboardingSnapshot(): OnboardingSnapshot {
  return useSyncExternalStore(onboardingStore.subscribe, onboardingStore.get, () => EMPTY);
}
