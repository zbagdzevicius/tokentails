/**
 * How Rocket's abilities are aimed and drawn (sim v15; docs/plans/moba/DOGS-V15.md §1.1 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm); this file only adds the aiming shape.
 *
 * Zero friction on touch (founder rule): one tap does the whole thing. Lure Shot, SQUIRREL! and ZOOM… ZZZ smart-aim the
 * nearest enemy hero in reach (else full range ahead); Photo Finish is an escape dash that goes the full distance
 * where he is heading (heading.ts), as every other escape dash does.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 9000), width: n(a.q.width, 800), smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.w.dash, 3500), width: 900, smart: 'none', heading: true },
    { kind: 'point', shape: 'circle', range: n(a.e.range, 7000), radius: n(a.e.radius, 2400), smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.r.dash, 11000), width: n(a.r.width, 1200), smart: 'hero' },
  ];
}
