// Every sound effect, synthesised with WebAudio and driven by game events (no direct calls from other lanes).
// One-shots: jump, pounce (+ a chirpy meow), land, slide, fast fall, fish (pitch climbs with the multiplier), bell,
// yarn / treats ("nom nom"), hit (an indignant "mrrow"), puddle splash + wet shake, tail boing, cloud poof, dog
// barks, near-miss whoosh, checkpoint chime, respawn, the victory meow and UI clicks.
// Loops (gain follows the game state every frame): river surf, claw scratching on walls, wind at speed / in the
// air, and the yarn-ball rumble.
import { events } from '../core/events';
import { addFrameHook } from '../core/loop';
import { P } from '../core/player';
import { game } from '../core/state';
import { audio, env, tone } from './synth';

const last: Record<string, number> = {};
/** rate limiter: false if the same sound played less than gap seconds ago */
function gate(id: string, gap: number): boolean {
  const A = audio();
  if (!A) return false;
  const now = A.ctx.currentTime;
  if (now - (last[id] ?? -9) < gap) return false;
  last[id] = now;
  return true;
}

/** A filtered noise burst. */
function hiss(dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q = 1, at?: number): void {
  const A = audio();
  if (!A) return;
  const c = A.ctx;
  const t = at ?? c.currentTime;
  const src = c.createBufferSource();
  src.buffer = A.noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  env(g, peak, Math.min(0.02, dur * 0.2), dur, t);
  src.connect(f).connect(g).connect(A.sfx);
  src.start(t, Math.random() * 1.5, dur + 0.1);
}

/**
 * A cartoon cat voice: a sawtooth with a pitch contour through two formant band-passes that glide from "mi" to
 * "ow". pitch = base Hz, len seconds, shape: 'meow' | 'mrrp' (short trill) | 'mrow' (indignant, falling).
 */
export function meow(pitch = 620, len = 0.36, shape: 'meow' | 'mrrp' | 'mrow' = 'meow', vol = 0.16): void {
  const A = audio();
  if (!A) return;
  const c = A.ctx;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  const f = o.frequency;
  if (shape === 'meow') {
    f.setValueAtTime(pitch * 0.8, t);
    f.exponentialRampToValueAtTime(pitch * 1.15, t + len * 0.35);
    f.exponentialRampToValueAtTime(pitch * 0.7, t + len);
  } else if (shape === 'mrrp') {
    f.setValueAtTime(pitch * 0.85, t);
    f.exponentialRampToValueAtTime(pitch * 1.3, t + len);
  } else {
    f.setValueAtTime(pitch * 1.2, t);
    f.exponentialRampToValueAtTime(pitch * 1.35, t + len * 0.2);
    f.exponentialRampToValueAtTime(pitch * 0.55, t + len);
  }
  // trill for mrrp: amplitude flutter
  const trem = c.createGain();
  trem.gain.value = 1;
  if (shape === 'mrrp') {
    const lfo = c.createOscillator();
    lfo.frequency.value = 28;
    const lg = c.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + len + 0.05);
  }
  const f1 = c.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 5;
  f1.frequency.setValueAtTime(380, t);
  f1.frequency.exponentialRampToValueAtTime(820, t + len * 0.5);
  const f2 = c.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 7;
  f2.frequency.setValueAtTime(2300, t);
  f2.frequency.exponentialRampToValueAtTime(1150, t + len * 0.7);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(trem);
  trem.connect(f1).connect(g);
  trem.connect(f2).connect(g);
  g.connect(A.sfx);
  o.start(t);
  o.stop(t + len + 0.05);
}

/** A goofy big-dog "woof". */
export function woof(at = 0, pitch = 1): void {
  const A = audio();
  if (!A) return;
  const c = A.ctx;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(210 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(320 * pitch, t + 0.04);
  o.frequency.exponentialRampToValueAtTime(130 * pitch, t + 0.2);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(420, t + 0.2);
  bp.Q.value = 2.2;
  const g = c.createGain();
  env(g, 0.5, 0.012, 0.22, t);
  o.connect(bp).connect(g).connect(A.sfx);
  o.start(t);
  o.stop(t + 0.3);
  hiss(0.12, 0.12, 'bandpass', 900, 500, 1.5, t);
}

function chime(freqs: number[], gap: number, peak: number, decay = 0.5): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime;
  freqs.forEach((f, i) => {
    tone('sine', f, decay, peak, { at: t + i * gap });
    tone('sine', f * 2.76, decay * 0.4, peak * 0.22, { at: t + i * gap });
  });
}

