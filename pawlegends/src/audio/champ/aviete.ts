/**
 * Aviete: Raspberry static: sparks that end in raspberry dots. Timbre: theremin buzz and static (square, bit-crushed).
 * Champion sound and motif layer (audio/champ/types.ts). Default: the basic voice doubles as the motif ping and the
 * IDENTITY motif shape draws in the colour pair. Per-hero wiring replaces `motif` with a theremin buzz and static ping, adds
 * `sounds` / `skills` overrides and an `fx.paint` for the motif sprite (CHAMP-IDENTITY.md §3).
 */
import { IDENTITY } from '../../data/identity';
import type { ChampAudio } from './types';

export const aviete: ChampAudio = {
  hero: 'aviete',
  motif: IDENTITY.aviete.voice.basic.zzfx,
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
};
