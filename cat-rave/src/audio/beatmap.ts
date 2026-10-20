/**
 * L-AUDIO: the second track's data (the Back on Track mix by ModeGospel). Pure: no DOM, no WebAudio.
 *
 * The mix is never time-stretched. Its own beat map (scripts/track/beatmap.py, about 145 BPM with
 * drift) drives the visual clock instead: MixTempo maps track seconds to mix beats and back,
 * MixPlan answers the same BarPos questions the synth's Timeline does, from the analysed sections.
 * Schemas: client/public/music/back-on-track-v1/bot-v1-manifest.json and bot-v1-beatmap.json.
 */
import type { Section, TrackId } from '../types';
import type { BarPos } from './timeline';

export type { TrackId };

export interface MixSegment {
  url: string;
  start: number;
  duration: number;
  startSample: number;
  samples: number;
  /** Samples of padding before / after the core in the file (decoder priming absorbed here). */
  pre: number;
  post: number;
  bytes: number;
}

export interface MixManifest {
  v: 1;
  id: string;
  title: string;
  artist: string;
  credit: string;
  bpm: number;
  duration: number;
  sampleRate: number;
  totalSamples: number;
  segSec: number;
  cdnBase: string;
  sameOriginBase: string;
  beatmap: string;
  segments: MixSegment[];
}

export interface MixBeatmap {
  v: 1;
  bpm: number;
  duration: number;
  beatsPerBar: 4;
  barPhase: number;
  firstBeat: number;
  firstDownbeat: number;
  beatless: [number, number][];
  beats: number[];
  drops: number[];
  builds: number[];
  breakdowns: [number, number][];
  kick: [number, number][];
  energy: number[];
  sections: { bar: number; section: Section }[];
}

/** CDN `VERSIONED` names (.github/workflows/cdn-sync.yml): immutable cache headers. */
const VERSIONED = /-v[0-9]+-/;
const SECTIONS: readonly Section[] = ['intro', 'groove', 'build', 'drop', 'breakdown'];

type Obj = Record<string, unknown>;

function fail(field: string): never {
  throw new Error(`bad manifest: ${field}`);
}
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (o: Obj, k: string, p = ''): number => {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(p + k);
  return v;
};
const str = (o: Obj, k: string, p = ''): string => {
  const v = o[k];
  if (typeof v !== 'string' || !v) fail(p + k);
  return v;
};
/** A file name next to the manifest: versioned, no path, no query. */
const fileName = (o: Obj, k: string, p = ''): string => {
  const v = str(o, k, p);
  if (!VERSIONED.test(v) || !/^[A-Za-z0-9._-]+$/.test(v)) fail(p + k);
  return v;
};
const numArray = (o: Obj, k: string, p: string): number[] => {
  const v = o[k];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) fail(p + k);
  return v as number[];
};
const spanArray = (o: Obj, k: string, p: string): [number, number][] => {
  const v = o[k];
  if (!Array.isArray(v)) fail(p + k);
  for (const s of v) {
    if (!Array.isArray(s) || s.length !== 2 || s.some((x) => typeof x !== 'number' || !Number.isFinite(x)) || s[1] < s[0]) fail(p + k);
  }
  return v as [number, number][];
};

export function parseManifest(json: unknown): MixManifest {
  if (!isObj(json)) fail('root');
  if (json.v !== 1) fail('v');
  const sampleRate = num(json, 'sampleRate');
  const totalSamples = num(json, 'totalSamples');
  if (sampleRate <= 0 || totalSamples <= 0) fail('totalSamples');
  const segs = json.segments;
  if (!Array.isArray(segs) || !segs.length) fail('segments');
  let at = 0;
  const segments = segs.map((s, i): MixSegment => {
    const p = `segments[${i}].`;
    if (!isObj(s)) fail(`segments[${i}]`);
    const seg: MixSegment = {
      url: fileName(s, 'url', p),
      start: num(s, 'start', p),
      duration: num(s, 'duration', p),
      startSample: num(s, 'startSample', p),
      samples: num(s, 'samples', p),
      pre: num(s, 'pre', p),
      post: num(s, 'post', p),
      bytes: num(s, 'bytes', p),
    };
    if (seg.startSample !== at) fail(`${p}startSample`);
    if (seg.samples <= 0 || seg.pre < 0 || seg.post < 0) fail(`${p}samples`);
    at += seg.samples;
    return seg;
  });
  if (at !== totalSamples) fail('totalSamples');
  const duration = num(json, 'duration');
  if (Math.abs(duration - totalSamples / sampleRate) > 0.001) fail('duration');
  return {
    v: 1,
    id: str(json, 'id'),
    title: str(json, 'title'),
    artist: str(json, 'artist'),
    credit: str(json, 'credit'),
    bpm: num(json, 'bpm'),
    duration,
    sampleRate,
    totalSamples,
    segSec: num(json, 'segSec'),
    cdnBase: str(json, 'cdnBase'),
    sameOriginBase: str(json, 'sameOriginBase'),
    beatmap: fileName(json, 'beatmap'),
    segments,
  };
}

