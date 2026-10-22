import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MixPlan, MixTempo, parseBeatmap, parseManifest, type MixBeatmap } from './beatmap';

/** A 4-segment, 120 s manifest (30 s segments). */
function manifestFixture() {
  const sr = 44100;
  const n = 30 * sr;
  return {
    v: 1,
    id: 'fx-v1',
    title: 'Fixture',
    artist: 'Test',
    credit: 'Fixture (mix) by Test',
    bpm: 150,
    duration: 120,
    sampleRate: sr,
    totalSamples: 4 * n,
    codec: 'aac-lc',
    mime: 'audio/mp4',
    bitrate: 128000,
    segSec: 30,
    cdnBase: 'https://cdn.example/w/music/fx-v1/',
    sameOriginBase: '/music/fx-v1/',
    beatmap: 'fx-v1-beatmap.json',
    segments: [0, 1, 2, 3].map((i) => ({
      url: `fx-v1-00${i}.m4a`,
      start: i * 30,
      duration: 30,
      startSample: i * n,
      samples: n,
      pre: i ? 4096 : 0,
      post: i < 3 ? 4096 : 0,
      bytes: 500000,
    })),
  };
}

/** 150 BPM from 0.2 s, barPhase 1 (bar 0 at 0.6 s, a bar every 1.6 s), 120 s. */
function mapFixture(over: Partial<MixBeatmap> = {}): MixBeatmap {
  const beats: number[] = [];
  for (let t = 0.2; t < 120; t += 0.4) beats.push(Math.round(t * 1000) / 1000);
  const bar = (k: number) => 0.6 + 1.6 * k;
  return {
    v: 1,
    bpm: 150,
    duration: 120,
    beatsPerBar: 4,
    barPhase: 1,
    firstBeat: 0.2,
    firstDownbeat: 0.6,
    beatless: [[0, 0.2]],
    beats,
    drops: [bar(12), bar(56)],
    builds: [bar(8), bar(48)],
    breakdowns: [
      [bar(4), bar(12)],
      [bar(40), bar(56)],
    ],
    kick: [
      [bar(12), bar(40)],
      [bar(56), 120],
    ],
    energy: Array.from({ length: 120 }, (_, i) => Math.round((i / 119) * 100) / 100),
    sections: [
      { bar: -1, section: 'intro' },
      { bar: 4, section: 'breakdown' },
      { bar: 8, section: 'build' },
      { bar: 12, section: 'drop' },
      { bar: 28, section: 'groove' },
      { bar: 40, section: 'breakdown' },
      { bar: 48, section: 'build' },
      { bar: 56, section: 'drop' },
      { bar: 72, section: 'groove' },
    ],
    ...over,
  };
}

describe('parseManifest', () => {
  it('parses a valid manifest', () => {
    const m = parseManifest(manifestFixture());
    expect(m.segments).toHaveLength(4);
    expect(m.segments[3].startSample).toBe(3 * 30 * 44100);
    expect(m.credit).toBe('Fixture (mix) by Test');
  });
  it('rejects a missing field', () => {
    const m: Record<string, unknown> = manifestFixture();
    delete m.sampleRate;
    expect(() => parseManifest(m)).toThrow(/bad manifest: sampleRate/);
    const n: Record<string, unknown> = manifestFixture();
    delete n.credit;
    expect(() => parseManifest(n)).toThrow(/bad manifest: credit/);
  });
  it('rejects a gap between segments', () => {
    const m = manifestFixture();
    m.segments[2].startSample += 1;
    expect(() => parseManifest(m)).toThrow(/bad manifest: segments\[2\]\.startSample/);
  });
  it('rejects an unversioned or path-like URL', () => {
    const m = manifestFixture();
    m.segments[1].url = 'segment-001.m4a';
    expect(() => parseManifest(m)).toThrow(/bad manifest: segments\[1\]\.url/);
    const n = manifestFixture();
    n.segments[0].url = '../x-v1-000.m4a';
    expect(() => parseManifest(n)).toThrow(/bad manifest/);
  });
  it('rejects samples that do not add up', () => {
    const m = manifestFixture();
    m.totalSamples += 10;
    expect(() => parseManifest(m)).toThrow(/bad manifest/);
  });
});

describe('parseBeatmap', () => {
  it('parses a valid beat map', () => {
    const b = parseBeatmap(mapFixture());
    expect(b.beats.length).toBe(300);
    expect(b.sections[0]).toEqual({ bar: -1, section: 'intro' });
  });
  it('rejects unsorted beats', () => {
    const m = mapFixture();
    [m.beats[10], m.beats[11]] = [m.beats[11], m.beats[10]];
    expect(() => parseBeatmap(m)).toThrow(/bad manifest: beatmap\.beats/);
  });
  it('rejects unsorted sections and unknown sections', () => {
    const m = mapFixture();
    [m.sections[2], m.sections[3]] = [m.sections[3], m.sections[2]];
    expect(() => parseBeatmap(m)).toThrow(/bad manifest: beatmap\.sections/);
    const n = mapFixture({ sections: [{ bar: -1, section: 'chorus' as never }] });
    expect(() => parseBeatmap(n)).toThrow(/bad manifest/);
  });
  it('rejects a missing field and kick spans outside the track', () => {
    const m: Record<string, unknown> = { ...mapFixture() };
    delete m.energy;
    expect(() => parseBeatmap(m)).toThrow(/bad manifest: beatmap\.energy/);
    expect(() => parseBeatmap(mapFixture({ kick: [[10, 130]] }))).toThrow(/beatmap\.kick/);
  });
});

