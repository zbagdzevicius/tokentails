/**
 * How Dusty's abilities are aimed and drawn (sim v31; docs/plans/moba/ROSTER-V31.md §2.2), read by ../abilities.ts
 * heroAims. Trick Shot targets an enemy (a hero first; she walks in to 6.5 m); Lasso and HIGH NOON are lines; Quick
 * Draw an escape dash along the heading.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'unit', shape: 'circle', range: n(a.q.reach, 6500), radius: n(a.q.bounce, 4000), smart: 'any' },
    { kind: 'dir', shape: 'line', range: n(a.w.range, 6000), width: n(a.w.width, 1000), smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3000), width: 900, smart: 'none', heading: true },
    { kind: 'dir', shape: 'line', range: n(a.r.range, 12000), width: n(a.r.width, 900), smart: 'hero' },
  ];
}
