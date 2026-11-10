/**
 * The announcer's lines and the voice queue, pure (no audio, no DOM, time passed in), so a unit test drives them.
 * The clips are recorded (an original designed voice, Qwen3-TTS, Apache-2.0) at public/voice/<key>.mp3 and listed in
 * public/voice/manifest.json; audio/voice.ts plays them. A key with no clip says nothing: there is no speech
 * synthesis fallback.
 *
 * Small enough to sit in the first-load chunk (audio/sfx.ts reads the priorities for the sting); the decoding and
 * playback stay in the lazy audio/voice.ts.
 */

/** Lines with a fixed text (hero lines are built from the hero id below). */
export const VOICE_LINES = Object.freeze([
  // already called by the game before the recorded voice
  'firstBlood',
  'double',
  'triple',
  'catastrophe',
  'shutdown',
  'ace',
  'turret',
  'ourTurret',
  'victory',
  'defeat',
  'slain',
  // announcer lines on banners that had no voice
  'aceUs',
  'welcome',
  'gatesSoon',
  'gatesOpen',
  'streak3',
  'streak4',
  'streak5',
  'streak6',
  'cleanSweep',
  'allySlain',
  'bountyMe',
  'frenzySpawn',
  'frenzyThem',
  'puddingWild',
  'puddingOurs',
  'puddingTheirs',
  'packPower',
  'comebackUs',
  'comebackThem',
  'sunset',
  'suddenDeath',
  'coreAttacked',
  'coreFalling',
  'theirCoreAttacked',
  'theirCoreFalling',
  // recorded, said rarely or not yet (takedown and assist would fire on every kill)
  'takedown',
  'assist',
  'enemySlain',
  'frenzyMe',
  'ultReady',
  'geared',
] as const);

export type VoiceLine = (typeof VOICE_LINES)[number];
/** "Clem is on a roll!", "Bounty on Clem!", "Clem!" (the hero id after the underscore). */
export type HeroVoiceLine = `onRoll_${string}` | `bounty_${string}` | `name_${string}`;
export type VoiceKey = VoiceLine | HeroVoiceLine;

export const onRollLine = (hero: string): VoiceKey => `onRoll_${hero}`;
export const bountyLine = (hero: string): VoiceKey => `bounty_${hero}`;
export const nameLine = (hero: string): VoiceKey => `name_${hero}`;

/**
 * Priority 1..5: a higher line goes first, and 5 (the result) cuts whatever is playing. Kept apart from loudness:
 * the clips are levelled to the same loudness, the delivery carries the energy.
 */
const PRIORITY: Readonly<Record<VoiceLine, number>> = Object.freeze({
  victory: 5,
  defeat: 5,
  ace: 4,
  aceUs: 4,
  catastrophe: 4,
  triple: 4,
  coreFalling: 4,
  theirCoreFalling: 4,
  suddenDeath: 4,
  firstBlood: 3,
  double: 3,
  shutdown: 3,
  slain: 3,
  cleanSweep: 3,
  streak5: 3,
  streak6: 3,
  turret: 3,
  ourTurret: 3,
  gatesOpen: 3,
  welcome: 3,
  streak3: 2,
  streak4: 2,
  allySlain: 2,
  bountyMe: 2,
  frenzySpawn: 2,
  frenzyThem: 2,
  puddingWild: 2,
  puddingOurs: 2,
  puddingTheirs: 2,
  sunset: 2,
  coreAttacked: 2,
  theirCoreAttacked: 2,
  gatesSoon: 2,
  packPower: 1,
  comebackUs: 1,
  comebackThem: 1,
  takedown: 1,
  assist: 1,
  enemySlain: 1,
  frenzyMe: 1,
  ultReady: 1,
  geared: 1,
});

export function voicePriority(key: VoiceKey): number {
  if (key.startsWith('onRoll_') || key.startsWith('bounty_')) return 2;
  if (key.startsWith('name_')) return 1;
  return PRIORITY[key as VoiceLine] ?? 1;
}

/** The result cuts any line that is playing. */
export const VOICE_CUT_PRIORITY = 5;
/** Silence between two lines (ms), after the first one ends. */
export const VOICE_GAP_MS = 220;
/** How long a line still in the queue is worth saying, by priority (ms); after that it is dropped. */
export const VOICE_STALE_MS: Readonly<Record<number, number>> = Object.freeze({ 1: 1500, 2: 2500, 3: 3500, 4: 4500, 5: 10000 });
/** Lines waiting at most (the oldest of the lowest priority goes first). */
export const VOICE_QUEUE_MAX = 3;
/** Until the clip's length is known, a started line holds the voice this long (ms). */
export const VOICE_HOLD_MS = 1500;
/**
 * A higher line that arrives this soon after a lower one started (the same moment: one sim tick plus the manifest
 * read) cuts it, and the lower one waits its turn again: the same moment's "An ally has been slain" must not delay
 * "First Blood" (audio fix, Nov 9). Later than this a lower line never cuts.
 */
