/**
 * Props (GDD 4.4, 11.1, 11.2): every kind in PROP_KINDS as a small merged primitive mesh (world/prop-shapes.ts).
 * Resting props are instanced by kind; a falling or carried prop hides its instance (scale 0) and a pooled
 * standalone mesh takes over, so no instance matrix is written per frame except for the few moving ones.
 * FULL build:
 * - stacks (plates, books, cups, gifts, snacks, towels, boxes, champagne coupes) split into their items when they
 *   fall: each piece tumbles on its own, staggered, and the pieces of a soft stack stay scattered on the floor
 *   (one InstancedMesh per stack kind and colour variant);
 * - the tablecloth spans its w x d cells, slides with a ripple when pulled and crumples when it drops;
 * - the Christmas tree sways with PropState.sway and topples about its base across `topple` cells;
 * - the cardboard box flings its flaps open while the cat sits in it (SimState.inBox);
 * - the Roomba is handed to world-dynamics.ts while SimState.roomba drives it;
 * - the sponsor product carries RoomDef.sponsor.label on a canvas texture (none in Node).
 * Must-Wreck targets get a pulsing gold outline (inverted hull), a gold ring and a beacon; grabbables a glow ring.
 */
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  type Texture,
} from 'three';
import { DIR_DX, DIR_DZ, PropSt, propKind, type PlayableRoom, type PropState, type SimState } from '../types';
import { hash01 } from './geo';
import { PAL, shadeHex } from './palette';
import { tagShardColors } from './shards';
import { cellX, cellZ, clamp01, levelY, smooth01 } from './space';
import { makeLabelTexture } from './world/label';
import { SPONSOR_LABEL, buildBoxGeometry, buildClothGeometry, buildPropGeometry, buildStackPieceGeometry, stackLayout, stackTint, type StackLayout } from './world/prop-shapes';

export { buildPropGeometry, buildClothGeometry, buildStackPieceGeometry, stackLayout, stackTint } from './world/prop-shapes';

/** Must-Wreck highlight gold (ring, beacon). */
const TARGET_GOLD = 0xffd166;

/** Final tumble angle when a non-breaking prop lands (radians about the push axis). */
export function landTip(kind: number): number {
  switch (kind) {
    case 5:
    case 33:
    case 36:
    case 40:
    case 53:
      return Math.PI; // upside down: the contents tip out
    case 6:
    case 9:
    case 12:
    case 21:
    case 34:
    case 61:
      return Math.PI * 0.5;
    case 10:
    case 14:
    case 15:
    case 19:
    case 29:
    case 39:
    case 42:
    case 43:
    case 50:
    case 52:
    case 57:
    case 59:
      return Math.PI * 2; // flat things flip over once and land flat
    case 18:
    case 24:
      return Math.PI * 1.15;
    case 23:
      return Math.PI * 3; // the yarn rolls
    default:
      return Math.PI * 0.5;
  }
}

/** Shard palette per kind (first = dominant). Tagged so Shards picks the material burst style. */
export function shardColors(kind: number): number[] {
  return tagShardColors(rawShardColors(kind), kind);
}

function rawShardColors(kind: number): number[] {
  const c = propKind(kind)?.color ?? 0xcccccc;
  switch (kind) {
    case 1:
      return [c, 0xffffff, 0x9b1b3a];
    case 2:
      return [c, 0xfff1e6, 0x5a3424];
    case 3:
      return [c, 0x9cc7e8, 0xffffff];
    case 4:
      return [c, 0xff9a3c, 0xe2453c, 0x9ccc5a];
    case 5:
      return [0xfff6e4, 0xffd24a, c];
    case 6:
      return [c, 0xfffbf4, 0xe0233f];
    case 7:
      return [c, 0xff8fb1, 0xffd84a, PAL.leaf];
    case 8:
      return [c, 0x5a3b2a, PAL.leaf];
    case 9:
      return [c, 0xfff1c9, 0xfff8e0];
    case 11:
      return [c, 0x6fb7e8, 0x5d6170];
    case 13:
      return [c, 0xffffff, 0xe8b04a];
    case 16:
      return [c, 0xffd166, 0xffffff];
    case 22:
      return [c, 0xffe08a, 0xe63946, 0xffffff];
    case 25:
      return [c, 0xff8fab, 0x5fa8e8];
    case 26:
      return [c, 0xffd23f, 0xe63946, 0x8ac926];
    case 28:
      return [c, 0xffca3a, 0xff595e, 0x1982c4, 0xff8fab];
    case 31:
      return [0xe0f0f7, c, 0xffb347];
    case 33:
      return [0xef476f, 0x5fa8e8, 0xffffff, 0xffd23f];
    case 35:
      return [c, 0xffd166, 0xfff8f0, 0x4dabff];
    case 36:
      return [0xd99a5b, 0x4a2c1d, c];
    case 37:
      return [0xffffff, c, 0xf4efe3];
    case 38:
      return [c, 0xffe3a8];
    case 40:
      return [c, 0x8ac926, 0xe63946, 0xffd23f];
    case 41:
      return [c, 0xe63946, 0x3d5a80, 0xffd166];
    case 44:
      return [c, 0xfff6e4, 0xffffff];
    case 45:
      return [c, 0xffffff, 0x8ac926];
    case 47:
      return [c, 0x7a4a24, 0xfffaf2];
    case 48:
      return [c, 0xe9b26f, 0xc0392b];
    case 49:
      return [c, 0xc97c3d, 0xf7f3ee, PAL.leaf];
    case 53:
      return [c, 0xffffff];
    case 55:
      return [0xf2f6fa, c, 0xffffff];
    case 57:
      return [c, 0x6fb7e8, 0xffffff];
    case 58:
      return [c, 0xffffff, 0xfff275];
    case 60:
      return [c, 0xffffff, 0xe63946, 0x2f8f4e];
    case 61:
      return [c, 0xffffff, 0xffd166];
    case 62:
      return [c, 0xffd166, 0xf7e7b4];
    default:
      return [c, shadeHex(c, 0.8)];
  }
}

