/**
 * Set-piece skins (SIM_VERSION 8, iteration 3; SETPIECES.md section 13): how a loop, a wall ride, a jump gap or a
 * tunnel looks on each theme. The Engine step draws a generic look for every piece (core/track/stunt-mesh.ts); a skin
 * adds to it (the drum shell round a loop, the dish-towel net) or replaces it. Render-only.
 *
 * Ownership: `a.ts` is the tracks-A lane's (Kitchen, Rooftops, Laundry), `b.ts` the tracks-B lane's (Yarn, Café,
 * Shelter, Rug). Both are imported by `index.ts`, so a lane only appends `registerPieceSkin` calls to its own file.
 *
 * Budget: merge into `ctx.solid` (toon, vertex colours) and `ctx.glow` (unlit, vertex colours): no draw call. A skin
 * may add at most one Object3D of its own to `ctx.group` per track (moving parts: animate it with `onBeforeRender`).
 */
import type { Group } from 'three';
import type { SetPieceKind, ThemeId } from '../../types';
import type { BuiltPiece, BuiltTrack } from '../../core/track/build';
import type { Theme } from '../../core/track/themes';
import type { TriBuilder } from '../../core/track/mesh';

export interface PieceSkinCtx {
  track: BuiltTrack;
  piece: BuiltPiece;
  theme: Theme;
  /** merged toon geometry (shadows, lit) and unlit glow geometry of the track */
  solid: TriBuilder;
  glow: TriBuilder;
  /** the track's group: one extra Object3D per track at most (moving parts) */
  group: Group;
  /** ground height under the track (skirts go down to it) */
  groundY: number;
}

/** Draw a skin. Return true when it replaces the generic look of the piece, false / nothing to draw over it. */
export type PieceSkin = (ctx: PieceSkinCtx) => boolean | void;

const skins = new Map<string, PieceSkin>();
const key = (theme: ThemeId | '*', kind: SetPieceKind, skin: number) => `${theme}:${kind}:${skin}`;

/**
 * Register the look of `kind` with skin number `skin` (TrackDef.setPieces[].skin, 0 = the theme's default) on
 * `theme` ('*' = any theme). A later registration of the same key replaces the earlier one.
 */
export function registerPieceSkin(theme: ThemeId | '*', kind: SetPieceKind, skin: number, draw: PieceSkin): void {
  skins.set(key(theme, kind, skin), draw);
}

/** The skin for a piece: theme-specific first, then any-theme; null = the generic look only. */
export function pieceSkin(theme: ThemeId, kind: SetPieceKind, skin: number): PieceSkin | null {
  return skins.get(key(theme, kind, skin)) ?? skins.get(key('*', kind, skin)) ?? null;
}

/** Registered keys (tests). */
export function pieceSkinKeys(): string[] {
  return [...skins.keys()];
}
