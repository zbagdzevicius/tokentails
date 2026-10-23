// Stage 2: River Gorge (about 120 s, 20 to 26 u/s). Claw wall-run up a cliff, a cliff-top ridge, leaf surf down the
// river, the big goofy dog chase, a banked wall-run to shake the dog, a vault and a footbridge finish.
// SETPIECES lane (beats from GDD.md).
import type { StageDef } from '../core/types';
import { vaultArc, vaultYAt } from '../setpieces/layout';
import { Script } from './author';

export const gorge: StageDef = {
  id: 'gorge',
  index: 1,
  name: 'River Gorge',
  blurb: 'Claws out: up the cliffs and down the river.',
  theme: 'gorge',
  music: 'gorge',
  speed: { start: 20, max: 26, rampDist: 2400 },
  scoreTarget: 940000,
  bells: 7,
  start: { x: 0, y: 0, z: 0, heading: 0, width: 9 },
  build(b) {
    const k = new Script(b);
    // 0-15 s: into the gorge, the cliffs close in: logs and rocks
    let s = k.run(60);
    k.fish(s + 18, 0, 8, 3, 'wave', { amp: 2.2 });
    s = k.run(170, { turn: 30 });
    k.log(s + 20).fish(s + 34, -2.4, 5, 3).rock(s + 58, 2.3).rock(s + 80, -2.3).yarn(s + 96, 0);
    k.log(s + 120, 2.25, 4.5).log(s + 148, -2.25, 4.5).fish(s + 140, 2.4, 3, 3);
    s = k.run(150, { turn: -30, width: 8 });
    k.branch(s + 30).fish(s + 44, 0, 6, 3).rock(s + 76, 0, 1.1).treat(s + 96, 2.2).log(s + 124);

    // 15-30 s: claw wall-run up a steep cliff face, a bell on the wall line
    s = k.wallRun(170, { rise: 42, bank: -60, turn: 20 });
    k.fish(s + 14, 0, 8, 3, 'wave', { amp: 2 }).bell(0, s + 90, 2.6, 1).fish(s + 112, -1.5, 6, 3).yarn(s + 150, 1.5);
    k.run(30, { bank: 0 });

    // 30-40 s: the cliff-top ridge with a branch and a fish line, then the drop down the far side
    s = k.run(120, { turn: -20 });
    k.branch(s + 30).fish(s + 46, 0, 8, 3).treat(s + 80, -2).rock(s + 100, 2.2);
    s = k.run(120, { rise: -38, turn: 25 });
    k.log(s + 36).fish(s + 29, 0, 7, 2.5, 'arc', { h: 2.1 }).yarn(s + 70, -2).fish(s + 86, 2, 6, 3);

    // 40-65 s: leaf surf down the river: spray, rocks, fish lines, an air bell over a small rapid
    s = k.riverRun(540, { turn: 40 });
    k.fish(s + 16, -3, 8, 3).riverrock(s + 52, 2.6, 1.2).riverrock(s + 76, -2.6).driftlog(s + 112, -2.5, 5);
    k.fish(s + 126, 3, 6, 3).rapid(s + 180).bell(1, s + 181, 0, 2.8).fish(s + 196, 0, 6, 3);
    k.riverrock(s + 236, 0, 1.3).fish(s + 250, 0, 10, 3, 'wave', { amp: 3 }).driftlog(s + 300, 2.5, 5);
    k.riverrock(s + 334, -3).yarn(s + 360, 3.4).rapid(s + 410).fish(s + 403, 0, 5, 3, 'arc', { h: 2.2 });
    k.riverrock(s + 452, 2, 1.2).driftlog(s + 482, -2.6, 5).fish(s + 500, 0, 6, 3);
    k.run(30, { width: 9 });

    // 65-85 s: a bridge crossing, then the dog bursts out of the bushes
    s = k.run(60, { kind: 'bridge', width: 6 });
    k.fish(s + 6, 0, 12, 4).heartTreat(s + 57, 0);
    k.run(24, { width: 9 });
    s = k.run(480, { turn: -50, rise: -6 });
    k.dogChase(s + 12, 470, 1);
    k.fish(s + 30, 0, 6, 3).log(s + 70).fish(s + 63, 0, 6, 2.5, 'arc', { h: 2 });
    k.log(s + 140, -2.25, 4.5).log(s + 170, 2.25, 4.5).treat(s + 200, 0).log(s + 240);
    k.fish(s + 256, 0, 8, 3).bell(2, s + 300, 0, 1).log(s + 340).branch(s + 400).fish(s + 420, 0, 6, 3);

    // 85-100 s: wall-run along a cliff banked ~60 degrees (the dog can't follow), then a vault across a side canyon
    s = k.wallRun(150, { bank: 58, turn: -30 });
    k.fish(s + 16, 0, 8, 3).bell(3, s + 80, -2.6, 1).fish(s + 100, 1.5, 6, 3);
    k.run(36, { bank: 0 });
    const v = k.vaultGap(45, 30, 40);
    const a = vaultArc(v, 30);
    k.bell(4, a.mid, 0, a.height - 0.3);
    const f0 = a.plant + (a.land - a.plant) * 0.2;
    const y0 = vaultYAt(v, 30, f0);
    k.fish(f0, 0, 4, ((a.land - a.plant) * 0.6) / 3, 'arc', { y: y0 + 0.5, h: a.height - 0.9 - y0 });

    // 100-120 s: the way out of the gorge and the footbridge finish
    s = k.run(260, { turn: 30, rise: 5 });
    k.fish(s + 10, 0, 8, 3, 'wave', { amp: 2.4 }).rock(s + 48, -2.3).rock(s + 70, 2.3).bell(5, s + 96, -3.2, 1);
    k.puddle(s + 120, 1.6).treat(s + 140, -2).hint(s + 150, 'jump', 'GRAB IT IN THE AIR!', 18).bell(6, s + 176, 0, 2.9);
    k.log(s + 210).fish(s + 222, 0, 8, 3);
    const g = k.gapJump(36, 10, 24, { hint: '' });
    k.fish(g - 5, 0, 7, 2.6, 'arc', { h: 2.3 });
    s = k.run(70, { kind: 'bridge', width: 6 });
    k.fish(s + 6, 0, 10, 5);
    k.run(70, { width: 9 });
    k.finish(k.s - 1, 'GORGE DONE!');
    return k.pieces;
  },
};
