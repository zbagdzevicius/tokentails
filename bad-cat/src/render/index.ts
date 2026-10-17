/**
 * Render public API (FULL-PLAN.md). All geometry is procedural (no models): see Renderer.ts, room-view.ts,
 * props-view.ts, cat-rig.ts, human-rig.ts, vision-cone.ts, shards.ts, camera.ts, clip-camera.ts, clip-pass.ts,
 * quality.ts, context-loss.ts, palette.ts and actors/ (patterns, cosmetics, personas, cameos, accomplice, stills).
 */
import type { Group } from 'three';
import type { CatSpec, FaceDecal, RenderApi, RenderOptions, Renderer } from '../types';
import { GameRenderer } from './Renderer';
import { renderFrames } from './clip-pass';
import { buildCatRig } from './cat-rig';
import { decalTexture } from './face-decal-material';
import { renderCatPortrait, renderRoomStill } from './actors/stills';

export function createRenderer(container: HTMLElement, opts?: RenderOptions): Renderer {
  return new GameRenderer(container, opts);
}

export { renderFrames, clipFrameToTick, clipFrames, clipSize, shotForFrame, CLIP_FRAMES, MATCH_FRAME, OPENER_FRAMES, TAIL_FRAMES } from './clip-pass';

/** Procedural low-poly cat (shared with the cat maker's turntable). `face` replaces the face quad's map. */
export function buildCatMesh(spec: CatSpec, face?: HTMLCanvasElement | ImageBitmap | null): Group {
  return buildCatRig(spec, face ? decalTexture(face) : null).root;
}

export { createCatPreview } from './cat-preview';
export { buildPropGeometry } from './props-view';
export { fitRoomCamera } from './camera';
export { GameRenderer } from './Renderer';
export { renderCatPortrait, renderRoomStill } from './actors/stills';
export { PATTERN_ORDER, patternMask } from './actors/patterns';
export { COLLAR_BUILDERS, HAT_BUILDERS, TRAIL_STYLES } from './actors/cosmetics';
export { PERSONAS, PERSONA_IDS, personaFor } from './actors/personas';
export { propIcon } from './actors/accomplice';
export { fridgeMagnetLayout } from './actors/cameos';

export const render: RenderApi = { createRenderer, renderFrames, renderCatPortrait, renderRoomStill };
export type { FaceDecal };
