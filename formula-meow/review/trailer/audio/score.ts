/**
 * Formula Meow trailer soundtrack (capture-only tooling, not shipped): renders the game's own WebAudio synth offline.
 * Loaded by render.html through the vite dev server (so /src modules import as they are), driven by ../audio.mjs.
 *
 * Stems (each its own OfflineAudioContext, 48 kHz stereo, exactly 30.0 s):
 *   music  : `Music` (src/juice/audio/music.ts) playing SONGS[1] "Kaunas Neon Nights" at 144 BPM, its private
 *            `play(step, t)` driven step by step, the layer mix from `musicMix()` set per bar; plus the game's own
 *            crash / riser shapes (Music.go, Music.finalLap) placed on the trailer grid and a final hit.
 *   sfx    : `playCue` (sfx.ts) and `playUi` (stings.ts) on the storyboard's event frames, glue whooshes on cuts,
 *            a cat crowd built from voices.ts, the end-card meow.
 *   vox    : the announcer (`playLine`, announcer.ts) through the game's PA chain (race-audio.ts).
 *   engine : `EngineVoice` (engine.ts) with its nodes automated from `engineParams()` keyframes.
 * The grid: 144 BPM, one beat = 25 frames at 60 fps, one bar = 100 frames. Frame f is at f / 60 s.
 */
import { Music, SONGS, musicMix, chordTones, type MusicMix } from '/src/juice/audio/music.ts';
import { playCue, catPitch, type Cue, type SfxId } from '/src/juice/audio/sfx.ts';
import { playUi, type UiSoundId } from '/src/juice/audio/stings.ts';
import { playLine, lineLength, type AnnounceId } from '/src/juice/audio/announcer.ts';
import { EngineVoice, engineParams } from '/src/juice/audio/engine.ts';
import { makeNoise, midiHz, noise, tone, brass, type SynthGraph } from '/src/juice/audio/synth.ts';
import { meow, happyMeow } from '/src/juice/audio/voices.ts';

export const SR = 48000;
export const DUR = 30;
export const FPS = 60;
export const BPM = 144;
const SPB16 = 60 / BPM / 4; // one 16th = 0.104167 s
const BAR = 60 / BPM * 4; // 1.6667 s = 100 frames
const fs = (f: number) => f / FPS;

/** Per bar: mode, layer mix, key (semitones), musical bar (chord/lead phrase index), note. */
interface BarPlan {
  mode: 'pre' | 'race' | 'results' | 'off';
  mix: MusicMix;
  key: number;
  mb: number;
  gain?: number;
  note: string;
}
const race = (place: number, fl = false, closing = false) => musicMix('race', place, fl, closing);
const only = (o: Partial<MusicMix>): MusicMix => ({ ...musicMix('off', 8, false, false), ...o });

export const PLAN: BarPlan[] = [
  { mode: 'pre', mix: musicMix('pre', 8, false, false), key: 0, mb: 0, note: 'S01 hook: intro hit, pad + heartbeat, riser into GO' },
  { mode: 'race', mix: race(3), key: 0, mb: 3, note: 'GO: the band lands (no lead yet), snare fill into the drop' },
  { mode: 'race', mix: race(8), key: 0, mb: 0, note: 'DROP on the first set piece (WALL RIDE), full band + lead' },
  { mode: 'race', mix: race(8), key: 0, mb: 1, note: 'set pieces' },
  { mode: 'race', mix: race(4), key: 0, mb: 2, note: 'flyovers: no lead, arp filter 800 Hz' },
  { mode: 'race', mix: race(2), key: 0, mb: 3, note: 'flyovers -> drift: arp filter open 4 kHz, fill' },
  { mode: 'race', mix: race(8), key: 0, mb: 0, note: 'boost / items, full band' },
  { mode: 'race', mix: race(8), key: 0, mb: 1, note: 'items, jump' },
  { mode: 'race', mix: race(8), key: 0, mb: 2, note: 'Grand Prix podium (C major chord under the C fanfare)' },
  { mode: 'race', mix: race(8), key: 0, mb: 3, note: 'Time Trial, Balloon Battle, fill' },
  { mode: 'race', mix: race(1), key: 0, mb: 0, note: 'editor breather: hats + heartbeat, lead an octave up' },
  { mode: 'race', mix: race(1), key: 0, mb: 3, note: 'share / dare, final-lap riser across the bar' },
  { mode: 'race', mix: race(8, true, true), key: 2, mb: 0, note: 'CLIMAX: final-lap key (+2), 16th hats, 1-beat cuts' },
  { mode: 'race', mix: race(8, true, true), key: 2, mb: 1, note: 'climax' },
  { mode: 'race', mix: only({ pad: 0.8, heart: 1, arpCut: 900 }), key: 2, mb: 0, note: 'BREAKDOWN: slow motion, pad + half-time heartbeat, riser into the landing' },
  { mode: 'race', mix: race(8, true, false), key: 0, mb: 3, note: 'landing: band back, finish, fill into the title' },
  { mode: 'results', mix: musicMix('results', 1, false, false, true), key: 0, mb: 0, gain: 0.75, note: 'END CARD: final hit, results (won) mix' },
  { mode: 'off', mix: only({ pad: 0.6 }), key: 0, mb: 0, note: 'tail: pad fades out, silent from f1790' },
];

