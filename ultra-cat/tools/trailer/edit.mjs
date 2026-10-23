// Assemble the cuts from the footage, the card frames and the soundtrack (called by edit.sh).
//   node tools/trailer/edit.mjs [trailer|mode|loop|stills ...]
// Outputs land in client/public/home/media/ (trailer, mode, loop + posters), client/public/home/media/t/ (hub tab)
// and client/public/game-select/ (picker art); review copies and contact sheets in build/out/.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CUTS, FPS, layout } from './edl.mjs';
import { ASPECTS, BUILD, FOOTAGE, ROOT } from './lib.mjs';

const CLIENT = path.resolve(ROOT, '../client/public');
const MEDIA = path.join(CLIENT, 'home/media');
const OUT = path.join(BUILD, 'out');
const SEG = path.join(BUILD, 'seg');
for (const d of [OUT, SEG, path.join(MEDIA, 't'), path.join(CLIENT, 'game-select')]) fs.mkdirSync(d, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args.map(String)], { stdio: ['ignore', 'inherit', 'inherit'] });
const frames = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString().trim());
const GRADE = 'eq=contrast=1.05:saturation=1.1';
// Web delivery: the cuts are edited at 60 fps (beat grid, sfx sync) and shipped at 30 fps, capped near 1.7-1.8 Mb/s, so
// the home page pulls about 8.5 MB for the trailer and 6 MB for the mode cut (the 60 fps 2.5 Mb/s masters were 13 + 10)
const WEB_FPS = 30;
const MAXRATE = { trailer: 1800, mode: 1700 }; // kb/s (budgets: trailer <= 9 MB, mode <= 6.5 MB)

