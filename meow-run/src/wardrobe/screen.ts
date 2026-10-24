// The Wardrobe screen (addScreen('wardrobe')): a live 3D Mochi wearing the draft look in the title attract scene
// (slow auto-orbit, drag to spin, wheel / pinch to zoom, a pose button), tabs FUR / PATTERN / EYES / HAT / SCARF /
// TRAIL FX, item tiles drawn on canvas (each tile shows Mochi wearing that item), locked tiles with their rule and a
// progress bar (tap one to try it on anyway), NEW badges, RANDOM (owned only), DONE (saves), back / Esc (discards).
import * as THREE from 'three';
import { attractFocus, setCameraOverride } from '../core/camera';
import { scene } from '../core/engine';
import { burst } from '../core/fx';
import { addFrameHook } from '../core/loop';
import { placeOnTrack } from '../core/place';
import { game, prefs } from '../core/state';
import { newFrame } from '../core/track';
import type { PlayerView } from '../core/types';
import { Mochi } from '../cat/mochi';
import { addScreen, refreshHub, toast } from '../ugc/hub';
import { POSES, type PoseId } from '../ugc/contract';
import { screen, setScreen } from '../ui/flow';
import { drawLookPortrait } from '../ui/portrait';
import { CATALOG, furColors, itemAt, SLOT_LABELS, type Item } from './catalog';
import { css, luma } from './color';
import { LOOK_SLOTS, type Look, type LookSlot } from './look';
import { drawFxIcon } from './paint2d';
import { equipped, newNow, owns, progressNow, saveLook } from './state';
import { hideRunner } from './attract';
import { ruleProgress, ruleText } from './unlocks';
import './wardrobe.css';

const ICON: Record<LookSlot, string> = {
  fur: '<svg viewBox="0 0 24 24"><g fill="currentColor"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="6" cy="10" r="2.2"/><circle cx="9.6" cy="6.4" r="2.2"/><circle cx="14.4" cy="6.4" r="2.2"/><circle cx="18" cy="10" r="2.2"/></g></svg>',
  pattern: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 4.5 Q10 12 8 19.5 M12 3 Q14 12 12 21 M16 4.5 Q18 12 16 19.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  eyes: '<svg viewBox="0 0 24 24"><path d="M2 12 Q12 3 22 12 Q12 21 2 12Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="12" cy="12" rx="2.4" ry="4.2" fill="currentColor"/></svg>',
  hat: '<svg viewBox="0 0 24 24"><path d="M3 18 L5 7 L9.5 12 L12 5 L14.5 12 L19 7 L21 18Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  scarf: '<svg viewBox="0 0 24 24"><path d="M4 7 Q12 12 20 7 L20 11 Q12 16 4 11Z" fill="currentColor"/><path d="M14 13 L17 21 L13.5 21 L11.5 14" fill="currentColor"/></svg>',
  fx: '<svg viewBox="0 0 24 24"><path d="M12 2 L13.8 9.2 L21 12 L13.8 14.8 L12 22 L10.2 14.8 L3 12 L10.2 9.2Z" fill="currentColor"/></svg>',
};
const BACK = '<svg viewBox="0 0 24 24"><path d="M15 4 L7 12 L15 20" fill="none" stroke="#2a1c14" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#ffc21a" stroke="#2a1c14" stroke-width="2"/><path d="M8 10.5 V8 a4 4 0 0 1 8 0 V10.5" fill="none" stroke="#2a1c14" stroke-width="2.4"/></svg>';
const DICE = '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff7ea" stroke="#2a1c14" stroke-width="2.2"/><g fill="#2a1c14"><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="15.5" cy="8.5" r="1.6"/><circle cx="8.5" cy="15.5" r="1.6"/></g></svg>';
const POSE_ICON = '<svg viewBox="0 0 24 24"><path d="M7 20 C6 14 8 10 12 9 C16 10 18 14 17 20Z" fill="#ff8a2a" stroke="#2a1c14" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="6" r="3.6" fill="#ff8a2a" stroke="#2a1c14" stroke-width="2"/><path d="M17 12 L21 7" stroke="#2a1c14" stroke-width="2.4" stroke-linecap="round"/></svg>';
const POSE_NAMES: Record<PoseId, string> = { sit: 'SIT', wave: 'WAVE', loaf: 'LOAF', stretch: 'STRETCH', leap: 'LEAP', proud: 'PROUD' };
/** the pose button cycles these (sit first, proud second: the brief's sit / proud toggle) */
const POSE_CYCLE: PoseId[] = ['sit', 'proud', 'wave', 'loaf', 'stretch', 'leap'];

