// Clip render (browser): re-encodes the last ~12 s of the replay ring in real time (about 14 s) with the chosen crop
// (9:16 follows Mochi), the watermark, the stage tag, the hype layer (score counter, combo pill, tier stamps, trick
// popups and callouts from the capture timeline) and a 2.3 s end card with a sting. The ring segments play one after another in hidden <video>
// elements; their sound goes through WebAudio into the clip's own MediaStreamDestination (never to the speakers).
import { audio, tone } from '../audio/synth';
import { isTouch } from '../core/engine';
import { stages } from '../core/registry';
import { G, game, prefs } from '../core/state';
import { lastRunResult } from '../ui/flow';
import { fmtDist, fmtInt } from '../ui/format';
import { ugc } from '../ugc/contract';
import { fileStem } from '../ugc/sharekit';
import { clipMime, cutNow, endMark, ring } from './capture';
import { focusAt, hypeAt, newFrame as newHypeFrame, scoreAt } from './hype';
import { timeline } from './timeline';
import { cropRect, outputSize, type Aspect, type Crop } from './layout';
import { drawEndCard, drawHype, fallbackPortrait, overlayCanvas, type CardData, type HypeView } from './paint';

export const CLIP_SECONDS = 12;
export const END_CARD_SECONDS = 2.3;

// the default look painter draws nothing: captured before any lane provides its own
const defaultDrawLook = ugc.drawLook;

export class RenderAborted extends Error {
  constructor() {
    super('clip render aborted');
    this.name = 'RenderAborted';
  }
}

export interface RenderOpts {
  aspect: Aspect;
  /** the compositor canvas, as soon as it exists (the sheet shows it as the live preview) */
  onCanvas?(c: HTMLCanvasElement): void;
  /** 0..1 and the seconds left */
  onProgress?(done: number, secondsLeft: number): void;
  signal?: { aborted: boolean };
}
export interface RenderOut {
  file: File;
  ms: number;
  w: number;
  h: number;
  /** seconds of footage (without the end card) */
  seconds: number;
}

/** The end-card data: the last result on the results screen, the live run from pause. */
export function cardData(): CardData {
  const live = game.mode === 'play' || game.mode === 'paused' || game.mode === 'finish';
  const r = live ? null : lastRunResult();
  const id = r?.stageId ?? game.stage?.id;
  let stageName = 'Meow Run';
  try {
    stageName = (id && stages.has(id) ? stages.get(id).name : game.stage?.name) || stageName;
  } catch {
    /* keep the default */
  }
  const endlessLike = id === 'endless' || id === 'daily';
  const score = r ? r.score : G.score;
  const dist = r ? r.distance : G.distance;
  let rank = '';
  try {
    rank = ugc.styleSummary().rank || '';
    // shared media only brag: a C rank is left off the end card (the in-game stamp still shows it)
    if (rank === 'C') rank = '';
  } catch {
    rank = '';
  }
  let name = '';
  try {
    name = ugc.playerName();
  } catch {
    name = '';
  }
  return {
    name: name || 'A Mochi fan',
    score: fmtInt(score),
    line: endlessLike ? `${stageName} - ${fmtDist(dist)}` : stageName,
    rank,
  };
}
/** the stage name for the top-left tag */
function stageLabel(): string {
  const r = game.mode === 'over' || game.mode === 'title' ? lastRunResult() : null;
  const id = r?.stageId ?? game.stage?.id;
  try {
    return (id && stages.has(id) ? stages.get(id).name : game.stage?.name) || 'Meow Run';
  } catch {
    return 'Meow Run';
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function once(el: EventTarget, ev: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      el.removeEventListener(ev, on);
      resolve(false);
    }, ms);
    const on = () => {
      clearTimeout(t);
      el.removeEventListener(ev, on);
      resolve(true);
    };
    el.addEventListener(ev, on);
  });
}
async function seek(v: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(v.currentTime - t) < 0.02) return;
  const p = once(v, 'seeked', 2500);
  v.currentTime = t;
  await p;
}
async function playSafe(v: HTMLVideoElement): Promise<void> {
  try {
    await v.play();
  } catch {
    // autoplay policy without a fresh gesture (iOS): video-only from here
    v.muted = true;
    await v.play();
  }
}

type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?(cb: () => void): number; cancelVideoFrameCallback?(h: number): void };

let host: HTMLElement | null = null;
function videoHost(): HTMLElement {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.id = 'clipVideos';
  host.setAttribute('aria-hidden', 'true');
  // in the page (some browsers stop decoding detached or display:none videos) but invisible
  host.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(host);
  return host;
}

