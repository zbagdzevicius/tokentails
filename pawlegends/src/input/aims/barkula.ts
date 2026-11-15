/**
 * How Barkula's abilities are aimed and drawn (sim v31; docs/plans/moba/ROSTER-V31.md §2.3), read by ../abilities.ts
 * heroAims. Bat Bite is a line; Bat Swarm and RED MOON are self rings (one tap); Mist Form is on himself.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 7500), width: n(a.q.width, 900), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.w.radius, 2800), radius: n(a.w.radius, 2800), smart: 'none' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
    { kind: 'self', shape: 'ring', range: n(a.r.radius, 5000), radius: n(a.r.radius, 5000), smart: 'none' },
  ];
}
