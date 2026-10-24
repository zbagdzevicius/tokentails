// The title attract runner: Mochi in her equipped look running ahead of the attract camera (it flies along the
// stage at 9 u/s; she keeps pace at attractFocus() + 6, weaving a little). Built lazily on the first title frame after
// a stageLoad (startStage also fires stageLoad, but goes straight to play, so no rig is built for nothing), removed
// on stageStart, rebuilt on every stageLoad, re-dressed when the look changes.
import * as THREE from 'three';
import { attractFocus } from '../core/camera';
import { scene } from '../core/engine';
import { events } from '../core/events';
import { addFrameHook } from '../core/loop';
import { placeOnTrack } from '../core/place';
import { game } from '../core/state';
import type { PlayerView } from '../core/types';
import { Mochi } from '../cat/mochi';
import { equipped, onLookChange } from './state';

const view: PlayerView = {
  s: 0,
  x: 0,
  y: 0,
  vy: 0,
  speed: 13,
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

/** u ahead of the attract focus (the brief says 6; at 2 she runs in the gap between the tagline and PLAY) */
const LEAD = 2;
let rig: Mochi | null = null;
let pending = false;
let hidden = false;
let lastX = 0;

function drop(): void {
  if (!rig) return;
  scene.remove(rig.root);
  rig.dispose();
  rig = null;
}

/** hide the runner (the Wardrobe preview stands in the same scene) */
export function hideRunner(on: boolean): void {
  hidden = on;
  if (rig) rig.root.visible = !on;
}
export const runnerRig = () => rig;

export function initAttractRunner(): void {
  // the title stage was prepared before the lanes registered: build on the first title frame
  pending = game.mode === 'title';
  events.on('stageLoad', () => {
    drop();
    pending = true;
  });
  events.on('stageStart', () => {
    drop();
    pending = false;
  });
  onLookChange((l) => rig?.applyLook(l));
  addFrameHook((dt, t) => {
    if (game.mode !== 'title') {
      if (rig) drop();
      return;
    }
    const track = game.track;
    if (!track || track.length < 60) return;
    if (pending && !rig) {
      pending = false;
      rig = new Mochi(equipped(), { fx: 'always' });
      rig.root.visible = !hidden;
      scene.add(rig.root);
    }
    if (!rig) return;
    const s = Math.min(track.length - 2, attractFocus() + LEAD);
    const x = Math.sin(t * 0.45) * 2 + Math.sin(t * 1.1) * 0.35;
    placeOnTrack(rig.root, track, s, x, 0);
    const vx = dt > 0 ? (x - lastX) / dt : 0;
    lastX = x;
    view.s = s;
    view.x = x;
    view.lean = Math.max(-1, Math.min(1, vx / 2.2));
    rig.animate(dt, t, view);
  });
}
