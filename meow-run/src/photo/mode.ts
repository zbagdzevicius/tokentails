// PHOTO lane: the photo screen (DOM + controller). Opened from the pause card; never resumes the run itself.
import * as THREE from 'three';
import { camera, isTouch, renderer, scene } from '../core/engine';
import { events } from '../core/events';
import { addFrameHook } from '../core/loop';
import { kittenRig, P } from '../core/player';
import { game, prefs } from '../core/state';
import { save, screen, setSave, setScreen } from '../ui/flow';
import { isPoseable, POSES, ugc, type PoseId } from '../ugc/contract';
import { addScreen, onScreen, openOverlay, toast } from '../ugc/hub';
import { downloadBlob, fileStem, shareOrDownload, WATERMARK } from '../ugc/sharekit';
import { bindGestures, goPreset, orbit, orbitBy, orbitState, setDist, setFraming, setRoll, startCamera, stopCamera } from './camera';
import { FILTER_CSS, FILTER_LABEL, FILTERS, isFilterId, type FilterId } from './filters';
import { drawFrame, drawWatermark, FRAME_LABEL, FRAMES, isFrameId, type FrameId } from './frames';
import { ICON, POSE_ICON } from './icons';
import { clearLive, onLiveResize, setDreamyLayer, setLiveFilter } from './live';
import { DEG, DIST_MAX, DIST_MIN, PRESET_IDS, ROLL_MAX, type PresetId } from './orbit';
import { capture, shutterSound, tick, toPng, type CropRect } from './shutter';
import {
  clampSize,
  fromPx,
  MAX_STICKERS,
  SIZE_START,
  SIZE_STEP,
  stickerDef,
  STICKER_IDS,
  STICKERS,
  stickerSvg,
  type Placed,
  type StickerId,
} from './stickers';
import './photo.css';

type Tab = 'camera' | 'filter' | 'stickers' | 'frame' | 'pose';
const TABS: readonly Tab[] = ['camera', 'filter', 'stickers', 'frame', 'pose'];
const TAB_LABEL: Record<Tab, string> = { camera: 'CAMERA', filter: 'FILTER', stickers: 'STICKERS', frame: 'FRAME', pose: 'POSE' };
const POSE_LABEL: Record<PoseId, string> = { sit: 'SIT', wave: 'WAVE', loaf: 'LOAF', stretch: 'STRETCH', leap: 'LEAP', proud: 'PROUD' };
const PRESET_LABEL: Record<PresetId, string> = { hero: 'HERO', front: 'FACE', side: 'SIDE', low: 'LOW', top: 'TOP', wide: 'WIDE' };
/** the exported shape: 9:16 (Stories, TikTok), 4:5 (feed), 1:1, or the whole screen */
type Shape = '9:16' | '4:5' | '1:1' | 'full';
const SHAPES: readonly Shape[] = ['9:16', '4:5', '1:1', 'full'];
const SHAPE_RATIO: Record<Shape, number> = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, full: 0 };
const SHAPE_LABEL: Record<Shape, string> = { '9:16': '9:16', '4:5': '4:5', '1:1': '1:1', full: 'SCREEN' };
/** stickers that sit on her head (snapped there when added) */
const HEAD_STICKERS: Partial<Record<StickerId, number>> = { crown: 0.42, shades: 0.06, bow: 0.3 };

const st = {
  open: false,
  tab: 'camera' as Tab,
  filter: 'none' as FilterId,
  frame: 'none' as FrameId,
  pose: null as PoseId | null,
  stickers: [] as Placed[],
  sel: null as number | null,
  clean: false,
  busy: false,
  uid: 1,
  /** until the player picks a shape: a phone held upright makes 9:16 (what it posts), otherwise the whole screen */
  shape: 'full' as Shape,
  shapePicked: false,
};
const defaultShape = (): Shape => ((isTouch || Math.min(innerWidth, innerHeight) < 600) && innerHeight > innerWidth ? '9:16' : 'full');
/** the free part of the screen (css px) and where Mochi sits in it */
const free = { x: 0, y: 0, w: 1, h: 1, cx: 0.5, cy: 0.5 };
/** the export crop (css px) */
const crop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
const shapeBtns = new Map<Shape, HTMLButtonElement>();
let poseEaseUntil = 0;
let lastFrame = 0;
let unhook: (() => void) | null = null;
let preview: { close(): void } | null = null;

