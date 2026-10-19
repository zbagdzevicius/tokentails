/**
 * Showroom (lazy chunk): a small studio drawn on the shell's renderer while no race runs (`shell.leaveRace()`).
 *
 * - Turntable: the player's kart and cat on a slowly turning platform, behind the racer, class and track pickers.
 *   The menu panel covers the bottom of a portrait screen (the right half in landscape), so the camera frames the
 *   kart in the space that is left.
 * - Podium: the top three of a cup on plinths 1.8 / 1.2 / 0.9 m, a trophy (gold, silver or bronze, about 40
 *   triangles) turning over the winner, paw confetti, the winner bouncing, a slow orbit.
 *
 * Render only. One scene, reused; kart views are rebuilt when the look changes and disposed when replaced.
 */
import {
  BufferAttribute,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  BackSide,
  type Material,
} from 'three';
import type { KartState, RacerInfo } from '../../types';
import type { Shell } from '../../core/app/shell';
import { KartView } from '../../core/render/kart-view';
import { toonMaterial } from '../../core/render/toon';
import { newKart } from '../../core/sim/kart';
import { Confetti } from '../../juice/vfx/confetti';
import { reducedMotion } from '../../ui/a11y';
import type { Showroom } from '../flow';

const TROPHY_COLOURS = [0xffd27a, 0xffc93c, 0xd8dce6, 0xd9925a];
const PLINTH_H = [1.8, 1.2, 0.9];
const PLINTH_X = [0, -2.7, 2.7];

function lookKey(r: RacerInfo): string {
  return JSON.stringify([r.cat, r.kart, r.hat ?? 0]);
}

