/**
 * How Chili's abilities are aimed and drawn (sim v13; docs/plans/moba/DOGS-V13.md §1.4 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 7000), width: n(a.q.width, 700), smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.w.dash, 3000), width: 800, smart: 'none' },
    { kind: 'self', shape: 'ring', range: n(a.e.radius, 2200), radius: n(a.e.radius, 2200), smart: 'none' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
  ];
}
