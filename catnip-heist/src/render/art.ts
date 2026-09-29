/**
 * Level art kit: one procedural pixel-art ATLAS (256x256, 8x8 cells of 32 px, nearest filtering) and
 * ArtBuilder, which merges textured, vertex-coloured boxes into a single BufferGeometry. The whole
 * static warehouse (floor, walls, trims, pillars, props, lamps) is a handful of draw calls.
 *
 * Cells are authored in near-final colours; vertex colours add per-tile variation and room tints
 * (floor cells are neutral so a room tint colours them).
 */
import * as THREE from 'three';

export const ATLAS_CELLS = 8;
const CELL = 32;
const SIZE = ATLAS_CELLS * CELL;

/** Atlas cell index = row * 8 + col. */
export const CELLS = {
  floorA: 0, floorB: 1, floorWorn: 2, floorCrack: 3, floorOil: 4, floorGrate: 5, hazard: 6, floorLine: 7,
  brick: 8, brickVent: 9, brickPoster: 10, metalPanel: 11, wallTop: 12, pillar: 13, baseboard: 14, rug: 15,
  crateSide: 16, crateTop: 17, cardSide: 18, cardTop: 19, barrelSide: 20, barrelTop: 21, sackSide: 22, sackTop: 23,
  shelfMetal: 24, palletTop: 25, belt: 26, steel: 27, shutter: 28, vault: 29, plinth: 30, poster2: 31,
  darkMetal: 32, lampGlass: 33, white: 34, stripeTrim: 35, kibbleSack: 36, brickDark: 37, conveyorSide: 38, grass: 39,
} as const;
export type CellName = keyof typeof CELLS;

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function cellOrigin(i: number): [number, number] {
  return [(i % ATLAS_CELLS) * CELL, Math.floor(i / ATLAS_CELLS) * CELL];
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Draw into one cell with local coordinates (0..31). */
function paint(ctx: Ctx, i: number, draw: (p: (x: number, y: number, w: number, h: number, c: string) => void, rnd: () => number) => void, seed = i + 1): void {
  const [ox, oy] = cellOrigin(i);
  const p = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  draw(p, lcg(seed * 7919));
}

function speckle(p: (x: number, y: number, w: number, h: number, c: string) => void, rnd: () => number, n: number, colors: string[], x0 = 1, y0 = 1, w = 30, h = 30): void {
  for (let k = 0; k < n; k++) p(x0 + Math.floor(rnd() * w), y0 + Math.floor(rnd() * h), 1, 1, colors[Math.floor(rnd() * colors.length)]);
}

// Floor tiles are neutral light greys; room tints colour them through vertex colours.
function floorBase(p: (x: number, y: number, w: number, h: number, c: string) => void, rnd: () => number, v: number): void {
  const g = (k: number) => `rgb(${Math.round(v * k)},${Math.round(v * k * 0.97)},${Math.round(v * k * 1.04)})`;
  p(0, 0, 32, 32, g(1));
  speckle(p, rnd, 60, [g(0.94), g(0.97), g(1.03)]);
  // Bevel: light top-left, dark bottom-right, grout line.
  p(1, 1, 30, 1, g(1.08));
  p(1, 1, 1, 30, g(1.06));
  p(1, 30, 30, 1, g(0.86));
  p(30, 1, 1, 30, g(0.88));
  p(0, 31, 32, 1, g(0.62));
  p(31, 0, 1, 32, g(0.62));
  p(0, 0, 32, 1, g(0.7));
  p(0, 0, 1, 32, g(0.7));
  // Corner rivets.
  for (const [x, y] of [[3, 3], [27, 3], [3, 27], [27, 27]]) {
    p(x, y, 2, 2, g(0.8));
    p(x, y, 1, 1, g(1.1));
  }
}

let atlasTex: THREE.CanvasTexture | null = null;

/** The shared level atlas (built once). */
export function levelAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ---- floors ------------------------------------------------------------------------------
  paint(ctx, CELLS.floorA, (p, r) => floorBase(p, r, 214));
  paint(ctx, CELLS.floorB, (p, r) => {
    floorBase(p, r, 204);
    p(15, 2, 1, 28, 'rgb(170,164,182)');
    p(16, 2, 1, 28, 'rgb(222,216,232)');
  });
  paint(ctx, CELLS.floorWorn, (p, r) => {
    floorBase(p, r, 210);
    for (let k = 0; k < 14; k++) {
      const x = 6 + Math.floor(r() * 18), y = 6 + Math.floor(r() * 18);
      p(x, y, 2 + Math.floor(r() * 4), 1, 'rgb(176,168,190)');
    }
    speckle(p, r, 40, ['rgb(186,178,198)', 'rgb(232,226,240)'], 4, 4, 24, 24);
  });
  paint(ctx, CELLS.floorCrack, (p, r) => {
    floorBase(p, r, 208);
    let x = 5, y = 7;
    for (let k = 0; k < 22; k++) {
      p(x, y, 1, 1, 'rgb(120,110,136)');
      p(x + 1, y, 1, 1, 'rgb(236,230,244)');
      x += r() < 0.6 ? 1 : 0;
      y += r() < 0.7 ? 1 : 0;
      if (r() < 0.15) p(x + 1, y - 2, 1, 2, 'rgb(130,120,146)');
    }
  });
  paint(ctx, CELLS.floorOil, (p, r) => {
    floorBase(p, r, 210);
    const cx = 15 + Math.floor(r() * 4), cy = 14 + Math.floor(r() * 4);
    for (let y = -7; y <= 7; y++) for (let x = -9; x <= 9; x++) {
      const d = (x * x) / 81 + (y * y) / 49 + (r() - 0.5) * 0.25;
      if (d < 1) p(cx + x, cy + y, 1, 1, d < 0.45 ? 'rgb(150,140,172)' : 'rgb(176,168,196)');
    }
    p(cx - 3, cy - 3, 2, 1, 'rgb(170,160,196)');
  });
  paint(ctx, CELLS.floorGrate, (p, r) => {
    floorBase(p, r, 206);
    p(6, 6, 20, 20, 'rgb(70,62,86)');
    for (let k = 0; k < 5; k++) {
      p(8, 8 + k * 4, 16, 2, 'rgb(150,142,166)');
      p(8, 8 + k * 4, 16, 1, 'rgb(196,188,210)');
    }
    p(6, 6, 20, 1, 'rgb(230,224,238)');
    p(6, 25, 20, 1, 'rgb(110,100,126)');
  });
  paint(ctx, CELLS.hazard, (p) => {
    p(0, 0, 32, 32, '#2a1a24');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (((x + y) >> 3) % 2 === 0) p(x, y, 1, 1, (x + y) % 8 === 0 ? '#ffe07a' : '#ffc93c');
    p(0, 0, 32, 2, '#1a0f16');
    p(0, 30, 32, 2, '#1a0f16');
    p(0, 2, 32, 1, 'rgba(255,255,255,0.35)');
  });
  paint(ctx, CELLS.floorLine, (p, r) => {
    floorBase(p, r, 212);
    p(0, 12, 32, 8, '#ffc93c');
    p(0, 12, 32, 1, '#ffe39a');
    p(0, 19, 32, 1, '#c9912a');
    speckle(p, r, 18, ['#e0a92e', '#ffd766'], 0, 12, 32, 8);
  });

  // ---- walls ------------------------------------------------------------------------------
  const brick = (p: (x: number, y: number, w: number, h: number, c: string) => void, r: () => number, base: string, mortar: string) => {
    p(0, 0, 32, 32, mortar);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 8 : 0;
      for (let b = -1; b < 3; b++) {
        const x0 = b * 16 + off;
        const k = 0.88 + r() * 0.24;
        const c = shade(base, k);
        const x = Math.max(0, x0 + 1), w = Math.min(32, x0 + 16) - x;
        if (w <= 0) continue;
        p(x, row * 4 + 1, w, 3, c);
        p(x, row * 4 + 1, w, 1, shade(base, k * 1.18));
        if (r() < 0.25) p(x + Math.floor(r() * Math.max(1, w - 2)), row * 4 + 2, 2, 1, shade(base, k * 0.8));
      }
    }
  };
  paint(ctx, CELLS.brick, (p, r) => brick(p, r, '#6a3f8c', '#2a1638'));
  paint(ctx, CELLS.brickDark, (p, r) => brick(p, r, '#4d2c68', '#1f0f2a'));
  paint(ctx, CELLS.brickVent, (p, r) => {
    brick(p, r, '#6a3f8c', '#2a1638');
    p(8, 7, 16, 12, '#2a1f33');
    p(8, 7, 16, 1, '#8b82a0');
    for (let k = 0; k < 4; k++) p(9, 9 + k * 2.5, 14, 1, '#7a7090');
    p(8, 18, 16, 1, '#151018');
  });
  const poster = (p: (x: number, y: number, w: number, h: number, c: string) => void, r: () => number, bg: string, ink: string) => {
    brick(p, r, '#6a3f8c', '#2a1638');
    p(7, 3, 18, 22, '#2a0f1f');
    p(8, 4, 16, 20, bg);
    // Dog-bone "Kibble Corp" mark.
    p(11, 9, 10, 3, ink);
    p(10, 8, 2, 2, ink); p(10, 11, 2, 2, ink); p(20, 8, 2, 2, ink); p(20, 11, 2, 2, ink);
    p(10, 15, 12, 1, ink);
    p(11, 17, 10, 1, ink);
    p(12, 19, 8, 1, ink);
    p(8, 4, 16, 1, 'rgba(255,255,255,0.4)');
  };
  paint(ctx, CELLS.brickPoster, (p, r) => poster(p, r, '#ffc93c', '#2a0f1f'));
  paint(ctx, CELLS.poster2, (p, r) => {
    brick(p, r, '#6a3f8c', '#2a1638');
    p(6, 3, 20, 22, '#2a0f1f');
    p(7, 4, 18, 20, '#fcecbb');
    // "WANTED" cat face.
    p(9, 5, 14, 2, '#c1260f');
    p(12, 10, 8, 7, '#2a0f1f');
    p(11, 9, 2, 2, '#2a0f1f'); p(19, 9, 2, 2, '#2a0f1f');
    p(13, 12, 2, 1, '#ffc93c'); p(17, 12, 2, 1, '#ffc93c');
    p(10, 19, 12, 1, '#6f2da8');
    p(12, 21, 8, 1, '#6f2da8');
  });
  paint(ctx, CELLS.metalPanel, (p, r) => {
    p(0, 0, 32, 32, '#4a4062');
    for (let x = 0; x < 32; x += 8) {
      p(x, 0, 1, 32, '#2e2640');
      p(x + 1, 0, 1, 32, '#6a5e88');
    }
    speckle(p, r, 30, ['#554a70', '#3f3656']);
    for (const y of [2, 29]) for (let x = 3; x < 32; x += 8) p(x, y, 2, 2, '#8e84aa');
  });
  paint(ctx, CELLS.wallTop, (p, r) => {
    p(0, 0, 32, 32, '#3b2452');
    speckle(p, r, 90, ['#42295c', '#35204a', '#4a2f66', '#3f2758']);
    p(0, 15, 32, 1, '#33203f');
    p(0, 16, 32, 1, '#4a3066');
  });
  paint(ctx, CELLS.pillar, (p, r) => {
    p(0, 0, 32, 32, '#5b4a78');
    p(0, 0, 4, 32, '#7a68a0');
    p(28, 0, 4, 32, '#3e3058');
    for (let y = 0; y < 32; y += 8) {
      p(0, y, 32, 1, '#332845');
      p(0, y + 1, 32, 1, '#6e5e92');
    }
    speckle(p, r, 30, ['#655485', '#52436e']);
  });
  paint(ctx, CELLS.baseboard, (p) => {
    p(0, 0, 32, 32, '#231530');
    p(0, 0, 32, 3, '#4a3066');
    for (let x = 2; x < 32; x += 8) p(x, 12, 4, 6, '#ffc93c');
  });
  paint(ctx, CELLS.rug, (p, r) => {
    p(0, 0, 32, 32, '#b0406e');
    for (let y = 0; y < 32; y++) if (y % 6 < 3) p(0, y, 32, 1, '#c24d7d');
    p(0, 0, 32, 2, '#ffc93c');
    p(0, 30, 32, 2, '#ffc93c');
    for (let x = 2; x < 32; x += 6) p(x, 14, 3, 3, '#fcecbb');
    speckle(p, r, 40, ['#9e3862', '#d0608e']);
  });

  // ---- props ------------------------------------------------------------------------------
  paint(ctx, CELLS.crateSide, (p, r) => {
    p(0, 0, 32, 32, '#b8773f');
    for (let y = 4; y < 28; y += 6) {
      p(4, y, 24, 1, '#7c4a24');
      p(4, y + 1, 24, 1, '#d09256');
    }
    for (let i = 3; i < 29; i++) p(i, i, 3, 1, '#d49a5c');
    for (let i = 3; i < 29; i++) p(i + 1, i + 1, 2, 1, '#7c4a24');
    p(0, 0, 32, 4, '#d9a066');
    p(0, 28, 32, 4, '#9a5f30');
    p(0, 0, 4, 32, '#cf955a');
    p(28, 0, 4, 32, '#9a5f30');
    p(0, 31, 32, 1, '#4a2a14');
    p(31, 0, 1, 32, '#4a2a14');
    for (const [x, y] of [[1, 1], [29, 1], [1, 29], [29, 29]]) p(x, y, 2, 2, '#e8e0f0');
    speckle(p, r, 24, ['#a86a36', '#c4844a']);
  });
  paint(ctx, CELLS.crateTop, (p, r) => {
    p(0, 0, 32, 32, '#c4844a');
    for (let x = 0; x < 32; x += 8) {
      p(x, 0, 1, 32, '#7c4a24');
      p(x + 1, 0, 1, 32, '#dca468');
    }
    p(0, 0, 32, 3, '#e0aa70');
    p(0, 29, 32, 3, '#9a5f30');
    speckle(p, r, 30, ['#b27540', '#d09256']);
    p(12, 12, 8, 8, '#2a0f1f');
    p(13, 13, 6, 6, '#ffc93c');
  });
  paint(ctx, CELLS.cardSide, (p, r) => {
    p(0, 0, 32, 32, '#c9955c');
    speckle(p, r, 50, ['#bd8950', '#d4a26a']);
    p(13, 0, 6, 32, '#e8d6a8');
    p(13, 0, 1, 32, '#b89a6a');
    // "THIS SIDE UP" arrows + fragile glass.
    p(4, 10, 1, 6, '#6b4a2e'); p(3, 11, 3, 1, '#6b4a2e');
    p(8, 10, 1, 6, '#6b4a2e'); p(7, 11, 3, 1, '#6b4a2e');
    p(22, 18, 6, 1, '#c1260f'); p(24, 19, 2, 4, '#c1260f'); p(22, 23, 6, 1, '#c1260f');
    p(0, 31, 32, 1, '#7a5530');
  });
  paint(ctx, CELLS.cardTop, (p, r) => {
    p(0, 0, 32, 32, '#d4a26a');
    speckle(p, r, 40, ['#c9955c', '#dcae78']);
    p(0, 15, 32, 2, '#9a6f40');
    p(12, 0, 8, 32, '#e8d6a8');
    p(12, 0, 1, 32, '#bba070');
  });
  paint(ctx, CELLS.barrelSide, (p, r) => {
    p(0, 0, 32, 32, '#3a6fb0');
    speckle(p, r, 30, ['#3565a2', '#4178bc']);
    for (const y of [3, 15, 27]) {
      p(0, y, 32, 3, '#23466f');
      p(0, y, 32, 1, '#6e9fd6');
    }
    p(0, 0, 3, 32, '#5a8fcc');
    p(29, 0, 3, 32, '#274e7c');
    p(10, 8, 12, 5, '#fcecbb');
    p(12, 9, 8, 3, '#c1260f');
  });
  paint(ctx, CELLS.barrelTop, (p, r) => {
    p(0, 0, 32, 32, '#2e5a92');
    p(3, 3, 26, 26, '#3a6fb0');
    p(5, 5, 22, 22, '#4a82c4');
    p(20, 8, 4, 4, '#1e3a60');
    p(21, 9, 2, 2, '#6e9fd6');
    speckle(p, r, 20, ['#3f78b8', '#5290d0'], 5, 5, 22, 22);
  });
  paint(ctx, CELLS.sackSide, (p, r) => {
    p(0, 0, 32, 32, '#9b8a5c');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x + y * 3) % 5 === 0) p(x, y, 1, 1, '#8a7a4e');
    speckle(p, r, 30, ['#ab9a6a', '#8e7e52']);
    // Catnip leaf stamp.
    p(12, 10, 8, 10, '#3f8f3a');
    p(10, 12, 12, 6, '#3f8f3a');
    p(15, 8, 2, 14, '#2a6a2a');
    p(13, 12, 2, 2, '#7fd06a');
  });
  paint(ctx, CELLS.sackTop, (p, r) => {
    p(0, 0, 32, 32, '#a8976a');
    speckle(p, r, 60, ['#9b8a5c', '#b8a878']);
    p(12, 12, 8, 8, '#7a6a40');
    p(14, 10, 4, 12, '#c8b888');
  });
  paint(ctx, CELLS.kibbleSack, (p, r) => {
    p(0, 0, 32, 32, '#c1260f');
    speckle(p, r, 40, ['#b0220d', '#d0341a']);
    p(4, 8, 24, 14, '#fcecbb');
    p(8, 12, 16, 3, '#6b3a1e');
    p(7, 11, 2, 2, '#6b3a1e'); p(7, 14, 2, 2, '#6b3a1e'); p(23, 11, 2, 2, '#6b3a1e'); p(23, 14, 2, 2, '#6b3a1e');
    p(6, 18, 20, 1, '#6f2da8');
    p(0, 0, 32, 2, '#e04a2a');
  });
  paint(ctx, CELLS.shelfMetal, (p, r) => {
    p(0, 0, 32, 32, '#e0802c');
    p(0, 0, 32, 3, '#ffb056');
    p(0, 29, 32, 3, '#9a4a14');
    for (let x = 4; x < 32; x += 6) p(x, 10, 2, 2, '#5a2a0a');
    speckle(p, r, 16, ['#d0701e', '#f0903a']);
  });
  paint(ctx, CELLS.palletTop, (p) => {
    p(0, 0, 32, 32, '#5a3a22');
    for (let x = 0; x < 32; x += 8) {
      p(x + 1, 0, 6, 32, '#b98a52');
      p(x + 1, 0, 6, 1, '#d8aa70');
      p(x + 1, 0, 1, 32, '#cf9e64');
    }
  });
  paint(ctx, CELLS.belt, (p) => {
    p(0, 0, 32, 32, '#1e1a26');
    for (let y = 0; y < 32; y += 4) {
      p(0, y, 32, 1, '#3a3448');
      p(0, y + 1, 32, 1, '#2a2536');
    }
    p(0, 0, 3, 32, '#ffc93c');
    p(29, 0, 3, 32, '#ffc93c');
  });
  paint(ctx, CELLS.conveyorSide, (p) => {
    p(0, 0, 32, 32, '#3a3052');
    p(0, 0, 32, 4, '#ffc93c');
    for (let x = 0; x < 32; x += 8) {
      p(x + 2, 10, 4, 4, '#1a1426');
      p(x + 3, 11, 2, 2, '#8e84aa');
    }
    for (let x = 0; x < 32; x++) if ((x >> 2) % 2 === 0) p(x, 26, 1, 4, '#2a0f1f');
    p(0, 26, 32, 1, '#ffc93c');
  });
  paint(ctx, CELLS.steel, (p, r) => {
    p(0, 0, 32, 32, '#8a84a0');
    speckle(p, r, 60, ['#7e7894', '#96909e', '#a09ab4']);
    p(0, 0, 32, 2, '#c4bfd6');
    p(0, 30, 32, 2, '#5a5470');
  });
  paint(ctx, CELLS.shutter, (p) => {
    p(0, 0, 32, 32, '#3b2355');
    for (let y = 0; y < 32; y += 4) {
      p(0, y, 32, 1, '#5c3d80');
      p(0, y + 3, 32, 1, '#24123a');
    }
    p(0, 0, 2, 32, '#24123a');
    p(30, 0, 2, 32, '#24123a');
  });
  paint(ctx, CELLS.vault, (p, r) => {
    p(0, 0, 32, 32, '#5a5078');
    speckle(p, r, 50, ['#524870', '#645a84']);
    for (let x = 0; x < 32; x += 16) p(x, 0, 1, 32, '#3a3252');
    for (const y of [3, 28]) for (let x = 2; x < 32; x += 5) {
      p(x, y, 2, 2, '#ffc93c');
      p(x, y, 1, 1, '#fff3b0');
    }
  });
  paint(ctx, CELLS.plinth, (p, r) => {
    p(0, 0, 32, 32, '#2a1a3c');
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 10 : 0;
      for (let x = -20; x < 32; x += 20) p(Math.max(0, x + off), row * 8, 1, 8, '#1a1026');
      p(0, row * 8, 32, 1, '#1a1026');
      p(0, row * 8 + 1, 32, 1, '#382652');
    }
    speckle(p, r, 40, ['#301f44', '#24162f']);
  });
  paint(ctx, CELLS.darkMetal, (p, r) => {
    p(0, 0, 32, 32, '#2c2438');
    speckle(p, r, 30, ['#342b42', '#241d2e']);
    p(0, 0, 32, 2, '#4a3e5e');
  });
  paint(ctx, CELLS.lampGlass, (p) => p(0, 0, 32, 32, '#ffffff'));
  paint(ctx, CELLS.white, (p) => p(0, 0, 32, 32, '#ffffff'));
  paint(ctx, CELLS.stripeTrim, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, 1, 1, ((x + y) >> 2) % 2 ? '#2a1a24' : '#ffc93c');
  });
  paint(ctx, CELLS.grass, (p, r) => {
    p(0, 0, 32, 32, '#2b3a3a');
    speckle(p, r, 80, ['#324545', '#253333', '#3a4e48']);
  });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  atlasTex = t;
  return t;
}

