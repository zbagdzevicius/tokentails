/**
 * Desktop controls (POC.md §9, `moba` preset): RMB move/attack (hold to keep steering), A + LMB attack-move, S stop,
 * Q/W/E/R and D: press shows the indicator, release casts at the cursor (LMB while holding casts too, RMB or Esc
 * cancels; out of range walks in, then casts), B Nap, 1/2 talent pick, Space centres the camera, wheel zooms, Tab
 * scoreboard, Esc menu; edge pan and arrow keys move the camera.
 */
import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import type { GameView } from '../render/gameView';
import { NO_TARGET, type TalentTier } from '../sim/api';
import type { CastIndex, Orders } from './orders';
import { actionFor, type Action } from './presets';
import { saveZoom, wheelZoom, zoomMax } from '../render/camera/zoom';
import { groundAt, project, toSimX, toSimY } from './screen';
import { isEnemy, pickNearest, type Unit } from './targeting';

export interface InputHost {
  canvas: HTMLElement;
  view: GameView;
  orders: Orders;
  /** False while a menu, the talent card or the results screen owns the input. */
  enabled(): boolean;
  units(): Unit[];
  onScoreboard(show: boolean): void;
  onMenu(): void;
  /** A talent choice key; returns true when a talent card was open and took it. */
  onTalent(choice: 0 | 1): boolean;
  onActivity(kind: 'pointer' | 'key' | 'touch'): void;
  /** Ground order marker (m). */
  marker(x: number, z: number, attack: boolean): void;
}

const CAST_ACTIONS: Partial<Record<Action, CastIndex>> = { q: 0, w: 1, e: 2, r: 3, trick: 4 };
const EDGE_PX = 10;
const EDGE_SPEED = 28;
const STEER_MS = 140;

export class DesktopInput {
  private cursor = { x: -1, y: -1, inside: false };
  private aiming: { slot: CastIndex; code: string } | null = null;
  private attackArmed = false;
  private rmbHeld = false;
  private lastSteer = 0;
  private keys = new Set<string>();
  private readonly ground = new THREE.Vector3();
  private off: (() => void)[] = [];
  /** Tests: how many casts the desktop input asked for. */
  casts = 0;

