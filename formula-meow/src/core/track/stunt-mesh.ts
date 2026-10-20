/**
 * Set-piece geometry (render-only, SIM_VERSION 8; SETPIECES.md section 7): the generic look of every loop, wall ride,
 * jump gap and tunnel, merged into the track's `track-solid` and `track-glow` meshes (no draw call), plus one
 * transparent mesh per track for the catch nets (one draw call, only when the track has a jump gap). Theme skins
 * (src/tracks/skins) add to or replace the generic look. Math trig is fine here.
 *
 * - Loop: the ribbon deck (road bands, centre dashes, a raised rail on each edge, an underside), glow edge strips.
 * - Wall ride: the lane curls up a quarter pipe from the road edge to the sim's wall, a lip and a chase-light strip
 *   along the top, a skirt down to the ground. (core/track/mesh.ts draws no kerb or barrier on that side there.)
 * - Jump: lip faces at both ends of the gap (mesh.ts draws no deck over it), glass rail posts along the sides, a glow
 *   landing ring and chevrons past the far lip, the net under the gap.
 * - Tunnel: an arched shell (8 facets, a segment every 2 m) with portal frames, neon rings every 6 m and two streak
 *   strips along the ceiling.
 * - Approach: glow chevrons on the road 40 m before a loop's strip and a jump's lip.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Group } from 'three';
import type { BuiltPiece, BuiltTrack } from './build';
import type { Theme } from './themes';
import type { TriBuilder, V } from './mesh';
import { STUNT } from '../../tuning';
import { LOOP_LP } from './stunt';
import { curlAt, ribbonPose, type StuntPose } from '../render/stunt-pose';
import { pieceSkin } from '../../tracks/skins';

const CYAN = 0x3ae0ff;
const PINK = 0xff3ea5;

/** A point on the main road at sample i (wrapped), lateral d, lifted by `lift` (bank included, no ramps). */
function P(t: BuiltTrack, i: number, d: number, lift = 0): V {
  const j = ((i % t.n) + t.n) % t.n;
  return [t.px[j] - t.tz[j] * d, t.py[j] + d * t.bank[j] + lift, t.pz[j] + t.tx[j] * d];
}

const wrap = (t: BuiltTrack, i: number) => ((i % t.n) + t.n) % t.n;

/** Does the main segment i..j touch a jump's missing deck? (mesh.ts skips the road there) */
export function segmentInGap(t: BuiltTrack, i: number, j: number): boolean {
  for (let k = i; k <= j; k++) if (t.gapMask[wrap(t, k)]) return true;
  return false;
}

/** Is there a wall-ride lane on side s at sample i? (mesh.ts skips the kerb and barrier there) */
export function laneSide(t: BuiltTrack, i: number, s: number): boolean {
  const k = wrap(t, i);
  return (s > 0 ? t.laneR[k] : t.laneL[k]) > 0.05;
}

/** Everything for the set pieces of a track: generic looks (unless a skin replaces one) and the nets mesh. */
export function buildStuntMeshes(t: BuiltTrack, theme: Theme, solid: TriBuilder, glow: TriBuilder, group: Group, groundY: number): void {
  if (!t.pieces.length) return;
  const nets: number[] = [];
  for (const pc of t.pieces) {
    const skin = pieceSkin(t.def.theme, pc.kind, pc.skin);
    const replaced = skin ? skin({ track: t, piece: pc, theme, solid, glow, group, groundY }) === true : false;
    if (!replaced) {
      if (pc.kind === 'loop') loopMesh(t, pc, theme, solid, glow);
      else if (pc.kind === 'wall') wallMesh(t, pc, theme, solid, glow, groundY);
      else if (pc.kind === 'jump') jumpMesh(t, pc, theme, solid, glow, nets);
      else tunnelMesh(t, pc, theme, solid, glow);
    }
    // approach cues (mandatory pieces)
    if (pc.kind === 'loop') approach(t, pc.strip, glow);
    else if (pc.kind === 'jump') approach(t, pc.i0, glow);
  }
  if (nets.length) {
    const g = netGeometry(nets);
    const mesh = new Mesh(g, new MeshBasicMaterial({ color: theme.night ? 0xfff3dc : 0xffffff, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false }));
    mesh.name = 'track-nets';
    mesh.renderOrder = 1;
    group.add(mesh);
  }
}

