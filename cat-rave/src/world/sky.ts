/**
 * L-WORLD: night sky dome (gradient, horizon glow, stars) and the giant green moon (billboard with
 * procedural maria and craters, wide halo, horizon haze over its lower edge).
 *
 * Both are drawn on the far plane (gl_Position.z = w), so they never clip whatever `camera.far`
 * the director picks, and everything else draws in front of them.
 */
import { BackSide, Color, CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, SphereGeometry } from 'three';
import { NOISE, OUTPUT, SHARED_DECL, type SharedUniforms } from './glsl';

export function createSky(shared: SharedUniforms, starAmount: number) {
  const material = new ShaderMaterial({
    name: 'rave-sky',
    // uZen / uStarTint: theme colours (world/theme.ts), green by default.
    uniforms: { ...shared, uStars: { value: starAmount }, uZen: { value: new Color(0.0006, 0.003, 0.0012) }, uStarTint: { value: new Color(0.75, 1.0, 0.85) } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 wp = vec4(position * 500.0 + cameraPosition, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      uniform float uStars;
      uniform vec3 uZen;
      uniform vec3 uStarTint;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float el = d.y;
        // Near-black green (#020a04) from ~30° up; the fog colour only right at the horizon.
        vec3 zen = uZen;
        vec3 col = mix(uFogColor * 0.8, zen, smoothstep(-0.01, 0.3, el));
        // Thin green glow band hugging the horizon (lit haze) and a lift towards the moon.
        col += uMoonGlow * exp(-max(el, 0.0) * 22.0) * 0.045;
        vec3 md = normalize(uMoonCenter - cameraPosition);
        float m = max(dot(d, md), 0.0);
        col += uMoonGlow * (pow(m, 14.0) * 0.012 + pow(m, 60.0) * 0.07) * (1.0 + 0.3 * uKick * uDrop);
        // Stars: hashed cells on the sphere, twinkling, faded near the horizon and the moon.
        vec3 sp = d * 160.0;
        vec3 cell = floor(sp);
        float h = hash13(cell);
        if (h > 0.985) {
          vec3 f = fract(sp) - 0.5;
          float s = smoothstep(0.12, 0.0, length(f)) * (0.4 + 0.6 * hash13(cell + 7.0));
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 40.0);
          col += uStarTint * s * tw * smoothstep(0.06, 0.3, el) * (1.0 - pow(m, 6.0)) * uStars;
        }
        col += uFlash * 0.08 * smoothstep(0.0, 0.3, el);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        ${OUTPUT}
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(1, 32, 16), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

export function createMoon(shared: SharedUniforms, detail: 'low' | 'high') {
  const halo = 2.4; // quad half-size in moon radii
  const material = new ShaderMaterial({
    name: 'rave-moon',
    defines: { MOON_DETAIL: detail === 'high' ? 2 : 1 },
    uniforms: { ...shared, uHalo: { value: halo }, uMoonTint: { value: new Color(0.86, 1.0, 0.8) } },
    vertexShader: /* glsl */ `
      uniform vec3 uMoonCenter;
      uniform float uMoonRadius;
      uniform float uHalo;
      varying vec2 vQ;
      varying vec3 vWorld;
      void main() {
        vec3 toCam = cameraPosition - uMoonCenter;
        toCam.y = 0.0;
        vec3 f = length(toCam) > 0.001 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
        vec3 right = vec3(f.z, 0.0, -f.x);
        vQ = position.xy * uHalo;
        vec3 wp = uMoonCenter + (right * position.x + vec3(0.0, 1.0, 0.0) * position.y) * uHalo * uMoonRadius;
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        gl_Position.z = gl_Position.w * 0.99998;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      varying vec2 vQ;
      varying vec3 vWorld;
      ${NOISE}
      void main() {
        float r = length(vQ);
        float disc = 1.0 - smoothstep(0.988, 1.004, r);
        vec3 col = vec3(0.0);
        if (r < 1.01) {
          float rr = min(r, 1.0);
          vec3 n = vec3(vQ, sqrt(max(0.0, 1.0 - rr * rr)));
          vec2 sp = n.xy / (0.55 + 0.45 * n.z);
          // Smooth large maria (low-frequency fbm) plus a few soft big patches; no crater dots.
          float maria = smoothstep(0.44, 0.66, fbm(sp * 0.9 + vec2(3.7, 1.2)));
          float patches = exp(-dot(sp - vec2(-0.32, 0.28), sp - vec2(-0.32, 0.28)) * 9.0)
            + 0.8 * exp(-dot(sp - vec2(0.3, 0.12), sp - vec2(0.3, 0.12)) * 12.0)
            + 0.7 * exp(-dot(sp - vec2(-0.05, -0.36), sp - vec2(-0.05, -0.36)) * 10.0)
            + 0.5 * exp(-dot(sp - vec2(0.42, -0.3), sp - vec2(0.42, -0.3)) * 16.0);
          float detail = fbm(sp * 3.0 + 11.0);
          float lum = clamp(1.0 - 0.42 * maria - 0.34 * patches - 0.1 * detail, 0.05, 1.0);
          float limb = 0.68 + 0.32 * pow(max(n.z, 0.0), 0.45);
          col = mix(uMoonColor, uMoonTint, 0.35) * pow(lum, 1.15) * limb * 2.1 * (1.0 + 0.06 * uKick * uDrop);
        }
        float h = max(r - 1.0, 0.0);
        float pulse = 1.0 + 0.35 * uKick * uEnergy * (0.3 + 0.7 * uDrop);
        // Thick soft green halo reaching ~1.6 radii, plus a faint wide glow (no hard edge).
        vec3 halo = (uMoonColor * 0.4 + uMoonGlow * 0.6) * (exp(-h * 6.0) * 0.35 * (1.0 - smoothstep(0.25, 0.85, h)) + exp(-h * 3.0) * 0.015) * pulse;
        // A little horizon haze right at the moon's lower edge (the crowd hides most of it).
        float haze = smoothstep(6.0, -12.0, vWorld.y);
        col = mix(col, uFogColor * 1.4 + uMoonGlow * 0.25, haze * 0.35);
        vec3 outCol = col * disc + halo * (1.0 - disc) + uFlash * 0.15 * disc;
        float edgeFade = 1.0 - smoothstep(0.75, 1.0, r / uHalo);
        gl_FragColor = vec4(max(outCol * edgeFade, vec3(0.0)), disc);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
  // uHalo must be declared in the fragment too (shared decl doesn't include it).
  material.fragmentShader = 'uniform float uHalo;\nuniform vec3 uMoonTint;\n' + material.fragmentShader;
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.name = 'moon';
  mesh.frustumCulled = false;
  mesh.renderOrder = -99;
  return mesh;
}