/** Puddle colour for spills and liquid breaks, or 0 for none. */
export function puddleColor(kind: number): number {
  switch (kind) {
    case 1:
      return 0x8e1a36; // red wine
    case 5:
      return 0xffcf3f; // yolk
    case 6:
      return 0xffd6e2; // cream
    case 7:
    case 58:
      return 0x9fd2f2; // water
    case 2:
      return 0x6b4130; // coffee
    case 8:
      return 0x5a3b2a; // soil
    case 22:
      return 0xfff1b8; // popcorn everywhere
    case 31:
      return 0xff7b9c; // punch
    case 33:
      return 0x8ecae6; // a heap of laundry
    case 36:
      return 0xd99a5b; // cookies
    case 37:
      return 0xf7f3ea; // flour
    case 40:
      return 0x8ac926; // board and pieces
    case 41:
      return 0xf4a259; // crisps
    case 47:
      return 0x7a4a24; // gravy
    case 48:
      return 0xc0392b; // cherry filling
    case 53:
      return 0xfefae0; // receipts
    case 60:
      return 0xcdeffd; // snow-globe water
    case 62:
      return 0xf7e7b4; // champagne
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Live view
// ---------------------------------------------------------------------------------------------

export interface PropFx {
  kind: 'break' | 'land' | 'spill';
  prop: number;
  propKind: number;
  pos: Vector3;
  dirX: number;
  dirZ: number;
  seed: number;
}

interface PropCache {
  state: number;
  x: number;
  z: number;
  level: number;
  /** display position (bottom centre) */
  px: number;
  py: number;
  pz: number;
  slideFrom: Vector3 | null;
  slideT0: number;
  slideTicks: number;
  mat: Matrix4;
  visible: boolean;
  instanceDirty: boolean;
  /** T of the first FALLING frame seen (stack pieces, cloth, tree) */
  fallT0: number;
  /** stack pieces settled (no more matrix writes) */
  piecesDone: boolean;
  inBox: boolean;
  boxT0: number;
  /** last direction the cloth was dragged (its drop goes that way) */
  ldx: number;
  ldz: number;
}

interface PieceSlot {
  mesh: InstancedMesh;
  slot: number;
}

interface StackInfo {
  layout: StackLayout;
  pieces: PieceSlot[];
  dims: { h: number; r: number }[];
}

const SLIDE_TICKS = 5;
const CLOTH_SLIDE_TICKS = 9;
const CLOTH_DROP_TICKS = 12;
/** extra ticks per stack item (top items fly further and land later) */
const PIECE_STAGGER = 2.5;
const EMPTY_FX: PropFx[] = [];
const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _axis = new Vector3();
const _m2 = new Matrix4();
const _m3 = new Matrix4();
const _m4 = new Matrix4();
const ZERO = new Matrix4().makeScale(0, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

/** Geometry key: kind, or kind:w:d for a multi-cell cloth. */
function keyOf(kind: number, w: number, d: number): string {
  return kind === 14 && (w > 1 || d > 1) ? `14:${w}:${d}` : String(kind);
}

export class PropsView {
  readonly group = new Group();
  private geos = new Map<string, BufferGeometry>();
  private heights = new Map<string, { h: number; r: number }>();
  private inst = new Map<string, InstancedMesh>();
  /** prop index -> [geometry key, instance slot] */
  private slot: [string, number][] = [];
  private kindOf: number[] = [];
  private cache: (PropCache | null)[] = [];
  private pool: Mesh[] = [];
  private active = new Map<number, Mesh>();
  private outlines = new Map<number, Mesh>();
  private outlineMat: MeshBasicMaterial;
  private ringMat: MeshBasicMaterial;
  private rings: InstancedMesh | null = null;
  private goldRings: InstancedMesh | null = null;
  private goldMat: MeshBasicMaterial;
  /** Bobbing gold beacons above each live Must-Wreck target. */
  private beacons: InstancedMesh | null = null;
  private beaconMat: MeshBasicMaterial;
  private goldSlot = new Map<number, number>();
  private ringSlot = new Map<number, number>();
  private rotOf: number[] = [];
  private stacks = new Map<number, StackInfo>();
  private pieceMeshes: InstancedMesh[] = [];
  private openBox: Mesh | null = null;
  private openBoxGeo: BufferGeometry | null = null;
  private labels = new Map<number, Mesh>();
  private labelTex: Texture | null = null;
  private labelGeo: PlaneGeometry | null = null;
  private labelMat: MeshBasicMaterial | null = null;
  private dirtyKeys = new Set<string>();
  private dirtyPieces = new Set<InstancedMesh>();

  constructor(
    private readonly play: PlayableRoom,
    private readonly mat: Material,
  ) {
    this.group.name = 'props';
    this.outlineMat = new MeshBasicMaterial({ color: PAL.gold, side: BackSide, transparent: true, opacity: 0.8, depthWrite: false });
    this.ringMat = new MeshBasicMaterial({ color: PAL.glow, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending });
    this.goldMat = new MeshBasicMaterial({ color: TARGET_GOLD, transparent: true, opacity: 0.8, depthWrite: false });
    this.beaconMat = new MeshBasicMaterial({ color: TARGET_GOLD, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const counts = new Map<string, number>();
    const props = play.room.props;
    const stackItems = new Map<number, number>(); // stack kind -> item count
    for (let i = 0; i < props.length; i++) {
      const k = props[i].kind;
      const key = keyOf(k, props[i].w ?? 1, props[i].d ?? 1);
      this.slot.push([key, counts.get(key) ?? 0]);
      this.kindOf.push(k);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      this.rotOf.push(props[i].rot ?? 0);
      this.cache.push(null);
      const lay = stackLayout(k);
      if (lay) stackItems.set(k, (stackItems.get(k) ?? 0) + lay.items.length);
    }
    for (const [key, n] of counts) {
      const geo = this.geometryFor(key);
      const m = new InstancedMesh(geo, mat, n);
      m.name = `prop-${key}`;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
      this.inst.set(key, m);
      this.group.add(m);
    }
    // stack pieces: ONE InstancedMesh per stack kind; colour and size per instance (one draw call per kind)
    const pieceMesh = new Map<number, InstancedMesh>();
    for (const [k, n] of stackItems) {
      const m = new InstancedMesh(buildStackPieceGeometry(k), mat, n);
      m.name = `stack-${k}`;
      m.frustumCulled = false;
      m.castShadow = true;
      for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
      m.visible = false;
      pieceMesh.set(k, m);
      this.pieceMeshes.push(m);
      this.group.add(m);
    }
    const used = new Map<number, number>();
    const tint = new Color();
    for (let i = 0; i < props.length; i++) {
      const k = props[i].kind;
      const lay = stackLayout(k);
      if (!lay) continue;
      const pieces: PieceSlot[] = [];
      const dims: { h: number; r: number }[] = [];
      const mesh = pieceMesh.get(k)!;
      const bb = mesh.geometry.boundingBox ?? new Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as never);
      for (const it of lay.items) {
        const s = used.get(k) ?? 0;
        used.set(k, s + 1);
        pieces.push({ mesh, slot: s });
        mesh.setColorAt(s, tint.setHex(stackTint(k, it.v)));
        dims.push({ h: Math.max(0.01, bb.max.y - bb.min.y) * it.k, r: (Math.max(0.01, Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2)) * it.k });
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.stacks.set(i, { layout: lay, pieces, dims });
    }
    // Target outlines (≤ 3) and grabbable glow rings.
    let grabbables = 0;
    for (let i = 0; i < props.length; i++) {
      const def = propKind(props[i].kind);
      if (props[i].target) {
        const o = new Mesh(this.geometryFor(this.slot[i][0]), this.outlineMat);
        o.matrixAutoUpdate = false;
        o.visible = false;
        o.renderOrder = 2;
        o.name = `target-outline-${i}`;
        this.outlines.set(i, o);
        this.group.add(o);
        this.goldSlot.set(i, this.goldSlot.size);
      }
      if (def?.grabbable) this.ringSlot.set(i, grabbables++);
    }
    if (this.goldSlot.size > 0) {
      const rg = new RingGeometry(0.15, 0.2, 20);
      rg.rotateX(-Math.PI / 2);
      this.goldRings = new InstancedMesh(rg, this.goldMat, this.goldSlot.size);
      this.goldRings.frustumCulled = false;
      this.goldRings.renderOrder = 1;
      for (let i = 0; i < this.goldSlot.size; i++) this.goldRings.setMatrixAt(i, ZERO);
      this.group.add(this.goldRings);
      const bg = new OctahedronGeometry(0.055, 0);
      bg.scale(1, 1.7, 1);
      this.beacons = new InstancedMesh(bg, this.beaconMat, this.goldSlot.size);
      this.beacons.name = 'target-beacons';
      this.beacons.frustumCulled = false;
      this.beacons.renderOrder = 9;
      for (let i = 0; i < this.goldSlot.size; i++) this.beacons.setMatrixAt(i, ZERO);
      this.group.add(this.beacons);
    }
    if (grabbables > 0) {
      const rg = new RingGeometry(0.11, 0.17, 16);
      rg.rotateX(-Math.PI / 2);
      this.rings = new InstancedMesh(rg, this.ringMat, grabbables);
      this.rings.frustumCulled = false;
      this.rings.renderOrder = 1;
      for (let i = 0; i < grabbables; i++) this.rings.setMatrixAt(i, ZERO);
      this.group.add(this.rings);
    }
    // sponsor label (DOM only)
    const sp = play.room.sponsor;
    for (let i = 0; i < props.length; i++) {
      const def = propKind(props[i].kind);
      if (!(def?.sponsor || (sp && sp.propIndex === i))) continue;
      if (!sp?.label) continue;
      if (!this.labelTex) this.labelTex = makeLabelTexture(sp.label);
      if (!this.labelTex) break;
      this.labelGeo ??= new PlaneGeometry(SPONSOR_LABEL.w, SPONSOR_LABEL.h);
      this.labelMat ??= new MeshBasicMaterial({ map: this.labelTex, transparent: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const lm = new Mesh(this.labelGeo, this.labelMat);
      lm.name = `sponsor-label-${i}`;
      lm.matrixAutoUpdate = false;
      lm.visible = false;
      this.labels.set(i, lm);
      this.group.add(lm);
    }
  }

  private geometryFor(key: string): BufferGeometry {
    let g = this.geos.get(key);
    if (!g) {
      if (key.startsWith('14:')) {
        const [, w, d] = key.split(':').map(Number);
        g = buildClothGeometry(w, d);
      } else g = buildPropGeometry(Number(key));
      const bb = g.boundingBox ?? new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
      const h = Math.max(0.02, bb.max.y - bb.min.y);
      const r = Math.max(0.02, Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2);
      this.heights.set(key, { h, r });
      this.geos.set(key, g);
    }
    return g;
  }

  /** Geometry of a prop kind (shared with the outline hulls). */
  geometry(kind: number): BufferGeometry {
    return this.geometryFor(String(kind));
  }

  /** Forget visual state (new run / clip pass). */
  reset(): void {
    for (let i = 0; i < this.cache.length; i++) this.cache[i] = null;
    for (const [, m] of this.active) this.release(m);
    this.active.clear();
    for (const m of this.pieceMeshes) {
      for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO);
      m.instanceMatrix.needsUpdate = true;
      m.visible = false;
    }
    if (this.openBox) this.openBox.visible = false;
  }

  /** World matrix of prop `i` as last drawn (for the clip camera), or null. */
  propPosition(i: number, out: Vector3): Vector3 | null {
    const c = this.cache[i];
    if (!c) return null;
    return out.set(c.px, c.py, c.pz);
  }

  update(s: SimState, T: number, alpha: number, mouth: Matrix4 | null, hud: boolean): PropFx[] {
    let fx: PropFx[] = EMPTY_FX;
    const w = s.grid.w;
    const d = s.grid.d;
    const dirtyKeys = this.dirtyKeys;
    dirtyKeys.clear();
    this.dirtyPieces.clear();
    let ringsDirty = false;
    const pulse = 0.5 + 0.5 * Math.sin(T * 0.25);
    let stashIdx = 0;
    const roombaProp = s.roomba ? s.roomba.prop : -1;
    const inBox = s.inBox ?? -1;
    for (let i = 0; i < s.props.length && i < this.slot.length; i++) {
      const p = s.props[i];
      const [key, slotI] = this.slot[i];
      const kind = this.kindOf[i];
      const im = this.inst.get(key);
      if (!im) continue;
      const dims = this.heights.get(key) ?? { h: 0.2, r: 0.1 };
      let c = this.cache[i];
      const fresh = !c;
      if (!c) {
        c = {
          state: p.state,
          x: p.x,
          z: p.z,
          level: p.level,
          px: cellX(p.x, w),
          py: levelY(p.level),
          pz: cellZ(p.z, d),
          slideFrom: null,
          slideT0: 0,
          slideTicks: SLIDE_TICKS,
          mat: new Matrix4(),
          visible: true,
          instanceDirty: true,
          fallT0: T,
          piecesDone: false,
          inBox: false,
          boxT0: 0,
          ldx: 0,
          ldz: 1,
        };
        this.cache[i] = c;
      }
      const prev = c.state;
      const yaw = (this.rotOf[i] ?? 0) * (Math.PI / 2);
      let useStandalone = false;
      let animating = false;
      const stack = this.stacks.get(i);
      const def = propKind(kind);

      // the Roomba moves under world-dynamics.ts while the v5 sim drives it
      if (i === roombaProp && s.roomba) {
        const rb = s.roomba;
        c.px = cellX(rb.x, w);
        c.py = 0;
        c.pz = cellZ(rb.z, d);
        if (c.visible || fresh) {
          im.setMatrixAt(slotI, ZERO);
          dirtyKeys.add(key);
        }
        c.visible = false;
        c.state = p.state;
        c.x = p.x;
        c.z = p.z;
        c.level = p.level;
        continue;
      }

      switch (p.state) {
        case PropSt.REST:
        case PropSt.WOBBLE: {
          const tx = cellX(p.x, w);
          const ty = levelY(p.level);
          const tz = cellZ(p.z, d);
          if (!fresh && (c.x !== p.x || c.z !== p.z || c.level !== p.level) && (prev === PropSt.REST || prev === PropSt.WOBBLE)) {
            c.slideFrom = (c.slideFrom ?? new Vector3()).set(c.px, c.py, c.pz);
            c.slideT0 = T;
            c.slideTicks = kind === 14 ? CLOTH_SLIDE_TICKS : SLIDE_TICKS;
            if (kind === 14) {
              c.ldx = Math.sign(p.x - c.x);
              c.ldz = Math.sign(p.z - c.z);
            }
          }
          let k = 1;
          let sliding = false;
          if (c.slideT0 >= 0 && c.slideFrom && T - c.slideT0 < c.slideTicks) {
            k = clamp01((T - c.slideT0) / c.slideTicks);
            sliding = true;
            animating = true;
          }
          const e = kind === 14 ? smooth01(k) : k;
          c.px = sliding ? c.slideFrom!.x + (tx - c.slideFrom!.x) * e : tx;
          c.py = sliding ? c.slideFrom!.y + (ty - c.slideFrom!.y) * e : ty;
          c.pz = sliding ? c.slideFrom!.z + (tz - c.slideFrom!.z) * e : tz;
          if (!sliding && c.slideFrom && T - c.slideT0 >= c.slideTicks && c.slideT0 >= 0) {
            c.slideT0 = -1;
            animating = true; // one last write at the final cell
          }
          _q.setFromAxisAngle(Y_AXIS, yaw);
          let sx = 1;
          let sy = 1;
          let sz = 1;
          if (kind === 14 && sliding) {
            // the cloth ripples while it is dragged
            const ripple = Math.sin(k * Math.PI);
            sy = 1 + ripple * 2.5;
            sx = 1 - ripple * 0.04;
            sz = 1 - ripple * 0.04;
          }
          if (def?.tall) {
            // the tree sways more with every swat it took
            const sway = Math.min(3, p.sway ?? p.swats ?? 0);
            if (p.state === PropSt.WOBBLE || sway > 0) {
              animating = true;
              const amp = (p.state === PropSt.WOBBLE ? 0.05 : 0.012) + sway * 0.02;
              _q2.setFromAxisAngle(_axis.set(1, 0, 0), Math.sin(T * 0.45) * amp);
              _q.premultiply(_q2);
              _q2.setFromAxisAngle(_axis.set(0, 0, 1), Math.cos(T * 0.31) * amp * 0.6);
              _q.premultiply(_q2);
            }
          } else if (p.state === PropSt.WOBBLE) {
            animating = true;
            _q2.setFromAxisAngle(_axis.set(1, 0, 0), Math.sin(T * 1.3) * 0.14);
            _q.premultiply(_q2);
            _q2.setFromAxisAngle(_axis.set(0, 0, 1), Math.cos(T * 0.9) * 0.06);
            _q.premultiply(_q2);
          }
          // cloth extent changed by a pull (rare): stretch to it
          if (kind === 14) {
            const w0 = this.play.room.props[i]?.w ?? 1;
            const d0 = this.play.room.props[i]?.d ?? 1;
            sx *= (p.w ?? w0) / w0;
            sz *= (p.d ?? d0) / d0;
          }
          c.mat.compose(_v.set(c.px, c.py, c.pz), _q, _s.set(sx, sy, sz));
          // box: the flaps fling open while the cat sits inside (a standalone open-box mesh)
          const boxNow = kind === 54 && inBox === i;
          if (boxNow !== c.inBox) {
            c.inBox = boxNow;
            c.boxT0 = T;
            c.instanceDirty = true;
          }
          if (kind === 54 && c.inBox) {
            const ob = this.ensureOpenBox();
            const tb = clamp01((T - c.boxT0) / 8);
            const squash = 1 - Math.sin(tb * Math.PI) * 0.12;
            c.mat.compose(_v.set(c.px, c.py, c.pz), _q, _s.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6));
            ob.matrix.copy(c.mat);
            ob.matrixWorldNeedsUpdate = true;
            ob.visible = true;
            if (c.instanceDirty || fresh) {
              im.setMatrixAt(slotI, ZERO);
              dirtyKeys.add(key);
            }
            c.visible = true;
            break;
          } else if (kind === 54 && this.openBox && c.instanceDirty) this.openBox.visible = false;
          if (animating || prev !== p.state || fresh || c.instanceDirty || c.x !== p.x || c.z !== p.z) {
            im.setMatrixAt(slotI, c.mat);
            dirtyKeys.add(key);
          }
          if (stack && (prev !== p.state || fresh) && !c.piecesDone) this.hidePieces(stack);
          c.visible = true;
          break;
        }
        case PropSt.FALLING: {
          if (prev !== PropSt.FALLING || fresh) c.fallT0 = T - alpha;
          if (stack) {
            // the stack splits: hide the whole, animate the pieces
            if (prev !== PropSt.FALLING || fresh) {
              im.setMatrixAt(slotI, ZERO);
              dirtyKeys.add(key);
              c.piecesDone = false;
            }
            this.updatePieces(p, stack, p.fallTicks - p.fallTimer + alpha, c, w, d, yaw, false);
            c.px = cellX(p.x, w);
            c.py = levelY(p.level);
            c.pz = cellZ(p.z, d);
            c.visible = true;
            break;
          }
          useStandalone = true;
          if (def?.tall) this.toppleMatrix(p, p.fallTicks - p.fallTimer + alpha, dims, w, d, yaw, c.mat, this.play.room.props[i]?.level ?? 0);
          else if (kind === 14) this.clothDropMatrix(p, alpha, w, d, yaw, c.mat);
          else this.fallMatrix(p, alpha, dims, w, d, yaw, c.mat, kind);
          c.px = c.mat.elements[12];
          c.py = c.mat.elements[13];
          c.pz = c.mat.elements[14];
          c.visible = true;
          break;
        }
        case PropSt.LANDED:
        case PropSt.SPILLED: {
          if (stack) {
            if (prev !== p.state || fresh) {
              im.setMatrixAt(slotI, ZERO);
              dirtyKeys.add(key);
              if (fresh) c.piecesDone = false;
            }
            if (!c.piecesDone) this.updatePieces(p, stack, fresh ? Infinity : p.fallTicks + Math.max(0, s.tick - p.restTick) + alpha, c, w, d, yaw, true);
            c.px = cellX(p.x, w);
            c.py = levelY(p.level);
            c.pz = cellZ(p.z, d);
            c.visible = true;
            break;
          }
          if (def?.tall) {
            // the tree finishes its topple and bounces once
            const tt = fresh ? Infinity : p.fallTicks + Math.max(0, s.tick - p.restTick) + alpha;
            const settled = tt > p.fallTicks + 14;
            if (!settled || prev !== p.state || fresh || this.active.has(i)) {
              useStandalone = !settled;
              this.toppleMatrix(p, tt, dims, w, d, yaw, c.mat, this.play.room.props[i]?.level ?? 0);
              if (settled) {
                im.setMatrixAt(slotI, c.mat);
                dirtyKeys.add(key);
              }
            }
          } else {
            if (kind === 14) {
              // the cloth's second pull: it slides off toward the cat and crumples on the floor
              const et = fresh ? Infinity : Math.max(0, s.tick - p.restTick) + alpha;
              const moving = et < CLOTH_DROP_TICKS + 1;
              if (moving || prev !== p.state || fresh || this.active.has(i)) {
                this.clothLandMatrix(p, i, et, w, d, yaw, c, c.mat);
                useStandalone = moving;
                if (!moving) {
                  im.setMatrixAt(slotI, c.mat);
                  dirtyKeys.add(key);
                }
              }
            } else {
              this.fallMatrix(p, 1, dims, w, d, yaw, c.mat, kind, true);
              if (prev !== p.state || fresh) {
                im.setMatrixAt(slotI, c.mat);
                dirtyKeys.add(key);
              }
            }
          }
          c.px = cellX(p.x, w);
          c.py = levelY(p.level);
          c.pz = cellZ(p.z, d);
          c.visible = true;
          break;
        }
        case PropSt.BROKEN: {
          c.px = cellX(p.x, w);
          c.py = levelY(p.level);
          c.pz = cellZ(p.z, d);
          if (prev !== p.state || fresh) {
            im.setMatrixAt(slotI, ZERO);
            dirtyKeys.add(key);
            if (stack) this.hidePieces(stack);
          }
          c.visible = false;
          break;
        }
        case PropSt.CARRIED: {
          useStandalone = true;
          if (mouth) {
            _m2.makeScale(0.6, 0.6, 0.6);
            _m2.setPosition(0, -dims.h * 0.35, 0);
            c.mat.multiplyMatrices(mouth, _m2);
          }
          c.px = c.mat.elements[12];
          c.py = c.mat.elements[13];
          c.pz = c.mat.elements[14];
          c.visible = true;
          break;
        }
        case PropSt.STASHED: {
          const bed = this.play.shell.catBed;
          const n = stashIdx++;
          c.px = cellX(bed.x, w) + (n === 0 ? -0.05 : 0.06);
          c.py = 0.06;
          c.pz = cellZ(bed.z, d) + (n === 0 ? 0.02 : -0.03);
          _q.setFromAxisAngle(Y_AXIS, 0.6 + n * 1.7);
          c.mat.compose(_v.set(c.px, c.py, c.pz), _q, _s.set(0.85, 0.85, 0.85));
          if (prev !== p.state || fresh) {
            im.setMatrixAt(slotI, c.mat);
            dirtyKeys.add(key);
          }
          c.visible = true;
          break;
        }
      }

      // standalone mesh hand-over
      const sm = this.active.get(i);
      if (useStandalone) {
        let m = sm;
        if (!m) {
          m = this.acquire(key);
          this.active.set(i, m);
          im.setMatrixAt(slotI, ZERO);
          dirtyKeys.add(key);
        }
        m.matrix.copy(c.mat);
        m.matrixWorldNeedsUpdate = true;
      } else if (sm) {
        this.release(sm);
        this.active.delete(i);
      }

      // landing effects on observed transitions only (never on a fresh cache)
      if (!fresh && prev !== p.state) {
        const fxKind = p.state === PropSt.BROKEN ? 'break' : p.state === PropSt.LANDED ? 'land' : p.state === PropSt.SPILLED ? 'spill' : null;
        if (fxKind && def) {
          if (fx === EMPTY_FX) fx = [];
          fx.push({
            kind: fxKind,
            prop: i,
            propKind: kind,
            pos: new Vector3(cellX(p.x, w), levelY(p.level), cellZ(p.z, d)),
            dirX: DIR_DX[p.dir] ?? 0,
            dirZ: DIR_DZ[p.dir] ?? 0,
            seed: (i * 7919 + p.restTick * 31) | 0,
          });
        }
      }

      const intact = p.state === PropSt.REST || p.state === PropSt.WOBBLE;

      // sponsor label rides on the product's front panel
      const lm = this.labels.get(i);
      if (lm) {
        lm.visible = c.visible && p.state !== PropSt.BROKEN && !(stack && !intact);
        if (lm.visible) {
          _m2.makeTranslation(SPONSOR_LABEL.x, SPONSOR_LABEL.y, SPONSOR_LABEL.z);
          lm.matrix.multiplyMatrices(c.mat, _m2);
          lm.matrixWorldNeedsUpdate = true;
        }
      }

      // target outline
      const o = this.outlines.get(i);
      if (o) {
        o.visible = hud && (intact || (p.state === PropSt.FALLING && !stack));
        if (o.visible) {
          const sc = 1.18 + pulse * 0.07;
          _m2.makeTranslation(0, dims.h / 2, 0);
          _m2.multiply(_m3.makeScale(sc, 1 + (sc - 1) * 0.6, sc));
          _m2.multiply(_m4.makeTranslation(0, -dims.h / 2 - 0.004, 0));
          o.matrix.multiplyMatrices(c.mat, _m2);
          o.matrixWorldNeedsUpdate = true;
        }
      }

      // Must-Wreck gold ring
      const gs = this.goldSlot.get(i);
      if (gs !== undefined && this.goldRings) {
        if (hud && intact) {
          const sc = 1.05 + pulse * 0.12;
          _m2.compose(_v.set(c.px, c.py + 0.006, c.pz), _q.identity(), _s.set(sc, 1, sc));
          this.goldRings.setMatrixAt(gs, _m2);
        } else this.goldRings.setMatrixAt(gs, ZERO);
        this.goldRings.instanceMatrix.needsUpdate = true;
        if (this.beacons) {
          if (hud && intact) {
            // 0.35 m above the prop, bobbing at 1 Hz (±0.03 m), pulsing 1.0–1.15×, slowly spinning
            const ph = (T / 30) * Math.PI * 2;
            const bsc = 1 + 0.075 * (1 + Math.sin(ph));
            _q.setFromAxisAngle(Y_AXIS, T * 0.06);
            _m2.compose(_v.set(c.px, c.py + Math.min(dims.h, 0.6) + 0.35 + Math.sin(ph) * 0.03, c.pz), _q, _s.set(bsc, bsc, bsc));
            this.beacons.setMatrixAt(gs, _m2);
          } else this.beacons.setMatrixAt(gs, ZERO);
          this.beacons.instanceMatrix.needsUpdate = true;
        }
      }

      // grabbable ring
      const rs = this.ringSlot.get(i);
      if (rs !== undefined && this.rings) {
        if (hud && p.state === PropSt.REST) {
          const sc = 0.9 + pulse * 0.15;
          _m2.compose(_v.set(c.px, c.py + 0.004, c.pz), _q.identity(), _s.set(sc, 1, sc));
          this.rings.setMatrixAt(rs, _m2);
        } else this.rings.setMatrixAt(rs, ZERO);
        ringsDirty = true;
      }

      c.state = p.state;
      c.x = p.x;
      c.z = p.z;
      c.level = p.level;
      c.instanceDirty = false;
    }
    for (const k of dirtyKeys) {
      const m = this.inst.get(k);
      if (m) m.instanceMatrix.needsUpdate = true;
    }
    for (const m of this.dirtyPieces) m.instanceMatrix.needsUpdate = true;
    if (this.rings && ringsDirty) this.rings.instanceMatrix.needsUpdate = true;
    this.outlineMat.opacity = 0.45 + pulse * 0.5;
    this.ringMat.opacity = 0.32 + pulse * 0.16;
    this.goldMat.opacity = 0.72 + pulse * 0.16;
    return fx;
  }

  private hidePieces(st: StackInfo): void {
    for (const pc of st.pieces) {
      pc.mesh.setMatrixAt(pc.slot, ZERO);
      this.dirtyPieces.add(pc.mesh);
    }
  }

  /**
   * Stack pieces: each item leaves its spot in the stack and tumbles to its own landing spot around the landing
   * cell (top items fly further and later). `elapsed` = sim ticks since the fall began (Infinity = settled), so a
   * clip re-render draws the same pieces.
   */
  private updatePieces(p: PropState, st: StackInfo, elapsed: number, c: PropCache, w: number, d: number, yaw: number, landed: boolean): void {
    let dx = DIR_DX[p.dir] ?? 0;
    let dz = DIR_DZ[p.dir] ?? 0;
    if (dx === 0 && dz === 0) {
      dx = Math.sign(p.x - p.fromX);
      dz = Math.sign(p.z - p.fromZ);
      if (dx === 0 && dz === 0) dz = 1;
    }
    const len = Math.hypot(dx, dz);
    dx /= len;
    dz /= len;
    const x0 = cellX(p.fromX, w);
    const z0 = cellZ(p.fromZ, d);
    const y0 = levelY(p.fromLevel);
    const x1 = cellX(p.x, w);
    const z1 = cellZ(p.z, d);
    const y1 = levelY(p.level);
    const hw = (w * 0.4) / 2 - 0.08;
    const hd = (d * 0.4) / 2 - 0.08;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const fallTicks = Math.max(1, p.fallTicks);
    let allDone = true;
    const n = st.pieces.length;
    for (let j = 0; j < n; j++) {
      const it = st.layout.items[j];
      const dim = st.dims[j];
      const dur = fallTicks + j * PIECE_STAGGER;
      const t = elapsed === Infinity ? 1 : clamp01(elapsed / dur);
      if (t < 1) allDone = false;
      // start: the item's spot in the resting stack
      const sx = x0 + it.x * cy + it.z * sy;
      const sz = z0 - it.x * sy + it.z * cy;
      const sy0 = y0 + it.y;
      // end: scattered around the landing cell, further out the higher it sat
      const h = hash01(j * 97 + p.fromX * 13 + p.fromZ * 7);
      const reach = 0.04 + j * 0.06;
      const side = (h - 0.5) * 0.26;
      let ex = x1 + dx * reach - dz * side;
      let ez = z1 + dz * reach + dx * side;
      ex = Math.max(-hw, Math.min(hw, ex));
      ez = Math.max(-hd, Math.min(hd, ez));
      const tilt = st.layout.tilt + (st.layout.tilt === Math.PI && j % 2 ? Math.PI : 0);
      const theta = tilt * (t * t * (1.4 - 0.4 * t));
      const cyF = Math.abs(Math.cos(tilt)) * dim.h * 0.5 + Math.abs(Math.sin(tilt)) * dim.r;
      const cy0 = sy0 + dim.h * 0.5;
      const cy1 = y1 + cyF;
      const k = 1 - (1 - t) * (1 - t);
      const hx = sx + (ex - sx) * k;
      const hz = sz + (ez - sz) * k;
      const hop = Math.sin(Math.PI * t) * (0.06 + j * 0.025);
      const ccy = cy0 + (cy1 - cy0) * t * t + hop;
      _axis.set(dz, 0, -dx);
      _q.setFromAxisAngle(_axis, theta);
      _q2.setFromAxisAngle(Y_AXIS, yaw + it.ry + (h - 0.5) * 2.4 * t);
      _q.multiply(_q2);
      _v2.set(0, dim.h * 0.5, 0).applyQuaternion(_q);
      _m2.compose(_v.set(hx - _v2.x, ccy - _v2.y, hz - _v2.z), _q, _s.set(it.k, it.k, it.k));
      const pc = st.pieces[j];
      pc.mesh.visible = true;
      pc.mesh.setMatrixAt(pc.slot, _m2);
      this.dirtyPieces.add(pc.mesh);
    }
    if (landed && allDone) c.piecesDone = true;
  }

  /** Fall pose: from the start cell over the edge to the landing cell, tumbling about the push axis. */
  private fallMatrix(
    p: PropState,
    alpha: number,
    dims: { h: number; r: number },
    w: number,
    d: number,
    yaw: number,
    out: Matrix4,
    kind: number,
    final = false,
  ): void {
    const t = final ? 1 : clamp01(p.fallTicks > 0 ? (p.fallTicks - p.fallTimer + alpha) / p.fallTicks : 1);
    const x0 = cellX(p.fromX, w);
    const z0 = cellZ(p.fromZ, d);
    const y0 = levelY(p.fromLevel);
    const x1 = cellX(p.x, w);
    const z1 = cellZ(p.z, d);
    const y1 = levelY(p.level);
    let dx = DIR_DX[p.dir] ?? 0;
    let dz = DIR_DZ[p.dir] ?? 0;
    if (dx === 0 && dz === 0) {
      dx = Math.sign(x1 - x0);
      dz = Math.sign(z1 - z0);
      if (dx === 0 && dz === 0) dz = 1;
    }
    const len = Math.hypot(dx, dz);
    const def = propKind(kind);
    const breaks = def?.onLand === 'break';
    const thetaF = breaks ? Math.PI * 0.85 : landTip(kind);
    const theta = thetaF * (final ? 1 : t * t * (1.4 - 0.4 * t));
    const cyF = Math.abs(Math.cos(thetaF)) * dims.h * 0.5 + Math.abs(Math.sin(thetaF)) * dims.r;
    const cy0 = y0 + dims.h * 0.5;
    const cy1 = y1 + cyF;
    const hx = x0 + (x1 - x0) * (1 - (1 - t) * (1 - t) * 0.6 - 0.4 * (1 - t));
    const hz = z0 + (z1 - z0) * (1 - (1 - t) * (1 - t) * 0.6 - 0.4 * (1 - t));
    const hop = Math.sin(Math.PI * Math.min(1, t * 2.2)) * 0.05 * (1 - t);
    const cy = cy0 + (cy1 - cy0) * t * t + hop;
    _axis.set(dz / len, 0, -dx / len);
    _q.setFromAxisAngle(_axis, theta);
    _q2.setFromAxisAngle(_v.set(0, 1, 0), yaw);
    _q.multiply(_q2);
    _v2.set(0, dims.h * 0.5, 0).applyQuaternion(_q);
    out.compose(_v.set(hx - _v2.x, cy - _v2.y, hz - _v2.z), _q, _s.set(1, 1, 1));
  }

  /**
   * Tall prop topple (the tree): pivots about its base at the start cell toward the fall direction, gathering speed,
   * hits the floor and bounces once. `tt` = ticks since the topple started.
   */
  private toppleMatrix(p: PropState, tt: number, dims: { h: number; r: number }, w: number, d: number, yaw: number, out: Matrix4, baseLevel: number): void {
    let dx = DIR_DX[p.dir] ?? 0;
    let dz = DIR_DZ[p.dir] ?? 0;
    if (dx === 0 && dz === 0) {
      dx = Math.sign(p.x - p.fromX);
      dz = Math.sign(p.z - p.fromZ);
      if (dx === 0 && dz === 0) dz = 1;
    }
    const len = Math.hypot(dx, dz);
    const T = Math.max(6, p.fallTicks || 18);
    const t = clamp01(tt / T);
    // resting on its branches; leaning on whatever stopped it short of its full length
    const full = propKind(p.kind)?.topple ?? 4;
    const cells = Math.max(Math.abs(p.x - p.fromX), Math.abs(p.z - p.fromZ));
    const lie = cells >= full ? Math.PI / 2 - 0.08 : Math.PI / 2 - 0.08 - (full - cells) * 0.12;
    let a = lie * t * t * t;
    if (tt > T) {
      const b = (tt - T) / 14;
      a = lie - Math.sin(Math.min(1, b) * Math.PI) * 0.12 * (1 - Math.min(1, b));
    }
    _axis.set(dz / len, 0, -dx / len);
    _q.setFromAxisAngle(_axis, a);
    _q2.setFromAxisAngle(Y_AXIS, yaw);
    _q.multiply(_q2);
    // pivot at the base edge on the fall side so it rolls over its pot rim
    const px = cellX(p.fromX, w) + (dx / len) * dims.r * 0.4;
    const pz = cellZ(p.fromZ, d) + (dz / len) * dims.r * 0.4;
    const py = levelY(baseLevel);
    _v2.set(-(dx / len) * dims.r * 0.4, 0, -(dz / len) * dims.r * 0.4).applyQuaternion(_q);
    out.compose(_v.set(px + _v2.x, py + _v2.y + Math.sin(a) * 0.04, pz + _v2.z), _q, _s.set(1, 1, 1));
  }

  /** Cloth drop: slides off its surface and crumples on the floor. */
  private clothDropMatrix(p: PropState, alpha: number, w: number, d: number, yaw: number, out: Matrix4, final = false): void {
    const t = final ? 1 : clamp01(p.fallTicks > 0 ? (p.fallTicks - p.fallTimer + alpha) / p.fallTicks : 1);
    const e = smooth01(t);
    const x = cellX(p.fromX, w) + (cellX(p.x, w) - cellX(p.fromX, w)) * e;
    const z = cellZ(p.fromZ, d) + (cellZ(p.z, d) - cellZ(p.fromZ, d)) * e;
    const y = levelY(p.fromLevel) + (levelY(p.level) - levelY(p.fromLevel)) * t * t + 0.01;
    const crumple = 1 - 0.38 * e;
    _q.setFromAxisAngle(Y_AXIS, yaw + e * 0.5);
    _q2.setFromAxisAngle(_axis.set(1, 0, 0), Math.sin(t * Math.PI) * 0.5);
    _q.premultiply(_q2);
    out.compose(_v.set(x, y, z), _q, _s.set(crumple, 1 + e * 3, crumple));
  }

  /** Cloth drop after its last pull: slides one more cell toward the cat, falls to the floor and crumples. */
  private clothLandMatrix(p: PropState, i: number, et: number, w: number, d: number, yaw: number, c: PropCache, out: Matrix4): void {
    const t = et === Infinity ? 1 : clamp01(et / CLOTH_DROP_TICKS);
    const pw = p.w ?? this.play.room.props[i]?.w ?? 1;
    const pd = p.d ?? this.play.room.props[i]?.d ?? 1;
    // centre of the covered rectangle and the spot past its edge on the pull side
    const cx0 = cellX(p.x, w) + (pw - 1) * 0.2;
    const cz0 = cellZ(p.z, d) + (pd - 1) * 0.2;
    const tx = cx0 + c.ldx * (pw * 0.2 + 0.25);
    const tz = cz0 + c.ldz * (pd * 0.2 + 0.25);
    const y0 = levelY(p.level);
    const e = smooth01(t);
    const x = cx0 + (tx - cx0) * e;
    const z = cz0 + (tz - cz0) * e;
    const y = y0 * (1 - t * t) + 0.01;
    const crumple = 1 - 0.45 * e;
    _q.setFromAxisAngle(Y_AXIS, yaw + e * 0.35);
    _q2.setFromAxisAngle(_axis.set(1, 0, 0), Math.sin(t * Math.PI) * 0.6);
    _q.premultiply(_q2);
    _s.set(crumple, 1 + e * 4, crumple);
    // the geometry's origin is the first cell: shift so the crumpled centre lands on (x, z)
    _v2.set((pw - 1) * 0.2 * _s.x, 0, (pd - 1) * 0.2 * _s.z).applyQuaternion(_q);
    out.compose(_v.set(x - _v2.x, y, z - _v2.z), _q, _s);
  }

  private ensureOpenBox(): Mesh {
    if (!this.openBox) {
      this.openBoxGeo = buildBoxGeometry(true);
      this.openBox = new Mesh(this.openBoxGeo, this.mat);
      this.openBox.name = 'box-open';
      this.openBox.matrixAutoUpdate = false;
      this.openBox.castShadow = true;
      this.openBox.frustumCulled = false;
      this.group.add(this.openBox);
    }
    return this.openBox;
  }

  private acquire(key: string): Mesh {
    const m = this.pool.pop() ?? new Mesh(undefined, this.mat);
    m.geometry = this.geometryFor(key);
    m.matrixAutoUpdate = false;
    m.castShadow = true;
    m.visible = true;
    m.frustumCulled = false;
    if (!m.parent) this.group.add(m);
    return m;
  }

  private release(m: Mesh): void {
    m.visible = false;
    this.pool.push(m);
  }

  setShadows(on: boolean): void {
    for (const [, m] of this.inst) m.castShadow = on;
    for (const m of this.pieceMeshes) m.castShadow = on;
  }

  dispose(): void {
    for (const [, g] of this.geos) g.dispose();
    for (const [, m] of this.inst) m.dispose();
    for (const m of this.pieceMeshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.openBoxGeo?.dispose();
    this.rings?.geometry.dispose();
    this.rings?.dispose();
    this.outlineMat.dispose();
    this.ringMat.dispose();
    this.goldMat.dispose();
    this.goldRings?.geometry.dispose();
    this.goldRings?.dispose();
    this.beacons?.geometry.dispose();
    this.beacons?.dispose();
    this.beaconMat.dispose();
    this.labelGeo?.dispose();
    this.labelMat?.dispose();
    this.labelTex?.dispose();
    this.group.clear();
  }
}
