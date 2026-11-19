// Grudge Tour score: original, 150 BPM (24 frames a beat at 60 fps), cat motif (marimba + bright pluck) vs dog motif
// (brass stabs, tuba), synthesised with the repo's own instruments; the game's own zzfx sounds as accents.
//   node score.mjs <outDir>     (cwd: the trailer worktree's pawlegends/)
// Writes music-30.wav / music-60.wav (float stems, not mastered: the edit mixes them with the takes' SFX and masters).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const W = decodeURIComponent(new URL('../../trailer', import.meta.url).pathname);
import { Bus, SR, biquad, dbToGain, freeverb, sec, writeWavFloat, sine, noise, decay, mul, hz, saw } from '../../trailer/dsp.mjs';
import * as I from '../../trailer/instruments.mjs';
import { CUT30, CUT60 } from './plan.mjs';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const FPS = 60, BEAT = 24, BAR = 96;
const smp = (f) => Math.round((f * SR) / FPS);
const fs = (fr) => fr / FPS;

const CH = { Am: { root: 33, tri: [57, 60, 64] }, F: { root: 29, tri: [57, 60, 65] }, C: { root: 36, tri: [55, 60, 64] }, G: { root: 31, tri: [55, 59, 62] }, E: { root: 28, tri: [56, 59, 64] }, Dm: { root: 38, tri: [57, 62, 65] } };
const PROG = ['Am', 'F', 'C', 'G'];

/** Marimba: a sine with a quick 4x partial and a soft mallet click. */
function marimba(midi, len = 0.35) {
  const n = sec(len), f = hz(midi);
  const a = mul(sine(n, f), decay(n, len * 0.45));
  const b = mul(sine(n, f * 3.93), decay(n, 0.05));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] * 0.8 + b[i] * 0.25;
  return out;
}
/** Slide whistle (original): a pure tone gliding up. */
function slide(len, m0, m1) {
  const n = sec(len), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = hz(m0 + (m1 - m0) * u * u) * (1 + 0.01 * Math.sin(i / SR * 2 * Math.PI * 6));
    ph += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(ph) * Math.min(1, u * 20, (1 - u) * 30) * 0.7;
  }
  return out;
}
/** Record-scratch (original): band noise with a fast pitch-like filter wobble. */
function scratch(len = 0.35) {
  const n = sec(len);
  const x = noise(n, 77);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const k = 0.04 + 0.3 * Math.abs(Math.sin(u * Math.PI * 3));
    lp += k * (x[i] - lp);
    out[i] = lp * Math.min(1, (1 - u) * 8) * 2.2;
  }
  return out;
}
/** Vacuum 'shloop' (original): a filtered noise sweep down plus a low hum. */
function shloop(len = 0.7) {
  const n = sec(len), x = noise(n, 31), out = new Float32Array(n);
  let lp = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const k = 0.5 * (1 - u) ** 2 + 0.02;
    lp += k * (x[i] - lp);
    ph += (2 * Math.PI * (180 - 120 * u)) / SR;
    out[i] = (lp * 0.9 + Math.sin(ph) * 0.35) * Math.min(1, u * 30) * (1 - u);
  }
  return out;
}

