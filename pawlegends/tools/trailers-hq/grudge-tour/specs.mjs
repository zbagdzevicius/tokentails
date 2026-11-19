// Grudge Tour takes -> clip specs per aspect. node specs.mjs <outfile> [aspect,aspect] [only,ids]
import { writeFileSync } from 'node:fs';

const CATS = ['clem', 'sage', 'meatball'];
const DOGS = ['brutus', 'nugget', 'chili'];
const CR = [{ slot: 0, do: 'castR', range: 6500 }];
const CR7 = [{ slot: 0, do: 'castR', range: 7000 }];
const PUSH = (fps, at, k = 1.08) => [{ f: 0 }, { f: Math.max(1, Math.round(at * fps) - 1) }, { f: Math.round(at * fps) + 10, dist: 1 / k, ease: 'out' }];

// at = game second the clip starts; ev = output second of the key action (for the edit); dur = take length
export const TAKES = [
  { id: 't01-hook', map: 'pitch', scheme: 'native', seed: 22, teams: [['meatball', 'clem', 'sage'], ['brutus', 'chili', 'nugget']], looks: [['coat.meatball.store_drive_thru'], ['coat.brutus.store_chairman', 'coat.chili.store_red_brindle', 'coat.nugget.store_robo_vac']], at: 340.25, ev: 0.15, dur: 4.2, push: 1.08 },
  { id: 't03-ridge-sage', map: 'ridge', scheme: 'harvest', seed: 12, teams: [['sage', 'clem', 'mochi'], ['rocket', 'howler', 'nugget']], looks: [['coat.sage.store_bloomtail'], ['coat.rocket.store_tiger', 'coat.howler.store_sable']], script: CR7, at: 315.9, ev: 0.9, dur: 4.8 },
  { id: 't04-ridge-howler', map: 'ridge', scheme: 'harvest', seed: 17, teams: [['howler', 'rocket', 'nugget'], ['sage', 'clem', 'mochi']], looks: [['coat.howler.store_sable', 'coat.rocket.store_tiger'], ['coat.sage.store_bloomtail']], script: CR7, at: 364.17, ev: 0.6, dur: 3.6 },
  { id: 't05-thicket-stilts', map: 'thicket', scheme: 'bloom', seed: 17, teams: [['stilts', 'mochi', 'clem'], ['ranger', 'cacklejaw', 'nugget']], looks: [['coat.stilts.store_bengal'], [null, 'coat.cacklejaw.store_starry']], script: CR7, at: 429.3, ev: 1.13, dur: 4.4, push: 1.05 },
  { id: 't07-quarry-nova', map: 'quarry', scheme: 'frost', seed: 17, teams: [['nova', 'pixel', 'clem'], ['domino', 'marshmallow', 'bravo']], looks: [[null, 'coat.pixel.store_moonwhisker'], ['coat.domino.store_pizzaiolo', 'coat.marshmallow.store_frostbell', 'coat.bravo.store_harlequin']], script: CR7, at: 334.83, ev: 0.6, dur: 4.4 },
  { id: 't08-crossing-lambo', map: 'crossing', scheme: 'native', seed: 18, teams: [['lambo', 'clem', 'sage'], ['frankie', 'champ', 'nugget']], looks: [[], ['coat.frankie.store_kebab_king']], at: 261.0, ev: 1.17, dur: 4.4 },
  { id: 't09-hearthwood', mode: 'classic', map: 'hearthwood', scheme: 'native', seed: 6, teams: [['mochi', 'clem', 'ziggy', 'sage', 'meatball'], ['marshmallow', 'brutus', 'howler', 'chili', 'nugget']], looks: [[], ['coat.marshmallow.store_soft_serve']], script: [{ slot: 0, do: 'castR', range: 7000 }], at: 605.4, ev: 1.47, dur: 6.0 },
  // rev 2: a first 5v5 brawl (finder hw-mochi: seed 4, Mochi's Lullaby at 559 s into 4 dogs). (seed 4 at 491.6, the
  // Marshmallow ult, was dropped: the game camera follows slot 0 = Mochi, who is knocked out there.)
  { id: 't10-hw-mochi', mode: 'classic', map: 'hearthwood', scheme: 'native', seed: 4, teams: [['mochi', 'clem', 'ziggy', 'sage', 'meatball'], ['marshmallow', 'brutus', 'howler', 'chili', 'nugget']], looks: [[], ['coat.marshmallow.store_soft_serve']], at: 558.0, ev: 1.0, dur: 5.0 },
  // rev 2: the named rival: Brutus's Big Dog Energy on Pawball Park (the salvo-brutus moment, longer)
  { id: 't02-brutus', map: 'pitch', scheme: 'native', seed: 2, teams: [['brutus', 'nugget', 'chili'], ['clem', 'sage', 'meatball']], looks: [['coat.brutus.store_thunderpaw']], script: [{ slot: 0, do: 'castR', range: 6500 }], at: 422.4, ev: 1.27, dur: 3.4, push: 1.06 },
  { id: 't11-ridge-pudding', map: 'ridge', scheme: 'native', seed: 17, teams: [['ziggy', 'clem', 'duchess'], ['brutus', 'nugget', 'howler']], looks: [[null, 'coat.clem.store_club_sandwich', 'coat.duchess.store_blue_point'], ['coat.brutus.store_thunderpaw']], point: [50000, 22000], at: 279.0, ev: 3.03, dur: 5.0 },
  { id: 't14-ridge-calmed', map: 'ridge', scheme: 'native', seed: 17, teams: [['ziggy', 'clem', 'duchess'], ['brutus', 'nugget', 'howler']], looks: [[null, 'coat.clem.store_club_sandwich', 'coat.duchess.store_blue_point'], ['coat.brutus.store_thunderpaw']], point: [50000, 22000], at: 297.4, ev: 1.8, dur: 3.6, push: 1.1 },
  { id: 't20-nugget', map: 'pitch', scheme: 'frost', seed: 2, teams: [['nugget', 'brutus', 'chili'], ['clem', 'meatball', 'sage']], looks: [['coat.nugget.store_robo_vac']], at: 35.6, ev: 0.4, dur: 4.4 },
];

