/**
 * Coat parts (gaps2 coats-models): every Epic and Legendary coat changes the model in a match, not only its colours.
 * The parts are code-built pieces on the hero's own rig (render/chars/coatPartsBuild.ts has the builders and the
 * rules: one skinned mesh, ≤ 6k triangles at Med, Low keeps the signature pieces, the team read stays).
 *
 * gaps5 (first-load JS): the builders are their own chunk. This module holds the coat ids, their heroes and the gear
 * each one drops, and loads the builders on first need (the app preloads them at boot). Until they are in, a coat's
 * hero builds plain (no drops either) and `coatPartsRev()` is 0; it bumps when they land, and the hero caches
 * (chars/index.ts heroBuilt, views/heroView.ts) rebuild a coat's hero on the next frame.
 *
 * Render only: the sim, the replay and the hash never see a coat.
 */
import type { HeroId } from '../../sim/api';
import { S1_PLUS_COAT } from '../../money/catalog';
import type { Assembly } from './chibi';

/**
 * A base gear piece a coat may replace with its own: Sage's pauldrons; a hero's hat (Domino's beret, Marshmallow's
 * bobble hat, Meatball's sweatband) or held prop (Domino's crayon, Meatball's fish lunchbox). The hero module skips it.
 */
export type GearSlot = 'pauldrons' | 'hat' | 'prop';

/** The team colours a part may wear to keep the team read when it replaces a team-coloured piece. */
export interface PartTeam {
  main: number;
  second: number;
}

export interface CoatPartsDef {
  hero: HeroId;
  /** Base gear the hero's gear() skips while this coat is worn (replaced by a part). */
  drops?: readonly GearSlot[];
  build(A: Assembly, team: PartTeam): void;
}

type Builders = Readonly<Record<string, (A: Assembly, team: PartTeam) => void>>;
let builders: Builders | null = null;
let loading: Promise<void> | null = null;
let rev = 0;
const listeners = new Set<() => void>();

/** 0 until the builders are loaded, then 1: part of the hero cache keys for a coat with parts. */
export const coatPartsRev = (): number => rev;

/** Load the builders (once). Resolves when they are in. */
export function loadCoatParts(): Promise<void> {
  loading ??= import('./coatPartsBuild')
    .then((m) => {
      builders = m.COAT_BUILDERS;
      rev = 1;
      for (const f of listeners) f();
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

/** Call `f` when the builders land (the lobby turntable and the portraits rebuild a coat's hero). Returns an unsubscribe. */
export function onCoatParts(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const lazy =
  (id: string) =>
  (A: Assembly, team: PartTeam): void =>
    builders?.[id]?.(A, team);

/**
 * Every Epic and Legendary coat (render/cosmetics.ts PAID_COATS rung ≥ EPIC) and its parts (named in
 * render/skins/coatVfx.ts for the store). The test (tests/unit/coat-parts.test.ts) fails when an Epic+ coat is added
 * without an entry here and a builder in coatPartsBuild.ts.
 */
export const COAT_PARTS: Readonly<Record<string, CoatPartsDef>> = Object.freeze({
  'coat.clem.s1_sunforged': { hero: 'clem', build: lazy('coat.clem.s1_sunforged') },
  'coat.brutus.store_thunderpaw': { hero: 'brutus', build: lazy('coat.brutus.store_thunderpaw') },
  [S1_PLUS_COAT]: { hero: 'duchess', build: lazy(S1_PLUS_COAT) },
  'coat.marshmallow.store_frostbell': { hero: 'marshmallow', build: lazy('coat.marshmallow.store_frostbell') },
  'coat.pixel.store_moonwhisker': { hero: 'pixel', build: lazy('coat.pixel.store_moonwhisker') },
  'coat.sage.store_bloomtail': { hero: 'sage', drops: ['pauldrons'], build: lazy('coat.sage.store_bloomtail') },
  'coat.clem.store_club_sandwich': { hero: 'clem', build: lazy('coat.clem.store_club_sandwich') },
  'coat.frankie.store_kebab_king': { hero: 'frankie', build: lazy('coat.frankie.store_kebab_king') },
  'coat.domino.store_pizzaiolo': { hero: 'domino', drops: ['hat', 'prop'], build: lazy('coat.domino.store_pizzaiolo') },
  'coat.nugget.store_robo_vac': { hero: 'nugget', build: lazy('coat.nugget.store_robo_vac') },
  'coat.meatball.store_drive_thru': { hero: 'meatball', drops: ['hat', 'prop'], build: lazy('coat.meatball.store_drive_thru') },
  'coat.frankie.store_paper_parade': { hero: 'frankie', build: lazy('coat.frankie.store_paper_parade') },
  'coat.marshmallow.store_soft_serve': { hero: 'marshmallow', drops: ['hat'], build: lazy('coat.marshmallow.store_soft_serve') },
});

/** Does the coat have parts (whatever the load state)? */
export const hasCoatParts = (coatId: string | null | undefined): boolean => !!coatId && coatId in COAT_PARTS;

/**
 * The parts a hero wears with `coatId` (null: no parts, another hero's coat, or the builders not loaded yet: that
 * starts the load).
 */
export function coatParts(coatId: string | null | undefined, hero: HeroId): CoatPartsDef | null {
  if (!coatId) return null;
  const p = COAT_PARTS[coatId];
  if (!p || p.hero !== hero) return null;
  if (!builders) {
    void loadCoatParts();
    return null;
  }
  return p;
}
