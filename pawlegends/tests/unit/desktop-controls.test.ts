// @vitest-environment happy-dom
/** Desktop controls: quick cast by default (cursor targeting), Aim on hold as an option, and trackpad mode (Auto / On / Off). */
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { aimFor, trickAim } from '../../src/input/abilities';
import { DesktopInput, TRACKPAD_TOAST, type InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import { castMode, resetControlPrefs, setCastMode, setTrackpadPref, trackpadAutoRule, trackpadOn, trackpadPref, TRACKPAD_AUTO } from '../../src/input/presets';
import { project } from '../../src/input/screen';
import { QUICK_UNIT_SEEK, cursorCast, type Unit } from '../../src/input/targeting';
import { tipText } from '../../src/onboarding/tips';
import { Op, type Command, type HeroId } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state: 'idle' });

beforeEach(() => {
  localStorage.clear();
  resetControlPrefs();
});

describe('cursorCast (quick cast targeting)', () => {
  const me = unit(0, 'hero', 0, 10000, 10000);
  const foe = unit(4, 'hero', 1, 14000, 10000);
  const minion = unit(10, 'minion', 1, 12000, 12000);
  it('self casts go at the hero, directions toward the cursor', () => {
    expect(cursorCast(aimFor('brutus', 0), me, { x: 20000, y: 0 }, null, [me], 0, true)).toEqual({ x: 10000, y: 10000, id: 0xff });
    expect(cursorCast(aimFor('clem', 0), me, { x: 30000, y: 10000 }, null, [me], 0, true)).toEqual({ x: 30000, y: 10000, id: 0xff });
    // no ground under the cursor: straight ahead
    const ahead = cursorCast(aimFor('clem', 0), me, null, null, [me], 0, true)!;
    expect(ahead.x).toBeGreaterThan(me.x);
    expect(ahead.y).toBe(me.y);
  });
  it('ground points clamp to the range in quick cast, not on the hold release (that walks in)', () => {
    const range = aimFor('sage', 1).range;
    const q = cursorCast(aimFor('sage', 1), me, { x: 10000 + range * 3, y: 10000 }, null, [me], 0, true)!;
    expect(q.y).toBe(10000);
    expect(q.x - me.x).toBeLessThanOrEqual(range);
    expect(q.x - me.x).toBeGreaterThan(range - 50);
    expect(cursorCast(aimFor('sage', 1), me, { x: 10000 + range * 3, y: 10000 }, null, [me], 0, false)).toMatchObject({ x: 10000 + range * 3 });
    // inside the range: exactly at the cursor
    expect(cursorCast(trickAim('pounce'), me, { x: 11000, y: 10500 }, null, [me], 0, true)).toEqual({ x: 11000, y: 10500, id: 0xff });
  });
  it('unit aims take the enemy hero under the cursor, else the nearest one near the cursor, else refuse', () => {
    const units = [me, foe, minion];
    expect(cursorCast(aimFor('brutus', 3), me, { x: 0, y: 0 }, foe, units, 0, true)).toEqual({ x: 14000, y: 10000, id: 4 });
    // a minion under the cursor does not count; the hero next to the cursor does
    expect(cursorCast(aimFor('brutus', 3), me, { x: 13000, y: 10500 }, minion, units, 0, true)?.id).toBe(4);
    expect(cursorCast(aimFor('brutus', 3), me, { x: 14000 + QUICK_UNIT_SEEK + 500, y: 10000 }, null, units, 0, true)).toBeNull();
    expect(cursorCast(aimFor('brutus', 3), me, null, null, units, 0, true)).toBeNull();
    // an ally hero is never the target
    expect(cursorCast(aimFor('brutus', 3), me, { x: 14000, y: 10000 }, null, [me, unit(1, 'hero', 0, 14000, 10000)], 0, true)).toBeNull();
  });
});

