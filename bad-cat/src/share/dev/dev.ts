/**
 * Share dev page (not shipped): http://localhost:5174/src/share/dev/index.html on the running dev server.
 * Plays real runs with a seeded autopilot, then exports every clip format and card through the share API and
 * exposes the results on `window.__share` (base64) for tools (dev-capture.mjs saves them to test-results/).
 *
 *   ?only=pov,stitch,...   subset of jobs      ?fallback=1   hide VideoEncoder/MediaRecorder (fallback 2)
 *   ?mr=1  hide VideoEncoder only (MediaRecorder path with scheduled audio)
 *   ?style=<0..4>          caption style        ?music=1      add the music sting
 */
import { createAudio } from '../../audio';
import { content } from '../../content';
import { render } from '../../render';
import { sim } from '../../sim';
import { BTN_JUMP, BTN_SWAT, DEFAULT_CAT, propKind, rgb565, type CatSpec, type ClipExportResult, type Dir8, type PlayableRoom, type RunResult, type TickInput } from '../../types';
import * as share from '../index';

declare global {
  interface Window {
    __share?: Record<string, { mime: string; bytes: number; b64: string; meta?: Record<string, unknown> }>;
    __shareDone?: boolean;
    __shareLog?: string[];
  }
}

const q = new URLSearchParams(location.search);
const only = new Set((q.get('only') ?? '').split(',').filter(Boolean));
const want = (k: string) => !only.size || only.has(k);
const style = Number(q.get('style') ?? 0) || 0;
const music = q.get('music') === '1';
const logEl = document.getElementById('log')!;
const outEl = document.getElementById('out')!;
window.__share = {};
window.__shareLog = [];
const log = (s: string) => {
  window.__shareLog!.push(s);
  logEl.textContent += `${s}\n`;
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function pilot(seed: number, ticks: number): TickInput[] {
  const r = rng(seed);
  let dir: Dir8 = 3;
  const out: TickInput[] = [];
  for (let t = 0; t < ticks; t++) {
    if (t % 24 === 0) dir = (1 + Math.floor(r() * 8)) as Dir8;
    const b = t % 9 === 0 ? BTN_SWAT : t % 31 === 0 ? BTN_JUMP : 0;
    out.push({ dir: t % 60 > 50 ? 0 : dir, speed: (t % 120 < 60 ? 2 : 1) as TickInput['speed'], buttons: b });
  }
  return out;
}

const MOCHI: CatSpec = { ...DEFAULT_CAT, pattern: 'tabby', base: rgb565(0xf0a050), secondary: rgb565(0xc06a28), name: 'Mochi' };
const LUNA: CatSpec = { ...DEFAULT_CAT, pattern: 'tuxedo', base: rgb565(0x2a2a30), tertiary: rgb565(0xffffff), eyes: 1, name: 'Luna' };
const MILA: CatSpec = { ...DEFAULT_CAT, pattern: 'calico', base: rgb565(0xe08a3c), secondary: rgb565(0x2b2626), tertiary: rgb565(0xfbf7ef), name: 'Mila' };

function hasRoomba(play: PlayableRoom): boolean {
  return play.room.props.some((p) => propKind(p.kind)?.actor === 'roomba');
}
function falls(r: RunResult): number {
  return r.events.filter((e) => e.t === 'fall').length;
}

/** A room and two runs: one with a Roomba frame-up when the autopilot finds one. */
function pickRuns(): { play: PlayableRoom; a: RunResult; b: RunResult } {
  let best: { play: PlayableRoom; a: RunResult; score: number } | null = null;
  const t0 = performance.now();
  for (let day = 1; day <= 21 && performance.now() - t0 < 15000; day++) {
    const room = content.dailyRoom(day);
    const play = content.resolve(room, 'ranked', day);
    if (!hasRoomba(play)) continue;
    for (let seed = 1; seed <= 25; seed++) {
      const r = sim.runToEnd(play, MOCHI, pilot(seed * 7919 + day, play.room.ticks));
      const score = (r.framed > 0 ? 1000 : 0) + falls(r);
      if (!best || score > best.score) best = { play, a: r, score };
      if (r.framed > 0 && falls(r) >= 3) break;
    }
    if (best && best.a.framed > 0) break;
  }
  if (!best) {
    const play = content.resolve(content.dailyRoom(1), 'ranked', 1);
    best = { play, a: sim.runToEnd(play, MOCHI, pilot(11, play.room.ticks)), score: 0 };
  }
  const play = best.play;
  let b = sim.runToEnd(play, LUNA, pilot(4242, play.room.ticks));
  for (let s = 1; s < 10 && falls(b) < 2; s++) b = sim.runToEnd(play, LUNA, pilot(4242 + s, play.room.ticks));
  return { play, a: best.a, b };
}

/** A synthetic "real cat photo": a warm room with a big orange cat face (procedural, no downloads). */
function photoCanvas(cat: CatSpec, w = 1080, h = 1440, t = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#c9a27e');
  g.addColorStop(1, '#6b4a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2 + Math.sin(t * 3) * 20;
  const cy = h * 0.42;
  const r = w * 0.28;
  const base = `#${((((cat.base >> 11) & 31) << 19) | (((cat.base >> 5) & 63) << 10) | ((cat.base & 31) << 3)).toString(16).padStart(6, '0')}`;
  ctx.fillStyle = base;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * r * 0.3, cy - r * 0.7);
    ctx.lineTo(cx + s * r * 0.95, cy - r * 1.3);
    ctx.lineTo(cx + s * r * 0.95, cy - r * 0.2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.1, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1020';
  const blink = Math.abs(Math.sin(t * 2)) < 0.15 ? 0.1 : 1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * r * 0.4, cy - r * 0.1, r * 0.12, r * 0.18 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff8fa3';
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + r * 0.2);
  ctx.lineTo(cx + 18, cy + r * 0.2);
  ctx.lineTo(cx, cy + r * 0.32);
  ctx.fill();
  return c;
}
function toBlob(c: HTMLCanvasElement, type = 'image/jpeg'): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), type, 0.9));
}
/** A 2.5 s synthetic cat video (MediaRecorder on an animated canvas), or null. */
async function videoOpener(cat: CatSpec): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 540;
  c.height = 720;
  const ctx = c.getContext('2d')!;
  const stream = c.captureStream(30);
  const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return null;
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(100);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.drawImage(photoCanvas(cat, 540, 720, t), 0, 0);
      if (t < 2.6) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: mime.split(';')[0] });
}