function make(cut) {
  const N = cut.frames;
  const music = new Bus(smp(N) + sec(2));
  const sfx = new Bus(smp(N) + sec(2));
  const cat = (f, g = 0.5, tr = 0) => {
    const steps = [[0, 76], [2, 79], [4, 81], [6, 84], [9, 83], [12, 81]];
    for (const [s, m] of steps) {
      music.add(smp(f + s * 6), marimba(m + tr), g, 0.25);
      music.add(smp(f + s * 6), I.pluck(m + 12 + tr, 0.12, 50 + s), g * 0.35, 0.35);
    }
  };
  const dog = (f, g = 0.55, tr = 0) => {
    const steps = [[0, 45], [3, 45], [6, 43], [9, 41], [12, 40]];
    for (const [s, m] of steps) music.add(smp(f + s * 6), I.tuba(m + tr, fs(s === 12 ? 30 : 10)), g, -0.25);
    const [L, R] = I.stab([57, 60, 64].map((x) => x - 12 + tr), 0.18, 1);
    music.addStereo(smp(f), L, R, g * 0.6);
  };
  const stab = (f, c, g = 0.45, len = 0.3, oct = 0) => {
    const [L, R] = I.stab(CH[c].tri.map((m) => m + oct), len, 1);
    music.addStereo(smp(f), L, R, g);
  };
  const pad = (f, c, len, g = 0.14) => {
    const [L, R] = I.pad(CH[c].tri.map((m) => m - 12), len, { cutoff: 1400 });
    music.addStereo(smp(f), L, R, g);
  };
  const groove = (a, b, { half = false, e = 1, bass = true } = {}) => {
    for (let f = a; f < b; f += BEAT) {
      const bi = Math.round((f - a) / BEAT), ib = bi % 4, c = PROG[Math.floor(bi / 4) % 4];
      if (!half || ib === 0 || ib === 2) music.add(smp(f), I.kick(1, { punch: 1 }), 0.85 * e);
      if (!half && (ib === 1 || ib === 3)) music.add(smp(f), I.clap(3), 0.45 * e, 0.05);
      if (half && ib === 2) music.add(smp(f), I.snare(2, 190), 0.5 * e);
      for (let k = 0; k < (half ? 2 : 4); k++) {
        const hf = f + (k * BEAT) / (half ? 2 : 4);
        if (hf < b) music.add(smp(hf), I.hat(4 + k, k === 2 && !half), (k % 2 ? 0.1 : 0.17) * e, k % 2 ? 0.3 : -0.3);
      }
      if (bass) {
        music.add(smp(f), I.bass(CH[c].root + 12, fs(BEAT * 0.45)), 0.4 * e);
        if (!half) music.add(smp(f + 12), I.bass(CH[c].root + 24, fs(BEAT * 0.3)), 0.2 * e);
      }
    }
  };
  const hit = (f, g = 0.8) => {
    sfx.add(smp(f), I.impact(90, { sub: 44, len: 1.0 }), g);
    music.add(smp(f), I.kick(1, { punch: 1.3 }), 0.9);
  };
  const whoosh = (f, len = 0.35) => sfx.add(Math.max(0, smp(f) - sec(len)), I.riseWhoosh(len, 81), 0.35);
  const sh = cut.shots;
  const at = (pred) => sh.filter(pred);
  // frame 0: the hook (kick + synth stab + impact)
  hit(0, 0.9);
  stab(0, 'Am', 0.55, 0.35, 12);
  sfx.add(smp(9), I.game('hit'), 0.6);
  sfx.add(smp(9), I.crackle(0.3, 93), 0.3);
  groove(24, at((s) => s.kind === 'still')[0].a, { e: 0.8 });
  cat(24, 0.4);
  // every gameplay -> atlas transition: a 2-beat whoosh riser; every still -> gameplay landing: a thump
  for (const s of sh) {
    if (s.kind === 'still' && s.still === 'atlas') {
      music.add(smp(s.a), I.riser(fs(s.b - s.a), 70)[0], 0.25);
      whoosh(s.b, 0.5);
      if (s.tangle) {
        sfx.add(smp(s.a + 30), scratch(0.4), 0.55);
      } else for (let k = 0; k < 2; k++) music.add(smp(s.a + 24 + k * 6), I.tom(140 - k * 25, 6 + k), 0.4);
    }
  }
  // the tour: groove from the first map to the chase still, motifs on the type
  const tour0 = sh.find((s) => s.take?.startsWith('t03')).a;
  const chase = sh.filter((s) => s.still === 'chase');
  for (const s of sh) if (s.text?.side === 'cat') { stab(s.text.f, 'Am', 0.42, 0.3, 12); cat(s.text.f, 0.55); }
  for (const s of sh) if (s.text?.w === 'VS') { music.add(smp(s.text.f), I.snare(2, 200), 0.7); stab(s.text.f, 'E', 0.5, 0.4, -12); sfx.add(smp(s.text.f), I.game('horn'), 0.25); }
  for (const s of sh) if (s.text?.side === 'dog') { dog(s.text.f, 0.65); music.add(smp(s.text.f), I.kick(1, { punch: 1.1 }), 0.8); }
  // groove over each gameplay stretch of the tour (stills punch holes)
  const nova = sh.find((s) => s.take === 't07-quarry-nova');
  const lambo = sh.find((s) => s.take === 't08-crossing-lambo');
  const hw = sh.filter((s) => s.take?.startsWith('t09') || s.take === 't10-hw-mochi');
  for (const s of sh) {
    if (s.kind !== 'take' || s.a < tour0 || s.take.startsWith('salvo') || s.take.startsWith('t1') || s.take.startsWith('t09')) continue;
    groove(s.a, s.b, { e: s === nova ? 0.7 : 0.9 });
  }
  // Nova's Meteor Shower: 4 kicks on 4 beats
  for (let k = 0; k < 4; k++) hit(nova.a + Math.round((1.5 - nova.src) * 60) + k * BEAT, 0.5);
  // Lambo: slide whistle rising into the snare on the cut
  music.add(smp(lambo.a), slide(fs(lambo.b - lambo.a) - 0.05, 72, 91), 0.35, 0.1);
  music.add(smp(lambo.b - 2), I.snare(2, 220), 0.8);
  // Hearthwood: half time
  for (const s of hw) { groove(s.a, s.b, { half: true, e: 0.9 }); pad(s.a, 'Dm', fs(s.b - s.a), 0.12); }
  // 60 s act 3: the scratch stop, the drop falls out, a low rumble under the Pudding panel, a tuba stomp
  const pud = sh.find((s) => s.still === 'pudding');
  if (pud) {
    sfx.add(smp(pud.a), I.ambience(fs(pud.b - pud.a), 95), 0.3);
    music.add(smp(pud.a), I.subDrop(50, 30, fs(pud.b - pud.a) - 0.5, 0.5), 0.5);
    for (let f = pud.a + 48; f < pud.b; f += 48) music.add(smp(f), I.tom(70, 9), 0.35);
    const p1 = sh.filter((s) => s.take === 't11-ridge-pudding');
    groove(p1[0].a, p1[0].b, { half: true, e: 0.85 });
    for (let f = p1[0].a; f < p1[0].b; f += BEAT * 2) music.add(smp(f), I.tuba(33, 0.35), 0.6);
    const truce = sh.find((s) => s.still === 'truce');
    stab(truce.a, 'C', 0.5, 0.7); cat(truce.a, 0.35); dog(truce.a + 6, 0.4);
    // counterpoint under the four calm-Pudding cuts
    // Pudding's slam lands on a hit
    hit(p1[0].a + Math.round((3.03 - p1[0].src) * 60), 0.6);
  }
  // rev 2: the rivals are named on plates (cat motif under Meatball, dog motif under Sir Brutus)
  for (const s of sh) if (s.tag) { if (s.tag.side === 'cat') { cat(s.tag.f, 0.5); stab(s.tag.f, 'Am', 0.35, 0.25, 12); } else { dog(s.tag.f, 0.6); } }
  const bru = sh.find((s) => s.take === 't02-brutus');
  if (bru) hit(bru.a + Math.round((1.27 - bru.src) * 60), 0.55);

  // Hearthwood in the 60 s returns with the drop
  // the chase still: a near-silent 6-frame hole before the salvo
  for (const c of chase) {
    music.add(smp(c.a), I.reverseCymbal(fs(c.b - c.a - 8), 83), 0.4);
    stab(c.a, 'G', 0.35, 0.3);
  }
  // the salvo: full drop, an ult accent on every downbeat cut
  const sal = sh.filter((s) => s.take?.startsWith('salvo'));
  groove(sal[0].a, sal[sal.length - 1].b, { e: 1.05 });
  music.add(smp(sal[0].a), I.crash(5, 2.0), 0.4);
  sal.forEach((s, i) => {
    stab(s.a, PROG[Math.floor(i / 2) % 4], 0.38, 0.22, 12);
    sfx.add(smp(s.a), I.game('ult'), 0.3);
    sfx.add(smp(s.a) - sec(0.12), I.reverseWhoosh(0.12, 82), 0.3);
    if (i % 2 === 0) cat(s.a, 0.3); else dog(s.a, 0.3);
  });
  // rev 2: the dogs' answer (Marshmallow) then the climax: Mochi's Lullaby teamfight, the loudest hit, right before the card
  const hwm = sh.find((s) => s.take === 't10-hw-mochi');
  if (hwm && hwm.src < 1.0) { const mf = hwm.a + Math.round((1.0 - hwm.src) * 60); hit(mf, 0.7); cat(mf + 6, 0.45); }
  // Marshmallow's ult inside the finale (608.27 s in the t09 match): the dogs' answer, a dog motif
  const L0 = sh.find((s) => s.climax);
  if (L0) { const df = L0.a + Math.round((2.87 - L0.src) * 60); if (df > L0.a && df < L0.b - 30) { hit(df, 0.55); dog(df + 4, 0.5); } }
  const L = sh.find((s) => s.climax);
  const lf = L.a + Math.round((1.47 - L.src) * 60);
  const rollLen = Math.min(1.0, (lf - L.a) / 60 + 0.4);
  music.add(smp(lf) - sec(rollLen), I.snareRoll(rollLen, 150, 40), 0.45);
  music.add(smp(lf) - sec(rollLen), I.riser(rollLen, 72)[0], 0.3);
  sfx.add(smp(lf), I.impact(95, { sub: 36, len: 1.8 }), 1.0);
  sfx.add(smp(lf), I.crash(7, 2.4), 0.5);
  music.add(smp(lf), I.subDrop(60, 28, 0.8, 0.6), 0.7);
  stab(lf + 4, 'Am', 0.45, 0.5, 12); cat(lf + 6, 0.55);
  groove(lf + 24, L.b, { e: 1.0 });
  sfx.add(smp(L.b - 40), I.game('victory'), 0.35);
  // end card: the logo stab, meow + bark sting, ring out
  const card = sh.find((s) => s.kind === 'card');
  music.add(smp(card.a) - sec(0.4), I.reverseCymbal(0.4, 84), 0.3);
  stab(card.a, 'C', 0.55, 0.6); music.add(smp(card.a), I.kick(1, { punch: 1.2 }), 0.8); music.add(smp(card.a), I.crash(5, 2.6), 0.4);
  pad(card.a, 'C', fs(card.b - card.a), 0.14);
  sfx.add(smp(card.a + 36), I.game('cardMeow'), 0.55);
  sfx.add(smp(card.a + 60), I.game('nuggetBork'), 0.55);
  stab(card.a + 72, 'F', 0.35, 0.4); stab(card.a + 96, 'C', 0.45, 1.0, 12);
  groove(card.a, Math.min(card.b - 24, card.a + 120), { half: true, e: 0.55, bass: true });
  // 60 s button: the vacuum shloop, hard out
  const nug = sh.find((s) => s.vac);
  if (nug) {
    sfx.add(smp(nug.a), I.ambience(fs(nug.b - nug.a), 96), 0.12);
    sfx.add(smp(nug.vac[0]), shloop(0.75), 0.8);
    music.add(smp(nug.vac[1] + 12), I.pluck(84, 0.2, 51), 0.35);
  }
  // reverb, ducking under the impacts, hard out on the last frame
  for (const [b, amt] of [[music, 0.12], [sfx, 0.05]]) {
    const [wl, wr] = freeverb(b.L, b.R, { room: 0.78, damp: 0.4 });
    for (let i = 0; i < b.n; i++) { b.L[i] += wl[i] * amt; b.R[i] += wr[i] * amt; }
  }
  // silences: the 6-frame hole before each salvo, and a hard out
  const g = new Float32Array(music.n).fill(1);
  for (const c of chase) for (let i = smp(c.b - 6); i < smp(c.b); i++) g[i] = 0.04;
  if (pud) { const t = sh.find((s) => s.tangle); for (let i = smp(t.a + 34); i < smp(pud.a); i++) g[i] = Math.min(g[i], 0.15); }
  const end = smp(N - (nug ? 12 : 0));
  for (let i = end; i < music.n; i++) g[i] = 0;
  const fadeN = sec(0.35);
  for (let i = Math.max(0, end - fadeN); i < end; i++) g[i] = Math.min(g[i], (end - i) / fadeN);
  music.gainCurve((i) => g[i]);
  sfx.gainCurve((i) => (i >= smp(N) ? 0 : Math.min(1, (smp(N) - i) / sec(0.35))));
  writeWavFloat(join(OUT, `music-${cut.name}.wav`), music.L.subarray(0, smp(N)), music.R.subarray(0, smp(N)));
  writeWavFloat(join(OUT, `sting-${cut.name}.wav`), sfx.L.subarray(0, smp(N)), sfx.R.subarray(0, smp(N)));
  console.log(`score ${cut.name}: ${N} frames`);
}
make(CUT30);
make(CUT60);