export const VOICE_FRESH_CUT_MS = 80;

/** Lines whose newer self replaces the one playing (browsing heroes says only the last name). */
const replaces = (playing: VoiceKey, next: VoiceKey): boolean => playing.startsWith('name_') && next.startsWith('name_');

interface Waiting {
  key: VoiceKey;
  prio: number;
  at: number;
}

export interface VoiceStart {
  key: VoiceKey;
  /** Stop the line playing first. */
  cut: boolean;
}

/**
 * One line at a time, highest priority first, newest first within a priority. A line that waited longer than its
 * VOICE_STALE_MS is dropped (a "Double pounce!" four seconds late is noise). A queued line of the same key is only
 * refreshed. Time in ms from any clock.
 */
export class VoiceQueue {
  private playing: { key: VoiceKey; prio: number; at: number } | null = null;
  /** The voice is free from this time (the line's end plus the gap). */
  private freeAt = -1e9;
  private readonly waiting: Waiting[] = [];

  /** A line wants to be said: returns it to start now, or null (queued or dropped). */
  push(key: VoiceKey, now: number): VoiceStart | null {
    const prio = voicePriority(key);
    const busy = now < this.freeAt;
    if (!busy) return this.begin(key, prio, now, false);
    if (this.playing && (prio >= VOICE_CUT_PRIORITY ? this.playing.prio < VOICE_CUT_PRIORITY : replaces(this.playing.key, key))) {
      return this.begin(key, prio, now, true);
    }
    if (this.playing && prio > this.playing.prio && now - this.playing.at <= VOICE_FRESH_CUT_MS && this.playing.key !== key) {
      // the cut line goes back to wait (as if just said: its staleness counts from now)
      const cut = this.playing;
      if (!this.waiting.some((w) => w.key === cut.key)) this.waiting.push({ key: cut.key, prio: cut.prio, at: now });
      return this.begin(key, prio, now, true);
    }
    if (this.playing?.key === key) return null;
    const same = this.waiting.find((w) => w.key === key);
    if (same) {
      same.at = now;
      return null;
    }
    this.waiting.push({ key, prio, at: now });
    if (this.waiting.length > VOICE_QUEUE_MAX) {
      let worst = 0;
      for (let i = 1; i < this.waiting.length; i++) {
        const w = this.waiting[i];
        const b = this.waiting[worst];
        if (w.prio < b.prio || (w.prio === b.prio && w.at < b.at)) worst = i;
      }
      this.waiting.splice(worst, 1);
    }
    return null;
  }

  /** The line that may start now (stale ones dropped), or null. */
  next(now: number): VoiceStart | null {
    if (now < this.freeAt) return null;
    this.prune(now);
    if (!this.waiting.length) {
      this.playing = null;
      return null;
    }
    let best = 0;
    for (let i = 1; i < this.waiting.length; i++) {
      const w = this.waiting[i];
      const b = this.waiting[best];
      if (w.prio > b.prio || (w.prio === b.prio && w.at > b.at)) best = i;
    }
    const [w] = this.waiting.splice(best, 1);
    return this.begin(w.key, w.prio, now, false);
  }

  /** The started line's clip is `ms` long (or was missing: 0), so the voice is free at its end plus the gap. */
  length(key: VoiceKey, startedAt: number, ms: number): void {
    if (this.playing?.key !== key) return;
    this.freeAt = ms > 0 ? startedAt + ms + VOICE_GAP_MS : startedAt;
  }

  /** ms until next() may give a line (−1: nothing waits). */
  waitMs(now: number): number {
    return this.waiting.length ? Math.max(0, this.freeAt - now) : -1;
  }

  /** Lines waiting (tests, e2e). */
  get queued(): readonly VoiceKey[] {
    return this.waiting.map((w) => w.key);
  }

  get current(): VoiceKey | null {
    return this.playing?.key ?? null;
  }

  /** Forget everything (mute, a match ends). */
  clear(): void {
    this.waiting.length = 0;
    this.playing = null;
    this.freeAt = -1e9;
  }

  private prune(now: number): void {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i];
      if (now - w.at > (VOICE_STALE_MS[w.prio] ?? 2500)) this.waiting.splice(i, 1);
    }
  }

  private begin(key: VoiceKey, prio: number, now: number, cut: boolean): VoiceStart {
    this.playing = { key, prio, at: now };
    this.freeAt = now + VOICE_HOLD_MS;
    return { key, cut };
  }
}

/** The lines a match can say, for the preload at its start: the fixed ones plus the six heroes' lines. */
export function matchVoiceKeys(heroes: readonly string[]): VoiceKey[] {
  const out: VoiceKey[] = VOICE_LINES.filter((k) => voicePriority(k) >= 2);
  for (const h of new Set(heroes)) out.push(onRollLine(h), bountyLine(h));
  return out;
}
