/**
 * L-UI: pure gesture recognizer (no DOM), so tap / hold / double tap / drag / pinch are testable.
 * SPEC.md "Interactions": movement over 8 px makes it a drag; a hold is ≥ 350 ms without moving;
 * a second tap within 300 ms (and close to the first) is a double tap.
 */
export const DRAG_PX = 8;
export const HOLD_MS = 350;
export const DOUBLE_MS = 300;
export const DOUBLE_PX = 40;

export type GestureAction =
  | { type: 'press'; x: number; y: number }
  | { type: 'tap'; x: number; y: number }
  | { type: 'doubleTap'; x: number; y: number }
  | { type: 'holdStart'; x: number; y: number }
  | { type: 'holdEnd' }
  | { type: 'drag'; dx: number; dy: number }
  | { type: 'dragEnd' }
  | { type: 'pinch'; delta: number };

interface Pointer {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

export class GestureRecognizer {
  private pointers = new Map<number, Pointer>();
  private downAt = 0;
  private dragging = false;
  private holding = false;
  private pinchDist = 0;
  /** True once a second finger touched in this gesture: no tap/hold on release. */
  private multi = false;
  private lastTap: { t: number; x: number; y: number } | null = null;

  get isHolding() {
    return this.holding;
  }

  get active() {
    return this.pointers.size > 0;
  }

  down(id: number, x: number, y: number, t: number): GestureAction[] {
    this.pointers.set(id, { x, y, sx: x, sy: y });
    const out: GestureAction[] = [];
    if (this.pointers.size === 1) {
      this.downAt = t;
      this.dragging = false;
      this.multi = false;
      out.push({ type: 'press', x, y });
    } else {
      this.multi = true;
      if (this.holding) {
        this.holding = false;
        out.push({ type: 'holdEnd' });
      }
      this.pinchDist = this.spread();
    }
    return out;
  }

  move(id: number, x: number, y: number): GestureAction[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (this.pointers.size >= 2) {
      const d = this.spread();
      const delta = d - this.pinchDist;
      this.pinchDist = d;
      this.dragging = true;
      return delta ? [{ type: 'pinch', delta }] : [];
    }
    if (!this.dragging && Math.hypot(x - p.sx, y - p.sy) > DRAG_PX) {
      this.dragging = true;
      // A hold that already started keeps building while the finger drifts; it is not a drag.
      if (this.holding) return [];
      return [{ type: 'drag', dx: x - p.sx, dy: y - p.sy }];
    }
    if (this.dragging && !this.holding) return [{ type: 'drag', dx, dy }];
    return [];
  }

  /** Call ~HOLD_MS after a press (a timer) and every frame; fires holdStart once. */
  poll(t: number): GestureAction[] {
    if (this.pointers.size !== 1 || this.dragging || this.holding || this.multi) return [];
    if (t - this.downAt < HOLD_MS) return [];
    this.holding = true;
    const p = [...this.pointers.values()][0];
    return [{ type: 'holdStart', x: p.x, y: p.y }];
  }

  up(id: number, t: number): GestureAction[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    this.pointers.delete(id);
    if (this.pointers.size > 0) {
      this.pinchDist = this.spread();
      return [];
    }
    const out: GestureAction[] = [];
    if (this.holding) {
      this.holding = false;
      out.push({ type: 'holdEnd' });
    } else if (this.dragging) {
      out.push({ type: 'dragEnd' });
    } else if (!this.multi && t - this.downAt < HOLD_MS) {
      const last = this.lastTap;
      if (last && t - last.t <= DOUBLE_MS && Math.hypot(p.x - last.x, p.y - last.y) <= DOUBLE_PX) {
        this.lastTap = null;
        out.push({ type: 'doubleTap', x: p.x, y: p.y });
      } else {
        this.lastTap = { t, x: p.x, y: p.y };
        out.push({ type: 'tap', x: p.x, y: p.y });
      }
    }
    this.dragging = false;
    this.multi = false;
    return out;
  }

  cancel(id: number): GestureAction[] {
    if (!this.pointers.has(id)) return [];
    this.pointers.delete(id);
    if (this.pointers.size > 0) return [];
    const out: GestureAction[] = [];
    if (this.holding) out.push({ type: 'holdEnd' });
    else if (this.dragging) out.push({ type: 'dragEnd' });
    this.holding = false;
    this.dragging = false;
    this.multi = false;
    return out;
  }

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
