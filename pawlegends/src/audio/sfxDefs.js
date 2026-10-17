// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/audio/sfxDefs.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/audio/sfxDefs.js  (owner: audio) — zzfx parameter arrays (GAME_DESIGN §16.3; tech.md §14) and a node-safe port of
// zzfx 1.4's sample builder (`zzfxSamples`). PERF §3.1 (P:U1): the samples are plain Float32Arrays that need no
// AudioContext, so bake.js builds them on the title in ≤ 2 ms idle slices; the unlock only copies them into
// AudioBuffers. (The zzfx package itself creates an AudioContext at import, before any gesture: it is not imported.)
//
// zzfx 1.4 parameter order:
//   [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump,
//    pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
// shape: 0 sin, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square. filter < 0 = low-pass, > 0 = high-pass (Hz).
// randomness is 0 everywhere: variation comes from the playback rate (seeded), so bakes are deterministic.

/** Every baked PCM runs at this rate; a context at another rate resamples on playback (PERF §3.1). */
export const PCM_RATE = 44100;

/** @type {Record<string, number[]>} */
export const ZZFX_DEFS = {
  /** §16.3 heartbeat: one low thump ("lub"; the "dub" is the same thump, quieter, 0.2 s later). */
  heartThump: [1, 0, 62, 0.004, 0.02, 0.16, 0, 2, -0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.05, 0, -360],
  /** §16.2 crows: a raspy falling "kraa" (fallback for creature/crow_caw_*). */
  crowCaw: [0.8, 0, 640, 0.02, 0.14, 0.12, 2, 2, -2.5, 0, 0, 0, 0, 0.9, 18, 0, 0, 0.7, 0.04, 0, -2600],
  /** §16.3 laugh-build syllable fallback ("hee"), used when the c80_troll/weird slices are not decoded yet. */
  hyenaLaugh: [0.7, 0, 880, 0.01, 0.05, 0.06, 1, 1.5, 4, 0, 0, 0, 0, 0.25, 0, 0, 0, 0.8, 0.02, 0, -3000],
  /** babble fallback blip */
  blip: [0.5, 0, 520, 0.005, 0.03, 0.04, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  /** TT6 the Pink Paw shield: a soft bubble "bloop" as it pops up (layered on the chainmail guardOn). */
  shieldUp: [0.5, 0, 420, 0.005, 0.04, 0.08, 0, 1.6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02, 0, 0],
  /** TT6 a blow lands on the shield: a soft rubbery "boing" (layered on the metal block). */
  shieldBoing: [0.6, 0, 240, 0.005, 0.03, 0.12, 1, 1.2, -3, 0, 120, 0.03, 0, 0, 4, 0, 0, 0.6, 0.03, 0, -2400],
  /** TT6 a parry: a bright two-note chime (layered on the clash and ring). */
  shieldChime: [0.55, 0, 1320, 0.004, 0.06, 0.25, 0, 1, 0, 0, 440, 0.06, 0, 0, 0, 0, 0.04, 0.8, 0.02, 0.1, 0],
  /** TT6 the shield breaks (no Grit left): a soft falling pop. */
  shieldPop: [0.6, 0, 700, 0.004, 0.02, 0.18, 4, 1, -8, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.02, 0, -1800],
  /** ART §9.3: the charge fizzle is a soft noise "pfft" (0.12 s, low-passed at 1.2 kHz), not a digital glitch. */
  pfft: [0.6, 0, 300, 0.008, 0.03, 0.08, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02, 0, -1200],
  /**
   * WA26 / WA §9: a rubber toy squeak (Squeakybones reassembling, Barkus's Big Squeaky Bone on hit): a bright
   * triangle that jumps up and wobbles (modulation), ≈ 0.16 s.
   */
  squeak: [0.55, 0, 1250, 0.01, 0.06, 0.09, 1, 1.4, 0, 0, 380, 0.035, 0, 0, 9, 0, 0, 0.85, 0.02, 0, 0],
};

/** Samples length (s) a def produces (attack + decay + sustain + release + delay). */
export function zzfxDuration(p) {
  const v = (i, d) => (p[i] ?? d);
  return (v(3, 0) || 9 / 44100) + v(18, 0) + v(4, 0) + v(5, 0.1) + v(16, 0);
}

/**
 * zzfx 1.4 `buildSamples` (MIT, © 2019 Frank Force, https://github.com/KilledByAPixel/ZzFX), ported to a pure
 * function: no AudioContext, no globals, randomness ignored (the defs use 0). Returns a Float32Array at `sampleRate`.
 * @param {number[]} params  zzfx parameter array (see the header)
 * @param {number} [sampleRate]
 * @returns {Float32Array}
 */
export function zzfxSamples(params, sampleRate = PCM_RATE) {
  let [volume = 1, , frequency = 220, attack = 0, sustain = 0, release = 0.1, shape = 0, shapeCurve = 1, slide = 0,
    deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0,
    sustainVolume = 1, decay = 0, tremolo = 0, filter = 0] = params;
  const PI2 = Math.PI * 2, abs = Math.abs, sign = (v) => (v < 0 ? -1 : 1);
  let startSlide = slide *= 500 * PI2 / sampleRate / sampleRate;
  let startFrequency = frequency *= PI2 / sampleRate;
  let modOffset = 0, repeat = 0, crush = 0, jump = 1, t = 0, i = 0, s = 0, f;
  // biquad LP / HP
  const quality = 2, w = PI2 * abs(filter) * 2 / sampleRate, cos = Math.cos(w), alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0, b1 = -(sign(filter) + cos) / a0, b2 = b0;
  let x2 = 0, x1 = 0, y2 = 0, y1 = 0;
  attack = attack * sampleRate || 9;
  decay *= sampleRate; sustain *= sampleRate; release *= sampleRate; delay *= sampleRate;
  deltaSlide *= 500 * PI2 / sampleRate ** 3;
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = repeatTime * sampleRate | 0;
  const length = attack + decay + sustain + release + delay | 0;
  const b = new Float32Array(length > 0 ? length : 0);
  for (; i < length; b[i++] = s * volume) {
    if (!(++crush % (bitCrush * 100 | 0))) {
      s = shape ? shape > 1 ? shape > 2 ? shape > 3 ? shape > 4
        ? (t / PI2 % 1 < shapeCurve / 2 ? 1 : -1)
        : Math.sin(t ** 3)
        : Math.max(Math.min(Math.tan(t), 1), -1)
        : 1 - (2 * t / PI2 % 2 + 2) % 2
        : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);
      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack ? i / attack
          : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain ? sustainVolume
              : i < length - delay ? (length - i - delay) / release * sustainVolume
                : 0);
      s = delay ? s / 2 + (delay > i ? 0 : (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2 / volume) : s;
      if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * (i * i * PI2 % 2 - 1);
    if (jump && ++jump > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; jump = 0; }
    if (repeatTime && !(++repeat % repeatTime)) { frequency = startFrequency; slide = startSlide; jump ||= 1; }
  }
  return b;
}

/**
 * Copy mono PCM into an AudioBuffer of `ac` (PERF §3.1: the unlock is a memcpy per def). The buffer keeps the PCM's
 * own rate; Web Audio resamples on playback.
 * @param {BaseAudioContext} ac @param {Float32Array} pcm @param {number} [rate]
 * @returns {AudioBuffer|null}
 */
export function pcmBuffer(ac, pcm, rate = PCM_RATE) {
  if (!pcm?.length) return null;
  const b = ac.createBuffer(1, pcm.length, rate);
  if (typeof b.copyToChannel === 'function') b.copyToChannel(pcm, 0); else b.getChannelData(0).set(pcm);
  return b;
}

/**
 * Bake every def into an AudioBuffer of `ac` (synchronous fallback for code that has no prebaked PCM).
 * Resolves to Map<name, AudioBuffer>; never rejects.
 * @param {BaseAudioContext} ac @param {Record<string, number[]>} [defs]
 */
export async function bakeZzfx(ac, defs = ZZFX_DEFS) {
  const out = new Map();
  for (const [name, params] of Object.entries(defs)) {
    try { const b = pcmBuffer(ac, zzfxSamples(params)); if (b) out.set(name, b); } catch (e) { console.warn(`[audio] zzfx bake failed: ${name}`, e?.message ?? e); }
  }
  return out;
}
