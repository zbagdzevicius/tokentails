#!/usr/bin/env node
/**
 * v3.8 type placement from the captured footage (review of v3.7: CACKLEJAW sat under Gabė, GABĖ beside Sir Brutus, so
 * viewers matched the name to the wrong animal; TAKE THEIR CORE. sat over busy trees).
 *
 * - Roll-call tags (N3-N10) are anchored to their own hero: the captured shot's per-frame QC gives the named hero's
 *   projected box, and the tag goes to the free spot nearest the point just under that hero's ground ring.
 * - A few mission lines (`FREE`) go to the free spot nearest their preferred point.
 *
 * "Free" is the edit's type QC: clear of every hero, plate, bar, pop, structure and HUD box by 40 px on every frame the
 * line is drawn, at its real drawn size on that frame (the slam included; read from the type pass's manifest), inside
 * title safe and (9:16) the platforms' safe band y 0.12-0.78. Writes v3/tags.mjs (read by timeline.mjs); run the type
 * pass again afterwards.
 *
 *   node tools/trailer/v3/place-tags.mjs --shots DIR/shots --mg DIR/mg
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../../lib/args.mjs';
import { SHOTS } from './shots.mjs';
import { ASPECTS, TAG_SUBJECTS, sourceFrame, typeEls } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(argValue('--shots') ?? join(HERE, '..', 'out', 'v3', 'shots'));
const MG = resolve(argValue('--mg') ?? join(HERE, '..', 'out', 'v3', 'mg'));
const copy = JSON.parse(readFileSync(join(HERE, 'copy.json'), 'utf8'));
const mg = JSON.parse(readFileSync(join(MG, 'manifest.json'), 'utf8'));
/** The edit's HUD obstacle boxes (landscape fractions) for the 'hudlite' layer. */
const HUDLITE = [[0.385, 0, 0.715, 0.08], [0.835, 0.815, 0.99, 0.985]];
/** Lines placed by a free-space search: aspect -> group id -> { ids, want [x, y] (the group's first line), lead }. */
const FREE = {
  '16x9': { M3: { ids: ['M3a', 'M3b'], want: [0.24, 0.74], reach: 0.6 }, M6: { ids: ['M6'], want: [0.24, 0.26], reach: 0.7 }, M2: { ids: ['M2'], want: [0.5, 0.86] } },
  '9x16': { M2: { ids: ['M2a', 'M2b'], want: [0.55, 0.2], reach: 0.3 } },
};

const out = { '16x9': {}, '9x16': {} };
const report = [];
const qcCache = new Map();
const qcOf = (shot, aspect) => {
  const k = `${shot}/${aspect}`;
  if (!qcCache.has(k)) qcCache.set(k, JSON.parse(readFileSync(join(SHOTS_DIR, shot, aspect, 'qc.json'), 'utf8')));
  return qcCache.get(k);
};