// ---------------------------------------------------------------- DOM
let sec: HTMLElement;
let layer: HTMLElement;
let frameCv: HTMLCanvasElement;
let stkLayer: HTMLElement;
let flashEl: HTMLElement;
let eyeBtn: HTMLButtonElement;
let shutterBtn: HTMLButtonElement;
let rollIn: HTMLInputElement;
let zoomIn: HTMLInputElement;
let selRow: HTMLElement;
let countEl: HTMLElement;
let poseNote: HTMLElement;
const panels = new Map<Tab, HTMLElement>();
const tabBtns = new Map<Tab, HTMLButtonElement>();
const filterBtns = new Map<FilterId, HTMLButtonElement>();
const frameBtns = new Map<FrameId, HTMLButtonElement>();
const poseBtns = new Map<PoseId | 'none', HTMLButtonElement>();
const stkEls = new Map<number, HTMLElement>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
function btn(cls: string, label: string, parent: HTMLElement, onClick: () => void, html = ''): HTMLButtonElement {
  const b = el('button', cls, parent);
  b.type = 'button';
  b.innerHTML = html;
  if (label) {
    const s = el('span', 'photo-lbl', b);
    s.textContent = label;
  }
  b.addEventListener('click', () => {
    try {
      onClick();
    } catch (err) {
      console.error('photo control failed', err);
    }
  });
  return b;
}

