/**
 * Desktop controls (POC.md §9, `moba` preset): RMB move/attack (hold to keep steering), A + LMB attack-move, S stop,
 * Q/W/E/R and D cast on key release (the default): holding the key shows the skill's range ring around the hero, its
 * shape at the cursor and the basic attack range ring; release casts at the cursor, LMB while holding casts too, RMB
 * or Esc cancels, another skill key switches the aim, out of range walks in, then casts. Settings "Quick cast" casts at
 * the cursor on the press instead (a brief indicator flash). An armed A shows the attack range ring too. B Nap, 1/2
 * talent pick, Space centres the camera, wheel and +/− zoom, Tab scoreboard, Esc menu; edge pan and arrow keys move the
 * camera. Trackpad mode (On, or Auto once a player left-clicks the ground and never right-clicks): LMB moves and
 * attacks like RMB, hold to steer; an armed A still takes the next LMB. While Auto watches (no right-click yet), LMB
 * moves and attacks too. GAPS B1: hold G for the ping wheel at the cursor (point at a slice, release G to send it);
 * Alt-click pings Focus on an enemy hero, or Go here on the ground.
 */
import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import type { GameView } from '../render/gameView';
import { PING_KIND } from '../data/pings';
import { NO_TARGET, type TalentTier } from '../sim/api';
import type { CastIndex, Orders } from './orders';
import { cursorCss, cursorKind, type CursorKind } from './cursor';
import { actionFor, castMode, cursorSize, markTrackpadDetected, trackpadAutoRule, trackpadOn, trackpadPref, type Action, type CastMode } from './presets';
import { saveZoom, stepZoom, wheelZoom, zoomMax } from '../render/camera/zoom';
import { groundAt, project, toSimX, toSimY } from './screen';
import { cursorCast, hoverTarget, pickNearest, isEnemy, type HoverTarget, type Unit } from './targeting';
import { landing } from './heading';

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
  /** Audit CF-12: a refused cast: its HUD slot flashes red (the deny sound plays here). */
  onDeny?(slot: CastIndex): void;
  /** GAPS B1: the ping wheel (desktop: hold G), and a ping to send (PING_KIND, point in mm, target id or 255). */
  pingWheel?: { openAt(x: number, y: number): void; aim(x: number, y: number): void; commit(): void; close(): void; readonly open: boolean };
  ping?(kind: number, x: number, y: number, id: number): void;
  /** The own hero in the newest snapshot (mm) and its tick, ahead of the drawn one; null before the first. */
  simMe?(): { x: number; y: number; tick: number } | null;
}

const CAST_ACTIONS: Partial<Record<Action, CastIndex>> = { q: 0, w: 1, e: 2, r: 3, trick: 4 };
const EDGE_PX = 10;
const EDGE_SPEED = 28;
const STEER_MS = 140;
/** Quick cast: the indicator flashes this long at the cast point. */
const FLASH_MS = 220;
/** The hover pick (screen projection of every unit) runs at most this often; the ring follows its unit every frame. */
const HOVER_MS = 50;
export const TRACKPAD_TOAST = 'Trackpad mode: click to move';