for (const aspect of ['16x9', '9x16']) {
  const { W, H } = ASPECTS[aspect];
  const mgn = (40 * Math.min(W, H)) / 1080;
  const els = typeEls('30', aspect, copy);
  /**
   * Frames a group is drawn on, each with the drawn boxes of its lines relative to the group anchor (the first line's
   * x, y) and the obstacles of that master frame.
   */
  // both cuts: the 15 s cut draws some lines on its own frames (other slams, other pushes under them)
  const framesOf = (ids) => {
    const first = els.find((e) => e.id === ids[0]);
    const list = [];
    for (const [cut, fs, bs] of ['30', '15'].flatMap((c) => Object.entries(mg.cuts[c][aspect].boxes).map(([k, v]) => [c, k, v]))) {
      const f = sourceFrame(cut, Number(fs));
      const mine = bs.filter((b) => ids.includes(b.id));
      if (!mine.length) continue;
      const shot = SHOTS.find((s) => f >= s.f0 && f <= s.f1);
      if (!shot || shot.lobby) continue;
      const q = qcOf(shot.id, aspect)[f];
      if (!q) continue;
      const rel = mine.map((b) => {
        const e = els.find((x) => x.id === b.id);
        // the type pass must have drawn the current timeline (tags.mjs as imported): else the offsets are stale
        if (cut === '30' && Math.abs((b.y0 + b.y1) / 2 - e.y * H) > 0.02 * H) throw new Error(`${b.id} ${aspect}: the type pass is older than tags.mjs; run type.mjs, then place-tags.mjs again`);
        // the drawn box relative to the line's own centre, then that centre relative to the group anchor
        return [b.x0 - e.x * W + (e.x - first.x) * W, b.y0 - e.y * H + (e.y - first.y) * H, b.x1 - e.x * W + (e.x - first.x) * W, b.y1 - e.y * H + (e.y - first.y) * H];
      });
      const obstacles = [
        ...q.heroes.filter((x) => x.box[3] - x.box[1] > 0.03).map((x) => x.box),
        ...(q.plates ?? []).map((p) => p.box),
        ...(q.pops ?? []).map((p) => p.box),
        ...(q.structs ?? []).filter((p) => p.box[3] - p.box[1] > 0.06 && p.box.every((v) => v > -0.5 && v < 1.5)).map((p) => p.box),
        ...(aspect === '16x9' && (shot.layers ?? []).includes('hudlite') ? HUDLITE : []),
      ];
      list.push({ f, q, rel, obstacles });
    }
    return list;
  };
  const free = (frames, cx, cy) => {
    const safe = aspect === '9x16' ? [60, 0.12 * H, W - 60, 0.78 * H] : [0.05 * W, 0.05 * H, 0.95 * W, 0.95 * H];
    for (const fr of frames) {
      for (const [a, b, c, d] of fr.rel) {
        const box = [cx + a, cy + b, cx + c, cy + d];
        if (box[0] < safe[0] || box[2] > safe[2] || box[1] < safe[1] || box[3] > safe[3]) return false;
        for (const [x0, y0, x1, y1] of fr.obstacles) if (box[2] + mgn > x0 * W && box[0] - mgn < x1 * W && box[3] + mgn > y0 * H && box[1] - mgn < y1 * H) return false;
      }
    }
    return true;
  };
  const search = (frames, want, reach, upK = 1.6, ok = () => true) => {
    let best = null;
    for (let dy = -reach; dy <= reach; dy += 6) {
      for (let dx = -reach * 1.6; dx <= reach * 1.6; dx += 6) {
        const cx = want[0] + dx;
        const cy = want[1] + dy;
        const cost = Math.hypot(dx, dy * (dy < 0 ? upK : 1));
        if (best && cost >= best.cost) continue;
        if (ok(cx, cy) && free(frames, cx, cy)) best = { cx, cy, cost };
      }
    }
    return best;
  };

  for (const el of els.filter((e) => e.id in TAG_SUBJECTS)) {
    const hero = TAG_SUBJECTS[el.id];
    const frames = framesOf([el.id]);
    // the subject on each frame: the named hero nearest the frame centre (two Sir Brutus: the one the shot frames)
    const near = (x) => Math.hypot((x.box[0] + x.box[2]) / 2 - 0.5, (x.box[1] + x.box[3]) / 2 - 0.5);
    const all = frames.map((fr) => fr.q.heroes.filter((x) => x.hero === hero).sort((a, b) => near(a) - near(b))[0]);
    const seen = all.filter(Boolean);
    if (!seen.length) throw new Error(`${el.id}: ${hero} not on screen (${aspect})`);
    // the subject's feet (the box bottom is the ground ring) and its height, averaged over the tag's frames
    const fx = (seen.reduce((s, x) => s + (x.box[0] + x.box[2]) / 2, 0) / seen.length) * W;
    const fy = (seen.reduce((s, x) => s + x.box[3], 0) / seen.length) * H;
    const hh = (seen.reduce((s, x) => s + (x.box[3] - x.box[1]), 0) / seen.length) * H;
    const th = Math.max(...frames.flatMap((fr) => fr.rel.map((r) => r[3] - r[1])));
    // a tag reads as naming the hero it is nearest to: the tag's centre must be clearly nearer the subject's box
    // than any other on-screen hero's (GABĖ beside Sir Brutus in v3.7)
    const dist = (cx, cy, b) => Math.hypot(Math.max(b[0] * W - cx, 0, cx - b[2] * W), Math.max(b[1] * H - cy, 0, cy - b[3] * H));
    // (on 85 % of them: a hero walking past the tag for a few frames is not a mislabel)
    const nearestK = (k) => (cx, cy) => frames.filter((fr, i) => {
      const me = all[i] ?? seen[0];
      const d = dist(cx, cy, me.box);
      return fr.q.heroes.filter((x) => x.id !== me.id && x.box[3] - x.box[1] > 0.03).every((x) => dist(cx, cy, x.box) > k * d + 10);
    }).length >= 0.85 * frames.length;
    // the clearest margin that has a free spot: 1.3x, then 1.15x, then simply nearest
    let best = null;
    for (const k of [1.3, 1.15, 1]) if (!best) best = search(frames, [fx, fy + mgn + th / 2 + 4], 4 * hh, 1.6, nearestK(k));
    if (!best) throw new Error(`${el.id} ${aspect}: no free spot within four hero heights of ${hero}`);
    out[aspect][el.id] = [+(best.cx / W).toFixed(3), +(best.cy / H).toFixed(3)];
    report.push(`${aspect} ${el.id} ${hero}: feet ${(fx / W).toFixed(2)},${(fy / H).toFixed(2)} -> ${out[aspect][el.id].join(',')} (${Math.round(best.cost)} px off)`);
  }
  for (const [gid, g] of Object.entries(FREE[aspect])) {
    const frames = framesOf(g.ids);
    const best = search(frames, [g.want[0] * W, g.want[1] * H], (g.reach ?? 0.45) * H, 1);
    if (!best) throw new Error(`${gid} ${aspect}: no free spot`);
    out[aspect][gid] = [+(best.cx / W).toFixed(3), +(best.cy / H).toFixed(3)];
    report.push(`${aspect} ${gid}: want ${g.want.join(',')} -> ${out[aspect][gid].join(',')} (${Math.round(best.cost)} px off)`);
  }
}
const src = `/** Generated by place-tags.mjs from the captured shots' QC and the type pass (v3.8): line centres per aspect. */\nexport const TAGS = {\n${Object.entries(out).map(([a, t]) => `  '${a}': ${JSON.stringify(t)},`).join('\n')}\n};\n`;
writeFileSync(join(HERE, 'tags.mjs'), src);
console.log(report.join('\n'));
