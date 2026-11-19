#!/usr/bin/env node
// Trailer 30 ("The Rivalry"): gameplay takes as clip-engine specs (tools/clips/record.mjs), one per shot and aspect.
// Every take is a Classic 5v5 bots match with the same picks; the story match is seed 36 (a cat tower falls on 617.8 s,
// the cats come back and the dog core bursts on 799.27 s). Montage ultimates come from the best casts of seeds 1-40
// (tools/trailer30/scan-ults.mjs): most land round a base, so structures are drawn solid (no harness x-ray).
// Slow motion is baked in at capture (the sim interpolates between ticks).
// node tools/trailer30/specs.mjs > specs.json
const TEAMS = [['lambo', 'clem', 'sage', 'bengas', 'gabe'], ['brutus', 'cacklejaw', 'marshmallow', 'howler', 'nugget']];
const SLOT = Object.fromEntries(TEAMS.flat().map((h, i) => [h, i]));
const FPS = 60;

/**
 * id, seed, t (game s of the moment), lead (s before it), dur (output s), unit | point | fight, dist (x game distance),
 * push (dist factor at the end), slow: [[atOutS, speed, rampFrames], ...]
 */
const SHOTS = [
  // round 2: closer on the subject (the game's angle and lens, never a roll), a clean frame (no plates or numbers)
  { id: 'g01-hook-lambo', seed: 1, t: 711.4, lead: 0.45, dur: 2.4, unit: 'lambo', dist: 0.44, push: 0.9, slow: [[0.8, 0.3, 6]] },
  // the wide establishing shot: lanes, river and both teams meeting
  { id: 'g02-charge', seed: 36, t: 619.0, lead: 2.6, dur: 3.2, fight: [19000, 16000], dist: 1.35, push: 0.8, wide: true },
  { id: 'm1-clem', seed: 30, t: 720.0, lead: 0.6, dur: 2.0, unit: 'clem', at: [13885, 12803], dist: 0.5, push: 0.9 },
  { id: 'm2-brutus', seed: 27, t: 616.7, lead: 0.6, dur: 2.0, unit: 'brutus', at: [10803, 21650], dist: 0.5, push: 0.9 },
  { id: 'm3-sage', seed: 2, t: 357.1, lead: 0.6, dur: 2.0, unit: 'sage', at: [23882, 23017], dist: 0.55, push: 0.9 },
  { id: 'm4-cacklejaw', seed: 9, t: 712.1, lead: 0.6, dur: 2.0, unit: 'cacklejaw', at: [110574, 116743], dist: 0.5, push: 0.9 },
  { id: 'm5-bengal', seed: 17, t: 583.7, lead: 0.6, dur: 2.0, unit: 'bengas', at: [15812, 13742], dist: 0.55, push: 0.9 },
  { id: 'm6-marshmallow', seed: 8, t: 599.8, lead: 0.6, dur: 2.0, unit: 'marshmallow', at: [114500, 110500], dist: 0.55, push: 0.9 },
  { id: 'm7-gabby', seed: 24, t: 746.7, lead: 0.6, dur: 2.0, unit: 'gabe', at: [19453, 16862], dist: 0.5, push: 0.9 },
  { id: 'm8-howler', seed: 7, t: 710.9, lead: 0.6, dur: 2.0, unit: 'howler', at: [13791, 16269], dist: 0.5, push: 0.9 },
  // the cat tower (id 115) dies on 617.8 and topples over STRUCT_ANIM.fallTower (1.1 s): real time up to the crack,
  // then 0.55x through the fall so the whole topple sits inside the 1.6 s shot
  { id: 'l1-tower', seed: 36, t: 617.8, lead: 1.2, dur: 3.6, point: [21500, 12500], dist: 0.62, push: 0.88, slow: [[1.1, 0.55, 8]] },
  { id: 't1-river', seed: 36, t: 619.6, lead: 0.4, dur: 2.0, fight: [18500, 16500], dist: 0.8, push: 0.9 },
  { id: 't2-lambo', seed: 36, t: 627.4, lead: 0.7, dur: 2.4, unit: 'lambo', at: [22105, 20293], dist: 0.5, push: 0.9, slow: [[0.75, 0.25, 4], [1.5, 1, 6]] },
  { id: 't3-brutus', seed: 36, t: 620.5, lead: 0.5, dur: 1.6, unit: 'brutus', at: [19366, 17583], dist: 0.52, push: 0.92 },
  { id: 't4-clem', seed: 36, t: 693.2, lead: 0.5, dur: 1.6, unit: 'clem', at: [115661, 101330], dist: 0.52, push: 0.92 },
  { id: 't5-triple', seed: 36, t: 565.0, lead: 1.4, dur: 2.0, unit: 'clem', dist: 0.55, push: 0.9 },
  { id: 't6-sage', seed: 36, t: 623.1, lead: 0.4, dur: 1.4, unit: 'sage', at: [18020, 12251], dist: 0.55, push: 0.92 },
  { id: 't7-gabby', seed: 36, t: 693.9, lead: 0.4, dur: 1.4, unit: 'gabe', at: [118779, 98122], dist: 0.52, push: 0.92 },
  { id: 't9-bengal', seed: 36, t: 767.5, lead: 0.4, dur: 1.4, unit: 'bengas', at: [113657, 99694], dist: 0.55, push: 0.92 },
  { id: 't10-wedge', seed: 36, t: 795.5, lead: 1.4, dur: 2.0, fight: [104000, 112000], dist: 0.75, push: 0.88 },
  // the dog core (129) dies on 799.27 and bursts ~0.37 s later: 0.35x round the burst, then real time on the cheer
  { id: 'v1-core', seed: 36, t: 799.27, lead: 0.8, dur: 4.6, point: [112000, 112000], dist: 0.7, push: 0.78, slow: [[1.0, 0.35, 6], [2.3, 1, 12]] },
];

