// Location scout for the storyboard: prints every set piece of a stage (type, s, len) and the finish, and with
// --stills grabs one game-camera frame a second of a bot run from s0 for n seconds (build/scout/<stage>-<s>-NN.png).
//   node tools/trailer/scout.mjs gorge                       the piece list
//   node tools/trailer/scout.mjs gorge --stills 900 12       stills from s 900 for 12 s
//   node tools/trailer/scout.mjs gorge --stills 900 12 9x16  in portrait
import path from 'node:path';
import * as L from './lib.mjs';

const [stage = 'meadow', flag, s0 = '0', secs = '10', aspect = '16x9'] = process.argv.slice(2);
await L.startServer();
try {
  const o = await L.openGame(aspect);
  const info = await L.ev(
    o,
    (stage) => {
      const m = window.__meow;
      m.session.prepareStage(stage);
      const specs = m.session.sessionInfo.specs.map((p) => `${p.type}@${Math.round(p.s)}${p.len ? '+' + Math.round(p.len) : ''}${p.x ? ' x' + p.x : ''}${p.y ? ' y' + p.y : ''}`);
      const kinds = [];
      const tr = m.game.track;
      let k = '';
      for (let s = 0; s < tr.length; s += 2) {
        const kk = tr.kindAt(s);
        if (kk !== k) kinds.push(`${kk}@${s}`), (k = kk);
      }
      return { finishS: m.G.finishS, specs, kinds };
    },
    stage,
  );
  if (flag !== '--stills') {
    console.log('finish', Math.round(info.finishS));
    console.log('kinds', info.kinds.join(' '));
    console.log(info.specs.join('\n'));
  } else {
    await L.jump(o, stage, Number(s0));
    await L.ev(o, () => void (window.__dir.bot = {}));
    for (let i = 0; i < Number(secs); i++) {
      await L.sim(o, 60);
      const st = await L.ev(o, () => ({ s: Math.round(window.__meow.P.s), m: window.__meow.mode, k: window.__meow.game.track?.kindAt(window.__meow.P.s), h: window.__meow.G.hearts }));
      const f = path.join(L.BUILD, 'scout', `${stage}-${s0}-${aspect}-${String(i).padStart(2, '0')}.png`);
      await L.still(o, f);
      console.log(f, JSON.stringify(st));
    }
  }
  if (o.errors.length) console.log('ERRORS', o.errors.slice(0, 5));
  await o.close();
} finally {
  await L.closeBrowser();
  L.stopServer();
}
