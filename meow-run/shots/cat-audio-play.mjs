// CAT-AUDIO in-game check: node shots/cat-audio-play.mjs [w h] [filter]
// Real gameplay camera: jumps to each set-piece surface (wall, river, cloud, gap/vault), lets a bot run into it and
// screenshots the kitten there; checks the music is playing and the speed lines show. 0 page/console errors.
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const filter = process.argv[4] || '';
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL);
await p.waitForTimeout(1500);
await p.mouse.click(5, 5); // a gesture: unlocks audio
await p.evaluate(() => { window.__meow.dev.unlockAll(); window.__chase = {}; window.__meow.events.on('chase', (e) => { window.__chase[e.kind] = e.on; }); });
const startBot = () => p.evaluate(() => {
  const M = window.__meow;
  clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    if (M.mode !== 'play') { M.input.botSteer = null; return; }
    const P = M.P;
    let steer = -P.x * 0.3;
    for (const c of M.colliders()) {
      if (!c.enabled) continue;
      const ds = c.s - P.s;
      if (c.kind !== 'hurt' || ds < 1.5 || ds > 1.5 + P.speed * 0.2) continue;
      const lateral = Math.abs(c.x - P.x) - (c.shape === 'sphere' ? c.r : c.hx) - 0.4;
      if (lateral > 0.2) continue;
      if (c.y > 0.5) { if (!P.sliding) M.press('slide'); } else if (P.grounded) M.press('jump');
    }
    const pr = M.hud.prompt;
    if (pr && pr.action === 'ability') M.press('ability');
    if (P.grounded && M.game.track.kindAt(P.s + P.speed * 0.25) === 'gap') M.press('jump');
    M.input.botSteer = steer;
  }, 40);
});
let n = 0;
const S = (name) => p.screenshot({ path: `shots/cat-audio-${tag}-play-${String(++n).padStart(2, '0')}-${name}.png` });
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn).catch(() => false)) return true; await p.waitForTimeout(50); } return false; };

const visit = async (stage, kind, name, extra = 0.35, cond, minLen = 0) => {
  if (filter && !name.includes(filter)) return;
  const t = await p.evaluate(({ stage, kind, minLen }) => {
    const M = window.__meow;
    M.dev.jump(stage, 0);
    if (kind.startsWith('@')) {
      // '@cpIndex': start from that checkpoint
      const cp = M.G.checkpoints[+kind.slice(1)];
      return (cp + 1) / M.G.finishS;
    }
    const seg = M.game.track.segments.find((s) => s.kind === kind && s.s0 > 30 && s.s1 - s.s0 >= minLen);
    if (!seg) return -1;
    return Math.max(0, (seg.s0 - 60) / M.G.finishS);
  }, { stage, kind, minLen });
  if (t < 0) { console.log('no', kind, 'in', stage); return; }
  await p.evaluate(({ stage, t }) => { window.__meow.dev.jump(stage, t); window.__meow.dev.invincible(true); }, { stage, t });
  await startBot();
  const ok = await until(cond || `window.__meow.P.surface === '${kind}'`, 20000);
  await p.evaluate(() => window.__catAudio.level());
  await p.waitForTimeout(extra * 1000);
  await S(name);
  console.log(ok ? 'ok  ' : 'MISS', name, JSON.stringify(await p.evaluate(() => ({ s: Math.round(window.__meow.P.s), surface: window.__meow.P.surface, ability: window.__meow.P.ability, state: window.__catAudio.rig()?.state, music: window.__catAudio.music(), lines: +window.__catAudio.speedLines().toFixed(2), rms: +(window.__catAudio.level() ?? -1).toFixed(4), ctx: window.__catAudio.audioCtx()?.state }))));
};

await visit('meadow', 'ground', 'run', 1.5, 'true');
await visit('meadow', 'gap', 'vault', 0.2, "window.__meow.P.ability === 'vault'", 20);
await visit('meadow', 'gap', 'vault-late', 0.5, "window.__meow.P.ability === 'vault'", 20);
await visit('gorge', 'wall', 'wall');
await visit('gorge', 'river', 'surf', 0.8);
await visit('gorge', '@3', 'dog', 2.2, "window.__chase.dog === true");
await visit('gorge', '@3', 'dog-late', 5, "window.__chase.dog === true");
await visit('sunset', '@2', 'yarn', 2.5, "window.__chase.yarn === true");
await visit('sunset', 'cloud', 'cloud', 1.0, "window.__meow.P.ability === 'cloud'");
await visit('sunset', 'cloud', 'cloud-hop', 1.0, "window.__meow.P.ability === 'cloud'");
if (!filter || 'pounce'.includes(filter)) {
  await p.evaluate(() => { window.__meow.dev.jump('meadow', 0.3); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { clearInterval(window.__bot); window.__meow.press('jump'); setTimeout(() => window.__meow.press('jump'), 280); });
  await p.waitForTimeout(430);
  await S('pounce');
  await p.waitForTimeout(800);
  await p.evaluate(() => window.__meow.press('slide'));
  await p.waitForTimeout(200);
  await S('slide');
}
if (!filter || 'victory wet hit'.includes(filter)) {
  await p.evaluate(() => { clearInterval(window.__bot); window.__meow.input.botSteer = null; window.__meow.dev.jump('meadow', 0.25); });
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__meow.P.wet = 1.5; });
  await p.waitForTimeout(250);
  await S('wet');
  await p.evaluate(() => { window.__meow.dev.invincible(false); window.__meow.P.invuln = 0; });
  const hit = await until("window.__meow.P.sinceHit < 0.2", 12000);
  await p.waitForTimeout(120);
  await S('hit');
  console.log(hit ? 'ok  ' : 'MISS', 'hit');
  await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.985); });
  await startBot();
  const fin = await until("window.__meow.mode === 'finish'", 15000);
  await p.waitForTimeout(1700);
  await S('victory');
  console.log(fin ? 'ok  ' : 'MISS', 'victory', JSON.stringify(await p.evaluate(() => ({ state: window.__catAudio.rig()?.state, music: window.__catAudio.music(), mode: window.__meow.mode }))));
}
console.log('ERRORS', errs.length, errs.slice(0, 5));
await b.close();