function build(): void {
  sec = addScreen('photo');
  sec.setAttribute('aria-label', 'Photo mode');
  layer = el('div', 'photo-layer', sec);
  const dreamy = el('div', 'photo-dreamy hidden', sec);
  setDreamyLayer(dreamy);
  frameCv = el('canvas', 'photo-frame', sec);
  stkLayer = el('div', 'photo-stickers', sec);
  flashEl = el('div', 'photo-flash', sec);

  // top bar: back, title, surprise, hide UI
  const top = el('div', 'photo-top', sec);
  const back = btn('iconbtn photo-back', '', top, () => closePhoto(true), ICON.back);
  back.setAttribute('aria-label', 'Back to pause');
  const title = el('div', 'photo-title', top);
  title.textContent = 'PHOTO MODE';
  const dice = btn('iconbtn photo-dice', '', top, surprise, ICON.dice);
  dice.setAttribute('aria-label', 'Surprise me');
  dice.title = 'Surprise me';
  eyeBtn = btn('iconbtn photo-eye', '', top, () => setClean(!st.clean), ICON.eye);
  eyeBtn.setAttribute('aria-label', 'Hide the controls');

  // bottom: shutter + tray (panel above the tabs)
  const bottom = el('div', 'photo-bottom', sec);
  shutterBtn = btn('photo-shutter', '', bottom, () => void shoot().catch((e) => console.error('photo failed', e)));
  shutterBtn.setAttribute('aria-label', 'Take the photo');
  const tray = el('div', 'photo-tray', bottom);
  const panelHost = el('div', 'photo-panels', tray);
  const tabs = el('div', 'photo-tabs', tray);
  tabs.setAttribute('role', 'tablist');
  for (const t of TABS) {
    const b = btn('photo-tab', TAB_LABEL[t], tabs, () => {
      tick();
      setTab(t);
    });
    b.id = `photoTab-${t}`;
    b.setAttribute('role', 'tab');
    tabBtns.set(t, b);
    const p = el('div', `photo-panel photo-panel-${t}`, panelHost);
    p.setAttribute('role', 'tabpanel');
    panels.set(t, p);
  }

  // CAMERA: presets + roll + zoom
  const cam = panels.get('camera')!;
  const presets = el('div', 'photo-row photo-scroll', cam);
  for (const id of PRESET_IDS) {
    const b = btn('photo-chip', PRESET_LABEL[id], presets, () => {
      tick();
      goPreset(id);
      syncSliders(true);
    });
    b.id = `photoView-${id}`;
  }
  const sliders = el('div', 'photo-row photo-sliders', cam);
  const roll = el('label', 'photo-slider', sliders);
  roll.append('ROLL');
  rollIn = el('input', '', roll);
  Object.assign(rollIn, { type: 'range', min: String(-ROLL_MAX / DEG), max: String(ROLL_MAX / DEG), step: '1', value: '0' });
  rollIn.addEventListener('input', () => setRoll(Number(rollIn.value) * DEG));
  rollIn.addEventListener('dblclick', () => {
    rollIn.value = '0';
    setRoll(0);
  });
  const zoom = el('label', 'photo-slider', sliders);
  zoom.append('ZOOM');
  zoomIn = el('input', '', zoom);
  Object.assign(zoomIn, { type: 'range', min: '0', max: '1000', step: '1' });
  zoomIn.addEventListener('input', () => setDist(DIST_MAX - (Number(zoomIn.value) / 1000) * (DIST_MAX - DIST_MIN)));
  const hint = el('p', 'photo-hint', cam);
  hint.innerHTML = '<span class="kb">Drag to orbit, wheel to zoom, right-drag or WASD to move</span><span class="tc">Drag to orbit, pinch to zoom, two fingers to move</span>';

  // FILTER
  const fil = el('div', 'photo-row photo-scroll', panels.get('filter')!);
  for (const id of FILTERS) {
    const b = btn('photo-chip', FILTER_LABEL[id], fil, () => {
      tick();
      setFilter(id);
    }, `<span class="photo-sw photo-sw-${id}"></span>`);
    b.id = `photoFilter-${id}`;
    const sw = b.querySelector('.photo-sw') as HTMLElement;
    if (FILTER_CSS[id]) sw.style.filter = FILTER_CSS[id].replace(/blur\([^)]*\)/, '');
    filterBtns.set(id, b);
  }

  // STICKERS: the sheet + the selected sticker's controls
  const stk = panels.get('stickers')!;
  const sheet = el('div', 'photo-row photo-scroll', stk);
  for (const def of STICKERS) {
    const b = btn('photo-chip photo-stkbtn', '', sheet, () => {
      tick(true);
      addSticker(def.id);
    }, stickerSvg(def));
    b.id = `photoSticker-${def.id}`;
    b.setAttribute('aria-label', `Add sticker: ${def.label}`);
  }
  selRow = el('div', 'photo-row photo-selrow', stk);
  countEl = el('span', 'photo-count', selRow);
  const ctl = (id: string, label: string, icon: string, fn: () => void) => {
    const b = btn('iconbtn photo-mini', '', selRow, fn, icon);
    b.id = id;
    b.setAttribute('aria-label', label);
    b.title = label;
  };
  ctl('photoStkSmaller', 'Smaller', ICON.minus, () => scaleSel(1 / SIZE_STEP));
  ctl('photoStkBigger', 'Bigger', ICON.plus, () => scaleSel(SIZE_STEP));
  ctl('photoStkRotL', 'Rotate left', ICON.rotL, () => rotateSel(-15 * DEG));
  ctl('photoStkRotR', 'Rotate right', ICON.rotR, () => rotateSel(15 * DEG));
  ctl('photoStkFront', 'Bring to front', ICON.front, frontSel);
  ctl('photoStkDelete', 'Delete sticker', ICON.trash, deleteSel);

  // FRAME: the shape row, then thumbnails painted by the same painter as the photo
  const shapes = el('div', 'photo-row photo-shapes', panels.get('frame')!);
  for (const id of SHAPES) {
    const b = btn('photo-chip photo-shape', SHAPE_LABEL[id], shapes, () => {
      tick();
      st.shapePicked = true;
      setShape(id);
    });
    b.id = `photoShape-${id.replace(':', 'x')}`;
    shapeBtns.set(id, b);
  }
  const fr = el('div', 'photo-row photo-scroll', panels.get('frame')!);
  for (const id of FRAMES) {
    const b = btn('photo-chip photo-framebtn', FRAME_LABEL[id], fr, () => {
      tick();
      setFrame(id);
    });
    b.id = `photoFrame-${id}`;
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 76;
    b.prepend(c);
    paintThumb(c, id);
    frameBtns.set(id, b);
  }

  // POSE
  const po = panels.get('pose')!;
  const prow = el('div', 'photo-row photo-scroll', po);
  for (const id of ['none', ...POSES] as const) {
    const b = btn('photo-chip', id === 'none' ? 'RUN' : POSE_LABEL[id], prow, () => {
      tick();
      setPose(id === 'none' ? null : id);
    }, POSE_ICON[id] ?? '');
    b.id = `photoPose-${id}`;
    poseBtns.set(id, b);
  }
  poseNote = el('p', 'photo-hint photo-posenote hidden', po);
  poseNote.textContent = 'Poses are not available for this cat yet.';

  bindGestures(layer, onLayerTap); // the screen lives for the whole page, so the gestures do too
  setTab('camera');
}

