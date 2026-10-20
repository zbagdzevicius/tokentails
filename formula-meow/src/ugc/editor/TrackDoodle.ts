/**
 * Track Doodle (GDD 6.4), the phone-first track editor. Lazy chunk: the hub imports it on first use.
 *
 *   Draw      drag one finger round a loop; it closes, snaps to the 4 m grid and smooths itself
 *   Shape     drag the points; double-tap the road to add one; long-press a point to remove it; height and width
 *   Stickers  drag 🏁 🎁 ⚡ ⤴ 💧 🌿 from the tray onto the road; tap one to flip its side; drag it off to delete it
 *   Style     theme, name, creator tag
 *
 * Every change is validated (validate.ts): the status line says what is wrong in one sentence and the problem part
 * of the road turns red. "Race it" and "Share" unlock once the track is drivable.
 */
import type { FeatureKind, ThemeId, TrackDef, TrackPoint } from '../../types';
import { modal } from '../../ui/kit';
import { TRACK } from '../../tuning';
import { densePolyline } from '../../core/track/spline';
import { themeOf } from '../../core/track/themes';
import { t as tr } from '../../ui/i18n';
import type { BuiltTrack } from '../../core/track/build';
import { firstMessage, lapsFor, LIMITS, validateTrack, type Validation } from './validate';
import { doodleToPoints, featurePos, nearestOnTrack, sampleToS, sToSample, starterFeatures, type P2 } from './doodle';
import { History } from './history';
import { cleanName, CREATOR_MAX, encodeTrack, NAME_MAX } from '../codec/track-code';
import { loadCreator, newSlot, putSaved, saveCreator, saveDraft } from '../store';
import { shareTrack } from '../actions';
import './editor.css';

export interface EditorHost {
  /** race this (valid) track now; the editor has already closed */
  play(def: TrackDef): void;
  /** the editor closed without racing */
  closed(): void;
}

export interface EditorOptions {
  def?: TrackDef;
  slot?: string;
  /** the race's theme, used for a brand-new track */
  theme?: ThemeId;
  host: EditorHost;
}

type Tab = 'draw' | 'shape' | 'stickers' | 'style';

const STICKERS: ReadonlyArray<{ kind: FeatureKind; icon: string; label: string; sided: boolean }> = [
  { kind: 'start', icon: '🏁', label: 'Start', sided: false },
  { kind: 'items', icon: '🎁', label: 'Items', sided: false },
  { kind: 'pad', icon: '⚡', label: 'Boost', sided: true },
  { kind: 'ramp', icon: '⤴️', label: 'Ramp', sided: true },
  { kind: 'lowgrip', icon: '💧', label: 'Puddle', sided: false },
  { kind: 'offroad', icon: '🌿', label: 'Rough', sided: true },
  // iteration 2 (tracks lane, B54): real again. Hazard: centred = a roomba crossing the road, on a side = spilled
  // milk there. Shortcut: on a corner, an off-road short cut across its inside (a verge when the corner is too gentle)
  { kind: 'hazard', icon: '⚠️', label: 'Hazard', sided: true },
  { kind: 'shortcut', icon: '✂️', label: 'Shortcut', sided: true },
];
const ICON: Record<FeatureKind, string> = { start: '🏁', items: '🎁', pad: '⚡', ramp: '⤴️', lowgrip: '💧', offroad: '🌿', hazard: '⚠️', shortcut: '✂️' };
const SIDED = new Set<FeatureKind>(['pad', 'ramp', 'offroad', 'shortcut', 'hazard']);
const THEMES: ReadonlyArray<{ id: ThemeId; label: string }> = [
  { id: 0, label: '🍳 Kitchen' },
  { id: 1, label: '🌃 Rooftops' },
  { id: 2, label: '🧺 Laundry' },
  { id: 3, label: '🧶 Yarn' },
  // iteration 2: these three need track code v2 (codec/track-code.ts)
  { id: 4, label: '☕ Café' },
  { id: 5, label: '🐾 Shelter' },
  { id: 6, label: '🛋️ Living room' },
];
/** Night themes (rooftops, café) race after dark. */
const nightOf = (theme: ThemeId): 0 | 2 => (theme === 1 || theme === 4 ? 2 : 0);
const WIDTHS = ['S', 'M', 'L', 'XL'] as const;
/** world half-extent shown on the map */
const VIEW = 134;
const HANDLE_PX = 26;
const STICKER_PX = 24;
const LONG_PRESS_MS = 520;

const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const clone = (d: TrackDef): TrackDef => JSON.parse(JSON.stringify(d)) as TrackDef;