export class DesktopInput {
  private cursor = { x: -1, y: -1, inside: false };
  private aiming: { slot: CastIndex; code: string } | null = null;
  private attackArmed = false;
  /** The button held down to keep steering (2 RMB, 0 LMB in trackpad mode), or -1. */
  private steerButton = -1;
  private readonly mode: CastMode = castMode();
  /** A slot whose range the HUD asked to preview (hovering its button), shown while nothing is aimed; or null. */
  private preview: CastIndex | null = null;
  /** The HUD's portrait card asked for the attack range ring (hovering the portrait). */
  private previewAtk = false;
  /** The attack range ring this input asked for last (written to the view only on change, so touch can share it). */
  private ringOn = false;
  private trackpad = trackpadOn();
  /** Auto trackpad watch (this match): play time, left-clicks on the ground, any right-button press. */
  private auto = { on: trackpadPref() === 'auto' && !trackpadOn(), playMs: 0, groundClicks: 0, rightPressed: false };
  private flashUntil = 0;
  private lastSteer = 0;
  private keys = new Set<string>();
  private readonly ground = new THREE.Vector3();
  private off: (() => void)[] = [];
  /** Tests: how many casts the desktop input asked for. */
  casts = 0;
  /** What the cursor hovers (the unit a click or cast would hit), or null; GameView rings it. */
  hover: HoverTarget | null = null;
  /** The cursor kind on the canvas now (e2e reads `data-cursor`). */
  cursorKindNow: CursorKind | '' = '';
  private cursorCssNow = '';
  private hoverAt = 0;

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
    this.h.view.hover = null;
    if (this.ringOn) this.h.view.attackRange = false;
    this.h.canvas.style.cursor = '';
    delete this.h.canvas.dataset.cursor;
  }

  private groundUnderCursor(): THREE.Vector3 | null {
    if (this.cursor.x < 0) return null;
    return groundAt(this.h.view.gr.camera, this.h.canvas, this.cursor.x, this.cursor.y, this.ground);
  }

  private unitUnderCursor(enemiesOnly: boolean, alliesOnly = false): Unit | null {
    const cam = this.h.view.gr.camera;
    const v = this.h.view;
    const units = this.h.units().filter(
      (u) =>
        u.state !== 'dead' &&
        u.kind !== 'fountain' &&
        u.kind !== 'pickup' &&
        (!enemiesOnly || isEnemy(u, v.myTeam)) &&
        (!alliesOnly || (u.team === v.myTeam && u.id !== v.mySlot && (u.kind === 'hero' || u.kind === 'minion'))),
    );
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
    if (e.altKey && (e.button === 0 || e.button === 2) && this.h.ping) {
      this.altPing();
      return;
    }
    if (e.button === 2) {
      if (this.auto.on) {
        this.auto.rightPressed = true;
        this.autoCheck();
      }
      if (this.aiming) {
        this.cancelAim();
        return;
      }
      this.attackArmed = false;
      this.syncRing();
      this.steerButton = 2;
      this.rightClick();
      return;
    }
    if (e.button === 0) {
      if (this.aiming) {
        this.release(this.aiming.code, true);
        return;
      }
      const watching = !this.attackArmed && !this.trackpad && this.auto.on;
      if (watching && !this.unitUnderCursor(true) && this.groundUnderCursor()) {
        this.auto.groundClicks++;
        this.autoCheck();
      }
      // While Auto watches, left-click already moves and attacks (the tip says "Click or right-click"), so a trackpad
      // player's first clicks are not ignored; the first right-click ends the watch and left-click goes quiet again.
      if (!this.attackArmed && (this.trackpad || watching)) {
        this.steerButton = 0;
        this.rightClick();
        return;
      }
      if (this.attackArmed) {
        this.attackArmed = false;
        this.syncRing();
        this.refreshCursor();
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
      this.steerButton = -1;
      return;
    }
    const g = this.groundUnderCursor();
    if (!g) return;
    this.h.orders.move(toSimX(g.x), toSimY(g.z));
    this.h.marker(g.x, g.z, false);
    this.lastSteer = performance.now();
  }

  /** GAPS B1 Alt-click: Focus on the enemy hero under the cursor, else Go here on the ground. */
  private altPing(): void {
    const u = this.unitUnderCursor(true);
    if (u && u.kind === 'hero') {
      this.h.ping?.(PING_KIND.Focus, u.x, u.y, u.id);
      return;
    }
    const g = this.groundUnderCursor();
    if (g) this.h.ping?.(PING_KIND.GoHere, toSimX(g.x), toSimY(g.z), NO_TARGET);
  }

  private up(e: PointerEvent): void {
    if (e.button === this.steerButton) this.steerButton = -1;
  }

  /** Auto trackpad: switch on (with a one-time toast) or stop watching, per trackpadAutoRule. */
  private autoCheck(): void {
    if (!this.auto.on) return;
    const r = trackpadAutoRule(this.auto);
    if (r === 'wait') return;
    this.auto.on = false;
    if (r !== 'switch') return;
    this.trackpad = true;
    markTrackpadDetected();
    this.h.view.juice?.banner({ title: TRACKPAD_TOAST, tone: 'info' });
  }

  /** The tips' pad mode: true trackpad mode, false a mouse, null while Auto still watches (both buttons work). */
  get padMode(): boolean | null {
    return this.trackpad ? true : this.auto.on ? null : false;
  }

  /** Is left-click moving (trackpad mode on, by choice or by Auto)? */
  get trackpadMode(): boolean {
    return this.trackpad;
  }

  private moveCursor(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.cursor.x = e.clientX;
    this.cursor.y = e.clientY;
    this.cursor.inside = true;
    if (this.h.pingWheel?.open) this.h.pingWheel.aim(e.clientX, e.clientY);
  }

  private blur(): void {
    this.h.pingWheel?.close();
    this.keys.clear();
    this.steerButton = -1;
    this.cancelAim();
    this.attackArmed = false;
    this.syncRing();
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
    if (a === 'scoreboard' || a === 'centre' || a === 'menu' || a === 'zoomIn' || a === 'zoomOut') e.preventDefault();
    this.h.onActivity('key');
    sfx.unlock();
    // +/− zoom like a wheel notch; a held key repeats
    if (a === 'zoomIn' || a === 'zoomOut') {
      const v = this.h.view;
      v.zoomTarget = stepZoom(v.zoomTarget, a === 'zoomOut' ? 1 : -1, zoomMax(window.innerWidth));
      saveZoom(v.zoomTarget);
      return;
    }
    if (e.repeat) return;
    if (a === 'menu') {
      if (this.aiming || this.attackArmed) {
        this.cancelAim();
        this.attackArmed = false;
        this.syncRing();
        this.refreshCursor();
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
    if (a === 'ping') {
      const wheel = this.h.pingWheel;
      if (!wheel) return;
      const inside = this.cursor.inside && this.cursor.x >= 0;
      wheel.openAt(inside ? this.cursor.x : window.innerWidth / 2, inside ? this.cursor.y : window.innerHeight / 2);
      return;
    }
    const slot = CAST_ACTIONS[a];
    if (slot !== undefined) {
      // C2: the same cast buffer as touch: a key within a few ticks of the cooldown (or mid-dash) is kept, not denied
      if (!this.h.orders.canQueue(slot)) {
        this.deny(slot);
        return;
      }
      // the flash (Pounce) is always a quick cast on the key press: no aim step, no wait for the key to come up
      if (this.mode === 'quick' || this.h.orders.aimSpec(slot).flash) {
        this.quickCast(slot);
        return;
      }
      // hold: aim until the key comes up (another skill key while aiming switches the aim to that skill)
      this.flashUntil = 0;
      this.aiming = { slot, code: e.code };
      this.updateAim();
      this.syncRing();
      this.refreshCursor();
      return;
    }
    switch (a) {
      case 'attackMove':
        this.attackArmed = true;
        this.syncRing();
        this.refreshCursor();
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
    if (a === 'ping' && this.h.pingWheel?.open) this.h.pingWheel.commit();
    if (this.aiming && this.aiming.code === e.code) this.release(e.code, false);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const v = this.h.view;
    v.zoomTarget = wheelZoom(v.zoomTarget, e.deltaY, e.deltaMode, zoomMax(window.innerWidth));
    saveZoom(v.zoomTarget);
  }

  private cancelAim(): void {
    const was = !!this.aiming;
    this.aiming = null;
    this.h.view.aim = null;
    this.syncRing();
    if (was) this.refreshCursor();
  }

  /** The attack range ring: on while A is armed, a skill is aimed or the portrait card is up (and the input is live). */
  private syncRing(): void {
    const on = this.h.enabled() && (this.attackArmed || !!this.aiming || this.previewAtk);
    if (on === this.ringOn) return;
    this.ringOn = on;
    this.h.view.attackRange = on;
  }

  /** Is a skill being aimed (a key held in Cast on release)? Tests and the HUD. */
  get aimingSlot(): CastIndex | null {
    return this.aiming?.slot ?? null;
  }

  /** Is A armed (the next LMB attack-moves)? */
  get attackMoveArmed(): boolean {
    return this.attackArmed;
  }

  /**
   * Preview `slot`'s range and shape without casting (the HUD's ability tooltip, while the pointer rests on the
   * button): the skill's range ring around the hero and its shape along the hero's facing, until `null` clears it. A
   * held key's aim wins over the preview.
   */
  previewSlot(slot: CastIndex | null): void {
    if (slot === this.preview) return;
    this.preview = slot;
    if (!this.aiming && this.flashUntil === 0) this.h.view.aim = null;
    this.updatePreview();
  }

  /** Show the basic attack range ring while the HUD's portrait card is up (`on`), without arming A. */
  previewAttack(on: boolean): void {
    this.previewAtk = on;
    this.syncRing();
  }

  private updatePreview(): void {
    const slot = this.preview;
    if (slot === null || this.aiming || this.flashUntil > 0 || !this.h.enabled()) return;
    const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
    if (!me || me.state === 'dead') return;
    const spec = this.h.orders.aimSpec(slot);
    const yaw = this.h.view.me?.()?.yaw ?? 0;
    if (spec.heading) {
      // a heading blink or dash goes its full distance: show where it lands along the facing (not 0.6 × range)
      const l = landing(spec, me, yaw);
      this.h.view.aim = { spec, x: l.x / 1000, z: -l.y / 1000, target: -1, valid: true };
      return;
    }
    const d = spec.kind === 'point' || spec.kind === 'unit' ? spec.range * 0.6 : spec.range;
    this.h.view.aim = { spec, x: (me.x + Math.cos(yaw) * d) / 1000, z: -(me.y + Math.sin(yaw) * d) / 1000, target: -1, valid: true };
  }

  /** Release (or LMB) while aiming: cast at the cursor. */
  private release(code: string, byClick: boolean): void {
    const a = this.aiming;
    if (!a || a.code !== code) return;
    this.aiming = null;
    this.h.view.aim = null;
    this.syncRing();
    this.refreshCursor();
    if (!this.h.enabled()) return;
    this.castAtCursor(a.slot, false);
    void byClick;
  }

  /** Quick cast: at the cursor right away (ground points pulled in to the range), with a short indicator flash. */
  private quickCast(slot: CastIndex): void {
    const c = this.castAtCursor(slot, true);
    if (!c) return;
    const spec = this.h.orders.aimSpec(slot);
    // the flash (Pounce): the indicator marks where it lands (its command point is past the range, heading.ts)
    const me = spec.flash ? this.h.units().find((u) => u.id === this.h.view.mySlot) : undefined;
    const p = me ? landing(spec, me, Math.atan2(c.y - me.y, c.x - me.x)) : c;
    this.h.view.aim = { spec, x: p.x / 1000, z: -p.y / 1000, target: c.id === NO_TARGET ? -1 : c.id, valid: true, pointer: true };
    this.flashUntil = performance.now() + FLASH_MS;
  }

  /** A refused cast: the deny sound and (CF-12) the HUD slot's red flash. */
  private deny(slot: CastIndex): void {
    sfx.play('deny', { vol: 0.6 });
    this.h.onDeny?.(slot);
  }

  /** Cast `slot` at the cursor (cursorCast); a unit aim with no enemy hero there is refused with the deny sound. */
  private castAtCursor(slot: CastIndex, clamp: boolean): { x: number; y: number; id: number } | null {
    const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
    if (!me) return null;
    const spec = this.h.orders.aimSpec(slot);
    const g = this.groundUnderCursor();
    const cursor = g ? { x: toSimX(g.x), y: toSimY(g.z) } : null;
    const c = cursorCast(spec, me, cursor, spec.kind === 'unit' ? this.unitUnderCursor(true) : null, this.h.units(), this.h.view.myTeam, clamp, this.h.view.me?.()?.yaw ?? 0);
    if (!c) {
      this.deny(slot);
      return null;
    }
    if (!this.h.orders.cast(slot, c.x, c.y, c.id)) {
      this.deny(slot);
      return null;
    }
    this.casts++;
    return c;
  }

  private static readonly CASTS: readonly CastIndex[] = [0, 1, 2, 3, 4];

  /** Whether any cast slot (Q W E R or the trick) is a unit-target ability: the hover's quick-cast ring needs one. */
  private hasUnitCast(): boolean {
    for (const s of DesktopInput.CASTS) if (this.h.orders.aimSpec(s).kind === 'unit') return true;
    return false;
  }

  private nearestEnemyHeroToGround(g: THREE.Vector3 | null): Unit | null {
    if (!g) return null;
    const cursor = { x: toSimX(g.x), y: toSimY(g.z) };
    const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
    if (!me) return null;
    const c = cursorCast({ kind: 'unit', shape: 'none', range: 0, smart: 'hero' }, me, cursor, null, this.h.units(), this.h.view.myTeam, false);
    return c ? (this.h.units().find((u) => u.id === c.id) ?? null) : null;
  }

  private updateAim(): void {
    const a = this.aiming;
    if (!a) return;
    const spec = this.h.orders.aimSpec(a.slot);
    const g = this.groundUnderCursor();
    const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
    if (!me) return;
    let gx = g ? g.x : me.x / 1000 + 1;
    let gz = g ? g.z : -me.y / 1000;
    if (spec.flash) {
      // the flash always goes its full distance toward the cursor: show where it lands
      const p = landing(spec, me, Math.atan2(toSimY(gz) - me.y, toSimX(gx) - me.x));
      gx = p.x / 1000;
      gz = -p.y / 1000;
    }
    let valid = true;
    let target = -1;
    if (spec.kind === 'unit') {
      const under = this.unitUnderCursor(true);
      const u = under?.kind === 'hero' ? under : this.nearestEnemyHeroToGround(g);
      valid = !!u;
      target = u?.id ?? -1;
    }
    this.h.view.aim = { spec, x: gx, z: gz, target, valid, pointer: true };
  }

  /**
   * The hover read (throttled to HOVER_MS, or now with `force`) and the canvas cursor (written only on change).
   * Disabled input (menus, talent card, results): the plain cursor and no ring.
   */
  private refreshCursor(force = true): void {
    const now = performance.now();
    if (!force && now - this.hoverAt < HOVER_MS) return;
    this.hoverAt = now;
    let hover: HoverTarget | null = null;
    const on = this.h.enabled();
    if (on && this.cursor.x >= 0) {
      const me = this.h.units().find((u) => u.id === this.h.view.mySlot);
      if (me && me.state !== 'dead') {
        const aim = this.aiming ? this.h.orders.aimSpec(this.aiming.slot) : null;
        const g = this.groundUnderCursor();
        const cursor = g ? { x: toSimX(g.x), y: toSimY(g.z) } : null;
        const enemy = this.unitUnderCursor(true);
        const ally = aim || enemy ? null : this.unitUnderCursor(false, true);
        hover = hoverTarget(aim, me, cursor, enemy, ally, this.h.units(), this.h.view.myTeam, this.hasUnitCast());
      }
    }
    this.hover = hover;
    this.h.view.hover = hover;
    const kind = on ? cursorKind({ aiming: !!this.aiming, attackArmed: this.attackArmed, hover: hover?.rel ?? null }) : 'normal';
    const css = cursorCss(kind, cursorSize());
    const c = this.h.canvas;
    if (css !== this.cursorCssNow) {
      this.cursorCssNow = css;
      c.style.cursor = css;
    }
    if (kind !== this.cursorKindNow) {
      this.cursorKindNow = kind;
      c.dataset.cursor = kind;
    }
  }

  /** Per frame: aim preview, hover and cursor, RMB steering, camera pan. */
  update(dt: number): void {
    if (!this.h.enabled()) {
      if (this.aiming || this.flashUntil > 0 || this.preview !== null) this.cancelAim();
      this.flashUntil = 0;
      this.syncRing();
      if (this.hover || this.cursorKindNow !== 'normal') this.refreshCursor();
      return;
    }
    this.refreshCursor(false);
    if (this.auto.on) {
      this.auto.playMs += dt * 1000;
      this.autoCheck();
    }
    if (!this.aiming && this.flashUntil > 0 && performance.now() > this.flashUntil) {
      this.flashUntil = 0;
      this.h.view.aim = null;
    }
    this.updateAim();
    this.updatePreview();
    this.syncRing();
    if (this.steerButton >= 0 && performance.now() - this.lastSteer > STEER_MS) {
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
