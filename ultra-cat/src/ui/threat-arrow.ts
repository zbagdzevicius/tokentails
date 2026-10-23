// Off-screen threat arrow: points at a boss, or at the nearest fire truck / vacuum sneaking up behind the cat.
// Hidden while the threat is on screen. Uses the core edgeArrow helper and the #threatArrow element.
import * as THREE from 'three';
import { C, addFrameHook, edgeArrow, events, game } from '../core/api';
import { mainThreat } from '../enemies/threats';
import { $ } from './dom';

const at = new THREE.Vector3();
const tmp = new THREE.Vector3();

export function initThreatArrow(): void {
  const el = $('threatArrow');
  const label = el.querySelector('span') as HTMLElement;
  let shown = '';
  let tick = 0;
  const hide = () => {
    edgeArrow(el, null, false);
    shown = '';
  };
  events.on('levelLoad', hide);
  events.on('levelEnd', hide);
  addFrameHook((dt) => {
    if (game.mode !== 'play') {
      if (shown) hide();
      return;
    }
    tick -= dt;
    const name = mainThreat(C.pos.x, C.pos.z, 420, at, tmp);
    if (!name) {
      if (shown) hide();
      return;
    }
    if (name !== shown && tick <= 0) {
      label.textContent = name;
      shown = name;
      tick = 0.5; // no label flicker between two equidistant threats
    }
    // right on top of the cat (behind the camera): the arrow would sit on its back, so hide it
    if (Math.hypot(at.x - C.pos.x, at.z - C.pos.z) < 70) {
      if (shown) hide();
      return;
    }
    edgeArrow(el, at, false);
  });
}