  constructor(private readonly h: InputHost) {
    const c = h.canvas;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void => {
      t.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(c, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(c, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(window, 'pointerup', (e: PointerEvent) => this.up(e));
    on(window, 'pointermove', (e: PointerEvent) => this.moveCursor(e));
    on(document, 'pointerleave', () => (this.cursor.inside = false));
    on(window, 'blur', () => this.blur());
    on(window, 'keydown', (e: KeyboardEvent) => this.keyDown(e));
    on(window, 'keyup', (e: KeyboardEvent) => this.keyUp(e));
    on(c, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false });
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.h.view.aim = null;
  }

  private groundUnderCursor(): THREE.Vector3 | null {
    if (this.cursor.x < 0) return null;
    return groundAt(this.h.view.gr.camera, this.h.canvas, this.cursor.x, this.cursor.y, this.ground);
  }

  private unitUnderCursor(enemiesOnly: boolean): Unit | null {
    const cam = this.h.view.gr.camera;
    const units = this.h.units().filter((u) => u.state !== 'dead' && u.kind !== 'fountain' && u.kind !== 'pickup' && (!enemiesOnly || isEnemy(u, this.h.view.myTeam)));
    const lift = (u: Unit): number => (u.kind === 'tower' ? 2.5 : u.kind === 'core' ? 2.5 : u.kind === 'pudding' ? 1.5 : 0.6);
    return pickNearest(units, (u) => project(cam, this.h.canvas, u.x / 1000, lift(u), -u.y / 1000), this.cursor.x, this.cursor.y, 44);
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.h.onActivity('pointer');
    sfx.unlock();
    if (!this.h.enabled()) return;
    this.cursor.x = e.clientX;
    this.cursor.y = e.clientY;
    if (e.button === 2) {
      if (this.aiming) {
        this.cancelAim();
        return;
      }
      this.attackArmed = false;
      this.rmbHeld = true;
      this.rightClick();
      return;
    }
    if (e.button === 0) {
      if (this.aiming) {
        this.release(this.aiming.code, true);
        return;
      }
      if (this.attackArmed) {
        this.attackArmed = false;
        this.h.canvas.dataset.cursor = '';
        const u = this.unitUnderCursor(true);
        if (u) {
          this.h.orders.attack(u.id);
          this.h.marker(u.x / 1000, -u.y / 1000, true);
        } else {
          const g = this.groundUnderCursor();
          if (!g) return;
          this.h.orders.attackMove(toSimX(g.x), toSimY(g.z));
          this.h.marker(g.x, g.z, true);
        }
      }
    }
  }

  private rightClick(): void {
    const u = this.unitUnderCursor(true);
    if (u) {
      this.h.orders.attack(u.id);
      this.h.marker(u.x / 1000, -u.y / 1000, true);
      this.rmbHeld = false;
      return;
    }
    const g = this.groundUnderCursor();
    if (!g) return;
    this.h.orders.move(toSimX(g.x), toSimY(g.z));
    this.h.marker(g.x, g.z, false);
    this.lastSteer = performance.now();
  }

  private up(e: PointerEvent): void {
    if (e.button === 2) this.rmbHeld = false;
  }

  private moveCursor(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.cursor.x = e.clientX;
    this.cursor.y = e.clientY;
    this.cursor.inside = true;
  }

  private blur(): void {
    this.keys.clear();
    this.rmbHeld = false;
    this.cancelAim();
    this.h.onScoreboard(false);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = actionFor(e.code);
    if (e.code.startsWith('Arrow')) {
      this.keys.add(e.code);
      e.preventDefault();
      return;
    }
    if (!a) return;
    if (a === 'scoreboard' || a === 'centre' || a === 'menu') e.preventDefault();
    this.h.onActivity('key');
    sfx.unlock();
    if (e.repeat) return;
    if (a === 'menu') {
      if (this.aiming || this.attackArmed) {
        this.cancelAim();
        this.attackArmed = false;
        this.h.canvas.dataset.cursor = '';
        return;
      }
      this.h.onMenu();
      return;
    }
    if (a === 'scoreboard') {
      this.h.onScoreboard(true);
      return;
    }
    if (a === 'talent1' || a === 'talent2') {
      this.h.onTalent(a === 'talent1' ? 0 : 1);
      return;
    }
    if (!this.h.enabled()) return;
    const slot = CAST_ACTIONS[a];
    if (slot !== undefined) {
      if (!this.h.orders.ready(slot)) {
        sfx.play('deny', { vol: 0.6 });
        return;
      }
      this.aiming = { slot, code: e.code };
      this.updateAim();
      return;
    }
    switch (a) {
      case 'attackMove':
        this.attackArmed = true;
        this.h.canvas.dataset.cursor = 'attack';
        break;
      case 'stop':
        this.h.orders.stop();
        break;
      case 'nap':
        this.h.orders.nap();
        break;
      case 'centre':
        this.keys.add('Space');
        this.h.view.recentre();
        break;
      default:
        break;
    }
  }

  private keyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    const a = actionFor(e.code);
    if (a === 'scoreboard') this.h.onScoreboard(false);
    if (this.aiming && this.aiming.code === e.code) this.release(e.code, false);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const v = this.h.view;
    v.zoomTarget = wheelZoom(v.zoomTarget, e.deltaY, e.deltaMode, zoomMax(window.innerWidth));
    saveZoom(v.zoomTarget);
  }

  private cancelAim(): void {
    this.aiming = null;
    this.h.view.aim = null;
  }

  /** Release (or LMB) while aiming: cast at the cursor. */
  private release(code: string, byClick: boolean): void {
    const a = this.aiming;
    if (!a || a.code !== code) return;
    this.aiming = null;
    this.h.view.aim = null;
    if (!this.h.enabled()) return;
    const spec = this.h.orders.aimSpec(a.slot);
    const g = this.groundUnderCursor();
    const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
    if (!me) return;
    let x = g ? toSimX(g.x) : me.x;
    let y = g ? toSimY(g.z) : me.y;
    let id = NO_TARGET;
    if (spec.kind === 'unit') {
      const u = this.unitUnderCursor(true) ?? this.nearestEnemyHeroToGround(g);
      if (!u || u.kind !== 'hero') {
        sfx.play('deny', { vol: 0.6 });
        return;
      }
      id = u.id;
      x = u.x;
      y = u.y;
    }
    if (this.h.orders.cast(a.slot, x, y, id)) this.casts++;
    void byClick;
  }

  private nearestEnemyHeroToGround(g: THREE.Vector3 | null): Unit | null {
    if (!g) return null;
    let best: Unit | null = null;
    let bd = 3000;
    for (const u of this.h.units()) {
      if (u.kind !== 'hero' || !isEnemy(u, this.h.view.myTeam)) continue;
      const d = Math.hypot(u.x - g.x * 1000, u.y + g.z * 1000);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  private updateAim(): void {
    const a = this.aiming;
    if (!a) return;
    const spec = this.h.orders.aimSpec(a.slot);
    const g = this.groundUnderCursor();
    const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
    if (!me) return;
    const gx = g ? g.x : me.x / 1000 + 1;
    const gz = g ? g.z : -me.y / 1000;
    let valid = true;
    let target = -1;
    if (spec.kind === 'unit') {
      const u = this.unitUnderCursor(true) ?? this.nearestEnemyHeroToGround(g);
      valid = !!u && u.kind === 'hero';
      target = u?.id ?? -1;
    }
    this.h.view.aim = { spec, x: gx, z: gz, target, valid };
  }

  /** Per frame: aim preview, RMB steering, camera pan. */
  update(dt: number): void {
    if (!this.h.enabled()) {
      if (this.aiming) this.cancelAim();
      return;
    }
    this.updateAim();
    if (this.rmbHeld && performance.now() - this.lastSteer > STEER_MS) {
      this.lastSteer = performance.now();
      const g = this.groundUnderCursor();
      if (g) this.h.orders.move(toSimX(g.x), toSimY(g.z));
    }
    let px = 0;
    let pz = 0;
    if (this.keys.has('ArrowLeft')) px -= 1;
    if (this.keys.has('ArrowRight')) px += 1;
    if (this.keys.has('ArrowUp')) pz -= 1;
    if (this.keys.has('ArrowDown')) pz += 1;
    if (this.cursor.inside && this.cursor.x >= 0 && document.hasFocus()) {
      const w = window.innerWidth;
      const hh = window.innerHeight;
      if (this.cursor.x <= EDGE_PX) px -= 1;
      if (this.cursor.x >= w - EDGE_PX) px += 1;
      if (this.cursor.y <= EDGE_PX) pz -= 1;
      if (this.cursor.y >= hh - EDGE_PX) pz += 1;
    }
    if (this.keys.has('Space')) this.h.view.recentre();
    else if (px !== 0 || pz !== 0) this.h.view.panBy(px * EDGE_SPEED * dt, pz * EDGE_SPEED * dt);
  }

  /** Talent picks also come from the HUD buttons; exposed for tests. */
  talent(tier: TalentTier, choice: 0 | 1): void {
    this.h.orders.talent(tier, choice);
  }
}
