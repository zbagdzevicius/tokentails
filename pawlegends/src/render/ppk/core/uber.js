// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/uber.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/core/uber.js  (owner: core) — GLSL uber-program linker (PERF_SPEC §1.2 "programs per level", §3.5, §8.1).
//
// Every distinct ShaderMaterial source is its own WebGL program. A family of small effect shaders (fx particles,
// marks, telegraphs, decals, mist, trails, the sword aura, the sky...) therefore costs one program each: 25+ links,
// 25+ program switches, 25+ prewarm compiles. An `UberGroup` links any number of such *modules* into ONE program
// (plus its instanced variant): every material of the group carries the same source and picks its module with the
// `fxMode` uniform, so three's program cache resolves them all to the same program.
//
// Modules keep their own GLSL, written exactly as a standalone ShaderMaterial (GLSL 1 style: attribute / varying,
// `void main()`, `#include <...>` chunks). The linker, purely textually:
//   - hoists global `#include`s (deduplicated, `<common>` first) and the group's shared library snippets (exact text
//     matches, e.g. fx's SHAPES / NOISE / FOG_FACTOR) to the top, once;
//   - namespaces every module-level name (uniforms, consts, globals, functions, structs, `main`) with a per-module
//     prefix through `#define` / `#undef` (no GLSL parsing beyond top-level statements);
//   - maps varyings and custom attributes onto shared typed *slots* (`fxv_vec2_0`, `fxa_vec4_1`...): only one module
//     runs per draw, so modules reuse the same varying / attribute registers (WebGL's 16-attribute and 15-varying
//     limits hold for the whole group). Geometry attributes are aliased to their slot names at draw time (the same
//     BufferAttribute object under a second key: no copy, no extra GPU buffer);
//   - reproduces the per-module flags that would otherwise split programs: `side` (Front / Back become a
//     `gl_FrontFacing` discard on a DoubleSide, single-pass material) and `fog: false` (USE_FOG undefined inside the
//     module's block). Group materials are always DoubleSide + forceSinglePass + fog: true;
//   - emits modules that read `instanceMatrix` only into the USE_INSTANCING variant, the others into both.
// Uniforms: a material's `uniforms` object is the module's own (callers keep writing `mat.uniforms.uColor.value`); the
// linked names (`fxm3_uColor`) are getters onto the same entries, so replacing an entry later stays in sync.
//
// The group source is frozen ("sealed") at its first compile. Modules registered before that join the one program
// (every existing material is updated in place before it ever compiled). A module registered after the seal starts a
// new version (one more program, only for its new materials) and logs a warning: register module sources at import
// time (`group.module(...)`) so that never happens in play. Node-safe (no WebGL at import).
import * as THREE from 'three';

/** Every group created (debug: `__GAME__.art.uber()`). @type {Set<UberGroup>} */
export const UBER_GROUPS = new Set();

const QUAL = new Set(['highp', 'mediump', 'lowp', 'flat', 'smooth', 'invariant', 'centroid', 'noperspective']);

/** Strip // and block comments (GLSL has no string literals). Keeps newlines so preprocessor lines stay lines. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/\/\/[^\n]*/g, '');
}

/**
 * Split GLSL source into top-level items: `{ kind: 'pp' | 'decl' | 'func' | 'struct', text }`.
 * @param {string} src comment-free source
 */
export function topLevel(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++;
    if (i >= n) break;
    if (src[i] === '#') {
      let j = i;
      for (;;) {
        const e = src.indexOf('\n', j);
        const end = e < 0 ? n : e;
        if (src[end - 1] === '\\' || (src[end - 1] === '\r' && src[end - 2] === '\\')) { j = end + 1; continue; }
        out.push({ kind: 'pp', text: src.slice(i, end).trim() });
        i = end + 1;
        break;
      }
      continue;
    }
    // a statement: up to ';' at depth 0, or a '{...}' body (function / struct)
    let j = i, paren = 0;
    for (; j < n; j++) {
      const c = src[j];
      if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (c === ';' && paren === 0) { out.push({ kind: 'decl', text: src.slice(i, j + 1).trim() }); j++; break; }
      else if (c === '{' && paren === 0) {
        let d = 1, k = j + 1;
        for (; k < n && d > 0; k++) { if (src[k] === '{') d++; else if (src[k] === '}') d--; }
        const head = src.slice(i, j);
        if (/^\s*struct\b/.test(head)) {
          const semi = src.indexOf(';', k);
          out.push({ kind: 'struct', text: src.slice(i, semi + 1).trim() });
          j = semi + 1;
        } else {
          out.push({ kind: 'func', text: src.slice(i, k).trim() });
          j = k;
        }
        break;
      } else if (c === '#' && paren === 0 && /\n\s*$/.test(src.slice(Math.max(i, j - 80), j))) {
        // a preprocessor line inside an unterminated statement: malformed for our purposes
        break;
      }
    }
    if (j <= i) j = i + 1;
    i = j;
  }
  return out;
}

