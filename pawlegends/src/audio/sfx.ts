/**
 * Sound effects (POC.md §3): zzfx parameter arrays synthesised into AudioBuffers on the first user gesture (no
 * AudioContext before it, so no autoplay warnings). The sample builder and a few PPK sounds come from the lifted
 * src/audio/sfxDefs.js; the MOBA sounds below are ours. Distance from the camera focus attenuates and pans.
 * Render side only; never feeds the sim.
 */
import { PCM_RATE, ZZFX_DEFS, zzfxSamples } from './sfxDefs.js';
import { voicePriority, type VoiceKey } from './voiceLines';
import { VoiceMixer, type MixRequest } from './identityMix';
import { HIT_BANK, HIT_VARIANTS, HitVariation, HitVoices, STYLE_SOUND, bankName, heroSwingRate, natureBody, renderBankSound, type AttackStyle } from './hitMix';
import type { HeroId } from '../data/heroes/types';
import type { Nature } from '../render/identity';

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
  // Hit feel (audio pass, Nov 9): a landed hit is layered, not one noise burst (Sfx.impact): a short bright crack for
  // the contact, a pitched-down thump for the weight, a deep body on heavy hits and a ring on a big (crit-sized) hit.
  /** The contact: 66 ms of high-passed noise. */
  hitCrack: [0.6, 0, 1800, 0, 0.004, 0.05, 4, 1, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.012, 0, 2400],
  /** The weight: a sine that drops fast (about 0.12 s). */
  hitThump: [0.85, 0, 160, 0, 0.018, 0.09, 0, 1.8, -10, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.015, 0, 0],
  /** A heavy hit's body: a deep low-passed punch (about 0.33 s). */
  hitHeavy: [1, 0, 85, 0, 0.05, 0.24, 0, 2.2, -3, 0, 0, 0, 0, 0.35, 0, 0.06, 0, 0.6, 0.04, 0, -1100],
  /** A big hit (the crit number): a short bright ring over the crack. */
  critRing: [0.4, 0, 1560, 0, 0.02, 0.2, 1, 1, 0, 0, 520, 0.025, 0, 0, 14, 0, 0, 0.5, 0.02, 0, 0],
  /** The player is hit: a muffled thud under the old `hurt` grunt. */
  hurtThud: [0.85, 0, 120, 0, 0.035, 0.16, 0, 2, -5, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.6, 0.03, 0, -900],
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
  // CARD-SKINS.md Legendary skins: a short synth meow (takedown) and a low purr (recall land), layered by cardLayer
  /** A rising-then-falling "mew". */
  cardMeow: [0.4, 0, 640, 0.04, 0.12, 0.2, 1, 1.2, 4, -0.6, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.05, 0, 0],
  /** A low purr: a rumble with tremolo. */
  cardPurr: [0.4, 0, 70, 0.08, 0.35, 0.25, 2, 1, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.7, 0.05, 0.6, -900],
} satisfies Record<string, number[]>;

type BakeJob = [string, () => Float32Array];

export type SfxName = keyof typeof PL_SFX | 'shieldUp' | 'shieldChime' | 'squeak' | 'hyenaLaugh' | 'blip';
const PPK_USED = ['shieldUp', 'shieldChime', 'squeak', 'hyenaLaugh', 'blip'] as const;

/** A Legendary skin's meow or purr layer: at most once per this many seconds per hero. */
export const CARD_LAYER_GAP = 2;

export interface PlayOpts {
  vol?: number;
  rate?: number;
  /** World position (m) for distance falloff and pan. */
  at?: { x: number; z: number };
}

/** What a landed hit is (Sfx.impact picks its layers from it). */
export interface ImpactOpts {
  /** What was hit: a hero, a minion or monster, a tower or core. */
  target: 'hero' | 'unit' | 'structure';
  /** The player's own hit (full layers) or the player being hit; others' hits are quieter and lighter. */
  who: 'mine' | 'me' | 'other';
  /** A heavy hit (a big share of the target's health): adds the deep body. */
  heavy?: boolean;
  /** A big hit (the crit-sized number): adds the ring. */
  big?: boolean;
  /** An ability hit's skill nature: picks the body (a sharp cut, a blunt weight, a magic burst). */
  nature?: Nature;
  at?: { x: number; z: number };
}

/** A basic attack's swing (melee) or launch (ranged), at the attacker. */
export interface SwingOpts {
  hero: HeroId;
  style: AttackStyle;
  /** The player's own attack (louder, clearer, wins the voice cap) or someone else's. */
  mine: boolean;
  at?: { x: number; z: number };
}

