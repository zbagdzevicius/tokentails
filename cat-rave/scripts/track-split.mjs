#!/usr/bin/env node
// Moon Rave second track: split the Back on Track mix into CDN segments plus a beat map.
//
//   node scripts/track-split.mjs --src <mp3> [--raw scripts/track/back-on-track-v1.raw.json]
//                                [--out ../client/public/music/back-on-track-v1]
//
// Deterministic: one decode to f32 PCM (on the corrected timeline, see beatmap.py), then 30 s
// segments cut on sample boundaries with 4096 samples of padding on each side, each encoded to
// AAC-LC 128 kbps .m4a with bit-exact flags. Writes bot-v1-NNN.m4a, bot-v1-manifest.json and
// bot-v1-beatmap.json. Every name carries "-v1-", so cdn-sync gives them immutable cache headers.
// Needs ffmpeg on PATH. No npm dependencies.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
export const AF = "aresample=async=1:min_hard_comp=0.01:first_pts=0";
export const SR = 44100;
export const N = 30 * SR; // 1,323,000 samples per segment core
export const PAD = 4096;
export const PREFIX = "bot-v1-";
export const ID = "back-on-track-v1";
export const CDN_BASE = `https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/w/music/${ID}/`;
export const SAME_ORIGIN_BASE = `/music/${ID}/`;

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      out[k] = v ?? argv[++i];
    }
  }
  return out;
}

