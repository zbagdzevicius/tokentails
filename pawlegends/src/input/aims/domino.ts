/**
 * How Domino's abilities are aimed and drawn (sim v15; docs/plans/moba/DOGS-V15.md §1.3 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm); this file only adds the aiming shape.
 *
 * Zero friction on touch (founder rule): one tap does the whole thing. Spot Shot and Splatter smart-aim the nearest
 * enemy hero in reach (else full range ahead); Big Shake and CONNECT THE DOTS! are self casts (the R finds its own
 * targets: every Spotted cat in its ring).
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 8000), width: n(a.q.width, 900), smart: 'hero' },
    { kind: 'point', shape: 'circle', range: n(a.w.range, 7500), radius: n(a.w.radius, 2400), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.e.radius, 2600), radius: n(a.e.radius, 2600), smart: 'none' },
    { kind: 'self', shape: 'ring', range: n(a.r.range, 11000), radius: n(a.r.range, 11000), smart: 'none' },
  ];
}