function paintThumb(c: HTMLCanvasElement, id: FrameId): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, '#8fd3ff');
  g.addColorStop(0.55, '#bfe6a0');
  g.addColorStop(1, '#ffb03a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ff9a3c';
  ctx.beginPath();
  ctx.ellipse(c.width / 2, c.height * 0.62, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  drawFrame(ctx, id, c.width, c.height, { caption: 'Mochi', stageName: 'Meadow' });
}

// ---------------------------------------------------------------- state changes
function setTab(t: Tab): void {
  st.tab = t;
  for (const [k, b] of tabBtns) b.setAttribute('aria-selected', String(k === t));
  for (const [k, p] of panels) p.classList.toggle('hidden', k !== t);
  // the tray's height changes with the tab: re-frame Mochi
  if (st.open) requestAnimationFrame(measure);
  if (t === 'pose') refreshPoses();
  if (t === 'camera') syncSliders(true);
}

function setFilter(id: FilterId): void {
  st.filter = id;
  for (const [k, b] of filterBtns) b.classList.toggle('on', k === id);
  if (st.open) setLiveFilter(id);
}

function setFrame(id: FrameId): void {
  st.frame = id;
  for (const [k, b] of frameBtns) b.classList.toggle('on', k === id);
  drawOverlay();
}

function setShape(id: Shape): void {
  st.shape = id;
  for (const [k, b] of shapeBtns) b.classList.toggle('on', k === id);
  measure();
}

/** where the controls leave room: Mochi is framed in the middle of it, and the export crop is centred on her */
function measure(): void {
  if (!st.open) return;
  const W = Math.max(1, innerWidth);
  const H = Math.max(1, innerHeight);
  let l = 0;
  let t = 0;
  let r = W;
  let b = H;
  if (!st.clean) {
    const top = sec.querySelector('.photo-top') as HTMLElement | null;
    const bottom = sec.querySelector('.photo-bottom') as HTMLElement | null;
    const tr = top?.getBoundingClientRect();
    if (tr && tr.height > 0) t = Math.max(t, Math.min(H * 0.4, tr.bottom));
    for (const e of [bottom, shutterBtn]) {
      const q = e?.getBoundingClientRect();
      if (!q || q.width <= 0 || q.height <= 0) continue;
      if (q.width > W * 0.6) b = Math.min(b, Math.max(H * 0.45, q.top));
      else if (q.left > W * 0.45) r = Math.min(r, Math.max(W * 0.45, q.left));
      else if (q.top > H * 0.45) b = Math.min(b, Math.max(H * 0.45, q.top));
    }
  }
  free.x = l;
  free.y = t;
  free.w = r - l;
  free.h = b - t;
  // a touch low: the orbit target is her middle, and her ears and a hat need the room above
  free.cx = (l + r) / 2;
  free.cy = t + (b - t) * 0.56;
  setFraming((2 * free.cx) / W - 1, 1 - (2 * free.cy) / H);
  // the crop: the largest rect of the shape on screen, centred on her, kept on screen
  const ratio = SHAPE_RATIO[st.shape];
  if (!ratio) Object.assign(crop, { x: 0, y: 0, w: W, h: H });
  else {
    let cw = W;
    let ch = W / ratio;
    if (ch > H) {
      ch = H;
      cw = H * ratio;
    }
    crop.w = cw;
    crop.h = ch;
    crop.x = Math.max(0, Math.min(W - cw, free.cx - cw / 2));
    crop.y = Math.max(0, Math.min(H - ch, free.cy - ch / 2));
  }
  drawOverlay();
}

function frameInfo() {
  let name = '';
  try {
    name = ugc.playerName();
  } catch {
    name = '';
  }
  return { caption: name || 'Mochi', stageName: game.stage?.name ?? '' };
}

/** the live frame + watermark overlay inside the crop (painted by the same code as the export), and the crop guide:
 *  everything outside the exported shape is dimmed */
function drawOverlay(): void {
  if (!frameCv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(innerWidth * dpr));
  const h = Math.max(1, Math.round(innerHeight * dpr));
  if (frameCv.width !== w || frameCv.height !== h) {
    frameCv.width = w;
    frameCv.height = h;
  }
  const ctx = frameCv.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const full = crop.w >= innerWidth - 1 && crop.h >= innerHeight - 1;
  const cx = Math.round(crop.x * dpr);
  const cy = Math.round(crop.y * dpr);
  const cw = full ? w : Math.round(crop.w * dpr);
  const ch = full ? h : Math.round(crop.h * dpr);
  if (!full) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,10,0.5)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(cx, cy, cw, ch);
    ctx.fill('evenodd');
    ctx.setLineDash([10 * dpr, 7 * dpr]);
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = 'rgba(255,247,234,0.85)';
    ctx.strokeRect(cx + dpr, cy + dpr, cw - 2 * dpr, ch - 2 * dpr);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(cx, cy);
  drawFrame(ctx, st.frame, cw, ch, frameInfo());
  drawWatermark(ctx, st.frame, cw, ch, WATERMARK);
  ctx.restore();
}

