/**
 * Gaps round 3 (hud-controls): the HUD layout editor (Settings → HUD layout → Edit), Wild Rift / MLBB style. A full
 * screen stand-in for the match HUD: drag any touch button, the minimap (it carries the ping paw, the Fish chip and the
 * emote and chat buttons with it) or the joystick; pick one and use − / + to resize it; the snap guides line a control
 * up with another's centre or the safe edge. A drop that would overlap another control, cover the score bar or the
 * hero, or leave the safe area slides back to where it was. Save keeps the layout for this device class (phone or
 * tablet, landscape or portrait; hudLayout.ts) and it follows the account; Reset puts every control back to the
 * default; Cancel (or Esc) leaves without saving. Keyboard: Tab picks a control, the arrows move it (Shift: 10 px),
 * + / − resize it.
 */
import { lastHitButton, leftHanded, touchSize, towerButton } from '../input/presets';
import {
  defaultLayout,
  deviceClass,
  fromStored,
  HUD_CTLS,
  keepOuts,
  problemOf,
  problems,
  readInsets,
  saveDeviceLayout,
  SIZE,
  sized,
  snap,
  storedFor,
  toStored,
  type HudCtl,
  type HudLayout,
  type HudView,
} from '../input/touch/hudLayout';
import { MINIMAP_SIZE_K, MINIMAP_SIZES, minimapSize, setMinimapSize, type MinimapSize } from './minimapPrefs';
import './hudEditor.css';

const LABEL: Record<HudCtl, string> = {
  attack: 'ATK',
  q: 'Q',
  w: 'W',
  e: 'E',
  r: 'R',
  trick: 'Trick',
  nap: 'Nap',
  lasthit: 'LH',
  tower: 'TWR',
  minimap: 'Map',
  stick: 'Move',
};
const NAME: Record<HudCtl, string> = {
  attack: 'Attack',
  q: 'Q',
  w: 'W',
  e: 'E',
  r: 'R (ultimate)',
  trick: 'Paw Trick',
  nap: 'Nap',
  lasthit: 'Last hit',
  tower: 'Tower',
  minimap: 'Minimap',
  stick: 'Joystick',
};
const WHY: Record<string, string> = { edge: 'keep it inside the screen', top: 'the score bar stays clear' };

export interface HudEditorOpts {
  /** Focus goes back here on close. */
  returnFocus?: HTMLElement | null;
  /** After a save (the layout is stored and the match HUD already re-laid out). */
  onSave?(): void;
  onClose?(): void;
}

