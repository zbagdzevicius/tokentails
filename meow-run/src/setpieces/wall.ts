// Claw wall-run: the track itself climbs or banks steeply (segment kind 'wall') and Mochi sprints up it on her
// claws. This piece marks the entry ("CLAWS OUT!" with a little sprint boost), scatters claw-scratch marks along
// the face and emits setPiece wall start/end for audio and juice. SETPIECES lane.
import * as THREE from 'three';
import { events } from '../core/events';
import { burst } from '../core/fx';
import { callout } from '../core/hud';
import { boost, P } from '../core/player';
import { setPieceTypes } from '../core/registry';
import { addPoints } from '../core/score';
import type { SetPieceType } from '../core/types';
import { GEO, mesh } from './kit';

const tmp = new THREE.Vector3();
let scratchMat: THREE.MeshBasicMaterial | null = null;
function scratch(): THREE.MeshBasicMaterial {
  if (scratchMat) return scratchMat;
  const el = document.createElement('canvas');
  el.width = el.height = 64;
  const c = el.getContext('2d')!;
  c.clearRect(0, 0, 64, 64);
  c.strokeStyle = 'rgba(255,248,230,0.9)';
  c.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    c.lineWidth = 5 - k;
    c.beginPath();
    c.moveTo(14 + k * 15, 6);
    c.quadraticCurveTo(10 + k * 15, 32, 20 + k * 15, 58);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  scratchMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.75 });
  return scratchMat;
}

/** spec.s = start of the wall segment, spec.len its length */
const wallrun: SetPieceType = {
  id: 'wallrun',
  checkpoint: true,
  create(ctx) {
    const { s } = ctx.spec;
    const len = ctx.spec.len ?? 60;
    const n = Math.floor(len / 7);
    for (let i = 0; i < n; i++) {
      const ss = s + 3 + i * 7 + Math.sin(i * 3.1) * 1.5;
      const w = ctx.track.widthAt(ss);
      const m = mesh(ctx, GEO.plane(), scratch(), ss, Math.sin(i * 2.3) * (w / 2 - 1.2), 0.04, false, false);
      m.rotateX(-Math.PI / 2);
      m.rotateZ(Math.sin(i * 1.7) * 0.4);
      m.scale.setScalar(1.4 + (i % 3) * 0.3);
      m.renderOrder = 2;
    }
    let on = false;
    let done = false;
    return {
      end: s + len + 2,
      update() {
        if (!on && P.s >= s) {
          on = true;
          callout('CLAWS OUT!');
          boost(1.12, 1.4);
          events.emit('setPiece', { id: 'wall', phase: 'start' });
          tmp.copy(P.world.pos);
          burst(tmp, 12, 0xfff3c0, 5, 0.4, 0.2, 4, 0.6);
        }
        if (on && !done && P.s >= s + len) {
          done = true;
          addPoints(200);
          callout('PURRFECT!');
          events.emit('setPiece', { id: 'wall', phase: 'end' });
        }
      },
      onRespawn() {
        on = done = false;
      },
      dispose() {
        if (on && !done) events.emit('setPiece', { id: 'wall', phase: 'end' });
      },
    };
  },
};

export function registerWall(): void {
  setPieceTypes.add(wallrun);
}
