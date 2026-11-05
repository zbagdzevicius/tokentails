/**
 * The announcer's voice (LoL pass, lane B): "First Blood", "Double Pounce", "Ace", "Victory"... Loaded with a dynamic
 * import on the first announced line (audio/sfx.ts `voice`), so it is never in the first-load JS.
 *
 * Source per line: a recorded clip at public/voice/<key>.mp3 when public/voice/manifest.json lists it (no request for
 * a clip that is not there), else the browser's speech synthesis (low pitch, a little fast, an English voice when one
 * exists). One line at a time: the newest wins, and lines start at most VOICE_GAP_MS apart. Mute and the sound-effects
 * volume apply. Render side only; never feeds the sim.
 */
import type { VoiceKey } from '../render/announcer';

/** What each line says when no clip is recorded. */
export const VOICE_TEXT: Readonly<Record<VoiceKey, string>> = Object.freeze({
  firstBlood: 'First blood!',
  double: 'Double pounce!',
  triple: 'Triple pounce!',
  catastrophe: 'Cat-astrophe!',
  shutdown: 'Shut down!',
  ace: 'Ace!',
  turret: 'Turret destroyed!',
  ourTurret: 'Our turret has been destroyed.',
  victory: 'Victory!',
  defeat: 'Defeat.',
  slain: 'You have been slain.',
});

/** Two lines never start closer than this (ms); a newer line waiting for its turn replaces an older one. */
export const VOICE_GAP_MS = 1200;

export interface VoiceOut {
  /** The audio context and the bus to play clips into (null: speech only). */
  ctx: AudioContext | null;
  bus: AudioNode | null;
  /** 0..1 (sound-effects volume × master); 0 or muted says nothing. */
  volume: number;
  muted: boolean;
}

/**
 * The scheduler, pure (time passed in): `want(key, now)` returns the line to start now, or null when it must wait;
 * `due(now)` returns a waiting line once its turn has come. Exported for tests.
 */
export class VoiceGate {
  private lastAt = -1e9;
  private pending: VoiceKey | null = null;

  want(key: VoiceKey, now: number): VoiceKey | null {
    if (now - this.lastAt >= VOICE_GAP_MS) {
      this.lastAt = now;
      this.pending = null;
      return key;
    }
    this.pending = key;
    return null;
  }

  /** ms until the waiting line may start (−1 none waiting). */
  waitMs(now: number): number {
    return this.pending ? Math.max(0, this.lastAt + VOICE_GAP_MS - now) : -1;
  }

  due(now: number): VoiceKey | null {
    if (!this.pending || now - this.lastAt < VOICE_GAP_MS) return null;
    const k = this.pending;
    this.pending = null;
    this.lastAt = now;
    return k;
  }
}

const BASE = (() => {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
})();

let manifest: Promise<ReadonlySet<string>> | null = null;
function clips(): Promise<ReadonlySet<string>> {
  manifest ??= fetch(`${BASE}voice/manifest.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) => new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []))
    .catch(() => new Set<string>());
  return manifest;
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();
function clip(ctx: AudioContext, key: VoiceKey): Promise<AudioBuffer | null> {
  let p = buffers.get(key);
  if (!p) {
    p = fetch(`${BASE}voice/${key}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
    buffers.set(key, p);
  }
  return p;
}

let speechVoice: SpeechSynthesisVoice | null | undefined;
function englishVoice(): SpeechSynthesisVoice | null {
  if (speechVoice !== undefined && speechVoice !== null) return speechVoice;
  try {
    const list = speechSynthesis.getVoices();
    speechVoice = list.find((v) => /^en(-|_|$)/i.test(v.lang) && /male|daniel|alex|fred|google uk english male/i.test(v.name)) ?? list.find((v) => /^en/i.test(v.lang)) ?? null;
  } catch {
    speechVoice = null;
  }
  return speechVoice;
}

let playing: AudioBufferSourceNode | null = null;

function speak(key: VoiceKey, out: VoiceOut): void {
  try {
    playing?.stop();
  } catch {
    /* already ended */
  }
  playing = null;
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  try {
    synth?.cancel();
  } catch {
    /* best effort */
  }
  void clips().then(async (have) => {
    if (out.muted || out.volume <= 0.01) return;
    if (have.has(key) && out.ctx && out.bus) {
      const buf = await clip(out.ctx, key);
      if (buf) {
        try {
          const src = out.ctx.createBufferSource();
          src.buffer = buf;
          const g = out.ctx.createGain();
          g.gain.value = 1;
          src.connect(g);
          g.connect(out.bus);
          src.start();
          playing = src;
          return;
        } catch {
          /* fall through to speech */
        }
      }
    }
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(VOICE_TEXT[key]);
      u.pitch = 0.8;
      u.rate = 1.05;
      u.volume = Math.max(0, Math.min(1, out.volume));
      u.lang = 'en-US';
      const v = englishVoice();
      if (v) u.voice = v;
      synth.speak(u);
    } catch {
      /* speech is best effort */
    }
  });
}

const gate = new VoiceGate();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Say `key` (newest wins; at most one line per VOICE_GAP_MS). `out()` is read when the line actually starts. */
export function sayLine(key: VoiceKey, out: () => VoiceOut): void {
  const now = performance.now();
  const go = gate.want(key, now);
  if (go) {
    speak(go, out());
    return;
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const k = gate.due(performance.now());
    if (k) speak(k, out());
  }, gate.waitMs(now) + 5);
}
