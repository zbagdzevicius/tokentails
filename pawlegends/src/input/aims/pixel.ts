/**
 * How Pixel's abilities are aimed and drawn (sim v11; docs/plans/moba/CATS-V11.md §2.2 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 8500), width: n(a.q.width, 900), smart: 'hero' },
    { kind: 'dir', shape: 'line', range: n(a.w.range, 9000), width: n(a.w.width, 600), smart: 'hero' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
  ];
}
