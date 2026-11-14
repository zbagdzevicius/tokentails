/**
 * How Mochi's abilities are aimed and drawn (sim v29; docs/plans/moba/ROSTER-V29.md §2.1), read by ../abilities.ts
 * heroAims. Numbers come from the hero data (mm); this file only adds the aiming shape. Cuddle Bubble smart-aims the
 * most hurt allied hero (Gabby's Wing Wrap rule); Purr Wave and LULLABY are self rings, one tap.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 8000), width: n(a.q.width, 1000), smart: 'hero' },
    { kind: 'point', shape: 'circle', range: n(a.w.range, 7000), radius: n(a.w.pickRadius, 2500), smart: 'ally' },
    { kind: 'self', shape: 'ring', range: n(a.e.radius, 4000), radius: n(a.e.radius, 4000), smart: 'none' },
    { kind: 'self', shape: 'ring', range: n(a.r.radius, 4500), radius: n(a.r.radius, 4500), smart: 'none' },
  ];
}