// ---------------------------------------------------------------------------------------------
// ArtBuilder
// ---------------------------------------------------------------------------------------------

/** Face bits. */
export const F = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32 } as const;
export const ALL = 63;
export const NO_BOTTOM = 63 & ~8;

/** Per-face cells: a single cell, or { top, side, bottom } with optional per-axis overrides. */
export type FaceCells = number | { top?: number; side?: number; bottom?: number; px?: number; nx?: number; pz?: number; nz?: number };

const HALF_TEXEL = 0.5 / SIZE;

export interface BoxOpts {
  faces?: number;
  /** Vertex colour multiplier (sRGB hex or Color). Default white. */
  color?: THREE.ColorRepresentation;
  /** Separate colour for the top face. */
  top?: THREE.ColorRepresentation;
  /** Darken the bottom of side faces towards this factor (fake AO). Default 1 (off). */
  ao?: number;
  /** Rotate the box around its vertical centre axis (radians). */
  rotY?: number;
  /**
   * UV mode for side faces: 'fit' maps the whole cell onto the face (default), 'world' maps one
   * cell per world unit (tiling and cropping by world coordinates).
   */
  uv?: 'fit' | 'world';
}

const tmpC = new THREE.Color();
const tmpT = new THREE.Color();

export class ArtBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  get triangles(): number {
    return this.idx.length / 3;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  /** Axis-aligned (optionally Y-rotated) box from min to max corner. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cells: FaceCells, o: BoxOpts = {}): this {
    const faces = o.faces ?? NO_BOTTOM;
    const c = tmpC.set(o.color ?? 0xffffff);
    const t = tmpT.set(o.top ?? o.color ?? 0xffffff);
    const cell = (k: 'top' | 'side' | 'bottom' | 'px' | 'nx' | 'pz' | 'nz'): number => {
      if (typeof cells === 'number') return cells;
      if (k === 'top') return cells.top ?? cells.side ?? 0;
      if (k === 'bottom') return cells.bottom ?? cells.side ?? 0;
      if (k === 'side') return cells.side ?? cells.top ?? 0;
      return cells[k] ?? cells.side ?? cells.top ?? 0;
    };
    const ao = o.ao ?? 1;
    const w = o.uv === 'world';
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const rot = o.rotY ?? 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (x: number, y: number, z: number): [number, number, number] => {
      if (!rot) return [x, y, z];
      const dx = x - cx, dz = z - cz;
      return [cx + dx * cs + dz * sn, y, cz - dx * sn + dz * cs];
    };
    const N = (x: number, y: number, z: number): [number, number, number] => (rot ? [x * cs + z * sn, y, -x * sn + z * cs] : [x, y, z]);
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    // uv spans (0..1 of a cell) for each face axis.
    const span = (len: number, start: number) => (w ? [start - Math.floor(start), Math.min(1, start - Math.floor(start) + len)] : [0, 1]);
    const bot = [c.r * ao, c.g * ao, c.b * ao];
    const topc = [c.r, c.g, c.b];
    if (faces & F.PY) {
      const [u0, u1] = w ? span(sx, x0) : [0, 1];
      const [v0, v1] = w ? span(sz, z0) : [0, 1];
      this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), N(0, 1, 0), cell('top'), [u0, v1, u1, v1, u1, v0, u0, v0], [t.r, t.g, t.b], [t.r, t.g, t.b]);
    }
    if (faces & F.NY) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), N(0, -1, 0), cell('bottom'), [0, 0, 1, 0, 1, 1, 0, 1], bot, bot);
    const vs = w ? [Math.max(0, 1 - sy), 1] : [0, 1];
    // Side faces: v = 0 at the top of the cell (canvas y down), 1 at the bottom.
    const side = (a: [number, number, number], b: [number, number, number], cc: [number, number, number], d: [number, number, number], n: [number, number, number], k: number, len: number, start: number) => {
      const [u0, u1] = w ? span(len, start) : [0, 1];
      const [vt, vb] = w ? [vs[0], vs[1]] : [0, 1];
      // a,b bottom; cc,d top.
      this.quad(a, b, cc, d, n, k, [u0, vb, u1, vb, u1, vt, u0, vt], bot, topc);
    };
    if (faces & F.PZ) side(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), N(0, 0, 1), cell('pz'), sx, x0);
    if (faces & F.NZ) side(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), N(0, 0, -1), cell('nz'), sx, x0);
    if (faces & F.PX) side(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), N(1, 0, 0), cell('px'), sz, z0);
    if (faces & F.NX) side(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), N(-1, 0, 0), cell('nx'), sz, z0);
    return this;
  }

  /** Box by bottom-centre, half extents and height. */
  block(cx: number, y: number, cz: number, hx: number, h: number, hz: number, cells: FaceCells, o: BoxOpts = {}): this {
    return this.box(cx - hx, y, cz - hz, cx + hx, y + h, cz + hz, cells, o);
  }

