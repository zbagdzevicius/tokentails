/**
 * UX pass 2 (founder: "flash should be cast right after clicking instead of trying to force it"): press-to-blink in
 * sim ticks, measured against the real sim (unchanged) with the client's real Orders between them.
 *
 * The rig plays the browser's timing: 16 ms frames, 30 Hz sim ticks, commands queued for the next tick (the LocalHost),
 * and a drawn frame that trails the newest snapshot by 2 ticks (render/interp.ts INTERP_LAG 1.6). The press goes in
 * mid-frame; "ticks" counts sim ticks from the press until the hero has blinked. 1 is the floor (the next tick takes
 * the command); the gate is 2.
 *
 * Paths that used to wait (each measured here): a cast sent just before and not shown by the drawn frame yet (the
 * cast buffer held the flash ~3 ticks for it), and a drawn cooldown that still shows a tick or two when the sim's is
 * already 0 (the press waited for the display, or was refused when it showed more than 3). Never a walk-in, never
 * refused for range: the command point is past the range and the sim clamps it to the full blink (heading.ts).
 */
import { describe, expect, it } from 'vitest';
import { TRICKS } from '../../src/data/tricks';
import { trickAim } from '../../src/input/abilities';
import { headingPoint } from '../../src/input/heading';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { HUMAN_SLOT, Op, type Command, type EntitySnap, type HeroId, type SimEvent, type Snapshot } from '../../src/sim/api';
import { createMatch, fillPicks, snapshot, step } from '../../src/sim/index';
import type { MatchHandle } from '../../src/sim/state';

const POUNCE = trickAim('pounce');
const TICK_MS = 1000 / 30;
const FRAME_MS = 16;
/** The drawn frame trails the newest snapshot by this many ticks. */
const LAG = 2;

const toUnit = (e: EntitySnap): Unit => ({ id: e.id, kind: e.kind, team: e.team, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, state: e.state });

interface RigOpts {
  hero?: HeroId;
  /** Use the newest snapshot for the flash (the fix); false = the drawn frame only (the old behaviour). */
  simOwn?: boolean;
  /** An enemy hero this far east of the player (mm), to attack. */
  enemyAt?: number;
}

function rig(o: RigOpts = {}) {
  const hero = o.hero ?? 'clem';
  const { picks, tricks } = fillPicks(7, hero, 'pounce');
  const m = createMatch({ seed: 7, picks, tricks, difficulty: 'easy' }) as MatchHandle;
  for (let i = 0; i < 100; i++) step(m, []);
  const w = m.world;
  const place = (id: number, x: number, y: number) => {
    w.x[id] = x;
    w.y[id] = y;
    w.moveX[id] = x;
    w.moveY[id] = y;
    w.pathLen[id] = 0;
  };
  place(HUMAN_SLOT, 24000, 29000);
  if (o.enemyAt !== undefined) place(3, 24000 + o.enemyAt, 29000);
  const snaps: Snapshot[] = [snapshot(m, 0)];
  let now = 1000;
  let pending: Command[] = [];
  /** Wall clock (ms) of the next tick. */
  let nextTick = now + TICK_MS;
  const drawn = (): Snapshot => snaps[Math.max(0, snaps.length - 1 - LAG)];
  const newest = (): Snapshot => snaps[snaps.length - 1];
  const own = (s: Snapshot) => s.entities.find((e) => e.id === HUMAN_SLOT)!;
  /** Cooldown overrides for the drawn frame (a display that trails the sim), by slot. */
  const drawnCd: Partial<Record<number, number>> = {};
  const env: OrderEnv = {
    send: (c) => pending.push(c),
    units: () => drawn().entities.map(toUnit),
    meId: HUMAN_SLOT,
    hero,
    trick: 'pounce',
    cooldowns: () => {
      const cd = [...(own(drawn()).cooldowns ?? [0, 0, 0, 0, 0])];
      for (const [k, v] of Object.entries(drawnCd)) cd[Number(k)] = v!;
      return cd;
    },
    level: () => own(drawn()).level ?? 1,
    nowMs: () => now,
    ...(o.simOwn === false ? {} : { simOwn: () => ({ cooldowns: own(newest()).cooldowns ?? null, state: own(newest()).state }) }),
  };
  const orders = new Orders(env);
  orders.update();
  let pressTick = -1;
  let blinkTick = -1;
  let from = { x: 0, y: 0 };
  /** Advance the wall clock by `ms` in 16 ms frames, stepping the sim on its 30 Hz clock. */
  const run = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + FRAME_MS);
      while (now >= nextTick) {
        nextTick += TICK_MS;
        const cmds = pending;
        pending = [];
        step(m, cmds);
        const s = snapshot(m, 0);
        snaps.push(s);
        const evs: SimEvent[] = m.events.filter((e) => 'src' in e && (e as { src: number }).src === HUMAN_SLOT) as SimEvent[];
        for (const e of evs) orders.applied(e);
        // the render clock hands events over LAG ticks later
        const late = snaps.length > LAG ? snaps[snaps.length - 1 - LAG].events : [];
        for (const e of late) orders.onEvent(e);
        if (pressTick >= 0 && blinkTick < 0 && Math.hypot(w.x[HUMAN_SLOT] - from.x, w.y[HUMAN_SLOT] - from.y) > TRICKS.pounce.blink - 600) blinkTick = snaps.length - 1;
      }
      orders.update();
    }
  };
  /** Press the flash east now (mid-frame) from where the drawn hero stands. */
  const press = (a = 0) => {
    const me = own(drawn());
    from = { x: w.x[HUMAN_SLOT], y: w.y[HUMAN_SLOT] };
    pressTick = snaps.length - 1;
    blinkTick = -1;
    const p = headingPoint(POUNCE, me, a);
    return orders.cast(4, p.x, p.y);
  };
  /** Sim ticks from the press to the blink (-1 = it never blinked). */
  const ticks = () => (blinkTick < 0 ? -1 : blinkTick - pressTick);
  /** Run the sim's own state forward without input (a "frame" of nothing). */
  const sentOps = () => pending.map((c) => c.op);
  return { m, w, orders, run, press, ticks, sentOps, drawnCd, place, snaps };
}

