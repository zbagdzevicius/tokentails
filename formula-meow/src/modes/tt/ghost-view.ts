/**
 * Time-trial ghost on screen (render only, a JuiceBus listener): the armed ghost's inputs re-simulated in a shadow
 * SimWorld in lockstep with the player's run, drawn as a translucent kart with a name tag. Like the dare ghost
 * (share/links/ghost-runner.ts), it fades within 4 m of the camera and its tag hides within 6 m (B51).
 */
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import { unpackInput, type RaceConfig, type TickInput } from '../../types';
import { classTuning } from '../../tuning';
import { SimWorld } from '../../core/sim/world';
import { KartView } from '../../core/render/kart-view';
import { createSimPlugins } from '../../items-ai';
import type { FrameInfo, JuiceListener } from '../../juice/bus';
import type { Shell } from '../../core/app/shell';
import { pillPath } from '../../share/links/ghost-runner';
import type { GhostRun } from './ghosts';

export interface ArmedGhost {
  cfg: RaceConfig;
  run: GhostRun;
  /** the short name on the tag ("Dev ghost", "Your best") */
  name: string;
}

const TAG_PX = 24;

function nameTag(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = "900 30px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const w = Math.min(312, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(26,18,56,0.78)';
  pillPath(g, (320 - w) / 2, 8, w, 48);
  g.fill();
  g.fillStyle = '#ffd27a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 160, 33);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.renderOrder = 10;
  return s;
}

export class TtGhostView implements JuiceListener {
  private armed: ArmedGhost | null = null;
  private world: SimWorld | null = null;
  private view: KartView | null = null;
  private tag: Sprite | null = null;
  private readonly buf: TickInput[] = [];
  private prev = { x: 0, y: 0, z: 0, heading: 0 };
  private cur = { x: 0, y: 0, z: 0, heading: 0 };
  private alpha = 0.45;

  constructor(private readonly shell: Shell) {}

  /** Set (or clear) the ghost for the next time-trial start. */
  arm(g: ArmedGhost | null): void {
    this.armed = g;
    if (!g) this.clear();
  }

  get live(): boolean {
    return !!this.world;
  }

  /** the armed ghost's name (tests, HUD) */
  get label(): string | null {
    return this.armed?.name ?? null;
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
  }

  onReset(): void {
    this.clear();
    const g = this.armed;
    const main = this.shell.world;
    if (!g || !main || main.cfg.mode !== 'tt' || main.cfg.track.id !== g.cfg.track.id || main.cfg.modifiers !== g.cfg.modifiers) return;
    this.world = new SimWorld(g.cfg, createSimPlugins(g.cfg), main.track);
    const r = g.cfg.racers[0];
    this.view = new KartView({ ...r, name: g.name });
    this.alpha = 0.45;
    this.view.setGhost(this.alpha);
    this.shell.stage.scene.add(this.view.root);
    this.tag = nameTag(`👻 ${g.name}`);
    this.shell.stage.scene.add(this.tag);
    this.capture();
    this.capture();
  }

  private capture(): void {
    const k = this.world!.st.karts[0];
    const t = this.prev;
    this.prev = this.cur;
    this.cur = t;
    t.x = k.x;
    t.y = k.y;
    t.z = k.z;
    t.heading = k.heading;
  }

  onFrame(info: FrameInfo): void {
    const w = this.world;
    const v = this.view;
    const g = this.armed;
    if (!w || !v || !this.tag || !g) return;
    const ins = g.run.inputs;
    let guard = 0;
    while (w.tick < info.st.tick && !w.done && w.tick < ins.length && guard++ < 60) {
      this.buf[0] = unpackInput(ins[w.tick]);
      w.step(this.buf);
      this.capture();
    }
    const k = w.st.karts[0];
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
    // a finished ghost parks out of the way: it fades away after the line
    const gone = k.respawnTicks > 0 || (k.finished && w.tick - (k.finishTime + w.ctx.goTick) > 90);
    const cam = this.shell.camera.cam;
    const cd = Math.sqrt((cam.position.x - x) ** 2 + (cam.position.y - y) ** 2 + (cam.position.z - z) ** 2);
    const alpha = cd < 4 ? 0.15 : 0.45;
    if (alpha !== this.alpha) {
      this.alpha = alpha;
      v.setGhost(alpha);
    }
    v.root.visible = !gone;
    this.tag.visible = !gone && cd > 6 && !info.paused;
    v.update(k, x, y, z, heading, k.air ? 0 : pitch, k.air ? 0 : roll, Math.hypot(k.vx, k.vz), info.paused ? 0 : info.dt, classTuning(w.cfg.cls).topSpeed);
    this.tag.position.set(x, y + 3.1, z);
    const hpx = this.shell.host.clientHeight || 800;
    const sy = (2 * TAG_PX) / (hpx * cam.projectionMatrix.elements[5]);
    this.tag.scale.set(sy * 5, sy, 1);
  }
}
