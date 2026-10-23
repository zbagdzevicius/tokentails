// Pooled world-space particles (dust, spray, sparks, crumbs). FROZEN.
// One THREE.Points draw call; soft round sprites with per-particle colour, size and fade. Any lane may spawn.
import * as THREE from 'three';
import { getQuality, scene } from './engine';

const MAX = 1600;
const pos = new Float32Array(MAX * 3);
const col = new Float32Array(MAX * 3);
const size = new Float32Array(MAX);
const alpha = new Float32Array(MAX);
const vel = new Float32Array(MAX * 3);
const life = new Float32Array(MAX);
const age = new Float32Array(MAX);
const grav = new Float32Array(MAX);
const size0 = new Float32Array(MAX);
const alpha0 = new Float32Array(MAX);
let cursor = 0;

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexColors: true,
  uniforms: { scale: { value: 600 } },
  vertexShader: /* glsl */ `
    attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;
    void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float dz = -mv.z;
      // fade out close to the camera (never a screen-filling disc) and cap the sprite size
      vA *= smoothstep(2.2, 4.6, dz);
      gl_PointSize = min(size * scale / max(0.1, dz), scale * 0.07); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */ `
    varying vec3 vC; varying float vA;
    void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
      gl_FragColor = vec4(vC, vA * smoothstep(0.25, 0.12, r)); }`,
});
const points = new THREE.Points(geo, mat);
points.frustumCulled = false;
points.renderOrder = 5;
scene.add(points);
addEventListener('resize', () => (mat.uniforms.scale.value = innerHeight * 0.9));
mat.uniforms.scale.value = innerHeight * 0.9;

const tmpC = new THREE.Color();
/** One particle. color: hex. gravity: u/s^2 downward. On LOW quality every other spawn is dropped. */
export function spawnParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, lifeS: number, sizeU: number, color: number, gravity = 0, opacity = 1): void {
  if (getQuality() === 'low' && (cursor & 1) === 1) {
    cursor = (cursor + 1) % MAX;
    return;
  }
  const i = cursor;
  cursor = (cursor + 1) % MAX;
  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;
  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;
  tmpC.setHex(color);
  col[i * 3] = tmpC.r;
  col[i * 3 + 1] = tmpC.g;
  col[i * 3 + 2] = tmpC.b;
  life[i] = lifeS;
  age[i] = 0;
  grav[i] = gravity;
  size0[i] = sizeU;
  size[i] = sizeU;
  alpha0[i] = opacity;
  alpha[i] = opacity;
}

/** n particles bursting from p (random directions, speed u/s, upward bias). */
export function burst(p: THREE.Vector3, n: number, color: number, speed = 4, lifeS = 0.6, sizeU = 0.35, gravity = 6, upBias = 0.6): void {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 2 - 1 + upBias;
    const v = speed * (0.4 + Math.random() * 0.6);
    spawnParticle(p.x, p.y, p.z, Math.cos(a) * v, e * v, Math.sin(a) * v, lifeS * (0.6 + Math.random() * 0.6), sizeU * (0.7 + Math.random() * 0.6), color, gravity);
  }
}

/** every frame (core loop) */
export function stepParticles(dt: number): void {
  if (dt <= 0) return;
  for (let i = 0; i < MAX; i++) {
    if (life[i] <= 0) continue;
    age[i] += dt;
    if (age[i] >= life[i]) {
      life[i] = 0;
      alpha[i] = 0;
      size[i] = 0;
      continue;
    }
    vel[i * 3 + 1] -= grav[i] * dt;
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    const u = age[i] / life[i];
    alpha[i] = alpha0[i] * (1 - u * u);
    size[i] = size0[i] * (1 + u * 0.6);
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.attributes.size.needsUpdate = true;
  geo.attributes.alpha.needsUpdate = true;
}

export function clearParticles(): void {
  life.fill(0);
  alpha.fill(0);
  size.fill(0);
}
