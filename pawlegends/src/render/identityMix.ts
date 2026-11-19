/**
 * Champion identity mix numbers (docs/plans/moba/CHAMP-IDENTITY.md §4), re-exported by render/identity.ts. A module of
 * its own so audio/identityMix.ts (first load, through audio/sfx.ts) does not pull the whole IDENTITY table in.
 */
/**
 * Mix rules: a 10-hero teamfight must stay readable and never fatigue. The player hears their own hero, the CC aimed
 * at them and every ultimate; everyone else is thinned.
 */
export const MIX = Object.freeze({
  /** Longest a sound may be, by layer (s). */
  maxSeconds: { cast: 0.3, impact: 0.35, travel: 0.45, basicVoice: 0.2, ultVoice: 1.0 },
  /** Base volume caps by layer (before distance and the host's sfx volume). */
  volCap: { cast: 0.5, impact: 0.5, travel: 0.2, motif: 0.3, basicVoice: 0.4, ultVoice: 0.75 },
  /** The same sound (name) again within this many ms is dropped (Sfx.play already does 40 ms for every sound). */
  sameSoundMs: { cast: 60, impact: 50, travel: 120, basicVoice: 120, ultVoice: 400 },
  /** Most voices at once: all, per nature, per hero. A new one over a cap steals the oldest of lower priority. */
  maxVoices: 14,
  maxPerNature: 3,
  maxPerHero: 2,
  /** Most travel loops at once (closest projectiles win). */
  travelMax: 4,
  /** Priority (high wins the voice steal): the player's ult, any ult, CC aimed at the player, the player's hero, enemies, allies, minions. */
  priority: { myUlt: 7, ult: 6, ccAtMe: 5, mine: 4, enemy: 3, ally: 2, minion: 1 },
  /** Relation gain: allies sit back, enemies are full, the player's own hero a little forward. */
  relationGain: { mine: 1.1, enemy: 1, ally: 0.7 },
  /** Other heroes' basic-attack voices: only within this distance (m), and only every Nth basic. */
  basicVoiceRange: 10,
  basicVoiceEvery: 3,
  /** When this many voices play, every new one is scaled by duckGain (a soft bus limiter). */
  duckAt: 8,
  duckGain: 0.6,
});