describe('control options', () => {
  it('default to quick cast and Auto trackpad, and persist an explicit choice', () => {
    expect(castMode()).toBe('quick');
    expect(trackpadPref()).toBe('auto');
    expect(trackpadOn()).toBe(false);
    setCastMode('hold');
    setTrackpadPref('on');
    resetControlPrefs();
    expect(castMode()).toBe('hold');
    expect(trackpadPref()).toBe('on');
    expect(trackpadOn()).toBe(true);
  });
  it('the auto rule: a right-click means a mouse; two ground clicks and the opening watch mean a trackpad', () => {
    expect(trackpadAutoRule({ playMs: 2000, groundClicks: 5, rightPressed: false })).toBe('wait');
    expect(trackpadAutoRule({ playMs: TRACKPAD_AUTO.ms, groundClicks: 1, rightPressed: false })).toBe('wait');
    expect(trackpadAutoRule({ playMs: TRACKPAD_AUTO.ms, groundClicks: 2, rightPressed: false })).toBe('switch');
    expect(trackpadAutoRule({ playMs: 1000, groundClicks: 0, rightPressed: true })).toBe('never');
    expect(trackpadAutoRule({ playMs: 20000, groundClicks: 9, rightPressed: true })).toBe('never');
  });
  it('the desktop tips say Click in trackpad mode, Right-click with a mouse, both while Auto watches', () => {
    expect(tipText('move', false)).toBe('Click or right-click the ground to walk');
    expect(tipText('attack', false)).toBe('Click or right-click an enemy minion to attack');
    expect(tipText('move', false, undefined, false)).toBe('Right-click the ground to walk');
    setTrackpadPref('off');
    expect(tipText('move', false)).toBe('Right-click the ground to walk');
    setTrackpadPref('on');
    expect(tipText('move', false)).toBe('Click the ground to walk');
    expect(tipText('attack', false)).toMatch(/^Click an enemy minion/);
    expect(tipText('move', true)).toMatch(/Drag/);
  });
});

/** A DesktopInput on a top-down camera over (20 m, -10 m), a 400x400 canvas, the real Orders. */
function rig(hero: HeroId = 'clem', units: Unit[] = [unit(0, 'hero', 0, 20000, 10000)]) {
  const cam = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 500);
  cam.position.set(20, 100, -10);
  cam.up.set(0, 0, -1);
  cam.lookAt(20, 0, -10);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(canvas);
  const sent: Command[] = [];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => 5, nowMs: () => 0 };
  const orders = new Orders(env);
  const banners: string[] = [];
  const view = { gr: { camera: cam }, myTeam: 0, mySlot: 0, aim: null as unknown, juice: { banner: (b: { title: string }) => banners.push(b.title) }, recentre() {}, panBy() {}, zoomTarget: 1 };
  const host: InputHost = { canvas, view: view as unknown as InputHost['view'], orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} };
  const d = new DesktopInput(host);
  /** Client px of a sim point. */
  const px = (x: number, y: number) => project(cam, canvas, x / 1000, 0, -y / 1000);
  const point = (x: number, y: number) => {
    const p = px(x, y);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, pointerType: 'mouse' }));
    return p;
  };
  const click = (x: number, y: number, button: 0 | 2) => {
    const p = point(x, y);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, button, pointerType: 'mouse', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: p.x, clientY: p.y, button, pointerType: 'mouse' }));
  };
  const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  return { d, sent, view, banners, point, click, key, canvas };
}