/** Hit points (frames) the music marks: crash/kick/sub. */
export const MUSIC_HITS = [
  { f: 0, name: 'intro-hit', kind: 'stab' },
  { f: 100, name: 'go-crash', kind: 'crash' },
  { f: 200, name: 'drop', kind: 'crash' },
  { f: 1200, name: 'climax-crash', kind: 'crash' },
  { f: 1500, name: 'landing-crash', kind: 'crash' },
  { f: 1600, name: 'final-hit', kind: 'stab' },
];
export const RISERS = [
  { from: 0, to: 100, name: 'intro-riser' },
  { from: 1100, to: 1200, name: 'final-lap-riser' },
  { from: 1425, to: 1500, name: 'slowmo-riser' },
];

/** Announcer lines: `at` = the frame the stressed syllable should land on. */
export const LINES: Array<{ f: number; id: AnnounceId; lead?: number }> = [
  { f: 100, id: 'go', lead: 0.1 }, // "mi-e AO": the "GO" vowel on the GO downbeat
  { f: 202, id: 'wallRide' },
  { f: 252, id: 'bigAir' },
  { f: 302, id: 'tunnelRun' },
  { f: 352, id: 'loopDeMeow' },
  { f: 1504, id: 'niceLanding' },
  { f: 1556, id: 'win' },
];

type Ev =
  | { f: number; cue: SfxId; n?: number; vol?: number; item?: string; pitch?: number; label: string }
  | { f: number; ui: UiSoundId; n?: number; vol?: number; label: string }
  | { f: number; fx: 'crowd' | 'pencil' | 'meowSting' | 'whoosh'; vol?: number; len?: number; label: string };

/** Cuts (frames). A glue whoosh lands on each (2-beat cuts louder than 1-beat cuts). */
export const CUTS = [100, 150, 200, 250, 300, 350, 400, 425, 450, 475, 500, 525, 550, 600, 650, 700, 725, 750, 800, 850, 900, 1000, 1075, 1150, 1200, 1225, 1250, 1275, 1300, 1325, 1350, 1375, 1400, 1525, 1600];

