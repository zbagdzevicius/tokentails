/**
 * L-DJ materials. Self-lit shaders (fake key light, green floor bounce, moon rim) so the DJ reads
 * the same whatever lights L-WORLD adds; three's fog, tone mapping and colour-space chunks are
 * included so it sits in the same scene as everyone else.
 *
 * Fur: a base layer plus N "shells" (the same geometry pushed out along the normal, strands cut out
 * with a hash), which gives the fluffy kitten silhouette cheaply on one character.
 */
import { Color, DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils, type IUniform } from 'three';

/** Uniforms shared by every DJ material (updated once per frame). */
export interface SharedUniforms {
  uTime: IUniform<number>;
  uKick: IUniform<number>;
  uEnergy: IUniform<number>;
}

export function createShared(): SharedUniforms {
  return { uTime: { value: 0 }, uKick: { value: 0 }, uEnergy: { value: 0 } };
}

const fog = () => UniformsUtils.clone(UniformsLib.fog);

/** Lighting shared by fur and lit materials. n, v in world space. */
const LIGHT_GLSL = /* glsl */ `
  vec3 rave_light(vec3 albedo, vec3 n, vec3 v, float rimAmt, vec3 rimColor) {
    vec3 key = normalize(vec3(0.35, 0.8, 0.6));
    float wrap = pow(max(dot(n, key) * 0.5 + 0.5, 0.0), 1.7);
    // Green bounce from the glowing floor below, cool night fill from above.
    vec3 floorBounce = vec3(0.10, 0.42, 0.16) * clamp(-n.y * 0.6 + 0.45, 0.0, 1.0);
    vec3 skyFill = vec3(0.10, 0.13, 0.16) * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    return albedo * (wrap * 1.15 + floorBounce + skyFill) + rimColor * rim * rimAmt;
  }
`;

