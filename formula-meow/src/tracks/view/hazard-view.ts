/**
 * Hazard views (tracks lane, render only): procedural low-poly meshes for the six hazards, posed every frame from the
 * same pure functions the sim uses (src/tracks/hazards/geometry.ts) at the interpolated tick, so what you see is what
 * hits you. Each hazard shows its telegraph: the roomba's blinking light, the swinging sheet, the toaster's glowing
 * slots and smoke, the chimney's puffs before the steam, the drum's coloured rib and arrows.
 * Everything is added to the race's world group, so it is disposed with the race.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3, type Material } from 'three';
import type { BuiltTrack, HazardPlace } from '../../core/track/build';
import { GeoBuilder } from '../../core/render/geo';
import { toonMaterial } from '../../core/render/toon';
import { DRUM, ROOMBA, STEAM, TOASTER, drumAngle, drumPush, roombaPose, sheetHalfWidth, sheetOffset, steamOn, steamState, toasterState, type Pose } from '../hazards/geometry';
import { MILK_R } from '../../core/track/build';

interface Piece {
  place: HazardPlace;
  update(tick: number, dt: number, kart: Eye | null): void;
}

/** A point on the floor plane with a height (the player's shown kart, the camera). */
export interface Eye {
  x: number;
  y: number;
  z: number;
}

/** The hanging sheet's opacity while it is between the camera and the player's kart (screen-door, `alphaHash`). */
export const SHEET_FADE = { alpha: 0.25, fadeS: 0.12, margin: 0.6 } as const;

/**
 * True when the sight line camera → kart (floor plane) crosses the sheet: the segment through the sheet's centre
 * (sx, sz) along the washing line (lx, lz unit), `half` metres each way. Pure (unit tested). The playtest found the
 * sheet filling the whole screen for ~0.3 s a lap on Laundry Spin, the kart unseen (it needs the same camera-ray fade
 * Battle furniture got).
 */
export function sheetBlocksSight(cx: number, cz: number, kx: number, kz: number, sx: number, sz: number, lx: number, lz: number, half: number): boolean {
  const dx = kx - cx;
  const dz = kz - cz;
  const den = dx * lz - dz * lx;
  if (Math.abs(den) < 1e-6) return false;
  // cam + u·d = s + v·l
  const ex = sx - cx;
  const ez = sz - cz;
  const u = (ex * lz - ez * lx) / den;
  const v = (ex * dz - ez * dx) / den;
  return u > 0 && u < 1 && Math.abs(v) <= half;
}

const pose: Pose = { x: 0, z: 0, fx: 0, fz: 1 };

/** Yaw (three.js rotation.y) that points local +z along (fx, fz). */
const yaw = (fx: number, fz: number): number => Math.atan2(fx, fz);

export class HazardView {
  private readonly pieces: Piece[] = [];
  private readonly mats: Material[] = [];

  constructor(
    private readonly group: Group,
    track: BuiltTrack,
  ) {
    for (const p of track.hazards) {
      const piece = this.make(p);
      if (piece) this.pieces.push(piece);
    }
  }

  /** `kart`: the player's shown kart (the laundry sheet fades while it hides it from the camera) */
  update(tick: number, dt: number, kart: Eye | null = null): void {
    for (const p of this.pieces) p.update(tick, dt, kart);
  }

  /** The sheets' current opacity (QA, e2e). */
  get sheetAlpha(): number[] {
    return this.sheets.map((m) => m.opacity);
  }

  private readonly sheets: Material[] = [];

  private mesh(g: GeoBuilder, mat: Material, name: string): Mesh {
    const m = new Mesh(g.build(), mat);
    m.name = name;
    this.group.add(m);
    return m;
  }

  private toon(extra: Record<string, unknown> = {}): Material {
    const m = toonMaterial({ vertexColors: true, ...extra });
    this.mats.push(m);
    return m;
  }

  private make(p: HazardPlace): Piece | null {
    switch (p.kind) {
      case 'roomba':
        return this.roomba(p);
      case 'laundry':
        return this.laundry(p);
      case 'milk':
        return this.milk(p);
      case 'toaster':
        return this.toaster(p);
      case 'steam':
        return this.steam(p);
      case 'drum':
        return this.drum(p);
    }
    return null;
  }

