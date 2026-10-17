/**
 * L-UI: pointer, wheel and keyboard input on the stage canvas → intent callbacks. The tap / hold /
 * double tap / drag / pinch rules live in the pure GestureRecognizer (gestures.ts).
 */
import { GestureRecognizer, HOLD_MS, type GestureAction } from './gestures';

export interface InputHandlers {
  /** Any user activation (pointer up, key): unlock audio here. */
  activate(): void;
  tap(x: number, y: number): void;
  doubleTap(x: number, y: number): void;
  holdStart(x: number, y: number): void;
  holdEnd(): void;
  drag(dx: number, dy: number): void;
  dragEnd(): void;
  dolly(delta: number): void;
  /** Mouse hover (no buttons); null when the pointer leaves. */
  hover(x: number, y: number): void;
  hoverEnd(): void;
  key: {
    buildStart(): void;
    buildEnd(): void;
    drop(): void;
    shot(n: number): void;
    toggleAuto(): void;
    toggleMute(): void;
    find(): void;
  };
  /** Keys are ignored while this returns true (a sheet with an input is open). */
  keysBlocked(): boolean;
}

export function bindInput(canvas: HTMLCanvasElement, h: InputHandlers): () => void {
  const g = new GestureRecognizer();
  let holdTimer = 0;
  let hoverRaf = 0;
  let hoverXY: [number, number] | null = null;

  const run = (actions: GestureAction[]) => {
    for (const a of actions) {
      switch (a.type) {
        case 'press':
          clearTimeout(holdTimer);
          holdTimer = window.setTimeout(() => run(g.poll(performance.now())), HOLD_MS + 5);
          break;
        case 'tap':
          h.tap(a.x, a.y);
          break;
        case 'doubleTap':
          h.doubleTap(a.x, a.y);
          break;
        case 'holdStart':
          h.holdStart(a.x, a.y);
          break;
        case 'holdEnd':
          h.holdEnd();
          break;
        case 'drag':
          clearTimeout(holdTimer);
          h.drag(a.dx, a.dy);
          break;
        case 'dragEnd':
          h.dragEnd();
          break;
        case 'pinch':
          clearTimeout(holdTimer);
          h.dolly(-a.delta * 4);
          break;
      }
    }
  };

  const rect = () => canvas.getBoundingClientRect();
  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    const r = rect();
    run(g.down(e.pointerId, e.clientX - r.left, e.clientY - r.top, performance.now()));
  };
  const onMove = (e: PointerEvent) => {
    const r = rect();
    if (g.active) {
      run(g.move(e.pointerId, e.clientX - r.left, e.clientY - r.top));
      return;
    }
    if (e.pointerType === 'mouse') {
      hoverXY = [e.clientX - r.left, e.clientY - r.top];
      if (!hoverRaf)
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = 0;
          if (hoverXY) h.hover(hoverXY[0], hoverXY[1]);
        });
    }
  };
  const onUp = (e: PointerEvent) => {
    clearTimeout(holdTimer);
    h.activate();
    run(g.up(e.pointerId, performance.now()));
  };
  const onCancel = (e: PointerEvent) => {
    clearTimeout(holdTimer);
    run(g.cancel(e.pointerId));
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !g.active) {
      hoverXY = null;
      h.hoverEnd();
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    h.dolly(e.deltaY * scale);
  };
  const onContext = (e: Event) => e.preventDefault();

  let spaceDown = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (h.keysBlocked() || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    h.activate();
    if (e.code === 'Space') {
      e.preventDefault();
      if (!spaceDown && !e.repeat) {
        spaceDown = true;
        h.key.buildStart();
      }
      return;
    }
    if (e.repeat) return;
    if (e.key === 'Enter' && (e.target === document.body || e.target === canvas)) {
      e.preventDefault();
      h.key.drop();
    } else if (/^[1-6]$/.test(e.key)) h.key.shot(Number(e.key));
    else if (e.key === 'a' || e.key === 'A') h.key.toggleAuto();
    else if (e.key === 'm' || e.key === 'M') h.key.toggleMute();
    else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      h.key.find();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && spaceDown) {
      spaceDown = false;
      h.key.buildEnd();
    }
  };
  const onBlur = () => {
    if (spaceDown) {
      spaceDown = false;
      h.key.buildEnd();
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    clearTimeout(holdTimer);
    cancelAnimationFrame(hoverRaf);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContext);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
