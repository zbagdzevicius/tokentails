/**
 * World dynamics implementation (seam: ../world-dynamics.ts). Everything in the room that moves or glows but is not
 * an actor or a prop pose:
 * - the Roomba (v5 SimState.roomba): low-poly disc with a bumper, a blinking green LED (amber while it waits), a
 *   gentle bob, a slow spin while paused, a squash when something lands next to it, and a "NOT ME" sticker when a
 *   crash gets blamed on it (event 'framed');
 * - puddles from GridState.puddle: glossy blue-white slips and brown soil, fading in, plus wet wheel tracks behind a
 *   Roomba that drove through one;
 * - lamp cables (pull 'cable') from the lamp to their floor cell, with a tug wiggle on 'pull';
 * - ornaments popping off a toppling tree (event 'topple') and small splashes when a puddle appears;
 * - animated furniture (TV picture that goes wild during the ad break, fireplace flames, the webcam's REC light);
 * - theme animation: twinkling string lights, snow outside the window (xmas), drifting confetti (nye, birthday), a
 *   disco ball with sweeping spots (nye).
 * update() is render only: it never writes SimState and allocates nothing per frame (everything is preallocated at
 * construction). Time is sim ticks + alpha, so a clip re-render draws the same frames.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Texture,
} from 'three';
import { CELL_M, LEVEL_HEIGHT_M, PropSt, ROOMBA_STEP_TICKS, propKind, type PlayableRoom, type SimEvent, type SimState } from '../../types';
import type { WorldDynamics } from '../world-dynamics';
import { GeoBuilder, hash01 } from '../geo';
import { THEME_SKY } from '../palette';
import { cellX, cellZ, clamp01, facingYaw } from '../space';
import { furnitureAnchors } from './furniture';
import { makeLabelTexture } from './label';
import { WALL_T, WIN_Y0, WIN_Y1, windowSpan } from './layout';
import { roomTheme, stringLightColors, stringLightPoints } from './themes';

const ZERO = new Matrix4().makeScale(0, 0, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _c = new Color();
/** Yaw per facing 1..8 (index 0 unused). */
const YAW_OF = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((f) => (f ? facingYaw(f) : 0));

/** Sim direction offsets for PropPlacement.rot (sim/v5.ts: 0 N, 1 E, 2 S, 3 W). */
const RX = [0, 1, 0, -1];
const RZ = [-1, 0, 1, 0];

const FX_AMBIENT = 40;
const FX_POPS = 96;
const TRACKS = 24;
const CABLE_PTS = 14;

/** Kinds of colour-animated elements in the glow meshes (vertex range + base colour + behaviour). */
const GlowKind = { Bulb: 0, TvCell: 1, Flame: 2, Rec: 3, FireGlow: 4, Spot: 5 } as const;
type GlowKind = (typeof GlowKind)[keyof typeof GlowKind];
/** Puddles sit just above rug tops (0.018 m) so a spill on a rug shows. */
const PUDDLE_Y = 0.022;
const TRI = new Uint8Array([0, 1, 2, 0, 2, 3]);
/** LED colours (sRGB hex) and their linear rgb (vertex colours are linear). */
const LED_INDEX = [0xffb43c, 0x5a4020, 0x7dff96, 0x1f5a2c];
const LED_RGB = new Float32Array(LED_INDEX.length * 3);
{
  const c = new Color();
  LED_INDEX.forEach((h, i) => {
    c.setHex(h);
    LED_RGB[i * 3] = c.r * 1.6;
    LED_RGB[i * 3 + 1] = c.g * 1.6;
    LED_RGB[i * 3 + 2] = c.b * 1.6;
  });
}
const ORNAMENT_COLS = [0xe63946, 0xffd166, 0x4dabff, 0xff8fab, 0xffffff];

export function createWorldDynamicsImpl(play: PlayableRoom, mat: Material): WorldDynamics {
  return new Dynamics(play, mat);
}

class Dynamics implements WorldDynamics {
  readonly group = new Group();
  private readonly W: number;
  private readonly D: number;
  private readonly theme: ReturnType<typeof roomTheme>;
  private disposables: { dispose(): void }[] = [];

  // ---- Roomba
  private roomba: Mesh | null = null;
  private ledStart = 0;
  private ledCount = 0;
  private ledHex = -1;
  private sticker: Sprite | null = null;
  private stickerT = -1e9;
  private rbX = 0;
  private rbZ = 0;
  private rbYaw = 0;
  private rbSeen = false;
  private rbPrevPause = 0;
  private rbBonkT = -1e9;
  private rbSpin = 0;
  private rbLastTime = -1;
  private lastTime = -1e9;
  private firstUpdate = true;

  // ---- puddles (+ wet tracks at the end of the pool)
  private puddles: InstancedMesh | null = null;
  private pudPrev: Uint8Array;
  private pudBorn: Float32Array;
  private pudAnimating = 0;
  private trackT: Float32Array;
  private trackX: Float32Array;
  private trackZ: Float32Array;
  private trackYaw: Float32Array;
  private nextTrack = 0;
  private wetUntil = -1;

  // ---- cables
  private cable: Mesh | null = null;
  private cableLamps: number[] = [];
  private cableCells: number[] = [];
  private cableTug: Float32Array;
  private cablePos: Float32Array = new Float32Array(0);
  private cablePts: Float32Array = new Float32Array(CABLE_PTS * 3);
  private cq = new Float32Array(12);

  // ---- fx particles (ambient snow/confetti + pops)
  private fx: InstancedMesh | null = null;
  private ambient: 'none' | 'snow' | 'confetti' = 'none';
  private popT: Float32Array;
  private popP: Float32Array; // x y z
  private popV: Float32Array; // vx vy vz
  private popFloor: Float32Array;
  private nextPop = 0;
  private amb = new Float32Array(FX_AMBIENT * 5);
  private popsLive = false;

