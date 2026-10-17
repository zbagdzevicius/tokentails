/**
 * Room themes (RoomDef.theme): static decorations merged into the room mesh (zero extra draw calls) and the
 * shared garland path that dynamics.ts strings its twinkling lights on. Seasonal looks (GDD 8, S1 "Deck the Halls"):
 * xmas (tinsel garland, wreath, snow on the sill, lights), birthday (bunting, balloon clusters), wedding (white
 * flower garland, petals, bows), nye (gold stars, streamers, balloons, floor confetti), valentine (hearts),
 * thanksgiving (leaf garland, pumpkins), spring (flower garland, tulips, butterflies). Rules never change.
 */
import { CELL_M, type PlayableRoom, type RoomTheme } from '../../types';
import { GeoBuilder, hash01, type Xf } from '../geo';
import { PAL, mixHex, shadeHex } from '../palette';
import { WALL_H, windowSpan } from './layout';

export function roomTheme(play: PlayableRoom): RoomTheme {
  return play.room.theme ?? 'default';
}

/** A point on the garland path with the wall it hangs on (for orienting flat decorations). */
export interface GarlandPoint {
  x: number;
  y: number;
  z: number;
  wall: 'back' | 'west';
}

/**
 * Garland path: swags along the top of the back wall and the west wall. `n` points per metre. Deterministic, used by
 * both the static garland and the animated light bulbs.
 */
export function garlandPath(play: PlayableRoom, perMetre = 6, drop = 0): GarlandPoint[] {
  const halfW = (play.shell.width * CELL_M) / 2;
  const halfD = (play.shell.depth * CELL_M) / 2;
  const out: GarlandPoint[] = [];
  const top = WALL_H - 0.16 - drop;
  const swag = 0.16;
  const backLen = halfW * 2 - 0.2;
  const nb = Math.max(4, Math.round(backLen * perMetre));
  const swagsB = Math.max(2, Math.round(backLen / 1.2));
  for (let i = 0; i <= nb; i++) {
    const t = i / nb;
    out.push({ x: -halfW + 0.1 + t * backLen, y: top - swag * Math.abs(Math.sin(Math.PI * t * swagsB)), z: -halfD + 0.05, wall: 'back' });
  }
  const sideLen = halfD * 2 - 0.3;
  const ns = Math.max(4, Math.round(sideLen * perMetre));
  const swagsS = Math.max(2, Math.round(sideLen / 1.2));
  for (let i = 1; i <= ns; i++) {
    const t = i / ns;
    out.push({ x: -halfW + 0.05, y: top - swag * Math.abs(Math.sin(Math.PI * t * swagsS)), z: -halfD + 0.1 + t * sideLen, wall: 'west' });
  }
  return out;
}

/** Yaw that turns a flat decoration (facing local +z) away from its wall into the room. */
function wallYaw(p: GarlandPoint): number {
  return p.wall === 'back' ? 0 : Math.PI / 2;
}

/** Chunky heart (two lobes and a point), facing +z, centred at t. */
export function addHeart(g: GeoBuilder, size: number, color: number, t: Xf): void {
  const ry = t.ry ?? 0;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const px = (lx: number) => (t.x ?? 0) + lx * c;
  const pz = (lx: number) => (t.z ?? 0) - lx * s;
  const y = t.y ?? 0;
  const seg = size > 0.1 ? 8 : 6;
  g.sphere(size * 0.55, color, { x: px(-size * 0.42), y: y + size * 0.2, z: pz(-size * 0.42), ry, sz: 0.45 }, { vary: 0.02 }, seg, seg - 2);
  g.sphere(size * 0.55, color, { x: px(size * 0.42), y: y + size * 0.2, z: pz(size * 0.42), ry, sz: 0.45 }, { vary: 0.02 }, seg, seg - 2);
  g.cone(size * 0.86, size * 1.05, 4, color, { x: t.x, y: y - size * 0.38, z: t.z, rx: Math.PI, ry: ry + Math.PI / 4, sz: 0.35, sx: 1 }, { vary: 0.02 });
}

function balloon(g: GeoBuilder, x: number, y: number, z: number, r: number, color: number, anchorY: number): void {
  g.sphere(r, color, { x, y, z, sy: 1.18 }, { vary: 0.02 }, 8, 6);
  g.cone(r * 0.2, r * 0.25, 5, shadeHex(color, 0.85), { x, y: y - r * 1.2, z, rx: Math.PI });
  g.sphere(r * 0.22, mixHex(color, 0xffffff, 0.7), { x: x - r * 0.35, y: y + r * 0.45, z: z + r * 0.55, sz: 0.4 }, { vary: 0 }, 5, 4);
  const len = y - r * 1.3 - anchorY;
  if (len > 0.02) g.boxUp(0.006, len, 0.006, 0xf6f6f6, { x, y: anchorY, z }, { vary: 0 });
}

