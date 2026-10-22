/**
 * Finish clip (GDD 9.1): 12 s, 720×1280, H.264 (+ AAC when the browser can) via mediabunny. Made AFTER the race
 * from the replay, not by screen capture: the race is re-simulated once, in order, and only the planned shots are
 * rendered offscreen into a second WebGL canvas, then composited with the captions onto a 2D canvas that the encoder
 * reads.
 *
 *   0–1.5 s     your cat in the kart on the grid, a close orbit
 *   1.5–8.5 s   the best 7 s of the race (highlight.ts), chase cam with a low side-cam cut; a loop is filmed from its
 *               TV spot beside the loop (iteration 4, F8) and the best moment gets a caption sticker
 *   8.5–10.5 s  the finish at 0.4× from a camera ahead of the kart
 *   10.5–12 s   end card: place, time, track, link, "Beat my cat"
 *
 * Loaded lazily (dynamic import from share/index.ts), so three's second renderer and mediabunny never touch the
 * first paint. Returns null when WebCodecs H.264 is not available (the caller falls back to the result card).
 */
import { PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { unpackInput, type RaceConfig, type RaceEvent, type RaceResult } from '../../types';
import { classTuning } from '../../tuning';
import type { Replay } from '../../core/sim/replay';
import { SimWorld, GO_TICK } from '../../core/sim/world';
import { speedOf } from '../../core/sim/kart';
import { buildTrack } from '../../core/track/build';
import { RaceView } from '../../core/render/race-view';
import { ChaseCamera } from '../../core/camera/chase-camera';
import { OUTLINE_UNIFORMS } from '../../core/render/cat-outline';
import { decalTexture, setFaceDecal } from '../../core/render/face-decal-material';
import { createSimPlugins } from '../../items-ai';
import { CLIP_FPS, CLIP_S, FINISH_S, FINISH_SIM_S, HIGHLIGHT_S, INTRO_S, finishSticker, highlightSticker, planClip, type ClipSticker } from './highlight';
import { finishMargin, isPhotoFinish } from '../../core/app/finish';
import { renderClipAudio } from './clip-audio';
import { fmtRaceTime, ordinalText, rivalsLine } from '../cards/card-text';
import type { EncodedClip } from './encoder-types';

export const CLIP_W = 720;
export const CLIP_H = 1280;

export interface ClipJobInput {
  cfg: RaceConfig;
  replay: Replay;
  events: readonly RaceEvent[];
  result: RaceResult;
  trackName: string;
  catName: string;
  face: HTMLCanvasElement | null;
  /** shown on the end card, e.g. "tokentails.com/meow-race" */
  linkLabel: string;
  /** theme accent 0xRRGGBB */
  accent: number;
}

export interface ClipCancel {
  cancelled: boolean;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

function pill(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg: string, fg: string, align: CanvasTextAlign = 'left'): void {
  g.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const w = g.measureText(text).width + size * 0.9;
  const h = size * 1.45;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x0, y, w, h, h / 2);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x0 + w / 2, y + h / 2 + size * 0.04);
}

const STICKER_TONES: Record<ClipSticker['tone'], [string, string]> = {
  pink: ['#ff3ea5', '#fff3dc'],
  cyan: ['#2cf6f3', '#1a1238'],
  gold: ['#ffd27a', '#1a1238'],
  green: ['#7be495', '#0b3a21'],
};

/** How long a highlight sticker stays (s, clip time) before it fades: it labels the moment, not the whole shot. */
const STICKER_HOLD = 2.6;

/** A caption sticker (F8): a tilted pill with an ink edge that pops in over 0.25 s (and fades after `hold` s). */
function sticker(g: CanvasRenderingContext2D, s: ClipSticker, age: number, y: number, hold = Infinity): void {
  const [bg, fg] = STICKER_TONES[s.tone];
  const size = 46;
  const pop = Math.min(1, age / 0.25);
  const k = pop < 1 ? 0.6 + 0.55 * pop - 0.15 * pop * pop : 1;
  const fade = age > hold ? Math.max(0, 1 - (age - hold) / 0.3) : 1;
  if (fade <= 0) return;
  g.save();
  g.globalAlpha = fade;
  g.translate(CLIP_W / 2, y);
  g.rotate(-0.06);
  g.scale(k, k);
  g.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const w = Math.min(CLIP_W - 60, g.measureText(s.text).width + size * 1.1);
  const h = size * 1.6;
  g.fillStyle = '#1a1238';
  g.beginPath();
  g.roundRect(-w / 2 - 6, -h / 2 - 6 + 8, w + 12, h + 12, (h + 12) / 2);
  g.fill();
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, h / 2);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s.text, 0, size * 0.05, w - size * 0.6);
  g.restore();
}