function refreshPoses(): void {
  const ok = isPoseable(kittenRig());
  for (const [k, b] of poseBtns) {
    b.disabled = !ok;
    b.classList.toggle('on', ok && (k === 'none' ? st.pose === null : st.pose === k));
  }
  poseNote?.classList.toggle('hidden', ok);
}

function setPose(id: PoseId | null): void {
  const rig = kittenRig();
  if (!isPoseable(rig)) return;
  if (st.pose !== null && id === null) poseEaseUntil = performance.now() + 1200;
  st.pose = id;
  try {
    rig.setPose(id);
  } catch (err) {
    console.error('setPose failed', err);
  }
  refreshPoses();
}

function setClean(on: boolean): void {
  st.clean = on;
  sec.classList.toggle('photo-clean', on);
  if (st.open) measure();
  eyeBtn.innerHTML = on ? ICON.eyeOff : ICON.eye;
  eyeBtn.setAttribute('aria-label', on ? 'Show the controls' : 'Hide the controls');
}

function onLayerTap(): void {
  if (st.clean) setClean(false);
  else select(null);
}

let sliderDist = -1;
let sliderRoll = 99;
function syncSliders(force = false): void {
  if (!zoomIn) return;
  if (force || Math.abs(sliderDist - orbit.dist) > 0.01) {
    sliderDist = orbit.dist;
    if (document.activeElement !== zoomIn) zoomIn.value = String(Math.round(((DIST_MAX - orbit.dist) / (DIST_MAX - DIST_MIN)) * 1000));
  }
  if (force || Math.abs(sliderRoll - orbit.roll) > 0.001) {
    sliderRoll = orbit.roll;
    if (document.activeElement !== rollIn) rollIn.value = String(Math.round(orbit.roll / DEG));
  }
}

// ---------------------------------------------------------------- stickers
function addSticker(id: StickerId): boolean {
  if (!stickerDef(id)) return false;
  if (st.stickers.length >= MAX_STICKERS) {
    toast(`Up to ${MAX_STICKERS} stickers`);
    return false;
  }
  const spot = stickerSpot(id);
  const s: Placed = { uid: st.uid++, id, x: spot.x, y: spot.y, size: spot.size, rot: spot.head ? 0 : (Math.random() - 0.5) * 0.3 };
  st.stickers.push(s);
  renderStickers();
  select(s.uid);
  return true;
}

const pv = new THREE.Vector3();
const pv2 = new THREE.Vector3();
/** screen px of a world point (null behind the camera) */
function toScreen(v: THREE.Vector3): { x: number; y: number } | null {
  pv2.copy(v).project(camera);
  if (pv2.z > 1 || pv2.z < -1) return null;
  return { x: ((pv2.x + 1) / 2) * innerWidth, y: ((1 - pv2.y) / 2) * innerHeight };
}
/**
 * Where a new sticker goes: head stickers (crown, sunglasses, bow) snap onto her projected head; the rest go to free
 * slots around her (corners first, then the sides), never on her face, inside the export crop.
 */
function stickerSpot(id: StickerId): { x: number; y: number; size: number; head: boolean } {
  const W = Math.max(1, innerWidth);
  const H = Math.max(1, innerHeight);
  camera.updateMatrixWorld();
  const rig = kittenRig() as (ReturnType<typeof kittenRig> & { head?: THREE.Object3D }) | null;
  const lift = HEAD_STICKERS[id];
  if (lift !== undefined && rig?.head) {
    rig.head.getWorldPosition(pv).addScaledVector(P.world.up, lift - 0.05);
    const p = toScreen(pv);
    if (p) {
      // about head-sized: measure 0.5 u across her head on screen
      rig.head.getWorldPosition(pv2).addScaledVector(camera.up, 0.5);
      const q = toScreen(pv2);
      const span = q ? Math.hypot(q.x - p.x, q.y - p.y) : 60;
      const size = clampSize(Math.max(40, span * 1.25) / Math.min(W, H));
      return { x: p.x / W, y: p.y / H, size, head: true };
    }
  }
  // her middle and an on-screen radius
  pv.copy(P.world.pos).addScaledVector(P.world.up, 0.6);
  const c = toScreen(pv) ?? { x: free.cx, y: free.cy };
  pv.addScaledVector(P.world.up, 0.9);
  const top = toScreen(pv);
  const rad = Math.max(60, top ? Math.hypot(top.x - c.x, top.y - c.y) * 1.25 : 90);
  const size = SIZE_START;
  const half = (size * Math.min(W, H)) / 2;
  const slots = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [-1.25, 0],
    [1.25, 0],
    [0, -1.3],
    [0, 1.3],
  ];
  const x0 = crop.x + half + 6;
  const x1 = crop.x + crop.w - half - 6;
  const y0 = Math.max(crop.y, free.y) + half + 6;
  const y1 = Math.min(crop.y + crop.h, free.y + free.h) - half - 6;
  let best: { x: number; y: number } | null = null;
  let bestScore = -1;
  for (const [sx, sy] of slots) {
    const x = Math.max(x0, Math.min(x1, c.x + sx * rad));
    const y = Math.max(y0, Math.min(y1, c.y + sy * rad * 0.85));
    // distance to her and to the stickers already there
    let near = Math.hypot(x - c.x, y - c.y) / rad;
    for (const o of st.stickers) near = Math.min(near, Math.hypot(x - o.x * W, y - o.y * H) / (half * 2));
    if (near > bestScore + 0.2) {
      bestScore = near;
      best = { x, y };
    }
  }
  const b = best ?? { x: c.x + rad, y: c.y - rad };
  return { x: b.x / W, y: b.y / H, size, head: false };
}