export function parseBeatmap(json: unknown): MixBeatmap {
  const p = 'beatmap.';
  if (!isObj(json)) fail('beatmap');
  if (json.v !== 1) fail(p + 'v');
  if (json.beatsPerBar !== 4) fail(p + 'beatsPerBar');
  const duration = num(json, 'duration', p);
  const barPhase = num(json, 'barPhase', p);
  if (!Number.isInteger(barPhase) || barPhase < 0 || barPhase > 3) fail(p + 'barPhase');
  const beats = numArray(json, 'beats', p);
  if (beats.length < 8) fail(p + 'beats');
  for (let i = 1; i < beats.length; i++) if (!(beats[i] > beats[i - 1])) fail(p + 'beats');
  const energy = numArray(json, 'energy', p);
  if (!energy.length) fail(p + 'energy');
  const kick = spanArray(json, 'kick', p);
  if (kick.some(([a, b]) => a < 0 || b > duration + 0.001)) fail(p + 'kick');
  const rawSections = json.sections;
  if (!Array.isArray(rawSections) || !rawSections.length) fail(p + 'sections');
  const sections = rawSections.map((s, i) => {
    if (!isObj(s) || typeof s.bar !== 'number' || !Number.isInteger(s.bar) || !SECTIONS.includes(s.section as Section)) fail(`${p}sections[${i}]`);
    return { bar: s.bar, section: s.section as Section };
  });
  for (let i = 1; i < sections.length; i++) if (!(sections[i].bar > sections[i - 1].bar)) fail(p + 'sections');
  return {
    v: 1,
    bpm: num(json, 'bpm', p),
    duration,
    beatsPerBar: 4,
    barPhase,
    firstBeat: num(json, 'firstBeat', p),
    firstDownbeat: num(json, 'firstDownbeat', p),
    beatless: spanArray(json, 'beatless', p),
    beats,
    drops: numArray(json, 'drops', p),
    builds: numArray(json, 'builds', p),
    breakdowns: spanArray(json, 'breakdowns', p),
    kick,
    energy,
    sections,
  };
}

/** Largest index i with arr[i] <= x (−1 if none). */
function floorIndex(arr: readonly number[], x: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (!arr.length || x < arr[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Track seconds ↔ mix beats. Downbeats fall on multiples of 4 (`beatAt(beats[barPhase]) = 0`). */
export class MixTempo {
  private readonly b: readonly number[];
  private readonly phase: number;
  private readonly spb: number;
  private bpmKey = -2;
  private bpmVal: number;

  constructor(map: MixBeatmap) {
    this.b = map.beats;
    this.phase = map.barPhase;
    this.spb = 60 / map.bpm;
    this.bpmVal = map.bpm;
  }

  beatAt(sec: number): number {
    const b = this.b;
    const n = b.length;
    if (sec <= b[0]) return -this.phase - (b[0] - sec) / this.spb;
    if (sec >= b[n - 1]) return n - 1 - this.phase + (sec - b[n - 1]) / this.spb;
    const j = floorIndex(b, sec);
    return j - this.phase + (sec - b[j]) / (b[j + 1] - b[j]);
  }

  secAt(beat: number): number {
    const b = this.b;
    const n = b.length;
    const x = beat + this.phase;
    if (x <= 0) return b[0] + x * this.spb;
    if (x >= n - 1) return b[n - 1] + (x - (n - 1)) * this.spb;
    const j = Math.floor(x);
    return b[j] + (x - j) * (b[j + 1] - b[j]);
  }

  /** 60 / the mean beat interval of the 16 beats around `sec`, 2 decimals. */
  bpmAt(sec: number): number {
    const b = this.b;
    const n = b.length;
    const j = Math.max(0, Math.min(n - 1, floorIndex(b, sec)));
    if (j === this.bpmKey) return this.bpmVal;
    const lo = Math.max(0, Math.min(n - 17, j - 8));
    const hi = Math.min(n - 1, lo + 16);
    const mean = (b[hi] - b[lo]) / (hi - lo);
    this.bpmKey = j;
    this.bpmVal = Math.round((60 / mean) * 100) / 100;
    return this.bpmVal;
  }

  barStart(bar: number): number {
    return this.secAt(4 * bar);
  }
}

/** The mix's arrangement as BarPos (mix bars: bar 0 starts at beats[barPhase], bar −1 is the intro). */
export class MixPlan {
  private readonly sections: { bar: number; section: Section }[];
  private readonly sectionBars: number[];
  private readonly dropBars: number[];
  private readonly lastBar: number;
  private readonly kick: [number, number][];
  private readonly kickStarts: number[];
  private readonly energy: number[];
  private readonly beatlessSpans: [number, number][];

  constructor(map: MixBeatmap) {
    this.sections = map.sections;
    this.sectionBars = map.sections.map((s) => s.bar);
    this.dropBars = map.sections.filter((s) => s.section === 'drop').map((s) => s.bar);
    this.lastBar = Math.floor(new MixTempo(map).beatAt(map.duration) / 4);
    this.kick = map.kick;
    this.kickStarts = map.kick.map((k) => k[0]);
    this.energy = map.energy;
    this.beatlessSpans = map.beatless;
  }

  at(mixBar: number): BarPos {
    const s = this.sections;
    const i = Math.max(0, floorIndex(this.sectionBars, mixBar));
    const entry = s[i];
    const end = i + 1 < s.length ? s[i + 1].bar : Math.max(entry.bar + 1, this.lastBar + 1);
    let loop = 0;
    for (const d of this.dropBars) if (d <= mixBar) loop++;
    return {
      bar: mixBar,
      section: entry.section,
      startBar: entry.bar,
      sectionBar: mixBar - entry.bar,
      bars: end - entry.bar,
      cause: 'arrangement',
      loop,
    };
  }

  kickAt(sec: number): boolean {
    const i = floorIndex(this.kickStarts, sec);
    return i >= 0 && sec < this.kick[i][1];
  }

  energyAt(sec: number): number {
    const e = this.energy;
    if (sec <= 0) return e[0];
    const i = Math.floor(sec);
    if (i >= e.length - 1) return e[e.length - 1];
    const f = sec - i;
    return e[i] + (e[i + 1] - e[i]) * f;
  }

  beatless(sec: number): boolean {
    return this.beatlessSpans.some(([a, b]) => sec >= a && sec < b);
  }
}
