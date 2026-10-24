// WARDROBE lane entry (ITERATION2.md 6.4): the look services (currentLook, buildKitten, drawLook), the Wardrobe
// screen and its title button, the title attract runner, unlock toasts, the portrait's look source and the
// window.__meowUgc.wardrobe test hook. src/ugc/index.ts calls registerWardrobe() first (the other lanes read
// ugc.currentLook at start-up).
import * as THREE from 'three';
import { scene } from '../core/engine';
import { addFrameHook } from '../core/loop';
import { kittenRig, P } from '../core/player';
import type { KittenRig } from '../core/types';
import { Mochi } from '../cat/mochi';
import { exposeTestHook, provide, ugc, type PoseId } from '../ugc/contract';
import { addButton, onScreen, refreshHub, toast } from '../ugc/hub';
import { screen } from '../ui/flow';
import { drawLookPortrait, drawPortrait, setPortraitLookSource } from '../ui/portrait';
import { initAttractRunner, runnerRig } from './attract';
import { ALL_ITEMS, CATALOG } from './catalog';
import { decodeLook, encodeLook, type Look, type LookSlot } from './look';
import { closeWardrobe, initWardrobeScreen, openWardrobe, pick, previewRig, setPreviewPose, setPreviewView, showWardrobeTab, wardrobeState } from './screen';
import { devOwnAll, equipCode, equipped, equippedCode, newNow, onLookChange, ownedNow, setDevOwnAll } from './state';
import { normalizeLook } from './unlocks';

const HANGER =
  '<svg viewBox="0 0 24 24"><path d="M12 6.5 a2.2 2.2 0 1 1 2.2-2.2" fill="none" stroke="#2a1c14" stroke-width="2.2" stroke-linecap="round"/><path d="M12 6.5 V8.5 L2.8 16 Q2 17.6 3.6 17.6 H20.4 Q22 17.6 21.2 16 L12 8.5" fill="#fff7ea" stroke="#2a1c14" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 17.6 L12 21 L15 17.6" fill="#ff5d8f" stroke="#2a1c14" stroke-width="1.8" stroke-linejoin="round"/></svg>';

let started = false;
const toasted = new Set<string>();

export function registerWardrobe(): void {
  if (started) return;
  started = true;

  provide({
    currentLook: () => ({ ...equipped() }),
    buildKitten: (look, opts) => new Mochi(normalizeLook(look), { ghost: !!opts?.ghost }),
    drawLook: (ctx, look, x, y, size) => drawLookPortrait(ctx, normalizeLook(look), x, y, size),
  });
  // every portrait (title mascot, HUD, pause, results) wears the equipped look
  setPortraitLookSource(equipped);

  initWardrobeScreen();
  initAttractRunner();

  addButton({
    id: 'ugcWardrobe',
    slot: 'title',
    label: 'WARDROBE',
    icon: HANGER,
    order: 10,
    badge: () => {
      const n = newNow().length;
      return n > 0 ? String(n) : null;
    },
    onClick: openWardrobe,
  });

  // the pause card's cat was drawn once at start-up: redraw it in the current look whenever the pause card shows
  onScreen((s) => {
    if (s === 'pause') {
      const cv = document.querySelector<HTMLCanvasElement>('#pauseCat canvas');
      const c = cv?.getContext('2d');
      if (cv && c) drawPortrait(c, cv.width, cv.height, 'sleepy', 0, { bg: true });
    }
    // unlock news waits for a menu (never over the results card, a sheet or the next run)
    if (s === 'title' || s === 'select') toastUnlocks(s);
  });
  // items the player already had waiting at boot are not news
  for (const it of newNow()) toasted.add(it.key);
  onLookChange(() => refreshHub('title'));

  exposeTestHook('wardrobe', {
    open: openWardrobe,
    close: (commit = false) => closeWardrobe(!!commit),
    catalog: CATALOG,
    owned: () => ownedNow(),
    /** equip a look code (saved as is; the equipped look is still checked against ownership unless devOwnAll) */
    equip: (code: string) => equipCode(code),
    look: () => equippedCode(),
    devOwnAll: (on = true) => setDevOwnAll(on),
    ownsAll: () => devOwnAll(),
    state: () => ({ ...wardrobeState(), screen: screen(), newCount: newNow().length }),
    tab: (slot: LookSlot) => showWardrobeTab(slot),
    pick: (slot: LookSlot, index: number) => pick(slot, index),
    pose: (id: PoseId) => setPreviewPose(id),
    /** fix the orbit camera; with no arguments it only returns the current view */
    view: (yaw?: number, height?: number, dist?: number) => setPreviewView(yaw, height, dist),
    indexOf: (slot: LookSlot, key: string) => CATALOG[slot].findIndex((it) => it.key === `${slot}.${key}`),
    items: () => ALL_ITEMS.map((it) => it.key),
    decode: (code: string) => decodeLook(code),
    encode: (l: Look) => encodeLook(l),
    runner: () => {
      const r = runnerRig();
      return r ? { visible: r.root.visible, look: encodeLook(r.look), state: r.state } : null;
    },
    preview: () => {
      const r = previewRig();
      return r ? { look: encodeLook(r.look), pose: r.heldPose, state: r.state } : null;
    },
    rigLook: () => {
      const r = kittenRig();
      return r instanceof Mochi ? encodeLook(r.look) : null;
    },
    ghost: placeGhost,
    clearGhost,
  });
}

function toastUnlocks(s: string): void {
  const fresh = newNow().filter((it) => !toasted.has(it.key));
  if (!fresh.length) return;
  for (const it of fresh) toasted.add(it.key);
  refreshHub('title');
  const first = fresh[fresh.length - 1];
  const more = fresh.length > 1 ? ` + ${fresh.length - 1} more` : '';
  // on the menu screen it was meant for, a moment after it shows
  setTimeout(() => screen() === s && toast(`New in the Wardrobe: ${first.name}${more}!`, 2600), 300);
}

// ---------------------------------------------------------------- ghost test helper (shots)
let ghost: { rig: KittenRig; off: () => void } | null = null;
/** put a ghost kitten (ugc.buildKitten(look, { ghost: true })) 2 u to the right of Mochi, mirroring her moves */
function placeGhost(code?: string): boolean {
  clearGhost();
  const rig = ugc.buildKitten(decodeLook(code ?? equippedCode()), { ghost: true });
  if (!rig) return false;
  scene.add(rig.root);
  const pos = new THREE.Vector3();
  const off = addFrameHook((dt, t) => {
    const w = P.world;
    rig.root.position.copy(pos.copy(w.pos).addScaledVector(w.right, 2));
    const main = kittenRig();
    if (main) rig.root.quaternion.copy(main.root.quaternion);
    rig.animate(dt, t, P);
  });
  ghost = { rig, off };
  return true;
}
function clearGhost(): void {
  if (!ghost) return;
  ghost.off();
  scene.remove(ghost.rig.root);
  ghost.rig.dispose?.();
  ghost = null;
}