// the ult salvo: one short take per champion, native (30 s) and frost (60 s)
const SALVO = [
  ['ziggy', 1, 343.13, [['ziggy', 'clem', 'sage'], DOGS], null],
  ['brutus', 2, 423.67, [DOGS, CATS], 'coat.brutus.store_thunderpaw'],
  ['duchess', 10, 387.07, [['duchess', 'clem', 'sage'], DOGS], 'coat.duchess.store_blue_point'],
  ['chili', 6, 335.23, [['chili', 'brutus', 'nugget'], CATS], 'coat.chili.store_red_brindle'],
  ['dusty', 3, 330.03, [['dusty', 'clem', 'sage'], DOGS], null],
  ['barkula', 4, 423.4, [['barkula', 'brutus', 'nugget'], CATS], null],
  ['frankie', 7, 295.8, [['frankie', 'brutus', 'nugget'], CATS], 'coat.frankie.store_paper_parade'],
  ['meatball', 7, 405.73, [['meatball', 'clem', 'sage'], DOGS], 'coat.meatball.store_mega_meal', 'native'],
  ['brutus2', 2, 423.67, [DOGS, CATS], 'coat.brutus.store_chairman', 'frost'],
  ['clem', 2, 409.5, [['clem', 'sage', 'meatball'], DOGS], 'coat.clem.s1_sunforged'],
];
for (const [h, seed, t, teams, look, only] of SALVO) {
  for (const scheme of only ? [only] : ['native', 'frost']) {
    TAKES.push({ id: `salvo-${h}-${scheme}`, map: 'pitch', scheme, seed, teams, looks: [[look]], script: CR, at: +(t - 0.35).toFixed(2), ev: 0.35, dur: 1.5, push: 1.06 });
  }
}
TAKES.push({ id: 't12-goal-native', map: 'pitch', scheme: 'native', seed: 74, teams: [['clem', 'meatball', 'sage'], ['brutus', 'biscuit', 'nugget']], looks: [['coat.clem.s1_sunforged', 'coat.meatball.store_drive_thru'], ['coat.brutus.store_chairman']], at: 380.4, ev: 1.73, dur: 3.2, push: 1.1 });
TAKES.push({ id: 't18-goal-frost', map: 'pitch', scheme: 'frost', seed: 74, teams: [['clem', 'meatball', 'sage'], ['brutus', 'biscuit', 'nugget']], looks: [['coat.clem.s1_sunforged', 'coat.meatball.store_mega_meal'], ['coat.brutus.store_chairman']], at: 379.0, ev: 3.13, dur: 4.6, push: 1.1 });

export function specFor(t, aspect, fps = 60) {
  const s = {
    id: `${t.id}-${aspect === 'horizontal' ? 'h' : aspect === 'vertical' ? 'v' : 's'}`,
    mode: t.mode ?? 'skirmish', map: t.map, scheme: t.scheme, seed: t.seed, teams: t.teams, looks: t.looks,
    start: { at: t.at }, duration: t.dur, fps, aspect, camera: 'game', hud: true, focus: 0, music: 0,
    shot: { noMusic: true, css: `.pl-chatopen { display: none !important; }${aspect === 'horizontal' ? '' : ' .pl-minimap { display: none !important; }'}` },
    ...(t.script ? { script: t.script } : {}),
    ...(t.point ? { point: t.point } : {}),
  };
  if (t.push) s.gameKeys = PUSH(fps, t.ev, t.push);
  else if (aspect !== 'horizontal' || t.point) s.gameKeys = [{ f: 0 }];
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const aspects = (process.argv[3] ?? 'horizontal,vertical,square').split(',');
  const only = process.argv[4]?.split(',');
  const fps = Number(process.env.FPS ?? 60);
  const out = [];
  for (const t of TAKES) if (!only || only.some((o) => t.id.startsWith(o))) for (const a of aspects) out.push(specFor(t, a, fps));
  writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(out.length, 'specs');
}
