// Iteration 2 integration contract (ITERATION2.md). INTEGRATOR-owned, frozen for the lanes.
// Cross-lane calls go through the `ugc` service object: every lane fills its own services in its register function
// with provide({...}), and calls other lanes' services only through `ugc.*`. The defaults below keep every lane working
// on its own (a lane never imports another lane's folder, except the pure look codec in src/wardrobe/look.ts).
import { kittenFactory } from '../core/registry';
import type { KittenRig, RunResult, StageId } from '../core/types';
import { DEFAULT_LOOK, type Look } from '../wardrobe/look';

// ---------------------------------------------------------------- poses (WARDROBE implements, PHOTO uses)
export type PoseId = 'sit' | 'wave' | 'loaf' | 'stretch' | 'leap' | 'proud';
export const POSES: readonly PoseId[] = ['sit', 'wave', 'loaf', 'stretch', 'leap', 'proud'];
/** Mochi implements setPose: a held photo pose (null = back to the gameplay animation). */
export interface PoseableRig extends KittenRig {
  setPose(id: PoseId | null): void;
}
export const isPoseable = (r: KittenRig | null | undefined): r is PoseableRig => !!r && typeof (r as Partial<PoseableRig>).setPose === 'function';

// ---------------------------------------------------------------- shared shapes
export interface StyleSummary {
  /** longest combo chain this run */
  bestChain: number;
  /** tricks landed this run */
  tricks: number;
  /** points the style system added this run (already inside G.score) */
  stylePoints: number;
  /** '' before any run */
  rank: 'S' | 'A' | 'B' | 'C' | '';
}
export interface ChallengeInfo {
  /** challenger's display name (already sanitised) */
  name: string;
  score: number;
  stageId: StageId;
  /** null while the run is not over */
  won: boolean | null;
}
export type TrailLoad = { ok: true; name: string; author?: string } | { ok: false; error: string };

export interface UgcServices {
  // ---- WARDROBE
  /** the equipped look */
  currentLook(): Look;
  /** a kitten rig wearing `look` (ghost = translucent, ignores global events); null = no kitten registered */
  buildKitten(look: Look, opts?: { ghost?: boolean }): KittenRig | null;
  /** 2D portrait of a look (share card, ghost tag, challenge card); default draws nothing */
  drawLook(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, size: number): void;
  // ---- SHARE
  /** the player's display name ('' = not set) */
  playerName(): string;
  /** ask for a name if none is set (modal); resolves to the name, or '' if the player skipped */
  askName(): Promise<string>;
  /** a challenge link for a finished run (null = this run cannot be challenged) */
  challengeUrl(r: RunResult): string | null;
  /** the challenge being played or just finished (null = none) */
  activeChallenge(): ChallengeInfo | null;
  // ---- TRAILS
  /** decode and validate a trail code and make it the 'trail' stage's course (does not start it) */
  loadTrail(code: string): TrailLoad;
  /** the code of the course the 'trail' stage plays now (null = none loaded) */
  currentTrailCode(): string | null;
  // ---- STYLE
  styleSummary(): StyleSummary;
  // ---- CLIP
  /** a clip of the last seconds can be saved right now */
  clipReady(): boolean;
  /** open the clip sheet (render + share/download) */
  openClip(): void;
  // ---- PHOTO
  /** enter photo mode (only from pause) */
  openPhoto(): void;
}

export const ugc: UgcServices = {
  currentLook: () => ({ ...DEFAULT_LOOK }),
  buildKitten: () => kittenFactory()?.() ?? null,
  drawLook: () => {},
  playerName: () => '',
  askName: async () => '',
  challengeUrl: () => null,
  activeChallenge: () => null,
  loadTrail: () => ({ ok: false, error: 'The Trail Maker is not available' }),
  currentTrailCode: () => null,
  styleSummary: () => ({ bestChain: 0, tricks: 0, stylePoints: 0, rank: '' }),
  clipReady: () => false,
  openClip: () => {},
  openPhoto: () => {},
};

/** A lane fills its services (call it from its register function). */
export function provide(services: Partial<UgcServices>): void {
  Object.assign(ugc, services);
}

/** Test hooks for shots: window.__meowUgc[lane] = obj (window.__meow in main.ts is frozen). */
export function exposeTestHook(lane: string, obj: unknown): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __meowUgc?: Record<string, unknown> };
  (w.__meowUgc ??= {})[lane] = obj;
}
