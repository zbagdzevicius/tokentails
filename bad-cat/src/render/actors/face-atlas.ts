/**
 * One face atlas for every small cat face on screen (cameo spectators, fridge magnets): 8 × 8 slots of 64 px in a
 * single 512² DataTexture, so 15 spectators and 40 magnets bind one texture. A slot holds an approved face
 * (ImageBitmap / canvas from the cameo faces map, drawn through a 2D canvas in the browser) or the procedural toon
 * face of the cat's colours (`paintFace`, pure JS, so the atlas also builds in Node).
 */
import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import type { CatSpec } from '../../types';
import { paintFace } from '../face-decal-material';

export const ATLAS_GRID = 8;
export const ATLAS_SLOT_PX = 64;
export const ATLAS_PX = ATLAS_GRID * ATLAS_SLOT_PX;
export const ATLAS_SLOTS = ATLAS_GRID * ATLAS_GRID;

export class FaceAtlas {
  readonly data = new Uint8Array(ATLAS_PX * ATLAS_PX * 4);
  readonly tex: DataTexture;
  private slots = new Map<string, number>();

  constructor() {
    this.tex = new DataTexture(this.data, ATLAS_PX, ATLAS_PX, RGBAFormat, UnsignedByteType);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.magFilter = LinearFilter;
    this.tex.minFilter = LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }

  get size(): number {
    return this.slots.size;
  }

  /** Slot index of `key` (filled on first use), -1 when the atlas is full. */
  slot(key: string, spec: CatSpec, face?: ImageBitmap | HTMLCanvasElement | null): number {
    const have = this.slots.get(key);
    if (have !== undefined) return have;
    if (this.slots.size >= ATLAS_SLOTS) return -1;
    const i = this.slots.size;
    this.slots.set(key, i);
    if (!(face && this.drawImage(i, face))) this.drawProcedural(i, spec);
    this.tex.needsUpdate = true;
    return i;
  }

  /** UV offset (bottom-left) of a slot; the slot spans 1 / ATLAS_GRID. */
  uv(i: number): { u: number; v: number } {
    const col = i % ATLAS_GRID;
    const row = (i - col) / ATLAS_GRID;
    return { u: col / ATLAS_GRID, v: row / ATLAS_GRID };
  }

  /** 128² procedural face, box-filtered to 64² (rows are already bottom-up). */
  private drawProcedural(i: number, spec: CatSpec): void {
    const src = paintFace(spec, false);
    const N = 128;
    const col = i % ATLAS_GRID;
    const row = (i - col) / ATLAS_GRID;
    for (let y = 0; y < ATLAS_SLOT_PX; y++)
      for (let x = 0; x < ATLAS_SLOT_PX; x++) {
        const o = ((row * ATLAS_SLOT_PX + y) * ATLAS_PX + col * ATLAS_SLOT_PX + x) * 4;
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += src[((y * 2 + dy) * N + x * 2 + dx) * 4 + c];
          this.data[o + c] = s >> 2;
        }
      }
  }

  /** An approved face image (top-down rows) into the slot, flipped for GL; false without a 2D canvas. */
  private drawImage(i: number, img: ImageBitmap | HTMLCanvasElement): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      c.width = ATLAS_SLOT_PX;
      c.height = ATLAS_SLOT_PX;
      const g = c.getContext('2d');
      if (!g) return false;
      // round crop with a soft edge, like the decal
      g.save();
      g.beginPath();
      g.ellipse(32, 33, 30, 29, 0, 0, Math.PI * 2);
      g.clip();
      g.drawImage(img as CanvasImageSource, 0, 0, ATLAS_SLOT_PX, ATLAS_SLOT_PX);
      g.restore();
      const px = g.getImageData(0, 0, ATLAS_SLOT_PX, ATLAS_SLOT_PX).data;
      const col = i % ATLAS_GRID;
      const row = (i - col) / ATLAS_GRID;
      for (let y = 0; y < ATLAS_SLOT_PX; y++) {
        const sy = ATLAS_SLOT_PX - 1 - y;
        const o = ((row * ATLAS_SLOT_PX + y) * ATLAS_PX + col * ATLAS_SLOT_PX) * 4;
        this.data.set(px.subarray(sy * ATLAS_SLOT_PX * 4, (sy + 1) * ATLAS_SLOT_PX * 4), o);
      }
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.tex.dispose();
  }
}
