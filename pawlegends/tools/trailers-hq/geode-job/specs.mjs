#!/usr/bin/env node
// The Geode Job (trailers-hq): gameplay takes as clip-engine specs (tools/clips/record.mjs), 16:9 and 9:16.
// Every take is a real bots match; the featured champion sits in slot 0, so the camera is the game's own fixed play
// camera on that champion (no director camera: `shot.cam: null`), HUD on in 16:9. Accent pushes are the game camera's
// height factor (`zoomKeys`, at most 1.12x). Moments come from castscan.mjs (seed, cast second).
// node tools/trailers-hq/geode-job/specs.mjs [id,id-h,...] > specs.json
const FPS = 60;
const LOOK = {
  stilts: 'coat.stilts.store_bengal', duchess: 'coat.duchess.store_blue_point', pixel: 'coat.pixel.store_moonwhisker',
  meatball: 'coat.meatball.store_double_stack', howler: 'coat.howler.store_sable', brutus: 'coat.brutus.store_chairman',
  rocket: 'coat.rocket.store_tiger', frankie: 'coat.frankie.store_kebab_king', clem: 'coat.clem.s1_sunforged',
  chili: 'coat.chili.store_red_brindle', cacklejaw: 'coat.cacklejaw.store_starry',
};
const Q = { mode: 'skirmish', map: 'quarry', scheme: 'frost' };
const TB = { mode: 'skirmish', map: 'thicket', scheme: 'bloom' };
const TH = { mode: 'skirmish', map: 'thicket', scheme: 'harvest' };
const RH = { mode: 'skirmish', map: 'ridge', scheme: 'harvest' };
const H = [['stilts', 'pixel', 'duchess'], ['ranger', 'rocket', 'howler']];
const DOGQ = (a) => [a, ['meatball', 'stilts', 'duchess']];
const ULT = [['clem', 'nova', 'duchess'], ['brutus', 'frankie', 'howler']];
// id, where, seed, teams, at (game s), dur (s), push [fromS, toS, zoom], look overrides { hero: coat }
const TAKES = [
  // rev 2 hook: a clean cats-win beat (Nova + Clem ults wipe all three dogs, no dog kill back; castscan ults seeds 7, 39)
  { id: 't01-hook', ...Q, seed: 7, teams: ULT, at: 461.5, dur: 3.0 },
  { id: 't01b-hook', ...Q, seed: 39, teams: ULT, at: 416.3, dur: 3.0 },
  { id: 't02-crew-duchess', ...TB, seed: 12, teams: [['duchess', 'pixel', 'stilts'], ['ranger', 'rocket', 'chili']], at: 295.9, dur: 1.6 },
  { id: 't03-crew-pixel', ...TB, seed: 8, teams: [['pixel', 'duchess', 'stilts'], ['ranger', 'rocket', 'chili']], at: 298.7, dur: 1.6 },
  { id: 't04-crew-stilts', ...TB, seed: 21, teams: [['stilts', 'duchess', 'pixel'], ['ranger', 'rocket', 'chili']], at: 328.3, dur: 1.6 },
  { id: 't05-crew-meatball', ...TB, seed: 13, teams: [['meatball', 'clem', 'mochi'], ['ranger', 'rocket', 'chili']], at: 508.5, dur: 1.6 },
  { id: 't06-ranger', ...RH, seed: 4, teams: [['ranger', 'rocket', 'chili'], ['clem', 'pixel', 'stilts']], at: 265.4, dur: 2.4 },
  { id: 't07-bowl', ...Q, seed: 9, teams: [['meatball', 'duchess', 'pixel'], ['ranger', 'rocket', 'brutus']], at: 157.8, dur: 4.2 },
  { id: 't08-duchess-q', ...Q, seed: 20, teams: [['duchess', 'pixel', 'meatball'], ['ranger', 'rocket', 'brutus']], at: 296.6, dur: 4.2 },
  { id: 't09-stilts-gems', ...Q, seed: 23, teams: H, at: 269.8, dur: 4.2, push: [1.2, 2.4, 0.94] },
  { id: 't10-scream', ...Q, seed: 30, teams: DOGQ(['howler', 'brutus', 'frankie']), at: 260.3, dur: 4.2, push: [2.8, 3.75, 0.9] },
  { id: 't11-brutus', ...Q, seed: 16, teams: DOGQ(['brutus', 'howler', 'frankie']), at: 330.6, dur: 3.2 },
  { id: 't12-loaf', ...Q, seed: 9, teams: [['meatball', 'stilts', 'duchess'], ['howler', 'brutus', 'frankie']], at: 363.3, dur: 2.2, push: [0.6, 1.6, 0.93] },
  { id: 't13-getaway', ...TH, seed: 2, teams: [['mochi', 'stilts', 'duchess'], ['cacklejaw', 'chili', 'rocket']], at: 352.4, dur: 3.2 },
  // rev 2: the getaway stays in the Quarry (the Kibble Cannon river shots were out of the heist story): Meatball bowls
  // through all three guards (castscan dogs: seed 15 W at 419.67 hits 3, 2 kills; seed 13 W at 430.47 hits 2, 2 kills)
  { id: 't14-bowl-out', ...Q, seed: 15, teams: [['meatball', 'stilts', 'duchess'], ['howler', 'brutus', 'frankie']], at: 418.9, dur: 3.6 },
  { id: 't16-bowl-out2', ...Q, seed: 13, teams: [['meatball', 'stilts', 'duchess'], ['howler', 'brutus', 'frankie']], at: 429.8, dur: 2.6 },
  { id: 't18-dig', ...Q, seed: 22, teams: DOGQ(['frankie', 'howler', 'brutus']), at: 246.4, dur: 3.4, push: [0.9, 1.6, 0.9] },
  { id: 't19a-clem', ...Q, seed: 35, teams: ULT, at: 369.3, dur: 1.4 },
  { id: 't19b-nova', ...Q, seed: 5, teams: [['nova', 'clem', 'duchess'], ULT[1]], at: 292.9, dur: 2.0 },
  { id: 't19c-duchess', ...Q, seed: 8, teams: [['duchess', 'clem', 'nova'], ULT[1]], at: 341.1, dur: 1.4 },
  { id: 't19d-megameal', ...Q, seed: 14, teams: [['meatball', 'stilts', 'duchess'], ['howler', 'brutus', 'frankie']], at: 415.7, dur: 1.4, look: { meatball: 'coat.meatball.store_mega_meal' } },
  { id: 't20a-surge', ...Q, seed: 5, teams: ULT, at: 414.6, dur: 2.4 },
  { id: 't20b-victory', ...Q, seed: 5, teams: ULT, victory: 1.6, dur: 4.0, push: [0.6, 1.6, 0.9] },
];