  private roomba(p: HazardPlace): Piece {
    const g = new GeoBuilder();
    const r = ROOMBA.radius;
    g.cylUp(r, r, 0.28, 18, 0x3a3f4a, {}, { vary: 0.01 });
    g.cylUp(r * 0.92, r * 0.95, 0.06, 18, 0xe9edf2, { y: 0.28 }, { vary: 0 });
    g.torus(r * 0.98, 0.05, 0x2a2e36, { y: 0.14, rx: Math.PI / 2 }, { vary: 0 }, 4, 18);
    // bumper at the front (+z) and a button on top
    g.box(r * 1.2, 0.16, 0.12, 0x5a6270, { z: r * 0.88, y: 0.16 }, { vary: 0 });
    g.cylUp(0.16, 0.16, 0.05, 10, 0x9aa3b0, { y: 0.34, z: -0.1 }, { vary: 0 });
    // side brushes
    for (const s of [-1, 1]) g.box(0.5, 0.02, 0.06, 0xd8c070, { x: s * r * 0.6, z: r * 0.7, y: 0.03, ry: s * 0.6 }, { vary: 0 });
    const body = this.mesh(g, this.toon(), 'hz-roomba');
    const lightMat = new MeshBasicMaterial({ color: 0x3cff8a, toneMapped: false });
    this.mats.push(lightMat);
    const lg = new GeoBuilder();
    lg.sphere(0.08, 0xffffff, { y: 0.36, z: 0.3 }, { vary: 0 }, 6, 4);
    const light = new Mesh(lg.build(), lightMat);
    body.add(light);
    let t = 0;
    return {
      place: p,
      update(tick, dt) {
        t += dt;
        roombaPose(p, tick, pose);
        body.position.set(pose.x, p.y, pose.z);
        body.rotation.y = yaw(pose.fx, pose.fz);
        light.visible = Math.sin(t * 9) > -0.2;
      },
    };
  }

  private laundry(p: HazardPlace): Piece {
    const rx = -p.tz;
    const rz = p.tx;
    const hw = p.halfW + 2.2;
    const top = 3.4;
    // two poles at the road's edges and the washing line between them
    const g = new GeoBuilder();
    for (const s of [-1, 1]) {
      g.cylUp(0.14, 0.18, top + 0.2, 8, 0xc9b8a6, { x: p.x + rx * hw * s, y: p.y, z: p.z + rz * hw * s });
      g.cylUp(0.45, 0.5, 0.25, 10, 0x8a7a6a, { x: p.x + rx * hw * s, y: p.y, z: p.z + rz * hw * s });
    }
    const ry = yaw(rx, rz);
    g.box(0.05, 0.05, hw * 2, 0xf5f0e8, { x: p.x, y: p.y + top, z: p.z, ry }, { vary: 0 });
    // pegs along the line
    for (let k = -4; k <= 4; k++) g.box(0.07, 0.2, 0.05, k % 2 ? 0xff8fb1 : 0x9fd3ff, { x: p.x + rx * k * 1.3, y: p.y + top - 0.08, z: p.z + rz * k * 1.3, ry }, { vary: 0 });
    this.mesh(g, this.toon(), 'hz-laundry-line');
    // the sheet: a striped quilt, hanging from the line
    const sw = sheetHalfWidth(p) * 2;
    const sh = top - 0.35;
    const sg = new GeoBuilder();
    const rows = 6;
    for (let k = 0; k < rows; k++) {
      const h = sh / rows;
      sg.box(sw, h, 0.06, k % 2 ? 0xfff3dc : p.id % 2 ? 0xff8fb1 : 0x9fd3ff, { y: -h * (k + 0.5) }, { vary: 0.01 });
    }
    sg.box(sw + 0.1, 0.12, 0.1, 0xffffff, { y: -0.02 }, { vary: 0 });
    // alphaHash: a screen-door fade (opaque pass, no sorting) when it hides the player's kart
    const sheetMat = this.toon({ side: DoubleSide, alphaHash: true });
    this.sheets.push(sheetMat);
    const sheet = new Mesh(sg.build(), sheetMat);
    sheet.name = 'hz-laundry-sheet';
    const pivot = new Group();
    pivot.position.set(p.x, p.y + top, p.z);
    pivot.rotation.y = ry + Math.PI / 2;
    pivot.add(sheet);
    this.group.add(pivot);
    // the camera that last drew the sheet (its position, for the sight-line test)
    const cam = new Vector3();
    let seen = false;
    sheet.onBeforeRender = (_r, _s, c) => {
      cam.setFromMatrixPosition(c.matrixWorld);
      seen = true;
    };
    const centre = new Vector3();
    let prev = 0;
    return {
      place: p,
      update(tick, dt, kart) {
        const ds = sheetOffset(p, tick);
        // the sheet slides along the line (local x = lateral) and flaps with its speed
        sheet.position.x = -ds;
        const v = ds - prev;
        prev = ds;
        sheet.rotation.x = Math.max(-0.5, Math.min(0.5, v * 6));
        let want = 1;
        if (kart && seen) {
          sheet.getWorldPosition(centre);
          if (sheetBlocksSight(cam.x, cam.z, kart.x, kart.z, centre.x, centre.z, rx, rz, sw / 2 + SHEET_FADE.margin)) want = SHEET_FADE.alpha;
        }
        const step = dt > 0 ? Math.min(1, dt / SHEET_FADE.fadeS) : 1;
        const a = sheetMat.opacity;
        sheetMat.opacity = a + Math.sign(want - a) * Math.min(Math.abs(want - a), step * (1 - SHEET_FADE.alpha));
      },
    };
  }