describe('MixTempo', () => {
  const map = mapFixture();
  const tempo = new MixTempo(map);
  it('downbeats fall on multiples of 4', () => {
    for (const j of [0, 1, 2, 5, 33, 299]) expect(tempo.beatAt(map.beats[j])).toBeCloseTo(j - map.barPhase, 9);
    expect(tempo.barStart(0)).toBeCloseTo(0.6, 9);
    expect(tempo.barStart(10)).toBeCloseTo(16.6, 9);
  });
  it('secAt inverts beatAt', () => {
    for (const t of [0, 0.1, 0.2, 0.37, 5.55, 60.01, 119.7, 119.95, 125]) expect(tempo.secAt(tempo.beatAt(t))).toBeCloseTo(t, 6);
  });
  it('extrapolates before the first beat and after the last at the map bpm', () => {
    expect(tempo.beatAt(0)).toBeCloseTo(-1 - 0.2 / 0.4, 9);
    const last = map.beats[map.beats.length - 1];
    expect(tempo.beatAt(last + 0.8)).toBeCloseTo(map.beats.length - 1 - 1 + 2, 9);
  });
  it('follows a tempo change', () => {
    const beats: number[] = [];
    let t = 1;
    for (let i = 0; i < 16; i++, t += 0.5) beats.push(t);
    for (let i = 0; i < 16; i++, t += 60 / 140) beats.push(t);
    const tc = new MixTempo(mapFixture({ beats, barPhase: 0, bpm: 130 }));
    expect(tc.beatAt(beats[16])).toBeCloseTo(16, 9);
    expect(tc.beatAt(beats[31])).toBeCloseTo(31, 9);
    expect(tc.beatAt(beats[20] + (beats[21] - beats[20]) / 2)).toBeCloseTo(20.5, 9);
    // A 16-beat window: about 120, then about 140 (the window straddles one slower beat at the edge).
    expect(Math.abs(tc.bpmAt(beats[2]) - 120)).toBeLessThan(0.5);
    expect(Math.abs(tc.bpmAt(beats[30]) - 140)).toBeLessThan(2);
  });
});

describe('MixPlan', () => {
  const plan = new MixPlan(mapFixture());
  it('answers BarPos from the sections', () => {
    expect(plan.at(-1)).toMatchObject({ section: 'intro', startBar: -1, sectionBar: 0, bars: 5, cause: 'arrangement', loop: 0 });
    expect(plan.at(9)).toMatchObject({ section: 'build', startBar: 8, sectionBar: 1, bars: 4 });
    expect(plan.at(12)).toMatchObject({ section: 'drop', startBar: 12, sectionBar: 0, bars: 16, loop: 1 });
    expect(plan.at(30)).toMatchObject({ section: 'groove', loop: 1 });
    expect(plan.at(57)).toMatchObject({ section: 'drop', loop: 2 });
    // The last section runs to the end of the track (bar 74).
    expect(plan.at(73)).toMatchObject({ section: 'groove', startBar: 72, bars: 3 });
  });
  it('reads kick spans', () => {
    expect(plan.kickAt(10)).toBe(false);
    expect(plan.kickAt(0.6 + 1.6 * 12 + 0.01)).toBe(true);
    expect(plan.kickAt(0.6 + 1.6 * 45)).toBe(false);
    expect(plan.kickAt(119)).toBe(true);
  });
  it('interpolates energy per second', () => {
    const e = mapFixture().energy;
    expect(plan.energyAt(10)).toBeCloseTo(e[10], 9);
    expect(plan.energyAt(10.5)).toBeCloseTo((e[10] + e[11]) / 2, 9);
    expect(plan.energyAt(500)).toBe(e[e.length - 1]);
  });
  it('knows the beatless intro', () => {
    expect(plan.beatless(0.1)).toBe(true);
    expect(plan.beatless(0.3)).toBe(false);
  });
});

describe('committed Back on Track files', () => {
  const dir = fileURLToPath(new URL('../../../client/public/music/back-on-track-v1/', import.meta.url));
  const manifestPath = `${dir}bot-v1-manifest.json`;
  it.skipIf(!existsSync(manifestPath))('the manifest and beat map parse', () => {
    const m = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
    expect(m.segments.length).toBe(125);
    expect(m.segments.every((s) => /-v[0-9]+-/.test(s.url))).toBe(true);
    const map = parseBeatmap(JSON.parse(readFileSync(dir + m.beatmap, 'utf8')));
    expect(Math.abs(map.duration - m.duration)).toBeLessThan(0.01);
    const tempo = new MixTempo(map);
    expect(tempo.bpmAt(600)).toBeGreaterThan(120);
    expect(tempo.bpmAt(600)).toBeLessThan(160);
    expect(new MixPlan(map).at(-1).section).toBe('intro');
  });
});