  // ---- glow mesh (bulbs, TV, flames, REC) + additive glow (fire light, disco spots)
  private glow: Mesh | null = null;
  private glowAdd: Mesh | null = null;
  private gStart: number[] = [];
  private gCount: number[] = [];
  private gKind: number[] = [];
  private gBase: number[] = []; // r g b triples
  private gPhase: number[] = [];
  private addStart: number[] = [];
  private addCount: number[] = [];
  private addKind: number[] = [];
  private addBase: number[] = [];
  private addPhase: number[] = [];
  /** per-vertex brightness shape of the additive glows (radial falloff), multiplied by the animated colour */
  private addShape = new Float32Array(0);
  private addCX: number[] = [];
  private addCZ: number[] = [];
  private addR: number[] = [];
  private spotCenter: number[] = [];
  private disco: Mesh | null = null;
  private bulbPalette: number[] = [];
  private ox = 0;
  private oz = 0;
  /** colour tables (linear rgb triples) so the glow loop never calls into Color */
  private bulbRGB = new Float32Array(0);
  private tvShowRGB = new Float32Array(0);
  private tvAdRGB = new Float32Array(0);
  private gS = new Float32Array(0);
  private winA = 0;
  private winB = 0;
  private halfD = 0;
  private halfW = 0;

  constructor(
    private readonly play: PlayableRoom,
    private readonly mat: Material,
  ) {
    this.group.name = 'world-dynamics';
    const sh = play.shell;
    this.W = sh.width;
    this.D = sh.depth;
    this.halfW = (this.W * CELL_M) / 2;
    this.halfD = (this.D * CELL_M) / 2;
    this.ox = -this.halfW + CELL_M / 2;
    this.oz = -this.halfD + CELL_M / 2;
    this.theme = roomTheme(play);
    const n = this.W * this.D;
    this.pudPrev = new Uint8Array(n);
    this.pudBorn = new Float32Array(n).fill(-1e9);
    this.trackT = new Float32Array(TRACKS).fill(-1e9);
    this.trackX = new Float32Array(TRACKS);
    this.trackZ = new Float32Array(TRACKS);
    this.trackYaw = new Float32Array(TRACKS);
    this.popT = new Float32Array(FX_POPS).fill(-1e9);
    this.popP = new Float32Array(FX_POPS * 3);
    this.popV = new Float32Array(FX_POPS * 3);
    this.popFloor = new Float32Array(FX_POPS);
    this.cableTug = new Float32Array(play.room.props.length).fill(-1e9);

    const props = play.room.props;
    const hasRoomba = !!sh.roombaLoop && sh.roombaLoop.length >= 2 && props.some((p) => propKind(p.kind)?.actor === 'roomba');
    if (hasRoomba) this.buildRoomba();
    this.buildPuddles(n);
    for (let i = 0; i < props.length; i++) {
      const pl = props[i];
      if (propKind(pl.kind)?.pull !== 'cable') continue;
      const cx = pl.cable?.x ?? pl.x + RX[pl.rot & 3];
      const cz = pl.cable?.z ?? pl.z + RZ[pl.rot & 3];
      this.cableLamps.push(i);
      this.cableCells.push(cx, cz);
    }
    if (this.cableLamps.length) this.buildCables();
    this.ambient = this.theme === 'xmas' ? 'snow' : this.theme === 'nye' || this.theme === 'birthday' ? 'confetti' : 'none';
    const win = windowSpan(sh);
    this.winA = win.a;
    this.winB = win.b;
    this.buildFx();
    this.buildGlow();
    if (this.theme === 'nye') this.buildDisco();
  }

  // -------------------------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------------------------

  private own<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildRoomba(): void {
    const g = new GeoBuilder();
    const body = propKind(20)?.color ?? 0x2f3138;
    g.cylUp(0.15, 0.155, 0.05, 16, body, {}, { aoFloor: 0, aoStrength: 0.2 });
    g.cylUp(0.157, 0.157, 0.02, 16, 0x8a8f9c, { y: 0.012 });
    g.cylUp(0.11, 0.11, 0.006, 16, 0x5c6170, { y: 0.05 });
    g.cylUp(0.035, 0.035, 0.008, 10, 0xd7dde3, { y: 0.054 }); // the clean button
    // front bumper arc
    for (let i = 0; i < 7; i++) {
      const a = ((i - 3) / 3) * 1.0;
      g.boxUp(0.06, 0.03, 0.015, 0x1b1c26, { x: Math.sin(a) * 0.155, y: 0.012, z: Math.cos(a) * 0.155, ry: a });
    }
    // side brush
    for (let i = 0; i < 3; i++) g.box(0.07, 0.004, 0.008, 0x9aa0ae, { x: 0.09, y: 0.006, z: 0.11, ry: (i * Math.PI) / 3 }, { vary: 0 });
    // two little googly eyes: it has feelings
    for (const s of [-1, 1]) {
      g.sphere(0.018, 0xffffff, { x: s * 0.035, y: 0.06, z: 0.085, sy: 0.6 }, { vary: 0 }, 6, 4);
      g.sphere(0.009, 0x1b1c26, { x: s * 0.035, y: 0.068, z: 0.095 }, { vary: 0 }, 5, 3);
    }
    // the LED is part of the same mesh: its vertex colours blink (no extra draw call)
    this.ledStart = g.vertexCount;
    g.boxUp(0.045, 0.01, 0.014, 0x5cff7a, { y: 0.052, z: 0.125 }, { vary: 0 });
    g.sphere(0.008, 0x5cff7a, { y: 0.06, z: 0.0 }, { vary: 0 }, 5, 3);
    this.ledCount = g.vertexCount - this.ledStart;
    const geo = this.own(g.build());
    (geo.getAttribute('color') as BufferAttribute).setUsage(DynamicDrawUsage);
    const rb = new Mesh(geo, this.mat);
    rb.name = 'roomba';
    rb.castShadow = true;
    rb.matrixAutoUpdate = false;
    rb.visible = false;
    this.roomba = rb;
    const tex = makeLabelTexture('NOT ME', 0xffd166, 0x2b1d2e);
    if (tex) this.own(tex);
    const sm = this.own(new SpriteMaterial({ map: (tex as Texture | null) ?? null, color: tex ? 0xffffff : 0xffd166, depthTest: false, transparent: true }));
    const st = new Sprite(sm);
    st.name = 'framed-sticker';
    st.visible = false;
    st.renderOrder = 12;
    this.sticker = st;
    this.group.add(rb, st);
  }