/** Open the editor over `parent`. Returns its root (removed on close). */
export function openHudEditor(parent: HTMLElement, o: HudEditorOpts = {}): HTMLElement {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let mm: MinimapSize = minimapSize();
  const view = (): HudView => ({ w, h, safe, large: touchSize() === 'large', lefty: leftHanded(), mmK: MINIMAP_SIZE_K[mm] });
  const safe = readInsets();
  const ids = HUD_CTLS.filter((id) => (id !== 'lasthit' || lastHitButton()) && (id !== 'tower' || towerButton()));
  let def = defaultLayout(view());
  let l: HudLayout = fromStored(storedFor(w, h), view(), ids) ?? def;
  let sel: HudCtl | null = null;

  const root = document.createElement('div');
  root.className = 'pl-hudedit';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Edit HUD layout');
  root.dataset.testid = 'hud-editor';
  const ko = keepOuts(view());
  root.innerHTML = `
    <div class="he-hero" aria-hidden="true" style="left:${ko.hero.x - ko.hero.r}px;top:${ko.hero.y - ko.hero.r}px;width:${ko.hero.r * 2}px;height:${ko.hero.r * 2}px"><span>Hero</span></div>
    <div class="he-band" style="left:${ko.band.x0}px;width:${ko.band.x1 - ko.band.x0}px;height:${ko.band.y1}px;padding-top:${safe.t}px">
      <div class="he-bar" role="toolbar" aria-label="Layout tools">
        <button class="he-tool" data-a="smaller" aria-label="Smaller" disabled>−</button>
        <output class="he-size" data-testid="hud-size" aria-live="polite">Pick one</output>
        <button class="he-tool" data-a="bigger" aria-label="Bigger" disabled>+</button>
        <button class="he-tool txt" data-a="reset" data-testid="hud-reset">Reset</button>
        <button class="he-tool txt" data-a="cancel" data-testid="hud-cancel">Cancel</button>
        <button class="he-tool txt save" data-a="save" data-testid="hud-save">Save</button>
      </div>
    </div>
    <i class="he-guide gx" aria-hidden="true"></i><i class="he-guide gy" aria-hidden="true"></i>
    <p class="he-hint" aria-live="polite" data-testid="hud-hint">Drag to move. Pick one, then − or + to resize.</p>
    ${ids.map((id) => `<button class="he-ctl ${id}" data-id="${id}" data-testid="hud-ctl-${id}" aria-label="${NAME[id]}"><b>${LABEL[id]}</b></button>`).join('')}`;
  const els = new Map<HudCtl, HTMLElement>();
  for (const id of ids) els.set(id, root.querySelector(`[data-id="${id}"]`) as HTMLElement);
  const gx = root.querySelector('.gx') as HTMLElement;
  const gy = root.querySelector('.gy') as HTMLElement;
  const hint = root.querySelector('.he-hint') as HTMLElement;
  const sizeOut = root.querySelector('.he-size') as HTMLElement;
  const btnSmaller = root.querySelector('[data-a="smaller"]') as HTMLButtonElement;
  const btnBigger = root.querySelector('[data-a="bigger"]') as HTMLButtonElement;

  const place = (id: HudCtl): void => {
    const s = l[id];
    const el = els.get(id);
    if (!el) return;
    const bw = s.d > 0 ? s.d : s.w;
    const bh = s.d > 0 ? s.d : s.h;
    el.style.left = `${Math.round(s.x - bw / 2)}px`;
    el.style.top = `${Math.round(s.y - bh / 2)}px`;
    el.style.width = `${Math.round(bw)}px`;
    el.style.height = `${Math.round(bh)}px`;
    if (id === 'minimap') el.style.setProperty('--mm-box', `${Math.round(s.w)}px`);
  };
  const say = (t: string): void => {
    hint.textContent = t;
  };
  const syncBar = (): void => {
    const on = sel !== null;
    btnSmaller.disabled = !on;
    btnBigger.disabled = !on;
    if (!sel) {
      sizeOut.textContent = 'Pick one';
      return;
    }
    sizeOut.textContent = sel === 'minimap' ? `Map ${mm.toUpperCase()}` : `${LABEL[sel]} ${Math.round(l[sel].k * 100)}%`;
  };
  const select = (id: HudCtl | null): void => {
    sel = id;
    for (const [k, el] of els) {
      el.classList.toggle('sel', k === id);
      el.setAttribute('aria-pressed', String(k === id));
    }
    syncBar();
  };
  const markBad = (): void => {
    const bad = new Set(problems(l, view(), ids));
    for (const [k, el] of els) el.classList.toggle('bad', bad.has(k));
  };
  const placeAll = (): void => {
    for (const id of ids) place(id);
    markBad();
  };
  const why = (p: string | null): string => (p === null ? '' : (WHY[p] ?? `it would overlap ${NAME[p as HudCtl] ?? p}`));

  /** Move `id` to (x, y) if it is allowed there; returns the problem when not (nothing moves then). */
  const tryMove = (id: HudCtl, x: number, y: number): string | null => {
    const was = l[id];
    l = { ...l, [id]: { ...was, x, y } };
    const p = problemOf(l, id, view(), ids);
    if (p !== null) l = { ...l, [id]: was };
    place(id);
    return p;
  };

  const resize = (dir: 1 | -1): void => {
    if (!sel) return;
    const id = sel;
    const was = l[id];
    if (id === 'minimap') {
      const i = MINIMAP_SIZES.indexOf(mm) + dir;
      if (i < 0 || i >= MINIMAP_SIZES.length) return;
      const prevMm = mm;
      mm = MINIMAP_SIZES[i];
      const nd = defaultLayout(view()).minimap;
      // the map grows from its top-left corner (the HUD reads the corner too)
      const x = was.x - was.w / 2 + nd.w / 2;
      const y = was.y - was.h / 2 + nd.h / 2;
      l = { ...l, minimap: { ...nd, x, y } };
      const p = problemOf(l, id, view(), ids);
      if (p !== null) {
        mm = prevMm;
        l = { ...l, minimap: was };
        deny(id, `No room for a bigger map: ${why(p)}.`);
      } else def = defaultLayout(view());
    } else {
      const k = Math.round((was.k + dir * SIZE.step) * 10) / 10;
      if (k < SIZE.min - 1e-6 || k > SIZE.max + 1e-6) return;
      l = { ...l, [id]: { ...was, ...sized(def[id], k) } };
      const p = problemOf(l, id, view(), ids);
      if (p !== null) {
        l = { ...l, [id]: was };
        deny(id, `No room to grow ${NAME[id]}: ${why(p)}.`);
      }
    }
    place(id);
    markBad();
    syncBar();
  };
  const deny = (id: HudCtl, msg: string): void => {
    const el = els.get(id);
    el?.classList.remove('deny');
    void el?.offsetWidth;
    el?.classList.add('deny');
    say(msg);
  };

  // ---------------------------------------------------------------------------------------- dragging
  let drag: { id: HudCtl; pid: number; ox: number; oy: number; x0: number; y0: number; moved: boolean } | null = null;
  const guides = (x: number | null, y: number | null): void => {
    gx.classList.toggle('on', x !== null);
    gy.classList.toggle('on', y !== null);
    if (x !== null) gx.style.left = `${Math.round(x)}px`;
    if (y !== null) gy.style.top = `${Math.round(y)}px`;
  };
  root.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.he-ctl');
    if (!el) {
      if (!(e.target as HTMLElement).closest('.he-bar')) select(null);
      return;
    }
    e.preventDefault();
    const id = el.dataset.id as HudCtl;
    select(id);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers */
    }
    drag = { id, pid: e.pointerId, ox: e.clientX - l[id].x, oy: e.clientY - l[id].y, x0: l[id].x, y0: l[id].y, moved: false };
    el.classList.add('drag');
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const id = drag.id;
    const s = snap(l, id, e.clientX - drag.ox, e.clientY - drag.oy, view(), ids);
    drag.moved = drag.moved || Math.hypot(s.x - drag.x0, s.y - drag.y0) > 2;
    // follow the thumb freely; the rules are checked on the drop (shown live in red)
    l = { ...l, [id]: { ...l[id], x: s.x, y: s.y } };
    place(id);
    guides(s.gx, s.gy);
    const p = problemOf(l, id, view(), ids);
    els.get(id)?.classList.toggle('bad', p !== null);
  });
  const drop = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    guides(null, null);
    els.get(d.id)?.classList.remove('drag');
    const p = problemOf(l, d.id, view(), ids);
    if (p !== null) {
      // back to where it was: a drop never leaves a control overlapping or off the safe area
      l = { ...l, [d.id]: { ...l[d.id], x: d.x0, y: d.y0 } };
      place(d.id);
      deny(d.id, `Can't go there: ${why(p)}.`);
    } else if (d.moved) say(`${NAME[d.id]} moved. Save to keep it.`);
    markBad();
  };
  root.addEventListener('pointerup', drop);
  root.addEventListener('pointercancel', drop);

  // ---------------------------------------------------------------------------------------- tools
  const close = (): void => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    o.onClose?.();
    if (o.returnFocus?.isConnected) o.returnFocus.focus({ preventScroll: true });
  };
  const save = (): void => {
    const v = view();
    const bad = problems(l, v, ids);
    if (bad.length) {
      deny(bad[0], `${NAME[bad[0]]} overlaps or is off screen: move it first.`);
      return;
    }
    if (mm !== minimapSize()) setMinimapSize(mm);
    saveDeviceLayout(deviceClass(w, h), toStored(l, v));
    o.onSave?.();
    close();
  };
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'smaller') resize(-1);
    else if (a === 'bigger') resize(1);
    else if (a === 'reset') {
      mm = 'm';
      def = defaultLayout(view());
      l = def;
      placeAll();
      select(null);
      say('Back to the default layout. Save to keep it.');
    } else if (a === 'cancel') close();
    else if (a === 'save') save();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      // focus stays in the editor
      const f = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!f.length) return;
      const at = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      e.stopPropagation();
      const next = f[at < 0 ? 0 : (at + (e.shiftKey ? f.length - 1 : 1)) % f.length];
      next.focus();
      const id = next.dataset.id as HudCtl | undefined;
      if (id) select(id);
      return;
    }
    if (!sel) return;
    const step = e.shiftKey ? 10 : 2;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = mv[e.key];
    if (m) {
      e.preventDefault();
      e.stopPropagation();
      const p = tryMove(sel, l[sel].x + m[0], l[sel].y + m[1]);
      if (p !== null) deny(sel, `Can't go there: ${why(p)}.`);
      markBad();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      resize(1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      resize(-1);
    }
  };
  document.addEventListener('keydown', onKey, true);
  // the touch HUD is in its mirrored frame already (defaultLayout / fromStored), so the editor shows what the match does
  root.classList.toggle('lefty', leftHanded());
  parent.appendChild(root);
  placeAll();
  syncBar();
  (root.querySelector('[data-id="attack"]') as HTMLElement | null)?.focus({ preventScroll: true });
  return root;
}