export const EVENTS: Ev[] = [
  { f: 0, cue: 'loopRush', label: 'S01 loop rush (S01 now opens at take f98, already on the loop)' },
  { f: 102, cue: 'go', vol: 0.8, label: 'S02 GO brass' },
  { f: 104, cue: 'pounce', vol: 0.8, label: 'S02 launch' },
  { f: 172, cue: 'bump', vol: 0.7, label: 'S03 pack bump' },
  { f: 209, cue: 'wallOn', label: 'S04 wall ride (take f69 stuntEnter)' },
  { f: 253, cue: 'gapLaunch', label: 'S05 jump launch (take f63 ramp)' },
  { f: 300, cue: 'tunnelIn', label: 'S06 tunnel in' },
  { f: 306, cue: 'pad', vol: 0.8, label: 'S06 boost pad' },
  { f: 350, cue: 'loopRush', vol: 0.8, label: 'S07 loop' },
  ...[400, 425, 450, 475, 500, 525].map((f) => ({ f, ui: 'tab' as UiSoundId, vol: 1, label: 'S08-S13 track-name tick' })),
  { f: 552, cue: 'driftTier', n: 2, label: 'S14 drift tier 2 (take f62)' },
  { f: 580, cue: 'driftTier', n: 3, label: 'S14 drift tier 3 (pink)' },
  { f: 606, cue: 'turbo', n: 3, label: 'S15 mini-turbo release' },
  { f: 655, cue: 'item', item: 'hairball', label: 'S16 hairball thrown' },
  { f: 680, cue: 'hitConfirm', item: 'hairball', label: 'S16 hit lands' },
  { f: 682, cue: 'hit', item: 'hairball', vol: 0.6, pitch: catPitch(3), label: 'S16 rival spins out' },
  { f: 704, cue: 'item', item: 'zoomies', label: 'S17 zoomies' },
  { f: 725, cue: 'itemReady', label: 'S18 item ready' },
  { f: 735, cue: 'item', item: 'box', label: 'S18 box pops up' },
  { f: 753, cue: 'gapLaunch', label: 'S19 jump launch (take f63 ramp)' },
  { f: 800, ui: 'podium', label: 'S20 podium fanfare' },
  { f: 805, cue: 'podium', vol: 0.8, label: 'S20 podium sfx' },
  { f: 821, fx: 'crowd', len: 1.2, label: 'S20 cat crowd cheer (confetti at 350 ms)' },
  { f: 860, cue: 'splitAhead', label: 'S21 split ahead of the ghost' },
  { f: 965, cue: 'balloonPop', label: 'S22 balloon pop' },
  { f: 1002, fx: 'pencil', len: 0.5, label: 'S23 doodle stroke (2x)' },
  { f: 1044, ui: 'stamp', label: 'S23 Loop sticker drops (take f75 -> cut f1044 after the 2x stroke)' },
  { f: 1075, ui: 'confirm', label: 'S24 share link' },
  { f: 1079, cue: 'loopRush', vol: 0.7, label: 'S24 doodled loop (top at f1105)' },
  { f: 1154, cue: 'trill', label: 'S25 dare banner (Mia trills)' },
  { f: 1190, cue: 'go', vol: 0.7, label: 'S25 dare race GO (take f174)' },
  { f: 1200, cue: 'loopRush', vol: 0.6, label: 'S26 laundry loop' },
  { f: 1232, cue: 'loopOut', vol: 0.8, label: 'S27 café loop exit' },
  { f: 1250, cue: 'wallOn', vol: 0.9, label: 'S28 wall' },
  { f: 1271, cue: 'gapLaunch', vol: 0.9, label: 'S29 jump' },
  { f: 1300, cue: 'wallOn', vol: 0.9, label: 'S30 wall' },
  { f: 1325, cue: 'tunnelIn', vol: 0.9, label: 'S31 tunnel' },
  { f: 1328, cue: 'pad', vol: 0.7, label: 'S31 boost pad' },
  { f: 1366, cue: 'gapLand', label: 'S32 landing burst' },
  { f: 1375, cue: 'wallOn', vol: 0.9, label: 'S33 wall' },
  { f: 1500, cue: 'gapLand', label: 'S34 landing (f1500)' },
  { f: 1500, cue: 'bigLand', label: 'S34 landing thump' },
  { f: 1545, cue: 'finish', label: 'S35 finish line' },
  { f: 1550, cue: 'win', vol: 0.9, label: 'S35 win brass' },
  { f: 1552, fx: 'crowd', len: 0.8, vol: 0.8, label: 'S35 cat crowd' },
  { f: 1600, ui: 'cupWin', label: 'S36 title sting' },
  { f: 1650, fx: 'meowSting', label: 'S36 end-card meow (beat 2 of bar 16)' },
];

