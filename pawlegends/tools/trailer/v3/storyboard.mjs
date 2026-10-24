#!/usr/bin/env node
/**
 * Trailer v3 storyboard tables, generated from what was actually captured and laid out (v3.1 review: the hand-kept
 * storyboard drifted from the edit). Reads v3/shots.mjs, the capture manifest (takes, ticks, QC) and v3/timeline.mjs.
 *
 *   node tools/trailer/v3/storyboard.mjs --dir DIR > STORYBOARD-generated.md
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../../lib/args.mjs';
import { SHOTS } from './shots.mjs';
import { CUT15, typeEls } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(argValue('--dir') ?? join(HERE, '..', 'out', 'v3'));
const man = JSON.parse(readFileSync(join(DIR, 'shots', 'manifest.json'), 'utf8')).shots;
const copy = JSON.parse(readFileSync(join(HERE, 'copy.json'), 'utf8'));
const takes = JSON.parse(readFileSync(join(HERE, '..', 'takes.json'), 'utf8')).takes;

const out = [];
out.push('# Trailer v3.10 storyboard (generated)', '', '## Shots (30 s master, 60 fps)', '');
out.push('| Shot | Frames | Take (human) | Anchor | Ticks | Camera | Ramp | QC 16:9 / 9:16 |', '|---|---|---|---|---|---|---|---|');
for (const s of SHOTS) {
  const l = man[`${s.id}/16x9`];
  const p = man[`${s.id}/9x16`];
  const qc = (m) => (m ? (m.overlaps?.length || m.inStruct?.length || m.edgeText?.length ? 'FAIL' : 'clean') : '-');
  const take = s.take ? `${s.take} (${takes[s.take]?.hero})` : 'lobby';
  const anchor = s.anchor ? `${s.anchor.key}${s.anchor.offset ? `${s.anchor.offset > 0 ? '+' : ''}${s.anchor.offset}` : ''} on f${s.anchor.frame}` : '-';
  const ticks = l?.firstTick != null ? `${l.firstTick.toFixed(0)}-${l.lastTick.toFixed(0)}` : '-';
  const cam = s.lobby ? 'line-up' : s.cam?.base === 'game' ? 'game camera + deltas' : 'GAMECAM preset';
  const ramp = (s.ramp ?? []).map(([f, v]) => `${f}:${v}`).join(' ') || '1';
  out.push(`| ${s.id} | ${s.f0}-${s.f1} | ${take} | ${anchor} | ${ticks} | ${cam} | ${ramp} | ${qc(l)} / ${qc(p)} |`);
}
for (const cut of ['30', '15']) {
  for (const aspect of ['16x9', '9x16']) {
    out.push('', `## Type, ${cut} s ${aspect}`, '', '| Line | Text | In | Out | x, y | Size |', '|---|---|---|---|---|---|');
    for (const e of typeEls(cut, aspect, copy)) out.push(`| ${e.id} | ${e.text} | ${e.in} | ${e.out} | ${e.x}, ${e.y} | ${e.size} |`);
  }
}
out.push('', '## 15 s cut (cut frames <- master frames)', '', '| Cut | Master |', '|---|---|');
for (const [a, b, d] of CUT15) out.push(`| ${a}-${b} | ${a + d}-${b + d} |`);
if (existsSync(join(DIR, 'out', 'report.json'))) {
  const r = JSON.parse(readFileSync(join(DIR, 'out', 'report.json'), 'utf8')).masters;
  out.push('', '## Masters', '', '| Master | Frames | Size | I (LUFS) | LRA | TP (dBTP) | Fails |', '|---|---|---|---|---|---|---|');
  for (const [k, m] of Object.entries(r)) out.push(`| ${k} | ${m.frames} | ${m.video.size} | ${m.loudness.I} | ${m.loudness.LRA} | ${m.loudness.TP} | ${m.fails.length ? m.fails.join('; ') : 'none'} |`);
}
// v3.10: the social copies (v3/social.mjs) of the game cut and of the landing-only variant
for (const [label, rel] of [['game cut', 'out'], ['landing variant', join('out', 'landing')]]) {
  const f = join(DIR, rel, 'social.json');
  if (!existsSync(f)) continue;
  out.push('', `## Social copies, ${label}`, '', '| File | MB | Size | fps | Video kbit/s | AAC kbit/s | I (LUFS) | TP (dBTP) | SSIM | SSIM core fight | Fails |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) {
    out.push(`| ${r.file.split('/').pop()} | ${r.mb} | ${r.size} | ${r.fps.replace('/1', '')} | ${r.kbps} | ${r.audioKbps ?? '-'} | ${r.loudness?.I ?? '-'} | ${r.loudness?.TP ?? '-'} | ${r.ssim} | ${r.ssimHard} | ${r.fails.length ? r.fails.join('; ') : 'none'} |`);
  }
}
console.log(out.join('\n'));
