import { expect, test, type Page } from '@playwright/test';
import { attr, me, minimapPoint, seedSide, startFirstMatch } from './helpers';

/**
 * Drag-lock on ATK (founder 2026-11-10: "on mobile can't hold and drag my basic attacks target to lock-into selected
 * one ... implement similar technique as wild rift"), 844x390 emulated touch, rookie bot match: hold ATK and drag along
 * the on-screen direction from the own hero to an enemy hero standing behind enemy minions; the field shows the line
 * (data-atk-aim ok), the release locks that hero (data-atk-drag), the lock marker is drawn on it (data-lock-mark), the
 * Attack orders go to it and not to the minion in front, and the lock holds past the old 5 s timer while the hero
 * stays in sight and within 9 m. A drag back into the button centre clears the lock. Math: tests/unit/atk-drag-lock.test.ts.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

type Pt = { x: number; y: number; id: number };
type Seen = { id: number; kind: string; d: number; a: number; sx: number; sy: number; on: boolean };
const W = 844;
const H = 390;
/** Where the screenshots go (test-results is wiped by the next run; DRAG_LOCK_SHOTS keeps them elsewhere). */
const SHOTS = process.env.DRAG_LOCK_SHOTS ?? 'test-results/atk-drag-lock';

/** Every living enemy hero and minion: sim distance (mm) and angle from the own hero, and its on-screen offset (px). */
const scan = (page: Page): Promise<Seen[] | null> =>
  page.evaluate(() => {
    type E = { id: number; kind: string; team: number; fx: number; fy: number; state: string };
    type V3 = { project(c: unknown): { x: number; y: number } };
    const v = (
      window as unknown as {
        __plWorld: { view: { mySlot: number; myTeam: number; frame: { entities: E[]; byId: Map<number, E> } | null; gr: { camera: { position: { constructor: new (x: number, y: number, z: number) => V3 } }; renderer: { domElement: HTMLCanvasElement } } } };
      }
    ).__plWorld.view;
    const f = v.frame;
    const m = f?.byId.get(v.mySlot);
    if (!f || !m || m.state === 'dead') return null;
    const cam = v.gr.camera;
    const Vec = cam.position.constructor;
    const r = v.gr.renderer.domElement.getBoundingClientRect();
    const scr = (e: E) => {
      const p = new Vec(e.fx / 1000, 0.5, -e.fy / 1000).project(cam);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    const ms = scr(m);
    const out: Seen[] = [];
    for (const e of f.entities) {
      if (e.team === v.myTeam || e.team > 1 || e.state === 'dead' || (e.kind !== 'hero' && e.kind !== 'minion')) continue;
      const s = scr(e);
      out.push({
        id: e.id,
        kind: e.kind,
        d: Math.hypot(e.fx - m.fx, e.fy - m.fy),
        a: Math.atan2(e.fy - m.fy, e.fx - m.fx),
        sx: s.x - ms.x,
        sy: s.y - ms.y,
        on: s.x > r.left + 10 && s.x < r.right - 10 && s.y > r.top + 10 && s.y < r.bottom - 10,
      });
    }
    return out;
  });

const gap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/** An enemy hero within 8.5 m on screen, preferring one with an enemy minion nearer along (within 30 deg of) its line. */
function pickHero(units: Seen[], needWave: boolean): { hero: Seen; wave: Seen | null } | null {
  let best: { hero: Seen; wave: Seen | null } | null = null;
  for (const h of units) {
    if (h.kind !== 'hero' || h.d > 8500 || h.d < 2500 || !h.on) continue;
    const wave = units.find((m) => m.kind === 'minion' && m.d < h.d - 800 && gap(m.a, h.a) < (30 * Math.PI) / 180) ?? null;
    if (needWave && !wave) continue;
    if (!best || (wave && !best.wave)) best = { hero: h, wave };
  }
  return best;
}

test('844x390: drag ATK toward a hero behind the wave locks it; it is attacked and chased; centre cancels', async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: W, height: H });
  await seedSide(page, 'cat', { difficulty: 'rookie' });
  // speed 1: on a loaded e2e machine a frame takes a while, and at speed 3 the lane moves metres between the scan of
  // where the hero stands and the drag that points at it
  await startFirstMatch(page, '&speed=1');
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await page.touchscreen.tap(W * 0.25, H * 0.85);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const atk = async (): Promise<Pt> => {
    const r = (await page.locator('.pl-tbtn.attack').boundingBox())!;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), id: 2 };
  };
  const alive = async (): Promise<boolean> => (await me(page)).state !== 'dead';
  const dragOf = async (): Promise<{ id: string; orders: number }> => {
    const [id, n] = (await attr(page, 'atkDrag')).split(',');
    return { id, orders: Number(n) };
  };
  const sentId = async (): Promise<string> => (await attr(page, 'atkSent')).split(':')[0];

  // walk up Sunny Lane until an enemy hero stands within 8.5 m on screen (behind its wave for the first ~150 s)
  let goalX = 30000;
  const start = Date.now();
  const deadline = start + 300_000;
  const trials: string[] = [];
  let locked: Seen | null = null;
  let wave: Seen | null = null;
  let shot = false;
  while (Date.now() < deadline && !locked) {
    if ((await attr(page, 'screen')) === 'results') break;
    if (!(await alive())) {
      goalX = 30000;
      await page.waitForTimeout(1000);
      continue;
    }
    const units = await scan(page);
    const pick = units ? pickHero(units, Date.now() - start < 150_000) : null;
    if (pick) {
      const a = await atk();
      const l = Math.hypot(pick.hero.sx, pick.hero.sy) || 1;
      const ux = pick.hero.sx / l;
      const uy = pick.hero.sy / l;
      await send('touchStart', [a]);
      await send('touchMove', [{ x: Math.round(a.x + ux * 40), y: Math.round(a.y + uy * 40), id: 2 }]);
      await send('touchMove', [{ x: Math.round(a.x + ux * 70), y: Math.round(a.y + uy * 70), id: 2 }]);
      const sel = await expect
        .poll(async () => ((await attr(page, 'atkHold')) === 'drag' ? attr(page, 'atkSel') : ''), { timeout: 6000 })
        .not.toBe('')
        .then(() => attr(page, 'atkSel'))
        .catch(() => '');
      const want = String(pick.hero.id);
      // where everything stands now (the scene moves between the scan and the drag on a slow machine)
      const now = sel === want ? [] : ((await scan(page)) ?? []);
      const aimedNow = now.find((q) => q.id === pick.hero.id);
      // the aimed hero left the 9 m reach (or sight) before the drag registered: that trial says nothing, not scored
      const gone = sel !== want && (!aimedNow || aimedNow.d > 9000);
      if (process.env.DRAG_LOCK_DEBUG || sel !== want) {
        const deg = (r: number) => Math.round((r * 180) / Math.PI);
        const drag = deg(Math.atan2(-uy, ux));
        const row = (q: Seen | undefined) => (q ? `${q.id}:${q.kind}@${(q.d / 1000).toFixed(1)}m sim${deg(q.a)} scr${deg(Math.atan2(-q.sy, q.sx))}` : '-');
        console.log(`trial: drag scr${drag}, hold=${await attr(page, 'atkHold')} sel=${await attr(page, 'atkSel')} me=${await attr(page, 'me')} cands=${await attr(page, 'atkCands')}; aimed ${row(now.find((q) => q.id === pick.hero.id))}; got ${row(now.find((q) => String(q.id) === sel))}; all ${now.filter((q) => q.d < 9500).map(row).join(' ')}`);
      }
      if (gone) {
        console.log(`trial not scored: hero ${want} moved to ${aimedNow ? `${(aimedNow.d / 1000).toFixed(1)} m` : 'out of sight'}`);
        await send('touchEnd', []);
        await page.waitForTimeout(400);
        continue;
      }
      trials.push(`${want}@${(pick.hero.d / 1000).toFixed(1)}m${pick.wave ? `+wave ${pick.wave.id}@${(pick.wave.d / 1000).toFixed(1)}m` : ''} -> ${sel || 'none'}`);
      if (sel === want) {
        expect(await attr(page, 'atkAim')).toBe('ok');
        if (!shot) {
          // the first selection is only photographed (the line and the reach ring): a screenshot takes seconds on a
          // loaded machine and the lane moves meanwhile, so this release is not scored; the next trial is
          await page.screenshot({ path: `${SHOTS}/1-drag-line.png` });
          shot = true;
          trials.pop();
          await send('touchMove', [{ x: a.x + 2, y: a.y + 1, id: 2 }]);
          await send('touchEnd', []);
          await page.waitForTimeout(600);
          continue;
        }
        const n0 = Number((await attr(page, 'atkSelN')).split(',')[0]);
        await send('touchEnd', []);
        const ok = await expect
          .poll(async () => Number((await attr(page, 'atkSelN')).split(',')[0]), { timeout: 6000 })
          .toBe(n0 + 1)
          .then(async () => (await attr(page, 'atkSelN')).split(',')[2] === want && (await dragOf()).id === want)
          .catch(() => false);
        if (ok) {
          locked = pick.hero;
          wave = pick.wave;
          break;
        }
        console.log(`released, not locked on ${want}: selN=${await attr(page, 'atkSelN')} drag=${await attr(page, 'atkDrag')} sent=${await attr(page, 'atkSent')} me=${await attr(page, 'me')}`);
      } else await send('touchEnd', []);
      await page.waitForTimeout(400);
      continue;
    }
    goalX = Math.min(50000, goalX + 2500);
    const p = await minimapPoint(page, goalX, 52500).catch(() => null);
    if (p) await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForTimeout(700);
  }
  console.log(`drag-lock trials: ${trials.join(' | ')}`);
  expect(locked, 'a drag toward an enemy hero locked it').not.toBeNull();
  if (!wave) console.log('note: no enemy minion stood in front of the hero this run (the fallback hero was used)');
  const want = String(locked!.id);
  const hits = trials.filter((t) => t.endsWith(`-> ${t.split('@')[0]}`)).length;
  expect(hits / trials.length, `drags that selected the hero aimed at: ${trials.join(' | ')}`).toBeGreaterThanOrEqual(0.5);

  // the release attacked the hero (not the minion in front) and the lock marker is on it
  expect(await sentId()).toBe(want);
  await expect.poll(() => attr(page, 'lockMark'), { timeout: 5000 }).toBe(want);
  await expect.poll(() => attr(page, 'atkLock'), { timeout: 3000 }).toBe(want);
  await page.screenshot({ path: `${SHOTS}/2-locked.png` });

  // it keeps chasing: while the lock holds every Attack order goes to the hero, and the gap closes or a hit lands
  const releasedAt = Date.now();
  const hits0 = Number(await attr(page, 'hits'));
  let minD = locked!.d;
  let lastSeen: Seen | null = locked;
  while (Date.now() - releasedAt < 6000) {
    await page.waitForTimeout(400);
    if (!(await alive())) break;
    const lock = (await dragOf()).id;
    const h = (await scan(page))?.find((u) => u.id === locked!.id) ?? null;
    lastSeen = h;
    if (process.env.DRAG_LOCK_DEBUG) console.log(`chase ${Date.now() - releasedAt} ms: lock=${lock} sent=${await attr(page, 'atkSent')} d=${h ? (h.d / 1000).toFixed(1) : '-'} me=${await attr(page, 'me')} hits=${await attr(page, 'hits')}`);
    if (lock !== want) break;
    expect(await sentId(), 'the Attack orders go to the locked hero').toBe(want);
    if (h) minD = Math.min(minD, h.d);
  }
  const chased = minD < locked!.d - 500 || Number(await attr(page, 'hits')) > hits0;
  expect(chased, `the hero closed in (${(locked!.d / 1000).toFixed(1)} -> ${(minD / 1000).toFixed(1)} m) or hit`).toBe(true);
  // past the old 5 s timer (LOCK.ms) the lock still holds while the hero is alive, seen and within 9 m
  const wait = 5600 - (Date.now() - releasedAt);
  if (wait > 0) await page.waitForTimeout(wait);
  lastSeen = (await scan(page))?.find((q) => q.id === locked!.id) ?? null;
  if (lastSeen && lastSeen.d < 8800 && (await alive())) expect((await dragOf()).id, `the lock holds ${Date.now() - releasedAt} ms after the release`).toBe(want);
  else console.log(`lock outlived check skipped: hero ${lastSeen ? `${(lastSeen.d / 1000).toFixed(1)} m` : 'gone or dead'}, ${Date.now() - releasedAt} ms`);
  await page.screenshot({ path: `${SHOTS}/3-chase.png` });

  // a drag back into the button centre cancels the hold and clears the lock (if it still holds)
  await expect.poll(alive, { timeout: 30_000 }).toBe(true);
  const a = await atk();
  const cancels = Number((await attr(page, 'atkSelN')).split(',')[1]);
  await send('touchStart', [a]);
  await send('touchMove', [{ x: a.x - 50, y: a.y - 40, id: 2 }]);
  await expect.poll(() => attr(page, 'atkHold'), { timeout: 5000 }).toBe('drag');
  await send('touchMove', [{ x: a.x + 3, y: a.y - 2, id: 2 }]);
  await expect.poll(() => attr(page, 'atkHold'), { timeout: 5000 }).toBe('cancel');
  await page.screenshot({ path: `${SHOTS}/4-cancel.png` });
  await send('touchEnd', []);
  await expect.poll(async () => Number((await attr(page, 'atkSelN')).split(',')[1]), { timeout: 5000 }).toBe(cancels + 1);
  expect((await attr(page, 'atkSelN')).split(',')[4]).toBe('centre');
  expect((await dragOf()).id).toBe('');
  await expect.poll(() => attr(page, 'lockMark'), { timeout: 3000 }).not.toBe(want);

  // a drag pointing at nothing (every enemy in reach 100+ deg off on screen): the line turns red, nothing is selected,
  // and the release cancels with no lock (only when the lane leaves such a direction open)
  await expect.poll(alive, { timeout: 30_000 }).toBe(true);
  const around = ((await scan(page)) ?? []).filter((q) => q.d < 9500);
  let open: number | null = null;
  let openGap = 0;
  for (let k = 0; k < 24; k++) {
    const t = (k * Math.PI) / 12;
    const g = around.reduce((m, q) => Math.min(m, gap(t, Math.atan2(q.sy, q.sx))), Math.PI);
    if (g > openGap) {
      openGap = g;
      open = t;
    }
  }
  if (open !== null && openGap >= (100 * Math.PI) / 180) {
    const b = await atk();
    const n1 = Number((await attr(page, 'atkSelN')).split(',')[1]);
    const to = { x: Math.max(4, Math.min(W - 4, Math.round(b.x + Math.cos(open) * 70))), y: Math.max(4, Math.min(H - 4, Math.round(b.y + Math.sin(open) * 70))), id: 2 };
    await send('touchStart', [b]);
    await send('touchMove', [{ x: Math.round((b.x + to.x) / 2), y: Math.round((b.y + to.y) / 2), id: 2 }]);
    await send('touchMove', [to]);
    await expect.poll(() => attr(page, 'atkAim'), { timeout: 5000 }).toBe('none');
    expect(await attr(page, 'atkSel')).toBe('');
    await page.screenshot({ path: `${SHOTS}/5-nothing.png` });
    await send('touchEnd', []);
    await expect.poll(async () => Number((await attr(page, 'atkSelN')).split(',')[1]), { timeout: 5000 }).toBe(n1 + 1);
    expect((await attr(page, 'atkSelN')).split(',')[4]).toBe('none');
    expect((await dragOf()).id).toBe('');
  } else console.log(`pointing-at-nothing check skipped: the widest open direction is ${Math.round((openGap * 180) / Math.PI)} deg off an enemy`);
});
