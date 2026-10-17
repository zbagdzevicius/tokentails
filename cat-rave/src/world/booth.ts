/**
 * L-WORLD: the DJ booth table. A translucent light-box (glowing green panels) inside a thin black
 * frame with a dark top slab; the decks (L-DJ) sit on the slab at `LAYOUT.boothSize.h`.
 * Two draw calls: the light panels and the merged frame.
 */
import { BoxGeometry, Color, Group, Mesh, ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOG, NOISE, OUTPUT, SHARED_DECL, type SharedUniforms } from './glsl';

export function createBooth(shared: SharedUniforms, size: { w: number; h: number; d: number }, glow: number) {
  const group = new Group();
  group.name = 'booth';
  const slabH = 0.07;
  const bar = 0.045;
  const panelH = size.h - slabH;

  // Light box: emissive panels, brighter in the middle like a diffuser, breathing with the kick.
  const panelGeo = new BoxGeometry(size.w - bar, panelH - bar, size.d - bar);
  panelGeo.translate(0, (panelH - bar) / 2 + bar / 2, 0);
  const panelMat = new ShaderMaterial({
    name: 'rave-booth-panel',
    uniforms: { ...shared, uColor: { value: new Color(glow) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${NOISE}
      ${FOG}
      float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r) - 1.0; }
      void main() {
        vec2 e = min(vUv, 1.0 - vUv);
        float edgeD = min(e.x, e.y);
        float top = vNormal.y > 0.5 ? 0.0 : 1.0; // top face is hidden by the slab anyway
        // A pastel-green light box (lum > 1 so it blooms green, not white, after ACES), the brightest
        // thing in the crowd: an even diffuser with a hot rim
        // along every edge (blooms), breathing with the kick.
        float rim = exp(-edgeD * 26.0);
        float diffuser = 0.9 + 0.1 * smoothstep(0.0, 0.3, edgeD);
        // LED chase bars in a drop.
        float bars = step(0.5, fract(vUv.y * 6.0 - uBeat * 0.5)) * uDrop * 0.14;
        float lum = (2.4 + 0.22 * uKick * (0.35 + 0.65 * uEnergy) + bars) * diffuser + rim * 1.5;
        // Front face: a big printed paw-print logo and two thin light strips, so it isn't a blank slab.
        float logo = 0.0;
        if (vNormal.z > 0.5) {
          vec2 p = (vUv - vec2(0.5, 0.5)) * vec2(2.2, 1.0);
          float d = ell(p, vec2(0.0, -0.12), vec2(0.17, 0.14));
          d = min(d, ell(p, vec2(-0.2, 0.08), vec2(0.06, 0.08)));
          d = min(d, ell(p, vec2(-0.075, 0.2), vec2(0.06, 0.08)));
          d = min(d, ell(p, vec2(0.075, 0.2), vec2(0.06, 0.08)));
          d = min(d, ell(p, vec2(0.2, 0.08), vec2(0.06, 0.08)));
          logo = 1.0 - smoothstep(-0.05, 0.05, d);
          float strips = (1.0 - smoothstep(0.0, 0.012, abs(vUv.y - 0.12))) + (1.0 - smoothstep(0.0, 0.012, abs(vUv.y - 0.88)));
          lum += strips * 0.8;
        }
        // Tinted towards white: a bright white-green light box, one of the brightest things on screen.
        vec3 col = mix(uColor, vec3(0.9, 1.0, 0.9), 0.4) * lum * top;
        // A faint paw-print logo (the reference light box is plain): pink on the kick.
        vec3 ink = mix(vec3(0.02, 0.18, 0.06), vec3(1.0, 0.16, 0.5) * 2.2, 0.35 + 0.65 * uKick * uEnergy);
        col = mix(col, ink, logo * 0.15 * top);
        col += uFlash * 0.4;
        col = applyFog(col, length(cameraPosition - vWorld));
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        ${OUTPUT}
      }
    `,
    fog: false,
  });
  const panels = new Mesh(panelGeo, panelMat);
  panels.name = 'booth-panels';
  group.add(panels);

  // Frame: four legs, bottom and top rails, and the top slab, merged into one geometry.
  const parts: BoxGeometry[] = [];
  const hw = size.w / 2 - bar / 2;
  const hd = size.d / 2 - bar / 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) parts.push(new BoxGeometry(bar, panelH, bar).translate(sx * hw, panelH / 2, sz * hd));
  for (const y of [bar / 2, panelH - bar / 2]) {
    for (const sz of [-1, 1]) parts.push(new BoxGeometry(size.w, bar, bar).translate(0, y, sz * hd));
    for (const sx of [-1, 1]) parts.push(new BoxGeometry(bar, bar, size.d).translate(sx * hw, y, 0));
  }
  parts.push(new BoxGeometry(size.w + 0.12, slabH, size.d + 0.12).translate(0, size.h - slabH / 2, 0));
  const frameGeo = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const frameMat = new ShaderMaterial({
    name: 'rave-booth-frame',
    uniforms: {
      ...shared,
      uGlowColor: { value: new Color(glow) },
      uSlab: { value: [size.w / 2 + 0.06, size.d / 2 + 0.06, size.h - 0.005] },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      uniform vec3 uGlowColor;
      // x, y: slab half width / depth; z: slab top height.
      uniform vec3 uSlab;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${FOG}
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 3.0);
        // Satin black: a faint green sheen from the panels and the moon.
        vec3 col = vec3(0.012, 0.016, 0.014) + uGlowColor * (rim * 0.22 + max(vNormal.y, 0.0) * 0.03) + uMoonGlow * rim * 0.05;
        // Slab top: a lit rim ring 0.15 m wide round the decks, so the booth is the brightest thing
        // in the top-down vortex shot.
        if (vNormal.y > 0.5 && vWorld.y > uSlab.z) {
          float edgeD = min(uSlab.x - abs(vWorld.x), uSlab.y - abs(vWorld.z));
          float ring = 1.0 - smoothstep(0.13, 0.16, edgeD);
          col = mix(col, uGlowColor * (1.6 + 0.4 * uKick * uEnergy), ring);
        }
        col += uFlash * 0.05;
        col = applyFog(col, length(cameraPosition - vWorld));
        gl_FragColor = vec4(col, 1.0);
        ${OUTPUT}
      }
    `,
    fog: false,
  });
  const frame = new Mesh(frameGeo, frameMat);
  frame.name = 'booth-frame';
  group.add(frame);

  return {
    group,
    dispose() {
      panelGeo.dispose();
      panelMat.dispose();
      frameGeo.dispose();
      frameMat.dispose();
    },
  };
}
