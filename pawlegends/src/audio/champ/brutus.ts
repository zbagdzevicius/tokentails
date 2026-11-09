/**
 * Brutus: Sand knight: heraldic crest stamps and anvil clangs. Timbre: anvil and armour clank (metallic).
 * Champion sound and motif layer (audio/champ/types.ts). Default: the basic voice doubles as the motif ping and the
 * IDENTITY motif shape draws in the colour pair. Per-hero wiring replaces `motif` with a anvil and armour clank ping, adds
 * `sounds` / `skills` overrides and an `fx.paint` for the motif sprite (CHAMP-IDENTITY.md §3).
 */
import { IDENTITY } from '../../data/identity';
import type { ChampAudio } from './types';

export const brutus: ChampAudio = {
  hero: 'brutus',
  motif: IDENTITY.brutus.voice.basic.zzfx,
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
};