  private milk(p: HazardPlace): Piece {
    const g = new GeoBuilder();
    // the puddle: an irregular disc of milk, a little proud of the road
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const r0 = MILK_R * (0.82 + 0.18 * Math.sin(k * 2.7 + p.id));
      const r1 = MILK_R * (0.82 + 0.18 * Math.sin((k + 1) * 2.7 + p.id));
      g.add(triGeo(0, 0, Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1), 0xfbfdff, { x: p.x, y: p.y + 0.045, z: p.z }, { vary: 0.02 });
    }
    // a tipped-over carton at the road's edge, and a few drops
    const side = p.side || 1;
    const ex = p.x + -p.tz * (p.halfW + 1.2 - Math.abs(p.d)) * side;
    const ez = p.z + p.tx * (p.halfW + 1.2 - Math.abs(p.d)) * side;
    g.box(0.9, 0.9, 1.6, 0xffffff, { x: ex, y: p.y + 0.45, z: ez, ry: 0.6 + p.id, rz: Math.PI / 2 }, { vary: 0 });
    g.box(0.92, 0.5, 0.9, 0x3aa8ff, { x: ex, y: p.y + 0.45, z: ez, ry: 0.6 + p.id, rz: Math.PI / 2 }, { vary: 0 });
    for (let k = 0; k < 5; k++) g.sphere(0.18, 0xffffff, { x: p.x + Math.cos(k * 1.9) * (MILK_R + 0.6), y: p.y + 0.05, z: p.z + Math.sin(k * 1.9) * (MILK_R + 0.6), sy: 0.3 }, { vary: 0 }, 6, 3);
    this.mesh(g, this.toon({ emissive: 0x404850 }), 'hz-milk');
    return { place: p, update() {} };
  }

  private toaster(p: HazardPlace): Piece {
    const rx = -p.tz;
    const rz = p.tx;
    const ry = yaw(p.tx, p.tz);
    // the toaster's slots are set into the road (the karts drive over them); its chrome body sits at the edge
    const g = new GeoBuilder();
    g.box(3.4, 0.08, 3.4, 0x9aa3ad, { x: p.x, y: p.y + 0.02, z: p.z, ry }, { vary: 0 });
    for (const s of [-0.7, 0.7]) g.box(0.5, 0.1, 2.6, 0x1c1c22, { x: p.x + rx * s, y: p.y + 0.04, z: p.z + rz * s, ry }, { vary: 0 });
    const side = p.side || 1;
    const bx = p.x + rx * (p.halfW + 3.5 - Math.abs(p.d)) * side;
    const bz = p.z + rz * (p.halfW + 3.5 - Math.abs(p.d)) * side;
    g.boxUp(4.2, 3.2, 3, 0xd7dde3, { x: bx, y: p.y, z: bz, ry }, { vary: 0.02 });
    g.box(4.3, 0.25, 3.1, 0xb0b8c2, { x: bx, y: p.y + 3.2, z: bz, ry }, { vary: 0 });
    g.box(0.5, 1.4, 0.3, 0x2a1a22, { x: bx + p.tx * 1.6, y: p.y + 1.8, z: bz + p.tz * 1.6, ry }, { vary: 0 });
    this.mesh(g, this.toon(), 'hz-toaster');
    // glowing slots (telegraph)
    const glowMat = new MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.mats.push(glowMat);
    const gg = new GeoBuilder();
    for (const s of [-0.7, 0.7]) gg.box(0.42, 0.04, 2.5, 0xffffff, { x: p.x + rx * s, y: p.y + 0.1, z: p.z + rz * s, ry }, { vary: 0 });
    const slots = new Mesh(gg.build(), glowMat);
    this.group.add(slots);
    // smoke and two slices of toast
    const smokeMat = new MeshBasicMaterial({ color: 0xe8e2da, transparent: true, opacity: 0.5, depthWrite: false });
    this.mats.push(smokeMat);
    const sm = new GeoBuilder();
    for (let k = 0; k < 4; k++) sm.ico(0.5 + k * 0.12, 0xffffff, { x: Math.sin(k * 2.1) * 0.5, y: k * 0.7, z: Math.cos(k * 2.1) * 0.5 }, { vary: 0 }, 0);
    const smoke = new Mesh(sm.build(), smokeMat);
    smoke.position.set(p.x, p.y, p.z);
    this.group.add(smoke);
    const tg = new GeoBuilder();
    for (const s of [-0.7, 0.7]) {
      tg.box(0.35, 1.6, 2.1, 0xd9a35c, { x: s, y: 0 }, { vary: 0.05 });
      tg.box(0.37, 0.2, 2.2, 0x8a5a2c, { x: s, y: 0.8 }, { vary: 0 });
    }
    const toast = new Mesh(tg.build(), this.toon());
    toast.rotation.y = ry;
    this.group.add(toast);
    return {
      place: p,
      update(tick) {
        const st = toasterState(p, tick);
        const u = (((tick + p.phase) % p.period) + p.period) % p.period;
        const tele = st === 1 ? (u - (p.period - TOASTER.telegraph)) / TOASTER.telegraph : 0;
        glowMat.opacity = st === 1 ? 0.35 + 0.6 * tele * (0.6 + 0.4 * Math.sin(tick * 0.9)) : st === 2 ? 1 : 0;
        smoke.visible = st === 1;
        smoke.scale.setScalar(0.6 + tele * 0.8);
        smoke.position.y = p.y + 0.3 + tele * 1.5;
        // toast flies up for ~0.8 s after the pop
        const air = u / 60;
        toast.visible = air < 0.9;
        const h = air < 0.9 ? 9 * air - 0.5 * 22 * air * air : 0;
        toast.position.set(p.x, p.y + Math.max(0, h) + 0.5, p.z);
        toast.rotation.x = air * 6;
      },
    };
  }

  private steam(p: HazardPlace): Piece {
    // a chimney vent in the road and the steam column above it
    const g = new GeoBuilder();
    g.cylUp(1.4, 1.6, 0.35, 12, 0x6b5a50, { x: p.x, y: p.y, z: p.z }, { vary: 0.02 });
    g.cylUp(1.0, 1.0, 0.38, 12, 0x2a2230, { x: p.x, y: p.y + 0.01, z: p.z }, { vary: 0 });
    for (let k = 0; k < 6; k++) g.box(2.2, 0.06, 0.12, 0x9a8a80, { x: p.x, y: p.y + 0.4, z: p.z, ry: (k * Math.PI) / 6 }, { vary: 0 });
    this.mesh(g, this.toon(), 'hz-steam-vent');
    const mat = new MeshBasicMaterial({ color: 0xf2f0ff, transparent: true, opacity: 0.55, depthWrite: false });
    const puffMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending });
    this.mats.push(mat, puffMat);
    const cg = new GeoBuilder();
    for (let k = 0; k < 6; k++) cg.ico(1 + k * 0.35, 0xffffff, { x: Math.sin(k * 1.7) * 0.6, y: 0.8 + k * 1.1, z: Math.cos(k * 1.7) * 0.6 }, { vary: 0 }, 0);
    const column = new Mesh(cg.build(), mat);
    column.position.set(p.x, p.y, p.z);
    this.group.add(column);
    const pg = new GeoBuilder();
    for (let k = 0; k < 3; k++) pg.ico(0.45, 0xffffff, { x: Math.sin(k * 2.1) * 0.7, y: 0.6 + k * 0.5, z: Math.cos(k * 2.1) * 0.7 }, { vary: 0 }, 0);
    const puffs = new Mesh(pg.build(), puffMat);
    puffs.position.set(p.x, p.y, p.z);
    this.group.add(puffs);
    const half = steamOn(p);
    return {
      place: p,
      update(tick) {
        const st = steamState(p, tick);
        const u = (((tick + p.phase) % p.period) + p.period) % p.period;
        column.visible = st === 2;
        if (st === 2) {
          const grow = Math.min(1, u / 10) * Math.min(1, (half - u) / 12 + 0.2);
          column.scale.set(STEAM.radius / 3 + 0.4, Math.max(0.05, grow), STEAM.radius / 3 + 0.4);
          column.rotation.y = tick * 0.05;
        }
        puffs.visible = st === 1;
        if (st === 1) {
          const k = (u - (p.period - STEAM.telegraph)) / STEAM.telegraph;
          puffs.position.y = p.y + ((tick * 0.08) % 1.5);
          puffs.scale.setScalar(0.6 + k * 0.8);
        }
      },
    };
  }

  private drum(p: HazardPlace): Piece {
    // a washing-machine drum lying along the road: the karts drive through it; its ribs push them sideways
    const R = p.halfW + 2.6;
    const L = DRUM.halfLen * 2;
    const g = new GeoBuilder();
    const seg = 20;
    for (let k = 0; k < seg; k++) {
      // a 250° shell: the open side turns with the drum, so you see it spin (and see out of it)
      if (k >= 14) continue;
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      // the drum's skin (perforated look: alternate shades)
      g.add(cylPatch(R, a0, a1, L), k % 2 ? 0xc7cfe0 : 0xb7c0d4, {}, { vary: 0.02 });
    }
    // ribs along the inside, one of them red (it shows which way the next push goes)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      g.box(0.5, 0.5, L, k === 0 ? 0xff3ea5 : 0xffffff, { x: Math.cos(a) * (R - 0.25), y: Math.sin(a) * (R - 0.25) }, { vary: 0 });
    }
    // the door ring at both ends
    for (const s of [-1, 1]) g.torus(R, 0.35, 0x9aa3b0, { z: (s * L) / 2 }, { vary: 0 }, 6, 28);
    const mat = this.toon({ side: DoubleSide });
    const drum = new Mesh(g.build(), mat);
    drum.name = 'hz-drum';
    const pivot = new Group();
    // the drum's axis runs along the road; its lowest point sits under the road surface
    pivot.position.set(p.x, p.y + R - 1.2, p.z);
    pivot.rotation.y = yaw(p.tx, p.tz);
    pivot.add(drum);
    this.group.add(pivot);
    // arrows on the road: which way the drum pushes now (pink right, blue left)
    const arrowMat = new MeshBasicMaterial({ color: 0xff3ea5, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, side: DoubleSide });
    this.mats.push(arrowMat);
    const ag = new GeoBuilder();
    for (let k = -2; k <= 2; k++) {
      ag.add(triGeo(-1.2, -0.7, 1.2, 0, -1.2, 0.7), 0xffffff, { z: k * 3, y: 0.06 }, { vary: 0 });
    }
    const arrows = new Mesh(ag.build(), arrowMat);
    pivot.add(arrows);
    arrows.position.y = -(R - 1.2);
    const pink = new Color(0xff3ea5);
    const blue = new Color(0x3aa8ff);
    return {
      place: p,
      update(tick) {
        drum.rotation.z = drumAngle(p, tick);
        const a = drumPush(p, tick);
        // local +x of the pivot is the road's left (yaw maps +z to the tangent), so a push to the right flips it
        arrows.scale.x = a >= 0 ? -1 : 1;
        arrowMat.color.copy(a >= 0 ? pink : blue);
        arrowMat.opacity = 0.25 + 0.6 * Math.min(1, Math.abs(a) / DRUM.accel);
      },
    };
  }

  dispose(): void {
    // geometries go with the world group (disposeGroup); materials created here are shared by nothing else
    for (const m of this.mats) m.dispose();
    this.pieces.length = 0;
  }
}

/** One flat triangle in the XZ plane (y up), wound to face up. */
function triGeo(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): BufferGeometry {
  return new BufferGeometry().setFromPoints([new Vector3(ax, 0, az), new Vector3(cx, 0, cz), new Vector3(bx, 0, bz)]);
}

/** A patch of a cylinder's skin round the z axis, angles a0..a1, length L (centred). */
function cylPatch(R: number, a0: number, a1: number, L: number): BufferGeometry {
  const p = (a: number, z: number) => new Vector3(Math.cos(a) * R, Math.sin(a) * R, z);
  return new BufferGeometry().setFromPoints([p(a0, -L / 2), p(a1, -L / 2), p(a1, L / 2), p(a0, -L / 2), p(a1, L / 2), p(a0, L / 2)]);
}