  /** Octagonal prism (voxel barrel / pillar): a plus of two boxes. */
  barrel(cx: number, y: number, cz: number, r: number, h: number, cells: FaceCells, o: BoxOpts = {}): this {
    const k = r * 0.62;
    this.block(cx, y, cz, r, h, k, cells, o);
    this.block(cx, y, cz, k, h, r, cells, o);
    return this;
  }

  /** Flat quad on the XZ plane at height y (top face only). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, cell: number, color: THREE.ColorRepresentation = 0xffffff, rotQuarter = 0): this {
    const c = tmpC.set(color);
    const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
    const rq = ((rotQuarter % 4) + 4) % 4;
    const ruv = uvs.slice(rq * 2).concat(uvs.slice(0, rq * 2));
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], cell, ruv, [c.r, c.g, c.b], [c.r, c.g, c.b]);
    return this;
  }

  private quad(a: number[], b: number[], c: number[], d: number[], n: number[], cell: number, uv: number[], bottom: number[], top: number[]): void {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) this.nor.push(n[0], n[1], n[2]);
    // a, b are the "bottom" vertices for side faces (for tops both colours are equal).
    this.col.push(bottom[0], bottom[1], bottom[2], bottom[0], bottom[1], bottom[2], top[0], top[1], top[2], top[0], top[1], top[2]);
    const [ox, oy] = cellOrigin(cell);
    const u0 = ox / SIZE + HALF_TEXEL, v0 = oy / SIZE + HALF_TEXEL;
    const du = CELL / SIZE - 2 * HALF_TEXEL;
    for (let k = 0; k < 4; k++) {
      // Canvas y goes down; texture v goes up (flipY): v = 1 - canvasY.
      this.uv.push(u0 + uv[k * 2] * du, 1 - (v0 + uv[k * 2 + 1] * du));
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    // THREE.Color.set() already converted the sRGB inputs to linear.
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
