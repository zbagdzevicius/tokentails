/**
 * How Nugget's abilities are aimed and drawn (sim v14; docs/plans/moba/DOGS-V13.md §1.1 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 8000), width: n(a.q.width, 900), smart: 'hero' },
    { kind: 'point', shape: 'circle', range: n(a.w.range, 6000), radius: n(a.w.pickRadius, 2500), smart: 'ally' },
    { kind: 'self', shape: 'ring', range: n(a.e.radius, 3500), radius: n(a.e.radius, 3500), smart: 'none' },
    { kind: 'point', shape: 'ring', range: n(a.r.radius, 4500), radius: n(a.r.radius, 4500), smart: 'none' },
  ];
}