function selected(): Placed | undefined {
  return st.stickers.find((s) => s.uid === st.sel);
}
function select(uid: number | null): void {
  st.sel = uid;
  for (const [k, e] of stkEls) e.classList.toggle('sel', k === uid);
  refreshSelRow();
}
function refreshSelRow(): void {
  if (!selRow) return;
  const has = !!selected();
  for (const b of selRow.querySelectorAll('button')) (b as HTMLButtonElement).disabled = !has;
  countEl.textContent = `${st.stickers.length}/${MAX_STICKERS}`;
}
function scaleSel(k: number): void {
  const s = selected();
  if (!s) return;
  s.size = clampSize(s.size * k);
  placeEl(s);
}
function rotateSel(d: number): void {
  const s = selected();
  if (!s) return;
  s.rot += d;
  placeEl(s);
}
function frontSel(): void {
  const s = selected();
  if (!s) return;
  st.stickers.splice(st.stickers.indexOf(s), 1);
  st.stickers.push(s);
  renderStickers();
}
function deleteSel(): void {
  const s = selected();
  if (!s) return;
  st.stickers.splice(st.stickers.indexOf(s), 1);
  tick();
  select(null);
  renderStickers();
}

function placeEl(s: Placed): void {
  const e = stkEls.get(s.uid);
  if (!e) return;
  const px = s.size * Math.min(innerWidth, innerHeight);
  e.style.left = `${s.x * 100}%`;
  e.style.top = `${s.y * 100}%`;
  e.style.width = `${px}px`;
  e.style.height = `${px}px`;
  e.style.transform = `translate(-50%, -50%) rotate(${s.rot}rad)`;
}

function renderStickers(): void {
  if (!stkLayer) return;
  const live = new Set(st.stickers.map((s) => s.uid));
  for (const [uid, e] of stkEls)
    if (!live.has(uid)) {
      e.remove();
      stkEls.delete(uid);
    }
  for (const s of st.stickers) {
    let e = stkEls.get(s.uid);
    if (!e) {
      e = el('div', 'photo-stk');
      e.dataset.uid = String(s.uid);
      e.innerHTML = stickerSvg(stickerDef(s.id)!);
      bindSticker(e, s.uid);
      stkEls.set(s.uid, e);
    }
    stkLayer.appendChild(e); // keeps DOM order = draw order
    e.classList.toggle('sel', s.uid === st.sel);
    placeEl(s);
  }
  refreshSelRow();
}

/** drag (one pointer) or pinch + twist (two pointers) a sticker */
function bindSticker(e: HTMLElement, uid: number): void {
  const pts = new Map<number, { x: number; y: number }>();
  let d0 = 0;
  let a0 = 0;
  const two = () => {
    const it = pts.values();
    const p = it.next().value!;
    const q = it.next().value!;
    return { d: Math.hypot(p.x - q.x, p.y - q.y), a: Math.atan2(q.y - p.y, q.x - p.x) };
  };
  e.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (pts.size >= 2) return;
    e.setPointerCapture?.(ev.pointerId);
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (st.sel !== uid) select(uid);
    if (pts.size === 2) {
      const g = two();
      d0 = g.d;
      a0 = g.a;
    }
  });
  e.addEventListener('pointermove', (ev) => {
    const p = pts.get(ev.pointerId);
    const s = st.stickers.find((x) => x.uid === uid);
    if (!p || !s) return;
    const dx = ev.clientX - p.x;
    const dy = ev.clientY - p.y;
    p.x = ev.clientX;
    p.y = ev.clientY;
    if (pts.size >= 2) {
      const g = two();
      if (d0 > 8) s.size = clampSize(s.size * (g.d / d0));
      s.rot += g.a - a0;
      d0 = g.d;
      a0 = g.a;
    } else {
      const n = fromPx(s.x * innerWidth + dx, s.y * innerHeight + dy, innerWidth, innerHeight);
      s.x = n.x;
      s.y = n.y;
    }
    placeEl(s);
  });
  const up = (ev: PointerEvent) => {
    pts.delete(ev.pointerId);
  };
  e.addEventListener('pointerup', up);
  e.addEventListener('pointercancel', up);
  e.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const s = st.stickers.find((x) => x.uid === uid);
      if (!s) return;
      s.size = clampSize(s.size * Math.exp(-ev.deltaY * 0.0015));
      placeEl(s);
    },
    { passive: false },
  );
}

