/**
 * The clip's soundtrack (GDD 9.1, 10), rendered offline with WebAudio synth only: a 140 BPM kick / bass / hat loop,
 * an engine purr that climbs through the highlight, a whoosh on every cut, the slow-motion drop at the finish and a
 * 1 s sting on the end card. Returns null when OfflineAudioContext is missing (the clip is then silent).
 */
import { CLIP_S, FINISH_S, HIGHLIGHT_S, INTRO_S } from './highlight';

const SR = 44_100;

export async function renderClipAudio(cuts: readonly number[] = []): Promise<AudioBuffer | null> {
  const Ctx = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Ctx) return null;
  try {
    const ctx = new Ctx(2, Math.ceil(CLIP_S * SR), SR);
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.connect(master);

    const beat = 60 / 140;
    const hlStart = INTRO_S;
    const finStart = INTRO_S + HIGHLIGHT_S;
    const endStart = finStart + FINISH_S;

    // noise buffer for hats and whooshes
    const noise = ctx.createBuffer(1, SR, SR);
    const nd = noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < nd.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      nd[i] = (seed / 0x3fffffff - 1) * 0.9;
    }

    const kick = (t: number, g = 0.9) => {
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      a.gain.setValueAtTime(g, t);
      a.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(a).connect(comp);
      o.start(t);
      o.stop(t + 0.25);
    };
    const hat = (t: number, g = 0.12) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const a = ctx.createGain();
      a.gain.setValueAtTime(g, t);
      a.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f).connect(a).connect(comp);
      s.start(t, (t * 7.3) % 0.8, 0.06);
    };
    const bass = (t: number, freq: number, dur: number, g = 0.22) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(220, t + dur);
      const a = ctx.createGain();
      a.gain.setValueAtTime(g, t);
      a.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f).connect(a).connect(comp);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const whoosh = (t: number, dur = 0.35, g = 0.3) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(5000, t + dur);
      const a = ctx.createGain();
      a.gain.setValueAtTime(0.001, t);
      a.gain.exponentialRampToValueAtTime(g, t + dur * 0.6);
      a.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(a).connect(comp);
      s.start(t, 0.1, dur + 0.05);
    };
    const tone = (t: number, freq: number, dur: number, type: OscillatorType = 'square', g = 0.12) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const a = ctx.createGain();
      a.gain.setValueAtTime(0.001, t);
      a.gain.exponentialRampToValueAtTime(g, t + 0.01);
      a.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(a).connect(comp);
      o.start(t);
      o.stop(t + dur + 0.02);
    };

    // intro: a meow-ish horn (two gliding squares) then the countdown blip
    const horn = ctx.createOscillator();
    horn.type = 'square';
    horn.frequency.setValueAtTime(520, 0.05);
    horn.frequency.exponentialRampToValueAtTime(820, 0.25);
    horn.frequency.exponentialRampToValueAtTime(430, 0.6);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.001, 0.05);
    hg.gain.exponentialRampToValueAtTime(0.16, 0.1);
    hg.gain.exponentialRampToValueAtTime(0.001, 0.65);
    horn.connect(hg).connect(comp);
    horn.start(0.05);
    horn.stop(0.7);
    tone(0.9, 660, 0.12);
    tone(1.2, 990, 0.25);

    // music through the highlight (and quieter under the finish)
    const roots = [55, 55, 65.4, 49];
    for (let t = hlStart, i = 0; t < endStart; t += beat / 2, i++) {
      const slow = t >= finStart;
      const step = slow ? beat * 1.25 : beat / 2;
      if (slow && i % 2 === 1) continue;
      if (i % 2 === 0) kick(t, slow ? 0.5 : 0.9);
      hat(t + (slow ? 0 : beat / 4), slow ? 0.05 : 0.12);
      const bar = Math.floor((t - hlStart) / (beat * 4)) % roots.length;
      bass(t, roots[bar] * (i % 4 === 3 ? 2 : 1), Math.min(step, beat / 2) * 0.9, slow ? 0.12 : 0.22);
    }

    // engine purr rising through the highlight, a drop into the slow motion
    const eng = ctx.createOscillator();
    eng.type = 'sawtooth';
    eng.frequency.setValueAtTime(70, hlStart);
    eng.frequency.linearRampToValueAtTime(130, finStart - 0.1);
    eng.frequency.exponentialRampToValueAtTime(45, finStart + 0.5);
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 600;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.001, hlStart - 0.2);
    eg.gain.exponentialRampToValueAtTime(0.07, hlStart + 0.1);
    eg.gain.setValueAtTime(0.07, endStart - 0.2);
    eg.gain.exponentialRampToValueAtTime(0.001, endStart);
    eng.connect(ef).connect(eg).connect(comp);
    eng.start(hlStart - 0.2);
    eng.stop(endStart + 0.05);

    for (const c of [hlStart, finStart, ...cuts]) whoosh(Math.max(0, c - 0.2));

    // end-card sting (major arpeggio + a cymbal swell)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(endStart + 0.05 + i * 0.09, f, 0.5 + (3 - i) * 0.05, 'square', 0.1));
    whoosh(endStart, 0.9, 0.18);

    return await ctx.startRendering();
  } catch {
    return null;
  }
}
