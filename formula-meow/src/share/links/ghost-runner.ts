/**
 * Dare ghost (GDD 8.2): the challenger's race re-simulated in a shadow world in lockstep with the player's race.
 * Only the challenger's kart is drawn, translucent, in their cat's coat, with a name tag. The shadow world has the
 * same track, seed, class and modifiers, so the AI and item rolls start out the same as in the player's race.
 *
 * It is a JuiceBus listener (read-only on the player's race): `onFrame` steps the shadow world up to the race tick and
 * poses the ghost kart before the shell renders. `finishTime()` runs the shadow race to the challenger's finish and
 * returns the recomputed time (a ghost never carries a time of its own).
 */
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import { DEFAULT_CAT, SIM_VERSION, unpackInput, type CatSpec, type RaceConfig, type TickInput } from '../../types';
import { classTuning } from '../../tuning';
import { SimWorld } from '../../core/sim/world';
import { KartView } from '../../core/render/kart-view';
import { buildField, createSimPlugins, kartLookFor } from '../../items-ai';
import type { FrameInfo, JuiceListener } from '../../juice/bus';
import type { Shell } from '../../core/app/shell';
import { trackKey, type Ghost } from '../codec/ghost-codec';
import { ghostAnchor, kartStuntPose, type GhostAnchor, type StuntPose } from '../../core/render/stunt-pose';

const GHOST_POSE: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
const ANCHOR: GhostAnchor = { at: { x: 0, y: 0, z: 0 }, tag: { x: 0, y: 0, z: 0 } };

export interface DareGhost {
  ghost: Ghost;
  name: string;
  cat: CatSpec | null;
}

interface Snap {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/** Rounded pill path; `roundRect` is missing on iOS Safari < 16 (B52: it threw and aborted the race start). */
export function pillPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = h / 2;
  g.beginPath();
  if (typeof g.roundRect === 'function') {
    g.roundRect(x, y, w, h, r);
    return;
  }
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
  g.closePath();
}

/** Label height on screen, CSS px (B51: a fixed screen-space tag, never huge up close). */
const TAG_PX = 26;

function nameTag(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = "900 34px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const w = Math.min(248, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(26,18,56,0.78)';
  pillPath(g, (256 - w) / 2, 6, w, 52);
  g.fill();
  g.fillStyle = '#2cf6f3';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.scale.set(0.2, 0.05, 1);
  s.renderOrder = 10;
  return s;
}

export class GhostRunner implements JuiceListener {
  private dare: DareGhost | null = null;
  private world: SimWorld | null = null;
  private view: KartView | null = null;
  private tag: Sprite | null = null;
  private prev: Snap = { x: 0, y: 0, z: 0, heading: 0 };
  private cur: Snap = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly buf: TickInput[] = [];
  /** true while the current race is the dare's race */
  live = false;
  private frozen = false;
  /** the ghost's current fade (B51) */
  private ghostAlpha = 0.42;
  /** B50: the recomputed finish time, once the shadow race got there (undefined = still running) */
  private result: number | null | undefined = undefined;
  private waiting: Array<(t: number | null) => void> = [];

  constructor(private readonly shell: Shell) {}

  set(d: DareGhost | null): void {
    this.dare = d;
  }

  get current(): DareGhost | null {
    return this.dare;
  }

  /** Does the current shell race match the dare (same track, seed, class, modifiers, sim)? */
  matches(): boolean {
    const d = this.dare;
    const s = this.shell.setup;
    if (!d || !s) return false;
    const g = d.ghost;
    return g.simVersion === SIM_VERSION && trackKey(s.track.id) === g.trackKey && s.seed === g.seed && s.cls === g.cls && s.modifiers === g.modifiers;
  }

  private clear(): void {
    // out of the scene now; the GPU side is freed later by the shell (B61: never under a program still linking)
    const view = this.view;
    const tag = this.tag;
    if (view) this.shell.stage.scene.remove(view.root);
    if (tag) this.shell.stage.scene.remove(tag);
    if (view || tag)
      this.shell.retire(() => {
        view?.dispose();
        tag?.material.map?.dispose();
        tag?.material.dispose();
      });
    this.view = null;
    this.tag = null;
    this.world = null;
    this.live = false;
    this.frozen = false;
    this.result = undefined;
    for (const fn of this.waiting) fn(null);
    this.waiting = [];
  }

  onReset(): void {
    this.clear();
    if (!this.matches() || !this.shell.world) return;
    const d = this.dare!;
    const g = d.ghost;
    const main = this.shell.world;
    const slot = g.slot;
    const cat = d.cat ?? DEFAULT_CAT;
    const cfg: RaceConfig = {
      track: main.cfg.track,
      seed: g.seed,
      cls: g.cls,
      modifiers: g.modifiers,
      // [integrator] the rival AI drives differently (feel lane): the shadow race marks the same slot
      racers: buildField({ seed: g.seed, cls: g.cls, playerSlot: slot, playerName: d.name, playerCat: cat, playerKart: { ...kartLookFor(0), body: g.body ?? 0 } }).map((r, i) =>
        i === g.rival && i !== slot ? { ...r, rival: true } : r,
      ),
      humans: [slot],
      forgiving: g.forgiving,
      mode: g.mode ?? 'race',
    };
    this.world = new SimWorld(cfg, createSimPlugins(cfg), main.track);
    this.view = new KartView({ name: d.name, cat, kart: { ...kartLookFor(1), body: g.body ?? 0 } });
    this.ghostAlpha = 0.42;
    this.view.setGhost(this.ghostAlpha);
    this.shell.stage.scene.add(this.view.root);
    this.tag = nameTag(`👻 ${d.name}`);
    this.shell.stage.scene.add(this.tag);
    this.capture();
    this.capture();
    this.live = true;
  }

