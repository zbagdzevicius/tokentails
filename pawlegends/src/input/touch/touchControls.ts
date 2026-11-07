/**
 * Touch cluster (POC.md §9, landscape): a floating joystick on the left; on the right an Attack button with
 * auto-target (enemy hero in range, then the lowest-HP minion, then a tower), Q/W/E on an arc and a larger R, plus
 * Trick and Nap. Tap smart-casts; holding a skill button still shows its range ring and the smart aim before the
 * release casts; drag aims (the indicator follows the thumb); dragging onto the ✕ cancels. While Attack is held or a
 * skill is aimed, the hero's basic attack range ring shows too (range from hero data, so every ranged hero reads right).
 * The joystick sends `move` to a point 2 m ahead when its direction turns by more than 1/32 turn, at most every
 * 3 ticks (and again before the hero reaches that point, so a held stick keeps walking).
 *
 * GAPS A5: a tap on an enemy hero (on the field, or its portrait in the HUD strip) locks it for 5 s (assist.ts
 * TargetLock); while locked, Attack sends Attack{id} on it and smart casts aim at it when it is within their reach.
 * Settings "Target first" picks the Attack button's order; the optional last-hit and tower buttons are off by default.
 *
 * Heading casts (heading.ts: Pounce, Live Wire and the escape dashes): the PRESS fires, the full distance where the
 * player is heading (the held joystick, else the hero's movement, else the way it last walked, else its facing). No
 * aim step, no wait for the release, no cancel: the joystick is the aim (founder: "there can't be any friction"). A
 * ghost marker shows the landing for GHOST_MS. With the joystick held, the run goes on from the landing at once and
 * the stick keeps steering from there (never from the drawn hero still short of it) until the sim shows the cast.
 */
import { sfx } from '../../audio/sfx';
import { abilityRank, maxRank } from '../../sim/heroes/talents';
import { rankPips } from '../../ui/heroText';
import { cdLabel } from '../../ui/cdLabel';
import { RELATION_CSS } from '../../render/palette';
import type { DesktopInput, InputHost } from '../desktop';
import { basicRange, minionHitEstimate } from '../abilities';
import { slideAngle, type CastIndex } from '../orders';
import { lastHitButton, targetFirst, towerButton, type TargetFirst } from '../presets';
import { project } from '../screen';
import { attackPriority, BODY_MM, guardedByTower, lastHitTarget, nearestEnemy, pickNearest, smartAim, towerTarget, type Unit } from '../targeting';
import { ASSIST, autoAttackTarget, edgeGoal, laneMagnet, lockable, magnetOn, TargetLock } from './assist';
import { bannerNote } from '../../render/juice';
import { headingAngle, headingPoint, landing, MotionHeading, MOVE_ORDER_MS, ReturnWindow } from '../heading';
import { TICK_HZ } from '../../data/timeline';
import type { SimEvent } from '../../sim/api';

/** Absolute angle between two directions (rad), 0..π. */
export function turnBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/**
 * `stallMs`: a held stick whose hero stands (its move was dropped by the sim's input gate, or ran out) sends its move
 * again after this long, so the hero never freezes with the thumb on the stick.
 */
export const STICK = Object.freeze({ radius: 60, dead: 12, aheadMm: 2000, turn: (Math.PI * 2) / 32, everyMs: 100, refreshMm: 1000, stallMs: 300 });
const DRAG_PX = 16;
const DRAG_FULL_PX = 90;
/**
 * Fun pass (playtest #1): a drag that slides back within this many px of where it started is "back to smart aim"
 * (MLBB's inner ring): the release casts like a tap, at the smart target, and the preview shows that aim. Before, any
 * leftover 1 px offset picked the direction, so a 2 px wobble fired a line or dash the wrong way at full range.
 */
export const AIM_BACK_PX = 24;
const ATTACK_REPEAT_MS = 350;
/** C9: Nap goes after the button is held this long (ms), so a stray thumb never sends the hero home. */
export const NAP_HOLD_MS = 300;
/** C5: the "nothing in reach" tip shows this many times on a device, then only the red ring flashes. */
const ATK_TIP_MAX = 2;
const ATK_TIP_KEY = 'pawlegends.atkNoneTips';
/** A skill button held this long (ms) without a drag shows its range and smart aim (CAST.hold; a tap stays a tap). */
const HOLD_PREVIEW_MS = 200;
/** The idle auto-attack measures edge to edge with this slack (mm), like the Attack button (C13). */
const AUTO_SLACK = 300;
/** A canvas touch that ends within this time (ms) and travel (px) is a tap (GAPS A5: tap an enemy hero to lock it). */
export const TAP = Object.freeze({ ms: 320, px: 14, pickPx: 48 });
/** How long (ms) the ghost landing marker of a tapped heading cast shows (no delay: the cast goes first). */
export const GHOST_MS = 150;
/** After a heading cast with the joystick held, the stick steers from the landing at most this long (ms) before the sim shows it. */
export const BLINK_GUARD_MS = 600;

