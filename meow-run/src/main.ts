// Meow Run bootstrap. FROZEN: lanes plug in through their register*() functions, never by editing this file.
import { registerCatAudio } from './cat';
import { CAM, setCameraOverride } from './core/camera';
import { colliders } from './core/collision';
import { camera, getQuality, getQualityMode, setQualityMode } from './core/engine';
import { events } from './core/events';
import { hud } from './core/hud';
import { initInput, input, keys, press } from './core/input';
import { clock, startLoop } from './core/loop';
import { ability, jump, P, slide, TUNING } from './core/player';
import { actors, setPieceTypes, stages, themes } from './core/registry';
import * as session from './core/session';
import { G, game, prefs } from './core/state';
import { dev } from './meta/dev';
import { registerSetPieces } from './setpieces';
import { registerStages } from './stages';
import { registerMetaUi } from './ui';
import { registerWorld } from './world';

registerWorld();
registerSetPieces();
registerStages();
registerCatAudio();
// core input first, so its keydown handler sees the pre-menu mode
initInput((a) => {
  events.emit('action', { action: a });
  if (a === 'pause') {
    if (game.mode === 'play') session.pause();
    return;
  }
  if (game.mode !== 'play') return;
  if (a === 'jump') jump();
  else if (a === 'slide') slide();
  else if (a === 'ability') ability();
});
registerMetaUi(); // must leave a stage prepared (session.prepareStage) for the title attract
startLoop();

// test hook for automated playtests (shots/*.mjs)
(window as unknown as { __meow: unknown }).__meow = {
  get mode() {
    return game.mode;
  },
  game,
  G,
  P,
  hud,
  prefs,
  TUNING,
  CAM,
  clock,
  session,
  events,
  stages,
  themes,
  setPieceTypes,
  actors,
  colliders,
  camera,
  setCameraOverride,
  /** press('jump' | 'slide' | 'ability' | 'pause'), input.botSteer = -1..1 | null, keys */
  press,
  input,
  keys,
  quality: { get: getQuality, mode: getQualityMode, set: setQualityMode },
  /** dev.unlockAll(), dev.jump(stageId, t0..1), dev.invincible(on), dev.reset(), dev.save() */
  dev,
};
