/**
 * Test-only loudness model for synth recipes on the fake WebAudio graph (no real rendering in Node).
 * For every source that reaches `out`, it multiplies the envelopes of the gain nodes on its path, the source's
 * power after its filters (harmonic series for oscillators, band fraction for white noise),
 * then takes the loudest 300 ms window of the summed power. Crude, but it ranks recipes the way the ear does
 * for these short percussive cues, which is what the "crash is 3-4 dB louder" rule needs.
 */
import { FakeBiquad, FakeGain, FakeOsc, FakeSrc, type FakeContext, type FakeNode, type FakeParam, type FakeScheduled } from './fake-context.test-util';

export function paramAt(p: FakeParam, x: number): number {
  let v = p.value;
  let tPrev = 0;
  for (const e of p.events) {
    if (e.kind === 'lin' || e.kind === 'exp') {
      if (e.t <= x) {
        v = e.v;
        tPrev = e.t;
      } else {
        const f = e.t > tPrev ? (x - tPrev) / (e.t - tPrev) : 1;
        if (f <= 0) return v;
        return e.kind === 'lin' ? v + (e.v - v) * f : v > 0 ? v * Math.pow(e.v / v, f) : e.v * f;
      }
    } else if (e.kind === 'set' || e.kind === 'target') {
      if (e.t <= x) {
        v = e.v;
        tPrev = e.t;
      } else return v;
    }
  }
  return v;
}

interface Path {
  gains: FakeGain[];
  filters: FakeBiquad[];
}

function pathsTo(n: FakeNode, out: unknown, acc: Path, found: Path[], depth = 0): void {
  if (depth > 24) return;
  for (const o of n.outputs) {
    if (o === out) {
      found.push({ gains: [...acc.gains], filters: [...acc.filters] });
      continue;
    }
    if (o instanceof FakeGain) pathsTo(o, out, { gains: [...acc.gains, o], filters: acc.filters }, found, depth + 1);
    else if (o instanceof FakeBiquad) pathsTo(o, out, { gains: acc.gains, filters: [...acc.filters, o] }, found, depth + 1);
    else if (o && typeof o === 'object' && 'outputs' in (o as object)) pathsTo(o as FakeNode, out, acc, found, depth + 1);
  }
}

function firstValue(p: FakeParam): number {
  return p.events[0]?.v ?? p.value;
}

/** Biquad power response |H(f)|^2 (2nd-order approximations). */
function response(f: FakeBiquad, hz: number): number {
  // a swept filter (brass opening 600 -> 2600 Hz) counts at the geometric mean of its sweep
  const ev = f.frequency.events;
  const sweep = ev.length > 1 ? Math.sqrt(ev[0].v * ev[ev.length - 1].v) : firstValue(f.frequency);
  const fc = Math.max(20, sweep);
  const q = Math.max(0.1, firstValue(f.Q));
  const r = hz / fc;
  if (f.type === 'lowpass') return 1 / (1 + Math.pow(r, 4));
  if (f.type === 'highpass') return 1 / (1 + Math.pow(1 / r, 4));
  const x = q * (r - 1 / r);
  return 1 / (1 + x * x);
}

/** Power of a source after its filters: harmonic series for oscillators, band fraction for white noise. */
function filteredPower(s: FakeScheduled, filters: FakeBiquad[], fs: number): number {
  const ny = fs / 2;
  if (s instanceof FakeSrc) {
    // white noise (power 1/3): integrate the filter response over 0..nyquist on a log grid
    let acc = 0;
    let prev = 20;
    for (let hz = 25; hz < ny; hz *= 1.05) {
      let h = 1;
      for (const f of filters) h *= response(f, hz);
      acc += h * (hz - prev);
      prev = hz;
    }
    return (1 / 3) * (acc / ny);
  }
  if (!(s instanceof FakeOsc)) return 0;
  const f0 = Math.max(20, firstValue(s.frequency));
  let total = 0;
  for (let n = 1; n <= 60 && n * f0 < ny; n++) {
    let a = 0;
    if (s.type === 'sine') a = n === 1 ? 1 : 0;
    else if (s.type === 'sawtooth') a = 2 / (Math.PI * n);
    else if (s.type === 'square') a = n % 2 ? 4 / (Math.PI * n) : 0;
    else a = n % 2 ? 8 / (Math.PI * Math.PI * n * n) : 0; // triangle
    if (!a) continue;
    let h = 1;
    for (const f of filters) h *= response(f, n * f0);
    total += (a * a * h) / 2;
  }
  return total;
}

/** Loudest 300 ms window power (dB, arbitrary reference) of everything started on ctx that reaches `out`. */
export function modelLevelDb(ctx: FakeContext, out: unknown, from = 0, seconds = 3): number {
  const step = 0.002;
  const n = Math.ceil(seconds / step);
  const power = new Float64Array(n);
  for (const s of ctx.sources) {
    if (s.started < 0) continue;
    const found: Path[] = [];
    pathsTo(s, out, { gains: [], filters: [] }, found);
    for (const p of found) {
      const k = filteredPower(s, p.filters, ctx.sampleRate);
      if (!(k > 0)) continue;
      const end = s.stopped >= 0 ? s.stopped : from + seconds;
      for (let i = 0; i < n; i++) {
        const x = from + i * step;
        if (x < s.started || x > end) continue;
        let g = 1;
        for (const gn of p.gains) g *= paramAt(gn.gain, x);
        power[i] += k * g * g;
      }
    }
  }
  const win = Math.round(0.3 / step);
  let best = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += power[i];
    if (i >= win) sum -= power[i - win];
    best = Math.max(best, sum / win);
  }
  return best > 0 ? 10 * Math.log10(best) : -Infinity;
}
