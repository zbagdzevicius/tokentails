// One-stop import for lanes: `import * as U from '../core/api'` (or named imports). FROZEN.
// Everything here is stable contract; see LANES.md for what each lane may call.
export * from './types';
export { events, EMPTY, type GameEvents } from './events';
export { levels, cats, enemyTypes, levelList, Registry } from './registry';
export { game, G, C, P, W, CAPS, COMBO_T, settings, touched, type Mode } from './state';
export { scene, camera, renderer, sun, hemi, isTouch, setQuality, getQuality } from './engine';
export { BodySet, Particles, St } from './bodies';
export { dust, chunks, water, fire, fxMat, burst, shake, fx } from './fx';
export { pop, popMoney, showBanner, flash, edgeArrow, money } from './hud';
export { score, comboHit, bonus, mult } from './score';
export { comboMult, scoredValue, segValueMul, ultraGain, rankOf, RANKS } from './scoring';
export { city, FLOOR, distB, smash, radial, valMul, markTouched, staticSegs, destroyedPct, randomIntersection, distCat, type Building, type Push } from './world';
export { soak, startle, tug, slow, blast, doSwipe, doPounce, doUltra, stopUltra } from './player';
export { reportKill, activeEnemies, blastEnemies } from './enemies';
export { prepareLevel, beginPlay, startLevel, endLevel, quitLevel, pause, resume, runResult, currentLevel, currentCat, isPlaying } from './session';
export { addFrameHook, type FrameHook } from './loop';
export { screens, type Screen } from './screens';
export { keys, releaseAll } from './input';
export { cars, launchCar, launchCarsNear } from '../world/traffic';
export { startlePeople } from '../world/people';
export { fishTrucks } from '../world/fish';
