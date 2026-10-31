/**
 * How Duchess's abilities are aimed and drawn (sim v11; docs/plans/moba/CATS-V11.md §2.3 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const STEP_TO_RAD = (Math.PI * 2) / 4096;
const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 7500), width: n(a.q.width, 1400), smart: 'hero' },
    { kind: 'dir', shape: 'cone', range: n(a.w.range, 5000), arc: n(a.w.arc, 910) * STEP_TO_RAD, smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 4000), width: n(a.e.radius, 2200), smart: 'none' },
    { kind: 'self', shape: 'ring', range: n(a.r.radius, 6000), radius: n(a.r.radius, 6000), smart: 'none' },
  ];
}
