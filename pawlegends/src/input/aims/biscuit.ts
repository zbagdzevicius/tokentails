/**
 * How Biscuit's abilities are aimed and drawn (sim v29; docs/plans/moba/ROSTER-V29.md §2.3), read by ../abilities.ts
 * heroAims. Fetch! is a line skillshot that smart-aims the nearest enemy hero; Tail Wag, Stubborn and WALKIES! are
 * one tap on himself.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 9000), width: n(a.q.width, 900), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.w.radius, 2600), radius: n(a.w.radius, 2600), smart: 'none' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
    { kind: 'self', shape: 'ring', range: n(a.r.radius, 5000), radius: n(a.r.radius, 5000), smart: 'none' },
  ];
}
