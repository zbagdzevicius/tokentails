/**
 * L-DJ: the DJ controller on the booth top. Two spinning platters (vinyl with a pink paw label, a
 * cue marker, a chasing LED ring), the mixer with channel faders and a crossfader that follow the
 * DJ's paws, glowing performance pads and VU meters that light with the beat.
 *
 * Built in deck space (origin = booth top centre). L-WORLD owns the booth table itself.
 */
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type BufferGeometry,
  type ShaderMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config';
import type { BeatInfo } from '../types';
import { ledRingMaterial, litMaterial, vinylMaterial, type SharedUniforms } from './materials';
import { DECK } from './motion';

export interface Decks {
  group: Group;
  update(beat: BeatInfo, dt: number, s: { scratch: number; xfader: number; faderR: number; faderL: number; drop: number }): void;
  dispose(): void;
}

const PAD_COLS = 2;
const PAD_ROWS = 4;
const VU_STEPS = 8;
const SPIN = (33.3 / 60) * Math.PI * 2;

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cyl(r: number, h: number, x: number, y: number, z: number, seg = 16): BufferGeometry {
  const g = new CylinderGeometry(r, r, h, seg);
  g.translate(x, y, z);
  return g;
}

function mergeAll(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  if (!g) throw new Error('dj: deck merge failed');
  return g;
}