/** Three glow chevrons pointing along the road 40 m before sample `at`. */
function approach(t: BuiltTrack, at: number, glow: TriBuilder): void {
  const start = at - Math.round(40 / t.step);
  for (let c = 0; c < 3; c++) {
    const a = start + Math.round((c * 4) / t.step);
    const tip = a + Math.round(2.4 / t.step);
    const hw = Math.min(3.2, t.halfW[wrap(t, a)] * 0.45);
    const L = Math.max(1, Math.round(0.6 / t.step));
    for (const s of [-1, 1]) {
      // a chevron arm: from the side back to the tip
      glow.quad(P(t, a, s * hw, 0.045), P(t, tip, 0, 0.045), P(t, tip + L, 0, 0.045), P(t, a + L, s * hw, 0.045), CYAN);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------------------------

const pA: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
const pB: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };

function poseV(p: StuntPose, along: number): V {
  return [p.x + p.fx * along, p.y + p.fy * along, p.z + p.fz * along];
}

function loopMesh(t: BuiltTrack, pc: BuiltPiece, theme: Theme, solid: TriBuilder, glow: TriBuilder): void {
  const hw = STUNT.loop.deckHalfW;
  const segs = Math.ceil(LOOP_LP / 0.9);
  const du = LOOP_LP / segs;
  const at = (u: number, d: number, lift: number, out: StuntPose): V => {
    ribbonPose(t, pc, u, d, lift, out);
    return [out.x, out.y, out.z];
  };
  for (let s = 0; s < segs; s++) {
    const u0 = s * du;
    const u1 = (s + 1) * du;
    const band = Math.floor(u0 / 6) % 2 === 0;
    const lift = 0.04;
    const a0 = at(u0, -hw, lift, pA);
    const a1 = at(u0, hw, lift, pA);
    const b0 = at(u1, -hw, lift, pB);
    const b1 = at(u1, hw, lift, pB);
    solid.quad(a1, a0, b0, b1, band ? theme.road : theme.roadB);
    // the underside, a little below the deck, and its edges
    const dn = -0.45;
    const c0 = at(u0, -hw, dn, pA);
    const c1 = at(u0, hw, dn, pA);
    const d0 = at(u1, -hw, dn, pB);
    const d1 = at(u1, hw, dn, pB);
    solid.quad(c0, c1, d1, d0, theme.skirt);
    // centre dashes
    if (Math.floor(u0 / 3) % 2 === 0) solid.quad(at(u0, 0.18, lift + 0.02, pA), at(u0, -0.18, lift + 0.02, pA), at(u1, -0.18, lift + 0.02, pB), at(u1, 0.18, lift + 0.02, pB), theme.line);
    // rails on both edges (along the deck's normal) and the outside faces
    for (const sd of [-1, 1]) {
      const e0 = at(u0, sd * hw, dn, pA);
      const e1 = at(u1, sd * hw, dn, pB);
      const r0 = at(u0, sd * hw, 0.75, pA);
      const r1 = at(u1, sd * hw, 0.75, pB);
      const col = Math.floor(u0 / 2) % 2 === 0 ? theme.curbA : theme.curbB;
      solid.quad(e0, e1, r1, r0, col);
      const i0 = at(u0, sd * (hw - 0.35), 0.75, pA);
      const i1 = at(u1, sd * (hw - 0.35), 0.75, pB);
      solid.quad(r0, r1, i1, i0, col);
      // a glow strip on top of the rail
      const g0 = at(u0, sd * (hw - 0.05), 0.78, pA);
      const g1 = at(u1, sd * (hw - 0.05), 0.78, pB);
      const h0 = at(u0, sd * (hw - 0.3), 0.78, pA);
      const h1 = at(u1, sd * (hw - 0.3), 0.78, pB);
      glow.quad(g0, g1, h1, h0, sd > 0 ? PINK : CYAN);
    }
  }
  // two support legs under the loop's sides (the lowest points of the circle, where it leaves and meets the road)
  for (const u of [LOOP_LP * 0.42, LOOP_LP * 0.58]) {
    ribbonPose(t, pc, u, 0, -0.45, pA);
    const top = poseV(pA, 0);
    const base: V = [top[0], t.py[pc.i0] - 0.1, top[2]];
    const r = 0.45;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const b = ((k + 1) / 6) * Math.PI * 2;
      solid.quad([base[0] + Math.cos(a) * r, base[1], base[2] + Math.sin(a) * r], [base[0] + Math.cos(b) * r, base[1], base[2] + Math.sin(b) * r], [top[0] + Math.cos(b) * r, top[1], top[2] + Math.sin(b) * r], [top[0] + Math.cos(a) * r, top[1], top[2] + Math.sin(a) * r], theme.wallA);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// wall ride
// ---------------------------------------------------------------------------------------------

const curl = { o: 0, h: 0, phi: 0 };

/** A point on the curled lane surface at sample i, `dl` m past the road edge on side s, `lift` along its normal. */
export function curlPoint(t: BuiltTrack, i: number, s: number, dl: number, lift = 0): V {
  const k = wrap(t, i);
  const lane = s > 0 ? t.laneR[k] : t.laneL[k];
  const hw = t.halfW[k];
  curlAt(dl, lane, curl);
  const bank = Math.atan(t.bank[k]) * s;
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  const lat = curl.o * cb - curl.h * sb;
  const up = curl.o * sb + curl.h * cb;
  const a = bank + curl.phi;
  const rx = -t.tz[k];
  const rz = t.tx[k];
  const ex = t.px[k] + rx * s * hw;
  const ey = t.py[k] + s * hw * t.bank[k];
  const ez = t.pz[k] + rz * s * hw;
  return [ex + rx * s * (lat - Math.sin(a) * lift), ey + up + Math.cos(a) * lift, ez + rz * s * (lat - Math.sin(a) * lift)];
}

function wallMesh(t: BuiltTrack, pc: BuiltPiece, theme: Theme, solid: TriBuilder, glow: TriBuilder, groundY: number): void {
  const len = ((pc.i1 - pc.i0 + t.n) % t.n) + 2;
  const stride = 2;
  const facets = 8;
  for (const s of pc.side === 0 ? [-1, 1] : [pc.side]) {
    for (let k = -2; k < len; k += stride) {
      const i = pc.i0 + k;
      const j = i + stride;
      if (!laneSide(t, i, s) && !laneSide(t, j, s)) continue;
      const wi = (s > 0 ? t.wallR[wrap(t, i)] : t.wallL[wrap(t, i)]) - t.halfW[wrap(t, i)];
      const wj = (s > 0 ? t.wallR[wrap(t, j)] : t.wallL[wrap(t, j)]) - t.halfW[wrap(t, j)];
      const m = (pc.i0 + k) * t.step;
      for (let f = 0; f < facets; f++) {
        const a0 = curlPoint(t, i, s, (wi * f) / facets, 0.02);
        const a1 = curlPoint(t, i, s, (wi * (f + 1)) / facets, 0.02);
        const b0 = curlPoint(t, j, s, (wj * f) / facets, 0.02);
        const b1 = curlPoint(t, j, s, (wj * (f + 1)) / facets, 0.02);
        const col = f >= facets - 2 ? (Math.floor(m / 2) % 2 === 0 ? theme.curbA : theme.curbB) : Math.floor(m / 8) % 2 === 0 ? theme.road : theme.roadB;
        if (s > 0) solid.quad(a0, a1, b1, b0, col);
        else solid.quad(a1, a0, b0, b1, col);
      }
      // the lip at the top (0.5 m along the outward tangent) and a chase-light strip just under it
      const ti = curlPoint(t, i, s, wi, 0.02);
      const tj = curlPoint(t, j, s, wj, 0.02);
      const li = curlPoint(t, i, s, wi + 0.5, 0.02);
      const lj = curlPoint(t, j, s, wj + 0.5, 0.02);
      solid.quad(ti, tj, lj, li, theme.wallA);
      const gi = curlPoint(t, i, s, wi - 0.35, 0.05);
      const gj = curlPoint(t, j, s, wj - 0.35, 0.05);
      const hi = curlPoint(t, i, s, wi - 0.65, 0.05);
      const hj = curlPoint(t, j, s, wj - 0.65, 0.05);
      glow.quad(gi, gj, hj, hi, Math.floor(m / 3) % 2 === 0 ? CYAN : PINK);
      // the outer skin down to the ground
      solid.quad(li, lj, [lj[0], groundY, lj[2]], [li[0], groundY, li[2]], theme.skirt);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// jump gap
// ---------------------------------------------------------------------------------------------

function jumpMesh(t: BuiltTrack, pc: BuiltPiece, theme: Theme, solid: TriBuilder, glow: TriBuilder, nets: number[]): void {
  if (pc.gap <= 0) return; // a kicker: the ramp mesh draws it
  const gapLen = (pc.i1 - pc.i0 + t.n) % t.n;
  // lip faces: the near deck's front and the far deck's face, full width to the walls
  for (const [i, dir] of [
    [pc.i0, 1],
    [pc.i1, -1],
  ] as const) {
    const k = wrap(t, i);
    const wl = t.wallL[k] + 0.3;
    const wr = t.wallR[k] + 0.3;
    const a = P(t, k, -wl, 0.02);
    const b = P(t, k, wr, 0.02);
    const drop = 7;
    const col = dir > 0 ? theme.skirt : theme.wallB;
    solid.quad(a, b, [b[0], b[1] - drop, b[2]], [a[0], a[1] - drop, a[2]], col);
    // a bright edge on the lip
    glow.quad(P(t, k, -wl, 0.05), P(t, k, wr, 0.05), P(t, k + dir * 1, wr, 0.05), P(t, k + dir * 1, -wl, 0.05), dir > 0 ? CYAN : 0xffe14d);
  }
  // glass rail posts along both sides over the gap (the sim's walls continue there)
  for (let k = 0; k <= gapLen; k += Math.max(1, Math.round(3 / t.step))) {
    const i = wrap(t, pc.i0 + k);
    for (const s of [-1, 1]) {
      const d = s * ((s > 0 ? t.wallR[i] : t.wallL[i]) + 0.25);
      const base = P(t, i, d, 0);
      const y0 = Math.max(t.py[pc.i0], t.py[pc.i1]) - 0.2;
      const r = 0.12;
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2;
        const b = ((q + 1) / 4) * Math.PI * 2;
        glow.quad([base[0] + Math.cos(a) * r, y0, base[2] + Math.sin(a) * r], [base[0] + Math.cos(b) * r, y0, base[2] + Math.sin(b) * r], [base[0] + Math.cos(b) * r, y0 + 1.1, base[2] + Math.sin(b) * r], [base[0] + Math.cos(a) * r, y0 + 1.1, base[2] + Math.sin(a) * r], CYAN);
      }
    }
  }
  // the rail along the post tops
  for (const s of [-1, 1]) {
    const i0 = pc.i0;
    const i1 = pc.i1;
    const d0 = s * ((s > 0 ? t.wallR[i0] : t.wallL[i0]) + 0.25);
    const d1 = s * ((s > 0 ? t.wallR[i1] : t.wallL[i1]) + 0.25);
    const y = Math.max(t.py[pc.i0], t.py[pc.i1]) + 0.9;
    const a = P(t, i0, d0);
    const b = P(t, i1, d1);
    glow.quad([a[0], y, a[2]], [b[0], y, b[2]], [b[0], y + 0.12, b[2]], [a[0], y + 0.12, a[2]], CYAN);
  }
  // the landing ring on the far deck at the aim point, and chevrons past the far lip
  const aim = pc.aimI;
  const ring = 18;
  const R0 = 2.1;
  const R1 = 2.7;
  const c = P(t, aim, t.line[aim] * 0.5, 0.05);
  for (let q = 0; q < ring; q++) {
    const a = (q / ring) * Math.PI * 2;
    const b = ((q + 1) / ring) * Math.PI * 2;
    glow.quad([c[0] + Math.cos(a) * R0, c[1], c[2] + Math.sin(a) * R0], [c[0] + Math.cos(b) * R0, c[1], c[2] + Math.sin(b) * R0], [c[0] + Math.cos(b) * R1, c[1], c[2] + Math.sin(b) * R1], [c[0] + Math.cos(a) * R1, c[1], c[2] + Math.sin(a) * R1], 0xffe14d);
  }
  approach(t, pc.i1 + Math.round((40 + 6) / t.step), glow);
  // the net: corners and sag of a grid under the gap
  const k0 = pc.i0;
  const k1 = pc.i1;
  const yN = Math.min(pc.lipY, pc.landY) - 2.4;
  const wl0 = t.wallL[k0];
  const wr0 = t.wallR[k0];
  const wl1 = t.wallL[k1];
  const wr1 = t.wallR[k1];
  const a = P(t, k0, -wl0);
  const b = P(t, k0, wr0);
  const cc = P(t, k1, wr1);
  const d = P(t, k1, -wl1);
  nets.push(a[0], yN + 0.8, a[2], b[0], yN + 0.8, b[2], cc[0], yN + 0.8, cc[2], d[0], yN + 0.8, d[2], yN);
}

/** The nets: a 6 × 6 sagging grid per gap (corners a, b, c, d at the rim height, the centre sags to `yN`). */
function netGeometry(nets: number[]): BufferGeometry {
  const pos: number[] = [];
  const N = 6;
  for (let o = 0; o < nets.length; o += 13) {
    const q = nets.slice(o, o + 13);
    const yN = q[12];
    const pt = (u: number, v: number): V => {
      // bilinear over the corners, sag toward the middle
      const x = (1 - u) * (1 - v) * q[0] + u * (1 - v) * q[3] + u * v * q[6] + (1 - u) * v * q[9];
      const yr = (1 - u) * (1 - v) * q[1] + u * (1 - v) * q[4] + u * v * q[7] + (1 - u) * v * q[10];
      const z = (1 - u) * (1 - v) * q[2] + u * (1 - v) * q[5] + u * v * q[8] + (1 - u) * v * q[11];
      const sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      return [x, yr + (yN - yr) * sag, z];
    };
    // thin strands both ways (a strand = a narrow quad)
    for (let a = 0; a <= N; a++)
      for (let b = 0; b < N; b++) {
        for (const swap of [false, true]) {
          const u0 = swap ? b / N : a / N;
          const v0 = swap ? a / N : b / N;
          const u1 = swap ? (b + 1) / N : a / N;
          const v1 = swap ? a / N : (b + 1) / N;
          const p0 = pt(u0, v0);
          const p1 = pt(u1, v1);
          const w = 0.07;
          pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p1[0], p1[1] + w, p1[2]);
          pos.push(p0[0], p0[1], p0[2], p1[0], p1[1] + w, p1[2], p0[0], p0[1] + w, p0[2]);
        }
      }
    // a faint fill so the net reads as a surface from the chase camera
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        if ((a + b) % 2) continue;
        const p00 = pt(a / N, b / N);
        const p10 = pt((a + 1) / N, b / N);
        const p11 = pt((a + 1) / N, (b + 1) / N);
        const p01 = pt(a / N, (b + 1) / N);
        pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
  }
  return geometryOf(pos);
}

function geometryOf(pos: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// tunnel
// ---------------------------------------------------------------------------------------------

function tunnelMesh(t: BuiltTrack, pc: BuiltPiece, theme: Theme, solid: TriBuilder, glow: TriBuilder): void {
  const len = (pc.i1 - pc.i0 + t.n) % t.n;
  const stride = Math.max(1, Math.round(2 / t.step));
  const facets = 8;
  const H = STUNT.tunnel.ceiling;
  /** arch point at sample i, angle index f of `facets` (0 = left foot, facets = right foot), inset along the radius */
  const arch = (i: number, f: number, inset: number): V => {
    const k = wrap(t, i);
    const W = Math.max(t.wallL[k], t.wallR[k]) + 0.9 - inset;
    const th = Math.PI * (f / facets);
    const lat = -Math.cos(th) * W;
    const h = 0.6 + Math.sin(th) * (H - 0.6 - inset);
    return P(t, k, lat, h - lat * t.bank[k]);
  };
  for (let k = 0; k < len; k += stride) {
    const i = pc.i0 + k;
    const j = pc.i0 + Math.min(len, k + stride);
    const m = k * t.step;
    for (let f = 0; f < facets; f++) {
      const col = Math.floor(m / 4) % 2 === 0 ? theme.wallA : theme.wallB;
      solid.quad(arch(i, f, 0), arch(j, f, 0), arch(j, f + 1, 0), arch(i, f + 1, 0), f === 0 || f === facets - 1 ? theme.skirt : col);
    }
    // the side walls below the arch's feet, down to the road's barrier height
    for (const f of [0, facets]) {
      const a = arch(i, f, 0);
      const b = arch(j, f, 0);
      solid.quad(a, b, [b[0], b[1] - 0.7, b[2]], [a[0], a[1] - 0.7, a[2]], theme.skirt);
    }
    // streak strips along the upper sides
    for (const f of [2.2, 5.8]) {
      const fa = Math.floor(f);
      const g0 = lerpV(arch(i, fa, 0.08), arch(i, fa + 1, 0.08), f - fa);
      const g1 = lerpV(arch(j, fa, 0.08), arch(j, fa + 1, 0.08), f - fa);
      const h0: V = [g0[0], g0[1] - 0.22, g0[2]];
      const h1: V = [g1[0], g1[1] - 0.22, g1[2]];
      glow.quad(g0, g1, h1, h0, f < 4 ? CYAN : PINK);
    }
  }
  // neon rings every `ring` m (a band just inside the shell)
  const ringEvery = Math.max(2, Math.round(STUNT.tunnel.ring / t.step));
  const band = Math.max(1, Math.round(0.4 / t.step));
  for (let k = Math.round(ringEvery / 2); k + band <= len; k += ringEvery) {
    const i = pc.i0 + k;
    const j = i + band;
    const col = Math.floor(k / ringEvery) % 2 === 0 ? PINK : 0xffe14d;
    for (let f = 0; f < facets; f++) glow.quad(arch(i, f, 0.12), arch(j, f, 0.12), arch(j, f + 1, 0.12), arch(i, f + 1, 0.12), col);
  }
  // portal frames at both ends (a thick ring facing out)
  for (const [i, dir] of [
    [pc.i0, -1],
    [pc.i1, 1],
  ] as const) {
    for (let f = 0; f < facets; f++) {
      const a0 = arch(i, f, 0);
      const a1 = arch(i, f + 1, 0);
      const o0 = arch(i, f, -1.1);
      const o1 = arch(i, f + 1, -1.1);
      solid.quad(a0, a1, o1, o0, theme.accent);
      const e0 = arch(i + dir, f, -1.1);
      const e1 = arch(i + dir, f + 1, -1.1);
      solid.quad(o0, o1, e1, e0, theme.accent);
    }
    // a glow trim inside the portal
    for (let f = 0; f < facets; f++) glow.quad(arch(i, f, 0.05), arch(i, f + 1, 0.05), arch(i - dir, f + 1, 0.05), arch(i - dir, f, 0.05), CYAN);
  }
}

function lerpV(a: V, b: V, w: number): V {
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}
