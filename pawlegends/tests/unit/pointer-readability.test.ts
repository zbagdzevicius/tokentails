// @vitest-environment happy-dom
/** Pointer readability in a brawl: the cursor kinds and art, the hover target, the order markers, the own-hero edge arrow. */
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { aimFor } from '../../src/input/abilities';
import { CURSOR_FILL, CURSOR_KINDS, cursorCss, cursorKind, cursorPx } from '../../src/input/cursor';
import { DesktopInput, type InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import { cursorSize, resetControlPrefs, setCursorSize } from '../../src/input/presets';
import { project } from '../../src/input/screen';
import { QUICK_UNIT_AIM, QUICK_UNIT_SEEK, cursorCast, hoverTarget, type Unit } from '../../src/input/targeting';
import { HOVER_COLOR, MARKER_COLOR, MARKER_LIFE, hoverRingSize, markerSize } from '../../src/render/gameView';
import { RELATION } from '../../src/render/palette';
import { HERO_RING } from '../../src/render/views/models';
import { SELF_RING_SCALE } from '../../src/render/views/heroView';
import { edgeArrow, offScreen } from '../../src/ui/overhead';
import type { Command } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number, state: Unit['state'] = 'idle'): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state });

beforeEach(() => {
  localStorage.clear();
  resetControlPrefs();
});

describe('cursor kinds and art', () => {
  it('aiming beats attack-move beats the hover', () => {
    expect(cursorKind({ aiming: true, attackArmed: true, hover: 'enemy' })).toBe('aim');
    expect(cursorKind({ aiming: false, attackArmed: true, hover: 'enemy' })).toBe('attackMove');
    expect(cursorKind({ aiming: false, attackArmed: false, hover: 'enemy' })).toBe('enemy');
    expect(cursorKind({ aiming: false, attackArmed: false, hover: 'ally' })).toBe('ally');
    expect(cursorKind({ aiming: false, attackArmed: false, hover: null })).toBe('normal');
  });
  it('every kind is its own SVG cursor with a hotspot and a stock fallback; enemy is red, ally is not', () => {
    const all = CURSOR_KINDS.map((k) => cursorCss(k));
    expect(new Set(all).size).toBe(CURSOR_KINDS.length);
    for (const v of all) expect(v).toMatch(/^url\("data:image\/svg\+xml,.+"\) \d+ \d+, (default|crosshair|pointer)$/);
    expect(cursorCss('normal')).toMatch(/\) 4 3, default$/);
    expect(cursorCss('aim')).toMatch(/\) 16 16, crosshair$/);
    expect(CURSOR_FILL.enemy).toBe('#ff3b4d');
    expect(CURSOR_FILL.ally).not.toBe(CURSOR_FILL.enemy);
    expect(decodeURIComponent(cursorCss('enemy'))).toContain(CURSOR_FILL.enemy);
    // a dark ink outline and a white halo on every kind
    for (const k of CURSOR_KINDS) {
      const svg = decodeURIComponent(cursorCss(k));
      expect(svg).toContain('#1d1018');
      expect(svg).toContain('#ffffff');
    }
  });
  it('Large is 48 px with the hotspot scaled, and the value is cached', () => {
    expect(cursorPx('normal')).toBe(32);
    expect(cursorPx('large')).toBe(48);
    const l = cursorCss('aim', 'large');
    expect(decodeURIComponent(l)).toContain('width="48"');
    expect(l).toMatch(/\) 24 24, crosshair$/);
    expect(cursorCss('aim', 'large')).toBe(l);
  });
  it('the cursor size setting persists', () => {
    expect(cursorSize()).toBe('normal');
    setCursorSize('large');
    resetControlPrefs();
    expect(cursorSize()).toBe('large');
  });
});

