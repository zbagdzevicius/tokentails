// Sky (WORLD-ART): gradient dome with a sun glow, hazy far mountains with mesas on a horizon cylinder, puffy
// cumulus clouds and the green valley floor far below the path. All of it follows the camera (a skybox that never
// runs out), the floor follows the valley height and scrolls its texture so it reads as static ground.
import * as THREE from 'three';
import type { Kit } from './kit';
import { seeded } from './noise';
import type { Palette } from './palette';
import { grassDetail, ridgeTexture } from './textures';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.18, 0.75, h));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.5);
  col = mix(col, uGlow, smoothstep(0.9993, 0.9997, sd));
  if (h < 0.0) col = uHorizon;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FLOOR_TILE = 26;

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private ridge: THREE.Mesh;
  private clouds = new THREE.Group();
  private floor: THREE.Mesh;
  private birds: THREE.Group = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private flock = 0;
  private floorTex: THREE.Texture;
  private ridgeTex: THREE.Texture;
  private disposables: { dispose(): void }[] = [];

  constructor(p: Palette, kit: Kit, sunDir: THREE.Vector3, low: boolean) {
    const domeGeo = new THREE.SphereGeometry(1200, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(p.zenith) },
        uMid: { value: new THREE.Color(p.skyMid) },
        uHorizon: { value: new THREE.Color(p.horizon) },
        uGlow: { value: new THREE.Color(p.sunGlow) },
        uSun: { value: sunDir.clone() },
      },
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.ridgeTex = ridgeTexture(p);
    this.ridgeTex.repeat.set(2, 1);
    const ridgeGeo = new THREE.CylinderGeometry(1000, 1000, 520, 64, 1, true);
    ridgeGeo.translate(0, 70, 0);
    const ridgeMat = new THREE.MeshBasicMaterial({ map: this.ridgeTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false });
    this.ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
    this.ridge.renderOrder = -9;
    this.ridge.frustumCulled = false;
    // clouds on a ring
    const rnd = seeded(p.zenith & 0xffff);
    const n = low ? 9 : 16;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(kit.clouds[i % kit.clouds.length], kit.cloudMat);
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const r = 700 + rnd() * 330;
      const sc = 22 + rnd() * 26;
      m.position.set(Math.cos(a) * r, 55 + rnd() * 110, Math.sin(a) * r);
      m.scale.set(sc * (1.2 + rnd() * 0.6), sc * (0.8 + rnd() * 0.4), sc);
      m.lookAt(0, m.position.y, 0);
      m.frustumCulled = false;
      this.clouds.add(m);
    }
    // valley floor
    this.floorTex = grassDetail();
    this.floorTex.repeat.set((2 * 950) / FLOOR_TILE, (2 * 950) / FLOOR_TILE);
    const floorGeo = new THREE.CircleGeometry(950, 48).rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshLambertMaterial({ color: p.valley, map: this.floorTex });
    // world-space patches (meadow tones, dry fields) so the moving floor reads as varied, static land
    const dry = new THREE.Color(p.grassDry);
    const lush = new THREE.Color(p.leafA);
    floorMat.onBeforeCompile = (sh) => {
      sh.uniforms.uDry = { value: dry };
      sh.uniforms.uLush = { value: lush };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vWP; uniform vec3 uDry; uniform vec3 uLush;
          float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float fn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float n1 = fn(vWP / 70.0);
          float n2 = fn(vWP / 19.0 + 7.0);
          diffuseColor.rgb *= mix(0.84, 1.1, n1) * mix(0.94, 1.05, n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDry, smoothstep(0.62, 0.82, fn(vWP / 150.0 + 3.0)) * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLush, smoothstep(0.66, 0.86, fn(vWP / 45.0 + 11.0)) * 0.5);`,
        );
    };
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.receiveShadow = false;
    this.floor.frustumCulled = false;
    // a small flock gliding far ahead (two-triangle wings that flap)
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 0, 0, -0.35, 1.6, 0.1, 0], 3));
    wingGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.ridgeNear).multiplyScalar(0.45), side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < (low ? 3 : 6); i++) {
      const b = new THREE.Group();
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wingGeo, birdMat);
        w.scale.x = sx;
        w.frustumCulled = false;
        b.add(w);
        this.wings.push(w);
      }
      b.position.set((rnd() - 0.5) * 40, 50 + rnd() * 14, 260 + rnd() * 40);
      b.scale.setScalar(2.2);
      this.birds.add(b);
    }
    this.group.add(this.dome, this.ridge, this.clouds, this.floor, this.birds);
    this.disposables.push(wingGeo, birdMat);
    this.disposables.push(domeGeo, domeMat, ridgeGeo, ridgeMat, this.ridgeTex, floorGeo, floorMat, this.floorTex);
  }

  update(dt: number, camPos: THREE.Vector3, floorY: number): void {
    this.dome.position.copy(camPos);
    this.ridge.position.set(camPos.x, camPos.y * 0.25 + floorY * 0.75, camPos.z);
    this.clouds.position.set(camPos.x, floorY, camPos.z);
    this.clouds.rotation.y += dt * 0.004;
    this.floor.position.set(camPos.x, floorY, camPos.z);
    // the flock circles slowly around a point that follows the camera
    this.flock += dt;
    this.birds.position.set(camPos.x, floorY, camPos.z);
    this.birds.rotation.y = this.flock * 0.05;
    for (let i = 0; i < this.wings.length; i++) {
      const w = this.wings[i];
      const ph = this.flock * 7 + (i >> 1) * 1.3;
      w.rotation.z = Math.sin(ph) * 0.6 * w.scale.x;
    }
    // circle uv: u = x / (2r) + 0.5, v = -z / (2r) + 0.5 after the rotation; scroll so the texture stays put
    const k = 1 / FLOOR_TILE;
    this.floorTex.offset.set((camPos.x * k) % 1, (-camPos.z * k) % 1);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