function numberTexture(n: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a1a22';
  g.font = "900 96px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A small cup: lathe bowl, stem and base (6 segments, about 40 triangles) plus two ring handles. */
function trophyMesh(colour: number): Group {
  const g = new Group();
  const mat = toonMaterial({ color: colour, emissive: new Color(colour).multiplyScalar(0.25) });
  const prof = [new Vector2(0.06, 0), new Vector2(0.3, 0.02), new Vector2(0.08, 0.12), new Vector2(0.06, 0.42), new Vector2(0.38, 0.62), new Vector2(0.42, 0.98)];
  const cup = new Mesh(new LatheGeometry(prof, 6), mat);
  g.add(cup);
  for (const s of [-1, 1]) {
    const h = new Mesh(new TorusGeometry(0.14, 0.035, 4, 6), mat);
    h.position.set(s * 0.42, 0.72, 0);
    g.add(h);
  }
  g.userData.mat = mat;
  return g;
}

class ShowroomImpl implements Showroom {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(38, 1, 0.1, 200);
  private readonly stage = new Group();
  private readonly platform: Mesh;
  private readonly podiumGroup = new Group();
  private karts: KartView[] = [];
  private keys: string[] = [];
  private trophy: Group | null = null;
  private confetti: Confetti;
  private readonly fake: KartState = newKart();
  private raf = 0;
  private last = 0;
  private time = 0;
  private kind: 'turntable' | 'podium' = 'turntable';
  /** plinth (0 = 1st) the trophy hovers over */
  private trophyAt = 0;
  private spin = 0.6;
  active = false;

  constructor(private readonly shell: Shell) {
    this.scene.background = new Color(0x1a1238);
    // a soft studio backdrop: a big inside-out sphere with a vertical gradient
    const skyGeo = new SphereGeometry(80, 16, 10);
    const pos = skyGeo.getAttribute('position');
    const colours = new Float32Array(pos.count * 3);
    const top = new Color(0x2a1858);
    const mid = new Color(0x6a2a7a);
    const low = new Color(0xff7ab8);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 80;
      if (y > 0.1) c.copy(mid).lerp(top, Math.min(1, (y - 0.1) / 0.6));
      else c.copy(mid).lerp(low, Math.min(1, (0.1 - y) / 0.35));
      colours.set([c.r, c.g, c.b], i * 3);
    }
    skyGeo.setAttribute('color', new BufferAttribute(colours, 3));
    this.scene.add(new Mesh(skyGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false })));
    this.scene.add(new HemisphereLight(0xfff3dc, 0x6a2a7a, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 8);
    this.scene.add(sun);
    // turntable platform: a cream disc with an ink rim and a pink ring
    this.platform = new Mesh(new CylinderGeometry(3.1, 3.3, 0.5, 40), toonMaterial({ color: 0xfff3dc }));
    this.platform.position.y = -0.25;
    const rim = new Mesh(new TorusGeometry(3.12, 0.08, 6, 48), toonMaterial({ color: 0xff3ea5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.01;
    this.platform.add(rim);
    this.stage.add(this.platform);
    const floor = new Mesh(new CylinderGeometry(30, 30, 0.2, 48), toonMaterial({ color: 0x3a2068 }));
    floor.position.y = -0.6;
    this.scene.add(floor);
    this.scene.add(this.stage);
    // podium plinths with their numbers
    PLINTH_H.forEach((h, i) => {
      const plinth = new Mesh(new BoxGeometry(2.4, h, 2.2), toonMaterial({ color: [0xffd27a, 0xfff3dc, 0xff9f7a][i] }));
      plinth.position.set(PLINTH_X[i], h / 2 - 0.5, 0);
      const num = new Mesh(new PlaneGeometry(0.8, 0.8), new MeshBasicMaterial({ map: numberTexture(i + 1), transparent: true }));
      num.position.set(0, 0, 1.11);
      num.position.y = Math.min(0.1, h / 2 - 0.45);
      plinth.add(num);
      this.podiumGroup.add(plinth);
    });
    this.scene.add(this.podiumGroup);
    this.scene.add(this.camera);
    this.confetti = new Confetti(this.camera);
  }

  private clearKarts(): void {
    for (const k of this.karts) {
      k.root.removeFromParent();
      k.dispose();
    }
    this.karts = [];
    this.keys = [];
  }

  private setKarts(racers: RacerInfo[]): void {
    const keys = racers.map(lookKey);
    if (keys.length === this.keys.length && keys.every((k, i) => k === this.keys[i])) return;
    this.clearKarts();
    for (const r of racers) {
      const v = new KartView(r);
      this.scene.add(v.root);
      this.karts.push(v);
    }
    this.keys = keys;
  }

  turntable(look: RacerInfo): void {
    this.kind = 'turntable';
    this.setKarts([look]);
    this.stage.visible = true;
    this.podiumGroup.visible = false;
    this.setTrophy(0);
    this.confetti.clear();
    this.show();
  }

  podium(top3: RacerInfo[], trophy: number): void {
    this.kind = 'podium';
    this.setKarts(top3.slice(0, 3));
    this.stage.visible = false;
    this.podiumGroup.visible = true;
    // the player's trophy over the player's plinth; without one, the gold cup over the winner
    this.trophyAt = trophy ? trophy - 1 : 0;
    this.setTrophy(trophy || 1);
    this.time = 0;
    this.show();
    if (!reducedMotion()) setTimeout(() => this.active && this.kind === 'podium' && this.confetti.fire(true, 0.8), 350);
  }

  private setTrophy(t: number): void {
    if (this.trophy) {
      this.trophy.removeFromParent();
      this.trophy.traverse((o) => (o as Mesh).geometry?.dispose());
      (this.trophy.userData.mat as Material | undefined)?.dispose();
      this.trophy = null;
    }
    if (!t) return;
    this.trophy = trophyMesh(TROPHY_COLOURS[t] ?? TROPHY_COLOURS[1]);
    this.trophy.scale.setScalar(1.3);
    this.scene.add(this.trophy);
  }

  private show(): void {
    if (this.shell.world) this.shell.leaveRace();
    if (this.active) return;
    this.active = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // a race started under us (deep link, a menu tile): the race owns the canvas
      if (this.shell.world) {
        this.hide();
        return;
      }
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  hide(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.confetti.clear();
  }

  private frame(dt: number): void {
    this.time += dt;
    const host = this.shell.host;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    const aspect = w / h;
    const portrait = aspect < 1;
    const fov = portrait ? 50 : 38;
    if (this.camera.aspect !== aspect || this.camera.fov !== fov) {
      this.camera.aspect = aspect;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const calm = reducedMotion();
    const f = this.fake;
    if (this.kind === 'turntable') {
      const v = this.karts[0];
      this.spin += dt * (calm ? 0.15 : 0.45);
      if (v) {
        f.steer = Math.sin(this.time * 0.8) * 0.4;
        v.update(f, 0, 0, 0, this.spin, 0, 0, 0, dt, 26);
      }
      // frame the kart in the free part of the screen (above the bottom sheet, or left of the side panel)
      const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
      const dist = portrait ? Math.max(6.5, 1.9 / (tanH * Math.max(0.3, aspect))) : 7.2;
      const lift = portrait ? dist * tanH * 0.5 : 0;
      const side = portrait ? 0 : dist * tanH * aspect * 0.42;
      this.camera.position.set(side, 2.4, dist);
      this.camera.lookAt(side, 0.8 - lift, 0);
    } else {
      const order = [0, 1, 2];
      for (const i of order) {
        const v = this.karts[i];
        if (!v) continue;
        const hop = i === 0 && !calm ? Math.abs(Math.sin(this.time * 3.2)) * 0.35 : 0;
        f.steer = 0;
        v.update(f, PLINTH_X[i], PLINTH_H[i] - 0.5 + hop, 0, Math.PI * 0.08 * (i === 1 ? 1 : i === 2 ? -1 : 0), 0, 0, 0, dt, 26);
      }
      if (this.trophy) {
        const at = this.trophyAt;
        this.trophy.position.set(PLINTH_X[at], PLINTH_H[at] + 2.1 + Math.sin(this.time * 2) * 0.1, 0);
        this.trophy.rotation.y = this.time * 1.4;
      }
      // the panel covers the bottom (portrait) or the right (landscape): frame the plinths in what is left
      const ang = calm ? 0 : Math.sin(this.time * 0.25) * 0.3;
      const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
      // portrait: the three plinths (8 m across) fill the width
      const dist = portrait ? Math.max(12, 4.3 / (tanH * Math.max(0.3, aspect))) : 12.5;
      const lift = portrait ? dist * tanH * 0.42 : 0;
      const side = portrait ? 0 : dist * tanH * aspect * 0.36;
      const cx = Math.cos(ang) * side;
      const cz = -Math.sin(ang) * side;
      this.camera.position.set(cx + Math.sin(ang) * dist, 3.4, cz + Math.cos(ang) * dist);
      this.camera.lookAt(cx, 2.1 - lift, cz);
      this.confetti.update(dt);
    }
    this.shell.stage.renderer.render(this.scene, this.camera);
  }
}

export function createShowroom(shell: Shell): Showroom {
  return new ShowroomImpl(shell);
}