/** Engine keyframes: speed fraction and state (engineParams input). `off` = silent; `hz` multiplies the pitch. */
interface EngKey {
  f: number;
  frac: number;
  rail?: boolean;
  wall?: boolean;
  air?: boolean;
  boost?: boolean;
  drift?: number;
  off?: boolean;
  hz?: number;
}
export const ENGINE: EngKey[] = [
  { f: 0, frac: 0.95, rail: true },
  { f: 98, frac: 0.05 },
  { f: 102, frac: 0.7, boost: true },
  { f: 130, frac: 0.95 },
  { f: 200, frac: 1, wall: true },
  { f: 250, frac: 1, air: true },
  { f: 300, frac: 1.15, boost: true },
  { f: 350, frac: 1, rail: true },
  { f: 400, frac: 0 },
  { f: 550, frac: 0.9, drift: 2 },
  { f: 580, frac: 0.9, drift: 3 },
  { f: 600, frac: 1.3, boost: true },
  { f: 650, frac: 1 },
  { f: 700, frac: 1.35, boost: true },
  { f: 725, frac: 1 },
  { f: 750, frac: 1, air: true },
  { f: 800, frac: 0, off: true },
  { f: 850, frac: 0.95 },
  { f: 900, frac: 0.8 },
  { f: 1000, frac: 0, off: true },
  { f: 1075, frac: 1, rail: true },
  { f: 1150, frac: 0 },
  { f: 1200, frac: 1, rail: true },
  { f: 1225, frac: 1, rail: true },
  { f: 1250, frac: 1, wall: true },
  { f: 1275, frac: 1, air: true },
  { f: 1300, frac: 1, wall: true },
  { f: 1325, frac: 1.2, boost: true },
  { f: 1350, frac: 1, air: true },
  { f: 1366, frac: 1.1, boost: true },
  { f: 1375, frac: 1, wall: true },
  { f: 1400, frac: 1, air: true, hz: 0.5 },
  { f: 1440, frac: 1, air: true, hz: 0.65 },
  { f: 1488, frac: 1, air: true, hz: 0.7 },
  { f: 1500, frac: 1.3, boost: true },
  { f: 1545, frac: 0.9 },
  { f: 1590, frac: 0.6 },
  { f: 1600, frac: 0, off: true },
];

// ---------------------------------------------------------------------------------------------------------------
const LEVEL = { kick: 0.9, snare: 0.7, hats: 0.6, bass: 0.8, pad: 0.8, arp: 0.7, lead: 0.75, heart: 0.9 } as const; // music.ts LEVEL
const LAYERS = Object.keys(LEVEL) as Array<keyof typeof LEVEL>;

function newCtx(): OfflineAudioContext {
  return new OfflineAudioContext(2, SR * DUR, SR);
}

/** Announcer windows (seconds) for the duck. */
function lineWindows(): Array<[number, number]> {
  return LINES.map((l) => {
    const t = fs(l.f) - (l.lead ?? 0);
    return [t, t + lineLength(l.id)];
  });
}

function duck(p: AudioParam, amount: number): void {
  p.setValueAtTime(1, 0);
  for (const [a, b] of lineWindows()) {
    p.setTargetAtTime(amount, a - 0.02, 0.03);
    p.setTargetAtTime(1, b + 0.08, 0.12);
  }
}

function crash(g: SynthGraph, t: number, peak = 0.5): void {
  // Music.go(): a high-passed noise crash
  noise(g, t, { peak, decay: 1.4, filter: { type: 'highpass', freq: 5000 }, seed: 71 });
  noise(g, t, { peak: peak * 0.5, decay: 0.5, filter: { type: 'bandpass', freq: 2600, q: 0.8 }, seed: 72 });
}
function kick(g: SynthGraph, t: number, peak = 0.9): void {
  tone(g, t, { freq: 150, freqEnd: 42, glide: 0.1, peak, decay: 0.2 });
}
function sub(g: SynthGraph, t: number, hz: number, peak = 0.5, decay = 0.9): void {
  tone(g, t, { freq: hz * 2, freqEnd: hz, glide: 0.08, peak, decay });
}
function riser(g: SynthGraph, t0: number, t1: number, peak = 0.35): void {
  // Music.finalLap(): rising band-passed noise + a saw sweep, timed to end on t1
  const len = t1 - t0;
  noise(g, t0, { peak, attack: len, decay: 0.12, filter: { type: 'bandpass', freq: 300, freqEnd: 7000, q: 2 }, seed: 73 });
  tone(g, t0, { type: 'sawtooth', freq: 110, freqEnd: 880, glide: len, attack: len, decay: 0.1, peak: 0.08, filter: { type: 'lowpass', freq: 3000 } });
}