function emptyDef(theme: ThemeId): TrackDef {
  const me = loadCreator();
  const d: TrackDef = { v: 1, id: 'draft', name: '', theme, timeOfDay: nightOf(theme), laps: 3, points: [], features: [] };
  if (me) d.creator = me;
  return d;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export class TrackDoodle {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly status: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly raceBtn: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly title: HTMLDivElement;

  private def: TrackDef;
  private slot: string;
  private tab: Tab;
  private sel = -1;
  private v: Validation;
  private readonly history = new History<TrackDef>();
  private note = '';
  private noteTimer = 0;

  // view transform
  private scale = 1;
  private cx = 0;
  private cy = 0;
  private dpr = 1;

  // gestures
  private stroke: P2[] | null = null;
  private dragPoint = -1;
  /** state before a point drag, committed to the history on the first real move */
  private dragSnapshot: TrackDef | null = null;
  private dragSticker = -1;
  private dragFrom: { x: number; y: number } | null = null;
  private dragMoved = false;
  /** mouse hover position (handles show near it, B55); null on touch */
  private hover: { x: number; y: number } | null = null;
  private touchUi = false;
  /** changed since the editor opened (Esc asks before leaving, B55) */
  private dirty = false;
  private ghost: { kind: FeatureKind; x: number; y: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private pressTimer = 0;
  private preview = false;
  private closedFlag = false;

  constructor(private readonly opts: EditorOptions) {
    this.def = opts.def ? clone(opts.def) : emptyDef(opts.theme ?? 0);
    this.def.id = 'draft';
    this.slot = opts.slot ?? newSlot();
    this.tab = this.def.points.length >= LIMITS.minPoints ? 'shape' : 'draw';
    this.v = validateTrack(this.def);

    this.root = el('div', 'fm-ed');
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Track Doodle editor');

    const top = el('div', 'fm-ed-top');
    const close = el('button', 'fm-ed-ic fm-sticker', '✕');
    close.setAttribute('aria-label', 'Close editor');
    close.addEventListener('click', () => void this.askClose());
    this.title = el('div', 'fm-ed-title');
    // B55: the name can be changed from the header (tap the title), not only in Style
    this.title.tabIndex = 0;
    this.title.setAttribute('role', 'button');
    this.title.setAttribute('aria-label', 'Rename the track');
    this.title.addEventListener('click', () => this.renameInline());
    this.title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.renameInline();
    });
    const fresh = el('button', 'fm-ed-ic fm-ed-new fm-sticker', '🗒️ <small>New</small>');
    fresh.setAttribute('aria-label', 'New track');
    fresh.title = 'New track';
    fresh.addEventListener('click', () => this.newTrack());
    this.undoBtn = el('button', 'fm-ed-ic fm-sticker', '↶');
    this.undoBtn.setAttribute('aria-label', 'Undo');
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn = el('button', 'fm-ed-ic fm-sticker', '↷');
    this.redoBtn.setAttribute('aria-label', 'Redo');
    this.redoBtn.addEventListener('click', () => this.redo());
    top.append(close, this.title, fresh, this.undoBtn, this.redoBtn);

    const stage = el('div', 'fm-ed-stage');
    this.canvas = el('canvas', 'fm-ed-canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.hint = el('div', 'fm-ed-hint fm-outline');
    // B55: the status sits in the top bar, never over the drawing area
    this.status = el('div', 'fm-ed-status fm-sticker');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    stage.append(this.canvas, this.hint);

    this.tabs = el('div', 'fm-ed-tabs');
    for (const [id, label] of [
      ['draw', '✍️ Draw'],
      ['shape', '🔧 Shape'],
      ['stickers', '🎁 Stickers'],
      ['style', '🎨 Style'],
    ] as const) {
      const b = el('button', 'fm-ed-tab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => this.setTab(id));
      this.tabs.append(b);
    }
    this.panel = el('div', 'fm-ed-panel');

    const actions = el('div', 'fm-ed-actions');
    const saveBtn = (this.saveBtn = el('button', 'fm-btn', '💾 Save'));
    saveBtn.addEventListener('click', () => {
      this.save();
      this.flash('Saved on this device.');
    });
    this.shareBtn = el('button', 'fm-btn', '🔗 Share');
    this.shareBtn.addEventListener('click', () => void this.share());
    this.raceBtn = el('button', 'fm-btn primary', '▶ Race it');
    this.raceBtn.addEventListener('click', () => this.race());
    actions.append(saveBtn, this.shareBtn, this.raceBtn);

    this.root.append(top, this.status, stage, this.tabs, this.panel, actions);

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointermove', (e) => {
      this.touchUi = e.pointerType !== 'mouse';
      if (this.touchUi) this.hover = null;
      else {
        this.hover = this.local(e);
        if (this.tab === 'shape' && !this.dragFrom) this.draw();
      }
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      if (this.tab === 'shape') this.draw();
    });
    this.canvas.addEventListener('pointerdown', (e) => (this.touchUi = e.pointerType !== 'mouse'), true);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onCancel);
    // keep the race's keyboard handler (window) out of the editor: R, Esc, Space would drive the race behind
    this.root.addEventListener('keydown', this.onKey);
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    window.addEventListener('resize', this.onResize);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.root);
    this.onResize();
    this.setTab(this.tab);
    this.root.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------------------------------
  // state
  // ------------------------------------------------------------------------------------------

  private commit(mut: (d: TrackDef) => void): void {
    this.dirty = true;
    this.history.commit(clone(this.def));
    mut(this.def);
    this.revalidate();
  }

  private revalidate(): void {
    this.dirty = true;
    this.v = validateTrack(this.def);
    if (this.v.built) this.def.laps = lapsFor(this.v.length);
    saveDraft({ slot: this.slot, def: this.def });
    this.refresh();
  }

  private undo(): void {
    const prev = this.history.undo(clone(this.def));
    if (!prev) return;
    this.def = prev;
    this.sel = -1;
    this.revalidate();
    this.renderPanel();
  }

  private redo(): void {
    const next = this.history.redo(clone(this.def));
    if (!next) return;
    this.def = next;
    this.sel = -1;
    this.revalidate();
    this.renderPanel();
  }

  private newTrack(): void {
    if (this.def.points.length) this.history.commit(clone(this.def));
    const theme = this.def.theme;
    this.def = emptyDef(theme);
    this.slot = newSlot();
    this.sel = -1;
    this.revalidate();
    this.setTab('draw');
  }

  private save(): void {
    if (!this.def.points.length) return;
    putSaved({ slot: this.slot, code: encodeTrack(this.def), name: cleanName(this.def.name, NAME_MAX), at: Date.now() });
  }

  private async share(): Promise<void> {
    if (!this.v.ok) return this.flash(firstMessage(this.v) ?? 'Fix the track first.');
    this.save();
    const msg = await shareTrack(this.def);
    if (msg) this.flash(msg);
  }

  private race(): void {
    if (!this.v.ok) return this.flash(firstMessage(this.v) ?? 'Fix the track first.');
    this.save();
    const def = clone(this.def);
    this.dispose();
    this.opts.host.play(def);
  }

  /** Leave the editor. The draft is always kept (B55), valid or not, and the track saved when it has points. */
  close(): void {
    if (this.def.points.length) {
      saveDraft({ slot: this.slot, def: this.def });
      this.save();
    }
    this.dispose();
    this.opts.host.closed();
  }

  /** Esc: ask first when there are changes (B55: it used to close at once). */
  private async askClose(): Promise<void> {
    if (!this.dirty || !this.def.points.length) return this.close();
    const i = await modal('Leave the editor?', 'Your track stays saved on this device as a draft.', ['Leave', 'Keep editing']);
    if (i === 0) this.close();
    else this.root.focus({ preventScroll: true });
  }

  /** Rename from the header: the title turns into a field until Enter or a tap elsewhere. */
  private renameInline(): void {
    if (this.title.querySelector('input')) return;
    const i = el('input', 'fm-ed-name');
    i.type = 'text';
    i.maxLength = NAME_MAX;
    i.value = this.def.name;
    i.placeholder = 'Track name';
    i.setAttribute('aria-label', 'Track name');
    i.enterKeyHint = 'done';
    this.title.textContent = '';
    this.title.append(i);
    i.focus();
    const done = () => {
      const clean = cleanName(i.value, NAME_MAX);
      if (i.value.trim() && !clean) this.flash("That name can't be used. Try another.");
      if (clean !== this.def.name) this.commit((d) => (d.name = clean));
      this.refresh();
      if (this.tab === 'style') this.renderPanel();
    };
    i.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') i.blur();
      if (e.key === 'Escape') {
        i.value = this.def.name;
        i.blur();
      }
    });
    i.addEventListener('blur', done, { once: true });
  }

  private dispose(): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.pressTimer);
    clearTimeout(this.noteTimer);
    this.root.remove();
  }

  private flash(msg: string): void {
    this.note = msg;
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => {
      this.note = '';
      this.refreshStatus();
    }, 3200);
    this.refreshStatus();
  }

  // ------------------------------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------------------------------

  private setTab(t: Tab): void {
    this.tab = t;
    this.sel = t === 'shape' ? this.sel : -1;
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.fm-ed-tab')) b.classList.toggle('on', b.dataset.tab === t);
    this.renderPanel();
    this.refresh();
  }

  private renderPanel(): void {
    const p = this.panel;
    p.innerHTML = '';
    if (this.tab === 'draw') {
      p.append(el('p', 'fm-ed-tip', 'Drag one finger round a loop and let go near where you started. It snaps into a race track.'));
    } else if (this.tab === 'shape') {
      if (this.sel < 0 || this.sel >= this.def.points.length) {
        p.append(el('p', 'fm-ed-tip', 'Drag a point to bend the road. Double-tap the road to add a point, long-press a point to remove it. Tap a point for height and width.'));
      } else {
        const pt = this.def.points[this.sel];
        const row = el('div', 'fm-ed-row');
        const down = el('button', 'fm-ed-chip', '▼');
        down.setAttribute('aria-label', 'Lower');
        const up = el('button', 'fm-ed-chip', '▲');
        up.setAttribute('aria-label', 'Raise');
        // B55: "Height ▼ 0 ▲" reads as one control, the point number sits apart
        const hl = el('span', 'fm-ed-val', String(pt.h));
        hl.setAttribute('aria-label', `Height ${pt.h}`);
        down.addEventListener('click', () => this.setPoint({ h: Math.max(0, pt.h - 1) }));
        up.addEventListener('click', () => this.setPoint({ h: Math.min(7, pt.h + 1) }));
        const grp = el('span', 'fm-ed-group');
        grp.append(el('span', 'fm-ed-lbl', 'Height'), down, hl, up);
        row.append(el('span', 'fm-ed-pt', `Point ${this.sel + 1}`), grp);
        const row2 = el('div', 'fm-ed-row');
        row2.append(el('span', 'fm-ed-lbl', 'Width'));
        WIDTHS.forEach((w, i) => {
          const b = el('button', 'fm-ed-chip' + (pt.w === i ? ' on' : ''), w);
          b.addEventListener('click', () => this.setPoint({ w: i as TrackPoint['w'] }));
          row2.append(b);
        });
        const del = el('button', 'fm-ed-chip', '🗑');
        del.setAttribute('aria-label', 'Remove point');
        del.addEventListener('click', () => this.removePoint(this.sel));
        row2.append(del);
        p.append(row, row2);
      }
    } else if (this.tab === 'stickers') {
      const tray = el('div', 'fm-ed-tray');
      for (const s of STICKERS) {
        const b = el('button', 'fm-ed-stk fm-sticker', `<span>${s.icon}</span><small>${tr(s.kind === 'hazard' ? 'editor.sticker.hazard' : s.kind === 'shortcut' ? 'editor.sticker.shortcut' : s.label)}</small>`);
        if (s.kind === 'hazard' || s.kind === 'shortcut') b.title = tr(`editor.sticker.${s.kind}Hint`);
        b.dataset.kind = s.kind;
        b.addEventListener('pointerdown', (e) => this.startTrayDrag(e, s.kind));
        tray.append(b);
      }
      p.append(tray, el('p', 'fm-ed-tip', 'Drag a sticker onto the road. Tap one to flip its side, drag it off the road to remove it.'));
    } else {
      const themes = el('div', 'fm-ed-row');
      for (const t of THEMES) {
        const b = el('button', 'fm-ed-chip' + (this.def.theme === t.id ? ' on' : ''), t.label);
        b.addEventListener('click', () => {
          this.commit((d) => {
            d.theme = t.id;
            d.timeOfDay = nightOf(t.id);
          });
          this.renderPanel();
        });
        themes.append(b);
      }
      const name = this.textField('Track name', this.def.name, NAME_MAX, (v) => {
        this.commit((d) => {
          d.name = v;
        });
      });
      const creator = this.textField('Your name', this.def.creator ?? '', CREATOR_MAX, (v) => {
        saveCreator(v);
        this.commit((d) => {
          if (v) d.creator = v;
          else delete d.creator;
        });
      });
      p.append(themes, name, creator);
    }
  }

  private textField(label: string, value: string, max: number, set: (v: string) => void): HTMLLabelElement {
    const l = el('label', 'fm-ed-field');
    l.append(el('span', 'fm-ed-lbl', label));
    const i = el('input');
    i.type = 'text';
    i.maxLength = max;
    i.value = value;
    i.autocomplete = 'off';
    i.spellcheck = false;
    i.enterKeyHint = 'done';
    i.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') i.blur();
    });
    i.addEventListener('change', () => {
      const clean = cleanName(i.value, max);
      if (i.value.trim() && !clean) this.flash("That name can't be used. Try another.");
      else if (clean !== i.value.trim()) this.flash(`Saved as "${clean}" (letters, numbers, spaces, -).`);
      i.value = clean;
      set(clean);
    });
    l.append(i);
    return l;
  }

  private refresh(): void {
    if (!this.title.querySelector('input')) this.title.textContent = this.def.name || 'Track Doodle';
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    this.raceBtn.disabled = !this.v.ok;
    this.shareBtn.disabled = !this.v.ok;
    // polish B9: nothing drawn, nothing to save
    this.saveBtn.disabled = this.def.points.length === 0;
    const empty = this.def.points.length === 0;
    this.hint.textContent = empty && this.tab === 'draw' && !this.stroke ? 'Draw a loop ✍️' : '';
    this.refreshStatus();
    this.draw();
  }

  private refreshStatus(): void {
    const s = this.status;
    s.classList.remove('ok', 'bad');
    if (this.note) {
      s.textContent = this.note;
      return;
    }
    if (!this.def.points.length) {
      s.textContent = 'Start with a doodle.';
      return;
    }
    if (this.v.ok) {
      s.classList.add('ok');
      s.textContent = `✓ Drivable · ${Math.round(this.v.length)} m · ${this.def.laps} laps`;
    } else {
      s.classList.add('bad');
      s.textContent = firstMessage(this.v) ?? 'Not drivable yet.';
    }
  }

  private setPoint(patch: Partial<TrackPoint>): void {
    const i = this.sel;
    if (i < 0) return;
    this.commit((d) => {
      d.points[i] = { ...d.points[i], ...patch };
    });
    this.renderPanel();
  }

  private removePoint(i: number): void {
    if (this.def.points.length <= LIMITS.minPoints) return this.flash(`A track keeps at least ${LIMITS.minPoints} points.`);
    this.commit((d) => {
      d.points.splice(i, 1);
    });
    this.sel = -1;
    this.renderPanel();
  }

  // ------------------------------------------------------------------------------------------
  // view
  // ------------------------------------------------------------------------------------------

  private readonly onResize = (): void => {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.scale = Math.min(r.width, r.height) / (2 * VIEW);
    this.cx = r.width / 2;
    this.cy = r.height / 2;
    this.draw();
  };

  /** world → CSS px. Seen from above: +z is up and +x is to the LEFT, which matches the 3D view (right = -x). */
  private sx(x: number): number {
    return this.cx - x * this.scale;
  }
  private sy(z: number): number {
    return this.cy - z * this.scale;
  }
  private toWorld(px: number, py: number): P2 {
    return { x: (this.cx - px) / this.scale, z: (this.cy - py) / this.scale };
  }
  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private draw(): void {
    const c = this.ctx;
    const th = themeOf(this.def.theme);
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = css(th.ground);
    c.fillRect(0, 0, W, H);
    // grid every 16 m, map edge
    c.strokeStyle = th.night ? 'rgba(255,255,255,0.07)' : 'rgba(42,26,34,0.08)';
    c.lineWidth = 1;
    c.beginPath();
    for (let g = -128; g <= 128; g += 16) {
      c.moveTo(this.sx(g), this.sy(-128));
      c.lineTo(this.sx(g), this.sy(128));
      c.moveTo(this.sx(-128), this.sy(g));
      c.lineTo(this.sx(128), this.sy(g));
    }
    c.stroke();
    c.strokeStyle = th.night ? 'rgba(255,255,255,0.25)' : 'rgba(42,26,34,0.25)';
    c.setLineDash([6, 6]);
    c.strokeRect(this.sx(124), this.sy(124), 252 * this.scale, 252 * this.scale);
    c.setLineDash([]);

    const t = this.preview ? null : this.v.built;
    if (t) this.drawBuilt(t);
    else if (this.def.points.length >= 3) this.drawPreview();

    if (this.tab === 'shape' || this.preview) this.drawHandles();
    if (t) this.drawStickers(t);
    if (this.stroke) this.drawStroke();
    if (this.ghost) this.drawSticker(this.ghost.x, this.ghost.y, ICON[this.ghost.kind], true);
  }

  private ribbon(t: BuiltTrack, extra: number, color: string, from = 0, to = t.n): void {
    const c = this.ctx;
    c.fillStyle = color;
    const chunk = 24;
    for (let a = from; a < to; a += chunk) {
      const b = Math.min(to, a + chunk + 1);
      c.beginPath();
      for (let k = a; k <= b; k++) {
        const i = k % t.n;
        const hw = t.halfW[i] + extra;
        const x = t.px[i] + t.tz[i] * hw;
        const z = t.pz[i] - t.tx[i] * hw;
        if (k === a) c.moveTo(this.sx(x), this.sy(z));
        else c.lineTo(this.sx(x), this.sy(z));
      }
      for (let k = b; k >= a; k--) {
        const i = k % t.n;
        const hw = t.halfW[i] + extra;
        c.lineTo(this.sx(t.px[i] - t.tz[i] * hw), this.sy(t.pz[i] + t.tx[i] * hw));
      }
      c.closePath();
      c.fill();
    }
  }

  private drawBuilt(t: BuiltTrack): void {
    const c = this.ctx;
    const th = themeOf(this.def.theme);
    this.ribbon(t, 1.6, css(th.curbA));
    this.ribbon(t, 0, css(th.road));
    // zones
    for (const f of t.features) {
      if (f.kind === 'lowgrip') this.ribbon(t, -0.5, 'rgba(127,211,255,0.75)', f.i, f.i + Math.round(36 / t.step));
      if (f.kind === 'offroad' || (f.kind === 'shortcut' && !t.branches.length)) {
        const len = Math.round(46 / t.step);
        c.fillStyle = 'rgba(90,150,60,0.55)';
        for (let k = f.i; k < f.i + len; k += 4) {
          const i = k % t.n;
          for (const sgn of [-1, 1]) {
            if ((f.side < 0 && sgn > 0) || (f.side > 0 && sgn < 0)) continue;
            const d = sgn * (t.halfW[i] + 3);
            c.beginPath();
            c.arc(this.sx(t.px[i] - t.tz[i] * d), this.sy(t.pz[i] + t.tx[i] * d), Math.max(2, 2.4 * this.scale), 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
    // short cuts (UGC shortcut stickers become off-road branches): crumbly ribbons across the corner
    for (const b of t.branches) {
      c.fillStyle = 'rgba(150,110,60,0.85)';
      c.beginPath();
      for (let j = 0; j < b.m; j += 2) {
        const x = b.px[j] + b.tz[j] * b.halfW[j];
        const z = b.pz[j] - b.tx[j] * b.halfW[j];
        if (j === 0) c.moveTo(this.sx(x), this.sy(z));
        else c.lineTo(this.sx(x), this.sy(z));
      }
      for (let j = b.m - 1; j >= 0; j -= 2) c.lineTo(this.sx(b.px[j] - b.tz[j] * b.halfW[j]), this.sy(b.pz[j] + b.tx[j] * b.halfW[j]));
      c.closePath();
      c.fill();
    }
    // hazards: a roomba disc or a milk puddle where they will be
    for (const h of t.hazards) {
      c.fillStyle = h.kind === 'milk' ? 'rgba(255,255,255,0.9)' : 'rgba(60,64,74,0.9)';
      c.beginPath();
      c.arc(this.sx(h.x), this.sy(h.z), Math.max(4, (h.kind === 'milk' ? 3.4 : 1.2) * this.scale), 0, Math.PI * 2);
      c.fill();
    }
    // direction chevrons every ~40 m
    c.strokeStyle = th.night ? 'rgba(44,246,243,0.7)' : 'rgba(255,255,255,0.85)';
    c.lineWidth = 2;
    const every = Math.round(40 / t.step);
    for (let i = every; i < t.n - every / 2; i += every) {
      const x = this.sx(t.px[i]);
      const y = this.sy(t.pz[i]);
      const dx = -t.tx[i];
      const dy = -t.tz[i];
      const s = 5;
      c.beginPath();
      c.moveTo(x - dx * s + dy * s, y - dy * s - dx * s);
      c.lineTo(x + dx * s, y + dy * s);
      c.lineTo(x - dx * s - dy * s, y - dy * s + dx * s);
      c.stroke();
    }
    // start line (sample 0): checker strip
    {
      const hw = t.halfW[0];
      const n = 6;
      for (let k = 0; k < n; k++) {
        const d0 = -hw + (2 * hw * k) / n;
        const d1 = -hw + (2 * hw * (k + 1)) / n;
        c.fillStyle = k % 2 ? '#2a1a22' : '#ffffff';
        c.beginPath();
        const pts: Array<[number, number]> = [
          [d0, -1],
          [d1, -1],
          [d1, 1],
          [d0, 1],
        ];
        pts.forEach(([d, a], j) => {
          const x = t.px[0] - t.tz[0] * d + t.tx[0] * a;
          const z = t.pz[0] + t.tx[0] * d + t.tz[0] * a;
          if (j === 0) c.moveTo(this.sx(x), this.sy(z));
          else c.lineTo(this.sx(x), this.sy(z));
        });
        c.closePath();
        c.fill();
      }
    }
    // problems in red
    for (const is of this.v.issues) {
      if (is.from == null || is.to == null) continue;
      const to = is.to >= is.from ? is.to : is.to + t.n;
      c.strokeStyle = 'rgba(255,40,70,0.85)';
      c.lineWidth = Math.max(6, 2 * t.halfW[is.from] * this.scale + 6);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      for (let k = is.from; k <= to; k += 2) {
        const i = k % t.n;
        if (k === is.from) c.moveTo(this.sx(t.px[i]), this.sy(t.pz[i]));
        else c.lineTo(this.sx(t.px[i]), this.sy(t.pz[i]));
      }
      c.stroke();
    }
  }

  private drawStickers(t: BuiltTrack): void {
    this.def.features.forEach((f, idx) => {
      if (idx === this.dragSticker && this.dragMoved) return;
      const i = sToSample(this.def, t, f.s);
      const p = featurePos(t, i, f.side ?? 0);
      this.drawSticker(this.sx(p.x), this.sy(p.z), ICON[f.kind], false, this.tab === 'shape');
    });
  }

  private drawPreview(): void {
    const c = this.ctx;
    const th = themeOf(this.def.theme);
    const dense = densePolyline(this.def.points.map((p) => ({ x: p.x, y: 0, z: p.z })), 12);
    const w = TRACK.widths[2] * this.scale;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const [color, width] of [
      [css(th.curbA), w + 3.2 * this.scale],
      [css(th.road), w],
    ] as const) {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      for (let k = 0; k < dense.x.length; k++) {
        if (k === 0) c.moveTo(this.sx(dense.x[k]), this.sy(dense.z[k]));
        else c.lineTo(this.sx(dense.x[k]), this.sy(dense.z[k]));
      }
      c.stroke();
    }
  }

  /**
   * Point handles (B55: ~28 big handles crowded the loop). With a mouse, full handles only near the cursor; on touch,
   * the selected point and its neighbours, or small dots for all when nothing is selected. Hit testing is unchanged.
   */
  private drawHandles(): void {
    const c = this.ctx;
    const n = this.def.points.length;
    const near = (i: number, x: number, y: number): boolean => {
      if (i === this.sel || this.dragPoint === i) return true;
      if (this.touchUi) {
        if (this.sel < 0) return false;
        const d = Math.min((i - this.sel + n) % n, (this.sel - i + n) % n);
        return d <= 1;
      }
      return !!this.hover && Math.hypot(x - this.hover.x, y - this.hover.y) < 140;
    };
    this.def.points.forEach((p, i) => {
      const x = this.sx(p.x);
      const y = this.sy(p.z);
      if (!near(i, x, y)) {
        c.beginPath();
        c.arc(x, y, this.touchUi && this.sel < 0 ? 5 : 3, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,243,220,0.85)';
        c.fill();
        return;
      }
      c.beginPath();
      c.arc(x, y, i === this.sel ? 12 : 8, 0, Math.PI * 2);
      c.fillStyle = i === this.sel ? '#ff3ea5' : '#fff3dc';
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = '#2a1a22';
      c.stroke();
      if (p.h > 0) {
        c.fillStyle = i === this.sel ? '#fff3dc' : '#2a1a22';
        c.font = '800 11px ui-rounded, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(p.h), x, y + 0.5);
      }
    });
  }

  private drawStroke(): void {
    const s = this.stroke!;
    const c = this.ctx;
    c.strokeStyle = '#ff3ea5';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    s.forEach((p, i) => (i === 0 ? c.moveTo(this.sx(p.x), this.sy(p.z)) : c.lineTo(this.sx(p.x), this.sy(p.z))));
    c.stroke();
    if (s.length) {
      // the closing ring around the start point
      const a = s[0];
      const b = s[s.length - 1];
      const near = Math.hypot(a.x - b.x, a.z - b.z) <= 40 && s.length > 20;
      c.beginPath();
      c.arc(this.sx(a.x), this.sy(a.z), 40 * this.scale, 0, Math.PI * 2);
      c.strokeStyle = near ? 'rgba(59,178,115,0.9)' : 'rgba(255,62,165,0.35)';
      c.lineWidth = 2;
      c.setLineDash([5, 5]);
      c.stroke();
      c.setLineDash([]);
    }
  }

  private drawSticker(x: number, y: number, icon: string, lifted: boolean, small = false): void {
    const c = this.ctx;
    const r = lifted ? 19 : small ? 11 : 15;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = '#fff3dc';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#2a1a22';
    c.stroke();
    c.font = `${lifted ? 20 : small ? 12 : 16}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#2a1a22';
    c.fillText(icon, x, y + 1);
  }

  // ------------------------------------------------------------------------------------------
  // gestures
  // ------------------------------------------------------------------------------------------

  private hitPoint(x: number, y: number): number {
    let best = -1;
    let bestD = HANDLE_PX;
    this.def.points.forEach((p, i) => {
      const d = Math.hypot(this.sx(p.x) - x, this.sy(p.z) - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private hitSticker(x: number, y: number): number {
    const t = this.v.built;
    if (!t) return -1;
    let best = -1;
    let bestD = STICKER_PX;
    this.def.features.forEach((f, idx) => {
      const p = featurePos(t, sToSample(this.def, t, f.s), f.side ?? 0);
      const d = Math.hypot(this.sx(p.x) - x, this.sy(p.z) - y);
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    });
    return best;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    e.preventDefault();
    const p = this.local(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.dragFrom = p;
    this.dragMoved = false;
    if (this.tab === 'draw') {
      this.stroke = [this.toWorld(p.x, p.y)];
      this.refresh();
      return;
    }
    if (this.tab === 'stickers') {
      this.dragSticker = this.hitSticker(p.x, p.y);
      return;
    }
    if (this.tab === 'shape') {
      const hit = this.hitPoint(p.x, p.y);
      if (hit >= 0) {
        this.dragPoint = hit;
        this.dragSnapshot = clone(this.def);
        this.pressTimer = window.setTimeout(() => {
          if (!this.dragMoved && this.dragPoint === hit) {
            this.dragPoint = -1;
            this.dragSnapshot = null;
            if (navigator.vibrate) navigator.vibrate(20);
            this.removePoint(hit);
          }
        }, LONG_PRESS_MS);
        return;
      }
      const now = performance.now();
      if (now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) {
        this.insertPoint(this.toWorld(p.x, p.y));
        this.lastTap.t = 0;
      } else this.lastTap = { t: now, x: p.x, y: p.y };
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!e.isPrimary || !this.dragFrom) return;
    const p = this.local(e);
    if (Math.hypot(p.x - this.dragFrom.x, p.y - this.dragFrom.y) > 6) this.dragMoved = true;
    if (this.stroke) {
      const w = this.toWorld(p.x, p.y);
      const last = this.stroke[this.stroke.length - 1];
      if (Math.hypot(w.x - last.x, w.z - last.z) > 1.5) this.stroke.push(w);
      this.draw();
      return;
    }
    if (this.dragPoint >= 0 && this.dragMoved) {
      clearTimeout(this.pressTimer);
      const w = this.toWorld(p.x, p.y);
      const g = TRACK.grid;
      const x = Math.max(LIMITS.coordMin, Math.min(LIMITS.coordMax, Math.round(w.x / g) * g)) || 0;
      const z = Math.max(LIMITS.coordMin, Math.min(LIMITS.coordMax, Math.round(w.z / g) * g)) || 0;
      const pt = this.def.points[this.dragPoint];
      if (pt.x !== x || pt.z !== z) {
        if (this.dragSnapshot) {
          this.history.commit(this.dragSnapshot);
          this.dragSnapshot = null;
        }
        this.def.points[this.dragPoint] = { ...pt, x, z };
        this.sel = this.dragPoint;
        this.preview = true;
        this.draw();
      }
      return;
    }
    if (this.dragSticker >= 0 && this.dragMoved) {
      this.ghost = { kind: this.def.features[this.dragSticker].kind, x: p.x, y: p.y };
      this.draw();
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    clearTimeout(this.pressTimer);
    const p = this.local(e);
    if (this.stroke) {
      const s = this.stroke;
      this.stroke = null;
      this.finishStroke(s);
    } else if (this.dragPoint >= 0) {
      const i = this.dragPoint;
      this.dragPoint = -1;
      this.preview = false;
      const moved = this.dragSnapshot === null;
      this.dragSnapshot = null;
      if (moved) {
        this.revalidate();
      } else {
        this.sel = this.sel === i ? -1 : i;
        this.refresh();
      }
      this.renderPanel();
    } else if (this.dragSticker >= 0) {
      const idx = this.dragSticker;
      this.dragSticker = -1;
      this.ghost = null;
      if (this.dragMoved) this.dropSticker(this.def.features[idx].kind, p.x, p.y, idx);
      else this.flipSticker(idx);
    } else if (this.tab === 'shape' && !this.dragMoved && this.sel >= 0) {
      this.sel = -1;
      this.renderPanel();
      this.refresh();
    }
    this.dragFrom = null;
  };

  private readonly onCancel = (): void => {
    clearTimeout(this.pressTimer);
    if (this.dragPoint >= 0 && !this.dragSnapshot) {
      const prev = this.history.undo(clone(this.def));
      if (prev) this.def = prev;
    }
    this.dragSnapshot = null;
    this.stroke = null;
    this.dragPoint = -1;
    this.dragSticker = -1;
    this.ghost = null;
    this.preview = false;
    this.dragFrom = null;
    this.revalidate();
  };

  private finishStroke(s: P2[]): void {
    const r = doodleToPoints(s, 2);
    if (!r.ok) {
      this.flash(r.reason === 'open' ? 'Close the loop: finish near where you started.' : 'Draw a bigger loop.');
      this.refresh();
      return;
    }
    const theme = this.def.theme;
    this.commit((d) => {
      const fresh = starterFeatures(r.points, theme);
      d.points = fresh.points;
      d.features = fresh.features;
    });
    this.flash(this.v.ok ? 'Nice track! Add stickers or race it.' : (firstMessage(this.v) ?? ''));
    this.setTab('shape');
  }

  private insertPoint(w: P2): void {
    const pts = this.def.points;
    if (pts.length >= LIMITS.maxPoints) return this.flash(`${LIMITS.maxPoints} points at most.`);
    const g = TRACK.grid;
    const q = { x: Math.round(w.x / g) * g || 0, z: Math.round(w.z / g) * g || 0 };
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const cost = Math.hypot(a.x - q.x, a.z - q.z) + Math.hypot(b.x - q.x, b.z - q.z) - Math.hypot(a.x - b.x, a.z - b.z);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    // only on (or right next to) the road
    if (bestCost > 24) return;
    const a = pts[best];
    const b = pts[(best + 1) % pts.length];
    if ((a.x === q.x && a.z === q.z) || (b.x === q.x && b.z === q.z)) return;
    this.commit((d) => {
      d.points.splice(best + 1, 0, { x: q.x, z: q.z, h: Math.round((a.h + b.h) / 2), w: a.w });
    });
    this.sel = best + 1;
    this.renderPanel();
  }

  private startTrayDrag(e: PointerEvent, kind: FeatureKind): void {
    e.preventDefault();
    const btn = e.currentTarget as HTMLElement;
    btn.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = this.local(ev);
      this.ghost = { kind, x: p.x, y: p.y };
      this.draw();
    };
    const up = (ev: PointerEvent) => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', cancel);
      const p = this.local(ev);
      this.ghost = null;
      const r = this.canvas.getBoundingClientRect();
      if (p.y >= 0 && p.y <= r.height && p.x >= 0 && p.x <= r.width) this.dropSticker(kind, p.x, p.y, -1);
      else this.draw();
    };
    const cancel = () => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', cancel);
      this.ghost = null;
      this.draw();
    };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', cancel);
  }

  /** Drop a sticker at screen (x, y). `idx` ≥ 0 moves an existing one; off the road removes it (not the start). */
  private dropSticker(kind: FeatureKind, x: number, y: number, idx: number): void {
    const t = this.v.built;
    if (!t) {
      this.flash('Draw a track first.');
      return this.refresh();
    }
    const w = this.toWorld(x, y);
    const near = nearestOnTrack(t, w.x, w.z);
    const onRoad = near.dist <= t.halfW[near.i] + 6;
    if (!onRoad) {
      if (idx < 0) return this.refresh();
      if (kind === 'start') {
        this.flash('The track needs its start 🏁.');
        return this.refresh();
      }
      this.commit((d) => {
        d.features.splice(idx, 1);
      });
      return;
    }
    const s = sampleToS(this.def, t, near.i);
    const side: -1 | 0 | 1 = SIDED.has(kind) && Math.abs(near.d) > t.halfW[near.i] * 0.33 ? (near.d > 0 ? 1 : -1) : 0;
    if (kind === 'start') {
      // the start moves (there is only one); other stickers keep their place on the map
      // feature `s` is measured from point 0, not from the start, so the other stickers stay put
      this.commit((d) => {
        d.features = [{ s, kind: 'start' }, ...d.features.filter((f) => f.kind !== 'start')];
      });
      return;
    }
    if (idx < 0 && this.def.features.length >= LIMITS.maxStickers) return this.flash(`${LIMITS.maxStickers} stickers at most.`);
    this.commit((d) => {
      const f = SIDED.has(kind) ? { s, kind, side } : { s, kind };
      if (idx >= 0) d.features[idx] = f;
      else d.features.push(f);
    });
  }

  private flipSticker(idx: number): void {
    const f = this.def.features[idx];
    if (!f || !SIDED.has(f.kind)) return this.refresh();
    const next = ((f.side ?? 0) === 0 ? -1 : f.side === -1 ? 1 : 0) as -1 | 0 | 1;
    this.commit((d) => {
      d.features[idx] = { ...f, side: next };
    });
    this.flash(next === 0 ? 'Centre' : next < 0 ? 'Left side' : 'Right side');
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Escape') void this.askClose();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel >= 0 && !(e.target instanceof HTMLInputElement)) this.removePoint(this.sel);
  };
}

export function openTrackDoodle(opts: EditorOptions, parent?: HTMLElement): TrackDoodle {
  const ed = new TrackDoodle(opts);
  ed.mount(parent);
  return ed;
}
