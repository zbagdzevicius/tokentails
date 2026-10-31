/**
 * How Meatball's abilities are aimed and drawn (sim v11; docs/plans/moba/CATS-V11.md §2.1 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'dash', range: n(a.q.dash, 6000), width: n(a.q.touch, 1200) * 2, smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.w.radius, 3000), radius: n(a.w.radius, 3000), smart: 'none' },
    { kind: 'point', shape: 'circle', range: n(a.e.range, 6000), radius: n(a.e.pickRadius, 2500), smart: 'ally' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
  ];
}