describe('hoverTarget (what a click or cast hits)', () => {
  const me = unit(0, 'hero', 0, 10000, 10000);
  const foe = unit(4, 'hero', 1, 14000, 10000);
  const foeMinion = unit(10, 'minion', 1, 12000, 12000);
  const allyHero = unit(1, 'hero', 0, 9000, 9000);
  const units = [me, foe, foeMinion, allyHero];
  it('the enemy under the cursor, then an ally; never the own hero or the dead', () => {
    expect(hoverTarget(null, me, null, foeMinion, allyHero, units, 0)).toEqual({ id: 10, rel: 'enemy' });
    expect(hoverTarget(null, me, null, null, allyHero, units, 0)).toEqual({ id: 1, rel: 'ally' });
    expect(hoverTarget(null, me, null, null, me, units, 0)).toBeNull();
    expect(hoverTarget(null, me, null, unit(4, 'hero', 1, 0, 0, 'dead'), null, units, 0)).toBeNull();
    expect(hoverTarget(null, me, null, null, null, units, 0)).toBeNull();
  });
  it('aiming a unit ability: the hero cursorCast picks (under it, else the nearest within the seek radius)', () => {
    const aim = aimFor('brutus', 3);
    expect(aim.kind).toBe('unit');
    expect(hoverTarget(aim, me, { x: 14500, y: 10000 }, null, null, units, 0)).toEqual({ id: 4, rel: 'enemy' });
    expect(hoverTarget(aim, me, { x: 14000 + QUICK_UNIT_SEEK + 500, y: 10000 }, null, null, units, 0)).toBeNull();
    expect(hoverTarget(aim, me, { x: 30000, y: 30000 }, foe, null, units, 0)).toEqual({ id: 4, rel: 'enemy' });
  });
  it('no aim: a minion under the cursor next to an enemy hero rings the minion, and castId names the hero a unit quick cast hits', () => {
    const cursor = { x: 12000, y: 12000 };
    const h = hoverTarget(null, me, cursor, foeMinion, null, units, 0);
    const q = cursorCast(QUICK_UNIT_AIM, me, cursor, foeMinion, units, 0, false);
    expect(q?.id).toBe(4);
    expect(h).toEqual({ id: 10, rel: 'enemy', castId: 4 });
    expect(h?.id).not.toBe(q?.id);
    // a tower with no enemy hero within the seek radius: the red ring, no quick-cast ring (a unit Q is refused there)
    const tower = unit(20, 'tower', 1, 40000, 40000);
    expect(hoverTarget(null, me, { x: 40000, y: 40000 }, tower, null, [...units, tower], 0)).toEqual({ id: 20, rel: 'enemy' });
    expect(hoverTarget(null, me, { x: 40000, y: 40000 }, tower, null, [...units, tower], 0)?.castId).toBeUndefined();
    // the enemy hero itself under the cursor: one ring, no castId
    expect(hoverTarget(null, me, { x: 14000, y: 10000 }, foe, null, units, 0)).toEqual({ id: 4, rel: 'enemy' });
    expect(hoverTarget(null, me, { x: 14000, y: 10000 }, foe, null, units, 0)?.castId).toBeUndefined();
    // an ally under the cursor next to an enemy hero: the mint ring plus the quick-cast ring
    expect(hoverTarget(null, me, { x: 13000, y: 10000 }, null, allyHero, units, 0)).toEqual({ id: 1, rel: 'ally', castId: 4 });
    // a hero with no unit-target ability: no quick-cast ring
    expect(hoverTarget(null, me, cursor, foeMinion, null, units, 0, false)?.castId).toBeUndefined();
  });
  it('aiming a ground or direction ability: no ring (the reticle shows the spot)', () => {
    expect(hoverTarget(aimFor('clem', 0), me, { x: 14000, y: 10000 }, foe, null, units, 0)).toBeNull();
  });
});

