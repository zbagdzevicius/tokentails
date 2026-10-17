/**
 * Shared room layout maths for the static room (room-view.ts) and the animated world (dynamics.ts): where a
 * furniture piece sits and which way it faces, where the window and the door are cut into the walls. Pure (no
 * WebGL), so both modules agree on every position without talking to each other.
 */
import { CELL_M, type FurniturePiece, type ShellDef } from '../../types';
import { levelY } from '../space';

export const WALL_H = 2.4;
export const WALL_T = 0.1;
export const WIN_Y0 = 1.05;
export const WIN_Y1 = 1.95;

/** Frame of a furniture piece: world centre, size, top height and the side that faces the room. */
export interface PieceFrame {
  cx: number;
  cz: number;
  /** size along x / z in metres */
  sw: number;
  sd: number;
  /** top surface height (m) */
  H: number;
  /** +z: against the back wall (or free standing), x: against the west wall, -x: against the east edge */
  front: 'z' | 'x' | '-x';
  fx: number;
  fz: number;
  /** length of the front face and depth behind it */
  along: number;
  depth: number;
}

/** Which side of a piece faces the room: +z (against the back wall or an island), ±x on side walls. */
export function frontOf(p: FurniturePiece, w: number): 'z' | 'x' | '-x' {
  if (p.z === 0) return 'z';
  if (p.x === 0) return 'x';
  if (p.x + p.w >= w) return '-x';
  return 'z';
}

export function pieceFrame(p: FurniturePiece, W: number, D: number): PieceFrame {
  const front = frontOf(p, W);
  const sw = p.w * CELL_M;
  const sd = p.d * CELL_M;
  return {
    cx: (p.x + p.w / 2 - W / 2) * CELL_M,
    cz: (p.z + p.d / 2 - D / 2) * CELL_M,
    sw,
    sd,
    H: levelY(p.level),
    front,
    fx: front === 'x' ? 1 : front === '-x' ? -1 : 0,
    fz: front === 'z' ? 1 : 0,
    along: front === 'z' ? sw : sd,
    depth: front === 'z' ? sd : sw,
  };
}

/**
 * World point on a piece's face: u along the front face (from its centre), out = distance in front of the
 * piece's centre plane along the facing direction (depth / 2 = the front face). Writes into `out`.
 */
export function facePoint(f: PieceFrame, u: number, out: number, res: { x: number; z: number }): { x: number; z: number } {
  if (f.fz) {
    res.x = f.cx + u;
    res.z = f.cz + out;
  } else {
    res.x = f.cx + out * f.fx;
    res.z = f.cz - u * f.fx;
  }
  return res;
}

/** Window span on the back wall (x range in metres). */
export function windowSpan(sh: ShellDef): { a: number; b: number; mid: number; w: number } {
  const W = sh.width;
  const win = sh.furniture.find((f) => f.type === 'window');
  const a = win ? (win.x - W / 2) * CELL_M : -0.6;
  const b = win ? (win.x + Math.max(2, win.w) - W / 2) * CELL_M : 0.6;
  return { a, b, mid: (a + b) / 2, w: b - a };
}

/** Door the human leaves through (from the room event spot) on the back or west wall, or a 'door' piece. */
export function doorSpan(sh: ShellDef): { axis: 'x' | 'z'; a: number; b: number } | null {
  const W = sh.width;
  const D = sh.depth;
  const win = windowSpan(sh);
  const piece = sh.furniture.find((f) => f.type === 'door' && (f.z === 0 || f.x === 0));
  if (piece) {
    if (piece.z === 0) {
      const a = (piece.x - W / 2) * CELL_M + 0.05;
      const b = (piece.x + Math.max(2, piece.w) - W / 2) * CELL_M - 0.05;
      if (b < win.a || a > win.b) return { axis: 'x', a, b };
    } else {
      const a = (piece.z - D / 2) * CELL_M + 0.05;
      const b = (piece.z + Math.max(2, piece.d) - D / 2) * CELL_M - 0.05;
      return { axis: 'z', a, b };
    }
  }
  const ev = sh.humanEventSpot;
  if (ev.z < 0 && ev.x >= 0 && ev.x < W) {
    const a = (ev.x - 1 - W / 2) * CELL_M + 0.1;
    const b = (ev.x + 2 - W / 2) * CELL_M - 0.1;
    if (b < win.a || a > win.b) return { axis: 'x', a, b };
  } else if (ev.x < 0 && ev.z >= 0 && ev.z < D) {
    const a = (ev.z - 1 - D / 2) * CELL_M + 0.1;
    const b = (ev.z + 2 - D / 2) * CELL_M - 0.1;
    return { axis: 'z', a, b };
  }
  return null;
}
