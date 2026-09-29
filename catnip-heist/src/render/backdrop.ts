/**
 * Moody backdrop behind the floating warehouse diorama: one full-screen quad (no geometry cost)
 * drawing a night gradient, a haze band, a distant city skyline with lit windows (parallax) and a
 * twinkling starfield (slower parallax). Drawn first, never writes depth.
 */
import * as THREE from 'three';

export class Backdrop {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOffset: { value: new THREE.Vector2() },
        uAspect: { value: 16 / 9 },
        uTop: { value: new THREE.Color('#07030e') },
        uMid: { value: new THREE.Color('#1d0b33') },
        uLow: { value: new THREE.Color('#3a1648') },
        uHaze: { value: new THREE.Color('#6f2da8') },
        uCity: { value: new THREE.Color('#12071f') },
        uWin: { value: new THREE.Color('#ffc93c') },
        uHdr: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAspect, uHdr;
        uniform vec2 uOffset;
        uniform vec3 uTop, uMid, uLow, uHaze, uCity, uWin;
        varying vec2 vUv;
        float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 uv = vUv;
          // Vertical gradient: deep night at the top, plum glow low down.
          vec3 col = mix(uLow, uMid, smoothstep(0.0, 0.45, uv.y));
          col = mix(col, uTop, smoothstep(0.45, 1.0, uv.y));
          // Stars (slow parallax), twinkling, only in the upper part.
          vec2 sp = vec2(uv.x * uAspect, uv.y) * 90.0 + uOffset * 1.2;
          vec2 cell = floor(sp);
          float r = h2(cell);
          if (r > 0.965) {
            vec2 f = fract(sp) - 0.5 - (vec2(h2(cell + 3.1), h2(cell + 7.7)) - 0.5) * 0.6;
            float tw = 0.55 + 0.45 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
            float s = smoothstep(0.16, 0.0, max(abs(f.x), abs(f.y)));
            col += vec3(0.85, 0.78, 1.0) * s * tw * smoothstep(0.25, 0.7, uv.y) * 0.9;
          }
          // Haze band where the city meets the sky.
          float horizon = 0.3;
          col += uHaze * 0.22 * exp(-pow((uv.y - horizon) * 7.0, 2.0));
          // Distant skyline (faster parallax than the stars, slower than the level).
          float x = uv.x * uAspect * 26.0 + uOffset.x * 2.2;
          float bx = floor(x);
          float bh = 0.05 + h1(bx) * 0.11 + step(0.86, h1(bx + 9.0)) * 0.09;
          float top = horizon + bh - 0.12 + uOffset.y * 0.01;
          if (uv.y < top) {
            col = mix(col, uCity, 0.92);
            // Windows.
            vec2 wp = vec2(fract(x) * 6.0, (top - uv.y) * 90.0);
            vec2 wc = floor(wp);
            float lit = step(0.72, h2(wc + bx * 13.0)) * step(0.5, fract(wp.x)) * step(0.45, fract(wp.y)) * step(1.0, wc.x) * step(wc.x, 4.0);
            float flick = 0.75 + 0.25 * sin(uTime * 0.7 + h2(wc + bx) * 30.0);
            col += uWin * lit * flick * 0.55 * uHdr * smoothstep(0.0, 0.12, uv.y);
          }
          // Second, nearer skyline row, darker, a bit lower.
          float x2 = uv.x * uAspect * 14.0 + uOffset.x * 3.4 + 5.0;
          float bx2 = floor(x2);
          float top2 = 0.12 + h1(bx2 + 2.0) * 0.12;
          if (uv.y < top2) col = mix(col, uCity * 0.6, 0.95);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'backdrop';
  }

  /** Camera target on the ground (for parallax), viewport aspect, time, and HDR window boost. */
  update(targetX: number, targetZ: number, aspect: number, time: number, hdr: boolean): void {
    const u = this.mat.uniforms;
    // Screen-space parallax: project the ground target onto the camera's right/up axes.
    const right = (targetX - targetZ) * Math.SQRT1_2;
    const up = -(targetX + targetZ) * Math.SQRT1_2;
    (u.uOffset.value as THREE.Vector2).set(right * 0.08, up * 0.08);
    u.uAspect.value = aspect;
    u.uTime.value = time;
    u.uHdr.value = hdr ? 2.2 : 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