/** Split `a, b[3], c = 1.0` at top-level commas. */
function splitCommas(s) {
  const out = [];
  let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    else if (c === ',' && d === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * Parse a top-level declaration statement.
 * @param {string} text e.g. 'uniform highp vec3 uA, uB[4];'
 * @returns {{ storage: string, quals: string[], type: string, names: {name: string, arr: string}[] } | null}
 */
export function parseDecl(text) {
  const body = text.replace(/;\s*$/, '').trim();
  const words = body.split(/\s+/);
  let storage = '';
  const quals = [];
  let k = 0;
  for (; k < words.length; k++) {
    const w = words[k];
    if (w === 'uniform' || w === 'attribute' || w === 'varying' || w === 'const' || w === 'in' || w === 'out') storage = storage || w;
    else if (QUAL.has(w)) quals.push(w);
    else break;
  }
  if (k >= words.length) return null;
  const type = words[k];
  if (type === 'precision') return { storage: 'precision', quals, type, names: [] };
  const rest = words.slice(k + 1).join(' ');
  const names = splitCommas(rest).map((part) => {
    const m = /^([A-Za-z_]\w*)\s*(\[[^\]]*\])?/.exec(part);
    return m ? { name: m[1], arr: m[2] ?? '' } : null;
  }).filter(Boolean);
  return { storage, quals, type, names };
}

/** Name of a function definition / prototype (`vec2 fxShape( float s, vec2 uv )` → 'fxShape'). */
function funcName(text) {
  const m = /([A-Za-z_]\w*)\s*\(/.exec(text);
  return m ? m[1] : null;
}

/** Cheap 32-bit string hash (module identity). */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Rows a GLSL type occupies in the uniform / varying register file (vec4-sized rows, no packing assumed). */
function rows(type, arr) {
  const mt = /^mat([234])/.exec(type);
  const m = /\[(\d+)\]/.exec(arr ?? '');
  return (mt ? +mt[1] : 1) * (m ? +m[1] : 1);
}

/**
 * One linked family of shader modules (one program + its instanced variant).
 */
export class UberGroup {
  /**
   * @param {string} name group id (part of the program source banner and debug output)
   * @param {{ libs?: (string|{match: string, emit: string})[], shared?: string[], sharedVaryings?: Record<string, string>,
   *           prefix?: string }} [o] `libs`: GLSL
   *   snippets hoisted once (in this order) when a module contains them verbatim (`emit` replaces the text when given,
   *   e.g. wrapped in `#ifdef USE_FOG`); `sharedVaryings`: { name: declaration } kept by name in every module (not
   *   slotted, declared once); `shared`: uniform names that are never namespaced (declared by hoisted chunks /
   *   libs, e.g. fog and height-fog uniforms); `prefix`: name prefix (default 'fxm').
   */
  constructor(name, o = {}) {
    this.name = name;
    this.libs = (o.libs ?? []).map((l) => (typeof l === 'string' ? { match: l, emit: l } : l))
      .map((l) => ({ ...l, stripped: stripComments(l.match) }));
    this.shared = new Set(o.shared ?? []);
    /** Varyings every module shares under their own name (declared once, e.g. the fog world position), name → decl. */
    this.sharedVaryings = o.sharedVaryings ?? {};
    this.prefix = o.prefix ?? 'fxm';
    /** @type {any[]} */
    this.modules = [];
    this._byKey = new Map();
    this.version = 0;
    this.sealed = -1;              // version that compiled first (-1: none yet)
    this._src = null;              // cached { version, vertexShader, fragmentShader, stats }
    /** @type {Set<WeakRef<THREE.ShaderMaterial>>|Set<THREE.ShaderMaterial>} */
    this._mats = new Set();
    /** Late registrations (after the seal): debug / tests. */
    this.late = [];
    /** Optional patch applied to the linked source once (e.g. height fog): (shader) => void. */
    this.patch = null;
    UBER_GROUPS.add(this);
  }

  /**
   * Register (or find) a module. Call at import time where possible.
   * @param {{ vertexShader: string, fragmentShader: string, side?: THREE.Side, fog?: boolean, instanced?: boolean|'both',
   *           name?: string }} src `instanced`: true = the USE_INSTANCING variant only (automatic when the source reads
   *   `instanceMatrix`); 'both' = the module guards instancing itself (`#ifdef USE_INSTANCING`) and runs in both
   * @returns {object} the module record
   */
  module(src) {
    const side = src.side ?? THREE.FrontSide, fog = src.fog !== false;
    const key = hash(src.vertexShader) + '.' + hash(src.fragmentShader) + '.' + side + (fog ? 'f' : 'n') + (src.instanced ? 'i' : '');
    const had = this._byKey.get(key);
    if (had) return had;
    const index = this.modules.length;
    const mod = this._compileModule(index, src, side, fog);
    mod.key = key;
    this.modules.push(mod);
    this._byKey.set(key, mod);
    this.version++;
    this._src = null;
    if (this.sealed >= 0) {
      this.late.push(mod.name);
      console.warn(`[uber:${this.name}] module '${mod.name}' registered after the program compiled: it gets its own program (register it at import time)`);
    } else {
      this._refreshMaterials();
    }
    return mod;
  }

  /** Parse one module: namespacing macros, slots, hoisted includes / libs. @private */
  _compileModule(index, src, side, fog) {
    const p = `${this.prefix}${index}_`;
    const stage = (code) => {
      let s = stripComments(code);
      const libs = [];
      for (let k = 0; k < this.libs.length; k++) {
        const l = this.libs[k].stripped;
        if (l.trim() && s.includes(l)) { s = s.split(l).join('\n'); libs.push(k); }
      }
      return { items: topLevel(s), libs };
    };
    const V = stage(src.vertexShader), F = stage(src.fragmentShader);
    // 'both': the module guards its own instancing (`#ifdef USE_INSTANCING`) and runs in both variants
    const instanced = src.instanced === 'both' ? 'both' : (!!src.instanced || /\binstanceMatrix\b/.test(src.vertexShader));
    const uniforms = new Map();     // name → { type, arr, quals }
    const varyings = [];            // { name, type, quals }
    const attributes = [];          // { name, type }
    const sharedDecls = [];         // shared uniform declarations to hoist
    const incV = [], incF = [];
    const build = (items, isVS) => {
      const renames = new Map();
      const keep = [];
      for (const it of items) {
        if (it.kind === 'pp') {
          if (/^#\s*include\b/.test(it.text)) { (isVS ? incV : incF).push(it.text); continue; }
          if (/^#\s*(version|extension)\b/.test(it.text)) continue;
          const d = /^#\s*define\s+([A-Za-z_]\w*)/.exec(it.text);
          if (d) renames.set('#' + d[1], null);   // module-local macro: #undef after the block
          keep.push(it.text);
          continue;
        }
        if (it.kind === 'struct') {
          const m = /struct\s+([A-Za-z_]\w*)/.exec(it.text);
          if (m) renames.set(m[1], p + m[1]);
          keep.push(it.text);
          continue;
        }
        if (it.kind === 'func') {
          const fn = funcName(it.text);
          if (fn === 'main') renames.set('main', p + (isVS ? 'vmain' : 'fmain'));
          else if (fn) renames.set(fn, p + fn);
          keep.push(it.text);
          continue;
        }
        const d = parseDecl(it.text);
        if (!d) { keep.push(it.text); continue; }
        if (d.storage === 'precision') continue;
        if (d.storage === 'varying' || (d.storage === 'out' && isVS) || (d.storage === 'in' && !isVS)) {
          for (const nm of d.names) if (!(nm.name in this.sharedVaryings) && !varyings.some((v) => v.name === nm.name)) varyings.push({ name: nm.name, type: d.type + nm.arr, quals: d.quals.filter((q) => q === 'flat') });
          continue;
        }
        if (d.storage === 'attribute' || (d.storage === 'in' && isVS)) {
          for (const nm of d.names) if (!attributes.some((a) => a.name === nm.name)) attributes.push({ name: nm.name, type: d.type });
          continue;
        }
        if (d.storage === 'uniform') {
          const own = d.names.filter((nm) => !this.shared.has(nm.name));
          const sh = d.names.filter((nm) => this.shared.has(nm.name));
          for (const nm of sh) sharedDecls.push(`uniform ${d.quals.join(' ')} ${d.type} ${nm.name}${nm.arr};`.replace(/\s+/g, ' '));
          for (const nm of own) {
            uniforms.set(nm.name, { type: d.type, arr: nm.arr, quals: d.quals });
            renames.set(nm.name, p + nm.name);
          }
          if (own.length) keep.push(`uniform ${d.quals.join(' ')} ${d.type} ${own.map((x) => x.name + x.arr).join(', ')};`.replace(/\s+/g, ' '));
          continue;
        }
        // const / plain globals
        for (const nm of d.names) renames.set(nm.name, p + nm.name);
        keep.push(it.text);
      }
      return { renames, keep };
    };
    const vs = build(V.items, true), fs = build(F.items, false);
    return {
      index, name: src.name ?? `m${index}`, side, fog, instanced, prefix: p,
      uniforms, varyings, attributes, sharedDecls, incV, incF,
      libsV: V.libs, libsF: F.libs, vs, fs,
      /** varying / attribute → slot (filled at link time) */
      vSlots: new Map(), aSlots: new Map(),
    };
  }

  /**
   * The linked source of the current version (cached).
   * @returns {{ version: number, vertexShader: string, fragmentShader: string,
   *             stats: { modules: number, attributes: number, varyings: number, uniformsV: number, uniformsF: number } }}
   */
  source() {
    if (this._src && this._src.version === this.version) return this._src;
    const mods = this.modules;
    // ---- slots: per (quals, type) the max count any one module needs
    const vMax = new Map(), aMax = new Map();
    for (const m of mods) {
      const vc = new Map(), ac = new Map();
      m.vSlots.clear(); m.aSlots.clear();
      for (const v of m.varyings) {
        const t = (v.quals.length ? v.quals.join(' ') + ' ' : '') + v.type;
        const i = vc.get(t) ?? 0; vc.set(t, i + 1);
        m.vSlots.set(v.name, { t, i });
        vMax.set(t, Math.max(vMax.get(t) ?? 0, i + 1));
      }
      for (const a of m.attributes) {
        const i = ac.get(a.type) ?? 0; ac.set(a.type, i + 1);
        m.aSlots.set(a.name, { t: a.type, i });
        aMax.set(a.type, Math.max(aMax.get(a.type) ?? 0, i + 1));
      }
    }
    const slotName = (kind, t, i) => `${kind}_${t.replace(/\[(\d+)\]/, 'a$1').replace(/\s+/g, '_')}_${i}`;
    const varDecl = (t, i) => {
      const parts = t.split(' '), type = parts.pop(), q = parts.join(' ');
      const arr = /\[\d+\]/.exec(type)?.[0] ?? '';
      return `${q ? q + ' ' : ''}varying ${type.replace(/\[\d+\]/, '')} ${slotName('fxv', t, i)}${arr};`;
    };
    for (const m of mods) {
      m.vMacro = [...m.vSlots].map(([n, s]) => [n, slotName('fxv', s.t, s.i)]);
      m.aMacro = [...m.aSlots].map(([n, s]) => [n, slotName('fxa', s.t, s.i)]);
    }
    // ---- hoisted includes (common first) + libs + shared uniforms
    const order = (list) => {
      const seen = new Set(), out = [];
      for (const x of list) { const k = x.replace(/\s+/g, ''); if (!seen.has(k)) { seen.add(k); out.push(x); } }
      return out.sort((a, b) => (/<common>/.test(b) ? 1 : 0) - (/<common>/.test(a) ? 1 : 0));
    };
    const incOf = (isVS) => order(mods.flatMap((m) => (isVS ? m.incV : m.incF)));
    const sharedU = [...new Set(mods.flatMap((m) => m.sharedDecls))];
    const libs = (isVS) => [...new Set(mods.flatMap((m) => (isVS ? m.libsV : m.libsF)))].sort((a, b) => a - b).map((k) => this.libs[k].emit);
    const banner = `// uber:${this.name} v${this.version} (${mods.length} modules)`;
    const block = (m, isVS) => {
      const st = isVS ? m.vs : m.fs;
      const defs = [];
      const undefs = [];
      for (const [n, to] of [...m.vMacro, ...(isVS ? m.aMacro : [])]) { defs.push(`#define ${n} ${to}`); undefs.push(`#undef ${n}`); }
      for (const [n, to] of st.renames) {
        if (n.startsWith('#')) { undefs.push(`#undef ${n.slice(1)}`); continue; }
        defs.push(`#define ${n} ${to}`); undefs.push(`#undef ${n}`);
      }
      const fogOff = m.fog ? '' : `#ifdef USE_FOG\n#define FXU_FOG_${m.index}\n#undef USE_FOG\n#endif\n`;
      const fogOn = m.fog ? '' : `#ifdef FXU_FOG_${m.index}\n#define USE_FOG\n#undef FXU_FOG_${m.index}\n#endif\n`;
      return `// ---- module ${m.index}: ${m.name}\n${fogOff}${defs.join('\n')}\n${st.keep.join('\n')}\n${undefs.join('\n')}\n${fogOn}`;
    };
    // Instancing variants differ in the VERTEX stage only (three defines USE_INSTANCING there, not in the fragment
    // prefix): instanced-only modules live in the instanced vertex program, plain ones in the plain one, 'both' in
    // both; every fragment main is in both (it never reads instance data), so the dispatch always finds its module.
    const guard = (m, isVS) => (!isVS || m.instanced === 'both' ? null : m.instanced ? '#ifdef USE_INSTANCING' : '#ifndef USE_INSTANCING');
    const stageSrc = (isVS) => {
      const head = [banner, ...incOf(isVS), ...Object.values(this.sharedVaryings), ...sharedU, ...libs(isVS)];
      if (isVS) for (const [t, c] of aMax) for (let i = 0; i < c; i++) head.push(`attribute ${t} ${slotName('fxa', t, i)};`);
      for (const [t, c] of vMax) for (let i = 0; i < c; i++) head.push(varDecl(t, i));
      head.push('uniform int fxMode;');
      const body = [];
      const disp = [];
      for (const m of mods) {
        const g = guard(m, isVS);
        const b = block(m, isVS);
        const fn = `${m.prefix}${isVS ? 'vmain' : 'fmain'}`;
        let call = `if ( fxMode == ${m.index} ) { `;
        if (!isVS && m.side === THREE.FrontSide) call += 'if ( ! gl_FrontFacing ) discard; ';
        if (!isVS && m.side === THREE.BackSide) call += 'if ( gl_FrontFacing ) discard; ';
        call += `${fn}(); return; }`;
        body.push(g ? `${g}\n${b}\n#endif` : b);
        disp.push(g ? `${g}\n  ${call}\n#endif` : `  ${call}`);
      }
      const tail = isVS ? '  gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );' : '  discard;';
      return `${head.join('\n')}\n${body.join('\n')}\nvoid main() {\n${disp.join('\n')}\n${tail}\n}\n`;
    };
    const shader = { vertexShader: stageSrc(true), fragmentShader: stageSrc(false), uniforms: {} };
    if (this.patch) this.patch(shader);
    // stats: rows of the register files (no packing assumed: an upper bound). Shared varyings and the fog chunk's
    // vFogDepth count too. WebGL 2 guarantees 16 attributes (instanceMatrix takes 4 of them in the instanced variant),
    // 15 varying vectors and 224 fragment / 256 vertex uniform vectors: past those a phone may fail to link.
    let uV = 1, uF = 1;
    for (const m of mods) for (const [, u] of m.uniforms) { const r = rows(u.type, u.arr); uV += r; uF += r; }
    const stats = {
      modules: mods.length,
      attributes: [...aMax].reduce((s, [t, c]) => s + c * rows(t), 0) + 3,
      varyings: [...vMax].reduce((s, [t, c]) => s + c * rows(t.split(' ').pop(), /\[\d+\]/.exec(t)?.[0]), 0)
        + Object.keys(this.sharedVaryings).length + (mods.some((m) => m.incV.some((x) => /fog_pars_vertex/.test(x))) ? 1 : 0),
      uniformsV: uV, uniformsF: uF,
    };
    if ((stats.attributes > 12 || stats.varyings > 15 || uF > 224 || uV > 256) && !this._limitWarned) {
      this._limitWarned = true;
      console.warn(`[uber:${this.name}] near the WebGL 2 minimum limits (${JSON.stringify(stats)}): split the group`);
    }
    this._src = { version: this.version, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, stats };
    return this._src;
  }

  /** Point every not-yet-compiled material of the group at the current source. @private */
  _refreshMaterials() {
    if (!this._mats.size) return;
    const s = this.source();
    for (const ref of this._mats) {
      const m = typeof ref.deref === 'function' ? ref.deref() : ref;
      if (!m) { this._mats.delete(ref); continue; }
      if (m.vertexShader === s.vertexShader) continue;
      m.vertexShader = s.vertexShader; m.fragmentShader = s.fragmentShader; m.needsUpdate = true;
    }
  }

  /**
   * A material running module `mod` in this group's program.
   * @param {object} mod a record from `module()`
   * @param {THREE.ShaderMaterialParameters} params the module's material parameters (vertexShader / fragmentShader /
   *   side / fog are taken over by the group; everything else — uniforms, blending, depth state, name — is kept)
   * @returns {THREE.ShaderMaterial}
   */
  material(mod, params = {}) {
    const { vertexShader: _v, fragmentShader: _f, side: _s, fog: _g, ...rest } = params;
    const s = this.source();
    const m = new UberMaterial({ ...rest, vertexShader: s.vertexShader, fragmentShader: s.fragmentShader });
    m.side = THREE.DoubleSide;
    m.forceSinglePass = true;
    m.fog = true;
    // three keys `opaque` (transparent false + NormalBlending) into the program: an opaque module (the sky) draws with
    // NoBlending instead, the same pixels without blending and the same program as the transparent modules
    if (!m.transparent && m.blending === THREE.NormalBlending) m.blending = THREE.NoBlending;
    setUber(m, { group: this, mod });
    linkUniforms(m, mod);
    const group = this;
    const base = m.onBeforeCompile;
    m.onBeforeCompile = function (shader, renderer) {
      if (group.sealed < 0) group.sealed = group.version;
      group._fillSamplers(shader.uniforms);
      if (base && base !== THREE.Material.prototype.onBeforeCompile) base.call(this, shader, renderer);
    };
    this._mats.add(typeof WeakRef === 'function' ? new WeakRef(m) : m);
    return m;
  }

  /**
   * Every sampler of every module gets a value on every material (a 1×1 white texture for the other modules'):
   * three only binds the samplers a material lists, and a stale sampler left on texture unit 0 can alias a texture of
   * another type (the shadow map's DepthTexture) and make the whole draw fail (GL_INVALID_OPERATION).
   * @param {object} uniforms a group material's uniforms @private
   */
  _fillSamplers(uniforms) {
    if (!uniforms) return;
    for (const mod of this.modules) {
      for (const [name, u] of mod.uniforms) {
        if (!/^sampler/.test(u.type)) continue;
        const linked = mod.prefix + name;
        if (!(linked in uniforms)) uniforms[linked] = { value: blankTexture() };
      }
    }
  }

  /** Debug summary. */
  info() {
    const s = this.source();
    return { name: this.name, version: this.version, sealed: this.sealed, late: this.late.slice(), ...s.stats, names: this.modules.map((m) => m.name) };
  }
}

let _blank = null;
/** 1×1 white texture for the samplers a material's own module does not use (lazy; no GPU work until bound). */
function blankTexture() {
  if (_blank) return _blank;
  _blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  _blank.needsUpdate = true;
  return _blank;
}

/**
 * `userData.uber` is non-enumerable: Material.copy deep-copies userData through JSON, and the group record (its
 * module table and linked sources) must neither be serialised per clone nor leak into toJSON output.
 */
function setUber(m, ub) {
  Object.defineProperty(m.userData, 'uber', { value: ub, enumerable: false, writable: true, configurable: true });
}

/** Install the linked-name getters + fxMode + fog uniforms on a group material's own uniforms object. */
function linkUniforms(m, mod) {
  const u = m.uniforms ?? (m.uniforms = {});
  u.fxMode = { value: mod.index };
  if (!u.fogColor) Object.assign(u, THREE.UniformsUtils.clone(THREE.UniformsLib.fog));
  for (const [name] of mod.uniforms) {
    const linked = mod.prefix + name;
    if (Object.prototype.hasOwnProperty.call(u, linked)) continue;
    Object.defineProperty(u, linked, { get() { return u[name]; }, enumerable: true, configurable: true });
  }
}

/**
 * three keys a program on whether the geometry has a `normal` attribute (`vertexNormals`): every uber geometry gets
 * one (an alias of `position` when it has none; modules never read it) so all draws resolve to the same program.
 * @param {THREE.BufferGeometry} geometry
 */
function normalizeGeometry(geometry) {
  const at = geometry?.attributes;
  if (at && at.normal === undefined && at.position !== undefined) at.normal = at.position;
}

/**
 * Prepare every uber-material mesh under `root` before a `renderer.compile` (prewarm): the program-keying geometry
 * attributes are normalised up front, so the warm compile builds the same program the first draw uses.
 * @param {THREE.Object3D} root
 */
export function uberPrepare(root) {
  root?.traverse?.((o) => {
    const m = o.material;
    if (m && (m.isUberMaterial || (Array.isArray(m) && m.some((x) => x?.isUberMaterial)))) normalizeGeometry(o.geometry);
  });
}

/** The geometry → slot alias pass, run before every draw (a few reference compares; no allocation). */
function aliasAttributes(geometry, mod) {
  const at = geometry?.attributes;
  if (!at) return;
  if (at.normal === undefined && at.position !== undefined) at.normal = at.position;
  const list = mod.aMacro;
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const a = at[list[i][0]];
    if (a !== undefined && at[list[i][1]] !== a) at[list[i][1]] = a;
  }
}

/**
 * ShaderMaterial of an UberGroup: aliases its module's attributes onto the shared slots before each draw, and keeps
 * the linked uniform names on `clone()` / `copy()`.
 */
export class UberMaterial extends THREE.ShaderMaterial {
  constructor(params) { super(params); this.isUberMaterial = true; }
  onBeforeRender(renderer, scene, camera, geometry, object) {
    const ub = this.userData.uber;
    if (!ub) return;
    aliasAttributes(geometry, ub.mod);
    if (object?.isInstancedMesh && ub.mod.instanced === false && !this._uberWarned) {
      this._uberWarned = true;
      console.warn(`[uber:${ub.group.name}] '${ub.mod.name}' is drawn on an InstancedMesh: register it with instanced: true or 'both'`);
    }
  }
  copy(source) {
    super.copy(source);
    const ub = source.userData?.uber;
    if (ub) {
      setUber(this, ub);
      // cloneUniforms copied the getters as separate values: rebuild them over the clone's own entries
      for (const [name] of ub.mod.uniforms) { delete this.uniforms[ub.mod.prefix + name]; }
      linkUniforms(this, ub.mod);
      // cloneUniforms deep-copied the group's shared uniform objects (height fog...): share them again
      for (const k of ub.group.shared) if (source.uniforms?.[k]) this.uniforms[k] = source.uniforms[k];
      ub.install?.(this);          // per-material extras (e.g. fx basic's color / map / opacity accessors)
      this.onBeforeCompile = source.onBeforeCompile;
      ub.group._mats.add(typeof WeakRef === 'function' ? new WeakRef(this) : this);
    }
    return this;
  }
}