const view: PlayerView = {
  s: 0,
  x: 0,
  y: 0,
  vy: 0,
  speed: 0,
  mode: 'run',
  surface: 'ground',
  grounded: true,
  sliding: false,
  sinceLand: 9,
  sinceJump: 9,
  sincePounce: 9,
  sinceHit: 9,
  landImpact: 0,
  airTime: 0,
  lean: 0,
  invuln: 0,
  wet: 0,
  ability: null,
  abilityT: 0,
  world: { pos: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3() },
};

// ---------------------------------------------------------------- state
let el: HTMLElement | null = null;
let isOpen = false;
let tab: LookSlot = 'fur';
let draft: Look = { fur: 0, pattern: 0, eyes: 0, hat: 0, scarf: 0, fx: 0 };
let preview: Mochi | null = null;
let poseIdx = 0;
let reactT = 0;
let reactPose: PoseId = 'proud';
let unhook: (() => void) | null = null;
// camera orbit (yaw 0 = straight in front of her, FRONT_YAW = the front 3/4 view)
const FRONT_YAW = 0.35;
const HOME_TIME = 0.4;
let yaw = 0.6;
let height = 0.95;
let dist = 3.6;
let idleT = 99;
/** the idle sway (+-0.5 rad around yaw, so her face always shows) */
let sway = 0;
/** easing back to the front 3/4 after a pick or a tab change: seconds left, and the targets */
let homeT = 0;
let homeYaw = FRONT_YAW;
let homeH = 0.95;
let focusY = 0.55;
let focusY1 = 0.55;
let nx = 0;
let ny = 0;
const fr = newFrame();
const center = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const focus = new THREE.Vector3();
const target = new THREE.Vector3();
const dir = new THREE.Vector3();
const tmp = new THREE.Vector3();
const camR = new THREE.Vector3();
const WUP = new THREE.Vector3(0, 1, 0);

const $ = <T extends HTMLElement>(sel: string) => el!.querySelector(sel) as T;

export const wardrobeOpen = () => isOpen;
export const wardrobeState = () => ({ open: isOpen, tab, draft: { ...draft }, pose: preview?.heldPose ?? null, yaw, dist });
export const previewRig = () => preview;

/** a touch or a click: the idle sway folds into yaw (no jump) and stops */
function wake(): void {
  yaw += sway;
  sway = 0;
  idleT = 0;
}
/** ease to the front 3/4 view (a hat also frames her head) */
function goHome(slot: LookSlot): void {
  wake();
  homeYaw = FRONT_YAW;
  homeH = slot === 'hat' ? 1.25 : 0.95;
  focusY1 = slot === 'hat' ? 0.78 : 0.55;
  // the short way round to the front
  const TAU = Math.PI * 2;
  yaw = ((((yaw - homeYaw) % TAU) + TAU * 1.5) % TAU) - Math.PI + homeYaw;
  homeT = prefs.reducedMotion ? 1e-6 : HOME_TIME;
}

