/**
 * How Bravo's abilities are aimed and drawn (sim v14; docs/plans/moba/DOGS-V13.md §1.3 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 6500), width: n(a.q.width, 900), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.w.radius, 3000), radius: n(a.w.radius, 3000), smart: 'none' },
    { kind: 'point', shape: 'circle', range: n(a.e.dash, 5000), radius: n(a.e.radius, 2200), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.r.radius, 4500), radius: n(a.r.radius, 4500), smart: 'none' },
  ];
}
