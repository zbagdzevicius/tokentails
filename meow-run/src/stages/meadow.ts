// Stage 1: Sunny Meadow Canyon (about 100 s, 18 to 23 u/s). The tutorial: steer, jump, slide, the air bell,
// a small chasm and a rope bridge, puddles, the tail vault and the pounce. SETPIECES lane (beats from GDD.md).
import type { StageDef } from '../core/types';
import { vaultArc, vaultYAt } from '../setpieces/layout';
import { Script } from './author';

export const meadow: StageDef = {
  id: 'meadow',
  index: 0,
  name: 'Sunny Meadow Canyon',
  blurb: 'Dinner is at sunset. Run, Mochi, run!',
  theme: 'meadow',
  music: 'meadow',
  speed: { start: 18, max: 23, rampDist: 2200 },
  scoreTarget: 490000,
  bells: 7,
  tutorial: true,
  start: { x: 0, y: 0, z: 0, heading: 0, width: 9 },
  build(b) {
    const k = new Script(b);
    // 0-8 s: steer through a fish line on a gentle bend
    let s = k.run(40);
    k.fish(s + 14, 0, 6, 3);
    s = k.run(130, { turn: 35 });
    k.fish(s + 8, 0, 9, 3.2, 'wave', { amp: 2.6 }).yarn(s + 52, 2.6).fish(s + 72, -2.4, 6, 3).treat(s + 112, 0);

    // 8-20 s: logs. Two single logs, then an offset pair
    s = k.run(170, { turn: -25, rise: 3 });
    k.sign(s + 2, 'jump', 1).hint(s + 6, 'jump', 'JUMP!', 26);
    k.log(s + 34).fish(s + 26, 0, 7, 2.5, 'arc', { h: 2 });
    k.log(s + 72);
    k.log(s + 110, -2.25, 4.5).fish(s + 104, 2.4, 3, 3).log(s + 140, 2.25, 4.5).fish(s + 134, -2.4, 3, 3);

    // 20-30 s: low branches
    s = k.run(150, { turn: 30 });
    k.sign(s + 2, 'slide', -1).hint(s + 6, 'slide', 'SLIDE!', 26);
    k.branch(s + 36).fish(s + 54, 0, 5, 2.5, 'line', { y: 0.45 }).branch(s + 70).treat(s + 92, -2.2).branch(s + 116);

    // 30-38 s: yarn balls, then a bell above the path: "grab it in the air"
    s = k.run(110, { turn: -20 });
    k.yarn(s + 12, -2).yarn(s + 28, 2);
    k.hint(s + 44, 'jump', 'GRAB IT IN THE AIR!', 20).bell(0, s + 70, 0, 2.9);
    k.fish(s + 80, 0, 5, 3);

    // 38-48 s: first small chasm (jump), then a wooden rope bridge over a ravine
    const g1 = k.gapJump(40, 9, 24);
    k.fish(g1 - 4, 0, 6, 2.6, 'arc', { h: 2.2 });
    s = k.run(60, { kind: 'bridge', width: 6 });
    k.fish(s + 6, 0, 12, 4);
    k.run(25, { width: 9 });

    // 48-62 s: downhill bend through the mesas: rocks and two puddles (the wet shake)
    s = k.run(270, { turn: -70, rise: -16 });
    k.rock(s + 25, -2.3).rock(s + 45, 2.3).rock(s + 68, 0, 1.05);
    k.fish(s + 80, 0, 7, 3, 'wave', { amp: 2.2 });
    k.sign(s + 108, 'water', 1).puddle(s + 130, -1.8).bell(1, s + 150, 3.3, 1).puddle(s + 172, 1.8);
    k.rock(s + 205, -2.4).rock(s + 228, 2.4).treat(s + 250, 0);

    // 62-72 s: tail vault tutorial over a big chasm, a bell at the top of the arc
    const v1 = k.vaultGap(50, 26, 40);
    const a1 = vaultArc(v1, 26);
    k.bell(2, a1.mid, 0, a1.height - 0.3);
    k.fish(v1 + 26 + 10, 0, 6, 3);

    // 72-88 s: a climb with mixed logs and branches, then the pounce over a wider gap
    s = k.run(220, { turn: 40, rise: 14 });
    k.log(s + 30).branch(s + 62).log(s + 96, -2.25, 4.5).fish(s + 90, 2.4, 4, 3).rock(s + 128, 2.2);
    k.yarn(s + 150, -2).branch(s + 170).fish(s + 186, 0, 6, 3);
    const g2 = k.gapJump(40, 17, 30, { hint: 'JUMP TWICE TO POUNCE!' });
    k.bell(3, g2 + 9, 0, 3.6);

    // a breather: fish, treats and rocks with an off-line bell
    s = k.run(170, { turn: -35, rise: -4 });
    k.fish(s + 10, 2.2, 8, 3).rock(s + 46, -2.2).rock(s + 66, 2.2).treat(s + 84, 0);
    k.bell(4, s + 110, -3.3, 1).puddle(s + 130, 1.6).yarn(s + 152, -2);

    // 88-98 s: the second vault, then a bell
    const v2 = k.vaultGap(45, 28, 40, { turn: 10 });
    const a2 = vaultArc(v2, 28);
    const f0 = a2.plant + (a2.land - a2.plant) * 0.25;
    const y0 = vaultYAt(v2, 28, f0);
    k.fish(f0, 0, 6, ((a2.land - a2.plant) * 0.5) / 5, 'arc', { y: y0 + 0.5, h: a2.height - y0 });
    k.bell(5, v2 + 28 + 22, 0, 1);

    // 98-105 s: the home stretch to the meadow gate
    s = k.run(190, { turn: 25 });
    k.fish(s + 10, 0, 10, 3, 'wave', { amp: 2.5 }).bell(6, s + 64, 2.8, 1);
    k.log(s + 92).fish(s + 104, 0, 8, 3).treat(s + 140, -2).yarn(s + 160, 2);
    k.run(60);
    k.finish(k.s - 1, 'FINISH!');
    return k.pieces;
  },
};