const NOISE_GLSL = /* glsl */ `
  float rave_hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float rave_vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(rave_hash(i), rave_hash(i + vec3(1, 0, 0)), f.x), mix(rave_hash(i + vec3(0, 1, 0)), rave_hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(rave_hash(i + vec3(0, 0, 1)), rave_hash(i + vec3(1, 0, 1)), f.x), mix(rave_hash(i + vec3(0, 1, 1)), rave_hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

// ---------------------------------------------------------------------------------------------
// Fur
// ---------------------------------------------------------------------------------------------
export interface FurOptions {
  base: number;
  /** Colour at the strand tips (lighter). */
  tip: number;
  /** Muzzle/belly cream patch colour and direction (geometry space) and amount. */
  cream?: number;
  creamDir?: [number, number, number];
  creamAmt?: number;
  /** Tabby stripe strength (0..1) and frequency. */
  stripe?: number;
  stripeFreq?: number;
  /** Shell fur length (geometry units). */
  shellLen?: number;
  /** Strand density (cells per unit). */
  strandFreq?: number;
  /** true: the shell layers (alpha-cut); false: the opaque base. */
  shell: boolean;
}

export function furMaterial(shared: SharedUniforms, o: FurOptions): ShaderMaterial {
  const cd = o.creamDir ?? [0, -0.3, 1];
  const len = Math.hypot(cd[0], cd[1], cd[2]) || 1;
  return new ShaderMaterial({
    name: o.shell ? 'dj-fur-shell' : 'dj-fur',
    fog: true,
    // Shells: alpha-blended (inner shells draw first inside the one stacked draw), so strand tips
    // fade softly on every tier; the composer has no MSAA, so alpha-to-coverage would not help.
    transparent: o.shell,
    depthWrite: !o.shell,
    defines: o.shell ? { SHELL: 1 } : {},
    uniforms: {
      ...fog(),
      uTime: shared.uTime,
      uKick: shared.uKick,
      uShells: { value: 8 },
      uShellLen: { value: o.shellLen ?? 0.03 },
      uBaseAo: { value: 0.72 },
      uBase: { value: new Color(o.base) },
      uTip: { value: new Color(o.tip) },
      uCream: { value: new Color(o.cream ?? o.tip) },
      uCreamDir: { value: [cd[0] / len, cd[1] / len, cd[2] / len] },
      uCreamAmt: { value: o.creamAmt ?? 0 },
      uStripe: { value: o.stripe ?? 0 },
      uStripeFreq: { value: o.stripeFreq ?? 38 },
      uStrandFreq: { value: o.strandFreq ?? 190 },
      // Green rim from the floor and lasers (reference), not a white halo.
      uRimColor: { value: new Color(0x3dff6a) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uKick;
      uniform float uShells;
      uniform float uShellLen;
      attribute float aShell;
      attribute float aFur;
      varying float vFur;
      varying vec3 vObj;
      varying vec3 vNw;
      varying vec3 vVw;
      varying float vShell;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float s = aShell / max(uShells, 1.0);
        vFur = aFur;
        vec3 p = position + normal * (uShellLen * s);
        // Strands droop a little and shiver on the kick.
        p.y -= uShellLen * s * s * 0.55;
        p += normal * sin(uTime * 31.0 + position.y * 47.0 + position.x * 23.0) * 0.004 * uKick * s;
        vObj = position;
        vShell = s;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vNw = normalize(mat3(modelMatrix) * normal);
        vVw = cameraPosition - wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uTip;
      uniform vec3 uCream;
      uniform vec3 uCreamDir;
      uniform float uCreamAmt;
      uniform float uStripe;
      uniform float uStripeFreq;
      uniform float uStrandFreq;
      uniform float uBaseAo;
      uniform vec3 uRimColor;
      varying vec3 vObj;
      varying vec3 vNw;
      varying vec3 vVw;
      varying float vShell;
      varying float vFur;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      ${LIGHT_GLSL}
      void main() {
        vec3 cell = floor(vObj * uStrandFreq);
        float strand = rave_hash(cell);
        float alpha = 1.0;
        #ifdef SHELL
          // Fewer strands survive further out: soft tapered fuzz. The outer shells fade instead of
          // cutting hard, so the silhouette is not jagged.
          float cut = vShell * 0.9 + 0.08;
          alpha = smoothstep(cut, cut + 0.1 + 0.15 * vShell, strand) * (1.0 - 0.85 * smoothstep(0.3, 1.0, vShell));
          if (alpha < 0.04) discard;
          // Short fur where aFur is low (face, around the eyes).
          if (vShell > vFur) discard;
        #endif
        vec3 n = normalize(vNw);
        vec3 v = normalize(vVw);
        vec3 dir = normalize(vObj + 1e-5);
        float cream = smoothstep(0.15, 0.75, dot(dir, uCreamDir)) * uCreamAmt;
        float warp = rave_vnoise(vObj * 9.0) * 2.6;
        float stripe = smoothstep(0.58, 0.82, sin(vObj.y * uStripeFreq + warp + abs(vObj.x) * 6.0) * 0.5 + 0.5);
        stripe *= uStripe * (1.0 - cream);
        vec3 albedo = mix(uBase, uCream, cream);
        albedo = mix(albedo, albedo * vec3(0.78, 0.6, 0.48), stripe);
        #ifdef SHELL
          float ao = mix(uBaseAo, 1.08, vShell);
          albedo = mix(albedo, mix(uTip, uCream, cream), vShell * 0.28) * ao;
        #else
          albedo *= uBaseAo * (0.92 + 0.16 * strand);
        #endif
        #ifdef SHELL
          // No green rim on the outer shells (it read as a noisy green fringe in close-ups).
          vec3 col = rave_light(albedo, n, v, 0.7 * (1.0 - vShell), uRimColor);
        #else
          vec3 col = rave_light(albedo, n, v, 0.7, uRimColor);
        #endif
        gl_FragColor = vec4(max(col, vec3(0.0)), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------------------------
// Lit (non-fur): headphones, eyes, deck body, sword hilt
// ---------------------------------------------------------------------------------------------
export interface LitOptions {
  color: number;
  /** Emissive colour and strength (strength > 1 blooms). */
  emissive?: number;
  emissiveStrength?: number;
  /** Blinn specular strength (0 = matte) and power. */
  spec?: number;
  shininess?: number;
  rim?: number;
  rimColor?: number;
  /** Multiply emissive by (1 + kick * pulse). */
  pulse?: number;
  doubleSide?: boolean;
}

export function litMaterial(shared: SharedUniforms, o: LitOptions): ShaderMaterial {
  return new ShaderMaterial({
    name: 'dj-lit',
    fog: true,
    ...(o.doubleSide ? { side: DoubleSide } : {}),
    uniforms: {
      ...fog(),
      uKick: shared.uKick,
      uColor: { value: new Color(o.color) },
      uEmissive: { value: new Color(o.emissive ?? 0x000000).multiplyScalar(o.emissiveStrength ?? 1) },
      uSpec: { value: o.spec ?? 0 },
      uShin: { value: o.shininess ?? 40 },
      uRim: { value: o.rim ?? 0.35 },
      uRimColor: { value: new Color(o.rimColor ?? 0x7dff9a) },
      uPulse: { value: o.pulse ?? 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNw;
      varying vec3 vVw;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNw = normalize(mat3(modelMatrix) * normal);
        vVw = cameraPosition - wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uKick;
      uniform vec3 uColor;
      uniform vec3 uEmissive;
      uniform float uSpec;
      uniform float uShin;
      uniform float uRim;
      uniform vec3 uRimColor;
      uniform float uPulse;
      varying vec3 vNw;
      varying vec3 vVw;
      #include <common>
      #include <fog_pars_fragment>
      ${LIGHT_GLSL}
      void main() {
        vec3 n = normalize(vNw + vec3(0.0, 1e-6, 0.0));
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vVw + vec3(0.0, 1e-6, 0.0));
        vec3 col = rave_light(uColor, n, v, uRim, uRimColor);
        vec3 key = normalize(vec3(0.35, 0.8, 0.6));
        vec3 h = normalize(key + v);
        col += uSpec * pow(max(dot(n, h), 0.0), uShin) * vec3(1.0);
        // Green moon glint from behind-above.
        vec3 h2 = normalize(normalize(vec3(0.0, 0.35, -1.0)) + v);
        col += uSpec * 0.6 * pow(max(dot(n, h2), 0.0), uShin * 0.5) * vec3(0.45, 1.0, 0.55);
        col += uEmissive * (1.0 + uKick * uPulse);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------------------------
// Vinyl record top (rotates with its platter)
// ---------------------------------------------------------------------------------------------
export function vinylMaterial(shared: SharedUniforms, label: number): ShaderMaterial {
  return new ShaderMaterial({
    name: 'dj-vinyl',
    fog: true,
    uniforms: { ...fog(), uKick: shared.uKick, uLabel: { value: new Color(label) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vVw;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vVw = cameraPosition - wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uKick;
      uniform vec3 uLabel;
      varying vec2 vUv;
      varying vec3 vVw;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        vec3 vinyl = vec3(0.025, 0.03, 0.03);
        // Grooves plus a green sheen band from the moon light.
        float grooves = 0.5 + 0.5 * sin(r * 220.0);
        float sheen = pow(max(0.0, cos(a * 2.0 - 0.6)), 10.0) * smoothstep(0.38, 0.9, r);
        vec3 col = vinyl * (0.8 + 0.4 * grooves) + vec3(0.18, 0.55, 0.25) * sheen * (0.6 + 0.4 * grooves);
        // Pink label with a paw print (pad + four toes).
        float lab = 1.0 - smoothstep(0.34, 0.35, r);
        vec2 q = p / 0.34;
        float pad = 1.0 - smoothstep(0.26, 0.3, length((q - vec2(0.0, -0.2)) * vec2(1.0, 1.3)));
        float toes = 0.0;
        toes += 1.0 - smoothstep(0.1, 0.13, length(q - vec2(-0.38, 0.18)));
        toes += 1.0 - smoothstep(0.1, 0.13, length(q - vec2(-0.13, 0.4)));
        toes += 1.0 - smoothstep(0.1, 0.13, length(q - vec2(0.13, 0.4)));
        toes += 1.0 - smoothstep(0.1, 0.13, length(q - vec2(0.38, 0.18)));
        vec3 labelCol = uLabel * (1.2 + 0.8 * uKick);
        labelCol = mix(labelCol, vec3(1.0, 0.95, 0.98) * 1.4, clamp(pad + toes, 0.0, 1.0));
        col = mix(col, labelCol, lab);
        // Spindle and a cue marker so the spin reads.
        col = mix(col, vec3(0.8), 1.0 - smoothstep(0.03, 0.04, r));
        float marker = (1.0 - smoothstep(0.012, 0.022, abs(p.y))) * step(0.0, p.x) * smoothstep(0.4, 0.45, r) * (1.0 - smoothstep(0.93, 0.96, r));
        col += vec3(0.9, 1.0, 0.9) * marker * 1.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------------------------
// LED ring round each platter: a chase that runs with the beat
// ---------------------------------------------------------------------------------------------
export function ledRingMaterial(dir: 1 | -1): ShaderMaterial {
  return new ShaderMaterial({
    name: 'dj-led-ring',
    uniforms: { uBeat: { value: 0 }, uKick: { value: 0 }, uEnergy: { value: 0.5 }, uDir: { value: dir } },
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uBeat;
      uniform float uKick;
      uniform float uEnergy;
      uniform float uDir;
      varying vec3 vPos;
      void main() {
        float a = atan(vPos.y, vPos.x) / 6.2831853 + 0.5;
        float seg = floor(a * 32.0);
        float head = mod(uDir * floor(uBeat * 8.0), 32.0);
        float d = mod(seg - head + 64.0, 32.0);
        float lit = d < 10.0 ? (1.0 - d / 10.0) : 0.0;
        float gap = smoothstep(0.08, 0.2, fract(a * 32.0)) * (1.0 - smoothstep(0.8, 0.92, fract(a * 32.0)));
        vec3 green = vec3(0.3, 1.0, 0.45);
        vec3 pink = vec3(1.0, 0.31, 0.62);
        vec3 col = mix(green, pink, step(0.85, uEnergy) * step(16.0, seg));
        float b = 0.12 + lit * (1.8 + 1.6 * uKick) * (0.5 + 0.5 * uEnergy);
        gl_FragColor = vec4(col * b * gap, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------------------------
// Sword blade: bright steel with a glint sweeping up the blade
// ---------------------------------------------------------------------------------------------
export function bladeMaterial(color: number): ShaderMaterial {
  return new ShaderMaterial({
    name: 'dj-blade',
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uGlint: { value: -1 }, uGlow: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vY;
      varying float vX;
      void main() {
        vY = position.y;
        vX = position.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uGlint;
      uniform float uGlow;
      varying float vY;
      varying float vX;
      void main() {
        // Steel: a darker blue-grey ridge, bright bevelled edges, a glint sweeping up per beat.
        float edge = smoothstep(0.012, 0.045, abs(vX));
        float fuller = 1.0 - smoothstep(0.005, 0.011, abs(vX));
        vec3 col = mix(uColor * vec3(0.42, 0.47, 0.56), uColor * 1.15, edge) * uGlow;
        col = mix(col, uColor * vec3(0.25, 0.28, 0.34), fuller * step(vY, 0.6));
        float gd = (vY - uGlint) * 9.0;
        float g = exp(-gd * gd);
        col += vec3(1.0, 1.0, 1.0) * g * 2.5;
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------------------------
// Bows: instanced, double-sided satin ribbon that glints as it tumbles
// ---------------------------------------------------------------------------------------------
export function bowMaterial(pink: number): ShaderMaterial {
  return new ShaderMaterial({
    name: 'dj-bows',
    side: DoubleSide,
    fog: true,
    uniforms: { ...fog(), uPink: { value: new Color(pink) }, uKick: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aShade;
      varying float vShade;
      varying vec3 vNw;
      varying vec3 vVw;
      varying vec2 vXY;
      varying float vNear;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vShade = aShade;
        vXY = position.xy;
        vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Near the camera: softer (a cheap depth-of-field look), never huge. Bows within 3 m are
        // skipped (zero size) and the next few metres are scaled down so none fills the lens.
        float camD = length(cameraPosition - centre.xyz);
        float near = 1.0 - smoothstep(3.0, 6.0, camD);
        vNear = near;
        float nearScale = camD < 3.0 ? 0.0 : mix(1.0, 0.55, near);
        vec4 wp = modelMatrix * instanceMatrix * vec4(position * nearScale, 1.0);
        // Zero-scale instances (popping in / shrinking out) must not normalise a zero vector.
        vNw = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
        vVw = cameraPosition - wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPink;
      uniform float uKick;
      varying float vShade;
      varying vec3 vNw;
      varying vec3 vVw;
      varying vec2 vXY;
      varying float vNear;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vNw + vec3(0.0, 0.0, 1e-5));
        vec3 v = normalize(vVw + vec3(0.0, 1e-5, 0.0));
        float facing = abs(dot(n, v));
        // Satin glowing ribbon: saturated hot pink, emissive ~1.8 (crosses the bloom threshold), a
        // glint when it faces you.
        float satin = 0.85 + 0.15 * facing + 0.35 * pow(facing, 12.0);
        vec3 base = mix(uPink, vec3(1.0, 0.3, 0.6), vShade * 0.35);
        // Knot a touch deeper (the shape is drawn for a 0.16 m lobe, scaled by BOW_W / 0.16).
        float knot = 1.0 - smoothstep(0.042, 0.062, length(vXY * vec2(1.0, 0.87)));
        base = mix(base, base * vec3(0.8, 0.55, 0.72), knot);
        // Emissive hot pink (pawPink x1.6) so every bow catches the bloom.
        vec3 col = base * satin * (1.6 + 0.3 * uKick);
        // Soft near bows: flatten the shading (no sharp glints) so they read out of focus.
        col = mix(col, uPink * 1.4, vNear * 0.6);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