describe('DesktopInput', () => {
  it('quick cast: Q casts at the cursor on press, with a brief indicator', () => {
    const r = rig();
    r.point(26000, 10000);
    r.key('keydown', 'KeyQ');
    expect(r.sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 0 });
    const c = r.sent.at(-1) as { x: number; y: number };
    expect(Math.abs(c.x - 26000)).toBeLessThan(150);
    expect(Math.abs(c.y - 10000)).toBeLessThan(150);
    expect(r.view.aim).not.toBeNull();
    r.d.dispose();
  });
  it('quick cast: a unit ability with no enemy hero near the cursor is not spent', () => {
    const r = rig('brutus');
    r.point(26000, 10000);
    r.key('keydown', 'KeyR');
    expect(r.sent.some((c) => c.op === Op.Cast)).toBe(false);
    expect(r.d.casts).toBe(0);
    r.d.dispose();
  });
  it('Aim on hold: press aims, release casts', () => {
    setCastMode('hold');
    const r = rig();
    r.point(26000, 10000);
    r.key('keydown', 'KeyQ');
    expect(r.sent.length).toBe(0);
    expect(r.view.aim).not.toBeNull();
    r.key('keyup', 'KeyQ');
    expect(r.sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 0 });
    r.d.dispose();
  });
  it('plain LMB does nothing with a mouse; trackpad On makes it move, and an armed A still attack-moves', () => {
    const m = rig();
    m.click(25000, 12000, 2);
    const n = m.sent.length;
    m.click(25000, 12000, 0);
    expect(m.sent.length).toBe(n);
    expect(m.d.padMode).toBe(false);
    m.d.dispose();
    setTrackpadPref('off');
    const o = rig();
    o.click(25000, 12000, 0);
    expect(o.sent.length).toBe(0);
    o.d.dispose();
    setTrackpadPref('on');
    const r = rig();
    r.click(25000, 12000, 0);
    expect(r.sent.at(-1)?.op).toBe(Op.Move);
    r.key('keydown', 'KeyA');
    r.click(24000, 11000, 0);
    expect(r.sent.at(-1)?.op).toBe(Op.AttackMove);
    r.d.dispose();
  });
  it('Auto: left-click already moves while watching, as the tip says', () => {
    const r = rig();
    expect(r.d.padMode).toBeNull();
    r.click(25000, 12000, 0);
    expect(r.sent.at(-1)?.op).toBe(Op.Move);
    expect(r.d.trackpadMode).toBe(false);
    r.d.dispose();
  });
  it('Auto: two ground clicks and no right-click switch trackpad mode on after the watch, with one toast', () => {
    const r = rig();
    r.click(25000, 12000, 0);
    r.click(24000, 12000, 0);
    expect(r.d.trackpadMode).toBe(false);
    for (let t = 0; t < TRACKPAD_AUTO.ms + 200; t += 100) r.d.update(0.1);
    expect(r.d.trackpadMode).toBe(true);
    expect(r.d.padMode).toBe(true);
    expect(r.banners).toEqual([TRACKPAD_TOAST]);
    r.click(25000, 12000, 0);
    expect(r.sent.at(-1)?.op).toBe(Op.Move);
    r.d.dispose();
    // remembered: the next match starts in trackpad mode, no second toast
    const n = rig();
    expect(n.d.trackpadMode).toBe(true);
    for (let t = 0; t < TRACKPAD_AUTO.ms + 200; t += 100) n.d.update(0.1);
    expect(n.banners).toEqual([]);
    n.d.dispose();
  });
  it('Auto: a right-click early means a mouse, never switched', () => {
    const r = rig();
    r.click(25000, 12000, 2);
    r.click(25000, 12000, 0);
    r.click(24000, 12000, 0);
    r.click(23000, 12000, 0);
    for (let t = 0; t < TRACKPAD_AUTO.ms * 2; t += 100) r.d.update(0.1);
    expect(r.d.trackpadMode).toBe(false);
    expect(r.banners).toEqual([]);
    r.d.dispose();
  });
  it('Off: never switched', () => {
    setTrackpadPref('off');
    const r = rig();
    r.click(25000, 12000, 0);
    r.click(24000, 12000, 0);
    for (let t = 0; t < TRACKPAD_AUTO.ms * 2; t += 100) r.d.update(0.1);
    expect(r.d.trackpadMode).toBe(false);
    r.d.dispose();
  });
});