  private buildPuddles(n: number): void {
    // a blob with a bright glint (vertex colours < 1 for the body so the instance tint can lift the glint)
    const g = new GeoBuilder();
    const blob = new CircleGeometry(1, 14);
    const pa = blob.getAttribute('position');
    for (let i = 1; i < pa.count; i++) {
      const k = 0.8 + 0.2 * Math.abs(Math.sin(i * 2.7));
      pa.setXY(i, pa.getX(i) * k, pa.getY(i) * k);
    }
    blob.rotateX(-Math.PI / 2);
    g.add(blob, 0xd0d0d0, {}, { vary: 0 });
    g.quad(0.34, 0.12, 0xffffff, { x: -0.25, y: 0.002, z: -0.2, ry: 0.6 }, { vary: 0 });
    g.quad(0.12, 0.06, 0xffffff, { x: 0.2, y: 0.002, z: 0.25, ry: 0.6 }, { vary: 0 });
    const geo = this.own(g.build());
    const pm = this.own(new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const m = new InstancedMesh(geo, pm, n + TRACKS);
    m.name = 'world-puddles';
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 1;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < n + TRACKS; i++) {
      m.setMatrixAt(i, ZERO);
      m.setColorAt(i, _c.setRGB(1, 1, 1));
    }
    this.puddles = m;
    this.group.add(m);
  }

  private buildCables(): void {
    const segs = CABLE_PTS - 1;
    // two crossed ribbons per segment: 4 triangles = 12 vertices
    const vertsPer = segs * 12;
    this.cablePos = new Float32Array(this.cableLamps.length * vertsPer * 3);
    const geo = this.own(new BufferGeometry());
    const attr = new BufferAttribute(this.cablePos, 3);
    attr.setUsage(DynamicDrawUsage);
    geo.setAttribute('position', attr);
    const cm = this.own(new MeshBasicMaterial({ color: 0x2b2d42, side: DoubleSide }));
    const m = new Mesh(geo, cm);
    m.name = 'lamp-cables';
    m.frustumCulled = false;
    this.cable = m;
    this.group.add(m);
  }

  private buildFx(): void {
    const geo = this.own(new OctahedronGeometry(0.02, 0));
    geo.scale(1, 0.35, 1);
    const fm = this.own(new MeshBasicMaterial({ color: 0xffffff }));
    const m = new InstancedMesh(geo, fm, FX_AMBIENT + FX_POPS);
    m.name = 'world-fx';
    m.visible = this.ambient !== 'none';
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    // ambient particle constants (speed, phase, x, z, scale), so the frame loop never hashes
    const snow = this.ambient === 'snow';
    for (let i = 0; i < FX_AMBIENT; i++) {
      const o = i * 5;
      this.amb[o] = snow ? 0.004 + hash01(i * 3) * 0.004 : 0.004 + hash01(i * 3 + 9) * 0.003;
      this.amb[o + 1] = snow ? hash01(i * 7 + 1) : hash01(i * 7 + 4);
      this.amb[o + 2] = snow ? this.winA + 0.02 + hash01(i * 5 + 2) * (this.winB - this.winA - 0.04) : (hash01(i * 5 + 3) - 0.5) * (this.halfW * 2 - 0.4);
      this.amb[o + 3] = (hash01(i * 13 + 6) - 0.5) * (this.halfD * 2 - 0.4);
      this.amb[o + 4] = 0.6 + hash01(i * 11) * 0.8;
    }
    const conf = [0xffd166, 0xf15bb5, 0x00bbf9, 0x9b5de5, 0x8ac926, 0xff595e];
    for (let i = 0; i < FX_AMBIENT + FX_POPS; i++) {
      m.setMatrixAt(i, ZERO);
      const col = i < FX_AMBIENT ? (this.ambient === 'snow' ? 0xffffff : conf[i % conf.length]) : 0xffffff;
      m.setColorAt(i, _c.setHex(col));
    }
    this.fx = m;
    this.group.add(m);
  }

  private pushGlow(g: GeoBuilder, before: number, kind: GlowKind, color: number, phase: number): void {
    const start = before;
    const count = g.vertexCount - before;
    this.gStart.push(start);
    this.gCount.push(count);
    this.gKind.push(kind);
    _c.setHex(color);
    this.gBase.push(_c.r, _c.g, _c.b);
    this.gPhase.push(phase);
  }

  private pushAdd(g: GeoBuilder, before: number, kind: GlowKind, color: number, phase: number, cx = 0, cz = 0, r = 1): void {
    this.addCX.push(cx);
    this.addCZ.push(cz);
    this.addR.push(r);
    this.addStart.push(before);
    this.addCount.push(g.vertexCount - before);
    this.addKind.push(kind);
    _c.setHex(color);
    this.addBase.push(_c.r, _c.g, _c.b);
    this.addPhase.push(phase);
  }