// ---------------------------------------------------------------- surprise me
function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
function surprise(): void {
  tick(true);
  goPreset(pick(PRESET_IDS.filter((p) => p !== 'wide')));
  setFilter(pick(FILTERS.filter((f) => f !== st.filter)));
  setFrame(pick(FRAMES.filter((f) => f !== 'none' && f !== st.frame)));
  // the sticker lands on a free slot around her (or on her head), never over her face
  if (st.stickers.length < 4) addSticker(pick(STICKER_IDS));
  const rig = kittenRig();
  if (isPoseable(rig) && Math.random() < 0.7) setPose(pick(POSES));
}

// ---------------------------------------------------------------- shutter + preview
export interface ShotResult {
  w: number;
  h: number;
  size: number;
}

async function shoot(): Promise<ShotResult> {
  if (!st.open || st.busy) throw new Error('photo mode is not ready');
  st.busy = true;
  sec.classList.add('photo-shooting');
  try {
    const cv = capture({ filter: st.filter, frame: st.frame, stickers: st.stickers, info: frameInfo(), crop: { ...crop } });
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
    shutterSound();
    setSave({ ...save, ugcStats: { ...save.ugcStats, photos: (save.ugcStats?.photos ?? 0) + 1 } });
    const blob = await toPng(cv);
    openPreview(blob, cv.width, cv.height);
    return { w: cv.width, h: cv.height, size: blob.size };
  } finally {
    st.busy = false;
    setTimeout(() => sec.classList.remove('photo-shooting'), prefs.reducedMotion ? 120 : 380);
  }
}