function balloonCluster(g: GeoBuilder, x: number, z: number, colors: number[], seed: number): void {
  g.boxUp(0.08, 0.06, 0.08, 0xe8b04a, { x, y: 0, z }, { aoFloor: 0 });
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4 + seed;
    const r = 0.11 + hash01(seed * 31 + i) * 0.03;
    balloon(g, x + Math.cos(a) * 0.12, 1.35 + (i % 3) * 0.17 + hash01(seed + i) * 0.08, z + Math.sin(a) * 0.12, r, colors[i % colors.length], 0.06);
  }
}

function flowerPot(g: GeoBuilder, x: number, z: number, color: number, flower: number): void {
  g.cylUp(0.09, 0.07, 0.16, 8, color, { x, y: 0, z }, { aoFloor: 0 });
  g.cylUp(0.08, 0.08, 0.01, 8, 0x5a3b2a, { x, y: 0.15, z });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const fx = x + Math.cos(a) * 0.04;
    const fz = z + Math.sin(a) * 0.04;
    g.cylUp(0.006, 0.006, 0.2 + (i % 2) * 0.05, 4, PAL.leafDark, { x: fx, y: 0.16, z: fz });
    g.cone(0.035, 0.07, 5, i % 2 ? flower : mixHex(flower, 0xffffff, 0.4), { x: fx, y: 0.39 + (i % 2) * 0.05, z: fz, rx: Math.PI });
  }
  g.cone(0.03, 0.14, 4, PAL.leaf, { x: x + 0.05, y: 0.24, z, rz: -0.4, sz: 0.4 });
}

function pumpkin(g: GeoBuilder, x: number, z: number, r: number): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.sphere(r * 0.6, i % 2 ? 0xf28c28 : 0xe76f51, { x: x + Math.cos(a) * r * 0.35, y: r * 0.55, z: z + Math.sin(a) * r * 0.35, sy: 0.9 }, { aoFloor: 0 }, 7, 5);
  }
  g.cylUp(0.012, 0.016, r * 0.4, 5, 0x6b4a2e, { x, y: r * 1.0, z, rz: 0.3 });
  g.cone(0.04, 0.08, 4, PAL.leaf, { x: x + 0.04, y: r * 1.15, z, rz: -1.2, sz: 0.3 });
}

