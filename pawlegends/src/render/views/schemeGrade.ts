/**
 * Map colour schemes in the shaders (render only, render/mapSchemes.ts): one grade at the end of every map material's
 * fragment shader, reading one shared uniform set per scene role, so a scheme swaps by writing 6 × 3 uniforms (no
 * rebuild, no new texture, pass or light). Each map mesh takes its role from its name; banners (team cloth), the gate
 * glow, lanterns and the shadow stand-ins are never graded. The grade runs on the final display colour, so the native
 * scheme (identity uniforms) draws exactly what the map drew before.
 */
import * as THREE from 'three';
import { IDENTITY, ROLES, gradeUniforms, mapBands, type GradeUniforms, type MapScheme, type Role } from '../mapSchemes';

/** Mesh name → role (anything else on the map is ground). */
const ROLE_OF: Readonly<Record<string, Role | null>> = Object.freeze({
  bushes: 'bush',
  forest: 'trees',
  'far-forest': 'trees',
  hedge: 'trees',
  walls: 'trees',
  'wall-crowns': 'trees',
  'raised-caps': 'cap',
  'raised-sides': 'cliff',
  river: 'water',
  // never graded: team cloth, the gate's glow, light sources, shadow-only meshes
  banners: null,
  'banners-swapped': null,
  'gate-barrier': null,
  lanterns: null,
  'scenery-shadow': null,
});

/** The role a map mesh grades as (null: left alone). */
export function roleOf(o: THREE.Object3D): Role | null {
  const n = o.name;
  if (n in ROLE_OF) return ROLE_OF[n];
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  if (m && (m as THREE.ShaderMaterial).isShaderMaterial) return 'water';
  if (m && m.toneMapped === false) return null;
  return 'ground';
}

type U = { plGA: { value: THREE.Vector4 }; plGB: { value: THREE.Vector4 }; plGT: { value: THREE.Vector3 } };
const fresh = (g: GradeUniforms = IDENTITY): U => ({
  plGA: { value: new THREE.Vector4(...g.a) },
  plGB: { value: new THREE.Vector4(...g.b) },
  plGT: { value: new THREE.Vector3(...g.tint) },
});
/** One uniform set per role, shared by every graded material (and by both map views). */
const UNI: Record<Role, U> = Object.fromEntries(ROLES.map((r) => [r, fresh()])) as Record<Role, U>;

/** The grade (the same maths as mapSchemes.ts gradeRgb). */
export const GRADE_GLSL = /* glsl */ `
uniform vec4 plGA;
uniform vec4 plGB;
uniform vec3 plGT;
vec3 plGrade(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  vec3 h = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-10)), d / (q.x + 1.0e-10), q.x);
  float off = fract(h.x - plGA.x + 0.5) - 0.5;
  float w = (1.0 - smoothstep(plGA.y * 0.7, plGA.y, abs(off))) * smoothstep(0.04, 0.12, h.y) * plGA.w;
  float nh = plGB.x > 0.5 ? fract(plGA.z + off * 0.5) : h.x;
  vec3 hv = vec3(nh, clamp(h.y * plGB.y, 0.0, 1.0), clamp(h.z * plGB.z + plGB.w, 0.0, 1.0));
  vec3 rp = clamp(abs(fract(hv.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  vec3 g = hv.z * mix(vec3(1.0), rp, hv.y);
  return mix(c, g, w) * plGT;
}
`;

/** Put the grade into a fragment shader: the functions before main, the call at its very end. */
export function injectGrade(frag: string): string {
  const at = frag.search(/void\s+main\s*\(\s*(void)?\s*\)/);
  const end = frag.lastIndexOf('}');
  if (at < 0 || end < at) return frag;
  return frag.slice(0, at) + GRADE_GLSL + frag.slice(at, end) + '  gl_FragColor.rgb = plGrade(gl_FragColor.rgb);\n' + frag.slice(end);
}

/** Materials already graded (a WeakSet, not userData: a clone must not inherit the mark without the hook). */
const done = new WeakSet<THREE.Material>();

/** Grade one material as `role` (idempotent; a material shared by two roles keeps the first). */
export function gradeMaterial(mat: THREE.Material, role: Role): void {
  if (done.has(mat)) return;
  done.add(mat);
  // a raw shader writes its own output variable: left alone
  if ((mat as THREE.RawShaderMaterial).isRawShaderMaterial) return;
  const u = UNI[role];
  if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
    const sm = mat as THREE.ShaderMaterial;
    Object.assign(sm.uniforms, u);
    sm.fragmentShader = injectGrade(sm.fragmentShader);
    sm.needsUpdate = true;
    return;
  }
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = injectGrade(sh.fragmentShader);
  };
  // the old key, worked out with the old hook in place (three's default key is the hook's source text)
  mat.customProgramCacheKey = function () {
    const mine = this.onBeforeCompile;
    this.onBeforeCompile = prev;
    const k = prevKey.call(this);
    this.onBeforeCompile = mine;
    return `${k}|pl-grade-${role}`;
  };
  mat.needsUpdate = true;
}

/** Grade every mesh of a map group by its role (call once the view is built; safe to call again for new meshes). */
export function gradeGroup(group: THREE.Object3D): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const role = roleOf(mesh);
    if (!role) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m && (m as THREE.Material).colorWrite !== false) gradeMaterial(m as THREE.Material, role);
  });
}

/** Point the shared uniforms at `scheme` (null: the native look) for map `map`'s bands. */
export function setGrade(map: string, scheme: MapScheme | null): void {
  const bands = mapBands(map);
  for (const r of ROLES) {
    const g = scheme ? gradeUniforms(scheme.grade[r], bands[r]) : IDENTITY;
    UNI[r].plGA.value.set(...g.a);
    UNI[r].plGB.value.set(...g.b);
    UNI[r].plGT.value.set(...g.tint);
  }
}

/** Tests: the live uniform values of a role. */
export const gradeState = (r: Role): { a: number[]; b: number[]; tint: number[] } => ({
  a: UNI[r].plGA.value.toArray(),
  b: UNI[r].plGB.value.toArray(),
  tint: UNI[r].plGT.value.toArray(),
});