function openPreview(blob: Blob, w: number, h: number): void {
  closePreview();
  const ov = openOverlay('photo-preview');
  const url = URL.createObjectURL(blob);
  const file = new File([blob], `${fileStem('photo')}.png`, { type: 'image/png' });
  const card = el('div', 'card', ov.el);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Your photo');
  const h2 = el('h2', '', card);
  h2.textContent = 'Purr-fect shot!';
  const fig = el('div', 'photo-print', card);
  const img = el('img', '', fig);
  img.src = url;
  img.alt = 'Your Meow Run photo';
  img.width = w;
  img.height = h;
  const sub = el('p', 'photo-sub', card);
  sub.textContent = 'Share it with #MeowRun';
  const row = el('div', 'row photo-actions', card);
  const share = btn('btn gold', 'SHARE', row, () => {
    // iOS: the file is ready, so the share sheet opens inside this tap
    void shareOrDownload({ file, title: 'Meow Run', text: 'Mochi strikes a pose!' }).then((o) => {
      if (o === 'shared') toast('Shared!');
      else if (o === 'downloaded') toast('Photo saved');
      else if (o === 'failed') toast('Could not share the photo');
    });
  }, `<span class="ugc-ico">${ICON.share}</span>`);
  share.id = 'photoShare';
  const dl = btn('btn alt', 'SAVE', row, () => {
    downloadBlob(blob, file.name);
    toast('Photo saved');
  }, `<span class="ugc-ico">${ICON.save}</span>`);
  dl.id = 'photoSave';
  const bk = btn('btn alt', 'BACK', row, closePreview);
  bk.id = 'photoPreviewBack';
  ov.el.addEventListener('click', (e) => {
    if (e.target === ov.el) closePreview();
  });
  preview = {
    close: () => {
      ov.close();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  share.focus({ preventScroll: true });
}
function closePreview(): void {
  if (!preview) return;
  const p = preview;
  preview = null;
  p.close();
}

// ---------------------------------------------------------------- open / close
function frameHook(): void {
  const now = performance.now();
  const rd = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  const rig = kittenRig();
  // poses ease with real time; without one Mochi stays frozen mid-action (the paused frame)
  if (rig && (st.pose !== null || now < poseEaseUntil)) rig.animate(rd, now / 1000, P);
  if (st.tab === 'camera') syncSliders();
  renderer.render(scene, camera);
}

function onKey(e: KeyboardEvent): void {
  if (!st.open) return;
  const t = e.target as HTMLElement | null;
  if (t && t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') return;
  if (e.code === 'Escape') {
    e.preventDefault();
    if (preview) closePreview();
    else closePhoto(true);
  } else if (e.code === 'KeyH' && !preview) setClean(!st.clean);
  else if ((e.code === 'Delete' || e.code === 'Backspace') && !preview && st.sel !== null) {
    e.preventDefault();
    deleteSel();
  }
}

function onResize(): void {
  if (!st.open) return;
  onLiveResize();
  // turning the phone: the default shape follows (a picked one stays)
  if (!st.shapePicked && st.shape !== defaultShape()) setShape(defaultShape());
  measure();
  for (const s of st.stickers) placeEl(s);
}

/** enter photo mode (only while paused) */
export function openPhoto(): void {
  if (st.open || game.mode !== 'paused' || !sec) return;
  st.open = true;
  setClean(false);
  st.pose = null;
  poseEaseUntil = 0;
  startCamera();
  setFilter(st.filter);
  setFrame(st.frame);
  renderStickers();
  lastFrame = performance.now();
  unhook = addFrameHook(frameHook);
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  setScreen('photo');
  setTab(st.tab);
  setShape(st.shapePicked ? st.shape : defaultShape());
  refreshPoses();
  measure();
}

function cleanup(): void {
  if (!st.open) return;
  st.open = false;
  closePreview();
  if (st.pose !== null) {
    const rig = kittenRig();
    if (isPoseable(rig))
      try {
        rig.setPose(null);
      } catch (err) {
        console.error('setPose failed', err);
      }
    st.pose = null;
  }
  unhook?.();
  unhook = null;
  removeEventListener('keydown', onKey);
  removeEventListener('resize', onResize);
  stopCamera();
  setFraming(0, 0);
  clearLive();
  setClean(false);
  sec.classList.remove('photo-shooting');
}

/** leave photo mode; toPause = back to the pause card (never resumes the run) */
export function closePhoto(toPause = true): void {
  if (!st.open) return;
  cleanup();
  if (toPause && screen() === 'photo') setScreen(game.mode === 'paused' ? 'pause' : 'play');
}

export function initPhotoMode(): void {
  build();
  // someone else moved the screen (quit, resume, a link): tidy up without touching the screen
  onScreen((s) => {
    if (st.open && s !== 'photo') cleanup();
  });
  for (const ev of ['resume', 'quit', 'stageStart', 'stageLoad'] as const) events.on(ev, () => closePhoto(false));
}

// ---------------------------------------------------------------- test hook API
export const photoApi = {
  open: openPhoto,
  close: () => closePhoto(true),
  state: () => ({
    open: st.open,
    filter: st.filter,
    frame: st.frame,
    stickers: st.stickers.length,
    pose: st.pose,
    poseable: isPoseable(kittenRig()),
    tab: st.tab,
    shape: st.shape,
    crop: { ...crop },
    preview: !!preview,
    ...orbitState(),
  }),
  setFilter: (id: string) => {
    if (isFilterId(id)) setFilter(id);
  },
  setFrame: (id: string) => {
    if (isFrameId(id)) setFrame(id);
  },
  setTab: (t: string) => {
    if ((TABS as readonly string[]).includes(t)) setTab(t as Tab);
  },
  addSticker: (id: string) => addSticker(id as StickerId),
  setShape: (id: string) => {
    if ((SHAPES as readonly string[]).includes(id)) {
      st.shapePicked = true;
      setShape(id as Shape);
    }
  },
  stickers: () => st.stickers.map((s) => ({ id: s.id, x: s.x, y: s.y, size: s.size })),
  clearStickers: () => {
    st.stickers.length = 0;
    select(null);
    renderStickers();
  },
  /** degrees, degrees, units (added to the distance) */
  orbit: (dYaw: number, dPitch: number, dDist = 0) => {
    orbitBy(dYaw * DEG, dPitch * DEG, 1);
    setDist(orbit.dist + dDist);
  },
  preset: (id: string) => {
    if ((PRESET_IDS as readonly string[]).includes(id)) goPreset(id as PresetId);
  },
  setPose: (id: string | null) => setPose(id === null || id === 'none' ? null : (id as PoseId)),
  shoot,
  closePreview,
};