  private buildGlow(): void {
    const g = new GeoBuilder();
    const a = new GeoBuilder();
    // string lights
    const pts = stringLightPoints(this.play);
    this.bulbPalette = stringLightColors(this.theme);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const b = g.vertexCount;
      g.add(new OctahedronGeometry(0.03, 0), 0xffffff, { x: p.x + (p.wall === 'west' ? 0.03 : 0), y: p.y - 0.035, z: p.z + (p.wall === 'back' ? 0.03 : 0), sy: 1.4 }, { vary: 0 });
      this.pushGlow(g, b, GlowKind.Bulb, this.bulbPalette[i % this.bulbPalette.length], hash01(i * 13 + 5) * 6.28);
    }
    // animated furniture
    for (const an of furnitureAnchors(this.play.shell)) {
      const cs = Math.cos(an.ry);
      const sn = Math.sin(an.ry);
      const at = (lx: number, ly: number, lz: number) => ({ x: an.x + lx * cs + lz * sn, y: an.y + ly, z: an.z - lx * sn + lz * cs, ry: an.ry });
      if (an.kind === 'tv') {
        // a 3 x 2 grid of picture blocks
        for (let r = 0; r < 2; r++)
          for (let k = 0; k < 3; k++) {
            const b = g.vertexCount;
            g.box(an.w / 3, an.h / 2, 0.002, 0xffffff, at(-an.w / 3 + k * (an.w / 3), -an.h / 4 + r * (an.h / 2), 0), { vary: 0 });
            this.pushGlow(g, b, GlowKind.TvCell, 0x6fb7e8, r * 3 + k);
          }
      } else if (an.kind === 'fire') {
        for (let i = 0; i < 4; i++) {
          const b = g.vertexCount;
          const lx = (i - 1.5) * (an.w / 4);
          const h = an.h * (0.55 + (i % 2) * 0.35);
          g.cone(an.w / 7, h, 5, 0xffffff, { ...at(lx, h / 2 - an.h * 0.1, 0) }, { vary: 0 });
          this.pushGlow(g, b, GlowKind.Flame, i % 2 ? 0xffd166 : 0xff7a2f, i * 1.7);
        }
        // warm light on the floor in front of the fireplace (additive)
        const b = a.vertexCount;
        const gx = an.x + 0.4 * sn;
        const gz = an.z + 0.4 * cs;
        a.add(new CircleGeometry(1, 16).rotateX(-Math.PI / 2), 0xffffff, { x: gx, y: 0.004, z: gz, sx: an.w * 1.1, sz: 0.7, ry: an.ry }, { vary: 0 });
        this.pushAdd(a, b, GlowKind.FireGlow, 0x7a3a0a, 0, gx, gz, Math.max(an.w * 1.1, 0.7));
      } else {
        const b = g.vertexCount;
        g.sphere(0.014, 0xffffff, at(0, 0, 0), { vary: 0 }, 6, 4);
        this.pushGlow(g, b, GlowKind.Rec, 0xff2d2d, 0);
      }
    }
    // disco spots (nye): soft additive discs sweeping the floor and the back wall
    if (this.theme === 'nye') {
      const spotCols = [0x553311, 0x441144, 0x113355, 0x334411, 0x552222, 0x223355];
      for (let i = 0; i < 6; i++) {
        const b = a.vertexCount;
        a.add(new CircleGeometry(0.22, 12).rotateX(-Math.PI / 2), 0xffffff, { y: 0.006 }, { vary: 0 });
        this.pushAdd(a, b, GlowKind.Spot, spotCols[i], (i / 6) * Math.PI * 2, 0, 0, 0.22);
        this.spotCenter.push(0, 0);
      }
    }
    // pack the element table and the colour tables into typed arrays (read every frame)
    this.gS = new Float32Array(this.gStart.length * 8);
    for (let e = 0; e < this.gStart.length; e++) {
      const o = e * 8;
      this.gS[o] = this.gStart[e];
      this.gS[o + 1] = this.gCount[e];
      this.gS[o + 2] = this.gKind[e];
      this.gS[o + 3] = this.gBase[e * 3];
      this.gS[o + 4] = this.gBase[e * 3 + 1];
      this.gS[o + 5] = this.gBase[e * 3 + 2];
      this.gS[o + 6] = this.gPhase[e];
    }
    const table = (cols: number[]) => {
      const t = new Float32Array(cols.length * 3);
      cols.forEach((h, i) => {
        _c.setHex(h);
        t[i * 3] = _c.r;
        t[i * 3 + 1] = _c.g;
        t[i * 3 + 2] = _c.b;
      });
      return t;
    };
    this.bulbRGB = table(this.bulbPalette.length ? this.bulbPalette : [0xffffff]);
    this.tvShowRGB = table([0x6fb7e8, 0x8ecae6, 0x90be6d, 0xf9c74f, 0xa0c4ff, 0xbdb2ff, 0x83c5be, 0xffd6a5, 0x9bf6ff, 0xcaffbf, 0xfdffb6, 0xffadad]);
    this.tvAdRGB = table([0xff006e, 0xffbe0b, 0x3a86ff, 0x8338ec, 0xfb5607, 0x06d6a0, 0xffee32, 0xef476f]);
    if (this.gStart.length) {
      const geo = this.own(g.build());
      const col = geo.getAttribute('color') as BufferAttribute;
      col.setUsage(DynamicDrawUsage);
      const m = new Mesh(geo, this.own(new MeshBasicMaterial({ vertexColors: true })));
      m.name = 'world-glow';
      m.frustumCulled = false;
      this.glow = m;
      this.group.add(m);
    }
    if (this.addStart.length) {
      const geo = this.own(a.build());
      // radial falloff: bright centre, black rim (additive, so black = no light)
      const pos = geo.getAttribute('position');
      this.addShape = new Float32Array(pos.count);
      for (let e = 0; e < this.addStart.length; e++) {
        const st = this.addStart[e];
        for (let v = st; v < st + this.addCount[e]; v++) {
          const d = Math.hypot(pos.getX(v) - this.addCX[e], pos.getZ(v) - this.addCZ[e]) / this.addR[e];
          this.addShape[v] = Math.max(0, 1 - d * d);
        }
      }
      (geo.getAttribute('color') as BufferAttribute).setUsage(DynamicDrawUsage);
      (geo.getAttribute('position') as BufferAttribute).setUsage(DynamicDrawUsage);
      const m = new Mesh(geo, this.own(new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide })));
      m.name = 'world-glow-add';
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.glowAdd = m;
      this.group.add(m);
    }
  }

  private buildDisco(): void {
    const g = new GeoBuilder();
    const y = 2.05;
    const z = -this.halfD + 0.9;
    const geo = new OctahedronGeometry(0.13, 2);
    // facet colours: mirror tiles in greys, whites and a few coloured glints
    g.add(geo, 0xffffff, {}, { vary: 0.45 });
    g.cylUp(0.006, 0.006, 2.4 - y - 0.12, 4, 0xdfe6ee, { y: 0.12 }, { vary: 0 });
    const m = new Mesh(this.own(g.build()), this.own(new MeshBasicMaterial({ vertexColors: true })));
    m.name = 'disco-ball';
    m.position.set(0, y, z);
    this.disco = m;
    this.group.add(m);
  }

  // -------------------------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------------------------

  update(s: SimState, alpha: number, events: readonly SimEvent[]): void {
    const time = s.tick + alpha;
    // a new run (tick went backwards: clip pass, restart) forgets the transient effects
    if (time < this.lastTime - 1) this.resetTransient();
    this.lastTime = time;
    for (let i = 0; i < events.length; i++) this.onEvent(events[i], s, time);
    this.updateRoomba(s, alpha, time);
    this.updatePuddles(s, time);
    if (this.cable) this.updateCables(s, alpha, time);
    if (this.fx) this.updateFx(time);
    if (this.glow || this.glowAdd) this.updateGlow(s, time);
    if (this.disco) this.disco.rotation.y = time * 0.025;
    this.firstUpdate = false;
  }

  private resetTransient(): void {
    this.stickerT = -1e9;
    this.rbBonkT = -1e9;
    this.rbSeen = false;
    this.rbLastTime = -1;
    this.rbPrevPause = 0;
    this.wetUntil = -1;
    this.trackT.fill(-1e9);
    this.popT.fill(-1e9);
    this.cableTug.fill(-1e9);
    this.firstUpdate = true;
    if (this.fx) {
      for (let i = 0; i < FX_POPS; i++) this.fx.setMatrixAt(FX_AMBIENT + i, ZERO);
      this.fx.instanceMatrix.needsUpdate = true;
    }
    this.popsLive = false;
    if (this.puddles) {
      for (let i = 0; i < TRACKS; i++) this.puddles.setMatrixAt(this.W * this.D + i, ZERO);
      this.puddles.instanceMatrix.needsUpdate = true;
    }
  }

  private onEvent(e: SimEvent, s: SimState, time: number): void {
    switch (e.t) {
      case 'framed':
        this.stickerT = time;
        this.rbBonkT = time;
        break;
      case 'pull':
        if (e.kind === 'cable' && e.prop >= 0 && e.prop < this.cableTug.length) this.cableTug[e.prop] = time;
        break;
      case 'topple': {
        const p = s.props[e.prop];
        if (!p) break;
        // ornaments pop off along the falling crown
        const bx = cellX(p.fromX, this.W);
        const bz = cellZ(p.fromZ, this.D);
        const dx = p.x - p.fromX;
        const dz = p.z - p.fromZ;
        const len = Math.max(1, Math.hypot(dx, dz));
        for (let k = 0; k < 18; k++) {
          const h = hash01(e.tick * 31 + k * 7);
          const along = 0.3 + h * 1.2;
          const y = 0.4 + hash01(k * 11 + e.tick) * 1.1;
          this.spawnPop(
            bx + (dx / len) * along * 0.3,
            y,
            bz + (dz / len) * along * 0.3,
            (dx / len) * (0.8 + h) + (hash01(k * 5) - 0.5) * 1.2,
            0.8 + hash01(k * 3 + 1) * 1.6,
            (dz / len) * (0.8 + h) + (hash01(k * 9) - 0.5) * 1.2,
            time + k * 0.4,
            ORNAMENT_COLS[k % ORNAMENT_COLS.length],
            0,
          );
        }
        break;
      }
      case 'puddle': {
        // a little splash where the puddle appeared
        const x = cellX(e.x, this.W);
        const z = cellZ(e.z, this.D);
        const col = e.kind === 1 ? 0xcfefff : 0x6b4a2e;
        for (let k = 0; k < 4; k++) {
          const a = hash01(e.tick * 13 + e.x * 7 + e.z * 3 + k) * 6.28;
          this.spawnPop(x, 0.02, z, Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5, time, col, 0);
        }
        break;
      }
      case 'break':
      case 'land':
      case 'spill':
      case 'hit': {
        const r = s.roomba;
        const p = s.props[e.prop];
        if (r && p && Math.max(Math.abs(r.x - p.x), Math.abs(r.z - p.z)) <= 1) this.rbBonkT = time;
        break;
      }
      default:
        break;
    }
  }

  private spawnPop(x: number, y: number, z: number, vx: number, vy: number, vz: number, t0: number, color: number, floorY: number): void {
    if (!this.fx) return;
    const i = this.nextPop;
    this.nextPop = (this.nextPop + 1) % FX_POPS;
    this.popT[i] = t0;
    this.popP[i * 3] = x;
    this.popP[i * 3 + 1] = y;
    this.popP[i * 3 + 2] = z;
    this.popV[i * 3] = vx;
    this.popV[i * 3 + 1] = vy;
    this.popV[i * 3 + 2] = vz;
    this.popFloor[i] = floorY;
    this.fx.setColorAt(FX_AMBIENT + i, _c.setHex(color));
    if (this.fx.instanceColor) this.fx.instanceColor.needsUpdate = true;
    this.popsLive = true;
  }

  private updateRoomba(s: SimState, alpha: number, time: number): void {
    const rb = this.roomba;
    const r = s.roomba;
    if (!rb || !r) {
      if (rb) {
        rb.visible = false;
        this.sticker!.visible = false;
      }
      this.rbSeen = false;
      return;
    }
    const moving = r.fromX !== r.x || r.fromZ !== r.z;
    const k = moving ? clamp01((r.stepProgress + (r.pause > 0 ? 0 : alpha)) / ROOMBA_STEP_TICKS) : 1;
    const fx = this.ox + r.fromX * CELL_M;
    const fz = this.oz + r.fromZ * CELL_M;
    const tx = this.ox + r.x * CELL_M;
    const tz = this.oz + r.z * CELL_M;
    this.rbX = fx + (tx - fx) * k;
    this.rbZ = fz + (tz - fz) * k;
    // pause: starts a slow, puzzled spin
    if (r.pause > 0 && this.rbPrevPause === 0) this.rbBonkT = Math.max(this.rbBonkT, time - 4);
    this.rbPrevPause = r.pause;
    const dt = this.rbLastTime < 0 ? 0 : Math.max(0, Math.min(4, time - this.rbLastTime));
    this.rbLastTime = time;
    const targetYaw = YAW_OF[r.facing] ?? 0;
    if (!this.rbSeen) {
      this.rbYaw = targetYaw;
      this.rbSpin = 0;
    }
    if (r.pause > 0) this.rbSpin += dt * 0.06;
    else this.rbSpin *= Math.pow(0.85, dt);
    let dy = (targetYaw - this.rbYaw) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.rbYaw += dy * (1 - Math.pow(0.82, dt));
    this.rbSeen = true;
    // bob, and a squash right after a bonk
    const bt = time - this.rbBonkT;
    const squash = bt >= 0 && bt < 18 ? Math.sin((bt / 18) * Math.PI * 3) * (1 - bt / 18) * 0.28 : 0;
    const bob = Math.sin(time * 0.5) * 0.003;
    const ha = (this.rbYaw + this.rbSpin) * 0.5;
    _q.set(0, Math.sin(ha), 0, Math.cos(ha));
    _m.compose(_v.set(this.rbX, 0.002 + bob, this.rbZ), _q, _s.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5));
    rb.matrix.copy(_m);
    rb.matrixWorldNeedsUpdate = true;
    rb.visible = true;
    // LED: slow green blink when driving, quick amber while it waits (vertex colours, written on change only)
    const on = r.pause > 0 ? Math.floor(time / 4) % 2 === 0 : Math.floor(time / 15) % 2 === 0;
    const ledHex = r.pause > 0 ? (on ? 0xffb43c : 0x5a4020) : on ? 0x7dff96 : 0x1f5a2c;
    if (ledHex !== this.ledHex) {
      this.ledHex = ledHex;
      const col = rb.geometry.getAttribute('color') as BufferAttribute;
      const arr = col.array as Float32Array;
      const li = LED_INDEX.indexOf(ledHex) * 3;
      for (let q = this.ledStart * 3, e = (this.ledStart + this.ledCount) * 3; q < e; q += 3) {
        arr[q] = LED_RGB[li];
        arr[q + 1] = LED_RGB[li + 1];
        arr[q + 2] = LED_RGB[li + 2];
      }
      col.needsUpdate = true;
    }
    // "NOT ME" sticker, pops in and wobbles for 2.5 s
    const st = this.sticker!;
    const sa = time - this.stickerT;
    if (sa >= 0 && sa < 75) {
      const pop = sa < 6 ? 1 + Math.sin((sa / 6) * Math.PI) * 0.35 : 1;
      const fade = sa > 60 ? 1 - (sa - 60) / 15 : 1;
      st.visible = true;
      st.position.set(this.rbX, 0.42 + Math.sin(sa * 0.3) * 0.015, this.rbZ);
      st.scale.set(0.36 * pop * fade, 0.3 * pop * fade, 1);
      st.material.rotation = Math.sin(sa * 0.25) * 0.12;
    } else st.visible = false;
    // wet wheels: driving through a puddle leaves tracks for a few cells
    const pu = s.grid.puddle;
    if (pu) {
      const cx = Math.round(this.rbX / CELL_M + this.W / 2 - 0.5);
      const cz = Math.round(this.rbZ / CELL_M + this.D / 2 - 0.5);
      if (cx >= 0 && cz >= 0 && cx < this.W && cz < this.D && pu[cz * this.W + cx]) this.wetUntil = time + ROOMBA_STEP_TICKS * 2;
      if (time < this.wetUntil && !(r.pause > 0)) this.addTrack(time);
    }
  }

  private addTrack(time: number): void {
    const i = this.nextTrack;
    const last = (i + TRACKS - 1) % TRACKS;
    if (time - this.trackT[last] < 6) return;
    this.nextTrack = (i + 1) % TRACKS;
    this.trackT[i] = time;
    this.trackX[i] = this.rbX;
    this.trackZ[i] = this.rbZ;
    this.trackYaw[i] = this.rbYaw;
  }

  private updatePuddles(s: SimState, time: number): void {
    const m = this.puddles;
    if (!m) return;
    const pu = s.grid.puddle;
    const n = this.W * this.D;
    let dirty = false;
    let colDirty = false;
    if (pu) {
      for (let i = 0; i < n && i < pu.length; i++) {
        const v = pu[i];
        if (v !== this.pudPrev[i]) {
          // a puddle born before this view existed (fresh load mid-run) appears fully grown
          this.pudBorn[i] = v && this.pudPrev[i] === 0 && !this.firstUpdate ? time : -1e9;
          this.pudPrev[i] = v;
          if (v) {
            if (v === 1) m.setColorAt(i, _c.setRGB(0.55, 0.92, 1.3));
            else m.setColorAt(i, _c.setRGB(0.62, 0.42, 0.28));
            colDirty = true;
          }
          this.writePuddle(i, v, time);
          dirty = true;
          if (v) this.pudAnimating++;
        }
      }
    } else if (this.pudAnimating >= 0) {
      for (let i = 0; i < n; i++)
        if (this.pudPrev[i]) {
          this.pudPrev[i] = 0;
          m.setMatrixAt(i, ZERO);
          dirty = true;
        }
    }
    if (this.pudAnimating > 0) {
      let still = 0;
      for (let i = 0; i < n; i++) {
        const v = this.pudPrev[i];
        if (!v) continue;
        const age = time - this.pudBorn[i];
        if (age >= 0 && age < 10) {
          this.writePuddle(i, v, time);
          dirty = true;
          still++;
        } else if (age >= 10 && age < 11.5) {
          this.writePuddle(i, v, time);
          dirty = true;
        }
      }
      this.pudAnimating = still;
    }
    // wet tracks (fade by shrinking over 3 s)
    for (let k = 0; k < TRACKS; k++) {
      const age = time - this.trackT[k];
      const j = n + k;
      if (age >= 0 && age < 90) {
        const f = 1 - age / 90;
        _q.set(0, Math.sin(this.trackYaw[k] * 0.5), 0, Math.cos(this.trackYaw[k] * 0.5));
        _m.compose(_v.set(this.trackX[k], PUDDLE_Y + 0.0015, this.trackZ[k]), _q, _s.set(0.05 * f + 0.01, 1, 0.12 * f + 0.02));
        m.setMatrixAt(j, _m);
        dirty = true;
      } else if (age >= 90 && age < 92) {
        m.setMatrixAt(j, ZERO);
        dirty = true;
      }
    }
    if (dirty) m.instanceMatrix.needsUpdate = true;
    if (colDirty && m.instanceColor) m.instanceColor.needsUpdate = true;
    if (dirty) {
      let any = false;
      for (let i = 0; i < n && !any; i++) if (this.pudPrev[i]) any = true;
      for (let k = 0; k < TRACKS && !any; k++) if (time - this.trackT[k] < 92) any = true;
      m.visible = any;
    }
  }

  private writePuddle(i: number, v: number, time: number): void {
    const m = this.puddles!;
    if (!v) {
      m.setMatrixAt(i, ZERO);
      return;
    }
    const x = i % this.W;
    const z = (i / this.W) | 0;
    const age = time - this.pudBorn[i];
    const k = age < 0 || age >= 10 ? 1 : 1 - Math.pow(1 - age / 10, 3);
    const r = 0.275 * (0.25 + 0.75 * k) * (v === 2 ? 0.9 : 1);
    const ha = hash01(i * 17 + 3) * 3.14;
    _q.set(0, Math.sin(ha), 0, Math.cos(ha));
    _m.compose(_v.set(this.ox + x * CELL_M, PUDDLE_Y + (v === 2 ? 0.001 : 0), this.oz + z * CELL_M), _q, _s.set(r, 1, r * 0.9));
    m.setMatrixAt(i, _m);
  }

  /** Lamp position as drawn (cell centre, falling lerp), written to _v. */
  private lampPos(s: SimState, i: number, alpha: number): void {
    const p = s.props[i];
    if (!p) {
      _v.set(0, 0, 0);
      return;
    }
    if (p.state === PropSt.FALLING && p.fallTicks > 0) {
      const t = clamp01((p.fallTicks - p.fallTimer + alpha) / p.fallTicks);
      const y0 = LEVEL_HEIGHT_M[p.fromLevel] ?? 0;
      const y1 = LEVEL_HEIGHT_M[p.level] ?? 0;
      _v.x = this.ox + (p.fromX + (p.x - p.fromX) * t) * CELL_M;
      _v.y = y0 + (y1 - y0) * t * t;
      _v.z = this.oz + (p.fromZ + (p.z - p.fromZ) * t) * CELL_M;
    } else {
      _v.x = this.ox + p.x * CELL_M;
      _v.y = LEVEL_HEIGHT_M[p.level] ?? 0;
      _v.z = this.oz + p.z * CELL_M;
    }
  }

  private updateCables(s: SimState, alpha: number, time: number): void {
    const pts = this.cablePts;
    const pos = this.cablePos;
    let o = 0;
    for (let c = 0; c < this.cableLamps.length; c++) {
      const li = this.cableLamps[c];
      const p = s.props[li];
      this.lampPos(s, li, alpha);
      const lx = _v.x;
      const ly = _v.y + 0.02;
      const lz = _v.z;
      const fx = this.ox + this.cableCells[c * 2] * CELL_M;
      const fz = this.oz + this.cableCells[c * 2 + 1] * CELL_M;
      const fy = 0.008;
      // the edge of the surface the lamp stands on, halfway toward the floor cell
      const broken = p && p.state === PropSt.BROKEN;
      const ex = lx + (fx - lx) * 0.5;
      const ez = lz + (fz - lz) * 0.5;
      const tugA = time - this.cableTug[li];
      const tug = tugA >= 0 && tugA < 20 ? (1 - tugA / 20) * Math.sin(tugA * 1.9) : 0;
      const taut = tugA >= 0 && tugA < 8 ? 1 - tugA / 8 : 0;
      for (let k = 0; k < CABLE_PTS; k++) {
        const t = k / (CABLE_PTS - 1);
        let x: number;
        let y: number;
        let z: number;
        if (t < 0.35) {
          // along the surface to its edge
          const u = t / 0.35;
          x = lx + (ex - lx) * u;
          z = lz + (ez - lz) * u;
          y = ly + (ly - 0.02 - ly) * u;
        } else {
          // drapes down the edge and curls on the floor
          const u = (t - 0.35) / 0.65;
          const sag = (1 - taut) * Math.sin(u * Math.PI) * 0.12;
          x = ex + (fx - ex) * u + (fx - ex) * sag;
          z = ez + (fz - ez) * u + (fz - ez) * sag;
          const drop = 1 - Math.pow(1 - u, 2.2);
          y = ly - 0.02 + (fy - (ly - 0.02)) * (taut > 0 ? u : drop);
        }
        // tug wiggle: a travelling wave across the cable
        const w = tug * Math.sin(t * Math.PI * 3 - tugA * 0.6) * 0.04 * Math.sin(t * Math.PI);
        pts[k * 3] = x + (fz - lz) * w;
        pts[k * 3 + 1] = Math.max(0.004, y + Math.abs(w) * 0.5);
        pts[k * 3 + 2] = z - (fx - lx) * w;
      }
      if (broken) {
        // the lamp is gone: the cable lies limp on the floor between the two cells
        for (let k = 0; k < CABLE_PTS; k++) {
          const t = k / (CABLE_PTS - 1);
          pts[k * 3] = lx + (fx - lx) * t;
          pts[k * 3 + 1] = 0.006 + (p.level > 0 ? (LEVEL_HEIGHT_M[p.level] ?? 0) * (1 - t) : 0);
          pts[k * 3 + 2] = lz + (fz - lz) * t + Math.sin(t * Math.PI * 2) * 0.05;
        }
      }
      // two crossed ribbons per segment
      const r = 0.008;
      for (let k = 0; k < CABLE_PTS - 1; k++) {
        const ax = pts[k * 3];
        const ay = pts[k * 3 + 1];
        const az = pts[k * 3 + 2];
        const bx = pts[k * 3 + 3];
        const by = pts[k * 3 + 4];
        const bz = pts[k * 3 + 5];
        let hx = bz - az;
        let hz = -(bx - ax);
        const hl = Math.sqrt(hx * hx + hz * hz);
        if (hl < 1e-5) {
          hx = r;
          hz = 0;
        } else {
          hx = (hx / hl) * r;
          hz = (hz / hl) * r;
        }
        // ribbon 1 (horizontal) and ribbon 2 (vertical): corners a-o, a+o, b+o, b-o, triangles 0-1-2, 0-2-3
        for (let rb = 0; rb < 2; rb++) {
          const ox = rb === 0 ? hx : 0;
          const oy = rb === 0 ? 0 : r;
          const oz = rb === 0 ? hz : 0;
          const cq = this.cq;
          cq[0] = ax - ox;
          cq[1] = ay - oy;
          cq[2] = az - oz;
          cq[3] = ax + ox;
          cq[4] = ay + oy;
          cq[5] = az + oz;
          cq[6] = bx + ox;
          cq[7] = by + oy;
          cq[8] = bz + oz;
          cq[9] = bx - ox;
          cq[10] = by - oy;
          cq[11] = bz - oz;
          for (let t = 0; t < 6; t++) {
            const ci = TRI[t] * 3;
            pos[o] = cq[ci];
            pos[o + 1] = cq[ci + 1];
            pos[o + 2] = cq[ci + 2];
            o += 3;
          }
        }
      }
    }
    const geo = this.cable!.geometry;
    (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  private updateFx(time: number): void {
    const m = this.fx!;
    let dirty = false;
    // ambient: snow behind the window glass, or confetti drifting down the room
    if (this.ambient !== 'none') {
      const snow = this.ambient === 'snow';
      const zb = -this.halfD - WALL_T * 0.65;
      const H = snow ? WIN_Y1 - WIN_Y0 + 0.1 : 2.3;
      const top = snow ? WIN_Y1 + 0.05 : H;
      const a = this.amb;
      for (let i = 0; i < FX_AMBIENT; i++) {
        const o = i * 5;
        const y = top - ((a[o + 1] * H + time * a[o]) % H);
        const wob = Math.sin(time * (snow ? 0.05 : 0.08) + i * 1.7) * (snow ? 0.02 : 0.06);
        const x = a[o + 2] + wob;
        const z = snow ? zb : a[o + 3];
        const sc = a[o + 4];
        const ha = (time * (snow ? 0.05 : 0.12) + i) * 0.5;
        _q.set(0, Math.sin(ha), 0, Math.cos(ha));
        _m.compose(_v.set(x, y, z), _q, snow ? _s.set(sc, sc * 2.4, sc) : _s.set(0.8, 1, 1.2));
        m.setMatrixAt(i, _m);
      }
      dirty = true;
    }
    // pops: ballistic, then lie on the floor for a moment and vanish
    if (this.popsLive) {
      let live = false;
      for (let i = 0; i < FX_POPS; i++) {
        const age = (time - this.popT[i]) / 30;
        const j = FX_AMBIENT + i;
        if (age < 0) {
          if (age > -2) {
            live = true;
            m.setMatrixAt(j, ZERO);
            dirty = true;
          }
          continue;
        }
        if (age > 1.6) {
          if (age < 1.8) {
            m.setMatrixAt(j, ZERO);
            dirty = true;
            live = true;
          }
          continue;
        }
        live = true;
        const x = this.popP[i * 3] + this.popV[i * 3] * age;
        const z = this.popP[i * 3 + 2] + this.popV[i * 3 + 2] * age;
        const y = Math.max(this.popFloor[i] + 0.006, this.popP[i * 3 + 1] + this.popV[i * 3 + 1] * age - 4.9 * age * age);
        const sc = (age > 1.2 ? 1 - (age - 1.2) / 0.4 : 1) * 1.3;
        _q.set(0, Math.sin((age * 9 + i) * 0.5), 0, Math.cos((age * 9 + i) * 0.5));
        _m.compose(_v.set(Math.max(-this.halfW, Math.min(this.halfW, x)), y, Math.max(-this.halfD, Math.min(this.halfD, z))), _q, _s.set(sc, sc * 2, sc));
        m.setMatrixAt(j, _m);
        dirty = true;
      }
      this.popsLive = live;
    }
    if (dirty) m.instanceMatrix.needsUpdate = true;
    m.visible = this.ambient !== 'none' || this.popsLive;
  }

  private updateGlow(s: SimState, time: number): void {
    const adBreak = this.play.room.event === 3 && s.eventActive === 1;
    const camLive = !!this.play.routine.onCamera || !!this.play.shell.webcam;
    if (this.glow) {
      const col = this.glow.geometry.getAttribute('color') as BufferAttribute;
      const arr = col.array as Float32Array;
      const gs = this.gS;
      const n = gs.length / 8;
      const nb = this.bulbRGB.length / 3;
      const shift = Math.floor(time / 90);
      const step = Math.floor(time / 5);
      const scene = Math.floor(time / 60);
      const recOn = Math.floor(time / 15) % 2 === 0;
      for (let e = 0; e < n; e++) {
        const o = e * 8;
        const kind = gs[o + 2];
        const ph = gs[o + 6];
        let r = gs[o + 3];
        let g = gs[o + 4];
        let b = gs[o + 5];
        let k = 1;
        if (kind === GlowKind.Bulb) {
          // twinkle, and every 3 s the chase shifts the colours along the string
          const ci = ((e + shift) % nb) * 3;
          r = this.bulbRGB[ci];
          g = this.bulbRGB[ci + 1];
          b = this.bulbRGB[ci + 2];
          k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.18 + ph));
        } else if (kind === GlowKind.TvCell) {
          const tab = adBreak ? this.tvAdRGB : this.tvShowRGB;
          const nt = tab.length / 3;
          // ad break: loud rainbow flashing; the show: soft blocks that change scene every 2 s
          const ci = adBreak ? ((step + ph * 5) % nt) * 3 : ((scene * 7 + ph * 3 + ((scene * 13) % 5)) % nt) * 3;
          r = tab[ci];
          g = tab[ci + 1];
          b = tab[ci + 2];
          k = adBreak ? 1.2 : 0.95 + 0.05 * Math.sin(time * 0.7);
        } else if (kind === GlowKind.Flame) k = 0.7 + 0.3 * Math.sin(time * 0.55 + ph) * Math.sin(time * 0.23 + ph * 2);
        else if (kind === GlowKind.Rec) k = recOn ? (camLive ? 1.2 : 0.9) : 0.15;
        r *= k;
        g *= k;
        b *= k;
        const st = gs[o] * 3;
        const en = st + gs[o + 1] * 3;
        for (let q = st; q < en; q += 3) {
          arr[q] = r;
          arr[q + 1] = g;
          arr[q + 2] = b;
        }
      }
      col.needsUpdate = true;
    }
    if (this.glowAdd) {
      const geo = this.glowAdd.geometry;
      const col = geo.getAttribute('color') as BufferAttribute;
      const pos = geo.getAttribute('position') as BufferAttribute;
      const carr = col.array as Float32Array;
      const parr = pos.array as Float32Array;
      let moved = false;
      let spot = 0;
      for (let e = 0; e < this.addStart.length; e++) {
        let k = 1;
        const kind = this.addKind[e];
        const st = this.addStart[e] * 3;
        const en = st + this.addCount[e] * 3;
        if (kind === GlowKind.FireGlow) k = 0.75 + 0.25 * Math.sin(time * 0.5) * Math.sin(time * 0.21 + 1);
        else if (kind === GlowKind.Spot) {
          // sweep in slow circles; recentre the disc by shifting its vertices
          const ph = this.addPhase[e];
          const nx = Math.cos(time * 0.02 + ph) * this.halfW * 0.6;
          const nz = Math.sin(time * 0.027 + ph * 1.3) * this.halfD * 0.55;
          const ox = this.spotCenter[spot * 2];
          const oz = this.spotCenter[spot * 2 + 1];
          for (let q = st; q < en; q += 3) {
            parr[q] += nx - ox;
            parr[q + 2] += nz - oz;
          }
          this.spotCenter[spot * 2] = nx;
          this.spotCenter[spot * 2 + 1] = nz;
          spot++;
          moved = true;
          k = 0.7 + 0.3 * Math.sin(time * 0.3 + ph);
        }
        const r = this.addBase[e * 3] * k;
        const g = this.addBase[e * 3 + 1] * k;
        const b = this.addBase[e * 3 + 2] * k;
        const sh = this.addShape;
        for (let q = st, v = this.addStart[e]; q < en; q += 3, v++) {
          carr[q] = r * sh[v];
          carr[q + 1] = g * sh[v];
          carr[q + 2] = b * sh[v];
        }
      }
      col.needsUpdate = true;
      if (moved) pos.needsUpdate = true;
    }
  }

  roombaPosition(out: Vector3): Vector3 | null {
    if (!this.roomba || !this.rbSeen) return null;
    return out.set(this.rbX, 0.05, this.rbZ);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.puddles?.dispose();
    this.fx?.dispose();
    this.group.clear();
  }
}


/** Sky style of the room (re-exported for the dev preview). */
export function roomSky(play: PlayableRoom) {
  return THEME_SKY[roomTheme(play)] ?? THEME_SKY.default;
}