function boing(): void {
  const A = audio();
  if (!A) return;
  const c = A.ctx;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(620, t + 0.35);
  const lfo = c.createOscillator();
  lfo.frequency.setValueAtTime(22, t);
  lfo.frequency.linearRampToValueAtTime(9, t + 0.5);
  const lg = c.createGain();
  lg.gain.setValueAtTime(120, t);
  lg.gain.exponentialRampToValueAtTime(5, t + 0.55);
  lfo.connect(lg).connect(o.frequency);
  const g = c.createGain();
  env(g, 0.22, 0.01, 0.55, t);
  o.connect(g).connect(A.sfx);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.62);
  lfo.stop(t + 0.62);
}

// ---------- loops ----------
interface Loop {
  gain: GainNode;
  level: number;
  lfo?: OscillatorNode;
}
const loops: Record<string, Loop> = {};

function makeLoop(id: string, build: (A: NonNullable<ReturnType<typeof audio>>, out: GainNode) => void): void {
  const A = audio();
  if (!A || loops[id]) return;
  const g = A.ctx.createGain();
  g.gain.value = 0;
  g.connect(A.sfx);
  build(A, g);
  loops[id] = { gain: g, level: 0 };
}
function noiseSrc(A: NonNullable<ReturnType<typeof audio>>): AudioBufferSourceNode {
  const s = A.ctx.createBufferSource();
  s.buffer = A.noiseBuf;
  s.loop = true;
  s.start();
  return s;
}
function initLoops(): void {
  // river: a band-passed rush with a slow swell plus a gurgle
  makeLoop('river', (A, out) => {
    const c = A.ctx;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.7;
    const lg = c.createGain();
    lg.gain.value = 350;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start();
    noiseSrc(A).connect(bp).connect(out);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const hg = c.createGain();
    hg.gain.value = 0.35;
    noiseSrc(A).connect(hp).connect(hg).connect(out);
  });
  // claws: bright scratchy noise, chopped at the stride rate
  makeLoop('claws', (A, out) => {
    const c = A.ctx;
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3800;
    hp.Q.value = 1.5;
    const chop = c.createGain();
    chop.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 14;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(chop.gain);
    lfo.start();
    noiseSrc(A).connect(hp).connect(chop).connect(out);
    loops.claws = { gain: out, level: 0, lfo };
  });
  // wind: low rumble of air at speed, in the air and on the cloud
  makeLoop('wind', (A, out) => {
    const c = A.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.31;
    const lg = c.createGain();
    lg.gain.value = 220;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start();
    noiseSrc(A).connect(lp).connect(out);
  });
  // yarn ball: a deep rolling rumble with a wobble
  makeLoop('rumble', (A, out) => {
    const c = A.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    lp.Q.value = 2;
    noiseSrc(A).connect(lp).connect(out);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 42;
    const og = c.createGain();
    og.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 3.2;
    const lg = c.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg).connect(og.gain);
    o.connect(og).connect(out);
    o.start();
    lfo.start();
  });
}
function setLoop(id: string, level: number): void {
  const L = loops[id];
  const A = audio();
  if (!L || !A) return;
  if (Math.abs(L.level - level) < 0.015) return;
  L.level = level;
  L.gain.gain.setTargetAtTime(level, A.ctx.currentTime, 0.08);
}

let yarnChase = false;
let dogChase = false;
let patterT = 0;

/** Soft UI click (meta-ui buttons get it automatically through a capture listener). */
export function uiClick(): void {
  if (!gate('ui', 0.04)) return;
  tone('triangle', 1100, 0.05, 0.08, { to: 700 });
  hiss(0.03, 0.05, 'highpass', 4000, 3000);
}

