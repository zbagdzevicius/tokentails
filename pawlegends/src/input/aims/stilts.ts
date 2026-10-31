/**
 * How Stilts's abilities are aimed and drawn (sim v11; docs/plans/moba/CATS-V11.md §2.4 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'point', shape: 'circle', range: n(a.q.dash, 6000), radius: n(a.q.touch, 1300), smart: 'hero' },
    { kind: 'self', shape: 'ring', range: n(a.w.radius, 8000), radius: n(a.w.radius, 8000), smart: 'none' },
    { kind: 'dir', shape: 'line', range: n(a.e.range, 2800), width: n(a.e.width, 1100), smart: 'hero' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
  ];
}
