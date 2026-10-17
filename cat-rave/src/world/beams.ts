/**
 * L-WORLD: laser beams (instanced crossed quads, additive) and volumetric-looking spotlight cones
 * (instanced open cones, additive, soft view-dependent edges). One draw call each.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE, OUTPUT, SHARED_DECL, type SharedUniforms } from './glsl';

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _d = new Vector3();

/** Pose instance `i` as a unit +Y shape from `origin` along `dir` (unit), with width/length scale. */
function pose(mesh: InstancedMesh, i: number, origin: Vector3, dir: Vector3, width: number, length: number) {
  _q.setFromUnitVectors(UP, dir);
  _s.set(width, length, width);
  _m.compose(origin, _q, _s);
  mesh.setMatrixAt(i, _m);
}

export function createLasers(shared: SharedUniforms, max: number) {
  // Two crossed planes along +Y (0..1), width 1 at the far end, narrowing to 0.18 at the emitter:
  // a soft cone, so each beam reads as a volumetric shaft through the haze, not a hairline.
  const a = new PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
  const ap = a.getAttribute('position');
  for (let i = 0; i < ap.count; i++) ap.setX(i, ap.getX(i) * (0.18 + 0.82 * ap.getY(i)));
  const b = a.clone().rotateY(Math.PI / 2);
  const geometry = mergeGeometries([a, b], false)!;
  a.dispose();
  b.dispose();
  const material = new ShaderMaterial({
    name: 'rave-laser',
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vLen;
      varying float vCamD;
      void main() {
        vUv = uv;
        vColor = instanceColor;
        vLen = length(instanceMatrix[1].xyz);
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vCamD = length(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vLen;
      varying float vCamD;
      ${NOISE}
      void main() {
        // MSAA can shade a sample just outside the quad: clamp the varyings before pow().
        float x = clamp(abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
        // Gaussian cross-section: a saturated core and a wide, soft shaft that falls off smoothly to
        // the quad edge (no visible ribbon edge).
        float core = exp(-x * x * 40.0);
        float glow = exp(-x * x * 3.2) * (1.0 - x * x);
        float along = clamp(vUv.y, 0.0, 1.0);
        float fade = pow(max(1.0 - along, 0.0), 1.25) * smoothstep(0.0, 0.004, along);
        float hot = exp(-along * vLen * 0.5) * 1.5; // bright emitter at the origin
        // Haze: the shaft is broken up by drifting dust.
        float dust = 0.7 + 0.3 * vnoise(vec2(along * vLen * 0.18 - uTime * 0.5, x * 2.5 + vLen));
        vec3 col = vColor * (core * 1.0 + glow * 0.7) * fade * dust + vColor * core * hot;
        // White-hot centre, at most ~30% of the beam.
        col += vec3(0.3) * core * core * fade * min(1.0, length(vColor));
        // A wide beam passing over the camera would wash the whole sky: fade it out up close.
        col *= smoothstep(10.0, 45.0, vCamD);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  });
  const mesh = new InstancedMesh(geometry, material, max);
  mesh.name = 'lasers';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.count = 0;
  return {
    mesh,
    set(i: number, origin: Vector3, dir: Vector3, width: number, length: number, color: Color, intensity: number) {
      pose(mesh, i, origin, dir, width, length);
      mesh.setColorAt(i, _tmpColor.copy(color).multiplyScalar(intensity));
    },
    commit(count: number) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
const _tmpColor = new Color();

export function createSpotCones(shared: SharedUniforms, max: number) {
  // Open cone along +Y: apex (r≈0.02) at 0, unit radius at 1.
  const geometry = new CylinderGeometry(1, 0.02, 1, 28, 1, true).translate(0, 0.5, 0);
  const material = new ShaderMaterial({
    name: 'rave-spot-cone',
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vAlong;
      varying vec3 vColor;
      void main() {
        vAlong = position.y;
        vColor = instanceColor;
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vAlong;
      varying vec3 vColor;
      ${NOISE}
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float facing = abs(dot(normalize(vNormal), V));
        float soft = pow(facing, 3.0);
        float along = vAlong;
        float body = mix(1.0, 0.18, along) * smoothstep(0.0, 0.05, along) * smoothstep(1.0, 0.85, along);
        float dust = 0.65 + 0.35 * vnoise(vWorld.xz * 0.6 + vWorld.y * 0.4 + uTime * 0.3);
        // Cones the camera stands in become a flat grey veil: fade them out up close.
        float nearFade = smoothstep(6.0, 18.0, length(cameraPosition - vWorld));
        vec3 col = vColor * soft * body * dust * 0.07 * nearFade;
        gl_FragColor = vec4(col, 1.0);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  });
  const mesh = new InstancedMesh(geometry, material, max);
  mesh.name = 'spot-cones';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.count = 0;
  return {
    mesh,
    /** Cone from `rig` to the floor point `target`, `radius` wide at the floor. */
    set(i: number, rig: Vector3, target: Vector3, radius: number, color: Color, intensity: number) {
      _d.subVectors(target, rig);
      const len = _d.length();
      _d.multiplyScalar(1 / Math.max(len, 1e-4));
      pose(mesh, i, rig, _d, radius, len);
      mesh.setColorAt(i, _tmpColor.copy(color).multiplyScalar(intensity));
    },
    commit(count: number) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/**
 * Laser emitters: one hot additive flare per horizon rig (core ~6x, a soft halo and a thin
 * horizontal streak), billboarded in the vertex shader. One draw call for all rigs.
 */
export function createEmitters(shared: SharedUniforms, rigs: readonly Vector3[], size = 7) {
  const n = rigs.length;
  const pos = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const which = new Float32Array(n * 4);
  const index: number[] = [];
  for (let r = 0; r < n; r++) {
    const c = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let v = 0; v < 4; v++) {
      const o = r * 4 + v;
      pos.set([rigs[r].x, rigs[r].y, rigs[r].z], o * 3);
      corner.set(c[v], o * 2);
      which[o] = r;
    }
    index.push(r * 4, r * 4 + 1, r * 4 + 2, r * 4, r * 4 + 2, r * 4 + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
  geometry.setAttribute('aWhich', new Float32BufferAttribute(which, 1));
  geometry.setIndex(index);
  const levels = new Float32Array(4);
  const colors = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const material = new ShaderMaterial({
    name: 'rave-laser-emitter',
    uniforms: { ...shared, uLevel: { value: levels }, uColors: { value: colors }, uSize: { value: size } },
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute float aWhich;
      uniform float uLevel[4];
      uniform vec3 uColors[4];
      uniform float uSize;
      varying vec2 vC;
      varying vec3 vColor;
      void main() {
        int i = int(aWhich + 0.5);
        vColor = uColors[i] * uLevel[i];
        vC = aCorner;
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        // Wider than tall: room for the horizontal streak.
        mv.xy += aCorner * vec2(2.2, 1.0) * uSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      varying vec2 vC;
      varying vec3 vColor;
      void main() {
        vec2 p = vC * vec2(2.2, 1.0);
        float r2 = dot(p, p);
        float core = exp(-r2 * 28.0);
        float halo = exp(-r2 * 3.5) * (1.0 - smoothstep(0.6, 1.0, length(vC)));
        float streak = exp(-p.y * p.y * 260.0) * exp(-abs(p.x) * 1.6) * (1.0 - smoothstep(0.7, 1.0, abs(vC.x)));
        vec3 col = vColor * (core * 6.0 + halo * 0.9 + streak * 1.4) + vec3(1.0) * core * 2.0 * min(1.0, length(vColor));
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'laser-emitters';
  mesh.frustumCulled = false;
  mesh.renderOrder = 21;
  return {
    mesh,
    /** Level 0.. (beam brightness of that rig) and colour of emitter `i`. */
    set(i: number, level: number, color: Color) {
      levels[i] = level;
      colors[i].set(color.r, color.g, color.b);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