/** A minor chord stab (brass from synth.ts) on the chord of musical bar `mb`, in key `key`. */
function stab(g: SynthGraph, t: number, mb: number, key: number, dur: number, peak: number): void {
  const song = SONGS[1];
  const tones = chordTones(song, mb);
  for (let i = 0; i < 3; i++) brass(g, t, midiHz(song.root + key + 24 + tones[i]), dur, peak);
  brass(g, t, midiHz(song.root + key + 12 + tones[0]), dur, peak * 0.8);
}

async function renderMusic(): Promise<AudioBuffer> {
  const ctx = newCtx();
  const nb = makeNoise(ctx, 2);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  duck(master.gain, 0.62);
  // fade the tail: silent by f1790
  const songOut = ctx.createGain();
  songOut.connect(master);
  songOut.gain.setValueAtTime(1, fs(1700));
  songOut.gain.linearRampToValueAtTime(0, fs(1788));
  const fxOut = ctx.createGain();
  fxOut.connect(songOut);
  const g: SynthGraph = { ctx, out: fxOut, noise: nb };

  const m = new Music(ctx as unknown as AudioContext, songOut, nb, { admit: () => true } as never);
  m.dispose(); // no scheduler timer: we drive play() ourselves
  m.setSong(1);
  const mm = m as unknown as {
    bpm: number;
    key: number;
    mode: string;
    mix: MusicMix;
    bus: Record<string, GainNode>;
    arpF: BiquadFilterNode;
    play(step: number, t: number): void;
  };
  mm.bpm = BPM;
  for (const l of LAYERS) mm.bus[l].gain.value = 0;

  for (let b = 0; b < PLAN.length; b++) {
    const p = PLAN[b];
    const t0 = b * BAR;
    const gainMul = p.gain ?? 1;
    // snap the layer gains on the downbeat (2 ms before so the first note is whole); outgoing tails get 30 ms
    for (const l of LAYERS) {
      const v = p.mix[l] * LEVEL[l] * gainMul;
      mm.bus[l].gain.setTargetAtTime(v, Math.max(0, t0 - 0.004), v > 0 ? 0.002 : 0.03);
    }
    if (b === 4) {
      // flyovers: the arp filter climbs 800 Hz -> 4 kHz across bars 4-5 (the "climbing the pack" mix)
      mm.arpF.frequency.setValueAtTime(800, t0);
      mm.arpF.frequency.exponentialRampToValueAtTime(4000, t0 + 2 * BAR);
    } else if (b !== 5) {
      mm.arpF.frequency.setTargetAtTime(p.mix.arpCut, t0, 0.05);
    }
    mm.mode = p.mode === 'off' ? 'race' : p.mode;
    mm.mix = p.mix;
    mm.key = p.key;
    for (let s = 0; s < 16; s++) mm.play(p.mb * 16 + s, t0 + s * SPB16);
  }

  // the trailer's own hits, built from the game's primitives (Music.go crash, kick, brass)
  const songRoot = SONGS[1].root;
  stab(g, 0, 0, 0, 0.5, 0.2);
  kick(g, 0, 0.6);
  sub(g, 0.01, midiHz(songRoot - 12), 0.35, 1.2);
  crash(g, 0, 0.5);
  for (const h of MUSIC_HITS.filter((x) => x.kind === 'crash')) {
    const key = PLAN[Math.floor(h.f / 100)].key;
    crash(g, fs(h.f), 0.45);
    sub(g, fs(h.f) + 0.01, midiHz(songRoot + key - 12), 0.25, 0.6);
  }
  // final hit f1600: kick + sub + crash + A minor brass stab, held
  stab(g, fs(1600), 0, 0, 0.9, 0.22);
  kick(g, fs(1600), 0.6);
  sub(g, fs(1600) + 0.01, midiHz(songRoot - 12), 0.35, 1.6);
  crash(g, fs(1600), 0.5);
  for (const r of RISERS) riser(g, fs(r.from), fs(r.to), r.name === 'slowmo-riser' ? 0.3 : 0.35);
  // snare roll into the drop (last beat of bar 1 is the song's own fill; add 16th build in bar 1 beat 3)
  for (let i = 0; i < 8; i++) noise(g, fs(150) + i * SPB16, { peak: 0.08 + i * 0.03, decay: 0.07, filter: { type: 'bandpass', freq: 2000, q: 1 }, seed: 300 + i });
  return ctx.startRendering();
}

