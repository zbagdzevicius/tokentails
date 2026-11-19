#!/usr/bin/env node
// Trailer "Wild Rivals": the gameplay takes as clip-engine specs (tools/clips/record.mjs), one per shot and aspect
// (h 16:9, v 9:16, s 1:1, each rendered natively at 2x and downscaled). The real game camera: the play angle (pitch 52,
// FOV 36, yaw 0) at the game's own distance for that screen shape (src/render/camera/frame.ts: 26.7 m on desktop and
// square, 18 m of ground across a portrait screen), following the shot's hero; accent moves only (a <= 1.12x push).
// The HUD-lite score bar and the overhead plates stay on, so it reads as real footage; the minimap is hidden (the
// documentary matte and the 9:16 / 1:1 bands would cut it in half). Game SFX, no match
// music (the trailer has its own score). Every moment below was found by tools/wildrivals/search.mjs.
// `gameLook`: the frame exactly as the game draws it (only the camera is ours). Director shots without it lose the map
// scheme's tree colours (ridge:harvest drew green trees, the game draws them red), so every take keeps the game look.
// Distance (x the game's own): 9:16 0.75 for the gags, 0.85 for the ults; 16:9 and 1:1 0.66 / 0.78 (0.58 on the purse
// hook); the Hearthwood shots 0.85-1.0. The old trailer sat near 0.8; the soft 30/60 cuts at 0.44-0.62 plus punch-ins.
// node tools/wildrivals/specs.mjs [--only id,id] [--aspects h,v,s] > specs.json
import { TAKES } from './takes.mjs';

const FPS = 60;
// harness D0 = 27 x 1.03 = 27.81 m: desktop 26.7 m = 0.96; portrait 18 m across at FOV 36 on 9:16 = 49.2 m = 1.77
const ASPECT = {
  h: { aspect: 'horizontal', width: 1280, height: 720, dpr: 1.5, dist: 0.96 },
  v: { aspect: 'vertical', width: 540, height: 960, dpr: 2, dist: 1.77 },
  s: { aspect: 'horizontal', width: 540, height: 540, dpr: 2, dist: 0.96 },
};

/**
 * id, take, seed, t (game s of the anchor moment), lead (s before it), dur (output s), unit (hero followed),
 * push (dist divisor at the end: 1.06 = a 1.06x "telephoto" push), yaw (deg drift over the shot).
 */
export const SHOTS = [
  // 01 hook: Chili alone in the lane; Nova's METEOR SHOWER at 121.1, the purse at 122.2, meteors 122.3-123.5
  { id: 'g01-purse', take: 'purse', seed: 3, t: 121.1, lead: 0.2, dur: 3.8, unit: 'chili', push: 1.06, distH: 0.58 },
  // 03: the loaf (Loaf Mode charms Champ and Howler, then the Bowling Roll)
  { id: 'g03-loaf', take: 'loaf', seed: 5, t: 318.73, lead: 0.9, dur: 3.8, unit: 'meatball', push: 1.04 },
  // 04: the Dramatic Flop, Clem walks off, Stage Dive on her
  { id: 'g04-flop', take: 'flop', seed: 3, t: 242.1, lead: 1.1, dur: 3.8, unit: 'bravo', push: 1.08 },
  // 05: the stalk: Ranger and Cacklejaw slink (E), Stilts swivels her ears (W), High Leap (Q)
  { id: 'g05-stalk', take: 'stalk', seed: 1, t: 146.6, lead: 1.4, dur: 3.8, unit: 'stilts', yaw: 3 },
  // 06 / 11: the grooming ritual: Big Hug, Purr Wave, Nugget's Sploot
  { id: 'g06-groom', take: 'groom', seed: 8, t: 330.97, lead: 0.7, dur: 3.8, unit: 'lambo' },
  // 07 / 13: the call: AWOO, then RED MOON over three cats
  { id: 'g07-howl', take: 'howl', seed: 12, t: 191.53, lead: 2.4, dur: 5.0, unit: 'barkula', push: 1.1 },
  // 05 (60 s): nesting: Mochi's Cuddle Bubble, Nugget (Robo-Vac) Herding Time
  { id: 'g08-nest', take: 'nest', seed: 4, t: 375.93, lead: 1.2, dur: 3.8, unit: 'nugget' },
  // 09 (60 s): the observer: Pixel (Leopard) in her box (Duck and Cover) while Rocket sniffs round, then Cap Cannon
  { id: 'g09-box', take: 'box', seed: 2, t: 130.77, lead: 0.6, dur: 3.2, unit: 'pixel', push: 1.06 },
  // 12 (60 s): Big Shake on Duchess, Not Amused
  { id: 'g12-shake', take: 'shake', seed: 1, t: 92.77, lead: 0.8, dur: 3.6, unit: 'duchess', push: 1.04 },
  // 15 (60 s): Marshmallow's Belly Slide in the snow
  { id: 'g15-slide', take: 'uQuarry', seed: 23, t: 250.7, lead: 0.4, dur: 2.0, unit: 'marshmallow' },
  // 21 (60 s button): the purse again, the Bowling Roll arrives as it pops
  { id: 'g21-button', take: 'button', seed: 2, t: 143.53, lead: 0.5, dur: 3.4, unit: 'chili', distH: 0.6 },
  // the great migration (Classic 5v5, Hearthwood in first snow, seed 4, the cats win at 619.5): Meatball (Mega Meal)
  // Unstoppable Chonk through the dog line at 482.9, Sir Brutus (Chairman) answers with Champion's Challenge at 483.6;
  // Clem (Sunforged) Golden Hour at 588.57 by the dog base; the dog core (112000, 112000) breaks
  { id: 'h-chonk', take: 'herd', seed: 4, t: 482.9, lead: 1.2, dur: 4.8, unit: 'meatball', dist: 1.0, push: 1.1 },
  { id: 'h-clem', take: 'herd', seed: 4, t: 588.57, lead: 0.7, dur: 2.6, unit: 'clem', dist: 0.85, push: 1.08 },
  { id: 'h-core', take: 'herd', seed: 4, t: 619.5, lead: 2.6, dur: 4.6, point: [112000, 108500], dist: 0.95, push: 1.1, shot: { layers: ['hudlite', 'pops', 'banner'] } },
  // first snow: the ultimate salvo (0.78 s each in the edit; 1.6 s captured round each cast)
  { id: 'u-marsh', take: 'uQuarry', seed: 14, t: 250.6, lead: 0.4, dur: 1.6, unit: 'marshmallow', push: 1.06 },
  { id: 'u-ziggy', take: 'uQuarry', seed: 15, t: 318.53, lead: 0.4, dur: 1.6, unit: 'ziggy', push: 1.06 },
  { id: 'u-pixel', take: 'uCrossing', seed: 8, t: 225.5, lead: 0.4, dur: 1.6, unit: 'pixel', push: 1.06 },
  { id: 'u-dusty', take: 'uCrossing', seed: 1, t: 410.63, lead: 0.4, dur: 1.6, unit: 'dusty', push: 1.06 },
  { id: 'u-mochi', take: 'uThicket', seed: 1, t: 296.27, lead: 0.4, dur: 1.6, unit: 'mochi', push: 1.06 },
  { id: 'u-brutus', take: 'uThicket', seed: 9, t: 297.13, lead: 0.4, dur: 1.6, unit: 'brutus', push: 1.06 },
  { id: 'u-domino', take: 'uRidge', seed: 5, t: 272.8, lead: 0.4, dur: 1.6, unit: 'domino', push: 1.06 },
  { id: 'u-duchess', take: 'uRidge', seed: 22, t: 305.97, lead: 0.4, dur: 1.6, unit: 'duchess', push: 1.06 },
  { id: 'u-frankie', take: 'uPitch', seed: 3, t: 363.27, lead: 0.4, dur: 1.6, unit: 'frankie', push: 1.06 },
  { id: 'u-sage', take: 'uPitch', seed: 7, t: 356.03, lead: 0.4, dur: 1.6, unit: 'sage', push: 1.06 },
];