  private capture(): void {
    const w = this.world!;
    const k = w.st.karts[w.cfg.humans[0]];
    const t = this.prev;
    this.prev = this.cur;
    this.cur = t;
    t.x = k.x;
    t.y = k.y;
    t.z = k.z;
    t.heading = k.heading;
  }

  /** One shadow tick. False once the ghost's recorded inputs ran out (it never finished: a ghost DNF). */
  private stepOnce(): boolean {
    const w = this.world!;
    const ins = this.dare!.ghost.inputs;
    if (w.tick >= ins.length) return false;
    this.buf[0] = unpackInput(ins[w.tick]);
    w.step(this.buf);
    this.capture();
    return true;
  }

  /** The shadow kart finished, ran out of inputs, or its race ended: settle the result. */
  private settle(): void {
    const w = this.world;
    if (!w || this.result !== undefined) return;
    const k = w.st.karts[w.cfg.humans[0]];
    if (k.finished) this.result = k.finishTime / 60;
    else if (w.done || w.tick >= this.dare!.ghost.inputs.length) this.result = null;
    else return;
    for (const fn of this.waiting) fn(this.result);
    this.waiting = [];
  }

  onFrame(info: FrameInfo): void {
    const w = this.world;
    const v = this.view;
    if (!w || !v || !this.tag) return;
    if (this.frozen) {
      // B50: after the results the shadow race runs on in chunks of 300 ticks a frame until the ghost finishes
      for (let n = 0; n < 300 && this.result === undefined; n++) {
        if (!this.stepOnce()) break;
        if (w.st.karts[w.cfg.humans[0]].finished || w.done) break;
      }
      this.settle();
      return;
    }
    // lockstep with the race (a long hitch catches up over a few frames, never 600 steps in one)
    let guard = 0;
    while (w.tick < info.st.tick && !w.done && guard++ < 60 && this.stepOnce());
    this.settle();
    const me = w.cfg.humans[0];
    const k = w.st.karts[me];
    const a = this.prev;
    const b = this.cur;
    const al = info.alpha;
    let dh = b.heading - a.heading;
    if (dh > Math.PI) dh -= Math.PI * 2;
    else if (dh < -Math.PI) dh += Math.PI * 2;
    const x = a.x + (b.x - a.x) * al;
    const y = a.y + (b.y - a.y) * al;
    const z = a.z + (b.z - a.z) * al;
    const heading = a.heading + dh * al;
    const t = w.track;
    const si = k.si;
    const j = (si + 4) % t.n;
    const fwd = Math.cos(heading) * t.tz[si] + Math.sin(heading) * t.tx[si];
    const pitch = -Math.atan2(t.py[j] - t.py[si], 4 * t.step) * Math.sign(fwd || 1);
    const roll = -Math.atan(t.bank[si]) * Math.sign(fwd || 1);
    const hidden = k.respawnTicks > 0;
    // B51: the ghost fades to 15 % within 4 m of the camera (it starts in the player's slot, on top of the kart),
    // and its tag hides within 6 m
    const cam = this.shell.camera.cam;
    // SIM_VERSION 8: a ghost on a loop's rail or a wall lane is drawn on the bent surface (at its tick pose); the fade
    // distance and the tag follow the drawn kart, not the flat shadow point under it
    const bent = kartStuntPose(t, k, GHOST_POSE);
    const an = ghostAnchor(x, y, z, bent, 3.1, ANCHOR);
    const cd = Math.sqrt((cam.position.x - an.at.x) ** 2 + (cam.position.y - an.at.y) ** 2 + (cam.position.z - an.at.z) ** 2);
    const alpha = cd < 4 ? 0.15 : 0.42;
    if (alpha !== this.ghostAlpha) {
      this.ghostAlpha = alpha;
      v.setGhost(alpha);
    }
    v.root.visible = !hidden;
    this.tag.visible = !hidden && cd > 6;
    if (bent) v.update(k, bent.x, bent.y, bent.z, heading, 0, 0, Math.hypot(k.vx, k.vz), info.paused ? 0 : info.dt, classTuning(w.cfg.cls).topSpeed, bent);
    else v.update(k, x, y, z, heading, k.air ? 0 : pitch, k.air ? 0 : roll, Math.hypot(k.vx, k.vz), info.paused ? 0 : info.dt, classTuning(w.cfg.cls).topSpeed);
    this.tag.position.set(an.tag.x, an.tag.y, an.tag.z);
    // constant screen size: with sizeAttenuation off the scale is in view units (height ∝ 1 / projection[1][1])
    const hpx = this.shell.host.clientHeight || 800;
    const sy = (2 * TAG_PX) / (hpx * cam.projectionMatrix.elements[5]);
    this.tag.scale.set(sy * 4, sy, 1);
  }

  /** The recomputed finish time if the shadow race got there already (undefined while it still runs). */
  get finishNow(): number | null | undefined {
    return this.result;
  }

  /**
   * Recomputed finish time of the ghost (seconds since GO, null = it never finished). B50: never computed in one go
   * on the results frame; the shadow race runs on in chunks of 300 ticks a frame and this resolves when it is done.
   */
  finishTime(): Promise<number | null> {
    const w = this.world;
    if (!w) return Promise.resolve(null);
    // the ghost runs ahead of the race clock from here: hide it behind the results
    this.frozen = true;
    if (this.view) this.view.root.visible = false;
    if (this.tag) this.tag.visible = false;
    this.settle();
    if (this.result !== undefined) return Promise.resolve(this.result);
    return new Promise((resolve) => this.waiting.push(resolve));
  }
}