// ---------------------------------------------------------------- build the DOM once
export function initWardrobeScreen(): void {
  el = addScreen('wardrobe');
  el.innerHTML = `
    <div class="wardrobe-stage" aria-hidden="true"></div>
    <div class="wardrobe-top">
      <button class="iconbtn" data-act="back" aria-label="Back">${BACK}</button>
      <button class="btn small alt wardrobe-pose" data-act="pose" aria-label="Change pose"><span class="ugc-ico">${POSE_ICON}</span><span class="lbl">SIT</span></button>
    </div>
    <div class="card wardrobe-panel">
      <div class="wardrobe-head"><h2>WARDROBE</h2><span class="wardrobe-code" title="Look code"></span></div>
      <div class="wardrobe-tabs" role="tablist"></div>
      <div class="wardrobe-info"><b class="wardrobe-name"></b><span class="wardrobe-status"></span></div>
      <div class="wardrobe-grid" role="listbox"></div>
      <div class="wardrobe-actions">
        <button class="btn small alt" data-act="random"><span class="ugc-ico">${DICE}</span>RANDOM</button>
        <button class="btn small green" data-act="done">DONE</button>
      </div>
    </div>`;
  const tabs = $('.wardrobe-tabs');
  for (const slot of LOOK_SLOTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wardrobe-tab';
    b.dataset.slot = slot;
    b.setAttribute('role', 'tab');
    b.innerHTML = `${ICON[slot]}<span></span><i class="wardrobe-dot hidden"></i>`;
    (b.querySelector('span') as HTMLElement).textContent = SLOT_LABELS[slot];
    b.addEventListener('click', () => showTab(slot));
    tabs.appendChild(b);
  }
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!act) return;
    if (act.dataset.act === 'back') closeWardrobe(false);
    else if (act.dataset.act === 'done') closeWardrobe(true);
    else if (act.dataset.act === 'random') randomLook();
    else if (act.dataset.act === 'pose') cyclePose();
  });
  // drag to spin, wheel / pinch to zoom
  const stage = $('.wardrobe-stage');
  const pts = new Map<number, { x: number; y: number }>();
  let pinch0 = 0;
  let dist0 = dist;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      dist0 = dist;
    }
    wake();
    homeT = 0;
  });
  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      yaw -= (e.clientX - p.x) * 0.009;
      height = Math.max(0.25, Math.min(2.4, height + (e.clientY - p.y) * 0.006));
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 2 && pinch0 > 0) {
      const [a, b] = [...pts.values()];
      dist = Math.max(2.2, Math.min(7.5, (dist0 * pinch0) / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
    }
    wake();
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      dist = Math.max(2.2, Math.min(7.5, dist * Math.exp(e.deltaY * 0.0012)));
      wake();
    },
    { passive: false },
  );
  addEventListener('keydown', (e) => {
    if (!isOpen || screen() !== 'wardrobe') return;
    if (e.code === 'Escape') {
      e.preventDefault();
      closeWardrobe(false);
    } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const list = CATALOG[tab];
      pick(tab, (draft[tab] + (e.code === 'ArrowRight' ? 1 : list.length - 1)) % list.length);
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const i = LOOK_SLOTS.indexOf(tab);
      showTab(LOOK_SLOTS[(i + (e.code === 'ArrowDown' ? 1 : LOOK_SLOTS.length - 1)) % LOOK_SLOTS.length]);
    }
  });
  addEventListener('resize', () => isOpen && measure());
}

// ---------------------------------------------------------------- open / close
export function openWardrobe(): void {
  if (!el || isOpen) return;
  if (game.mode !== 'title' || !game.track) {
    toast('The Wardrobe opens from the title screen');
    return;
  }
  isOpen = true;
  draft = { ...equipped() };
  tab = 'fur';
  poseIdx = 0;
  reactT = 0;
  yaw = 0.6;
  height = 0.95;
  idleT = 0;
  sway = 0;
  homeT = 0;
  focusY = focusY1 = 0.55;
  setScreen('wardrobe');
  // the preview: Mochi on the path a little ahead of where the attract camera was looking
  const track = game.track;
  const s = Math.min(track.length - 4, attractFocus() + 4);
  preview = new Mochi(draft, { fx: 'ambient' });
  placeOnTrack(preview.root, track, s, 0, 0);
  preview.setPose(POSE_CYCLE[0]);
  scene.add(preview.root);
  preview.root.updateMatrixWorld(true);
  track.sample(s, fr);
  center.copy(preview.root.position);
  fwd.copy(fr.fwd);
  right.copy(fr.right);
  hideRunner(true);
  measure();
  setCameraOverride(orbit);
  unhook = addFrameHook(frame);
  showTab('fur');
  updatePose();
  // the first frame snaps the pose (no slide in from the run pose)
  preview.animate(0, performance.now() / 1000, view);
}

export function closeWardrobe(commit: boolean): void {
  if (!isOpen) return;
  if (commit) {
    const locked = saveLook(draft, true);
    if (locked.length) toast('Locked items stay on the rack until you unlock them!', 2400);
  }
  isOpen = false;
  unhook?.();
  unhook = null;
  setCameraOverride(null);
  if (preview) {
    scene.remove(preview.root);
    preview.dispose();
    preview = null;
  }
  hideRunner(false);
  setScreen('title');
  refreshHub('title');
}

// ---------------------------------------------------------------- per frame
function frame(dt: number, t: number): void {
  if (!preview) return;
  idleT += dt;
  if (reactT > 0) {
    reactT -= dt;
    if (reactT <= 0) preview.setPose(POSE_CYCLE[poseIdx]);
  }
  preview.animate(dt, t, view);
}

