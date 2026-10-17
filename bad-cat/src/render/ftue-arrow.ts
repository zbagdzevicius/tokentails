/**
 * First heist only (GDD 8): a glowing paw trail along the sim's own path (steps and hops) from the cat to the
 * quickest live Must-Wreck target, for the first 10 s (round 2: a straight 4 s arrow over furniture did not show
 * that the way up is a chair). Render only; reads SimState.
 */
import { ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { DIR_DX, DIR_DZ, PropSt, type Dir8, type SimState } from '../types';
import { canJump, canStep } from '../sim';
import { cellX, cellZ, levelY } from './space';

/**
 * Moves (steps and +1 hops, the sim's own rules) from the cat to every cell; -1 unreachable. Round 3: the arrow
 * points at the target that is quickest to reach, not the flat-nearest one (a 3-hop dresser climb lost to a
 * one-hop plate). Exported for tests.
 */
export function moveSteps(s: SimState): Int16Array {
  const { w, d } = s.grid;
  const out = new Int16Array(w * d).fill(-1);
  const c = s.cat;
  const q: number[] = [c.z * w + c.x];
  out[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const a = q[h];
    const ax = a % w;
    const az = (a - ax) / w;
    const lv = s.grid.level[a];
    for (let dir = 1 as Dir8; dir <= 8; dir = (dir + 1) as Dir8) {
      const bx = ax + DIR_DX[dir];
      const bz = az + DIR_DZ[dir];
      if (bx < 0 || bz < 0 || bx >= w || bz >= d) continue;
      const b = bz * w + bx;
      if (out[b] >= 0) continue;
      const ok = canStep(s, ax, az, lv, dir) || (s.grid.level[b] === lv + 1 && canJump(s, ax, az, lv, dir));
      if (!ok) continue;
      out[b] = out[a] + 1;
      q.push(b);
    }
  }
  return out;
}

/** Moves until the cat stands next to target (x, z) on its level, -1 if no such cell is reachable. */
export function stepsToTarget(s: SimState, steps: Int16Array, x: number, z: number, level: number): number {
  const { w, d } = s.grid;
  let best = -1;
  for (let dir = 1; dir <= 8; dir++) {
    const cx = x + DIR_DX[dir];
    const cz = z + DIR_DZ[dir];
    if (cx < 0 || cz < 0 || cx >= w || cz >= d) continue;
    const i = cz * w + cx;
    if (s.grid.level[i] !== level || steps[i] < 0) continue;
    if (best < 0 || steps[i] < best) best = steps[i];
  }
  return best;
}

/** The standing cell (z * w + x) stepsToTarget measured to, -1 if none. */
export function standCell(s: SimState, steps: Int16Array, x: number, z: number, level: number): number {
  const { w, d } = s.grid;
  let best = -1;
  let cell = -1;
  for (let dir = 1; dir <= 8; dir++) {
    const cx = x + DIR_DX[dir];
    const cz = z + DIR_DZ[dir];
    if (cx < 0 || cz < 0 || cx >= w || cz >= d) continue;
    const i = cz * w + cx;
    if (s.grid.level[i] !== level || steps[i] < 0) continue;
    if (best < 0 || steps[i] < best) {
      best = steps[i];
      cell = i;
    }
  }
  return cell;
}

/** Parent of every reachable cell on the cat's shortest move path (BFS, the sim's moves); -2 = the cat, -1 none. */
export function moveParents(s: SimState): Int16Array {
  const { w, d } = s.grid;
  const par = new Int16Array(w * d).fill(-1);
  const c = s.cat;
  const q: number[] = [c.z * w + c.x];
  par[q[0]] = -2;
  for (let h = 0; h < q.length; h++) {
    const a = q[h];
    const ax = a % w;
    const az = (a - ax) / w;
    const lv = s.grid.level[a];
    for (let dir = 1 as Dir8; dir <= 8; dir = (dir + 1) as Dir8) {
      const bx = ax + DIR_DX[dir];
      const bz = az + DIR_DZ[dir];
      if (bx < 0 || bz < 0 || bx >= w || bz >= d) continue;
      const b = bz * w + bx;
      if (par[b] !== -1) continue;
      const ok = canStep(s, ax, az, lv, dir) || (s.grid.level[b] === lv + 1 && canJump(s, ax, az, lv, dir));
      if (!ok) continue;
      par[b] = a;
      q.push(b);
    }
  }
  return par;
}

/** Cells from the cat (excluded) to `end` along `par`, in walking order; empty when unreachable. Exported for tests. */
export function pathTo(par: Int16Array, end: number): number[] {
  const out: number[] = [];
  let a = end;
  for (let guard = 0; a >= 0 && par[a] !== -2 && guard < 400; guard++) {
    out.push(a);
    a = par[a];
  }
  if (a < 0 || par[a] !== -2) return [];
  return out.reverse();
}

const DOTS = 28;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0);

