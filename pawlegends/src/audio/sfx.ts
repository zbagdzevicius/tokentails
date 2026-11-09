/**
 * Sound effects (POC.md §3): zzfx parameter arrays synthesised into AudioBuffers on the first user gesture (no
 * AudioContext before it, so no autoplay warnings). The sample builder and a few PPK sounds come from the lifted
 * src/audio/sfxDefs.js; the MOBA sounds below are ours. Distance from the camera focus attenuates and pans.
 * Render side only; never feeds the sim.
 */
import { PCM_RATE, ZZFX_DEFS, zzfxSamples } from './sfxDefs.js';
import { voicePriority, type VoiceKey } from './voiceLines';
import { VoiceMixer, type MixRequest } from './identityMix';

/** LoL pass (lane B): the announcer voice (audio/voice.ts), its own chunk, loaded on the first line said. */
type VoiceMod = typeof import('./voice');
let voiceLoad: Promise<VoiceMod> | null = null;
/** ms between the zzfx sting and the voice line. */
export const VOICE_AFTER_STING_MS = 160;

// zzfx 1.4 order: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
//   pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
export const PL_SFX = {
  swipe: [0.5, 0, 260, 0.01, 0.02, 0.09, 4, 1, 6, 0, 0, 0, 0, 0.9, 0, 0, 0, 0.5, 0.02, 0, 2400],
  hit: [0.7, 0, 160, 0, 0.02, 0.09, 4, 2, -5, 0, 0, 0, 0, 1, 0, 0, 0, 0.6, 0.02, 0, -2000],
  heroHit: [0.9, 0, 110, 0, 0.04, 0.16, 2, 2.4, -6, 0, 0, 0, 0, 1.1, 0, 0.1, 0, 0.5, 0.03, 0, -1500],
  hurt: [0.8, 0, 220, 0, 0.03, 0.14, 1, 1.5, -8, 0, 0, 0, 0, 0.6, 0, 0.05, 0, 0.6, 0.02, 0, -1800],
  arrow: [0.45, 0, 1100, 0.005, 0.02, 0.07, 1, 1, -24, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0],
  dash: [0.55, 0, 320, 0.02, 0.05, 0.14, 4, 1, 12, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.04, 0, 3200],
  slam: [1, 0, 70, 0.005, 0.08, 0.32, 0, 2, -1, 0, 0, 0, 0, 0.9, 0, 0.2, 0, 0.6, 0.05, 0, -900],
  magic: [0.45, 0, 620, 0.02, 0.1, 0.25, 0, 1.5, 0, 0, 310, 0.08, 0, 0, 6, 0, 0, 0.6, 0.05, 0.2, 0],
  ult: [0.7, 0, 330, 0.03, 0.18, 0.4, 2, 1, 0, 0, 165, 0.1, 0.1, 0, 4, 0, 0.06, 0.6, 0.05, 0.25, -2600],
  windup: [0.35, 0, 200, 0.12, 0.1, 0.05, 1, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.02, 0, 0],
  levelup: [0.5, 0, 523, 0.02, 0.12, 0.3, 0, 1, 0, 0, 262, 0.07, 0.07, 0, 0, 0, 0.04, 0.7, 0.02, 0, 0],
  death: [0.6, 0, 420, 0.01, 0.1, 0.42, 1, 1, -7, 0, 0, 0, 0, 0.25, 0, 0, 0, 0.5, 0.08, 0, 0],
  poof: [0.4, 0, 500, 0.005, 0.02, 0.12, 4, 1, -2, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.5, 0.02, 0, 1500],
  towerShot: [0.4, 0, 760, 0.002, 0.03, 0.12, 0, 1, -28, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02, 0, 0],
  boom: [1, 0, 48, 0.01, 0.22, 0.85, 4, 1, -1, 0, 0, 0, 0, 1, 0, 0.3, 0.1, 0.6, 0.1, 0, -700],
  click: [0.35, 0, 880, 0, 0.01, 0.03, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  deny: [0.35, 0, 190, 0, 0.05, 0.1, 5, 1, 0, 0, -50, 0.05, 0, 0, 0, 0, 0, 0.5, 0.02, 0, 0],
  victory: [0.6, 0, 392, 0.02, 0.2, 0.5, 0, 1, 0, 0, 196, 0.12, 0.12, 0, 0, 0, 0.08, 0.8, 0.04, 0, 0],
  defeat: [0.5, 0, 330, 0.03, 0.25, 0.6, 1, 1, -0.6, 0, -40, 0.18, 0, 0, 0, 0, 0.1, 0.6, 0.05, 0, -1800],
  coin: [0.45, 0, 1500, 0, 0.03, 0.18, 0, 1, 0, 0, 500, 0.05, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0],
  /** Lane F (F2): a Toy bought: a bright three-step chime (rising pitch jumps, a short echo). */
  buy: [0.5, 0, 784, 0.005, 0.07, 0.3, 0, 1, 0, 0, 392, 0.06, 0.06, 0, 0, 0, 0.05, 0.75, 0.02, 0, 0],
  horn: [0.6, 0, 180, 0.05, 0.35, 0.3, 2, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0.7, 0.05, 0.1, -1400],
  // Crowd (fun plan F2 item 12), procedural: a band-limited noise swell reads as a far-off stadium.
  /** Takedowns: a bright swell of voices. */
  cheer: [0.55, 0, 700, 0.12, 0.35, 0.55, 4, 1, 0, 0, 0, 0, 0.09, 1.6, 0, 0, 0.03, 0.75, 0.1, 0.35, 1800],
  /** Towers and cores: a deep rumbling roar. */
  roar: [0.8, 0, 260, 0.1, 0.55, 0.8, 4, 1, -0.2, 0, 0, 0, 0.11, 1.9, 0, 0.05, 0.05, 0.75, 0.15, 0.3, -2400],
  /** The player is low: a short rising gasp. */
  gasp: [0.4, 0, 420, 0.06, 0.06, 0.18, 4, 1, 4, 0, 0, 0, 0, 1.2, 0, 0, 0, 0.6, 0.04, 0, 1200],
  /** Nine Lives saved someone: a falling "ooh". */
  ooh: [0.45, 0, 300, 0.08, 0.2, 0.35, 0, 1, -0.6, 0, 0, 0, 0, 0.15, 5, 0, 0.04, 0.8, 0.05, 0.25, -1600],
  /** Combo / multikill sting: two quick rising notes. */
  sting: [0.45, 0, 660, 0.005, 0.05, 0.16, 1, 1, 0, 0, 330, 0.05, 0, 0, 0, 0, 0.02, 0.8, 0.02, 0, 0],
  /** A pickup was taken. */
  pickup: [0.5, 0, 880, 0.005, 0.06, 0.2, 0, 1, 6, 0, 440, 0.06, 0, 0, 0, 0, 0, 0.7, 0.02, 0, 0],
  // Sim v14 dogs (DOGS-V13 §1 "Voice / emote"): synth voices, no recordings. Each joke is a generic behaviour.
  /** Nugget: a short high double bark (Frisbee, Herding Time). */
  nuggetBork: [0.5, 0, 720, 0.004, 0.03, 0.06, 1, 1.6, -7, 0, 0, 0, 0.1, 0.25, 0, 0, 0, 0.8, 0.02, 0, -3200],
  /** Nugget's Sploot: a happy rubber squeak. */
  nuggetSqueak: [0.5, 0, 1500, 0.01, 0.05, 0.08, 1, 1.4, 6, 0, 300, 0.03, 0, 0, 9, 0, 0, 0.85, 0.02, 0, 0],
  /** Marshmallow's SNOW DAY!: a tiny puppy "awoo" that cracks on the high note. */
  marshAwoo: [0.45, 0, 520, 0.05, 0.2, 0.16, 0, 1, 2.6, 0, 300, 0.2, 0, 0, 6, 0, 0, 0.8, 0.04, 0.15, 0],
  /** A soft snow poof (the Snowball bursting, the snow shaken off her hat). */
  marshPoof: [0.45, 0, 380, 0.005, 0.03, 0.2, 4, 1, -1, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.04, 0, -1500],
  /** Bravo's Crocodile Tears: a falling three-note whimper. */
  bravoSob: [0.42, 0, 640, 0.02, 0.06, 0.1, 1, 1, -4, 0, -70, 0.07, 0.12, 0, 5, 0, 0, 0.8, 0.03, 0.2, 0],
  /** Bravo's flop: the theatrical gasp. */
  bravoGasp: [0.5, 0, 480, 0.03, 0.05, 0.14, 4, 1, 9, 0, 0, 0, 0, 1, 0, 0, 0, 0.6, 0.03, 0, 1400],
  /** Bravo's ENCORE! (and the flop's sting): a small brassy fanfare. */
  bravoBow: [0.5, 0, 392, 0.01, 0.12, 0.3, 2, 1, 0, 0, 196, 0.1, 0.1, 0, 0, 0, 0.05, 0.75, 0.03, 0, -2600],
  /** Chili: a high square-wave yap (each shot's pitch comes from the playback rate, render-side). */
  chiliYap: [0.4, 0, 1250, 0.003, 0.02, 0.05, 5, 1, -14, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.01, 0, 0],
  /** Chili in BIG DOG ENERGY: the same yap, a deep low-passed bark. */
  chiliBigBark: [0.8, 0, 150, 0.005, 0.07, 0.2, 2, 2, -2, 0, 0, 0, 0, 0.4, 0, 0.1, 0, 0.7, 0.04, 0, -1200],
  /** Chili at full Rage: a low growl. */
  chiliGrowl: [0.45, 0, 110, 0.04, 0.3, 0.15, 2, 1, 0, 0, 0, 0, 0.04, 0.8, 0, 0, 0, 0.6, 0.05, 0.4, -900],
  /** Howler's AWOO: a long rising sine. */
  howlerAwoo: [0.5, 0, 330, 0.06, 0.42, 0.25, 0, 1, 2.4, -0.1, 0, 0, 0, 0, 4, 0, 0, 0.85, 0.08, 0.12, 0],
  /** THE SCREAM: noise and saw with a pitch slide, about 0.9 s (the master limiter ducks it). */
  howlerScream: [0.75, 0, 900, 0.02, 0.6, 0.28, 2, 1.5, -3, 0, 0, 0, 0, 1.4, 0, 0.05, 0, 0.8, 0.05, 0.15, -3600],
  /** Howler's Talk Back: three short "woo-woo-wooo" grumbles. */
  howlerArgue: [0.5, 0, 260, 0.02, 0.05, 0.08, 1, 1, 4, 0, -80, 0.06, 0.13, 0.3, 8, 0, 0, 0.75, 0.02, 0, -2000],
  // Sim v15 dogs (DOGS-V15 §1 "Voice / emote"): synth voices, no recordings. Each joke is a generic behaviour.
  /** Rocket's ZOOM… ZZZ sprint: a noisy rising whoosh. */
  rocketWhoosh: [0.5, 0, 220, 0.02, 0.15, 0.22, 4, 1, 5, 0, 0, 0, 0, 2, 0, 0, 0, 0.6, 0.05, 0, 1500],
  /** Rocket's nap: a falling two-note purr-snore. */
  rocketSnore: [0.45, 0, 170, 0.08, 0.25, 0.2, 1, 1, -1.5, 0, -40, 0.22, 0, 0.4, 6, 0, 0, 0.7, 0.05, 0.3, -800],
  /** SQUIRREL!: the squeaky toy. */
  rocketSqueak: [0.5, 0, 1300, 0.01, 0.04, 0.07, 1, 1.4, 8, 0, 400, 0.03, 0, 0, 12, 0, 0, 0.85, 0.02, 0, 0],
  /** Frankie's Weenie Roll: a short yip. */
  frankieYip: [0.4, 0, 900, 0.003, 0.03, 0.06, 1, 1.5, -10, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.8, 0.02, 0, -2500],
  /** Dig's pop out of the ground: a cork pop. */
  frankieDig: [0.6, 0, 600, 0.001, 0.01, 0.05, 0, 1, 12, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.01, 0, 0],
  /** FOOTLONG!: a rising slide whistle. */
  frankieStretch: [0.45, 0, 400, 0.02, 0.4, 0.15, 0, 1, 8, 0.3, 0, 0, 0, 0, 3, 0, 0, 0.85, 0.05, 0.1, 0],
  /** FOOTLONG! grab: a rubbery snap. */
  frankieSnap: [0.55, 0, 300, 0.002, 0.02, 0.1, 3, 1, -6, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.6, 0.02, 0, -1500],
  /** Domino's Spot Shot: a soft boop. */
  dominoBoop: [0.4, 0, 520, 0.005, 0.03, 0.08, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.02, 0, 0],
  /** Splatter: a wet splat. */
  dominoSplat: [0.5, 0, 220, 0.003, 0.04, 0.2, 4, 1, -2, 0, 0, 0, 0, 1.2, 0, 0, 0, 0.5, 0.04, 0, -1200],
  /** Big Shake: a brr-rattle. */
  dominoShake: [0.45, 0, 180, 0.02, 0.3, 0.15, 2, 1, 0, 0, 0, 0, 0.03, 0.6, 20, 0, 0, 0.6, 0.05, 0.5, -1000],
  /** CONNECT THE DOTS!: a rising pencil scratch into a chime. */
  dominoDraw: [0.45, 0, 700, 0.02, 0.25, 0.3, 4, 1, 3, 0, 600, 0.25, 0, 0.8, 0, 0, 0, 0.6, 0.05, 0, 2000],
} satisfies Record<string, number[]>;

export type SfxName = keyof typeof PL_SFX | 'shieldUp' | 'shieldChime' | 'squeak' | 'hyenaLaugh' | 'blip';
const PPK_USED = ['shieldUp', 'shieldChime', 'squeak', 'hyenaLaugh', 'blip'] as const;

export interface PlayOpts {
  vol?: number;
  rate?: number;
  /** World position (m) for distance falloff and pan. */
  at?: { x: number; z: number };
}

/** Most pooled output chains per kind (centre, panned): more sounds than this at once get one-off chains. */
const CHAIN_CAP = 24;

interface SfxChain {
  g: GainNode;
  p: StereoPannerNode | null;
  busy: boolean;
  pooled: boolean;
}

export class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Sound effects only (the host's sfx volume), into the master. Music has its own bus (audio/music.ts). */
  private fx: GainNode | null = null;
  /** The music's input (audio/music.ts), into the master: the announcer's voice ducks it. */
  private musicIn: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private lastAt = new Map<string, number>();
  /** Champion identity sounds (audio/skillSfx.ts): extra defs baked after the built-in set, and aliases to built-ins. */
  private extraDefs: Record<string, number[]> = {};
  private aliases = new Map<string, string>();
  /** The identity bus rules (CHAMP-IDENTITY.md §4): cooldowns, voice caps and stealing, relation gain, ducking. */
  readonly mixer = new VoiceMixer();
  private muted = false;
  private volume = 0.7;
  /** Host volumes (`audio{music, sfx}`, 0..1); 1 = the built-in mix. */
  private fxScale = 1;
  private musicScale = 1;
  /** Listener (camera focus, m). */
  ear = { x: 0, z: 0 };
  /**
   * PERF-IOS §8 Track B: reused output chains (a Gain, plus a StereoPanner when panned) already wired into the sfx
   * bus. A play needs a new BufferSource only; its chain returns to the pool when the source ends. Two pools, so a
   * centred sound keeps going straight into the bus (a StereoPanner at pan 0 would make a mono sound 3 dB quieter).
   */
  private readonly chains: { centre: SfxChain[]; panned: SfxChain[] } = { centre: [], panned: [] };
  /** Output nodes created so far (the pool's size; tests read it). */
  chainNodes = 0;

  /** Call from a user gesture. Safe to call many times. */
  unlock(): void {
    if (this.ac) {
      // 'suspended' before a gesture, 'interrupted' on iOS after a call or the app going to the background
      if (this.ac.state !== 'running') void this.ac.resume().catch(() => undefined);
      return;
    }
    const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ac = new Ctor();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ac.destination);
      this.fx = this.ac.createGain();
      this.fx.gain.value = this.fxScale;
      this.fx.connect(this.master);
      this.musicIn = this.ac.createGain();
      this.musicIn.connect(this.master);
      const defs: Record<string, number[]> = { ...PL_SFX };
      for (const k of PPK_USED) defs[k] = (ZZFX_DEFS as Record<string, number[]>)[k];
      Object.assign(defs, this.extraDefs);
      this.bakeSlices(defs);
    } catch {
      this.ac = null;
    }
  }

  /** PERF-IOS P1-6: hidden page or backgrounded app: the audio graph stops rendering (no CPU, no heat). */
  suspend(): void {
    if (this.ac && this.ac.state === 'running') void this.ac.suspend().catch(() => undefined);
  }

  /** Back in front: resume (iOS may still want a gesture; unlock() on the next touch then resumes it). */
  resumeContext(): void {
    if (this.ac && this.ac.state !== 'running') void this.ac.resume().catch(() => undefined);
  }

  /** Bake zzfx defs in small slices so the first gesture never stalls a frame. */
  private bakeSlices(defs: Record<string, number[]>): void {
    const names = Object.keys(defs);
    const bake = (): void => {
      if (!this.ac) return;
      const t0 = performance.now();
      while (names.length > 0 && performance.now() - t0 < 4) {
        const n = names.shift()!;
        const pcm = zzfxSamples(defs[n], PCM_RATE);
        const buf = this.ac.createBuffer(1, pcm.length, PCM_RATE);
        buf.getChannelData(0).set(pcm);
        this.buffers.set(n, buf);
      }
      if (names.length > 0) setTimeout(bake, 0);
    };
    bake();
  }

  /**
   * Champion identity: extra sounds (baked on unlock, or now when already unlocked) and aliases (a name that plays an
   * existing sound's buffer, e.g. `v:nugget:basic` → `nuggetBork`). Safe to call many times; later defs win.
   */
  registerDefs(defs: Readonly<Record<string, readonly number[]>>, aliases: Readonly<Record<string, string>> = {}): void {
    const add: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(defs)) add[k] = [...v];
    Object.assign(this.extraDefs, add);
    for (const [k, v] of Object.entries(aliases)) this.aliases.set(k, v);
    if (this.ac) this.bakeSlices(add);
  }

  /** A baked buffer by name (aliases resolve), or undefined before the bake. */
  private bufferOf(name: string): AudioBuffer | undefined {
    return this.buffers.get(name) ?? this.buffers.get(this.aliases.get(name) ?? '');
  }

  /** The zzfx volume baked into a sound (aliases resolve); 1 when unknown. */
  bakedVol(name: string): number {
    const n = this.aliases.get(name) ?? name;
    const d = this.extraDefs[n] ?? (PL_SFX as Record<string, number[]>)[n] ?? (ZZFX_DEFS as Record<string, number[]>)[n];
    return d?.[0] ?? 1;
  }

  /** Is this name known (built in, registered or aliased)? Pure lookup, no context needed. */
  knows(name: string): boolean {
    return name in PL_SFX || (PPK_USED as readonly string[]).includes(name) || name in this.extraDefs || this.aliases.has(name);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    if (m) this.hushVoice();
  }

  /** Host volumes (0..1 each; a missing one keeps its value). Mute still wins over both. */
  setVolumes(v: { music?: number; sfx?: number }): void {
    const clamp = (x: number): number => Math.max(0, Math.min(1, x));
    if (typeof v.sfx === 'number' && Number.isFinite(v.sfx)) this.fxScale = clamp(v.sfx);
    if (typeof v.music === 'number' && Number.isFinite(v.music)) this.musicScale = clamp(v.music);
    if (this.fx) this.fx.gain.value = this.fxScale;
  }

  /** The host's music volume (0..1): audio/music.ts scales its bus by it. */
  get musicVolume(): number {
    return this.musicScale;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** The audio context once unlocked (music builds its layers on it), else null. */
  get context(): AudioContext | null {
    return this.ac;
  }

  /** The master gain (mute and volume apply to everything routed into it). */
  get output(): GainNode | null {
    return this.master;
  }

  /** Where the music connects (into the master; the voice ducks it), or null before unlock. */
  get musicOutput(): GainNode | null {
    return this.musicIn;
  }

  /** Lines said so far (e2e reads `data-voice`). */
  readonly voiced: string[] = [];

  /**
   * LoL pass (lane B): an announcer voice line (a recorded clip; audio/voice.ts queues it by priority). Lines of
   * priority 3 and up come after the zzfx sting (`sting` overrides). Muted (or the sound-effects volume at 0) says
   * nothing and loads nothing; the voice chunk comes in on the first line or the match's preload.
   */
  voice(key: VoiceKey, o: { sting?: boolean } = {}): void {
    this.voiced.push(key);
    if (this.voiced.length > 20) this.voiced.shift();
    try {
      document.documentElement.dataset.voice = this.voiced.join(',');
    } catch {
      /* node */
    }
    if (this.muted || this.fxScale <= 0.01) return;
    const sting = o.sting ?? voicePriority(key) >= 3;
    if (sting) this.play('sting', { vol: 0.6, rate: 0.9 });
    void this.voiceMod()
      .then((m) => {
        const say = (): void => m.sayLine(key, () => this.voiceOut());
        if (sting) setTimeout(say, VOICE_AFTER_STING_MS);
        else say();
      })
      .catch(() => undefined);
  }

  /** Fetch and decode these lines ahead of time (match start); nothing while muted. */
  preloadVoice(keys: readonly VoiceKey[]): void {
    if (this.muted || this.fxScale <= 0.01) return;
    void this.voiceMod()
      .then((m) => m.preload(keys, this.ac))
      .catch(() => undefined);
  }

  /** Stop the announcer and drop its waiting lines (mute, leaving a match). */
  hushVoice(): void {
    if (!voiceLoad) return;
    void voiceLoad.then((m) => m.hush(this.voiceOut())).catch(() => undefined);
  }

  private voiceMod(): Promise<VoiceMod> {
    voiceLoad ??= import('./voice');
    return voiceLoad;
  }

  private voiceOut(): import('./voice').VoiceOut {
    return {
      ctx: this.ac,
      bus: this.fx,
      duck: this.musicIn,
      volume: this.muted ? 0 : this.volume * this.fxScale,
      muted: this.muted,
    };
  }

  play(name: SfxName, o: PlayOpts = {}): void {
    this.start(name, o);
  }

  /**
   * Champion identity layer (CHAMP-IDENTITY.md §4): one sound through the mix rules (per-layer cooldown, voice caps
   * with stealing, layer volume cap, relation gain, ducking), then the usual distance falloff and pan into the sfx bus.
   * Returns true when it played.
   */
  playLayer(req: Omit<MixRequest, 'dur' | 'vol'> & { vol?: number; rate?: number; at?: { x: number; z: number } }): boolean {
    const ac = this.ac;
    const buf = this.bufferOf(req.name);
    if (!ac || !buf || !this.fx || this.muted) return false;
    const now = ac.currentTime;
    const rate = req.rate ?? 1;
    const baked = this.bakedVol(req.name);
    const full: MixRequest = { ...req, vol: req.vol ?? baked, baked, dur: buf.duration / Math.max(0.1, rate) };
    const d = this.mixer.admit(full, now);
    if (!d) return false;
    for (const v of d.steals) v.stop?.();
    const src = this.start(req.name, { vol: d.gain, rate, at: req.at });
    if (!src) return false;
    this.mixer.add(full, now, () => {
      try {
        src.stop();
      } catch {
        /* already ended */
      }
    });
    return true;
  }

  /** A free output chain (a Gain, and a StereoPanner when `panned`), wired into `bus`; a new one when all are playing. */
  private chain(ac: AudioContext, bus: AudioNode, panned: boolean): SfxChain {
    const list = panned ? this.chains.panned : this.chains.centre;
    for (let i = 0; i < list.length; i++) if (!list[i].busy) return list[i];
    const g = ac.createGain();
    let p: StereoPannerNode | null = null;
    if (panned) {
      p = ac.createStereoPanner();
      g.connect(p);
      p.connect(bus);
    } else g.connect(bus);
    this.chainNodes += p ? 2 : 1;
    // a suspended context never ends its sources: past the cap a chain is one-off (not kept), so the pool stays small
    const c: SfxChain = { g, p, busy: false, pooled: list.length < CHAIN_CAP };
    if (c.pooled) list.push(c);
    return c;
  }

  private start(name: string, o: PlayOpts): AudioBufferSourceNode | null {
    const ac = this.ac;
    const buf = this.bufferOf(name);
    if (!ac || !buf || !this.fx || this.muted) return null;
    const now = ac.currentTime;
    // the same sound at most every 40 ms (a wave of minions should not machine-gun)
    if (now - (this.lastAt.get(name) ?? -1) < 0.04) return null;
    this.lastAt.set(name, now);
    let vol = o.vol ?? 1;
    let pan = 0;
    if (o.at) {
      const dx = o.at.x - this.ear.x;
      const dz = o.at.z - this.ear.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      vol *= Math.max(0, 1 - Math.max(0, d - 8) / 26);
      pan = Math.max(-0.8, Math.min(0.8, dx / 18));
    }
    if (vol <= 0.02) return null;
    try {
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
      const panned = pan !== 0 && typeof ac.createStereoPanner === 'function';
      const c = this.chain(ac, this.fx, panned);
      c.g.gain.value = vol;
      if (c.p) c.p.pan.value = pan;
      src.connect(c.g);
      c.busy = true;
      src.onended = () => {
        try {
          src.disconnect();
        } catch {
          /* already gone */
        }
        c.busy = false;
        if (!c.pooled) {
          try {
            c.g.disconnect();
            c.p?.disconnect();
          } catch {
            /* already gone */
          }
        }
      };
      src.start();
      return src;
    } catch {
      /* audio is best effort */
      return null;
    }
  }
}

export const sfx = new Sfx();
