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

function nameTag(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = "900 34px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const w = Math.min(248, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(26,18,56,0.78)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 6, w, 52, 26);
  g.fill();
  g.fillStyle = '#2cf6f3';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(3.2, 0.8, 1);
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
    if (this.view) {
      this.shell.stage.scene.remove(this.view.root);
      this.view.dispose();
    }
    if (this.tag) {
      this.shell.stage.scene.remove(this.tag);
      this.tag.material.map?.dispose();
      this.tag.material.dispose();
    }
    this.view = null;
    this.tag = null;
    this.world = null;
    this.live = false;
    this.frozen = false;
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
      racers: buildField({ seed: g.seed, cls: g.cls, playerSlot: slot, playerName: d.name, playerCat: cat }),
      humans: [slot],
      forgiving: g.forgiving,
    };
    this.world = new SimWorld(cfg, createSimPlugins(), main.track);
    this.view = new KartView({ name: d.name, cat, kart: kartLookFor(1) });
    this.view.setGhost(0.42);
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

  private stepOnce(): void {
    const w = this.world!;
    const v = this.dare!.ghost.inputs[w.tick];
    this.buf[0] = unpackInput(v === undefined ? 0x17 : v);
    w.step(this.buf);
    this.capture();
  }

  onFrame(info: FrameInfo): void {
    const w = this.world;
    const v = this.view;
    if (!w || !v || !this.tag || this.frozen) return;
    let guard = 0;
    while (w.tick < info.st.tick && !w.done && guard++ < 600) this.stepOnce();
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
    v.root.visible = !hidden;
    this.tag.visible = !hidden;
    v.update(k, x, y, z, heading, k.air ? 0 : pitch, k.air ? 0 : roll, Math.hypot(k.vx, k.vz), info.paused ? 0 : info.dt, classTuning(w.cfg.cls).topSpeed);
    this.tag.position.set(x, y + 3.1, z);
  }

  /** Recomputed finish time of the ghost (seconds since GO), running the shadow race forward if needed. */
  finishTime(): number | null {
    const w = this.world;
    if (!w) return null;
    const k = w.st.karts[w.cfg.humans[0]];
    let guard = 0;
    while (!k.finished && !w.done && guard++ < 60 * 400) this.stepOnce();
    // the ghost jumped ahead of the race clock: hide it behind the results
    this.frozen = true;
    if (this.view) this.view.root.visible = false;
    if (this.tag) this.tag.visible = false;
    return k.finished ? k.finishTime / 60 : null;
  }
}
