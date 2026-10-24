// Level lifecycle: load a city + cat, play, end, pause. FROZEN. Menus (src/ui/) drive it through these functions.
import * as A from '../audio/sfx';
import { placeFish } from '../world/fish';
import { placePeople } from '../world/people';
import { applyTheme } from '../world/theme';
import { placeCars } from '../world/traffic';
import { clearWanted, resetWanted } from '../world/wanted';
import { beginEnemies, clearEnemies, frenzyEnemies } from './enemies';
import { EMPTY, events } from './events';
import { clearParticles } from './fx';
import { clearPops, flash, hudLevelEnd, showBanner } from './hud';
import { releaseAll } from './input';
import { resetPlayer, setCat, stopUltra } from './player';
import { cats, levels } from './registry';
import { C, G, game, P, touched } from './state';
import type { CatId, CatStats, EndReason, LevelId, RunResult } from './types';
import { city, destroyedPct } from './world';

let ultraHinted = false;
let bossEndT = -1;

/** The result of the run so far (valid during play and after levelEnd). */
export function runResult(why: EndReason): RunResult {
  return {
    levelId: game.level.id,
    catId: game.cat.id,
    why,
    damage: G.damage,
    buildings: G.buildings,
    landmarks: G.wanted,
    kills: { ...G.kills },
    taxis: G.taxis,
    fish: G.fish,
    maxCombo: G.maxCombo,
    patience: why === 'wet' ? 0 : Math.max(0, G.patience),
    destroyedPct: destroyedPct(),
    bossDefeated: G.bossDefeated,
    elapsed: G.elapsed,
  };
}

/**
 * Load a level behind the menus: rebuild + theme the city, swap in the cat with `stats` (default: its base stats),
 * reset traffic, people, fish and counters. Leaves mode 'title' (attract camera, cat strolling). Call beginPlay() next.
 * keepCamera: skip the street-level swoop (used by AGAIN on the same level).
 */
export function prepareLevel(levelId: LevelId, catId: CatId, stats?: CatStats, opts: { keepCamera?: boolean } = {}): void {
  const level = levels.get(levelId);
  const def = cats.get(catId);
  stopUltra();
  clearWanted();
  clearEnemies();
  game.level = level;
  applyTheme(level.world.theme);
  city.build(level.world); // deterministic per seed: also how a replay resets every floor
  resetWanted();
  Object.assign(P, stats ?? def.base);
  setCat(def);
  resetPlayer(); // first: fish trucks are placed away from the cat
  placeCars();
  placePeople();
  placeFish();
  touched.clear();
  Object.assign(G, {
    time: level.duration,
    damage: 0,
    combo: 0,
    maxCombo: 0,
    comboT: 0,
    patience: P.patienceMax,
    ultra: 0,
    ultraT: 0,
    buildings: 0,
    helis: 0,
    taxis: 0,
    fish: 0,
    elapsed: 0,
    hitStop: 0,
    trauma: 0,
    zapComboT: 0,
    zap: 0,
    frenzy: false,
    blockedT: 0,
    bonkT: 0,
    wanted: 0,
    timeFrozen: false,
    bossDefeated: false,
    kills: {},
  });
  bossEndT = -1;
  ultraHinted = false;
  clearPops();
  clearParticles();
  if (!opts.keepCamera) game.intro = 0;
  game.mode = 'title';
  document.body.dataset.mode = 'title';
  events.emit('levelLoad', { level, cat: def });
}

/** Start the clock: enemies begin, mode 'play'. */
export function beginPlay(): void {
  releaseAll();
  beginEnemies(game.level);
  game.mode = 'play';
  document.body.dataset.mode = 'play';
  showBanner('RAMPAGE!');
  A.meow('short', game.cat.voice);
  events.emit('levelStart', { level: game.level, cat: game.cat });
}

/** prepareLevel + beginPlay. */
export function startLevel(levelId: LevelId, catId: CatId, stats?: CatStats, opts: { keepCamera?: boolean } = {}): void {
  prepareLevel(levelId, catId, stats, opts);
  beginPlay();
}

export function endLevel(why: EndReason): void {
  if (game.mode !== 'play' && game.mode !== 'paused') return;
  game.mode = 'over';
  document.body.dataset.mode = 'over';
  game.overAt = performance.now();
  stopUltra();
  G.hitStop = 0.6; // slow-motion freeze on the last hit
  A.setHeli(0);
  releaseAll();
  clearWanted();
  hudLevelEnd();
  const result = runResult(why);
  events.emit('levelEnd', { result });
  A.meow(why === 'wet' ? 'sad' : 'short', game.cat.voice);
}

/** Leave a level without results (pause menu QUIT). Emits levelEnd with why 'quit'; mode -> 'title'. */
export function quitLevel(): void {
  if (game.mode !== 'play' && game.mode !== 'paused' && game.mode !== 'over') return;
  const wasPlaying = game.mode !== 'over';
  stopUltra();
  clearEnemies();
  clearWanted();
  A.setHeli(0);
  releaseAll();
  hudLevelEnd();
  game.mode = 'title';
  document.body.dataset.mode = 'title';
  if (wasPlaying) events.emit('levelEnd', { result: runResult('quit') });
}

export function pause(): void {
  if (game.mode !== 'play') return;
  game.mode = 'paused';
  document.body.dataset.mode = 'paused';
  releaseAll();
  A.setHeli(0);
  A.setLaser(false);
  events.emit('pause', EMPTY);
}

export function resume(): void {
  if (game.mode !== 'paused') return;
  game.mode = 'play';
  document.body.dataset.mode = 'play';
  if (G.ultraT > 0 && game.ability?.id === 'laser') A.setLaser(true);
  events.emit('resume', EMPTY);
}

/** Per-frame rules while playing: clock, combo decay, final frenzy, end conditions. */
export function tickSession(dt: number): void {
  if (game.mode !== 'play') return;
  const level = game.level;
  if (!G.timeFrozen) {
    G.time -= dt;
    G.elapsed += dt;
  }
  G.comboT -= dt;
  if (G.comboT <= 0) G.combo = 0;
  if (!G.frenzy && G.time < level.frenzyAt) {
    // FINAL FRENZY: double score, fast paws, the sky clears
    G.frenzy = true;
    showBanner('FINAL FRENZY! x2', '#ff3e7a');
    flash(0.5);
    A.meow('ultra', game.cat.voice);
    frenzyEnemies();
    events.emit('frenzy', EMPTY);
  }
  if (G.ultra >= 100 && !ultraHinted && G.ultraT <= 0) {
    ultraHinted = true;
    showBanner(document.body.classList.contains('touch') ? 'ULTRA READY: TAP ULTRA' : 'ULTRA READY: PRESS E', '#ff3e7a');
    events.emit('ultraReady', EMPTY);
  }
  if (G.ultra < 100) ultraHinted = false;
  if (G.bossDefeated && level.boss?.endsLevel) {
    // the victory outro: the clock stops, nothing can soak the cat, the wreck bursts and explodes, then results
    G.timeFrozen = true;
    if (bossEndT < 0) bossEndT = 5;
    bossEndT -= dt;
    if (bossEndT <= 0) endLevel('boss');
    return;
  }
  if (G.time <= 0) endLevel('time');
  else if (G.patience <= 0) endLevel('wet');
}

/** Session queries for UI. */
export const currentLevel = () => game.level;
export const currentCat = () => game.cat;
export const isPlaying = () => game.mode === 'play';
export { C };
