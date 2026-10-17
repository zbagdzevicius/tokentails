/**
 * Wednesday mirror and Thursday webcam (GDD 3.5): a second, shorter silvery cone from the mirror while the human is
 * BUSY (only when the routine has `mirror` and the shell a mirror), and the webcam's view as a faint blue wedge with
 * a blinking REC dot (routine `onCamera` + shell webcam). The cells come from the sim's helpers
 * (`mirrorConeCells`, `webcamCells`, W1-SIM) when it exports them, else from the render-only `coneFrom`
 * (MIRROR_RANGE cells, the same 70° shape). Render only: reads SimState, never writes it.
 */
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type Texture } from 'three';
import * as simApi from '../../sim';
import { HumanSt, MIRROR_RANGE, type PlayableRoom, type SimState } from '../../types';
import { coneFrom, VisionCone } from '../vision-cone';
import { cellX, cellZ, levelY } from '../space';

type CellsFn = (s: SimState, play?: PlayableRoom) => ArrayLike<number> | null | undefined;
const SIM = simApi as unknown as Record<string, unknown>;

function simCells(name: string, s: SimState, play: PlayableRoom): ArrayLike<number> | null {
  const f = SIM[name];
  if (typeof f !== 'function') return null;
  try {
    const out = (f as CellsFn)(s, play);
    if (out && typeof (out as ArrayLike<number>).length === 'number') return out as ArrayLike<number>;
  } catch {
    /* signature mismatch: fall back */
  }
  return null;
}

/** Mirror cone cells now (empty unless the mirror is active: routine.mirror, shell.mirror, human 0 BUSY). */
export function mirrorCells(s: SimState, play: PlayableRoom): ArrayLike<number> {
  const m = play.shell.mirror;
  if (!m || !play.routine.mirror) return [];
  if (s.humans[0]?.state !== HumanSt.BUSY) return [];
  return simCells('mirrorConeCells', s, play) ?? coneFrom(s, m.x, m.z, m.facing, MIRROR_RANGE);
}

/** Webcam view cells (static while the room has one; Thursday). */
export function webcamCells(s: SimState, play: PlayableRoom): ArrayLike<number> {
  const c = play.shell.webcam;
  if (!c || !play.routine.onCamera) return [];
  return simCells('webcamCells', s, play) ?? coneFrom(s, c.x, c.z, c.facing, MIRROR_RANGE);
}

function recTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 48;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = 'rgba(43,29,46,0.75)';
    g.beginPath();
    g.roundRect?.(2, 2, 124, 44, 14);
    if (!g.roundRect) g.rect(2, 2, 124, 44);
    g.fill();
    g.fillStyle = '#ff3b3b';
    g.beginPath();
    g.arc(26, 24, 11, 0, Math.PI * 2);
    g.fill();
    g.font = '900 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textBaseline = 'middle';
    g.fillStyle = '#fffaf2';
    g.fillText('REC', 46, 25);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}

/** Mirror + webcam cones and the REC dot for one room. */
export class ExtraCones {
  readonly mirror: VisionCone;
  readonly cam: VisionCone;
  readonly rec: Sprite;
  private recMat: SpriteMaterial;
  private recTex: Texture | null = null;

  constructor(
    private readonly play: PlayableRoom,
    maxCells: number,
  ) {
    this.mirror = new VisionCone(maxCells, 'mirror');
    this.cam = new VisionCone(maxCells, 'cam');
    this.recMat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.rec = new Sprite(this.recMat);
    this.rec.name = 'webcam-rec';
    this.rec.renderOrder = 10;
    this.rec.visible = false;
    this.rec.center.set(0.5, 0);
  }

  get objects(): (VisionCone['mesh'] | Sprite)[] {
    return [this.mirror.mesh, this.cam.mesh, this.rec];
  }

  /** Bind the REC texture (briefing warm-up). */
  prewarm(): Texture | null {
    if (!this.recTex && this.play.shell.webcam && this.play.routine.onCamera) {
      this.recTex = recTexture();
      this.recMat.map = this.recTex;
      this.recMat.needsUpdate = true;
    }
    return this.recTex;
  }

  update(s: SimState, T: number, dtTicks: number, live: boolean): void {
    const play = this.play;
    const W = s.grid.w;
    const D = s.grid.d;
    const m = play.shell.mirror;
    const mc = mirrorCells(s, play);
    this.mirror.updateCells(s, mc, !!m && mc.length > 0, T, dtTicks, m ?? { x: 0, z: 0 });
    const c = play.shell.webcam;
    const on = !!c && !!play.routine.onCamera;
    const cc = on ? webcamCells(s, play) : [];
    this.cam.updateCells(s, cc, on && cc.length > 0, T, dtTicks, c ?? { x: 0, z: 0 });
    this.prewarm();
    // the REC dot blinks at 1 Hz above the webcam (always, the clip too: it is diegetic)
    this.rec.visible = on && !!this.recTex && Math.floor(T / 15) % 2 === 0;
    if (on && c) {
      const lv = s.grid.level[c.z * W + c.x] ?? 0;
      this.rec.position.copy(new Vector3(cellX(c.x, W), levelY(lv) + 0.42, cellZ(c.z, D)));
      this.rec.scale.set(0.07, 0.026, 1);
    }
    void live;
  }

  reset(): void {
    this.mirror.reset();
    this.cam.reset();
  }

  dispose(): void {
    this.mirror.dispose();
    this.cam.dispose();
    this.recTex?.dispose();
    this.recMat.dispose();
  }
}