const slotOf = (take, hero) => {
  const t = TAKES[take];
  const per = t.map === 'hearthwood' ? 5 : 3;
  const ti = t.teams.findIndex((tm) => tm.includes(hero));
  if (ti < 0) throw new Error(`${hero} not in take ${take}`);
  return ti * per + t.teams[ti].indexOf(hero);
};

export function specsFor(shots, aspects = ['h', 'v', 's']) {
  const out = [];
  for (const a of aspects) {
    const A = ASPECT[a];
    for (const s of shots) {
      const t = TAKES[s.take];
      const N = Math.round(s.dur * FPS);
      const k = { pitch: 52, fov: 36, lift: 1 };
      // 16:9 and 1:1 come a little closer than 9:16 (the same px per metre leaves a 3v3 small across a wide frame)
      const ult = s.id.startsWith('u-');
      const d = A.dist * (s.dist ?? (a === 'v' ? (ult ? 0.85 : 0.75) : s.distH ?? (ult ? 0.78 : 0.66)));
      const target = s.point ? { point: s.point, lift: 1 } : { unit: slotOf(s.take, s.unit), lift: 1 };
      const cam = { target, smooth: 0.12, keys: [{ f: 0, dist: d, yaw: 0, ...k }, { f: N - 1, dist: d / (s.push ?? 1), yaw: s.yaw ?? 0, ...k, ease: 'ease' }] };
      out.push({
        id: `${s.id}-${a}`,
        mode: t.mode,
        map: t.map,
        scheme: t.scheme,
        variant: t.variant,
        seed: s.seed,
        teams: t.teams,
        ...(t.script ? { script: t.script } : {}),
        ...(t.looks ? { looks: t.looks } : {}),
        start: { at: +(s.t - s.lead).toFixed(2) },
        duration: s.dur,
        fps: FPS,
        aspect: A.aspect,
        camera: 'follow',
        focus: s.unit ? slotOf(s.take, s.unit) : 0,
        music: 0,
        xray: true,
        autoFit: false,
        shot: { width: A.width, height: A.height, dpr: A.dpr, cam, ramp: [], autoFit: null, preroll: 90, layers: ['hudlite', 'pops'], hide: ['.pl-minimap'], gameLook: true, noMusic: true, edgeArrows: false, ...(s.shot ?? {}) },
        caption: `wildrivals ${s.id}: ${s.take} seed ${s.seed} t ${s.t}`,
      });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
  const only = arg('--only')?.split(',');
  const aspects = arg('--aspects')?.split(',') ?? ['h', 'v', 's'];
  process.stdout.write(JSON.stringify(specsFor(SHOTS.filter((s) => !only || only.includes(s.id)), aspects), null, 1) + '\n');
}