/** seconds the next segment starts early (its file opens with a short silence; the two sounds crossfade) */
const PREROLL = 0.12;
/** the 9:16 crop eases toward Mochi (per second) */
const FOLLOW = 3.2;

/** The clip's sound bus: a compressor and makeup gain (about +3.5 dB after the squash; about -14 LUFS overall) and a limiter near -1 dBFS, into the clip's own
 *  MediaStreamDestination (short-form video plays loud: about -14 LUFS). */
function soundBus(ctx: AudioContext, dest: AudioNode): GainNode {
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.knee.value = 8;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.006;
  comp.release.value = 0.16;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.5;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -2.5;
  limit.knee.value = 0;
  limit.ratio.value = 20;
  limit.attack.value = 0.001;
  limit.release.value = 0.06;
  const ceiling = ctx.createGain();
  ceiling.gain.value = 0.89; // -1 dBFS
  input.connect(comp).connect(makeup).connect(limit).connect(ceiling).connect(dest);
  return input;
}

/** Render the clip. Throws RenderAborted when signal.aborted, or an Error when compositing fails. */
export async function renderClip(o: RenderOpts): Promise<RenderOut> {
  const t0 = performance.now();
  const sig = o.signal ?? { aborted: false };
  const check = () => {
    if (sig.aborted) throw new RenderAborted();
  };
  const m = clipMime();
  if (!m) throw new Error('this browser cannot record video');
  await cutNow();
  check();
  // a finished run ends at stageEnd (the flourish), never on the results screen's idle camera
  const endAt = endMark.t >= 0 ? endMark.t : undefined;
  const cov0 = ring.covering(CLIP_SECONDS, endAt);
  if (!cov0) throw new Error('no replay yet');
  const segsAll = endAt === undefined ? cov0.segments : cov0.segments.filter((g) => g.t0 < endAt - 0.05);
  if (!segsAll.length) throw new Error('no replay yet');
  const covSeconds = segsAll.reduce((n, g, i) => n + Math.min(g.t1, endAt ?? g.t1) - g.t0 - (i === 0 ? cov0.offset : 0), 0);
  const cov = { segments: segsAll, offset: cov0.offset, seconds: Math.max(0, covSeconds) };
  if (cov.seconds < 0.5) throw new Error('no replay yet');
  const data = cardData();
  const label = stageLabel();
  const calm = prefs.reducedMotion;

  const urls: string[] = [];
  const vids: FrameVideo[] = [];
  const gains: (GainNode | null)[] = [];
  const A = audio();
  const route = !!A && A.ctx.state !== 'closed';
  const srcs: AudioNode[] = [];
  let mdest: MediaStreamAudioDestinationNode | null = null;
  let bus: GainNode | null = null;
  let rec: MediaRecorder | null = null;
  let outStream: MediaStream | null = null;
  let raf = 0;
  let watchdog = 0;
  try {
    if (route) {
      mdest = A!.ctx.createMediaStreamDestination();
      bus = soundBus(A!.ctx, mdest);
      srcs.push(bus);
      if (A!.ctx.state === 'suspended') void A!.ctx.resume();
    }
    const hostEl = videoHost();
    for (const seg of cov.segments) {
      const v = document.createElement('video') as FrameVideo;
      const url = URL.createObjectURL(seg.blob);
      urls.push(url);
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.muted = !route;
      v.src = url;
      hostEl.appendChild(v);
      let g: GainNode | null = null;
      if (route && bus) {
        try {
          const s = A!.ctx.createMediaElementSource(v);
          g = A!.ctx.createGain();
          s.connect(g).connect(bus);
          srcs.push(s, g);
        } catch {
          v.muted = true;
        }
      }
      gains.push(g);
      vids.push(v);
    }
    const v0 = vids[0];
    if (v0.readyState < 1 && !(await once(v0, 'loadedmetadata', 5000))) throw new Error('replay segment did not load');
    check();
    const crop0 = cropRect(v0.videoWidth, v0.videoHeight, o.aspect);
    // phones and desktops both make 720 x 1280 (9:16) or 1280 x 720 (16:9): what Shorts, Reels and TikTok expect
    const { w, h } = outputSize(crop0, 1280);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.className = 'clip-live';
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2D canvas');
    ctx.imageSmoothingQuality = 'high';
    const overlay = overlayCanvas(w, h, label);
    const crops = new Map<HTMLVideoElement, Crop>();
    const cropOf = (v: HTMLVideoElement): Crop => {
      let c = crops.get(v);
      if (!c) {
        c = v.videoWidth ? cropRect(v.videoWidth, v.videoHeight, o.aspect) : crop0;
        crops.set(v, c);
      }
      return c;
    };
    // the 9:16 strip of a wide source follows Mochi (and a chaser) instead of sitting in the middle
    let followSx = NaN;
    let lastFrameAt = 0;
    const hf = newHypeFrame();
    const hv: HypeView = { score: NaN, combo: 0, comboTier: 0, stamp: null, stampAge: 0, pops: [], popAges: [], callout: null, calloutAge: 0 };
    const draw = (v: HTMLVideoElement, capT: number, withOverlay = true) => {
      if (v.readyState < 2) return;
      const c = cropOf(v);
      let sx = c.sx;
      const W = v.videoWidth;
      if (o.aspect === '9:16' && c.sw < W - 2) {
        const f = focusAt(timeline, capT, c.sw / W);
        const want = Number.isFinite(f) ? Math.max(0, Math.min(W - c.sw, f * W - c.sw / 2)) : c.sx;
        const now = performance.now();
        const dt = lastFrameAt ? Math.min(0.1, (now - lastFrameAt) / 1000) : 0;
        lastFrameAt = now;
        followSx = Number.isFinite(followSx) ? followSx + (want - followSx) * Math.min(1, dt * FOLLOW) : want;
        sx = Math.round(followSx);
      }
      ctx.drawImage(v, sx, c.sy, c.sw, c.sh, 0, 0, w, h);
      if (!withOverlay) return;
      ctx.drawImage(overlay, 0, 0);
      hypeAt(timeline, capT, hf);
      hv.score = scoreAt(timeline, capT);
      hv.combo = hf.combo;
      hv.comboTier = hf.comboTier;
      hv.stamp = hf.stamp;
      hv.stampAge = hf.stampAge;
      hv.pops = hf.pops;
      hv.popAges = hf.popAges;
      hv.callout = hf.callout;
      hv.calloutAge = hf.calloutAge;
      drawHype(ctx, w, h, hv, calm);
    };
    o.onCanvas?.(canvas);

    await seek(v0, cov.offset);
    if (v0.readyState < 2) await once(v0, 'loadeddata', 3000);
    check();
    draw(v0, cov.segments[0].t0 + cov.offset);

    const vtrack = canvas.captureStream(30).getVideoTracks();
    outStream = new MediaStream([...vtrack, ...(mdest ? mdest.stream.getAudioTracks() : [])]);
    rec = new MediaRecorder(outStream, {
      mimeType: m.mime,
      videoBitsPerSecond: isTouch ? 4_500_000 : 6_000_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      rec!.onstop = () => resolve();
    });
    rec.start(1000);

    const total = cov.seconds + END_CARD_SECONDS;
    let played = 0;
    const progress = (sec: number) => {
      const done = Math.max(0, Math.min(1, sec / total));
      o.onProgress?.(done, Math.max(0, Math.ceil(total - sec)));
    };

    // ---- play the segments back to back; each next one starts PREROLL early and the sounds crossfade
    const started: boolean[] = vids.map(() => false);
    const startNext = (i: number) => {
      const nv = vids[i];
      if (!nv || started[i] || nv.readyState < 2) return;
      started[i] = true;
      const g = gains[i];
      const gp = gains[i - 1];
      if (A && g && gp) {
        const T = A.ctx.currentTime;
        g.gain.setValueAtTime(0, T);
        g.gain.linearRampToValueAtTime(1, T + PREROLL);
        gp.gain.setValueAtTime(1, T + PREROLL * 0.5);
        gp.gain.linearRampToValueAtTime(0, T + PREROLL + 0.04);
      }
      void playSafe(nv);
    };
    let lastV: HTMLVideoElement = v0;
    for (let i = 0; i < vids.length; i++) {
      check();
      const v = vids[i];
      const seg = cov.segments[i];
      const start = i === 0 ? cov.offset : 0;
      const segDur = seg.t1 - seg.t0;
      // the last segment of a finished run stops at stageEnd
      const stopAt = endAt !== undefined && i === vids.length - 1 ? Math.max(start + 0.1, endAt - seg.t0) : Infinity;
      if (!started[i]) {
        if (i > 0 && v.readyState < 2 && !(await once(v, 'loadeddata', 3000))) continue;
        started[i] = true;
        await playSafe(v);
      }
      let lastDraw = performance.now();
      let lastT = -1;
      let lastMove = performance.now();
      let useRaf = typeof v.requestVideoFrameCallback !== 'function';
      const onFrame = () => {
        if (sig.aborted || v.ended) return;
        const capT = seg.t0 + v.currentTime;
        draw(v, capT);
        lastV = v;
        lastDraw = performance.now();
        progress(played + Math.max(0, v.currentTime - start));
        if (i + 1 < vids.length && v.currentTime >= segDur - PREROLL) startNext(i + 1);
        if (useRaf) raf = requestAnimationFrame(onFrame);
        else v.requestVideoFrameCallback!(onFrame);
      };
      const ended = once(v, 'ended', 60000);
      if (useRaf) raf = requestAnimationFrame(onFrame);
      else v.requestVideoFrameCallback!(onFrame);
      // watchdog: frame callbacks that stop firing fall back to rAF; a stalled video is skipped
      let stall = false;
      watchdog = window.setInterval(() => {
        const now = performance.now();
        if (!useRaf && now - lastDraw > 250 && !v.paused) {
          useRaf = true;
          raf = requestAnimationFrame(onFrame);
        }
        if (v.currentTime !== lastT) {
          lastT = v.currentTime;
          lastMove = now;
        } else if (now - lastMove > 3000) stall = true;
      }, 200);
      while (!v.ended && !stall && !sig.aborted && v.currentTime < stopAt) {
        await Promise.race([ended, wait(stopAt < Infinity ? 30 : 200)]);
      }
      clearInterval(watchdog);
      cancelAnimationFrame(raf);
      if (sig.aborted) break;
      draw(v, seg.t0 + v.currentTime);
      lastV = v;
      played += Math.max(0, Math.min(stopAt, Number.isFinite(v.duration) ? v.duration : v.currentTime) - start);
      v.pause();
      if (stopAt < Infinity) break;
    }
    check();

    // ---- end card (2.3 s; its background is the last frame without the corner watermark, so only the card's
    // footer brands it), with a sting under it so the clip never ends in silence
    const bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const bctx = bg.getContext('2d');
    if (bctx) {
      if (lastV.readyState >= 2) {
        const c = cropOf(lastV);
        bctx.drawImage(lastV, Number.isFinite(followSx) && o.aspect === '9:16' ? Math.round(followSx) : c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
      } else bctx.drawImage(canvas, 0, 0);
    }
    const portrait = (c: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      try {
        if (ugc.drawLook === defaultDrawLook) fallbackPortrait(c, x, y, size);
        else ugc.drawLook(c, ugc.currentLook(), x, y, size);
      } catch {
        fallbackPortrait(c, x, y, size);
      }
    };
    if (bus) sting(bus);
    const e0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const t = (performance.now() - e0) / 1000;
        drawEndCard(ctx, w, h, bg, data, t, calm, portrait);
        progress(cov.seconds + t);
        if (t >= END_CARD_SECONDS || sig.aborted) return resolve();
        raf = requestAnimationFrame(step);
      };
      step();
    });
    check();
    rec.stop();
    await stopped;
    const type = (rec.mimeType || m.mime).split(';')[0] || 'video/webm';
    const blob = new Blob(chunks, { type });
    if (blob.size < 1000) throw new Error('the clip came out empty');
    const file = new File([blob], `${fileStem('clip')}.${m.ext}`, { type });
    o.onProgress?.(1, 0);
    return { file, ms: Math.round(performance.now() - t0), w, h, seconds: cov.seconds };
  } finally {
    cancelAnimationFrame(raf);
    clearInterval(watchdog);
    if (rec && rec.state !== 'inactive')
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    if (outStream) for (const t of outStream.getTracks()) if (t.kind === 'video') t.stop();
    for (const s of srcs)
      try {
        s.disconnect();
      } catch {
        /* gone */
      }
    for (const v of vids) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    }
    for (const u of urls) URL.revokeObjectURL(u);
  }
}

/** The end-card sting into the clip's sound only: a bright pop, a rising arpeggio and a held chord that rings out
 *  under the whole card. */
function sting(dest: AudioNode): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime + 0.04;
  tone('triangle', 784, 0.18, 0.22, { at: t, dest });
  tone('triangle', 1175, 0.32, 0.2, { at: t + 0.12, dest });
  tone('sine', 1568, 0.4, 0.08, { at: t + 0.12, dest });
  const arp = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < arp.length; i++) tone('square', arp[i], 0.16, 0.05, { at: t + 0.3 + i * 0.09, dest });
  for (const f of [261.63, 329.63, 392, 523.25]) tone('triangle', f, 1.9, 0.09, { at: t + 0.66, attack: 0.04, dest });
  tone('sine', 130.81, 1.9, 0.12, { at: t + 0.66, attack: 0.03, dest });
}

/** The newest raw segment as a file ("Quick save", no watermark) when compositing fails. */
export function quickFile(): File | null {
  const seg = ring.newest();
  const m = clipMime();
  if (!seg || !m) return null;
  const type = (seg.blob.type || m.mime).split(';')[0];
  return new File([seg.blob], `${fileStem('clip')}.${m.ext}`, { type });
}