async function b64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
async function keep(name: string, blob: Blob | null | undefined, meta: Record<string, unknown> = {}): Promise<void> {
  if (!blob) {
    log(`${name}: (none) ${JSON.stringify(meta)}`);
    return;
  }
  window.__share![name] = { mime: blob.type, bytes: blob.size, b64: await b64(blob), meta };
  log(`${name}: ${blob.type} ${(blob.size / 1024).toFixed(0)} KB ${JSON.stringify(meta)}`);
  const url = URL.createObjectURL(blob);
  const el = blob.type.startsWith('video/') ? Object.assign(document.createElement('video'), { src: url, muted: true, loop: true, autoplay: true, playsInline: true }) : Object.assign(document.createElement('img'), { src: url });
  el.title = name;
  outEl.appendChild(el);
}
function meta(r: ClipExportResult): Record<string, unknown> {
  return { encoder: r.encoder, audio: r.audio, ms: r.ms, error: r.error ?? null };
}

async function main(): Promise<void> {
  const audio = createAudio();
  await audio.unlock().catch(() => undefined);
  log(`audio unlocked: ${audio.unlocked}`);
  const { play, a, b } = pickRuns();
  log(`room ${play.room.id} "${play.room.title}" · A score ${a.score} framed ${a.framed} falls ${falls(a)} · B score ${b.score}`);
  audio.setRoom?.(play);
  const renderer = render.createRenderer(document.getElementById('stage')!);
  await renderer.load(play, [MOCHI]);
  const photo = await toBlob(photoCanvas(MOCHI));
  const photoB = await toBlob(photoCanvas(LUNA));
  const face = { x: 1080 / 2 - 300, y: 1440 * 0.42 - 300, w: 600, h: 600 };
  const fallback = q.get('fallback') === '1' || q.get('mr') === '1';
  const saved: Record<string, unknown> = {};
  if (fallback) {
    for (const k of q.get('mr') === '1' ? ['VideoEncoder'] : ['VideoEncoder', 'MediaRecorder']) {
      saved[k] = (window as unknown as Record<string, unknown>)[k];
      Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true });
    }
  }
  const base = { music, audio, captionStyle: style, faceCrop: face } as const;
  const ex = (cat: CatSpec, r: RunResult, o: Parameters<typeof share.exportClip>[5]) => share.exportClip(render, renderer, play, cat, r, o);

  if (want('pov')) {
    const r = await ex(MOCHI, a, { ...base, opener: photo });
    const tag = q.get('mr') === '1' ? '-mediarecorder' : q.get('fallback') === '1' ? '-fallback' : '';
    await keep(`clip-pov${tag}`, r.blob, meta(r));
    if (r.card) await keep('fallback-card', r.card);
    if (r.gif) await keep('fallback-gif', r.gif, { bytes: r.gif.size });
  }
  if (want('video')) {
    const v = await videoOpener(MOCHI);
    log(`video opener: ${v ? `${v.type} ${v.size} B` : 'none'}`);
    if (v) {
      const r = await ex(MOCHI, a, { ...base, opener: v, faceCrop: { x: 540 / 2 - 150, y: 720 * 0.42 - 150, w: 300, h: 300 } });
      await keep('clip-pov-video-opener', r.blob, meta(r));
    }
  }
  if (want('stitch')) {
    const r = await ex(MOCHI, a, { ...base, opener: photo, format: 'stitch', overlay: '@luna.mom' });
    await keep('clip-stitch', r.blob, meta(r));
  }
  if (want('reply')) {
    const r = await ex(MOCHI, a, { ...base, opener: photo, format: 'reply', overlay: 'dad_of_cats', captionStyle: 1 });
    await keep('clip-reply', r.blob, meta(r));
  }
  if (want('roomba')) {
    const r = await ex(MOCHI, a, { ...base, opener: photo, format: 'roomba' });
    await keep('clip-roomba', r.blob, { ...meta(r), framed: a.framed });
  }
  if (want('irl')) {
    const r = await ex(MOCHI, a, { ...base, format: 'irl_vs_game', captionStyle: 2 });
    await keep('clip-irl-vs-game', r.blob, meta(r));
  }
  if (want('still_waiting')) {
    await renderer.load(play, [MILA]);
    const r = await ex(MILA, a, { ...base, opener: photo, format: 'still_waiting', captionStyle: 3 });
    await keep('clip-still-waiting', r.blob, meta(r));
    await renderer.load(play, [MOCHI]);
  }
  if (want('household')) {
    const r = await ex(MOCHI, a, { ...base, opener: photo, format: 'household', second: { cat: LUNA, run: b, opener: photoB, faceCrop: face }, captionStyle: 4 });
    await keep('clip-household', r.blob, meta(r));
  }
  if (fallback) for (const k of Object.keys(saved)) Object.defineProperty(window, k, { value: saved[k], configurable: true, writable: true });

  if (want('cards')) {
    const link = share.buildRoomLink(play, 'https://tokentails.com/badcat');
    const portraitM = (await render.renderCatPortrait?.(MOCHI, null, { w: 900, h: 1000, pose: 'mugshot' })) ?? null;
    const portraitP = (await render.renderCatPortrait?.(MOCHI, null, { w: 900, h: 820, pose: 'plinth' })) ?? null;
    log(`portraits: mugshot ${!!portraitM} plinth ${!!portraitP}`);
    const summary = { total: 1287, distinct: 31, catalog: 48, framed: 9, topCrimes: [{ name: 'Vase', icon: '🏺', count: 212 }, { name: 'Cake', icon: '🎂', count: 14 }, { name: 'Wine glass', icon: '🍷', count: 9 }], rank: 'Agent of Chaos', streak: 12 };
    const week = { weekId: '2026-W42', crimes: 88, topCrimes: summary.topCrimes, framed: 2, ready: true, mostWanted: ['Mochi', 'Luna'] };
    const cards: [string, Parameters<typeof share.renderCard>[0]][] = [
      ['card-result', { kind: 'result', run: a, play, cat: MOCHI, link }],
      ['card-story', { kind: 'story', run: a, play, cat: MOCHI, link }],
      ['card-rapsheet', { kind: 'rapsheet', cat: MOCHI, portrait: portraitM, summary, week: null, link }],
      ['card-rapsheet-club', { kind: 'rapsheet', cat: MOCHI, portrait: portraitM, summary, week, link, club: true }],
      ['card-cat', { kind: 'cat', cat: MOCHI, portrait: portraitP, link: 'https://tokentails.com/badcat' }],
      ['card-cameo', { kind: 'cameo', cat: MOCHI, portrait: portraitP, dayLabel: 'Kitchen #18', where: 'fridge', link }],
      ['card-cat-long-name', { kind: 'cat', cat: { ...LUNA, name: 'Sir Fluffington' }, portrait: null, link: 'https://tokentails.com/badcat' }],
    ];
    const blobs: Record<string, Blob | null> = {};
    for (const [name, input] of cards) {
      blobs[name] = await share.renderCard(input);
      await keep(name, blobs[name]);
    }
    const slides = await share.renderCarousel({ cards: [blobs['card-cat'], blobs['card-result'], blobs['card-rapsheet']].filter((x): x is Blob => !!x), photo, shortUrl: 'tokentails.com/badcat' });
    log(`carousel: ${slides.length} slides`);
    for (let i = 0; i < slides.length; i++) await keep(`carousel-${i + 1}`, slides[i]);
    const loop = await share.renderRapSheetLoop({ cat: MOCHI, portrait: portraitM, summary, week, link, club: true });
    await keep('card-rapsheet-animated', loop?.blob ?? null);
  }
  log('formats: ' + JSON.stringify(share.formats({ run: a, play, cat: MOCHI, dayLabel: 'Kitchen #18', shortUrl: 'tokentails.com/badcat', club: true, streak: 3, hasSecondCat: true, handle: 'luna.mom' }).map((t) => [t.format, t.available, t.caption])));
  window.__shareDone = true;
  log('DONE');
}

document.getElementById('go')!.addEventListener('click', () => {
  main().catch((e) => {
    log(`FAILED: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    window.__shareDone = true;
  });
});