function cut(id) {
  const c = CUTS[id];
  const [W, H] = ASPECTS[c.aspect].size;
  const { clips, frames: total } = layout(c);
  const dir = path.join(SEG, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  clips.forEach((k, i) => {
    const src = path.join(FOOTAGE, `${k.shot}-${c.aspect}.mp4`);
    if (!fs.existsSync(src)) throw new Error(`missing ${src} (run capture.mjs ${k.shot})`);
    let vf = `trim=start_frame=${k.src}:end_frame=${k.src + k.len},setpts=PTS-STARTPTS`;
    if (k.fx === 'end') vf += `,gblur=sigma=16,eq=brightness=-0.2:saturation=1.2`;
    else vf += `,${GRADE}`;
    if (k.fx === 'punch') vf += `,zoompan=z='1+0.07*pow(max(0\\,1-in/7)\\,2)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS}`;
    vf += ',format=yuv420p';
    const out = path.join(dir, `${String(i).padStart(2, '0')}-${k.shot}.mp4`);
    ff(['-i', src, '-vf', vf, '-frames:v', k.len, '-r', FPS, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', 10, out]);
    const got = frames(out);
    if (got !== k.len) throw new Error(`${out}: ${got} frames, want ${k.len}`);
    list.push(`file '${out}'`);
  });
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  const pic = path.join(dir, 'picture.mp4');
  ff(['-f', 'concat', '-safe', 0, '-i', path.join(dir, 'list.txt'), '-c', 'copy', pic]);
  const cards = path.join(BUILD, 'cards', id, 'f%04d.png');
  const wav = path.join(BUILD, 'audio', `${id}.wav`);
  const out = path.join(MEDIA, `${c.out}.mp4`);
  ff([
    '-i', pic, '-framerate', FPS, '-i', cards, '-i', wav,
    '-filter_complex', `[0:v]setpts=N/(${FPS}*TB)[p];[1:v]setpts=N/(${FPS}*TB),format=rgba[c];[p][c]overlay=format=auto:eof_action=pass,fps=${WEB_FPS},format=yuv420p,setsar=1[v]`,
    '-map', '[v]', '-map', '2:a', '-frames:v', Math.round((total * WEB_FPS) / FPS), '-r', WEB_FPS,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', 23, '-maxrate', `${MAXRATE[id]}k`, '-bufsize', `${MAXRATE[id] * 2}k`, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', WEB_FPS * 2,
    '-c:a', 'aac', '-b:a', '128k', '-ar', 48000, '-movflags', '+faststart', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out,
  ]);
  // poster: a frame with the title on it
  const pf = c.cards.find((k) => k.kind === 'slam');
  const at = c.posterAt ?? (pf?.at ?? 0) + 22;
  if (c.poster) {
    // a clean hero frame from a take under the settled title card
    const [shot, f] = c.poster;
    const card = path.join(BUILD, 'cards', id, `f${String(pf.at + 40).padStart(4, '0')}.png`);
    ff(['-i', path.join(FOOTAGE, `${shot}-${c.aspect}.mp4`), '-i', card, '-filter_complex', `[0:v]select='eq(n,${f})',${GRADE}[b];[b][1:v]overlay=0:${Math.round(-H * 0.18)}`, '-frames:v', 1, '-q:v', 3, path.join(MEDIA, `${c.out}.jpg`)]);
  } else ff(['-i', out, '-vf', `select='eq(n,${Math.round((at * WEB_FPS) / FPS)})'`, '-frames:v', 1, '-q:v', 3, path.join(MEDIA, `${c.out}.jpg`)]);
  // review: one frame a second
  const T = c.aspect === '16x9' ? '480:270' : '216:384';
  ff(['-i', out, '-vf', `select='not(mod(n\\,${WEB_FPS}))',scale=${T},tile=${c.aspect === '16x9' ? '5x8' : '10x3'}:padding=4`, '-frames:v', 1, '-update', 1, path.join(OUT, `contact-${id}.jpg`)]);
  console.log(`${id}: ${out}`);
}

function loop() {
  // 8 s from the clean Meowhattan take (laser at take f150); the last 0.6 s cross-fade into the first frames
  const src = path.join(FOOTAGE, 'loop-16x9.mp4');
  const S = 110, N = 480, X = 36;
  const out = path.join(MEDIA, 'ultracat-loop.mp4');
  ff([
    '-i', src,
    '-filter_complex',
    `[0:v]trim=start_frame=${S}:end_frame=${S + N + X},setpts=PTS-STARTPTS,${GRADE},scale=1280:720:flags=lanczos,fps=60,settb=1/60,split[a][b];` +
      `[a]trim=start_frame=${X},setpts=PTS-STARTPTS,fps=60[main];[b]trim=end_frame=${X},setpts=PTS-STARTPTS,fps=60[head];` +
      `[main][head]xfade=transition=fade:duration=${X / FPS}:offset=${(N - X) / FPS},fps=30,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', 30, '-maxrate', '1000k', '-bufsize', '1500k', '-profile:v', 'high', '-g', 60, '-movflags', '+faststart', out,
  ]);
  ff(['-i', out, '-frames:v', 1, '-q:v', 3, path.join(MEDIA, 'ultracat-loop.jpg')]);
  console.log('loop:', out);
}

function stills() {
  // clean (no HUD) gameplay frames from the loop take: picker art 624x436, hub tab 320x200
  const src = path.join(FOOTAGE, 'loop-16x9.mp4');
  const F = Number(process.env.STILL_FRAME ?? 440);
  const png = path.join(OUT, 'still.png');
  ff(['-i', src, '-vf', `select='eq(n,${F})',${GRADE}`, '-frames:v', 1, png]);
  ff(['-i', png, '-vf', 'crop=1545:1080:(iw-1545)/2:0,scale=624:436:flags=lanczos', '-c:v', 'libwebp', '-quality', 82, path.join(CLIENT, 'game-select/ultracat-preview@2x.webp')]);
  ff(['-i', png, '-vf', 'crop=1728:1080:(iw-1728)/2:0,scale=320:200:flags=lanczos', '-c:v', 'libwebp', '-quality', 80, path.join(MEDIA, 't/tab-ultracat.webp')]);
  console.log('stills from loop take frame', F);
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : ['trailer', 'mode', 'loop', 'stills'];
for (const id of want) {
  if (id === 'loop') loop();
  else if (id === 'stills') stills();
  else cut(id);
}