const out = [];
// rev 2: the desktop-only hints (the Chat/Enter button, the Q/W/E/R/D/B key caps) are hidden in the 16:9 HUD
const HINTS = '.pl-chatopen, .pl-slot kbd { display: none !important; }';
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
for (const aspect of ['horizontal', 'vertical']) {
  for (const t of TAKES) {
    if (ONLY && !ONLY.some((o) => o === t.id || o === `${t.id}-${aspect[0]}`)) continue;
    const N = Math.round(t.dur * FPS);
    const looks = t.teams.map((team) => team.map((h) => t.look?.[h] ?? LOOK[h] ?? null));
    const zoomKeys = t.push ? [[Math.round(t.push[0] * FPS), 1], [Math.min(N - 1, Math.round(t.push[1] * FPS)), t.push[2]]] : undefined;
    const v = aspect === 'vertical';
    out.push({
      id: `${t.id}-${v ? 'v' : 'h'}`,
      mode: t.mode,
      ...(t.map ? { map: t.map } : {}),
      scheme: t.scheme,
      seed: t.seed,
      teams: t.teams,
      looks,
      start: t.victory ? { event: 'victory', lead: t.victory } : { at: t.at },
      duration: t.dur,
      fps: FPS,
      aspect,
      camera: 'game',
      hud: !v,
      xray: false,
      music: 2,
      // the game's own fixed camera on slot 0; 9:16 keeps the plates and pops but not the desktop HUD (it does not fit)
      shot: { cam: null, noMusic: true, ...(zoomKeys ? { zoomKeys } : {}), ...(v ? { gameLook: true, layers: ['pops', 'banner', 'plates'] } : { css: HINTS }) },
      caption: `geode-job ${t.id}: ${t.map ?? 'crossing'} ${t.scheme} seed ${t.seed}`,
    });
  }
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
