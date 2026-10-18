/**
 * Touch cluster (POC.md §9, landscape): a floating joystick on the left; on the right an Attack button with
 * auto-target (enemy hero in range, then the lowest-HP minion, then a tower), Q/W/E on an arc and a larger R, plus
 * Trick and Nap. Tap smart-casts; drag aims (the indicator follows the thumb); dragging onto the ✕ cancels.
 * The joystick sends `move` to a point 2 m ahead when its direction turns by more than 1/32 turn, at most every
 * 3 ticks (and again before the hero reaches that point, so a held stick keeps walking).
 */
import { sfx } from '../../audio/sfx';
import { RELATION_CSS } from '../../render/palette';
import type { DesktopInput, InputHost } from '../desktop';
import { slideAngle, type CastIndex } from '../orders';
import { attackPriority, nearestEnemy, smartAim, type Unit } from '../targeting';
import { ASSIST, autoAttackTarget, edgeGoal, laneMagnet } from './assist';

/** Absolute angle between two directions (rad), 0..π. */
export function turnBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

export const STICK = Object.freeze({ radius: 60, dead: 12, aheadMm: 2000, turn: (Math.PI * 2) / 32, everyMs: 100, refreshMm: 1000 });
const DRAG_PX = 16;
const DRAG_FULL_PX = 90;
const ATTACK_REPEAT_MS = 350;

type ButtonId = 'attack' | 'q' | 'w' | 'e' | 'r' | 'trick' | 'nap';
const SLOT_OF: Partial<Record<ButtonId, CastIndex>> = { q: 0, w: 1, e: 2, r: 3, trick: 4 };

interface Drag {
  id: number;
  btn: ButtonId;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragging: boolean;
  overCancel: boolean;
}

export class TouchControls {
  readonly root: HTMLElement;
  private stick: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  private cancelEl: HTMLElement;
  private buttons = new Map<ButtonId, HTMLElement>();
  private drags = new Map<number, Drag>();
  private lastStick = { a: NaN, at: 0, tx: 0, ty: 0 };
  private attackHeld: number | null = null;
  private lastAttack = 0;
  private enabled = false;
  private off: (() => void)[] = [];
  /** Put an icon (inline SVG markup) on each ability button: q, w, e, r, trick. */
  setIcons(icons: Record<'q' | 'w' | 'e' | 'r' | 'trick', string>): void {
    for (const [k, svg] of Object.entries(icons)) {
      const el = this.buttons.get(k as ButtonId)?.querySelector('.ico');
      if (el) el.innerHTML = svg;
    }
  }