function bigText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center'): void {
  g.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = '#1a1238';
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

export async function makeClip(inp: ClipJobInput, onProgress: (f: number) => void, cancel: ClipCancel): Promise<EncodedClip | null> {
  const { createWebCodecsEncoder } = await import('./encoder-webcodecs');
  const cuts = [INTRO_S + 2.6, INTRO_S + 4.4];
  const audio = await renderClipAudio(cuts);
  const enc = await createWebCodecsEncoder({ width: CLIP_W, height: CLIP_H, fps: CLIP_FPS, audio });
  if (!enc) return null;

  const gl = document.createElement('canvas');
  gl.width = CLIP_W;
  gl.height = CLIP_H;
  const renderer = new WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(CLIP_W, CLIP_H, false);
  const comp = document.createElement('canvas');
  comp.width = CLIP_W;
  comp.height = CLIP_H;
  const g = comp.getContext('2d')!;

  const cfg = inp.cfg;
  const me = cfg.humans[0] ?? 0;
  const rivals = rivalsLine(cfg.racers.length);
  const scene = new Scene();
  const built = buildTrack(cfg.track, cfg.modifiers);
  const world = new SimWorld(cfg, createSimPlugins(cfg), built);
  const view = new RaceView(scene, built, cfg.racers, cfg.modifiers);
  if (inp.face) {
    const t = decalTexture(inp.face);
    if (t) setFaceDecal(view.karts[me].cat.faceMat, t);
  }
  const chase = new ChaseCamera(CLIP_W / CLIP_H);
  scene.add(chase.cam);
  const free = new PerspectiveCamera(52, CLIP_W / CLIP_H, 0.1, 1400);
  scene.add(free);
  const top = classTuning(cfg.cls).topSpeed;
  const accent = hexCss(inp.accent);

  view.capture(world.st);
  view.capture(world.st);
  const stepTo = (t: number) => {
    while (world.tick < t && !world.done) {
      const v = inp.replay.inputs[world.tick];
      world.step([unpackInput(v === undefined ? 0x17 : v)]);
      view.capture(world.st);
    }
  };

  const endTick = inp.replay.inputs.length;
  // F8: a photo finish (the same margin the results headline shows) leans the window into the duel for the line
  const margin = finishMargin(inp.result, me);
  const photo = isPhotoFinish(margin) ? margin!.margin : null;
  const plan = planClip(inp.events, me, GO_TICK, endTick, { photo: photo != null });
  const hlSticker = highlightSticker(inp.events, me, plan.hlStart, plan.hlStart + plan.hlLen);
  const finSticker = finishSticker(photo, plan.finishTick);
  const tv = { x: 0, y: 0, z: 0 };
  const shown = { x: 0, y: 0, z: 0, heading: 0 };
  const total = Math.round(CLIP_S * CLIP_FPS);
  const fIntro = Math.round(INTRO_S * CLIP_FPS);
  const fHl = fIntro + Math.round(HIGHLIGHT_S * CLIP_FPS);
  const fFin = fHl + Math.round(FINISH_S * CLIP_FPS);
  const snap = { x: 0, y: 0, z: 0, heading: 0 };
  const lookAt = new Vector3();
  let endFrame: ImageBitmap | HTMLCanvasElement | null = null;
  const placeAt = () => world.st.karts[me].place;
  const savedRes = OUTLINE_UNIFORMS.uRes.value.clone();

  let wasRespawning = false;
  const renderAt = (simT: number, dt: number, camWanted: 'chase' | 'side' | 'orbit' | 'front', localS: number) => {
    const target = Math.ceil(simT);
    stepTo(target);
    const alpha = Math.max(0, Math.min(1, 1 - (target - simT)));
    view.update(world.st, alpha, dt, top);
    const k = world.st.karts[me];
    const s = view.lerpKart(me, alpha, snap);
    // F8: on a loop's rail the highlight is filmed from the loop's TV spot (the whole loop in frame)
    const onLoop = (camWanted === 'chase' || camWanted === 'side') && k.rail > 0 && view.tvSpot(k.rail - 1, tv);
    const cam = onLoop ? 'tv' : camWanted;
    // the respawn hand teleports the kart: cut the chase rig with it instead of flying across the map
    if (k.respawnTicks > 0) wasRespawning = true;
    else if (wasRespawning) {
      wasRespawning = false;
      chase.snap(s.x, s.y, s.z, s.heading);
    }
    let camera: PerspectiveCamera = free;
    const fov = cam === 'side' ? 38 : 52;
    if (free.fov !== fov) {
      free.fov = fov;
      free.updateProjectionMatrix();
    }
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    // the chase rig keeps following through the side shot, so the cut back lands behind the kart
    if (cam === 'chase' || cam === 'side' || cam === 'tv') chase.update(k, s.x, s.y, s.z, s.heading, speedOf(k), top, dt);
    if (cam === 'chase') {
      camera = chase.cam;
    } else if (cam === 'tv') {
      // the drawn kart (on the ribbon), not the flat sim point under it
      const d = view.displayPos(me, shown);
      free.position.set(tv.x, tv.y, tv.z);
      lookAt.set(d.x, d.y + 0.6, d.z);
      free.lookAt(lookAt);
    } else if (cam === 'orbit') {
      // close orbit around the driver's face: from front-left to front-right
      const a = s.heading + (-0.9 + (localS / INTRO_S) * 1.8);
      const r = 3.4 - localS * 0.5;
      free.position.set(s.x + Math.sin(a) * r, s.y + 1.75, s.z + Math.cos(a) * r);
      lookAt.set(s.x + fx * 0.2, s.y + 1.45, s.z + fz * 0.2);
      free.lookAt(lookAt);
    } else if (cam === 'side') {
      // telephoto from over the road: on the centre-line side of the kart (clear of the trackside props), high
      // enough to clear the pack, panning as the kart drives past
      const t = built;
      const si = k.si;
      let nx = t.px[si] - s.x;
      let nz = t.pz[si] - s.z;
      let nl = Math.hypot(nx, nz);
      if (nl < 1.5) {
        nx = -fz;
        nz = fx;
        nl = 1;
      }
      const side = Math.min(7, nl + t.halfW[si] * 0.6);
      const along = 6 - localS * 5;
      free.position.set(s.x + (nx / nl) * side + fx * along, s.y + 2.8, s.z + (nz / nl) * side + fz * along);
      lookAt.set(s.x + fx * 0.8, s.y + 0.9, s.z + fz * 0.8);
      free.lookAt(lookAt);
    } else {
      // finish: ahead of the kart, low, looking back as it rushes in
      const ahead = 7.5 - localS * 2.2;
      free.position.set(s.x + fx * ahead - fz * 2.2, s.y + 1.1, s.z + fz * ahead + fx * 2.2);
      lookAt.set(s.x, s.y + 0.9, s.z);
      free.lookAt(lookAt);
    }
    OUTLINE_UNIFORMS.uRes.value.set(CLIP_W, CLIP_H);
    renderer.render(scene, camera);
    OUTLINE_UNIFORMS.uRes.value.copy(savedRes);
    g.drawImage(gl, 0, 0);
  };

  try {
    for (let f = 0; f < total; f++) {
      if (cancel.cancelled) {
        await enc.cancel();
        return null;
      }
      const dt = 1 / CLIP_FPS;
      if (f < fIntro) {
        const local = f / CLIP_FPS;
        renderAt(plan.introTick + f * 2, dt, 'orbit', local);
        pill(g, 'FORMULA MEOW', 36, 60, 34, accent, '#1a1238');
        if (local > 0.2) bigText(g, inp.catName.toUpperCase(), CLIP_W / 2, CLIP_H - 300, 104, '#fff3dc');
        if (local > 0.6 && rivals) pill(g, rivals, CLIP_W / 2, CLIP_H - 250, 30, '#fff3dc', '#1a1238', 'center');
      } else if (f < fHl) {
        const local = (f - fIntro) / CLIP_FPS;
        if (f === fIntro) {
          stepTo(plan.hlStart);
          const k = world.st.karts[me];
          chase.snap(k.x, k.y, k.z, k.heading);
        }
        const rate = plan.hlLen / (HIGHLIGHT_S * 60);
        const simT = plan.hlStart + local * 60 * rate;
        const side = local >= 2.6 && local < 4.4;
        renderAt(simT, dt * rate, side ? 'side' : 'chase', side ? local - 2.6 : local);
        bigText(g, ordinalText(placeAt()), 40, 150, 120, '#ffd27a', 'left');
        if (hlSticker && simT >= hlSticker.tick) sticker(g, hlSticker, (simT - hlSticker.tick) / 60 / rate, CLIP_H - 260, STICKER_HOLD);
        pill(g, `LAP ${Math.min(world.st.laps, Math.max(1, world.st.karts[me].lap))}/${world.st.laps}`, CLIP_W - 36, 60, 32, '#1a1238', '#fff3dc', 'right');
      } else if (f < fFin && plan.finishStart != null) {
        const local = (f - fHl) / CLIP_FPS;
        if (f === fHl) stepTo(plan.finishStart);
        const simT = plan.finishStart + local * 60 * (FINISH_SIM_S / FINISH_S);
        renderAt(simT, dt * 0.4, 'front', local);
        const crossed = plan.finishTick != null && simT >= plan.finishTick;
        if (crossed) {
          bigText(g, 'FINISH!', CLIP_W / 2, 260, 130, '#ff3ea5');
          bigText(g, fmtRaceTime(inp.result.player.time), CLIP_W / 2, 360, 72, '#fff3dc');
          if (finSticker) sticker(g, finSticker, (simT - finSticker.tick) / 60 / (FINISH_SIM_S / FINISH_S), CLIP_H - 260);
        } else bigText(g, ordinalText(placeAt()), 40, 150, 120, '#ffd27a', 'left');
        pill(g, '0.4×', CLIP_W - 36, 60, 30, '#ff3ea5', '#fff3dc', 'right');
      } else if (f < fFin) {
        // no finish (DNF): keep chasing
        renderAt(Math.min(endTick, plan.hlStart + plan.hlLen + (f - fHl) * 2), dt, 'chase', 0);
      } else {
        if (!endFrame) {
          const c = document.createElement('canvas');
          c.width = CLIP_W;
          c.height = CLIP_H;
          c.getContext('2d')!.drawImage(gl, 0, 0);
          endFrame = c;
        }
        const local = (f - fFin) / CLIP_FPS;
        g.drawImage(endFrame, 0, 0);
        g.fillStyle = `rgba(26,18,56,${Math.min(0.82, 0.3 + local * 1.2)})`;
        g.fillRect(0, 0, CLIP_W, CLIP_H);
        const p = inp.result.player;
        const pop = Math.min(1, local * 4);
        bigText(g, ordinalText(p.place), CLIP_W / 2, 470, 150 + 40 * (1 - pop), p.place <= 3 ? '#ffd27a' : '#fff3dc');
        bigText(g, fmtRaceTime(p.time), CLIP_W / 2, 580, 78, '#fff3dc');
        bigText(g, inp.trackName, CLIP_W / 2, 660, 44, accent);
        bigText(g, 'BEAT MY CAT', CLIP_W / 2, 840, 92, '#ff3ea5');
        pill(g, inp.linkLabel, CLIP_W / 2, 900, 36, '#fff3dc', '#1a1238', 'center');
        pill(g, 'FORMULA MEOW', CLIP_W / 2, 1120, 30, accent, '#1a1238', 'center');
      }
      await enc.addFrame(comp, f);
      onProgress((f + 1) / total);
      if (f % 3 === 2) await tick();
    }
    return await enc.finish();
  } catch {
    await enc.cancel().catch(() => undefined);
    return null;
  } finally {
    view.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
