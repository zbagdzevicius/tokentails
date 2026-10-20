#!/usr/bin/env node
// Verify the Back on Track segments, manifest and beat map written by track-split.mjs.
//
//   node scripts/track-check.mjs [--src <mp3>] [--out ../client/public/music/back-on-track-v1]
//
// Without --src only the files and schemas are checked. With --src the source is re-decoded on
// the corrected timeline and the priming, seam and timing checks run too. Exits 1 on any failure.
import { closeSync, existsSync, openSync, readFileSync, readSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CDN_BASE, ID, N, PAD, PREFIX, SAME_ORIGIN_BASE, SR, decodeToF32, segName } from "./track-split.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.findIndex((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (i < 0) return undefined;
  return argv[i].includes("=") ? argv[i].split("=").slice(1).join("=") : argv[i + 1];
};
const out = resolve(opt("out") ?? join(HERE, "../../client/public/music/back-on-track-v1"));
const src = opt("src");
const VERSIONED = /-v[0-9]+-/;
const SECTIONS = new Set(["intro", "groove", "breakdown", "build", "drop", "outro"]);

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));
const num = (x) => typeof x === "number" && Number.isFinite(x);
const increasing = (a) => a.every((x, i) => i === 0 || x > a[i - 1]);

// ---------- manifest and files ----------
const manifestPath = join(out, `${PREFIX}manifest.json`);
if (!existsSync(manifestPath)) {
  console.error(`FAIL missing ${manifestPath}`);
  process.exit(1);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8"));
check(m.v === 1 && m.id === ID && typeof m.title === "string" && typeof m.artist === "string" && typeof m.credit === "string", "manifest identity fields");
check(m.sampleRate === SR && m.segSec === 30 && m.codec === "aac-lc" && m.mime === "audio/mp4" && m.bitrate === 128000, "manifest audio fields");
check(m.cdnBase === CDN_BASE && m.sameOriginBase === SAME_ORIGIN_BASE, "manifest bases");
check(num(m.bpm) && m.bpm > 140 && m.bpm < 150, `manifest bpm ${m.bpm}`);
check(Number.isInteger(m.totalSamples) && Math.abs(m.duration - m.totalSamples / m.sampleRate) < 1e-6, `manifest duration ${m.duration} = totalSamples/sampleRate`);
check(Array.isArray(m.segments) && m.segments.length === 125, `segment count ${m.segments?.length} = 125`);
{
  let at = 0, contiguous = true, fields = true, sizes = true, names = true, files = true, maxBytes = 0, total = 0;
  m.segments.forEach((s, i) => {
    if (!(s.url === segName(i) && Number.isInteger(s.startSample) && Number.isInteger(s.samples) && Number.isInteger(s.pre) && Number.isInteger(s.post) && Number.isInteger(s.bytes))) fields = false;
    if (Math.abs(s.start - s.startSample / SR) > 1e-6 || Math.abs(s.duration - s.samples / SR) > 1e-6) fields = false;
    if (s.startSample !== at) contiguous = false;
    if (s.pre !== Math.min(PAD, s.startSample) || s.post !== Math.min(PAD, m.totalSamples - s.startSample - s.samples)) fields = false;
    if (i < m.segments.length - 1 && s.samples !== N) fields = false;
    at += s.samples;
    if (!VERSIONED.test(s.url)) names = false;
    const f = join(out, s.url);
    if (!existsSync(f)) { files = false; return; }
    const b = statSync(f).size;
    if (b !== s.bytes) files = false;
    if (b > 700 * 1024) sizes = false;
    maxBytes = Math.max(maxBytes, b);
    total += b;
  });
  check(fields, "segment fields (url, start, duration, pre, post)");
  check(contiguous && at === m.totalSamples, `segments contiguous, sample sum ${at} = totalSamples ${m.totalSamples}`);
  check(names && VERSIONED.test(manifestPath) && VERSIONED.test(m.beatmap), "every file name is versioned (-vN-)");
  check(files, "every segment file exists with the manifest byte size");
  check(sizes, `largest segment ${(maxBytes / 1024).toFixed(1)} KB <= 700 KB (total ${(total / 1e6).toFixed(2)} MB)`);
}

// ---------- beat map ----------
const bmPath = join(out, m.beatmap);
const bmText = readFileSync(bmPath, "utf8");
const bm = JSON.parse(bmText);
check(bmText === JSON.stringify(bm), "beat map is minified");
check(bmText.length <= 200 * 1024, `beat map ${(bmText.length / 1024).toFixed(1)} KB <= 200 KB`);
check(bm.v === 1 && bm.beatsPerBar === 4 && Number.isInteger(bm.barPhase) && bm.barPhase >= 0 && bm.barPhase < 4, "beat map header");
check(Math.abs(bm.duration - m.duration) < 1e-6 && bm.bpm === m.bpm, "beat map duration and bpm match the manifest");
check(Array.isArray(bm.beats) && bm.beats.length > 0 && bm.beats.every(num) && increasing(bm.beats) && bm.beats[0] >= 0 && bm.beats.at(-1) < bm.duration, `beats strictly increasing inside the duration (${bm.beats.length})`);
check(bm.firstDownbeat === bm.beats[bm.barPhase + 4 * Math.ceil((bm.beats.findIndex((b) => b >= bm.firstBeat) - bm.barPhase) / 4)], "firstDownbeat is on the bar grid");
check(bm.drops.length === bm.builds.length && bm.drops.length === bm.breakdowns.length && increasing(bm.drops), `drops, builds, breakdowns (${bm.drops.length})`);
check(bm.breakdowns.every(([a, b], i) => a < b && b === bm.drops[i] && bm.builds[i] >= a && bm.builds[i] < b), "each breakdown ends at its drop and holds its build");
check(bm.kick.every(([a, b], i) => a < b && a >= 0 && b <= bm.duration + 1e-9 && (i === 0 || a > bm.kick[i - 1][1])), `kick spans ordered inside the duration (${bm.kick.length})`);
check(bm.kick[0][0] === bm.drops[0], "first kick span starts at the first drop");
check(Array.isArray(bm.energy) && bm.energy.length >= Math.floor(bm.duration) && bm.energy.every((e) => num(e) && e >= 0 && e <= 1), `energy per second (${bm.energy.length})`);
check(bm.beatless.length === 1 && bm.beatless[0][0] === 0 && bm.beatless[0][1] === bm.firstBeat, "beatless intro span");
check(bm.sections.length > 0 && bm.sections[0].bar === -1 && bm.sections[0].section === "intro", "sections start with intro at bar -1");
check(bm.sections.every((s, i) => Number.isInteger(s.bar) && SECTIONS.has(s.section) && (i === 0 || (s.bar > bm.sections[i - 1].bar && s.section !== bm.sections[i - 1].section))), `sections sorted, valid, merged (${bm.sections.length})`);
{
  const counts = {};
  for (const s of bm.sections) counts[s.section] = (counts[s.section] ?? 0) + 1;
  check(counts.drop === bm.drops.length, `one drop section per drop (${JSON.stringify(counts)})`);
}

// ---------- audio checks against the source ----------
function decodeSeg(i) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", join(out, segName(i)), "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`decode ${segName(i)}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}
function readSrc(fd, start, len) {
  const buf = Buffer.alloc(len * 8);
  readSync(fd, buf, 0, buf.length, start * 8);
  return new Float32Array(buf.buffer, buf.byteOffset, len * 2);
}

function continuousError(fd, seam, W) {
  const H = 3 * SR;
  const pcm = readSrc(fd, seam - H, 2 * H);
  const file = join(tmpdir(), `bot-v1-cont-${process.pid}.m4a`);
  const enc = spawnSync("ffmpeg", ["-v", "error", "-f", "f32le", "-ar", String(SR), "-ac", "2", "-i", "pipe:0", "-c:a", "aac", "-b:a", "128k", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-y", file], { input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength) });
  if (enc.status !== 0) throw new Error(`continuous encode: ${enc.stderr}`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 26 });
  rmSync(file, { force: true });
  const d = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
  let se = 0, peak = 0;
  for (let k = (H - W) * 2; k < (H + W) * 2; k++) {
    const e = d[k] - pcm[k];
    se += e * e; peak = Math.max(peak, Math.abs(e));
  }
  return { rms: Math.sqrt(se / (4 * W)), peak };
}

if (src) {
  const tmp = join(tmpdir(), `bot-v1-check-${process.pid}.f32`);
  try {
    const total = await decodeToF32(resolve(src), tmp);
    check(total === m.totalSamples, `timing: re-decoded totalSamples ${total} = manifest ${m.totalSamples}`);
    const fd = openSync(tmp, "r");

    // Priming: decoded [pre, pre+4410) lines up with the source at startSample (lag 0 +-1).
    for (const i of [1, 62, 124]) {
      const s = m.segments[i];
      const d = decodeSeg(i);
      const L = 4410, MAXLAG = 64;
      const ref = readSrc(fd, s.startSample, L);
      let best = 0, bestC = -Infinity;
      for (let lag = -MAXLAG; lag <= MAXLAG; lag++) {
        let c = 0, e1 = 0, e2 = 0;
        for (let k = 0; k < L * 2; k++) {
          const a = d[(s.pre + lag) * 2 + k] ?? 0;
          c += a * ref[k]; e1 += a * a; e2 += ref[k] * ref[k];
        }
        const nc = c / Math.sqrt(e1 * e2 + 1e-12);
        if (nc > bestC) { bestC = nc; best = lag; }
      }
      // AAC decodes to whole 1024-sample frames, so the tail may carry up to 1023 extra samples
      // (the player always passes an explicit duration).
      const want = s.pre + s.samples + s.post, got = d.length / 2;
      const lenOk = got >= want && got < want + 1024;
      check(Math.abs(best) <= 1 && bestC > 0.9 && lenOk, `priming seg ${i}: lag ${best} (corr ${bestC.toFixed(4)}), decoded ${got} samples for ${want} (+${got - want} frame tail)`);
    }

    // Seams: join the cores; error vs the source over +-2048 samples around the seam.
    const SEAMS = [[0, 1], [1, 2], [61, 62], [62, 63], [122, 123], [123, 124]];
    for (const [i, j] of SEAMS) {
      const a = m.segments[i], b = m.segments[j];
      const da = decodeSeg(i), db = decodeSeg(j);
      const W = 2048;
      const seam = b.startSample;
      const ref = readSrc(fd, seam - W, 2 * W);
      let se = 0, peak = 0, jumpSeam = 0, jumpRef = 0;
      const joined = new Float32Array(4 * W);
      for (let k = 0; k < W; k++) for (let c = 0; c < 2; c++) {
        joined[k * 2 + c] = da[(a.pre + a.samples - W + k) * 2 + c];
        joined[(W + k) * 2 + c] = db[(b.pre + k) * 2 + c];
      }
      for (let k = 0; k < 4 * W; k++) {
        const e = joined[k] - ref[k];
        se += e * e; peak = Math.max(peak, Math.abs(e));
      }
      for (let c = 0; c < 2; c++) {
        jumpSeam = Math.max(jumpSeam, Math.abs(joined[W * 2 + c] - joined[(W - 1) * 2 + c]));
        jumpRef = Math.max(jumpRef, Math.abs(ref[W * 2 + c] - ref[(W - 1) * 2 + c]));
      }
      const rms = Math.sqrt(se / (4 * W));
      // Baseline: the same source window encoded as one continuous file. AAC 128k waveform error
      // on loud, bright passages is well above 0.04 RMS anywhere in a file, so the seam passes when
      // it is below the absolute bar (rms 0.04, peak 0.2) or no worse than 1.5x the continuous encode.
      const base = continuousError(fd, seam, W);
      const pass = (rms < 0.04 || rms <= 1.5 * base.rms) && (peak < 0.2 || peak <= 1.5 * base.peak);
      check(pass, `seam ${i}|${j}: rms err ${rms.toFixed(5)} (continuous ${base.rms.toFixed(5)}), peak err ${peak.toFixed(4)} (continuous ${base.peak.toFixed(4)}), step at join ${jumpSeam.toFixed(4)} (source ${jumpRef.toFixed(4)})`);
    }
    closeSync(fd);
  } finally {
    rmSync(tmp, { force: true });
  }
} else {
  console.log("skip priming, seam and timing checks (pass --src <mp3>)");
}

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
