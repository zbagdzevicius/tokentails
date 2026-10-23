// Stage 3: Sunset Hills (about 135 s, 21 to 28 u/s). Fill the PUFF meter, ride the puff cloud over the big canyon,
// slalom through the bamboo grove, outrun the giant yarn balls, a wall-run and a vault, then the final run to
// Grandma Cat's garden gate (world-art draws the cottage; meta-ui plays the ending). SETPIECES lane.
import type { StageDef } from '../core/types';
import { CLOUD_H, vaultArc } from '../setpieces/layout';
import { Script } from './author';

export const sunset: StageDef = {
  id: 'sunset',
  index: 2,
  name: 'Sunset Hills',
  blurb: "Over the big canyon to Grandma's cottage.",
  theme: 'sunset',
  music: 'sunset',
  speed: { start: 21, max: 28, rampDist: 2600 },
  scoreTarget: 860000,
  bells: 7,
  ending: true,
  start: { x: 0, y: 0, z: 0, heading: 0, width: 9 },
  build(b) {
    const k = new Script(b);
    // 0-15 s: rolling hills with yarn and treats to fill the PUFF meter
    let s = k.run(60);
    k.fish(s + 16, 0, 8, 3);
    s = k.run(170, { turn: 25, rise: 8 });
    k.yarn(s + 16, -2.2).yarn(s + 40, 2.2).treat(s + 62, 0).yarn(s + 84, -2.2).log(s + 110).fish(s + 103, 0, 6, 2.5, 'arc', { h: 2 });
    k.yarn(s + 140, 2.2).treat(s + 158, -1.5);
    s = k.run(150, { turn: -30, rise: -8 });
    k.fish(s + 10, 0, 8, 3, 'wave', { amp: 2.4 }).rock(s + 50, -2.2).yarn(s + 70, 2.4).rock(s + 92, 2.2).treat(s + 112, -2).yarn(s + 132, 0);

    // 15-35 s: the puff cloud ride over the big canyon: hoops, fish in the air and three air bells
    const c = k.cloudRide(42, 440, 34, { turn: 40 });
    const air = CLOUD_H + 0.8;
    // every air bell sits on the hoop line (the hoop before it leads to its lane) and needs one hop off the cloud
    for (let i = 0; i < 8; i++) k.ring(c + 30 + i * 46, ((i % 3) - 1) * 2.4, CLOUD_H + 1.3 + (i % 2) * 0.6);
    k.fish(c + 46, -2, 6, 3, 'line', { y: air }).bell(0, c + 112, 2.4, CLOUD_H + 2.0);
    k.fish(c + 150, 0, 8, 3, 'arc', { y: air, h: 1.6 }).bell(1, c + 232, 0, CLOUD_H + 2.2);
    // the last hoop (c + 352) is centred: a fish arc on the same line climbs into the third air bell
    k.fish(c + 280, 2, 6, 3, 'line', { y: air }).fish(c + 318, -2, 6, 3, 'line', { y: air });
    k.fish(c + 366, 0, 6, 3, 'arc', { y: air, h: 1.4 }).bell(2, c + 398, 0, CLOUD_H + 2.2);

    // 35-55 s: the bamboo grove slalom with branches
    s = k.run(480, { turn: -40 });
    const xs = [2.6, -2.6, 0, 2.6, -2.6, 2.6, 0, -2.6, 2.6, -2.6];
    for (let i = 0; i < xs.length; i++) {
      const at = s + 30 + i * 36;
      if (i === 3 || i === 7) k.branch(at);
      else k.bamboo(at, xs[i], 3, xs[i] === 0 ? 2.6 : 2.4);
      if (i % 2 === 0 && i !== 6) k.fish(at + 12, xs[i] === 0 ? 2.6 : -xs[i], 3, 3);
    }
    k.bell(3, s + 30 + 6 * 36 + 18, -3.3, 1).yarn(s + 420, 0).treat(s + 450, 2);

    // 55-75 s: the giant yarn-ball chase down a long hill (stay on the free side)
    s = k.run(520, { rise: -30, turn: 30 });
    k.yarnChase(s + 16, 480);
    // bell 4 sits mid-chase on the centre line; the chase holds its next ball until Mochi has passed it
    k.fish(s + 30, 0, 8, 3).log(s + 110).fish(s + 140, 0, 8, 3).fish(s + 206, 0, 6, 3).bell(4, s + 230, 0, 1);
    k.log(s + 290).fish(s + 320, 0, 8, 3).log(s + 420).treat(s + 450, 0);

    // 75-95 s: a wall-run, a vault and puddles
    s = k.wallRun(160, { rise: 32, bank: -58, turn: -25 });
    k.fish(s + 16, 0, 8, 3, 'wave', { amp: 2 }).fish(s + 100, 1.5, 6, 3).yarn(s + 140, -1.5);
    k.run(34, { bank: 0 });
    const v = k.vaultGap(45, 30, 40);
    const a = vaultArc(v, 30);
    k.bell(5, a.mid, 0, a.height - 0.3);
    s = k.run(180, { turn: 20 });
    k.sign(s + 4, 'water', -1).puddle(s + 26, -1.7).puddle(s + 52, 1.7).fish(s + 70, 0, 6, 3).puddle(s + 100, -1.2).rock(s + 128, 2.3).treat(s + 150, -2);

    // 95-125 s: the final run, the cottage at the end of the valley; fish lines and the last bell
    s = k.run(700, { turn: -20, rise: -10 });
    k.fish(s + 10, 0, 10, 3, 'wave', { amp: 2.6 }).log(s + 70).rock(s + 100, -2.3).rock(s + 122, 2.3);
    k.fish(s + 140, 0, 8, 3).branch(s + 190).fish(s + 210, 0, 6, 3).yarn(s + 240, 2);
    k.log(s + 280, -2.25, 4.5).log(s + 310, 2.25, 4.5).fish(s + 330, 0, 8, 3, 'wave', { amp: 2 }).treat(s + 370, 0);
    // the last bell: a fish line on its lane leads to it, then a hop under the light beam
    k.fish(s + 384, 2.4, 6, 3).hint(s + 392, 'jump', 'GRAB IT IN THE AIR!', 20).bell(6, s + 418, 2.4, 2.6);
    k.fish(s + 440, 0, 12, 3).treat(s + 490, -2).treat(s + 520, 2).fish(s + 560, 0, 12, 3);
    k.run(40);
    return k.pieces;
  },
};