describe('order markers, rings, edge arrow', () => {
  it('a marker lands big, snaps in, shrinks away and ends', () => {
    expect(markerSize(0)).toBeCloseTo(2.8);
    expect(markerSize(MARKER_LIFE * 0.25)).toBeCloseTo(1.4);
    expect(markerSize(MARKER_LIFE * 0.99)).toBeGreaterThan(0.3);
    expect(markerSize(MARKER_LIFE)).toBe(0);
    expect(markerSize(-1)).toBe(0);
    for (let t = MARKER_LIFE * 0.25; t < MARKER_LIFE - 0.01; t += 0.02) expect(markerSize(t + 0.02)).toBeLessThanOrEqual(markerSize(t));
    expect(MARKER_COLOR.attack).toBe(RELATION.danger);
    expect(MARKER_COLOR.move).not.toBe(MARKER_COLOR.attack);
  });
  it('hover and own rings sit outside the relation ring', () => {
    expect(hoverRingSize('hero', 'brutus')).toBeGreaterThan(HERO_RING.brutus * SELF_RING_SCALE);
    expect(hoverRingSize('minion', null)).toBeGreaterThan(1);
    expect(hoverRingSize('fountain', null)).toBe(0);
    expect(HOVER_COLOR.enemy).toBe(RELATION.danger);
  });
  it('edge arrow: on the inset edge toward the point, below the HUD band', () => {
    const r = edgeArrow(2000, 300, 800, 600, 20)!;
    expect(r.x).toBeCloseTo(780);
    expect(r.y).toBeCloseTo(300);
    expect(r.a).toBeCloseTo(0);
    const up = edgeArrow(400, -1000, 800, 600, 20, 100)!;
    expect(up.x).toBeCloseTo(400);
    expect(up.y).toBe(120);
    expect(up.a).toBeCloseTo(-Math.PI / 2);
    const corner = edgeArrow(-400, 1500, 800, 600, 20)!;
    expect(corner.y).toBeCloseTo(580);
    expect(corner.x).toBeGreaterThan(20);
    expect(edgeArrow(400, 300, 800, 600, 20)).toBeNull();
    expect(offScreen(-1, 10, 800, 600)).toBe(true);
    expect(offScreen(400, 601, 800, 600)).toBe(true);
    expect(offScreen(400, 300, 800, 600)).toBe(false);
  });
});

describe('DesktopInput hover and cursor', () => {
  function rig(units: Unit[]) {
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
    const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero: 'brutus', trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => 5, nowMs: () => 0 };
    const view = { gr: { camera: cam }, myTeam: 0, mySlot: 0, aim: null as unknown, hover: null as unknown, juice: { banner() {} }, recentre() {}, panBy() {}, zoomTarget: 1 };
    const host: InputHost = { canvas, view: view as unknown as InputHost['view'], orders: new Orders(env), enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} };
    const d = new DesktopInput(host);
    const point = (x: number, y: number): void => {
      const p = project(cam, canvas, x / 1000, 0, -y / 1000);
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, pointerType: 'mouse' }));
    };
    const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    return { d, view, canvas, point, key };
  }
  it('over an enemy: the red cursor and the view ring; over an ally: the ally cursor; A armed: the crosshair', () => {
    const r = rig([unit(0, 'hero', 0, 20000, 10000), unit(4, 'hero', 1, 26000, 10000), unit(11, 'minion', 0, 14000, 14000)]);
    r.point(26000, 10000);
    r.d.update(0.016);
    expect(r.d.hover).toEqual({ id: 4, rel: 'enemy' });
    expect(r.view.hover).toEqual({ id: 4, rel: 'enemy' });
    expect(r.canvas.dataset.cursor).toBe('enemy');
    expect(r.canvas.style.cursor).toContain('data:image/svg+xml');
    r.point(14000, 14000);
    r.d.update(0.1);
    // throttled: the next pick runs on the next window; force it through a key that refreshes
    r.key('keydown', 'KeyA');
    expect(r.canvas.dataset.cursor).toBe('attackMove');
    expect(r.d.hover).toEqual({ id: 11, rel: 'ally' });
    r.key('keydown', 'Escape');
    expect(r.canvas.dataset.cursor).toBe('ally');
    r.point(32000, 4000);
    r.key('keydown', 'KeyA');
    r.key('keydown', 'Escape');
    expect(r.d.hover).toBeNull();
    expect(r.canvas.dataset.cursor).toBe('normal');
    r.d.dispose();
    expect(r.canvas.dataset.cursor).toBeUndefined();
  });
});