type ButtonId = 'attack' | 'q' | 'w' | 'e' | 'r' | 'trick' | 'nap' | 'lasthit' | 'tower';
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
  /** When the button went down (ms, performance.now). */
  at: number;
  /** A heading cast: the press sent it, the release only lets the button go. */
  fired?: boolean;
}

export class TouchControls {
  readonly root: HTMLElement;
  /** `moved`: the thumb passed the dead zone; `at`: when it went down (C4: a short still tap never sends Stop). */
  private stick: { id: number; bx: number; by: number; x: number; y: number; moved: boolean; at: number } | null = null;
  /** C9: the Nap button held since (ms), and whether it already fired. */
  private napHeld: { id: number; at: number; fired: boolean } | null = null;
  /** C5: Attack presses with nothing in reach (e2e telemetry). */
  atkNone = 0;
  private atkTipsLeft = ((): number => {
    try {
      return Math.max(0, ATK_TIP_MAX - Number(localStorage.getItem(ATK_TIP_KEY) ?? 0));
    } catch {
      return ATK_TIP_MAX;
    }
  })();
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  private cancelEl: HTMLElement;
  private buttons = new Map<ButtonId, HTMLElement>();
  private drags = new Map<number, Drag>();
  private lastStick = { a: NaN, at: 0, tx: 0, ty: 0 };
  private attackHeld: number | null = null;
  private lastAttack = 0;
  /** The attack range ring this input asked for last (written to the view only on change, so desktop can share it). */
  private ringOn = false;
  private enabled = false;
  private off: (() => void)[] = [];
  /** GAPS A5: the tapped enemy hero (5 s, 9 m), the Attack order (Settings), the canvas touch that may be a tap. */
  readonly lock = new TargetLock();
  private readonly first: TargetFirst = targetFirst();
  private tap: { id: number; x: number; y: number; at: number } | null = null;
  /** Locks set (e2e telemetry). */
  locks = 0;
  /** The hero's movement direction (heading casts with no joystick). */
  private readonly motion = new MotionHeading();
  /** The ghost landing marker of the last heading cast shows until (ms, performance.now), or 0. */
  private ghostUntil = 0;
  /**
   * A heading cast that went out while the joystick steers: its landing (mm), its slot, until when (ms) at most, and
   * the sim tick it showed up in (null until the raw events show it). Until the sim's position includes it, the stick
   * steers from the landing (the sim and the drawn hero still have the hero where it was).
   */
  private runOn: { x: number; y: number; slot: CastIndex; until: number; tick: number | null } | null = null;
  /** Avietė's Live Wire return window (heading.ts ReturnWindow). */
  private readonly wire = new ReturnWindow();
  /** Heading presses that sent (or buffered) a cast, and heading casts that went out (e2e telemetry). */
  heads = { press: 0, fired: 0 };
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
        <button class="pl-tbtn q" data-b="q" aria-label="Q"><b class="ico"></b><i class="cd"></i><span></span><i class="rk"></i></button>
        <button class="pl-tbtn w" data-b="w" aria-label="W"><b class="ico"></b><i class="cd"></i><span></span><i class="rk"></i></button>
        <button class="pl-tbtn e" data-b="e" aria-label="E"><b class="ico"></b><i class="cd"></i><span></span><i class="rk"></i></button>
        <button class="pl-tbtn r" data-b="r" aria-label="R"><b class="ico"></b><i class="cd"></i><span></span><i class="rk"></i></button>
        <button class="pl-tbtn trick" data-b="trick" aria-label="Paw Trick"><b class="ico"></b><i class="cd"></i><span></span></button>
        <button class="pl-tbtn nap" data-b="nap" aria-label="Nap"><span>Nap</span></button>
        ${lastHitButton() ? '<button class="pl-tbtn lasthit" data-b="lasthit" aria-label="Last hit a minion"><span>LH</span></button>' : ''}
        ${towerButton() ? '<button class="pl-tbtn tower" data-b="tower" aria-label="Attack a tower"><span>TWR</span></button>' : ''}
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
    // every heading cast that goes out (the press, the cast buffer, a retry) shows its landing and runs on from it
    h.orders.onFire = (slot, x, y) => this.fired(slot, x, y);
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
    if (this.ringOn) this.h.view.attackRange = false;
  }

  /** The attack range ring: on while Attack is held or a skill button is down (and the input is live). */
  private syncRing(): void {
    const on = this.h.enabled() && (this.attackHeld !== null || this.drags.size > 0);
    if (on === this.ringOn) return;
    this.ringOn = on;
    this.h.view.attackRange = on;
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
    // event time stamps, not handler time: a slow frame between the two handlers must not turn a tap into a hold
    this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
    if (e.clientX < window.innerWidth * 0.5 && !this.stick) {
      e.preventDefault();
      this.stick = { id: e.pointerId, bx: e.clientX, by: e.clientY, x: e.clientX, y: e.clientY, moved: false, at: e.timeStamp };
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
      this.syncRing();
      return;
    }
    if (btn === 'nap') {
      // C9: a 300 ms hold (the fill ring shows it), not a tap
      this.napHeld = { id: e.pointerId, at: performance.now(), fired: false };
      el.classList.add('holding');
      return;
    }
    if (btn === 'lasthit' || btn === 'tower') {
      this.extraButton(btn, el);
      return;
    }
    const slot = SLOT_OF[btn];
    if (slot === undefined) return;
    // C2: a press within a few ticks of the cooldown ending goes into the cast buffer instead of a deny
    if (!this.h.orders.canQueue(slot)) {
      this.deny(slot);
      return;
    }
    const g: Drag = { id: e.pointerId, btn, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dragging: false, overCancel: false, at: performance.now() };
    // heading casts fire on the press, stick held or not (no aim step, no wait for the release, no cancel)
    if (this.h.orders.aimSpec(slot).heading) {
      g.fired = true;
      const me = this.me();
      if (me && this.headingCast(slot, me)) this.heads.press++;
    }
    this.drags.set(e.pointerId, g);
    this.syncRing();
  }

  private move(e: PointerEvent): void {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      let dx = e.clientX - this.stick.bx;
      let dy = e.clientY - this.stick.by;
      const d = Math.hypot(dx, dy);
      if (d > STICK.dead) this.stick.moved = true;
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
      const me = this.h.enabled() ? this.me() : null;
      if (me) this.steer(me, performance.now());
      return;
    }
    const g = this.drags.get(e.pointerId);
    if (!g) return;
    g.x = e.clientX;
    g.y = e.clientY;
    if (g.fired) return;
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
    const tp = this.tap;
    if (tp && tp.id === e.pointerId) {
      this.tap = null;
      if (!cancelled && e.timeStamp - tp.at <= TAP.ms && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) <= TAP.px) this.tapAt(tp.x, tp.y);
    }
    if (this.stick && e.pointerId === this.stick.id) {
      const s = this.stick;
      this.stick = null;
      this.stickEl.classList.remove('on');
      // C4: only a real stick release stops the hero; a still tap (locking a hero, a stray touch) keeps its attack going
      if (!cancelled && this.h.enabled() && (s.moved || e.timeStamp - s.at > TAP.ms)) this.h.orders.stop();
      return;
    }
    if (this.napHeld && this.napHeld.id === e.pointerId) {
      this.napHeld = null;
      const nap = this.buttons.get('nap');
      nap?.classList.remove('down', 'holding');
      return;
    }
    if (this.attackHeld === e.pointerId) {
      this.attackHeld = null;
      this.buttons.get('attack')?.classList.remove('down');
      this.syncRing();
      return;
    }
    const g = this.drags.get(e.pointerId);
    if (!g) {
      for (const b of this.buttons.values()) b.classList.remove('down');
      return;
    }
    this.drags.delete(e.pointerId);
    this.syncRing();
    this.buttons.get(g.btn)?.classList.remove('down');
    if (g.fired) return;
    this.cancelEl.classList.remove('on', 'hot');
    this.h.view.aim = null;
    this.ghostUntil = 0;
    if (cancelled || g.overCancel || !this.h.enabled()) return;
    const slot = SLOT_OF[g.btn];
    if (slot === undefined) return;
    const me = this.me();
    if (!me) return;
    if (!g.dragging || this.aimBack(g)) {
      const p = this.tapAim(slot, me);
      this.h.orders.cast(slot, p.x, p.y, p.id);
      return;
    }
    const t = this.dragTarget(g, slot, me);
    if (t) this.h.orders.cast(slot, t.x, t.y, t.id);
  }

  private facing(): number {
    return this.h.view.me()?.yaw ?? 0;
  }

  /** The joystick's direction (rad, sim convention) while it is held past the dead zone, else null. */
  stickAngle(): number | null {
    const s = this.stick;
    if (!s) return null;
    const dx = s.x - s.bx;
    const dy = -(s.y - s.by);
    return Math.hypot(dx, dy) > STICK.dead ? Math.atan2(dy, dx) : null;
  }

  /**
   * Where a tapped (not dragged) skill aims. C7: a dash goes along the held joystick (Hop Back away from it, so it
   * still flees the way the thumb runs), and any other direction skill with no smart target goes along it too;
   * everything else is the smart aim.
   */
  tapAim(slot: CastIndex, me: Unit): { x: number; y: number; id: number } {
    const aim = this.h.orders.aimSpec(slot);
    if (aim.heading) return { ...headingPoint(aim, me, this.heading(me)), id: 0xff };
    const p = smartAim(aim, this.h.units(), me, this.h.view.myTeam, this.facing(), this.lockedId());
    const a = aim.kind === 'dir' ? this.stickAngle() : null;
    if (a === null) return p;
    // smartAim's fallback for a direction is straight ahead along the facing: anything else means it found a target
    const f = this.facing();
    const found = Math.hypot(p.x - (me.x + Math.cos(f) * aim.range), p.y - (me.y + Math.sin(f) * aim.range)) > 1;
    if (aim.shape !== 'dash' && found) return p;
    const k = aim.away ? -1 : 1;
    return { x: me.x + Math.cos(a) * aim.range * k, y: me.y + Math.sin(a) * aim.range * k, id: 0xff };
  }

  /**
   * Where the player is heading (rad, sim convention): the held joystick, else the hero's movement (its drawn track,
   * then a move order it is still walking), else the way it last walked, else its facing (heading.ts).
   */
  heading(me: Unit): number {
    const now = performance.now();
    const lm = this.h.orders.lastMove;
    const walking = me.state === 'moving' && lm !== null && now - lm.at <= MOVE_ORDER_MS;
    return headingAngle(me, { stick: this.stickAngle(), motion: this.motion.angle(now), moveGoal: walking ? lm : null, lastMotion: this.motion.last(), facing: this.facing() });
  }

  /** Where the sim has the own hero (the newest snapshot), else the drawn hero: casts and the stick start from there. */
  private simPos(me: Unit): { x: number; y: number } {
    const s = this.h.simMe?.();
    return s ? { x: s.x, y: s.y } : { x: me.x, y: me.y };
  }

  /**
   * Send a heading cast of `slot` the full distance along the heading, from where the sim has the hero. Returns
   * whether the order went (or was buffered); `fired` shows the landing once it really goes out.
   */
  private headingCast(slot: CastIndex, me: Unit): boolean {
    const spec = this.h.orders.aimSpec(slot);
    const p = headingPoint(spec, this.simPos(me), this.heading(me));
    return this.h.orders.cast(slot, p.x, p.y, 0xff);
  }

  /**
   * A cast or trick command went out (Orders.onFire: the press, the cast buffer or a retry). For a heading cast: the
   * ghost marker at its landing for GHOST_MS (no delay: the order is already sent), and with the joystick held the
   * run goes on from the landing. Live Wire's return lands where the wire started, not ahead.
   */
  private fired(slot: CastIndex, x: number, y: number): void {
    if (!this.enabled) return;
    const spec = this.h.orders.aimSpec(slot);
    if (!spec.heading) return;
    const me = this.me();
    if (!me) return;
    const now = performance.now();
    const o = this.simPos(me);
    const back = spec.returnTicks ? this.wire.point(now) : null;
    const l = back ?? landing(spec, o, Math.atan2(y - o.y, x - o.x));
    this.heads.fired++;
    this.h.view.aim = { spec, x: l.x / 1000, z: -l.y / 1000, target: 0xff, valid: true };
    this.ghostUntil = now + GHOST_MS;
    if (this.stickAngle() !== null) this.runOnFrom(slot, l, now);
  }

  /**
   * After a heading cast with the joystick held: the next move goes on from the landing (sent now; the sim lets a cast
   * win over a move of its tick and applies the move after it), and until the sim shows the cast the stick keeps
   * steering from the landing (turning the stick works at once). Before, the next stick move was aimed from the drawn
   * hero, still short of the landing, and walked the hero back.
   */
  private runOnFrom(slot: CastIndex, l: { x: number; y: number }, now: number): void {
    this.runOn = { x: l.x, y: l.y, slot, until: now + BLINK_GUARD_MS, tick: null };
    this.lastStick.a = NaN;
    this.lastStick.at = 0;
    const me = this.me();
    if (me) this.steer(me, now);
  }

  /**
   * The sim's own events as the host hands them over (before the render clock plays them): a cast of the slot the
   * stick runs on from marks the tick its position includes it; Live Wire and Short Circuit open (or a return closes)
   * the Live Wire return window, from where the sim had her before the blink (the snapshot of the tick before).
   */
  onSimEvent(ev: SimEvent): void {
    if (ev.type !== 'cast' || ev.src !== this.h.view.mySlot) return;
    const r = this.runOn;
    if (r && r.slot === ev.slot && r.tick === null) r.tick = ev.tick;
    const spec = this.h.orders.aimSpec(ev.slot);
    if (!spec.returnTicks && !spec.opensReturn) return;
    const now = performance.now();
    if (spec.returnTicks && this.wire.point(now)) {
      this.wire.close();
      return;
    }
    const me = this.me();
    const s = this.h.simMe?.() ?? me;
    if (!s) return;
    const ticks = spec.returnTicks ?? this.h.orders.aimSpec(2).returnTicks ?? 0;
    // a tick short: the window opened at the cast's tick, a little before this event reached the page
    const tickMs = 1000 / TICK_HZ / Math.max(1, this.h.orders.speed);
    this.wire.open(s.x, s.y, now + (ticks - 1) * tickMs);
  }

  /**
   * Where the stick steers from: the landing of a heading cast still on its way (runOn), else where the sim has the
   * hero. The run-on ends once the snapshot of the cast's tick is in, the cast was given up (refused, expired), or
   * after BLINK_GUARD_MS; the stick then sends its move again at once from where the hero really is.
   */
  private steerFrom(me: Unit, now: number): { x: number; y: number } {
    const r = this.runOn;
    if (r) {
      const sim = this.h.simMe?.();
      const landed = r.tick !== null && !!sim && sim.tick >= r.tick;
      const dropped = r.tick === null && this.h.orders.castState(r.slot) === null;
      const drawn = Math.hypot(me.x - r.x, me.y - r.y) <= 1500;
      if (!landed && !dropped && !drawn && now < r.until) return r;
      this.runOn = null;
      this.lastStick.a = NaN;
      this.lastStick.at = 0;
    }
    return this.simPos(me);
  }

  /** A skill press refused (on cooldown, or the cast buffer ran out): the deny sound and a red flash. */
  deny(slot: CastIndex): void {
    const b = (['q', 'w', 'e', 'r', 'trick'] as const)[slot];
    const el = this.buttons.get(b);
    sfx.play('deny', { vol: 0.6 });
    if (!el) return;
    el.classList.add('deny');
    setTimeout(() => el.classList.remove('deny'), 250);
  }

  /** C3: the hero's own cast resolved: the next frame re-sends the held stick, so the hero walks on at once. */
  onOwnCast(): void {
    this.lastStick.a = NaN;
    this.lastStick.at = 0;
  }

  /** The drag slid back to its start (within AIM_BACK_PX): it aims like a tap. */
  private aimBack(g: Drag): boolean {
    return Math.hypot(g.x - g.x0, g.y - g.y0) < AIM_BACK_PX;
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
    if (this.aimBack(g)) {
      this.previewHold(g);
      return;
    }
    const spec = this.h.orders.aimSpec(slot);
    const t = this.dragTarget(g, slot, me) ?? { x: me.x, y: me.y, id: 0xff };
    this.h.view.aim = { spec, x: t.x / 1000, z: -t.y / 1000, target: t.id, valid: !g.overCancel && (spec.kind !== 'unit' || t.id !== 0xff) };
  }

  /** A held (not dragged) skill button: its range ring and the smart aim a release would cast at. */
  private previewHold(g: Drag): void {
    const slot = SLOT_OF[g.btn];
    const me = this.me();
    if (slot === undefined || !me) return;
    const spec = this.h.orders.aimSpec(slot);
    const p = this.tapAim(slot, me);
    this.h.view.aim = { spec, x: p.x / 1000, z: -p.y / 1000, target: p.id, valid: spec.kind !== 'unit' || p.id !== 0xff };
  }

  /** The last Attack button choice and the enemies it saw (e2e only), and how many there were. */
  lastPick: {
    id: number | null;
    /** GAPS A5: the locked hero the pick took, else null; and the Settings order. */
    lock: number | null;
    first: TargetFirst;
    range: number;
    me: { x: number; y: number };
    seen: { id: number; kind: string; team: number; x: number; y: number; hp: number; maxHp: number }[];
    allyMinions: { x: number; y: number }[];
    /** C5: the minions and camp monsters the next basic would kill (by the client estimate). */
    killable: number[];
  } | null = null;
  picks = 0;

  /** The locked enemy hero while the lock holds (GAPS A5), else null. */
  lockedId(): number | null {
    return this.lock.check(this.h.units(), this.me(), this.h.view.myTeam, performance.now());
  }

  /**
   * Lock enemy hero `id` (a tap on it or its portrait). A second tap on the locked hero lets go. Returns whether a
   * lock is on afterwards; false when `id` is not a living, visible enemy hero within 9 m.
   */
  lockOn(id: number): boolean {
    const me = this.me();
    if (!me || !this.h.enabled()) return false;
    const u = this.h.units().find((q) => q.id === id);
    if (this.lock.id !== id && !lockable(u, me, this.h.view.myTeam)) return false;
    const on = this.lock.set(id, performance.now());
    if (on) {
      this.locks++;
      sfx.play('click', { vol: 0.45, rate: 1.4 });
    }
    return on;
  }

  /** A tap on the field: the enemy hero under it (within TAP.pickPx on screen) is locked. */
  private tapAt(x: number, y: number): void {
    const me = this.me();
    if (!me || !this.h.enabled()) return;
    const team = this.h.view.myTeam;
    const cands = this.h.units().filter((u) => lockable(u, me, team));
    if (!cands.length) return;
    const cam = this.h.view.gr.camera;
    const hit = pickNearest(cands, (u) => project(cam, this.h.canvas, u.x / 1000, 0.6, -u.y / 1000), x, y, TAP.pickPx);
    if (hit) this.lockOn(hit.id);
  }

  /** Attack range (mm) of the player's basic attack, as the Attack button reads it (the hero's data, as the sim does). */
  private range(): number {
    const hero = this.h.view.me()?.hero;
    return hero ? basicRange(hero) : 0;
  }

  /** The optional last-hit / tower button: attack that target, else a short deny flash (never a walk-in). */
  private extraButton(btn: 'lasthit' | 'tower', el: HTMLElement): void {
    const me = this.me();
    if (!me) return;
    const units = this.h.units();
    const id = btn === 'lasthit' ? lastHitTarget(units, me, this.h.view.myTeam, this.range()) : towerTarget(units, me, this.h.view.myTeam, this.range());
    if (id !== null) {
      this.h.orders.attack(id);
      return;
    }
    sfx.play('deny', { vol: 0.6 });
    el.classList.add('deny');
    setTimeout(() => el.classList.remove('deny'), 250);
  }

  private attackNow(): void {
    const me = this.me();
    if (!me) return;
    this.lastAttack = performance.now();
    const range = this.range();
    const units = this.h.units();
    const locked = this.lockedId();
    const hero = this.h.view.me()?.hero;
    const lv = this.h.view.me()?.level ?? 1;
    const toy = this.h.view.me()?.toy ?? 0;
    // C5: the minion the next basic kills first (the last hit), within attack range + 1 m
    const kill = hero ? (u: Unit): number => minionHitEstimate(hero, lv, toy, u) : undefined;
    const id = locked ?? attackPriority(units, me, this.h.view.myTeam, range, 7000, this.first, kill);
    // What the button saw and chose (e2e telemetry for match-touch.spec.ts; nothing reads it in play).
    this.lastPick = {
      id,
      lock: locked,
      first: this.first,
      range,
      me: { x: me.x, y: me.y },
      seen: units.filter((u) => u.id !== me.id && u.team !== this.h.view.myTeam && u.state !== 'dead').map((u) => ({ id: u.id, kind: u.kind, team: u.team, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp })),
      allyMinions: units.filter((u) => u.kind === 'minion' && u.team === this.h.view.myTeam && u.state !== 'dead').map((u) => ({ x: u.x, y: u.y })),
      killable: kill ? units.filter((u) => (u.kind === 'minion' || u.kind === 'camp') && u.team !== this.h.view.myTeam && u.state !== 'dead' && u.hp <= kill(u)).map((u) => u.id) : [],
    };
    this.picks++;
    if (id !== null) {
      this.h.orders.attack(id);
      return;
    }
    // C5: nothing in reach: no walk (the old attack-move walked players under towers), a red ring and, twice, a tip
    this.atkNone++;
    this.h.view.denyRing?.();
    const atk = this.buttons.get('attack');
    if (atk) {
      atk.classList.remove('deny');
      void atk.offsetWidth;
      atk.classList.add('deny');
      setTimeout(() => atk.classList.remove('deny'), 300);
    }
    // fun pass (playtest #11): ATK said "Nothing in reach" next to minions it skips on purpose (under an untanked enemy
    // tower); it now says why, at most every 10 s
    const myTeam = this.h.view.myTeam;
    const guarded = units.some(
      (u) => (u.kind === 'minion' || u.kind === 'hero') && u.team !== myTeam && u.team <= 1 && u.state !== 'dead' && Math.hypot(u.x - me.x, u.y - me.y) <= 7000 && guardedByTower(units, u, myTeam),
    );
    if (guarded) {
      this.h.view.juice?.push({ ...bannerNote({ title: 'Their tower guards it', sub: 'Let your minions walk in first, then tap ATK', tone: 'info', hold: 2.2 }), key: 'atk-tower', cooldown: 10000 });
      return;
    }
    if (this.atkTipsLeft > 0 && this.atkNone === 1) {
      this.atkTipsLeft--;
      try {
        localStorage.setItem(ATK_TIP_KEY, String(ATK_TIP_MAX - this.atkTipsLeft));
      } catch {
        /* private mode: the tip may show again next match */
      }
      this.h.view.juice?.push({ ...bannerNote({ title: 'Nothing in reach', sub: 'Walk closer, then tap ATK', tone: 'info', hold: 2.2 }), key: 'atk-none' });
    }
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
    const range = this.range() + AUTO_SLACK;
    // GAPS A5: a locked hero in range is the idle target too
    const locked = this.lockedId();
    const lu = locked !== null ? this.h.units().find((u) => u.id === locked) : undefined;
    const lockIn = lu && Math.hypot(lu.x - me.x, lu.y - me.y) - BODY_MM.hero <= range ? lu.id : null;
    // C13: edge to edge, like the Attack button (autoAttackTarget subtracts the target's body)
    const id = lockIn ?? autoAttackTarget(this.h.units(), me, this.h.view.myTeam, range);
    if (id === null) return;
    this.autoAt = now;
    this.autos++;
    this.h.orders.attack(id);
  }

  /**
   * The joystick's move order: sent from the frame loop and (C6) straight from the pointer event, so a fresh push does
   * not wait for the next frame. Throttled by STICK.turn / STICK.everyMs as before.
   */
  private steer(me: Unit, now: number): void {
    const s = this.stick;
    if (!s) return;
    // from the landing of a heading cast still on its way, else from where the sim has the hero (the drawn hero
    // trails it, and after a blink it stands at the old spot for a few frames: a goal from there walks back)
    const o = this.steerFrom(me, now);
    const dx = s.x - s.bx;
    const dy = -(s.y - s.by);
    if (Math.hypot(dx, dy) > STICK.dead) {
      // the lane magnet (fun plan F3): close to the lane's direction, walk exactly along it
      // round 2: a push into a wall slides along it (orders.ts slideAngle)
      // C8: only at full tilt (90%+) and with no enemy hero within 8 m, and only within 8° of the lane
      const raw = Math.atan2(dy, dx);
      const tilt = Math.min(1, Math.hypot(dx, dy) / STICK.radius);
      const a = slideAngle(o.x, o.y, magnetOn(tilt, me, this.h.units(), this.h.view.myTeam) ? laneMagnet(o.x, o.y, raw) : raw);
      const turn = Number.isNaN(this.lastStick.a) ? Infinity : turnBetween(a, this.lastStick.a);
      const near = Math.hypot(o.x - this.lastStick.tx, o.y - this.lastStick.ty) < STICK.refreshMm;
      // the hero stands although the stick is held (its move was dropped or ran out): send it again
      const stalled = me.state === 'idle' && !this.runOn && now - this.lastStick.at >= STICK.stallMs;
      if ((turn > STICK.turn || near || stalled) && now - this.lastStick.at >= STICK.everyMs) {
        // the map edge and the enemy fountain stop the stick (null: the hero is already at the edge)
        const goal = edgeGoal(o.x, o.y, o.x + Math.cos(a) * STICK.aheadMm, o.y + Math.sin(a) * STICK.aheadMm, this.h.view.myTeam);
        if (goal) {
          this.lastStick = { a, at: now, tx: goal.x, ty: goal.y };
          this.h.orders.move(goal.x, goal.y);
          this.h.view.recentre();
        } else this.lastStick = { a, at: now, tx: o.x, ty: o.y };
      }
    }
  }

  /** Wave C (C2): the level the rank pips were drawn for (0 = not drawn yet). */
  private pipLevel = 0;

  /** Per frame: joystick commands, attack repeat, cooldown overlays, and (Wave C) the rank pips. */
  update(cooldowns: readonly number[] | null, max: readonly number[], level: number): void {
    if (!this.enabled) return;
    if (level !== this.pipLevel) {
      this.pipLevel = level;
      (['q', 'w', 'e', 'r'] as const).forEach((b, i) => {
        const rk = this.buttons.get(b)?.querySelector('.rk');
        if (rk) rk.innerHTML = rankPips(abilityRank(level, i), maxRank(i));
      });
    }
    void this.desktop;
    const now = performance.now();
    if (this.attackHeld !== null && now - this.lastAttack > ATTACK_REPEAT_MS) this.attackNow();
    const nh = this.napHeld;
    if (nh && !nh.fired && now - nh.at >= NAP_HOLD_MS && this.h.enabled()) {
      nh.fired = true;
      this.buttons.get('nap')?.classList.remove('holding');
      this.h.orders.nap();
    }
    const me = this.me();
    if (me && me.state !== 'dead') this.motion.sample(me.x, me.y, now);
    else {
      this.motion.clear();
      this.wire.close();
      this.runOn = null;
    }
    if (this.ghostUntil > 0 && now >= this.ghostUntil) {
      this.ghostUntil = 0;
      if (![...this.drags.values()].some((g) => !g.fired && g.dragging)) this.h.view.aim = null;
    }
    for (const g of this.drags.values()) if (!g.fired && !g.dragging && now - g.at >= HOLD_PREVIEW_MS && this.h.enabled()) this.previewHold(g);
    this.syncRing();
    const s = this.stick;
    if (s || this.drags.size > 0 || this.attackHeld !== null || this.napHeld) this.inputAt = now;
    else if (me && this.h.enabled()) this.autoAttack(me, now);
    if (s && me && this.h.enabled()) this.steer(me, now);
    const order: ButtonId[] = ['q', 'w', 'e', 'r', 'trick'];
    order.forEach((b, i) => {
      const el = this.buttons.get(b);
      if (!el) return;
      const cd = cooldowns?.[i] ?? 0;
      const locked = b === 'r' && level < 4;
      // LoL pass (lane B): the ready ring flashes once as a cooldown ends
      if (cd === 0 && !locked && el.classList.contains('cooling')) {
        el.classList.remove('cdflash');
        void el.offsetWidth;
        el.classList.add('cdflash');
        setTimeout(() => el.classList.remove('cdflash'), 320);
      }
      el.classList.toggle('locked', locked);
      el.classList.toggle('cooling', cd > 0);
      const f = max[i] > 0 ? Math.min(1, cd / max[i]) : 0;
      el.style.setProperty('--cd', String(f));
      const label = el.querySelector('span');
      // LoL pass (lane B): whole seconds, one decimal under 1 s
      const txt = cdLabel(cd);
      if (label && label.textContent !== txt) label.textContent = txt;
    });
    const atk = this.buttons.get('attack');
    if (atk) atk.style.setProperty('--ring', RELATION_CSS.enemy);
    // GAPS A5: the lock shows as the hover ring on the hero (GameView) and a draining ring on Attack
    const locked = this.lockedId();
    this.h.view.lock = locked;
    if (atk) {
      atk.classList.toggle('locked-on', locked !== null);
      atk.style.setProperty('--lock', this.lock.left(now).toFixed(3));
    }
  }
}
