/**
 * Clem: Sunrise knight: every hit throws golden-hour sun rays. Timbre: kalimba pluck (bright triangle).
 * Champion sound and motif layer (audio/champ/types.ts). Default: the basic voice doubles as the motif ping and the
 * IDENTITY motif shape draws in the colour pair. Per-hero wiring replaces `motif` with a kalimba pluck ping, adds
 * `sounds` / `skills` overrides and an `fx.paint` for the motif sprite (CHAMP-IDENTITY.md §3).
 */
import { IDENTITY } from '../../data/identity';
import type { ChampAudio } from './types';

export const clem: ChampAudio = {
  hero: 'clem',
  motif: IDENTITY.clem.voice.basic.zzfx,
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
};