export function initSfx(): void {
  events.on('jump', () => {
    if (!gate('jump', 0.05)) return;
    tone('triangle', 330, 0.14, 0.16, { to: 720 });
    tone('sine', 660, 0.08, 0.06, { to: 1100 });
    hiss(0.08, 0.05, 'highpass', 2500, 5000);
  });
  events.on('pounce', () => {
    hiss(0.25, 0.14, 'bandpass', 600, 3200, 1.2);
    tone('square', 500, 0.12, 0.05, { to: 1300 });
    if (gate('meowPounce', 0.6)) meow(680 + Math.random() * 80, 0.18, 'mrrp', 0.11);
  });
  events.on('land', (e) => {
    if (!gate('land', 0.06)) return;
    const k = Math.min(1, e.impact / 25);
    if (P.surface === 'river') {
      hiss(0.3, 0.14 + k * 0.1, 'bandpass', 1400, 500, 0.8);
      return;
    }
    if (P.ability === 'cloud') {
      hiss(0.2, 0.08, 'lowpass', 1200, 200);
      return;
    }
    tone('sine', 150, 0.1 + k * 0.08, 0.1 + k * 0.18, { to: 60 });
    hiss(0.08 + k * 0.08, 0.05 + k * 0.08, 'lowpass', 1800, 300);
    if (P.surface === 'bridge') tone('square', 240, 0.05, 0.05, { to: 180 });
  });
  events.on('slide', (e) => {
    if (!e.on) return;
    hiss(0.42, 0.12, 'bandpass', 2400, 700, 0.9);
  });
  events.on('fastFall', () => tone('sine', 900, 0.18, 0.06, { to: 260 }));
  events.on('pickup', (e) => {
    const A = audio();
    if (!A) return;
    if (e.kind === 'fish') {
      if (!gate('fish', 0.03)) return;
      // the pitch climbs a pentatonic ladder with the multiplier (a fish line plays a little run)
      const m = Math.max(0, currentMult - 2) % 10;
      const semis = [0, 2, 4, 7, 9][m % 5] + 12 * Math.floor(m / 5);
      const base = 784 * Math.pow(2, semis / 12);
      tone('square', base, 0.06, 0.05, { to: base * 1.02 });
      tone('sine', base * 1.5, 0.12, 0.09, { at: A.ctx.currentTime + 0.05 });
    } else if (e.kind === 'bell') {
      // handled by the 'bell' event (it knows the count)
    } else {
      if (!gate('nom', 0.08)) return;
      // "nom nom": two chewy formant blips
      for (let i = 0; i < 2; i++) {
        const t = A.ctx.currentTime + i * 0.11;
        const o = A.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(260 + i * 30, t);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.08);
        const bp = A.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(1100, t + 0.08);
        bp.Q.value = 4;
        const g = A.ctx.createGain();
        env(g, 0.22, 0.01, 0.09, t);
        o.connect(bp).connect(g).connect(A.sfx);
        o.start(t);
        o.stop(t + 0.12);
      }
      tone('triangle', 1320, 0.12, 0.05, { at: A.ctx.currentTime + 0.22, to: 1760 });
    }
  });
  events.on('bell', (e) => {
    const base = 1046 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11][Math.min(6, e.count - 1)] / 12);
    chime([base, base * 1.5, base * 2], 0.07, 0.11, 0.9);
    hiss(0.5, 0.03, 'highpass', 7000, 9000);
    if (e.count === e.total) setTimeout(() => chime([1046, 1318, 1568, 2093, 2637], 0.08, 0.09, 1), 350);
  });
  events.on('mult', (e) => {
    currentMult = e.value;
    if (e.value > 1 && e.value % 10 === 0 && gate('mult10', 0.5)) chime([1568, 1976, 2349, 3136], 0.05, 0.06, 0.4);
  });
  events.on('hit', (e) => {
    tone('sawtooth', 220, 0.22, 0.12, { to: 70 });
    hiss(0.2, 0.18, 'lowpass', 2000, 200);
    if (e.label !== 'fall') meow(560, 0.3, 'mrow', 0.15);
    else meow(700, 0.6, 'mrow', 0.14);
  });
  events.on('fall', () => tone('sine', 900, 0.6, 0.08, { to: 120 }));
  events.on('wet', () => {
    hiss(0.35, 0.22, 'bandpass', 1800, 400, 0.9);
    tone('sine', 520, 0.12, 0.06, { to: 260 });
    setTimeout(() => meow(760, 0.22, 'mrow', 0.1), 120);
    // shake-shake-shake: three fluttery bursts
    const A = audio();
    if (!A) return;
    for (let i = 0; i < 3; i++) hiss(0.12, 0.08, 'bandpass', 2600, 1800, 2, A.ctx.currentTime + 0.45 + i * 0.16);
  });
  events.on('abilityStart', (e) => {
    if (e.id === 'vault') boing();
    else if (e.id === 'cloud') {
      hiss(0.6, 0.2, 'lowpass', 2500, 180, 0.7);
      chime([784, 988, 1175], 0.06, 0.05, 0.5);
      meow(720, 0.3, 'meow', 0.1);
    }
  });
  events.on('abilityEnd', (e) => {
    if (e.id === 'cloud') hiss(0.4, 0.12, 'lowpass', 1600, 200);
  });
  events.on('surface', (e) => {
    if (e.kind === 'river' && e.prev !== 'river') hiss(0.4, 0.18, 'bandpass', 1200, 500, 0.7);
    if (e.kind === 'wall' && e.prev !== 'wall') {
      hiss(0.2, 0.1, 'highpass', 3000, 5000);
      tone('square', 1400, 0.05, 0.04, { to: 2200 });
    }
  });
  events.on('nearMiss', () => {
    if (!gate('near', 0.15)) return;
    hiss(0.28, 0.16, 'bandpass', 3200, 500, 2.5);
    if (dogChase && gate('nearBark', 1)) woof(0.1, 1.05);
  });
  events.on('checkpoint', (e) => {
    if (e.index > 0) chime([1318, 1760], 0.09, 0.07, 0.45);
  });
  events.on('respawn', () => {
    hiss(0.35, 0.12, 'bandpass', 400, 2400, 1.5);
    tone('triangle', 520, 0.18, 0.1, { to: 1040 });
  });
  events.on('lifeLost', () => meow(480, 0.55, 'mrow', 0.13));
  events.on('chase', (e) => {
    if (e.kind === 'dog') {
      dogChase = e.on;
      if (e.on) {
        woof(0, 1);
        woof(0.25, 1.08);
      }
    } else if (e.kind === 'yarn' || e.kind === 'boulder' || e.kind === 'hay') {
      yarnChase = e.on;
    }
  });
  events.on('setPiece', (e) => {
    if (e.id === 'dog' && (e.phase === 'bark' || e.phase === 'start')) woof(0, 0.95 + Math.random() * 0.15);
  });
  events.on('finishLine', () => setTimeout(() => meow(760, 0.5, 'meow', 0.14), 700));
  events.on('stageStart', () => {
    dogChase = false;
    yarnChase = false;
    currentMult = 1;
  });
  events.on('quit', () => {
    dogChase = false;
    yarnChase = false;
  });
  events.on('stageEnd', () => {
    dogChase = false;
    yarnChase = false;
  });
  events.on('setPiece', (e) => {
    if (e.id === 'ending' && e.phase === 'start') {
      // a contented purr under the jingle
      const A = audio();
      if (!A) return;
      const c = A.ctx;
      const t = c.currentTime + 1.2;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 26;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.8);
      g.gain.setValueAtTime(0.09, t + 5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      o.connect(lp).connect(g).connect(A.sfx);
      o.start(t);
      o.stop(t + 7.2);
      setTimeout(() => meow(820, 0.45, 'meow', 0.12), 600);
    }
  });

  // UI clicks for every button (capture, so it works for any meta-ui markup)
  if (typeof document !== 'undefined') {
    document.addEventListener(
      'pointerdown',
      (e) => {
        const el = e.target as Element | null;
        if (el && el.closest && el.closest('button, [role="button"], .btn')) uiClick();
      },
      true,
    );
  }

  addFrameHook((dt) => {
    if (!audio()) return;
    initLoops();
    const live = game.mode === 'play' || game.mode === 'finish';
    const run = live && game.mode === 'play';
    setLoop('river', run && P.surface === 'river' && P.ability !== 'cloud' ? (P.grounded ? 0.32 : 0.16) : 0);
    setLoop('claws', run && P.surface === 'wall' && P.grounded ? 0.16 : 0);
    const L = loops.claws;
    if (L?.lfo && dt > 0) L.lfo.frequency.value = 8 + P.speed * 0.3;
    const windK = run ? Math.max(0, (P.speed - 20) / 12) * 0.1 + (P.ability === 'cloud' ? 0.14 : 0) + (P.ability === 'vault' ? 0.16 : 0) + (!P.grounded ? 0.04 : 0) : 0;
    setLoop('wind', Math.min(0.3, windK));
    setLoop('rumble', run && yarnChase ? 0.55 : 0);
    // little paw pats on wooden bridges
    if (run && P.surface === 'bridge' && P.grounded && dt > 0) {
      patterT -= dt;
      if (patterT <= 0) {
        patterT = 0.11;
        tone('square', 200 + Math.random() * 40, 0.03, 0.025, { to: 150 });
      }
    }
  });
}

let currentMult = 1;