export function run(cmd, argv, { input, stdoutFile } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: [input ? "pipe" : "ignore", stdoutFile ? "pipe" : "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    if (stdoutFile) {
      const fd = openSync(stdoutFile, "w");
      p.stdout.on("data", (d) => {
        let off = 0;
        while (off < d.length) off += writeSync(fd, d, off, d.length - off);
      });
      p.on("close", () => closeSync(fd));
    }
    p.on("error", rej);
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}: ${err.trim()}`))));
    if (input) {
      p.stdin.on("error", rej);
      p.stdin.end(input);
    }
  });
}

/** Decode SRC once to interleaved stereo f32le at 44.1 kHz on the corrected timeline. */
export async function decodeToF32(src, file) {
  await run("ffmpeg", ["-v", "error", "-i", src, "-af", AF, "-ac", "2", "-ar", String(SR), "-f", "f32le", "-y", file]);
  return statSync(file).size / 8;
}

/** Segment plan: contiguous cores of N samples plus clamped padding. */
export function plan(totalSamples) {
  const count = Math.ceil(totalSamples / N);
  const segs = [];
  for (let i = 0; i < count; i++) {
    const core0 = i * N;
    const core1 = Math.min((i + 1) * N, totalSamples);
    const f0 = Math.max(0, core0 - PAD);
    const f1 = Math.min(totalSamples, core1 + PAD);
    segs.push({ i, core0, core1, f0, f1, pre: core0 - f0, post: f1 - core1 });
  }
  return segs;
}

export const segName = (i) => `${PREFIX}${String(i).padStart(3, "0")}.m4a`;
const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** Build the shipped beat map (contract section 1.5) from the pinned raw analysis. */
export function buildBeatmap(raw, duration) {
  const beats = raw.beats.map(r3);
  const barPhase = raw.barPhase;
  const nBars = Math.floor((beats.length - 1 - barPhase) / 4) + 1; // bars 0..nBars-1
  const barStart = (k) => (k < 0 ? 0 : beats[barPhase + 4 * k]);
  const barOf = (t) => {
    let lo = -1, hi = nBars - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (barStart(mid) <= t + 0.005) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const { drops, builds, breakdowns } = raw;
  const kick = [];
  let cur = drops[0];
  for (const [s, e] of breakdowns) {
    if (e <= drops[0]) continue;
    if (s > cur) kick.push([r3(cur), r3(s)]);
    cur = Math.max(cur, e);
  }
  if (cur < duration) kick.push([r3(cur), r6(duration)]);

  const lastBar = barOf(duration);
  const raws = [{ bar: -1, section: "intro" }];
  for (let i = 0; i < breakdowns.length; i++) {
    const dropBar = barOf(drops[i]);
    const nextBd = i + 1 < breakdowns.length ? barOf(breakdowns[i + 1][0]) : lastBar + 1;
    raws.push({ bar: barOf(breakdowns[i][0]), section: "breakdown" });
    raws.push({ bar: barOf(builds[i]), section: "build" });
    raws.push({ bar: dropBar, section: "drop" });
    raws.push({ bar: Math.min(dropBar + 16, nextBd), section: "groove" });
  }
  // Each entry runs to the next one; an entry whose span is empty is skipped.
  const kept = raws.filter((e, j) => (j + 1 < raws.length ? raws[j + 1].bar > e.bar : e.bar <= lastBar));
  const sections = [];
  for (const e of kept) if (!sections.length || sections[sections.length - 1].section !== e.section) sections.push(e);

  const energy = raw.energy.map((x, j) => {
    if (x.t !== j) throw new Error(`raw energy index ${j} has t=${x.t}`);
    return Math.round(x.e * 100) / 100;
  });
  const firstBeat = r3(raw.firstBeat);
  return {
    v: 1,
    bpm: Math.round(raw.bpmGlobal * 100) / 100,
    duration: r6(duration),
    beatsPerBar: 4,
    barPhase,
    firstBeat,
    firstDownbeat: r3(raw.firstDownbeat),
    beatless: [[0, firstBeat]],
    beats,
    drops: drops.map(r3),
    builds: builds.map(r3),
    breakdowns: breakdowns.map(([a, b]) => [r3(a), r3(b)]),
    kick,
    energy,
    sections,
  };
}

async function pool(items, n, fn) {
  let next = 0;
  const workers = Array.from({ length: n }, async () => {
    while (next < items.length) {
      const it = items[next++];
      await fn(it);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.src) {
    console.error("usage: node scripts/track-split.mjs --src <mp3> [--raw <raw.json>] [--out <dir>]");
    process.exit(2);
  }
  const rawPath = resolve(a.raw ?? join(ROOT, "scripts/track/back-on-track-v1.raw.json"));
  const out = resolve(a.out ?? join(ROOT, "../client/public/music/back-on-track-v1"));
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const tmp = join(tmpdir(), `bot-v1-split-${process.pid}.f32`);
  try {
    console.log(`decoding ${a.src}`);
    const totalSamples = await decodeToF32(resolve(a.src), tmp);
    if (!Number.isInteger(totalSamples)) throw new Error(`odd PCM size ${totalSamples * 8}`);
    const duration = totalSamples / SR;
    if (Math.abs(duration - raw.duration) >= 0.001) {
      console.error(`timing mismatch: decoded ${duration}s vs beat map ${raw.duration}s`);
      process.exit(1);
    }
    console.log(`totalSamples ${totalSamples} (${duration.toFixed(6)} s)`);

    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(out)) if (f.startsWith(PREFIX)) rmSync(join(out, f));

    const segs = plan(totalSamples);
    const fd = openSync(tmp, "r");
    let done = 0;
    await pool(segs, 4, async (s) => {
      const buf = Buffer.alloc((s.f1 - s.f0) * 8);
      readSync(fd, buf, 0, buf.length, s.f0 * 8);
      await run(
        "ffmpeg",
        ["-v", "error", "-f", "f32le", "-ar", String(SR), "-ac", "2", "-i", "pipe:0",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-map_metadata", "-1",
          "-fflags", "+bitexact", "-flags:a", "+bitexact", "-y", join(out, segName(s.i))],
        { input: buf },
      );
      if (++done % 25 === 0 || done === segs.length) console.log(`encoded ${done}/${segs.length}`);
    });
    closeSync(fd);

    const beatmap = buildBeatmap(raw, duration);
    const beatmapFile = `${PREFIX}beatmap.json`;
    writeFileSync(join(out, beatmapFile), JSON.stringify(beatmap));
    const manifest = {
      v: 1,
      id: ID,
      title: "Back on Track",
      artist: "ModeGospel",
      credit: "Back on Track (mix) by ModeGospel",
      bpm: beatmap.bpm,
      duration: r6(duration),
      sampleRate: SR,
      totalSamples,
      codec: "aac-lc",
      mime: "audio/mp4",
      bitrate: 128000,
      segSec: 30,
      cdnBase: CDN_BASE,
      sameOriginBase: SAME_ORIGIN_BASE,
      beatmap: beatmapFile,
      segments: segs.map((s) => ({
        url: segName(s.i),
        start: r6(s.core0 / SR),
        duration: r6((s.core1 - s.core0) / SR),
        startSample: s.core0,
        samples: s.core1 - s.core0,
        pre: s.pre,
        post: s.post,
        bytes: statSync(join(out, segName(s.i))).size,
      })),
    };
    writeFileSync(join(out, `${PREFIX}manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
    const bytes = manifest.segments.reduce((t, s) => t + s.bytes, 0);
    console.log(`wrote ${segs.length} segments (${(bytes / 1e6).toFixed(1)} MB), manifest and beat map to ${out}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