/** `riser`: the stand under the DJ's feet in deck space (bottom = floor, top = feet). */
export function buildDecks(shared: SharedUniforms, riser: { bottomY: number; topY: number; z: number }): Decks {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const group = new Group();
  group.name = 'dj-decks';
  const zc = DECK.centerZ;
  const top = DECK.surfaceY;

  const bodyMat = keep(litMaterial(shared, { color: 0x0d0e11, spec: 0.5, shininess: 50, rim: 0.12 }));
  const plateMat = keep(litMaterial(shared, { color: 0x3a3f47, spec: 0.9, shininess: 70, rim: 0.3 }));
  const capMat = keep(litMaterial(shared, { color: 0xd9dde3, spec: 0.6, shininess: 40, rim: 0.2 }));

  // Controller body + mixer panel + fader slots + knobs (one merged static mesh).
  const staticGeo = keep(
    mergeAll([
      box(1.62, top, 0.62, 0, top / 2, zc),
      box(0.3, 0.008, 0.58, 0, top + 0.004, zc),
      box(0.012, 0.004, 0.2, -0.07, top + 0.01, -0.2),
      box(0.012, 0.004, 0.2, 0.07, top + 0.01, -0.2),
      box(0.16, 0.004, 0.012, 0, top + 0.01, DECK.xfaderZ),
      ...[-0.11, -0.035, 0.035, 0.11].flatMap((x) => [cyl(0.017, 0.022, x, top + 0.015, -0.44, 14), cyl(0.017, 0.022, x, top + 0.015, -0.38, 14)]),
      // Riser under the DJ's feet (behind the booth), so the kitten stands on something.
      cyl(0.34, Math.max(0.01, riser.topY - riser.bottomY), 0, (riser.topY + riser.bottomY) / 2, riser.z, 24),
    ]),
  );
  group.add(new Mesh(staticGeo, bodyMat));

  // Glowing front trim
  const trimMat = keep(new MeshBasicMaterial({ color: new Color(PALETTE.moonGlow).multiplyScalar(2) }));
  const trimGeo = keep(mergeAll([box(1.62, 0.012, 0.012, 0, top - 0.008, zc + 0.31), box(0.012, 0.012, 0.62, -0.81, top - 0.008, zc), box(0.012, 0.012, 0.62, 0.81, top - 0.008, zc)]));
  group.add(new Mesh(trimGeo, trimMat));

  // Platters ---------------------------------------------------------------------------------
  const plateGeo = keep(new CylinderGeometry(DECK.platterR + 0.018, DECK.platterR + 0.022, 0.02, 40));
  const vinylGeo = keep(new CircleGeometry(DECK.platterR, 48));
  vinylGeo.rotateX(-Math.PI / 2);
  const ringGeo = keep(new RingGeometry(DECK.platterR + 0.004, DECK.platterR + 0.02, 64, 1));
  const vinyls: Mesh[] = [];
  const ledMats: ShaderMaterial[] = [];
  for (const side of [-1, 1] as const) {
    const x = side * DECK.platterX;
    const plate = new Mesh(plateGeo, plateMat);
    plate.position.set(x, top + 0.01, zc);
    const vinyl = new Mesh(vinylGeo, keep(vinylMaterial(shared, side < 0 ? PALETTE.pawPink : 0xb06bff)));
    vinyl.position.set(x, top + 0.0215, zc);
    const ledMat = keep(ledRingMaterial(side));
    const ring = new Mesh(ringGeo, ledMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, top + 0.021, zc);
    group.add(plate, vinyl, ring);
    vinyls.push(vinyl);
    ledMats.push(ledMat);
  }

  // Faders ------------------------------------------------------------------------------------
  const faderGeo = keep(new BoxGeometry(0.034, 0.022, 0.02));
  const faderR = new Mesh(faderGeo, capMat);
  const faderL = new Mesh(faderGeo, capMat);
  const xfader = new Mesh(faderGeo, capMat);
  xfader.rotation.y = Math.PI / 2;
  group.add(faderR, faderL, xfader);

  // Knob caps: glowing dots
  const dotMat = keep(new MeshBasicMaterial({ color: new Color(PALETTE.laserViolet).multiplyScalar(1.6) }));
  const dotGeo = keep(mergeAll([-0.11, -0.035, 0.035, 0.11].flatMap((x) => [cyl(0.005, 0.004, x, top + 0.028, -0.452, 8), cyl(0.005, 0.004, x, top + 0.028, -0.392, 8)])));
  group.add(new Mesh(dotGeo, dotMat));

  // Pads (instanced, coloured per frame) -------------------------------------------------------
  const padGeo = keep(new BoxGeometry(0.044, 0.012, 0.058));
  const padMat = keep(new MeshBasicMaterial({ color: 0xffffff }));
  const padCount = PAD_COLS * PAD_ROWS * 2;
  const pads = new InstancedMesh(padGeo, padMat, padCount);
  pads.instanceMatrix.setUsage(DynamicDrawUsage);
  const m = new Matrix4();
  let k = 0;
  for (const side of [-1, 1]) {
    for (let r = 0; r < PAD_ROWS; r++) {
      for (let c = 0; c < PAD_COLS; c++) {
        m.makeTranslation(side * (0.715 + c * 0.052), top + 0.006, zc - 0.17 + r * 0.075);
        pads.setMatrixAt(k++, m);
      }
    }
  }
  const padColor = new Color();
  for (let i = 0; i < padCount; i++) pads.setColorAt(i, padColor.setRGB(0.1, 0.1, 0.1));
  group.add(pads);

  // VU meters ----------------------------------------------------------------------------------
  const vuGeo = keep(new BoxGeometry(0.022, 0.006, 0.011));
  const vu = new InstancedMesh(vuGeo, padMat, VU_STEPS * 2);
  k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < VU_STEPS; i++) {
      m.makeTranslation(side * 0.022, top + 0.011, -0.3 + i * 0.016);
      vu.setMatrixAt(k++, m);
    }
  }
  for (let i = 0; i < VU_STEPS * 2; i++) vu.setColorAt(i, padColor.setRGB(0.05, 0.05, 0.05));
  group.add(vu);

  group.traverse((o) => {
    o.frustumCulled = false;
  });

  const GREEN = new Color(PALETTE.laserGreen);
  const PINK = new Color(PALETTE.pawPink);
  const VIOLET = new Color(PALETTE.laserViolet);
  const OFF = new Color(0.035, 0.04, 0.045);
  let scratchPrev = 0;
  let level = 0;

  return {
    group,
    update(beat, dt, s) {
      // Platters: steady 33⅓ spin; the right deck follows the scratching paw.
      const scratchDelta = s.scratch - scratchPrev;
      scratchPrev = s.scratch;
      vinyls[0].rotation.y -= SPIN * dt + scratchDelta * 1.6;
      vinyls[1].rotation.y -= SPIN * dt;
      for (const mat of ledMats) {
        mat.uniforms.uBeat.value = beat.beat;
        mat.uniforms.uKick.value = beat.kick;
        mat.uniforms.uEnergy.value = beat.energy;
      }

      faderR.position.set(-0.07, top + 0.021, -0.2 + 0.09 * s.faderR);
      faderL.position.set(0.07, top + 0.021, -0.2 + 0.09 * s.faderL);
      xfader.position.set(DECK.xfaderTravel * s.xfader, top + 0.021, DECK.xfaderZ);

      // Pads: a step pattern that walks with the 16ths, all flash pink on drops.
      const step = Math.floor(beat.beat * 4);
      const hit = Math.exp(-((beat.beat * 4) % 1) * 4);
      let i = 0;
      for (let side = 0; side < 2; side++) {
        for (let r = 0; r < PAD_ROWS; r++) {
          for (let c = 0; c < PAD_COLS; c++) {
            const idx = r * PAD_COLS + c;
            const on = (step + side * 3) % (PAD_ROWS * PAD_COLS) === idx || ((step >> 2) + idx) % 5 === 0;
            const base = side === 0 ? GREEN : VIOLET;
            padColor.copy(OFF);
            if (on) padColor.copy(base).multiplyScalar(0.6 + 1.6 * hit);
            else padColor.copy(base).multiplyScalar(0.12 + 0.12 * beat.kick);
            if (s.drop > 0) padColor.lerp(PINK.clone().multiplyScalar(1.5 + beat.kick), Math.min(1, s.drop) * (on ? 1 : 0.5));
            pads.setColorAt(i++, padColor);
          }
        }
      }
      if (pads.instanceColor) pads.instanceColor.needsUpdate = true;

      // VU: level follows the kick and energy, smoothed so it falls back like a real meter.
      const target = Math.min(1, 0.25 + beat.kick * (0.45 + 0.55 * beat.energy));
      level = target > level ? target : Math.max(target, level - dt * 1.6);
      i = 0;
      for (let side = 0; side < 2; side++) {
        const lv = level * (side === 0 ? 1 : 0.93 + 0.07 * Math.sin(beat.beat * 3.1));
        for (let j = 0; j < VU_STEPS; j++) {
          const lit = j / VU_STEPS < lv;
          const c = j >= VU_STEPS - 2 ? PINK : GREEN;
          padColor.copy(lit ? c : OFF);
          if (lit) padColor.multiplyScalar(1.6);
          vu.setColorAt(i++, padColor);
        }
      }
      if (vu.instanceColor) vu.instanceColor.needsUpdate = true;

      trimMat.color.copy(GREEN).multiplyScalar(1.2 + 1.4 * beat.kick * (0.5 + beat.energy));
    },
    dispose() {
      for (const d of disposables) d.dispose();
      pads.dispose();
      vu.dispose();
    },
  };
}