  constructor(
    private readonly h: InputHost,
    parent: HTMLElement,
    private readonly desktop: DesktopInput | null = null,
  ) {
    const root = document.createElement('div');
    root.className = 'pl-touch';
    root.innerHTML = `
      <div class="pl-stick"><div class="pl-knob"></div></div>
      <div class="pl-cancel" aria-label="Cancel">✕</div>
      <div class="pl-tcluster">
        <button class="pl-tbtn attack" data-b="attack" aria-label="Attack"><span>ATK</span></button>
        <button class="pl-tbtn q" data-b="q" aria-label="Q"><b class="ico"></b><i class="cd"></i><span></span></button>
        <button class="pl-tbtn w" data-b="w" aria-label="W"><b class="ico"></b><i class="cd"></i><span></span></button>
        <button class="pl-tbtn e" data-b="e" aria-label="E"><b class="ico"></b><i class="cd"></i><span></span></button>
        <button class="pl-tbtn r" data-b="r" aria-label="R"><b class="ico"></b><i class="cd"></i><span></span></button>
        <button class="pl-tbtn trick" data-b="trick" aria-label="Paw Trick"><b class="ico"></b><i class="cd"></i><span></span></button>
        <button class="pl-tbtn nap" data-b="nap" aria-label="Nap"><span>Nap</span></button>
      </div>`;
    parent.appendChild(root);
    this.root = root;
    this.stickEl = root.querySelector('.pl-stick') as HTMLElement;
    this.knobEl = root.querySelector('.pl-knob') as HTMLElement;
    this.cancelEl = root.querySelector('.pl-cancel') as HTMLElement;
    for (const b of root.querySelectorAll<HTMLElement>('.pl-tbtn')) this.buttons.set(b.dataset.b as ButtonId, b);
    const on = (t: EventTarget, type: string, fn: (e: PointerEvent) => void): void => {
      t.addEventListener(type, fn as EventListener, { passive: false });
      this.off.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(root, 'pointerdown', (e) => this.down(e));
    on(window, 'pointermove', (e) => this.move(e));
    on(window, 'pointerup', (e) => this.up(e));
    on(window, 'pointercancel', (e) => this.up(e, true));
    on(h.canvas, 'pointerdown', (e) => this.canvasDown(e));
  }

  enable(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('on', on);
    document.documentElement.dataset.touch = on ? '1' : '';
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    for (const f of this.off) f();
    this.root.remove();
    this.h.view.aim = null;
  }

  private me(): Unit | null {
    return this.h.units().find((u) => u.id === this.h.view.mySlot) ?? null;
  }

  /** Touches on the bare canvas: the left side starts the joystick. */
  private canvasDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.inputAt = performance.now();
    if (!this.enabled) this.enable(true);
    this.h.onActivity('touch');
    sfx.unlock();
    if (!this.h.enabled()) return;
    if (e.clientX < window.innerWidth * 0.5 && !this.stick) {
      e.preventDefault();
      this.stick = { id: e.pointerId, bx: e.clientX, by: e.clientY, x: e.clientX, y: e.clientY };
      this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stickEl.classList.add('on');
      this.knobEl.style.transform = 'translate(-50%, -50%)';
      this.lastStick.a = NaN;
    }
  }