// The game's fixed play camera (src/render/camera/frame.ts): pitch 52 deg, FOV 36, yaw 0, 26.7 m (0.96 of the
// harness D0). Takes keep that angle and lens and only come closer, centred on their subject (the clip harness's
// own `base: 'game'` mode still models the pre-feel-pass camera). 9:16: the portrait lens, a little steeper.
const GAMECAM = { horizontal: { pitch: 52, fov: 36 }, vertical: { pitch: 56, fov: 54 } };

function camFor(s, aspect) {
  const v = aspect === 'vertical';
  const N = Math.round(s.dur * FPS);
  // a cast: the fight round its spot (the caster and whoever it hits), not the caster alone
  const target = s.at ? { fight: s.at, r: 10, focus: [SLOT[s.unit]], lift: 1 } : s.unit ? { unit: SLOT[s.unit], lift: 1 } : s.point ? { point: s.point, lift: 1 } : { fight: s.fight, r: 12, lift: 1 };
  const k = { ...GAMECAM[aspect], yaw: 0, lift: 1 };
  // 9:16: closer than the 16:9 take (round 1's 1.15x plus the clip engine's autoFit left the heroes tiny on a phone)
  const d = s.dist * (v ? (s.wide ? 1.0 : 0.85) : 1);
  return { target, smooth: 0.2, keys: [{ f: 0, dist: d, ...k }, { f: N - 1, dist: d * (s.push ?? 1), ...k, ease: 'ease' }] };
}

function rampFor(s) {
  if (!s.slow) return [];
  const r = [[0, 1]];
  let prev = 1;
  for (const [at, sp, k] of s.slow) {
    const f = Math.round(at * FPS);
    r.push([Math.max(0, f - k), prev], [f, sp, 'ease']);
    prev = sp;
  }
  return r;
}

const out = [];
for (const aspect of ['horizontal', 'vertical']) {
  for (const s of SHOTS) {
    out.push({
      id: `${s.id}-${aspect === 'vertical' ? 'v' : 'h'}`,
      mode: 'classic',
      seed: s.seed,
      teams: TEAMS,
      start: { at: +(s.t - s.lead).toFixed(2) },
      duration: s.dur,
      fps: FPS,
      aspect,
      camera: 'follow',
      focus: s.unit ? SLOT[s.unit] : 0,
      music: 2,
      // structures drawn solid, as in the game (the harness x-ray ghosts a core over the fight)
      xray: false,
      autoFit: false,
      // a clean frame: no nameplates, HP bars, damage numbers or banners (the edit sets each champion's name)
      shot: { cam: camFor(s, aspect), ramp: rampFor(s), autoFit: null, twinNames: false, preroll: 90, layers: [], uiFade: [[0, 0]], plates: false, edgeArrows: false },
      caption: `trailer30 ${s.id}: seed ${s.seed} t ${s.t}`,
    });
  }
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