function orbit(cam: THREE.PerspectiveCamera, dt: number): void {
  if (homeT > 0) {
    // ease (exponentially, done in HOME_TIME) to the front 3/4 and the slot's framing
    const k = Math.min(1, dt / homeT);
    homeT = Math.max(0, homeT - dt);
    yaw += (homeYaw - yaw) * k;
    height += (homeH - height) * k;
    focusY += (focusY1 - focusY) * k;
  }
  // idle: a gentle sway around the current view (never round to her back)
  if (!prefs.reducedMotion && idleT > 2.5) sway = 0.5 * Math.sin((idleT - 2.5) * 0.45) * Math.min(1, (idleT - 2.5) / 1.5);
  const a = yaw + sway;
  const portrait = cam.aspect < 1;
  const d = dist * (portrait ? 1.75 : 1);
  dir.copy(fwd).multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
  cam.position.copy(center).addScaledVector(dir, d).addScaledVector(WUP, height);
  focus.copy(center).addScaledVector(WUP, focusY);
  // frame her in the part of the screen the panel leaves free (shift the look target the other way)
  const fovV = 40;
  const tanV = Math.tan((fovV * Math.PI) / 360);
  const tanH = tanV * cam.aspect;
  const D = cam.position.distanceTo(focus);
  tmp.copy(focus).sub(cam.position);
  tmp.y = 0;
  tmp.normalize();
  const camRight = camR.set(-tmp.z, 0, tmp.x);
  target.copy(focus).addScaledVector(camRight, -nx * tanH * D).addScaledVector(WUP, -ny * tanV * D);
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  if (Math.abs(cam.fov - fovV) > 0.01) {
    cam.fov = fovV;
    cam.updateProjectionMatrix();
  }
}

/** where Mochi should sit on screen (NDC): the middle of the area the panel leaves free */
function measure(): void {
  if (!el) return;
  const panel = $('.wardrobe-panel');
  const r = panel.getBoundingClientRect();
  const W = innerWidth;
  const H = innerHeight;
  if (W >= H) {
    nx = Math.max(-0.75, Math.min(0, r.left / W - 1));
    ny = -0.08;
  } else {
    // portrait: centre her (a little low, so a hat clears the back / SIT row) between the top buttons and the panel
    const top = $('.wardrobe-top').getBoundingClientRect().bottom;
    const cy = (Math.max(0, top) + r.top) / 2 + 22;
    nx = 0;
    ny = Math.max(0, Math.min(0.75, 1 - (2 * cy) / H));
  }
}

// ---------------------------------------------------------------- tabs and tiles
function showTab(slot: LookSlot): void {
  if (!el) return;
  if (isOpen && (slot !== tab || slot === 'hat')) goHome(slot);
  tab = slot;
  const fresh = new Set(newNow().map((it) => it.key));
  el.querySelectorAll<HTMLElement>('.wardrobe-tab').forEach((b) => {
    const s = b.dataset.slot as LookSlot;
    b.classList.toggle('on', s === slot);
    b.setAttribute('aria-selected', String(s === slot));
    b.querySelector('.wardrobe-dot')!.classList.toggle('hidden', !CATALOG[s].some((it) => fresh.has(it.key)));
  });
  const grid = $('.wardrobe-grid');
  grid.innerHTML = '';
  const p = progressNow();
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const it of CATALOG[slot]) {
    const owned = owns(it, p);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `wardrobe-tile${owned ? '' : ' locked'}${fresh.has(it.key) ? ' new' : ''}`;
    b.dataset.key = it.key;
    b.setAttribute('role', 'option');
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(84 * dpr);
    b.appendChild(cv);
    const nm = document.createElement('span');
    nm.className = 'wardrobe-nm';
    nm.textContent = it.name;
    b.appendChild(nm);
    if (!owned) {
      const rp = ruleProgress(it.unlock, p);
      const lock = document.createElement('span');
      lock.className = 'wardrobe-lock';
      lock.innerHTML = `${LOCK}<span class="wardrobe-rule"></span><i><b style="width:${Math.round(rp.frac * 100)}%"></b></i>`;
      (lock.querySelector('.wardrobe-rule') as HTMLElement).textContent = ruleText(it.unlock);
      b.appendChild(lock);
    }
    if (fresh.has(it.key)) b.insertAdjacentHTML('beforeend', '<span class="wardrobe-new">NEW</span>');
    b.addEventListener('click', () => pick(slot, it.index));
    grid.appendChild(b);
    paintTile(cv, it);
  }
  markPicked();
}