export class FtueArrow {
  readonly mesh: InstancedMesh;
  private head: InstancedMesh;
  private mat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  private pathKey = '';
  private pts: Vector3[] = [];
  private hops: boolean[] = [];

  constructor() {
    // a paw print: a flattened bead (two per cell, left and right)
    const g = new SphereGeometry(0.035, 8, 6);
    g.scale(1, 0.35, 1.25);
    this.mesh = new InstancedMesh(g, this.mat, DOTS);
    this.mesh.name = 'ftue-arrow';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    for (let i = 0; i < DOTS; i++) this.mesh.setMatrixAt(i, ZERO);
    const cg = new ConeGeometry(0.07, 0.16, 10);
    cg.rotateX(Math.PI / 2); // point along +z
    const head = new InstancedMesh(cg, this.mat, 1);
    head.frustumCulled = false;
    head.renderOrder = 8;
    head.setMatrixAt(0, ZERO);
    this.head = head;
    this.mesh.add(head);
    this.mesh.visible = false;
  }

  update(s: SimState, cat: Vector3, T: number): void {
    const { w, d } = s.grid;
    let best = -1;
    let bestD = Infinity;
    let bestCost = Infinity;
    let bestCell = -1;
    const steps = moveSteps(s);
    for (let i = 0; i < s.props.length; i++) {
      const p = s.props[i];
      if (!p.target || p.hit || (p.state !== PropSt.REST && p.state !== PropSt.WOBBLE)) continue;
      const dd = Math.hypot(cellX(p.x, w) - cat.x, cellZ(p.z, d) - cat.z);
      // cost: the sim's move count; unreachable targets fall back to distance + 0.6 per level of climb
      const n = stepsToTarget(s, steps, p.x, p.z, p.level);
      const cost = n >= 0 ? n : 100 + dd / 0.4 + 0.6 * Math.abs(p.level - s.cat.level);
      if (cost < bestCost || (cost === bestCost && dd < bestD)) {
        bestCost = cost;
        bestD = dd;
        best = i;
        bestCell = n >= 0 ? standCell(s, steps, p.x, p.z, p.level) : -1;
      }
    }
    if (best < 0 || bestD < 0.5) return this.hide();
    const p = s.props[best];
    const to = new Vector3(cellX(p.x, w), levelY(p.level) + 0.25, cellZ(p.z, d));
    // the trail follows the path (re-planned when the cat moves to another cell)
    const key = `${s.cat.x},${s.cat.z},${s.cat.level},${best},${bestCell}`;
    if (key !== this.pathKey) {
      this.pathKey = key;
      this.pts = [];
      this.hops = [];
      const cells = bestCell >= 0 ? pathTo(moveParents(s), bestCell) : [];
      let prevLv: number = s.cat.level;
      for (const c of cells) {
        const x = c % w;
        const z = (c - x) / w;
        const lv = s.grid.level[c];
        this.pts.push(new Vector3(cellX(x, w), levelY(lv) + 0.02, cellZ(z, d)));
        this.hops.push(lv > prevLv);
        prevLv = lv;
      }
    }
    const flow = (T / 30) % 1;
    let used = 0;
    let prev = cat.clone();
    prev.y = levelY(s.cat.level) + 0.02;
    for (let k = 0; k < this.pts.length && used + 2 <= DOTS; k++) {
      const at = this.pts[k];
      const dir = at.clone().sub(prev).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const side = new Vector3(dir.z, 0, -dir.x).multiplyScalar(0.05);
      // a glow wave runs along the trail toward the target; a hop cell pulses bigger
      const wave = 0.75 + 0.35 * Math.max(0, Math.sin((k / Math.max(1, this.pts.length) - flow) * Math.PI * 2));
      const sc = (this.hops[k] ? 1.35 : 1) * wave;
      _q.setFromUnitVectors(new Vector3(0, 0, 1), dir);
      for (const sgn of [-1, 1]) {
        _p.copy(prev).lerp(at, sgn < 0 ? 0.35 : 0.8).addScaledVector(side, sgn);
        this.mesh.setMatrixAt(used++, _m.compose(_p, _q, _s.set(sc, sc, sc)));
      }
      prev = at;
    }
    for (let i = used; i < DOTS; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    // the arrow head over the target, pointing down at it
    const bob = 1 + 0.15 * Math.sin((T / 30) * Math.PI * 4);
    const top = to.clone().add(new Vector3(0, 0.22 + 0.03 * Math.sin((T / 30) * Math.PI * 2), 0));
    _q.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, -1, 0));
    this.head.setMatrixAt(0, _m.compose(top, _q, _s.set(bob, bob, bob)));
    this.head.instanceMatrix.needsUpdate = true;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.head.geometry.dispose();
    this.mat.dispose();
  }
}
