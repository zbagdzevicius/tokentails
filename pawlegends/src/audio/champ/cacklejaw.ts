/**
 * Cacklejaw: Cackling shadow: lime grin crescents and 'hee hee'. Timbre: kazoo cackle (buzzy saw with tremolo).
 * Champion sound and motif layer (audio/champ/types.ts). Default: the basic voice doubles as the motif ping and the
 * IDENTITY motif shape draws in the colour pair. Per-hero wiring replaces `motif` with a kazoo cackle ping, adds
 * `sounds` / `skills` overrides and an `fx.paint` for the motif sprite (CHAMP-IDENTITY.md §3).
 */
import { IDENTITY } from '../../data/identity';
import type { ChampAudio } from './types';

export const cacklejaw: ChampAudio = {
  hero: 'cacklejaw',
  motif: IDENTITY.cacklejaw.voice.basic.zzfx,
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
};