function paintTile(cv: HTMLCanvasElement, it: Item): void {
  const c = cv.getContext('2d');
  if (!c) return;
  const w = cv.width;
  c.clearRect(0, 0, w, w);
  // a soft badge background in the item's colour
  const tint = it.slot === 'hat' || it.slot === 'scarf' || it.slot === 'fx' ? (it.colors[0] ?? 0xffe9c2) : 0xffe9c2;
  const g = c.createRadialGradient(w / 2, w * 0.45, w * 0.05, w / 2, w / 2, w * 0.55);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, css(tint, 0.38));
  c.fillStyle = g;
  c.beginPath();
  c.arc(w / 2, w / 2, w * 0.48, 0, Math.PI * 2);
  c.fill();
  if (it.slot === 'fx') {
    drawFxIcon(c, itemIdOf(it), it.colors, w, w);
    return;
  }
  // every tile shows Mochi in the draft look with this one item swapped in
  const look: Look = { ...draft, [it.slot]: it.index };
  // patterns hardly show on a very dark coat: those tiles borrow the classic coat so the pattern reads
  if (it.slot === 'pattern') {
    const fc = furColors(draft.fur);
    if (luma(fc.base) - luma(fc.dark) < 0.15) look.fur = 0;
  }
  drawLookPortrait(c, look, w * 0.04, w * 0.08, w * 0.92);
}
const itemIdOf = (it: Item) => it.key.slice(it.slot.length + 1);

function markPicked(): void {
  if (!el) return;
  const cur = itemAt(tab, draft[tab]);
  el.querySelectorAll<HTMLElement>('.wardrobe-tile').forEach((b) => {
    const on = b.dataset.key === cur.key;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  const owned = owns(cur);
  $('.wardrobe-name').textContent = cur.name;
  const st = $('.wardrobe-status');
  if (owned) st.textContent = cur.index === equipped()[tab] ? 'Wearing' : 'Yours';
  else {
    const rp = ruleProgress(cur.unlock, progressNow());
    st.textContent = `Locked: ${ruleText(cur.unlock)} (${rp.have}/${rp.need})`;
  }
  st.classList.toggle('locked', !owned);
  $('.wardrobe-code').textContent = Object.values(draft)
    .map((n) => n.toString(36))
    .join('')
    .toUpperCase();
}

/** put an item on the preview (locked ones too: a try-on; DONE keeps only owned items) */
export function pick(slot: LookSlot, index: number): void {
  if (!isOpen) return;
  const it = itemAt(slot, index);
  draft = { ...draft, [slot]: it.index };
  goHome(slot);
  preview?.applyLook(draft);
  if (slot !== tab) showTab(slot);
  else markPicked();
  // a little reaction: a wave for a new coat or eyes, a proud pose for a hat or scarf, sparkles either way
  reactPose = slot === 'hat' || slot === 'scarf' ? 'proud' : slot === 'fx' ? POSE_CYCLE[poseIdx] : 'wave';
  reactT = 0.9;
  preview?.setPose(reactPose);
  if (preview && !prefs.reducedMotion) {
    tmp.copy(center).addScaledVector(WUP, 0.9);
    burst(tmp, 14, it.colors[0] ?? 0xffd84a, 3, 0.55, 0.12, 4, 0.8);
  }
}

function randomLook(): void {
  const p = progressNow();
  const next = { ...draft };
  for (const slot of LOOK_SLOTS) {
    const owned = CATALOG[slot].filter((it) => owns(it, p));
    next[slot] = owned[Math.floor(Math.random() * owned.length)]?.index ?? 0;
  }
  draft = next;
  preview?.applyLook(draft);
  showTab(tab);
  reactPose = 'wave';
  reactT = 0.9;
  preview?.setPose('wave');
  if (preview && !prefs.reducedMotion) {
    tmp.copy(center).addScaledVector(WUP, 0.9);
    burst(tmp, 22, 0xffd84a, 3.5, 0.6, 0.12, 4, 0.8);
  }
}

function cyclePose(): void {
  poseIdx = (poseIdx + 1) % POSE_CYCLE.length;
  reactT = 0;
  updatePose();
}
/** test hook: hold a pose on the preview */
export function setPreviewPose(id: PoseId): void {
  const i = POSE_CYCLE.indexOf(id);
  if (i < 0 || !POSES.includes(id)) return;
  poseIdx = i;
  reactT = 0;
  updatePose();
}
function updatePose(): void {
  const id = POSE_CYCLE[poseIdx];
  preview?.setPose(id);
  if (el) $('.wardrobe-pose .lbl').textContent = POSE_NAMES[id];
}

/** test hook: fix the orbit camera (auto-orbit stops until the next drag) */
export function setPreviewView(y?: number, h?: number, d?: number): { yaw: number; height: number; dist: number } {
  if (Number.isFinite(y)) yaw = y as number;
  if (Number.isFinite(h)) height = Math.max(0.1, Math.min(2.4, h as number));
  if (Number.isFinite(d)) dist = Math.max(1.6, Math.min(7.5, d as number));
  sway = 0;
  homeT = 0;
  if (y !== undefined || h !== undefined || d !== undefined) idleT = -1e9;
  return { yaw, height, dist };
}
/** test hook: switch tab */
export const showWardrobeTab = (slot: LookSlot) => isOpen && showTab(slot);
