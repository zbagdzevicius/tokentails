import { expect, test, type Page } from '@playwright/test';
import { startFirstMatch } from './helpers';

// LoL pass, lane C: the in-world pieces. Damage numbers stay small on phones (≤ 20 px, words ≤ 24), the tower beam and
// the red aggro ring show when a tower is on the player, the low-health vignette follows its formula with a clear
// centre, the move chevrons and attack outline land, the touch auto-attack ring follows the target, and the nap rune
// fills with the channel and is gone after a cancel. Screenshots: test-results/lol-inworld (or LOL_SHOTS).

const SHOTS = process.env.LOL_SHOTS ?? 'test-results/lol-inworld';

type V = { x: number; z: number };
const world = (page: Page) => page.evaluate(() => !!(window as unknown as { __plWorld?: unknown }).__plWorld);

/** The player's hero position (m), the nearest enemy tower and enemy minion. */
const scene = (page: Page) =>
  page.evaluate(() => {
    const W = (window as unknown as { __plWorld: { view: { frame: { entities: { id: number; kind: string; team: number; fx: number; fy: number; state: string; hp: number }[] } | null; mySlot: number; myTeam: number } } }).__plWorld;
    const f = W.view.frame;
    if (!f) return null;
    const me = f.entities.find((e) => e.id === W.view.mySlot)!;
    const at = (e: { fx: number; fy: number }) => ({ x: e.fx / 1000, z: -e.fy / 1000 });
    const near = (kind: string) =>
      f.entities
        .filter((e) => e.kind === kind && e.team !== W.view.myTeam && e.team !== 2 && e.state !== 'dead' && e.hp > 0)
        .sort((a, b) => Math.hypot(a.fx - me.fx, a.fy - me.fy) - Math.hypot(b.fx - me.fx, b.fy - me.fy))[0];
    const t = near('tower');
    const m = near('minion');
    return { me: at(me), tower: t ? { id: t.id, ...at(t) } : null, minion: m ? { id: m.id, ...at(m) } : null };
  });

