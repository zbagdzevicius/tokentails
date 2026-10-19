/**
 * Shared toon look (GDD 11): one 3-step gradient (3×1 px, nearest filter) for every MeshToonMaterial, so the world,
 * karts and props band the same way.
 */
import { DataTexture, MeshToonMaterial, NearestFilter, RedFormat, type MeshToonMaterialParameters } from 'three';

let gradient: DataTexture | null = null;

export function toonGradient(): DataTexture {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export function toonMaterial(p: MeshToonMaterialParameters = {}): MeshToonMaterial {
  return new MeshToonMaterial({ gradientMap: toonGradient(), ...p });
}
