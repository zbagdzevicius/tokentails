/** L7 / W1-AUDIO public API. All sound is WebAudio synthesis (no audio files). */
export { createAudio, renderEventsOffline, limitPerTick, clipCues, musicStyleFor, CLIP_MUSIC_S } from './audio';
export type { BadCatAudio, AudioEngineExtras, OfflineMixOptions, ClipScheduleOptions } from './audio';
export {
  cuesFor,
  cuesForContext,
  musicModeFor,
  tickToClipSeconds,
  inSlowMo,
  roomAudioFor,
  snoreCues,
  liveTickCues,
  specialOf,
  teleKindFor,
  COMBO_SEMITONES,
  CRASH_CLASS,
  SPECIAL_BY_ID,
  SNORE_TICKS,
} from './sfx-map';
export type { Cue, CueId, CueContext, MusicMode, RoomAudio, SpecialSound } from './sfx-map';
export { VOICE_PROFILES, PERSONAS } from './voices';
export type { Persona, VoiceProfile } from './voices';
export type { MusicStyle, MusicFlavor } from './music';