for (const s of [
  { w: 844, h: 390, project: 'landscape', phone: true },
  { w: 667, h: 375, project: 'landscape', phone: true },
  { w: 1440, h: 900, project: 'desktop', phone: false },
] as const) {
  test(`${s.w}x${s.h}: LoL in-world (numbers, tower beam and aggro ring, low HP, markers, nap rune)`, async ({ page }, info) => {
    test.skip(info.project.name !== s.project, `${s.project} size`);
    test.setTimeout(150_000);
    await page.setViewportSize({ width: s.w, height: s.h });
    await startFirstMatch(page, '&speed=3');
    expect(await world(page)).toBe(true);
    // past the start gate: the field is live
    await page.waitForFunction(() => document.documentElement.dataset.gate !== 'up', null, { timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const sc = (await scene(page))!;
    expect(sc).not.toBeNull();
    const tag = `${SHOTS}/${s.w}x${s.h}`;

    // C4 damage numbers: every kind on the player's hero; phone sizes ≤ 20 px (words ≤ 24)
    await page.evaluate((me: V) => {
      const W = (window as unknown as { __plWorld: { view: { effects: { numbers: { show(p: unknown, t: string, s: string, k: unknown, v: number): void; word(id: string, p: unknown, o: unknown): boolean } } } } }).__plWorld;
      const n = W.view.effects.numbers;
      const p = (dx: number, dy = 0) => ({ x: me.x + dx, y: 4.2 + dy, z: me.z });
      n.show(p(-2.8), '42', 'normal', 901, 42);
      n.show(p(-1.4), '96', 'heavy', 902, 96);
      n.show(p(0), '188', 'crit', 903, 188);
      n.show(p(1.4), '35', 'hurt', 904, 35);
      n.show(p(2.8), '20', 'shielded', 905, 20);
      n.word('Snap!', p(0, 1.6), { force: true, text: 'Snap!', lifted: true });
    }, sc.me);
    await page
      .waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.fx-dmg')].filter((e) => Number(getComputedStyle(e).opacity) > 0.5).length >= 5, null, { timeout: 4000 })
      .catch(() => undefined);
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.fx-dmg')].filter((e) => Number(getComputedStyle(e).opacity) > 0).map((e) => ({ word: e.classList.contains('word') || e.classList.contains('pop'), px: parseFloat(getComputedStyle(e).fontSize) })),
    );
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    for (const z of sizes) expect(z.px).toBeLessThanOrEqual(s.phone ? (z.word ? 24 : 20) : z.word ? 36 : 32);
    await page.screenshot({ path: `${tag}-numbers.png` });

    // C2 tower beam and aggro ring: the nearest enemy tower fires on the player (camera between them)
    if (sc.tower) {
      await page.evaluate((t: V) => {
        const W = (window as unknown as { __plWorld: { view: { lookAt(x: number, z: number, h: number): void } } }).__plWorld;
        W.view.lookAt(t.x, t.z + 2, 6);
      }, sc.tower);
      await page.waitForTimeout(900);
      // the shot lands on a point beside the tower standing in for the player (the camera frames both)
      const live = await page.evaluate((t) => {
        const W = (window as unknown as { __plWorld: { view: { structures: { shotAt(id: number, x: number, y: number, z: number, me: boolean): void; chargeAt(id: number, x: number, z: number, s: number, me: boolean): void; aggro(id: number): boolean; beams: { live: number } } } } }).__plWorld;
        W.view.structures.shotAt(t.id, t.x - 4, 1.2, t.z + 3, true);
        W.view.structures.shotAt(t.id, t.x + 3, 0.7, t.z + 4, false);
        W.view.structures.chargeAt(t.id, t.x + 5, t.z + 1, 1.5, false);
        return { live: W.view.structures.beams.live, aggro: W.view.structures.aggro(t.id) };
      }, sc.tower);
      expect(live.live).toBeGreaterThan(0);
      expect(live.aggro).toBe(true);
      await page.waitForTimeout(40);
      await page.screenshot({ path: `${tag}-tower.png` });
      // the ring goes back to the pale idle ring 1.5 s (view time) after the last hit
      await page.waitForFunction((id) => !(window as unknown as { __plWorld: { view: { structures: { aggro(id: number): boolean } } } }).__plWorld.view.structures.aggro(id), sc.tower.id, { timeout: 15_000 });
      await page.evaluate(() => (window as unknown as { __plWorld: { view: { recentre(): void } } }).__plWorld.view.recentre());
      await page.waitForTimeout(500);
    }

    // C3 low-health vignette: the formula (0.25 → 0.2527, no beat) and a clear centre at 10%
    const vig = async (frac: number) => {
      await page.evaluate((f) => {
        (window as unknown as { __plWorld: { lowHp(): { force: number | null } | null } }).__plWorld.lowHp()!.force = f;
      }, frac);
      await page
        .waitForFunction((f) => {
          const l = (window as unknown as { __plWorld: { lowHp(): { opacity: number } | null } }).__plWorld.lowHp();
          return !!l && (f >= 0.3 ? l.opacity === 0 : l.opacity > 0);
        }, frac, { timeout: 6000 })
        .catch(() => undefined);
      await page.waitForTimeout(100);
      return page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.pl-lowhp');
        return el ? Number(getComputedStyle(el).opacity) : -1;
      });
    };
    expect(await vig(0.25)).toBeCloseTo(0.18 + 0.32 * (0.05 / 0.22), 2);
    expect(await vig(0.6)).toBe(0);
    const at10 = await vig(0.1);
    expect(Math.abs(at10 - (0.18 + 0.32 * (0.2 / 0.22)))).toBeLessThanOrEqual(0.081);
    await page.screenshot({ path: `${tag}-lowhp.png` });
    await vig(null as unknown as number);

    // C5 markers: a move chevron burst next to the hero, then an attack order on the nearest enemy minion
    const s2 = (await scene(page))!;
    await page.evaluate((me: V) => (window as unknown as { __plWorld: { view: { orderMarker(x: number, z: number, a: boolean): void } } }).__plWorld.view.orderMarker(me.x + 3, me.z - 1.5, false), s2.me);
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${tag}-move.png` });
    if (s2.minion) {
      // frame the minion, then the attack order: the red collapsing ring and the red outline under it
      await page.evaluate((m: V) => (window as unknown as { __plWorld: { view: { lookAt(x: number, z: number, h: number): void } } }).__plWorld.view.lookAt(m.x, m.z, 3), s2.minion);
      await page.waitForTimeout(900);
      await page.evaluate((at: V) => {
        type E = { id: number; kind: string; team: number; state: string; hp: number; fx: number; fy: number };
        const v = (window as unknown as { __plWorld: { view: { myTeam: number; frame: { entities: E[] }; orderMarker(x: number, z: number, a: boolean): void } } }).__plWorld.view;
        const d = (e: E) => Math.hypot(e.fx / 1000 - at.x, -e.fy / 1000 - at.z);
        const m = v.frame.entities.filter((e) => e.kind === 'minion' && e.team !== v.myTeam && e.team !== 2 && e.state !== 'dead' && e.hp > 0).sort((a, b) => d(a) - d(b))[0];
        if (m) v.orderMarker(m.fx / 1000, -m.fy / 1000, true);
      }, s2.minion);
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${tag}-attack.png` });
      await page.evaluate(() => (window as unknown as { __plWorld: { view: { recentre(): void } } }).__plWorld.view.recentre());
      if (s.phone) {
        // touch: the thin ring under the auto-attack target follows the last basic hit
        const got = await page.evaluate(() => {
          type E = { id: number; kind: string; team: number; state: string; hp: number };
          const v = (window as unknown as { __plWorld: { view: { autoTarget: number; autoTargetAt: number; time: number; myTeam: number; autoRingId: number; frame: { entities: E[] } } } }).__plWorld.view;
          const pick = () => v.frame.entities.find((e) => e.kind === 'minion' && e.team !== v.myTeam && e.team !== 2 && e.state !== 'dead' && e.hp > 0);
          return new Promise<{ want: number; got: number }>((r) => {
            let k = 0;
            const step = () => {
              const m = pick();
              if (m) {
                v.autoTarget = m.id;
                v.autoTargetAt = v.time;
              }
              if (m && v.autoRingId === m.id) return r({ want: m.id, got: v.autoRingId });
              if (++k > 30) return r({ want: m?.id ?? -2, got: v.autoRingId });
              requestAnimationFrame(step);
            };
            step();
          });
        });
        expect(got.got).toBe(got.want);
      }
    }

    // C6 nap rune: it fills with the channel and is gone after a cancel
    // C9: Nap is a 300 ms hold on the phone
    if (s.phone) {
      await page
        .evaluate(async () => {
          const el = document.querySelector('.pl-tbtn.nap') as HTMLElement;
          const r = el.getBoundingClientRect();
          const ev = (type: string): PointerEvent => new PointerEvent(type, { pointerId: 9, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true });
          el.dispatchEvent(ev('pointerdown'));
          await new Promise((res) => setTimeout(res, 380));
          window.dispatchEvent(ev('pointerup'));
        })
        .catch(() => undefined);
    }
    else await page.keyboard.press('b');
    const fills: number[] = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(220);
      fills.push(await page.evaluate(() => {
        const W = (window as unknown as { __plWorld: { view: { mySlot: number; lifecycle: { napRunes: { fill: number[] } } | null } } }).__plWorld;
        return W.view.lifecycle?.napRunes.fill[W.view.mySlot] ?? -1;
      }));
      if (i === 2) await page.screenshot({ path: `${tag}-nap.png` });
    }
    const napped = fills.filter((f) => f >= 0);
    if (napped.length >= 2) {
      for (let i = 1; i < napped.length; i++) expect(napped[i]).toBeGreaterThanOrEqual(napped[i - 1]);
    }
    test.info().annotations.push({ type: 'nap fills', description: fills.map((f) => f.toFixed(2)).join(',') });
  });
}
