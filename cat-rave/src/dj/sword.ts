/**
 * L-DJ: the drop sword. A glowing steel blade with a glint that sweeps up it on every beat, a gold
 * crossguard with a pink gem, an additive aura (so it still glows on the no-bloom tier) and a
 * star twinkle on the tip.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { PALETTE } from '../config';
import { bladeMaterial, litMaterial, type SharedUniforms } from './materials';

export interface Sword {
  group: Group;
  /** Blade tip in sword-local space. */
  readonly tipY: number;
  update(time: number, beat: number, kick: number, vis: number): void;
  dispose(): void;
}

function starTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,240,250,0.8)');
  grd.addColorStop(0.4, 'rgba(255,140,200,0.15)');
  grd.addColorStop(1, 'rgba(255,140,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // Four-point star spikes.
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [
    [124, 6],
    [6, 124],
  ]) {
    const lg = g.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  const t = new CanvasTexture(c);
  return t;
}

export function buildSword(shared: SharedUniforms): Sword {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const group = new Group();
  group.name = 'dj-sword';
  const tipY = 0.92;

  // Blade silhouette, extruded thin.
  const s = new Shape();
  // Wide enough to read as a sword silhouette from the hero shot (~13 m away), not a light beam.
  s.moveTo(-0.05, 0.06);
  s.lineTo(0.05, 0.06);
  s.lineTo(0.045, 0.74);
  s.lineTo(0, tipY);
  s.lineTo(-0.045, 0.74);
  s.closePath();
  const bladeGeo = keep(new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 1 }));
  bladeGeo.translate(0, 0, -0.006);
  const bladeMat = keep(bladeMaterial(PALETTE.sword));
  const blade = new Mesh(bladeGeo, bladeMat);

  const gold = keep(litMaterial(shared, { color: 0xffc547, emissive: 0xffb020, emissiveStrength: 0.25, spec: 1.2, shininess: 50, rim: 0.4, rimColor: 0xfff0a0 }));
  const leather = keep(litMaterial(shared, { color: 0x3a2014, rim: 0.2 }));
  const guardGeo = keep(new BoxGeometry(0.25, 0.034, 0.046));
  guardGeo.translate(0, 0.045, 0);
  const guard = new Mesh(guardGeo, gold);
  const knobGeo = keep(new SphereGeometry(0.024, 10, 8));
  const knobL = new Mesh(knobGeo, gold);
  knobL.position.set(-0.128, 0.045, 0);
  const knobR = new Mesh(knobGeo, gold);
  knobR.position.set(0.128, 0.045, 0);
  const gripGeo = keep(new CylinderGeometry(0.019, 0.021, 0.15, 10));
  gripGeo.translate(0, -0.045, 0);
  const grip = new Mesh(gripGeo, leather);
  const pommelGeo = keep(new SphereGeometry(0.031, 12, 10));
  const pommel = new Mesh(pommelGeo, gold);
  pommel.position.y = -0.13;
  const gemMat = keep(new MeshBasicMaterial({ color: new Color(PALETTE.pawPink).multiplyScalar(2.2) }));
  const gemGeo = keep(new SphereGeometry(0.017, 10, 8));
  const gem = new Mesh(gemGeo, gemMat);
  gem.position.set(0, 0.045, 0.024);

  // Aura: a soft additive glow quad along the blade (reads as glow even without bloom).
  const auraGeo = keep(new PlaneGeometry(0.34, 1.12));
  auraGeo.translate(0, 0.48, 0);
  const auraMat = keep(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uA: { value: 0.5 }, uColor: { value: new Color(0xcfe8ff) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uA;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float x = abs(vUv.x - 0.5) * 2.0;
          float y = vUv.y;
          float a = exp(-x * x * 9.0) * smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.82, 1.0, y));
          gl_FragColor = vec4(uColor * a * uA, 1.0);
        }
      `,
    }),
  );
  const aura = new Mesh(auraGeo, auraMat);
  const aura2 = new Mesh(auraGeo, auraMat);
  aura2.rotation.y = Math.PI / 2;

  // Tip twinkle.
  const tex = starTexture();
  const starMat = keep(new SpriteMaterial({ map: tex ?? undefined, color: 0xffffff, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  if (tex) keep(tex);
  const star = new Sprite(starMat);
  star.position.y = tipY;
  star.scale.setScalar(0.4);

  group.add(blade, guard, knobL, knobR, grip, pommel, gem, aura, aura2, star);
  group.traverse((o) => {
    o.frustumCulled = false;
  });
  group.visible = false;

  return {
    group,
    tipY,
    update(time, beat, kick, vis) {
      group.visible = vis > 0.001;
      if (!group.visible) return;
      group.scale.setScalar(Math.max(0.001, vis));
      // Glint runs up the blade once per beat.
      const f = beat - Math.floor(beat);
      bladeMat.uniforms.uGlint.value = -0.1 + f * 1.4;
      bladeMat.uniforms.uGlow.value = 0.8 + 0.45 * kick;
      auraMat.uniforms.uA.value = (0.16 + 0.3 * kick) * Math.min(1, vis);
      const tw = 0.5 + 0.5 * Math.sin(time * 9);
      star.scale.setScalar((0.28 + 0.35 * kick + 0.12 * tw) * 1.0);
      star.material.rotation = time * 1.5;
      gemMat.color.set(PALETTE.pawPink).multiplyScalar(1.8 + 1.2 * kick);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