  private down(e: PointerEvent): void {
    const el = (e.target as HTMLElement).closest('.pl-tbtn') as HTMLElement | null;
    if (!el) return;
    this.inputAt = performance.now();
    e.preventDefault();
    e.stopPropagation();
    this.h.onActivity('touch');
    sfx.unlock();
    if (!this.h.enabled()) return;
    const btn = el.dataset.b as ButtonId;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic pointers */
    }
    el.classList.add('down');
    if (btn === 'attack') {
      this.attackHeld = e.pointerId;
      this.attackNow();
      return;
    }
    if (btn === 'nap') {
      this.h.orders.nap();
      return;
    }
    const slot = SLOT_OF[btn];
    if (slot === undefined) return;
    if (!this.h.orders.ready(slot)) {
      sfx.play('deny', { vol: 0.6 });
      el.classList.add('deny');
      setTimeout(() => el.classList.remove('deny'), 250);
      return;
    }
    this.drags.set(e.pointerId, { id: e.pointerId, btn, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dragging: false, overCancel: false });
  }

  private move(e: PointerEvent): void {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      let dx = e.clientX - this.stick.bx;
      let dy = e.clientY - this.stick.by;
      const d = Math.hypot(dx, dy);
      if (d > STICK.radius) {
        // the base follows a thumb that runs past the ring
        const k = (d - STICK.radius) / d;
        this.stick.bx += dx * k;
        this.stick.by += dy * k;
        this.stickEl.style.transform = `translate(${this.stick.bx}px, ${this.stick.by}px)`;
        dx = e.clientX - this.stick.bx;
        dy = e.clientY - this.stick.by;
      }
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      return;
    }
    const g = this.drags.get(e.pointerId);
    if (!g) return;
    g.x = e.clientX;
    g.y = e.clientY;
    if (!g.dragging && Math.hypot(g.x - g.x0, g.y - g.y0) > DRAG_PX) {
      g.dragging = true;
      this.cancelEl.classList.add('on');
    }
    if (g.dragging) {
      const r = this.cancelEl.getBoundingClientRect();
      g.overCancel = g.x >= r.left - 12 && g.x <= r.right + 12 && g.y >= r.top - 12 && g.y <= r.bottom + 12;
      this.cancelEl.classList.toggle('hot', g.overCancel);
      this.preview(g);
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.stickEl.classList.remove('on');
      if (!cancelled && this.h.enabled()) this.h.orders.stop();
      return;
    }
    if (this.attackHeld === e.pointerId) {
      this.attackHeld = null;
      this.buttons.get('attack')?.classList.remove('down');
      return;
    }
    const g = this.drags.get(e.pointerId);
    if (!g) {
      for (const b of this.buttons.values()) b.classList.remove('down');
      return;
    }
    this.drags.delete(e.pointerId);
    this.buttons.get(g.btn)?.classList.remove('down');
    this.cancelEl.classList.remove('on', 'hot');
    this.h.view.aim = null;
    if (cancelled || g.overCancel || !this.h.enabled()) return;
    const slot = SLOT_OF[g.btn];
    if (slot === undefined) return;
    const me = this.me();
    if (!me) return;
    if (!g.dragging) {
      const aim = this.h.orders.aimSpec(slot);
      const p = smartAim(aim, this.h.units(), me, this.h.view.myTeam, this.facing());
      this.h.orders.cast(slot, p.x, p.y, p.id);
      return;
    }
    const t = this.dragTarget(g, slot, me);
    if (t) this.h.orders.cast(slot, t.x, t.y, t.id);
  }

  private facing(): number {
    return this.h.view.me()?.yaw ?? 0;
  }

  /** World aim point (mm) of a drag from its button. */
  private dragTarget(g: Drag, slot: CastIndex, me: Unit): { x: number; y: number; id: number } | null {
    const aim = this.h.orders.aimSpec(slot);
    const dx = g.x - g.x0;
    const dy = -(g.y - g.y0);
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const k = aim.kind === 'point' || aim.kind === 'unit' ? Math.min(1, len / DRAG_FULL_PX) : 1;
    const x = me.x + (dx / len) * aim.range * k;
    const y = me.y + (dy / len) * aim.range * k;
    if (aim.kind === 'unit') {
      const pt: Unit = { ...me, id: -1, x, y };
      const u = nearestEnemy(this.h.units(), pt, this.h.view.myTeam, 3000, true);
      return u ? { x: u.x, y: u.y, id: u.id } : null;
    }
    return { x, y, id: 0xff };
  }

  private preview(g: Drag): void {
    const slot = SLOT_OF[g.btn];
    const me = this.me();
    if (slot === undefined || !me) return;
    const spec = this.h.orders.aimSpec(slot);
    const t = this.dragTarget(g, slot, me) ?? { x: me.x, y: me.y, id: 0xff };
    this.h.view.aim = { spec, x: t.x / 1000, z: -t.y / 1000, target: t.id, valid: !g.overCancel && (spec.kind !== 'unit' || t.id !== 0xff) };
  }

  /** The last Attack button choice and the enemies it saw (e2e only), and how many there were. */
  lastPick: {
    id: number | null;
    range: number;
    me: { x: number; y: number };
    seen: { id: number; kind: string; team: number; x: number; y: number; hp: number; maxHp: number }[];
    allyMinions: { x: number; y: number }[];
  } | null = null;
  picks = 0;

  private attackNow(): void {
    const me = this.me();
    if (!me) return;
    this.lastAttack = performance.now();
    const range = this.h.view.me()?.hero === 'sage' ? 6000 : 1600;
    const units = this.h.units();
    const id = attackPriority(units, me, this.h.view.myTeam, range);
    // What the button saw and chose (e2e telemetry for match-touch.spec.ts; nothing reads it in play).
    this.lastPick = {
      id,
      range,
      me: { x: me.x, y: me.y },
      seen: units.filter((u) => u.id !== me.id && u.team !== this.h.view.myTeam && u.state !== 'dead').map((u) => ({ id: u.id, kind: u.kind, team: u.team, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp })),
      allyMinions: units.filter((u) => u.kind === 'minion' && u.team === this.h.view.myTeam && u.state !== 'dead').map((u) => ({ x: u.x, y: u.y })),
    };
    this.picks++;
    if (id !== null) this.h.orders.attack(id);
    else this.h.orders.attackMove(me.x + Math.cos(this.facing()) * 3000, me.y + Math.sin(this.facing()) * 3000);
  }

  /** Last touch input (ms) and the last auto-attack order. */
  private inputAt = 0;
  private autoAt = 0;
  /** Auto-attacks sent (e2e telemetry). */
  autos = 0;

  /**
   * Standing still with no input for 0.6 s attacks the nearest enemy minion in range, then a hero (fun plan F3), so
   * a thumb resting off the screen still fights. Never walks the hero anywhere: in range only.
   */
  private autoAttack(me: Unit, now: number): void {
    if (now - this.inputAt < ASSIST.idleMs || now - this.autoAt < 900) return;
    if (me.state !== 'idle') return;
    const range = this.h.view.me()?.hero === 'sage' ? 6000 : 1800;
    const id = autoAttackTarget(this.h.units(), me, this.h.view.myTeam, range);
    if (id === null) return;
    this.autoAt = now;
    this.autos++;
    this.h.orders.attack(id);
  }

  /** Per frame: joystick commands, attack repeat, cooldown overlays. */
  update(cooldowns: readonly number[] | null, max: readonly number[], level: number): void {
    if (!this.enabled) return;
    void this.desktop;
    const now = performance.now();
    if (this.attackHeld !== null && now - this.lastAttack > ATTACK_REPEAT_MS) this.attackNow();
    const s = this.stick;
    const me = this.me();
    if (s || this.drags.size > 0 || this.attackHeld !== null) this.inputAt = now;
    else if (me && this.h.enabled()) this.autoAttack(me, now);
    if (s && me && this.h.enabled()) {
      const dx = s.x - s.bx;
      const dy = -(s.y - s.by);
      if (Math.hypot(dx, dy) > STICK.dead) {
        // the lane magnet (fun plan F3): close to the lane's direction, walk exactly along it
        // round 2: a push into a wall slides along it (orders.ts slideAngle)
        const a = slideAngle(me.x, me.y, laneMagnet(me.x, me.y, Math.atan2(dy, dx)));
        const turn = Number.isNaN(this.lastStick.a) ? Infinity : turnBetween(a, this.lastStick.a);
        const near = Math.hypot(me.x - this.lastStick.tx, me.y - this.lastStick.ty) < STICK.refreshMm;
        if ((turn > STICK.turn || near) && now - this.lastStick.at >= STICK.everyMs) {
          // the map edge and the enemy fountain stop the stick (null: the hero is already at the edge)
          const goal = edgeGoal(me.x, me.y, me.x + Math.cos(a) * STICK.aheadMm, me.y + Math.sin(a) * STICK.aheadMm, this.h.view.myTeam);
          if (goal) {
            this.lastStick = { a, at: now, tx: goal.x, ty: goal.y };
            this.h.orders.move(goal.x, goal.y);
            this.h.view.recentre();
          } else this.lastStick = { a, at: now, tx: me.x, ty: me.y };
        }
      }
    }
    const order: ButtonId[] = ['q', 'w', 'e', 'r', 'trick'];
    order.forEach((b, i) => {
      const el = this.buttons.get(b);
      if (!el) return;
      const cd = cooldowns?.[i] ?? 0;
      const locked = b === 'r' && level < 4;
      el.classList.toggle('locked', locked);
      el.classList.toggle('cooling', cd > 0);
      const f = max[i] > 0 ? Math.min(1, cd / max[i]) : 0;
      el.style.setProperty('--cd', String(f));
      const label = el.querySelector('span');
      const txt = cd > 0 ? String(Math.ceil(cd / 30)) : '';
      if (label && label.textContent !== txt) label.textContent = txt;
    });
    const atk = this.buttons.get('attack');
    if (atk) atk.style.setProperty('--ring', RELATION_CSS.enemy);
  }
}
