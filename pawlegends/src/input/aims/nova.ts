/**
 * How Nova's abilities are aimed and drawn (sim v31; docs/plans/moba/ROSTER-V31.md §2.1), read by ../abilities.ts
 * heroAims. Starfall and METEOR SHOWER are circles on a point (she walks in to their range); Shooting Star is a long
 * line; Moon Hop an escape dash along the heading.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'point', shape: 'circle', range: n(a.q.range, 9500), radius: n(a.q.radius, 1700), smart: 'hero' },
    { kind: 'dir', shape: 'line', range: n(a.w.range, 11000), width: n(a.w.width, 900), smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3500), width: 900, smart: 'none', heading: true },
    { kind: 'point', shape: 'circle', range: n(a.r.range, 14000), radius: n(a.r.radius, 3800), smart: 'hero' },
  ];
}
