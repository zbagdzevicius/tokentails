/**
 * Living Room Rug dressing (props only, a lazy chunk): the battle arena's room. Plank floor round the rug; the cover
 * that the sim treats as solid (`BuiltTrack.blocks`: the coffee table, the sofa, the armchair, the cat tree, the
 * plant pot) drawn at exactly those spots; walls with a window, a TV unit and shelves; a floor lamp. One merged toon
 * mesh.
 */
import { DoubleSide, Group, Mesh } from 'three';
import type { BuiltTrack } from '../build';
import type { Theme } from '../themes';
import { GeoBuilder } from '../../render/geo';
import { toonMaterial } from '../../render/toon';

const ROOM = 70;

export function dressRug(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-rug';
  const g = new GeoBuilder();

  // plank floor round the rug
  for (let x = -ROOM; x < ROOM; x += 5) g.quad(4.9, 2 * ROOM, (x / 5) % 2 ? 0xb07a4c : 0xa36f44, { x: x + 2.5, y: -0.06, z: 0 }, { vary: 0.01 });
  // walls, a window with the sky, a TV unit
  for (const [x, z, ry] of [
    [0, -ROOM, 0],
    [0, ROOM, Math.PI],
    [-ROOM, 0, Math.PI / 2],
    [ROOM, 0, -Math.PI / 2],
  ] as const)
    g.boxUp(2 * ROOM, 26, 1.5, 0xfff4e0, { x, y: 0, z, ry });
  g.boxUp(40, 14, 0.4, 0xbfe3f5, { x: 0, y: 7, z: ROOM - 1 });
  g.boxUp(41, 0.8, 1.6, 0xffffff, { x: 0, y: 6.6, z: ROOM - 1.2 });
  g.boxUp(30, 4, 5, 0x6b4a3a, { x: 0, y: 0, z: -ROOM + 3.5 });
  g.boxUp(24, 13, 0.8, 0x2a2240, { x: 0, y: 4.6, z: -ROOM + 2.4 });

  // the cover, exactly where the sim's solid props are
  const blocks = t.blocks;
  const at = (k: number) => blocks[k];
  // coffee table (the first block): round top on four legs, a mug and a book
  const table = at(0);
  if (table) {
    g.cylUp(table.r, table.r, 0.5, 18, 0x8a5e48, { x: table.x, y: 2.6, z: table.z });
    for (let k = 0; k < 4; k++) g.cylUp(0.3, 0.3, 2.6, 6, 0x6b4a3a, { x: table.x + Math.cos(k * 1.57 + 0.78) * table.r * 0.7, y: 0, z: table.z + Math.sin(k * 1.57 + 0.78) * table.r * 0.7 });
    g.cylUp(0.6, 0.5, 1, 8, theme.accent, { x: table.x + 1, y: 3.1, z: table.z });
    g.boxUp(2.2, 0.5, 1.6, 0xff8fb1, { x: table.x - 1.2, y: 3.1, z: table.z + 0.6, ry: 0.4 });
  }
  // the sofa (blocks 1–3 in a row): seat, back, arms, cushions
  const sofa = [at(1), at(2), at(3)].filter(Boolean);
  if (sofa.length === 3) {
    const cx = (sofa[0].x + sofa[2].x) / 2;
    const cz = (sofa[0].z + sofa[2].z) / 2;
    const len = Math.hypot(sofa[2].x - sofa[0].x, sofa[2].z - sofa[0].z) + sofa[0].r * 2;
    const ry = Math.atan2(sofa[2].x - sofa[0].x, sofa[2].z - sofa[0].z) + Math.PI / 2;
    const depth = sofa[0].r * 2;
    g.boxUp(len, 2.4, depth, 0x3aa8ff, { x: cx, y: 0, z: cz, ry });
    const bx = cx + Math.sin(ry) * depth * 0.45;
    const bz = cz + Math.cos(ry) * depth * 0.45;
    g.boxUp(len, 5, depth * 0.3, 0x2f8ad8, { x: bx, y: 0, z: bz, ry });
    for (const s of [-1, 1]) g.boxUp(1, 3.6, depth, 0x2f8ad8, { x: cx + Math.cos(ry) * (len / 2) * s, y: 0, z: cz - Math.sin(ry) * (len / 2) * s, ry });
    for (const s of [-1, 1]) g.boxUp(len / 2 - 0.6, 1, depth * 0.6, 0xffc93c, { x: cx + Math.cos(ry) * (len / 4) * s, y: 2.4, z: cz - Math.sin(ry) * (len / 4) * s, ry });
  }
  // armchair (block 4)
  const chair = at(4);
  if (chair) {
    g.cylUp(chair.r, chair.r, 2.4, 12, 0xff8fb1, { x: chair.x, y: 0, z: chair.z });
    g.cylUp(chair.r * 0.9, chair.r * 0.95, 4.6, 12, 0xff6fa0, { x: chair.x - 0.8, y: 0, z: chair.z - 0.8, sx: 0.5 });
  }
  // cat tree (block 5)
  const tree = at(5);
  if (tree) {
    g.cylUp(tree.r, tree.r * 1.1, 0.5, 10, 0xd9b48a, { x: tree.x, y: 0, z: tree.z });
    g.cylUp(0.6, 0.6, 9, 8, 0xc9a06a, { x: tree.x, y: 0, z: tree.z });
    for (let k = 0; k < 3; k++) g.cylUp(tree.r * (0.9 - k * 0.15), tree.r * (0.9 - k * 0.15), 0.4, 10, 0xff8fb1, { x: tree.x, y: 3 + k * 3, z: tree.z });
  }
  // plant pot (block 6)
  const pot = at(6);
  if (pot) {
    g.cylUp(pot.r, pot.r * 0.8, 2.4, 10, 0xd97b4c, { x: pot.x, y: 0, z: pot.z });
    for (let k = 0; k < 6; k++) g.sphere(1.3, 0x3bb273, { x: pot.x + Math.cos(k) * 1, y: 3.4 + (k % 3) * 0.8, z: pot.z + Math.sin(k) * 1, sx: 0.6, sy: 1.4 }, undefined, 6, 4);
  }

  // shelves and a floor lamp along the walls
  for (let k = -ROOM + 10; k < ROOM - 6; k += 22) {
    g.boxUp(12, 0.5, 3, 0x8a5e48, { x: -ROOM + 2.5, y: 9, z: k, ry: Math.PI / 2 });
    for (let b = 0; b < 4; b++) g.boxUp(1.4, 2.6, 2, [0xff8fb1, 0x9fd3ff, 0xffc93c, 0x3bb273][b], { x: -ROOM + 2.6, y: 9.5, z: k - 3 + b * 1.6 });
  }
  g.cylUp(0.3, 0.3, 14, 6, 0x2a2240, { x: ROOM - 6, y: 0, z: ROOM - 6 });
  g.cone(2.6, 3, 10, 0xfff3dc, { x: ROOM - 6, y: 14, z: ROOM - 6 });

  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'rug-props';
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