function cueOf(e: { cue: SfxId; n?: number; vol?: number; item?: string; pitch?: number }): Cue {
  return { id: e.cue, prio: 3, n: e.n ?? 0, pitch: e.pitch ?? catPitch(0), delay: 0, vol: e.vol ?? 1, item: e.item as Cue['item'] };
}

function whooshTo(g: SynthGraph, tCut: number, peak: number, seed: number): void {
  // clip-audio.ts glue whoosh: band-pass noise sweeping up into the cut
  noise(g, tCut - 0.24, { peak, attack: 0.2, decay: 0.12, filter: { type: 'bandpass', freq: 400, freqEnd: 5000, q: 1.2 }, seed });
}

function crowd(g: SynthGraph, t: number, len: number, vol: number): void {
  // a cat crowd: a band-passed noise roar and a scatter of happy meows (voices.ts), seeded
  noise(g, t, { peak: 0.12 * vol, attack: 0.15, hold: len * 0.5, decay: len * 0.6, filter: { type: 'bandpass', freq: 1100, q: 0.6 }, seed: 401 });
  noise(g, t, { peak: 0.05 * vol, attack: 0.1, hold: len * 0.4, decay: len * 0.5, filter: { type: 'bandpass', freq: 2600, q: 1.2 }, seed: 402 });
  let a = 12345;
  const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 10; i++) {
    const dt = r() * len * 0.8;
    const pitch = 0.9 + r() * 0.7;
    if (i % 3 === 0) meow(g, t + dt, 0.45 * vol, pitch);
    else happyMeow(g, t + dt, 0.5 * vol, pitch);
  }
}

async function renderSfx(): Promise<AudioBuffer> {
  const ctx = newCtx();
  const nb = makeNoise(ctx, 2);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const g: SynthGraph = { ctx, out, noise: nb };
  // glue whooshes (2-beat cuts louder; skip the cuts that already carry a big cue)
  CUTS.forEach((f, i) => {
    const next = CUTS[i + 1] ?? 1800;
    const prev = CUTS[i - 1] ?? 0;
    const long = f - prev >= 50 || next - f >= 50;
    whooshTo(g, fs(f), long ? 0.22 : 0.12, 500 + i);
  });
  for (const e of EVENTS) {
    const t = fs(e.f);
    if ('cue' in e) playCue(g, cueOf(e), t);
    else if ('ui' in e) {
      const v = ctx.createGain();
      v.gain.value = (e.vol ?? 1) * 1.6; // UI stings are mixed quiet for menus; lift them to cue level
      v.connect(out);
      playUi({ ...g, out: v }, e.ui, t, e.n ?? 0);
    } else if (e.fx === 'crowd') crowd(g, t, e.len ?? 1, e.vol ?? 1);
    else if (e.fx === 'pencil') {
      for (let i = 0; i < Math.round((e.len ?? 1) * 20); i++) noise(g, t + i * 0.05, { peak: 0.05 + 0.02 * Math.sin(i), decay: 0.04, filter: { type: 'bandpass', freq: 3200 + (i % 5) * 300, q: 3 }, seed: 600 + i });
    } else if (e.fx === 'meowSting') {
      meow(g, t, 1.4, 1.05, true);
    }
  }
  return ctx.startRendering();
}

