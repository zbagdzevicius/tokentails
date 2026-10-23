/**
 * The shell constructs `StarterAudio` (core seed name). The juice lane replaced the seed with the full race audio
 * (engine purr, cat voices, item SFX, adaptive music); this alias keeps the shell's import and API unchanged:
 * `unlock()`, `setMuted()`, `muted`, and the JuiceListener hooks.
 */
import { RaceAudio } from './race-audio';

export class StarterAudio extends RaceAudio {}