/** A sound that started on the speakers (e2e and the audio probe read these). */
export interface AudioProbe {
  (o: { kind: 'sfx' | 'voice'; name: string; src: AudioBufferSourceNode; gain: number }): void;
}

/** One console warning per kind of audio failure (a broken device should not flood the console). */
const warned = new Set<string>();
export function warnAudioOnce(what: string, err?: unknown): void {
  if (warned.has(what)) return;
  warned.add(what);
  try {
    console.warn(`[pawlegends audio] ${what}`, err ?? '');
  } catch {
    /* no console */
  }
}

/** The Capacitor app (its AVAudioSession is set natively; the web audio session is left alone there). */
function isNativeApp(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * Safari's Audio Session API (iOS 17+): web audio is 'ambient' by default there, so the silent switch mutes the whole
 * game and most phones live on silent. While the game is unmuted it asks for 'playback' (sound with the switch on;
 * Safari may pause the player's own music while it plays), and 'ambient' while muted so their music is left alone.
 * Not in the Capacitor app: its native session is `.playback` + `.mixWithOthers` (AppDelegate.swift).
 */
export function applyAudioSession(muted: boolean): void {
  if (isNativeApp()) return;
  try {
    const nav = globalThis.navigator as unknown as { audioSession?: { type: string } } | undefined;
    if (!nav?.audioSession) return;
    const want = muted ? 'ambient' : 'playback';
    if (nav.audioSession.type !== want) nav.audioSession.type = want;
  } catch (e) {
    warnAudioOnce('audio session type not set', e);
  }
}

/** Others' hit-bank sounds of one kind: at most one per this many seconds (the player's own are never thinned). */
export const OTHER_GAP = 0.07;

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
  /** Hits, swings, hurts and the Fish ping (the hit bank), into the sfx bus: ducked under an announcer line. */
  private combat: GainNode | null = null;
  /** Hit bank (audio/hitMix.ts): per-play variation and the category voice caps. */
  readonly variation = new HitVariation();
  readonly hitVoices = new HitVoices();
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
  private readonly chains: { centre: SfxChain[]; panned: SfxChain[]; combatCentre: SfxChain[]; combatPanned: SfxChain[] } = {
    centre: [],
    panned: [],
    combatCentre: [],
    combatPanned: [],
  };
  /** Output nodes created so far (the pool's size; tests read it). */
  chainNodes = 0;

  /** Hidden page or backgrounded app (suspend()): a gesture must not wake the audio while it is away. */
  private away = false;
  /** skillPreview's quiet frames (hold()): plays and lines are dropped while > 0. Never touches the mute. */
  private quiet = 0;

  /**
   * Call from a user gesture (every pointerdown, pointerup, touchend, click and keydown: iOS WebKit only starts or
   * resumes audio inside a touch's end or a click). Safe to call many times: once running it is a state check.
   */
  unlock(): void {
    applyAudioSession(this.muted);
    if (this.ac) {
      // 'suspended' before a gesture, 'interrupted' on iOS after a call, Siri or the app going to the background
      if (this.ac.state !== 'running' && !this.away) this.wake();
      return;
    }
    const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      warnAudioOnce('no AudioContext in this browser: the game is silent');
      return;
    }
    try {
      this.ac = new Ctor();
      // an interruption (a call, Siri, another app taking audio) suspends the context; the next gesture resumes it,
      // and a resume is tried at once when the page is in front (iOS allows it after an interruption ends)
      this.ac.addEventListener?.('statechange', () => {
        const st = this.ac?.state as string | undefined;
        try {
          document.documentElement.dataset.audio = st ?? 'none';
        } catch {
          /* node */
        }
        if (st && st !== 'running' && st !== 'closed' && !this.away && !document.hidden) this.wake();
      });
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ac.destination);
      this.fx = this.ac.createGain();
      this.fx.gain.value = this.fxScale;
      this.fx.connect(this.master);
      this.musicIn = this.ac.createGain();
      this.musicIn.connect(this.master);
      this.combat = this.ac.createGain();
      // a gentle bus compressor: hits can be hot (punch) and a pile-up never clips (one node, made once)
      if (typeof this.ac.createDynamicsCompressor === 'function') {
        const k = this.ac.createDynamicsCompressor();
        k.threshold.value = -12;
        k.knee.value = 6;
        k.ratio.value = 4;
        k.attack.value = 0.002;
        k.release.value = 0.12;
        this.combat.connect(k);
        k.connect(this.fx);
      } else this.combat.connect(this.fx);
      const defs: Record<string, number[]> = { ...PL_SFX };
      for (const k of PPK_USED) defs[k] = (ZZFX_DEFS as Record<string, number[]>)[k];
      Object.assign(defs, this.extraDefs);
      // the hit bank after the zzfx defs (its last variant is the last buffer baked)
      const jobs: BakeJob[] = Object.keys(defs).map((n) => [n, () => zzfxSamples(defs[n], PCM_RATE)]);
      for (const kind of Object.keys(HIT_BANK)) for (let v = 0; v < HIT_VARIANTS; v++) jobs.push([bankName(kind, v), () => renderBankSound(kind, v)]);
      this.bakeJobs(jobs);
      this.wake();
    } catch (e) {
      warnAudioOnce('AudioContext could not start: the game is silent', e);
      this.ac = null;
    }
  }

  /**
   * Resume the context and, inside a gesture, start a one-sample silent buffer: older iOS WebKit only counts the
   * context as unlocked once a source has started in a touch's end.
   */
  private wake(): void {
    const ac = this.ac;
    if (!ac) return;
    if (ac.state !== 'running') {
      void ac.resume().catch((e: unknown) => warnAudioOnce('AudioContext resume refused (waits for the next tap)', e));
    }
    try {
      const b = ac.createBuffer(1, 1, ac.sampleRate);
      const src = ac.createBufferSource();
      src.buffer = b;
      src.connect(ac.destination);
      src.start(0);
    } catch {
      /* best effort */
    }
  }

  /** PERF-IOS P1-6: hidden page or backgrounded app: the audio graph stops rendering (no CPU, no heat). */
  suspend(): void {
    this.away = true;
    if (this.ac && this.ac.state === 'running') void this.ac.suspend().catch(() => undefined);
  }

  /** Back in front: resume (iOS may still want a gesture; unlock() on the next touch then resumes it). */
  resumeContext(): void {
    this.away = false;
    if (this.ac && this.ac.state !== 'running') void this.ac.resume().catch(() => undefined);
  }

  /** The context runs (sound reaches the speakers when not muted). */
  get running(): boolean {
    return this.ac?.state === 'running';
  }

  /** Inside a hold() (nothing plays). */
  get held(): boolean {
    return this.quiet > 0;
  }

  /**
   * Drop every play, layer and line until the returned release is called (skillPreview's silent frames). A counter,
   * so nested holds are safe, and the mute, the volumes and the methods are never swapped or touched.
   */
  hold(): () => void {
    this.quiet++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.quiet = Math.max(0, this.quiet - 1);
    };
  }

  /** Bake zzfx defs in small slices so the first gesture never stalls a frame. */
  private bakeSlices(defs: Record<string, number[]>): void {
    this.bakeJobs(Object.keys(defs).map((n) => [n, () => zzfxSamples(defs[n], PCM_RATE)]));
  }

  /** Bake PCM jobs (name, synth) in 4 ms slices. */
  private bakeJobs(jobs: BakeJob[]): void {
    let i = 0;
    const bake = (): void => {
      if (!this.ac) return;
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 4) {
        const [n, make] = jobs[i++];
        const pcm = make();
        if (!pcm.length) continue;
        const buf = this.ac.createBuffer(1, pcm.length, PCM_RATE);
        buf.getChannelData(0).set(pcm);
        this.buffers.set(n, buf);
      }
      if (i < jobs.length) setTimeout(bake, 0);
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
    if (name.startsWith('hb:')) return name.split(':')[1] in HIT_BANK;
    return name in PL_SFX || (PPK_USED as readonly string[]).includes(name) || name in this.extraDefs || this.aliases.has(name);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    if (m) this.hushVoice();
    if (this.ac) applyAudioSession(m);
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

  /** Lines whose clip actually started on the speakers (not muted, context running); e2e reads `data-voice`. */
  readonly voiced: string[] = [];

  /** The e2e audio probe (a page hook sets `__plAudioProbe`): told about every sound that starts. */
  private probe(kind: 'sfx' | 'voice', name: string, src: AudioBufferSourceNode, gain: number): void {
    const f = (globalThis as unknown as { __plAudioProbe?: AudioProbe }).__plAudioProbe;
    if (typeof f === 'function') {
      try {
        f({ kind, name, src, gain });
      } catch {
        /* a test hook */
      }
    }
  }

  /** audio/voice.ts: a line's clip started (it is audible: checked before the start). */
  private saidLine(key: VoiceKey, src: AudioBufferSourceNode, gain: number): void {
    this.voiced.push(key);
    if (this.voiced.length > 20) this.voiced.shift();
    try {
      document.documentElement.dataset.voice = this.voiced.join(',');
    } catch {
      /* node */
    }
    this.probe('voice', key, src, gain * (this.muted ? 0 : this.volume * this.fxScale));
  }

  /**
   * LoL pass (lane B): an announcer voice line (a recorded clip; audio/voice.ts queues it by priority). Lines of
   * priority 3 and up come after the zzfx sting (`sting` overrides): the line joins the queue now (so a lower line of
   * the same moment never jumps ahead) and its clip starts VOICE_AFTER_STING_MS later. Muted (or the sound-effects
   * volume at 0) says nothing and loads nothing; the voice chunk comes in on the first line or the match's preload.
   */
  voice(key: VoiceKey, o: { sting?: boolean } = {}): void {
    if (this.muted || this.fxScale <= 0.01 || this.quiet > 0) return;
    const sting = o.sting ?? voicePriority(key) >= 3;
    if (sting) this.play('sting', { vol: 0.6, rate: 0.9 });
    void this.voiceMod()
      .then((m) => m.sayLine(key, () => this.voiceOut(), sting ? VOICE_AFTER_STING_MS : 0))
      .catch((e: unknown) => warnAudioOnce('announcer voice chunk failed to load', e));
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
      duckFx: this.combat,
      volume: this.muted ? 0 : this.volume * this.fxScale,
      muted: this.muted,
      said: (key, src, gain) => this.saidLine(key, src, gain),
    };
  }

  play(name: SfxName, o: PlayOpts = {}): void {
    if (this.quiet > 0) return;
    this.start(name, o);
  }

  /**
   * A landed hit (audio pass 2, Nov 10): ONE pre-mixed bank sound (transient + body + tail, audio/hitMix.ts) picked by
   * who and what. The player's own hits are the full stack by target (hero, minion or monster, tower) and weight
   * (heavy, crit-sized, or an ability's nature body: sharp, blunt, magic); the player being hit is a thud and a grunt
   * (heavier from a tower or a heavy hit); other fights are a light crack and thump, quieter, and dropped first when
   * the hit voices are full.
   */
  impact(o: ImpactOpts): void {
    if (this.quiet > 0 || this.muted) return;
    if (o.who === 'me') {
      this.playBank(o.heavy ? 'hurtHeavy' : 'hurt', true, o.heavy ? 1.2 : 1, 1);
      return;
    }
    const mine = o.who === 'mine';
    if (!mine) {
      if (o.target === 'structure') this.playBank('hitStructure', false, 0.3, 1.1, o.at);
      else this.playBank('hitOther', false, o.target === 'hero' ? 0.42 : 0.3, o.target === 'hero' ? 1 : 1.12, o.at);
      return;
    }
    if (o.target === 'structure') {
      this.playBank('hitStructure', true, 0.95, 1, o.at);
      return;
    }
    const hero = o.target === 'hero';
    const body = o.nature ? natureBody(o.nature) : 'sharp';
    const kind = o.big ? 'hitCrit' : body === 'magic' ? 'hitMagic' : o.heavy || body === 'blunt' ? 'hitHeavy' : hero ? 'hitHero' : 'hitUnit';
    // the bus compressor lets the player's hero hits run hot; a crit is the loudest thing in a fight
    const vol = o.big ? 1.45 : kind === 'hitHeavy' || kind === 'hitMagic' ? 1.25 : hero ? 1.15 : 0.85;
    this.playBank(kind, true, vol, hero ? 1 : 1.08, o.at);
  }

  /**
   * A basic attack's attacker side: a claw whoosh, a tank's heavy swing, a marksman's thwip or a caster's magic zip,
   * in the hero's own pitch. The player's own is clear; others' are quiet and capped (3 swings at once).
   */
  swing(o: SwingOpts): void {
    if (this.quiet > 0 || this.muted) return;
    this.playBank(STYLE_SOUND[o.style], o.mine, o.mine ? 0.7 : 0.32, heroSwingRate(o.hero), o.at);
  }

  private readonly cardLast = new Float64Array(16).fill(-1e9);

  /**
   * CARD-SKINS.md Legendary skins: a meow layer on a takedown or a purr when the recall lands, at most once per
   * CARD_LAYER_GAP seconds per hero; the player's own louder and unpanned, others' quieter at their position.
   * Returns whether it played.
   */
  cardLayer(kind: 'takedown' | 'recall', hero: number, mine: boolean, at?: { x: number; z: number }): boolean {
    if (this.quiet > 0 || this.muted) return false;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const k = hero & 15;
    if (now - this.cardLast[k] < CARD_LAYER_GAP) return false;
    this.cardLast[k] = now;
    try {
      this.play(kind === 'takedown' ? 'cardMeow' : 'cardPurr', { vol: mine ? 0.55 : 0.3, rate: 1 + (k % 4) * 0.04, ...(mine || !at ? {} : { at: { x: at.x, z: at.z } }) });
    } catch {
      return false; // audio not unlocked yet
    }
    return true;
  }

  /** The player's last hit earned Fish: two bright pings and a shimmer. */
  fishPing(): void {
    if (this.quiet > 0 || this.muted) return;
    this.playBank('fish', true, 0.75, 1);
  }

  /** Bank sounds started (tests, the capture). */
  bankPlays = 0;
  private readonly otherAt = new Map<string, number>();

  /**
   * One hit-bank sound: the next variant with a pitch and volume jitter, through its category's voice cap (the
   * player's own steal from others), into the combat bus (ducked under the announcer). Returns true when it played.
   */
  private playBank(kind: string, mine: boolean, vol: number, rate: number, at?: { x: number; z: number }): boolean {
    const ac = this.ac;
    const s = HIT_BANK[kind];
    if (!ac || !s || !this.combat) return false;
    const now = ac.currentTime;
    // someone else's sound of the same kind at most every OTHER_GAP s (a minion wave's hits do not stack up)
    if (!mine) {
      if (now - (this.otherAt.get(kind) ?? -1) < OTHER_GAP) return false;
      this.otherAt.set(kind, now);
    }
    const slot = this.hitVoices.admit(s.cat, now, mine);
    if (slot < 0) return false;
    const p = this.variation.next(kind);
    const name = bankName(kind, p.variant);
    const r = rate * p.rate;
    const src = this.start(name, { vol: vol * p.vol, rate: r, at }, true);
    if (!src) return false;
    this.hitVoices.set(s.cat, slot, now, (src.buffer?.duration ?? 0.3) / r, mine, src);
    this.bankPlays++;
    return true;
  }

  /**
   * Champion identity layer (CHAMP-IDENTITY.md §4): one sound through the mix rules (per-layer cooldown, voice caps
   * with stealing, layer volume cap, relation gain, ducking), then the usual distance falloff and pan into the sfx bus.
   * Returns true when it played.
   */
  playLayer(req: Omit<MixRequest, 'dur' | 'vol'> & { vol?: number; rate?: number; at?: { x: number; z: number } }): boolean {
    const ac = this.ac;
    const buf = this.bufferOf(req.name);
    if (!ac || !buf || !this.fx || this.muted || this.quiet > 0) return false;
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
  private chain(ac: AudioContext, bus: AudioNode, panned: boolean, combat = false): SfxChain {
    const list = combat ? (panned ? this.chains.combatPanned : this.chains.combatCentre) : panned ? this.chains.panned : this.chains.centre;
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

  /** Start a baked sound. `bank`: a hit-bank sound (its own variation already applied; into the combat bus). */
  private start(name: string, o: PlayOpts, bank = false): AudioBufferSourceNode | null {
    const ac = this.ac;
    const buf = this.bufferOf(name);
    if (!ac || !buf || !this.fx || this.muted) return null;
    const now = ac.currentTime;
    // the same sound at most every 40 ms (a wave of minions should not machine-gun); bank sounds have voice caps
    if (!bank) {
      if (now - (this.lastAt.get(name) ?? -1) < 0.04) return null;
      this.lastAt.set(name, now);
    }
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
      src.playbackRate.value = bank ? (o.rate ?? 1) : (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
      const panned = pan !== 0 && typeof ac.createStereoPanner === 'function';
      const combat = bank && !!this.combat;
      const c = this.chain(ac, combat ? this.combat! : this.fx, panned, combat);
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
      this.probe('sfx', name, src, vol * this.fxScale * (this.muted ? 0 : this.volume));
      src.start();
      return src;
    } catch (e) {
      warnAudioOnce('a sound failed to start', e);
      return null;
    }
  }
}

export const sfx = new Sfx();