/** Static theme decorations, merged into the room mesh. */
export function addThemeDecor(g: GeoBuilder, play: PlayableRoom): void {
  const theme = roomTheme(play);
  if (theme === 'default') return;
  const halfW = (play.shell.width * CELL_M) / 2;
  const halfD = (play.shell.depth * CELL_M) / 2;
  const win = windowSpan(play.shell);
  const path = garlandPath(play, 7);
  const hasArch = play.shell.furniture.some((f) => f.type === 'arch');

  switch (theme) {
    case 'xmas': {
      // fluffy tinsel garland with gold and red baubles
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        g.ico(0.055, i % 2 ? 0x2f8f4e : 0x3fa35f, { x: p.x, y: p.y, z: p.z, ry: i }, { vary: 0.08 });
        if (i % 4 === 2) g.sphere(0.03, i % 8 === 2 ? 0xe63946 : 0xffc93c, { x: p.x + (p.wall === 'west' ? 0.03 : 0), y: p.y - 0.06, z: p.z + (p.wall === 'back' ? 0.03 : 0) }, { vary: 0 }, 6, 4);
      }
      // wreath on the west wall
      const wz = -halfD + Math.min(halfD * 2 - 0.6, 1.1);
      g.torus(0.2, 0.06, 0x2f8f4e, { x: -halfW + 0.05, y: 1.65, z: wz, ry: Math.PI / 2 }, { vary: 0.1 }, 5, 14);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.sphere(0.025, 0xe63946, { x: -halfW + 0.1, y: 1.65 + Math.sin(a) * 0.2, z: wz + Math.cos(a) * 0.2 }, { vary: 0 }, 5, 4);
      }
      g.cone(0.07, 0.12, 3, 0xe63946, { x: -halfW + 0.1, y: 1.42, z: wz - 0.05, rx: Math.PI / 2, ry: Math.PI / 2, sz: 0.3 });
      g.cone(0.07, 0.12, 3, 0xe63946, { x: -halfW + 0.1, y: 1.42, z: wz + 0.05, rx: -Math.PI / 2, ry: Math.PI / 2, sz: 0.3 });
      // snow drift on the window sill
      g.boxUp(win.w + 0.1, 0.04, 0.09, 0xffffff, { x: win.mid, y: 1.0, z: -halfD + 0.03 }, { vary: 0.02 });
      for (let i = 0; i < 5; i++) g.sphere(0.04, 0xffffff, { x: win.a + (i + 0.5) * (win.w / 5), y: 1.05, z: -halfD + 0.04, sy: 0.5 }, { vary: 0 }, 6, 4);
      break;
    }
    case 'birthday': {
      const cols = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff8fab];
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        g.cone(0.07, 0.15, 3, cols[i % cols.length], { x: p.x, y: p.y - 0.08, z: p.z, rx: Math.PI, ry: wallYaw(p), sz: 0.18 }, { vary: 0 });
      }
      balloonCluster(g, halfW - 0.35, -halfD + 0.35, [0xff595e, 0xffca3a, 0x1982c4, 0xff8fab, 0x8ac926], 3);
      balloonCluster(g, -halfW + 0.3, halfD - 0.5, [0x6a4c93, 0xff8fab, 0xffca3a, 0x8ac926, 0xff595e], 7);
      break;
    }
    case 'wedding': {
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        g.ico(0.045, i % 3 === 0 ? 0xffafcc : 0xffffff, { x: p.x, y: p.y, z: p.z }, { vary: 0.03 });
        if (i % 3 === 1) g.ico(0.03, PAL.leaf, { x: p.x, y: p.y - 0.04, z: p.z });
      }
      // bows on the walls
      for (const [x, z, ry] of [
        [-halfW * 0.5, -halfD + 0.04, 0],
        [halfW * 0.5, -halfD + 0.04, 0],
        [-halfW + 0.04, 0, Math.PI / 2],
      ] as const) {
        g.cone(0.08, 0.14, 3, 0xffffff, { x, y: 2.0, z, rz: Math.PI / 2, ry, sz: 0.3 });
        g.cone(0.08, 0.14, 3, 0xffffff, { x, y: 2.0, z, rz: -Math.PI / 2, ry, sz: 0.3 });
        g.boxUp(0.03, 0.4, 0.01, 0xffffff, { x, y: 1.62, z, ry, rz: 0.1 }, { vary: 0 });
      }
      // a simple white arch drawn on the back wall when the shell has none
      if (!hasArch) {
        const r = 0.55;
        const cx = win.mid;
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI;
          g.ico(0.05, i % 2 ? 0xffffff : 0xffd6e0, { x: cx + Math.cos(a) * (win.w / 2 + 0.25), y: 1.5 + Math.sin(a) * r, z: -halfD + 0.05 });
        }
      }
      // petals on the floor (deterministic)
      for (let i = 0; i < 60; i++) {
        const x = (hash01(i * 3 + 1) - 0.5) * (halfW * 2 - 0.4);
        const z = (hash01(i * 3 + 2) - 0.2) * (halfD * 1.6);
        g.quad(0.035, 0.025, i % 3 ? 0xffc2d6 : 0xffffff, { x, y: 0.004, z, ry: hash01(i * 7) * 6 }, { vary: 0 });
      }
      break;
    }
    case 'nye': {
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (i % 2 === 0) g.cone(0.05, 0.02, 5, i % 4 ? 0xffd166 : 0xdfe6ee, { x: p.x, y: p.y, z: p.z, rx: Math.PI / 2, ry: wallYaw(p) }, { vary: 0 });
        else g.sphere(0.02, 0xffd166, { x: p.x, y: p.y + 0.01, z: p.z }, { vary: 0 }, 5, 4);
      }
      // streamers hanging from the wall top
      const sc = [0xffd166, 0xc0c7d1, 0x9b5de5, 0xf15bb5];
      for (let i = 0; i < 9; i++) {
        const x = -halfW + 0.3 + (i / 8) * (halfW * 2 - 0.6);
        if (x > win.a - 0.1 && x < win.b + 0.1) continue;
        for (let k = 0; k < 6; k++) g.boxUp(0.02, 0.08, 0.005, sc[i % sc.length], { x: x + (k % 2 ? 0.015 : -0.015), y: WALL_H - 0.12 - k * 0.08, z: -halfD + 0.04, rz: k % 2 ? 0.4 : -0.4 }, { vary: 0 });
      }
      balloonCluster(g, halfW - 0.35, -halfD + 0.35, [0xffd166, 0xc0c7d1, 0xffffff, 0xf15bb5, 0xffd166], 5);
      // floor confetti
      const cc = [0xffd166, 0xf15bb5, 0x00bbf9, 0x9b5de5, 0xffffff];
      for (let i = 0; i < 70; i++) {
        const x = (hash01(i * 5 + 11) - 0.5) * (halfW * 2 - 0.3);
        const z = (hash01(i * 5 + 12) - 0.5) * (halfD * 2 - 0.3);
        g.quad(0.03, 0.018, cc[i % cc.length], { x, y: 0.004, z, ry: hash01(i * 9) * 6 }, { vary: 0 });
      }
      break;
    }
    case 'valentine': {
      for (let i = 0; i < path.length; i += 2) {
        const p = path[i];
        addHeart(g, 0.06, i % 4 ? 0xff4d8d : 0xffc2d6, { x: p.x, y: p.y - 0.04, z: p.z + (p.wall === 'back' ? 0.02 : 0), ry: wallYaw(p) });
      }
      addHeart(g, 0.22, 0xff4d8d, { x: -halfW + 0.06, y: 1.55, z: -halfD + Math.min(halfD * 2 - 0.6, 1.1), ry: Math.PI / 2 });
      addHeart(g, 0.12, 0xffc2d6, { x: -halfW + 0.06, y: 1.9, z: -halfD + Math.min(halfD * 2 - 0.6, 1.1) + 0.35, ry: Math.PI / 2 });
      balloonCluster(g, halfW - 0.35, -halfD + 0.35, [0xff4d8d, 0xffc2d6, 0xff4d8d, 0xffffff, 0xff8fab], 9);
      break;
    }
    case 'thanksgiving': {
      const lc = [0xe76f51, 0xf4a261, 0xe9c46a, 0xbc6c25];
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        g.cone(0.05, 0.1, 4, lc[i % lc.length], { x: p.x, y: p.y, z: p.z, rz: (i % 2 ? 1 : -1) * 0.6, ry: wallYaw(p), sz: 0.25 }, { vary: 0.04 });
      }
      pumpkin(g, halfW - 0.3, -halfD + 0.3, 0.14);
      pumpkin(g, halfW - 0.55, -halfD + 0.25, 0.09);
      pumpkin(g, -halfW + 0.28, halfD - 0.4, 0.11);
      break;
    }
    case 'spring': {
      const fc = [0xff8fab, 0xffd23f, 0xc77dff, 0xffffff];
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        g.ico(i % 2 ? 0.04 : 0.03, i % 2 ? fc[(i >> 1) % fc.length] : PAL.leaf, { x: p.x, y: p.y, z: p.z });
      }
      flowerPot(g, halfW - 0.3, -halfD + 0.3, 0xc96f4a, 0xff8fab);
      flowerPot(g, -halfW + 0.28, halfD - 0.4, 0x7fb0e0, 0xffd23f);
      // butterflies on the walls
      for (const [x, y, z, ry, col] of [
        [-halfW * 0.4, 1.7, -halfD + 0.03, 0, 0xffd23f],
        [halfW * 0.55, 1.4, -halfD + 0.03, 0, 0xc77dff],
        [-halfW + 0.03, 1.5, halfD * 0.2, Math.PI / 2, 0xff8fab],
      ] as const) {
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        for (const side of [-1, 1]) g.sphere(0.045, col, { x: x + side * 0.04 * c, y, z: z - side * 0.04 * s, ry, sz: 0.2, sy: 1.2, rz: side * 0.4 }, { vary: 0 }, 6, 4);
        g.boxUp(0.01, 0.06, 0.01, 0x3a2a2a, { x, y: y - 0.03, z, ry });
      }
      break;
    }
  }
}

/** Light-bulb positions for the twinkling string lights (xmas, nye, wedding, valentine). Empty for other themes. */
export function stringLightPoints(play: PlayableRoom): GarlandPoint[] {
  const theme = roomTheme(play);
  if (theme !== 'xmas' && theme !== 'nye' && theme !== 'wedding' && theme !== 'valentine') return [];
  return garlandPath(play, 4, 0.05);
}

/** Bulb colours per theme (the twinkle cycles through them). */
export function stringLightColors(theme: RoomTheme): number[] {
  switch (theme) {
    case 'xmas':
      return [0xff4d4d, 0x5cff7a, 0xffd166, 0x4dabff];
    case 'nye':
      return [0xffd166, 0xffffff, 0xf15bb5];
    case 'valentine':
      return [0xff4d8d, 0xffc2d6];
    default:
      return [0xfff3c4, 0xffe9a8];
  }
}