async function renderVox(): Promise<AudioBuffer> {
  const ctx = newCtx();
  const nb = makeNoise(ctx, 2);
  // race-audio.ts announcer PA: high-pass 260 Hz, +5 dB presence at 1.9 kHz, tanh saturation
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 260;
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 1900;
  presence.gain.value = 5;
  presence.Q.value = 0.9;
  const sat = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8);
  }
  sat.curve = curve;
  const pre = ctx.createGain();
  pre.connect(hp).connect(presence).connect(sat).connect(ctx.destination);
  const g: SynthGraph = { ctx, out: pre, noise: nb };
  for (const l of LINES) playLine(g, l.id, fs(l.f) - (l.lead ?? 0), 1);
  return ctx.startRendering();
}

async function renderEngine(): Promise<AudioBuffer> {
  const ctx = newCtx();
  const nb = makeNoise(ctx, 2);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  duck(out.gain, 0.5);
  const ev = new EngineVoice(ctx as unknown as AudioContext, out, nb);
  const e = ev as unknown as Record<string, AudioNode & { frequency: AudioParam; gain: AudioParam; Q: AudioParam }>;
  for (const k of ENGINE) {
    const t = fs(k.f);
    const kart = {
      driftDir: k.drift ? 1 : 0,
      driftTier: k.drift ?? 0,
      boostTicks: k.boost ? 30 : 0,
      air: k.air ? 1 : 0,
      spinTicks: 0,
      surface: k.wall ? 6 : 0,
      rail: k.rail ? 1 : 0,
    };
    const p = engineParams(k.frac, kart as never, !k.off);
    const hz = p.hz * (k.hz ?? 1);
    const tc = k.hz ? 0.12 : 0.05;
    e.a.frequency.setTargetAtTime(hz, t, tc);
    e.b.frequency.setTargetAtTime(hz * 1.005, t, tc);
    e.lp.frequency.setTargetAtTime(p.cutoff * (k.hz ?? 1), t, tc);
    e.lfo.frequency.setTargetAtTime(p.purrHz * (k.hz ?? 1), t, 0.1);
    e.g.gain.setTargetAtTime(p.gain, t, 0.08);
    const hum = p.hum > 0;
    e.squealG.gain.setTargetAtTime(hum ? p.hum : p.squeal, t, 0.04);
    e.squealF.frequency.setTargetAtTime(hum ? 150 + 110 * Math.min(1, k.frac) : 2100 + 500 * Math.min(1, k.frac), t, 0.06);
    e.squealF.Q.setTargetAtTime(hum ? 1.2 : 7, t, 0.06);
    if (p.whine > 0) e.whine.frequency.setTargetAtTime(p.whine, t, 0.03);
    e.whineG.gain.setTargetAtTime(p.whine > 0 ? 0.025 : 0, t, 0.05);
    e.windG.gain.setTargetAtTime(p.wind, t, 0.15);
  }
  return ctx.startRendering();
}

async function b64(buf: AudioBuffer): Promise<string[]> {
  const out: string[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    const blob = new Blob([data.buffer.slice(0) as ArrayBuffer]);
    const url: string = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(blob);
    });
    out.push(url.slice(url.indexOf(',') + 1));
  }
  return out;
}

export async function renderStems(): Promise<Record<string, string[]>> {
  const [music, sfx, vox, engine] = await Promise.all([renderMusic(), renderSfx(), renderVox(), renderEngine()]);
  return { music: await b64(music), sfx: await b64(sfx), vox: await b64(vox), engine: await b64(engine) };
}

/** The plan, for cues.json. */
export function plan() {
  return {
    bpm: BPM,
    song: SONGS[1].name,
    bars: PLAN.map((p, i) => ({ bar: i, frame: i * 100, mode: p.mode, key: p.key, chordBar: p.mb, note: p.note })),
    musicHits: MUSIC_HITS,
    risers: RISERS,
    lines: LINES.map((l) => ({ ...l, start: fs(l.f) - (l.lead ?? 0), len: lineLength(l.id) })),
    events: EVENTS,
    cuts: CUTS,
  };
}
