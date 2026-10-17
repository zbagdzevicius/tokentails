/** L4 Cat maker public API (GDD 6.1, 6.2, 7.3, 9.2). */
import type { CatMakerApi, CatMakerOpenExtras, CatMakerResult, CatSpec, FaceDecal, RenderApi } from '../types';
import { openCatMaker as open, type CatMakerOptions } from './CatMaker';
import { manageCats, type ManageOptions } from './CatManager';
import { photoStore } from './photo-store';

export async function openCatMaker(
  host: HTMLElement,
  opts: { initial?: CatSpec; fromLink: boolean; render: RenderApi; dare?: string } & CatMakerOpenExtras &
    Partial<Omit<CatMakerOptions, 'initial' | 'fromLink' | 'render'>>,
): Promise<CatMakerResult> {
  return open(host, opts);
}

export async function loadFace(catIndex: number): Promise<FaceDecal | null> {
  try {
    return (await photoStore().get(catIndex))?.face ?? null;
  } catch {
    return null;
  }
}

export async function loadOpener(catIndex: number): Promise<{ media: Blob; kind: 'photo' | 'video' } | null> {
  try {
    return (await photoStore().get(catIndex))?.opener ?? null;
  } catch {
    return null;
  }
}

/** Up to `maxCats` cats: switch, add, delete. Resolves with the new profile cats. */
export function manage(
  host: HTMLElement,
  opts: { cats: CatSpec[]; active: number; maxCats: number; render: RenderApi; onUpsell?(): void } & Partial<ManageOptions>,
): Promise<{ cats: CatSpec[]; active: number }> {
  return manageCats(host, opts);
}

/** Deletes a slot's face decal and opener (IndexedDB, or the memory fallback). Never throws. */
export async function forget(catIndex: number): Promise<void> {
  try {
    await photoStore().remove(catIndex);
  } catch {
    /* nothing to forget */
  }
}

export const catMaker: CatMakerApi = { open: openCatMaker, loadFace, loadOpener, manage, forget };

// pure helpers and extras
export { cropToDecal, ringMedianColour, initialCrop, clampCrop, dragCrop, pinchCrop, featherAlpha, DECAL_SIZE } from './face-decal';
export type { Crop } from './face-decal';
export { FUR_CHIPS, nearestChip, chipToSpec, chipIndexOf565, deriveSecondary } from './body-colour';
export { createPhotoStore, photoStore, MAX_CAT_SLOTS } from './photo-store';
export type { PhotoStore, StoredCat } from './photo-store';
export { safeName, patternLabel, colourRoles, ownedCosmetics } from './CatMaker';
export type { CatMakerOptions } from './CatMaker';
export { manageCats, UPSELL_TEXT } from './CatManager';
export type { ManageOptions } from './CatManager';
export { catsReducer, initCats, canAdd, canDelete, nextSlot } from './cats-manager';
export type { CatsState, CatsAction, SlotEffects } from './cats-manager';
export { filterHandle, HANDLE_MAX } from './handle';
export { kmeans } from './photo-palette';
export type { PaletteCluster } from './photo-palette';
export { analyseCoat, guessPattern, coatFeatures, paletteRoles } from './pattern-guess';
export { videoGate, OPENER_VIDEO_MAX_BYTES, OPENER_SECONDS } from './video-opener';
export type { VideoPlan } from './video-opener';