describe('flash press-to-blink against the real sim (UX pass 2)', () => {
  it('standing: blinks on the next tick (1)', () => {
    const r = rig();
    r.run(200);
    expect(r.press()).toBe(true);
    r.run(300);
    expect(r.ticks()).toBe(1);
  });

  it('running (a move every 100 ms, the joystick): blinks on the next tick, the move waits', () => {
    const r = rig();
    for (let i = 0; i < 4; i++) {
      r.orders.move(40000, 29000);
      r.run(100);
    }
    r.orders.move(40000, 29000);
    r.press();
    r.run(300);
    expect(r.ticks()).toBe(1);
  });

  it('mid basic-attack on an enemy hero: blinks on the next tick (an attack windup never holds it)', () => {
    const r = rig({ enemyAt: 1200 });
    r.orders.attack(3);
    r.run(150);
    r.press();
    r.run(300);
    expect(r.ticks()).toBe(1);
  });

  it('the stick let go in the same breath (a Stop right behind the press): the flash still goes on the next tick', () => {
    const r = rig();
    r.run(100);
    r.press();
    r.orders.stop();
    r.run(300);
    expect(r.ticks()).toBe(1);
  });

  it('a skill sent one frame before and not shown yet: the flash no longer waits for it (the buffer held it ~150 ms)', () => {
    const r = rig({ hero: 'sage' });
    r.run(100);
    r.orders.cast(1, 26000, 29000);
    r.run(FRAME_MS);
    // the old rule: busy 'unseen' (a cast sent and not shown by the drawn frame) kept every press in the cast buffer
    // for CAST_BUFFER.confirmMs (≥ 3 ticks + 3 frames)
    expect(r.orders.busyWhy()).toBe('unseen');
    r.press();
    r.run(400);
    expect(r.ticks()).toBeGreaterThan(0);
    expect(r.ticks()).toBeLessThanOrEqual(2);
    expect(r.orders.flash.atOnce).toBe(1);
  });

  it('the drawn cooldown still shows 2 ticks while the sim has it ready: goes at once (was held for the display)', () => {
    const r = rig();
    r.run(100);
    r.drawnCd[4] = 2;
    r.press();
    r.run(300);
    expect(r.ticks()).toBe(1);
    expect(r.orders.flash.atOnce).toBe(1);

    const old = rig({ simOwn: false });
    old.run(100);
    old.drawnCd[4] = 2;
    old.press();
    // the old path kept it in the buffer until the display read 0
    old.run(120);
    expect(old.ticks()).toBe(-1);
    old.drawnCd[4] = 0;
    old.run(300);
    expect(old.ticks()).toBeGreaterThan(2);
  });

  it('a display 5 ticks behind no longer refuses the press', () => {
    const r = rig();
    r.run(100);
    r.drawnCd[4] = 5;
    expect(r.orders.canQueue(4)).toBe(true);
    const old = rig({ simOwn: false });
    old.run(100);
    old.drawnCd[4] = 5;
    expect(old.orders.canQueue(4)).toBe(false);
  });

  it('on cooldown in the sim: refused at once (deny), nothing sent', () => {
    const r = rig();
    r.run(100);
    r.press();
    r.run(300);
    expect(r.ticks()).toBe(1);
    expect(r.orders.canQueue(4)).toBe(false);
    expect(r.press()).toBe(false);
  });

  it('never a walk-in, never refused for range: the command point is past the range and the sim lands the full blink', () => {
    const r = rig();
    r.run(100);
    r.press(Math.PI / 2);
    expect(r.orders.walkingIn).toBeNull();
    r.run(300);
    expect(r.ticks()).toBe(1);
    expect(Math.hypot(r.w.x[HUMAN_SLOT] - 24000, r.w.y[HUMAN_SLOT] - 29000)).toBeGreaterThan(TRICKS.pounce.blink - 150);
  });

  it('every op sent for one press is a single Trick (no Move, no Stop in its tick)', () => {
    const r = rig();
    r.run(100);
    r.press();
    expect(r.sentOps()).toEqual([Op.Trick]);
  });
});
