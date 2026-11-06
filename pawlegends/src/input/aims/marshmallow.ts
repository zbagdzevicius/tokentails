/**
 * How Marshmallow's abilities are aimed and drawn (sim v13; docs/plans/moba/DOGS-V13.md §1.2 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 8000), width: n(a.q.width, 1000), smart: 'hero' },
    { kind: 'point', shape: 'circle', range: n(a.w.range, 7000), radius: n(a.w.radius, 2800), smart: 'any' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 4000), width: 1000, smart: 'none' },
    { kind: 'point', shape: 'circle', range: n(a.r.range, 9000), radius: n(a.r.radius, 4000), smart: 'hero' },
  ];
}
