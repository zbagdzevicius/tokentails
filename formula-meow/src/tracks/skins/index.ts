/**
 * Set-piece skins (render-only): the registry plus both track lanes' skin files, pre-wired so each lane only edits its
 * own file (a.ts: tracks-A, b.ts: tracks-B). core/track/stunt-mesh.ts looks skins up through `pieceSkin`.
 */
import './a';
import './b';

export { pieceSkin, pieceSkinKeys, registerPieceSkin, type PieceSkin, type PieceSkinCtx } from './registry';
