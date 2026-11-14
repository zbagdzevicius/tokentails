/**
 * How Ziggy's abilities are aimed and drawn (sim v29; docs/plans/moba/ROSTER-V29.md §2.2), read by ../abilities.ts
 * heroAims. Zig smart-aims the nearest enemy hero (each recast is a new tap); Tail Flick is an escape hop that goes
 * the full distance where he is heading (heading.ts); ZIGZAG STORM targets an enemy hero in reach.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'dash', range: n(a.q.dash, 3000), width: n(a.q.width, 1200), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.w.radius, 2400), radius: n(a.w.radius, 2400), smart: 'none' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 2500), width: 900, smart: 'none', heading: true },
    { kind: 'unit', shape: 'ring', range: n(a.r.reach, 6000), radius: n(a.r.range, 6000), smart: 'hero' },
  ];
}
