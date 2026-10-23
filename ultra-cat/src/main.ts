// Ultra Cat bootstrap. FROZEN: lanes plug in through their own register*() functions, never by editing this file.
import { registerCampaign } from './campaign';
import { registerCats } from './cats';
import { initEnemies } from './core/enemies';
import { initInput } from './core/input';
import { startLoop } from './core/loop';
import { doPounce, doSwipe, doUltra } from './core/player';
import { G, C, game } from './core/state';
import { city, destroyedPct } from './core/world';
import { registerEnemies } from './enemies';
import { registerMetaUi } from './ui';
import * as session from './core/session';
import { camera } from './core/engine';
import { keys } from './core/input';
import { enemyTypes } from './core/registry';
import { beams } from './cats/abilities/laser';
import { dev } from './ui/dev';

registerCampaign();
registerCats();
registerEnemies();
initEnemies();
// core input first: its keydown handler must see the pre-menu mode (Space on the title must not pounce)
initInput({ swat: doSwipe, pounce: doPounce, ultra: doUltra });
registerMetaUi(); // must leave a level prepared (session.prepareLevel) before the first frame
startLoop();

// test hook for automated playtests (shots/*.mjs)
(window as unknown as { __ultra: unknown }).__ultra = {
  G,
  C,
  game,
  get mode() {
    return game.mode;
  },
  startGame: () => session.startLevel(game.level?.id ?? 'meowhattan', game.cat?.id ?? 'tabby'),
  session,
  doSwipe,
  doPounce,
  doUltra,
  city,
  destroyedPct,
  keys,
  camera,
  beams,
  helis: {
    get length() {
      return enemyTypes.get('heli').alive();
    },
  },
  enemyTypes,
  /** tester shortcuts: dev.unlockAll(), dev.jump(levelId, catId?), dev.boss(), dev.reset() */
  dev,
};
