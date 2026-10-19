/**
 * Item views (items-ai lane, GDD 4, 11): procedural low-poly meshes for everything the item system puts on the
 * track, read from `RaceState.items` every frame through the juice bus (read-only, never writes the sim):
 * hairballs, homing yarn balls, the Laser Dot (dot + light pillar), yarn tangles, cucumbers (lob arc), the yarn
 * trailing behind a kart that holds one, the Cardboard Box shield, the Zoomies aura and the Bell ring. The player
 * also gets a "LASER DOT INCOMING" banner while the dot is about to reach them.
 */
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  type Material,
  type BufferGeometry,
  type Object3D,
  type Scene,
} from 'three';
import type { RaceEvent } from '../../types';
import type { FrameInfo, JuiceListener } from '../../juice/bus';
import { toonMaterial } from '../../core/render/toon';
import { ProjKind, TrapKind, itemsOf } from '../items/state';
import { ITEMS } from '../../tuning';
// LUT trig even in render code: items-ai/** is linted with the sim rules (core/sim/fixed.test.ts)
import { atan2L, cosL, sinL } from '../../core/sim/fixed';

/** What the view needs from the shell: the scene, and the interpolated kart transform. */
export interface ItemViewHost {
  scene: Scene;
  kartAt(i: number, alpha: number): { x: number; y: number; z: number; heading: number } | null;
  /** spark burst at a kart (render-only) */
  burst?(kart: number, color: number, n: number, speed?: number): void;
  /** where the laser banner goes */
  overlay: HTMLElement;
  /** the camera position (B60: rings fade as their edge passes the lens) */
  camera?(): { x: number; y: number; z: number };
}

class Pool {
  private items: Object3D[] = [];
  private used = 0;
  constructor(
    private readonly scene: Scene,
    private readonly make: () => Object3D,
  ) {}
  begin(): void {
    this.used = 0;
  }
  next(): Object3D {
    let o = this.items[this.used];
    if (!o) {
      o = this.make();
      this.items.push(o);
      this.scene.add(o);
    }
    o.visible = true;
    this.used++;
    return o;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
  dispose(): void {
    for (const o of this.items) {
      this.scene.remove(o);
      o.traverse((c) => {
        const m = c as Mesh;
        if (m.isMesh) {
          (m.geometry as BufferGeometry).dispose();
          (m.material as Material).dispose();
        }
      });
    }
    this.items = [];
  }
}

const CARDBOARD = 0xc89a5b;
const YARN_PINK = 0xff5fa8;

function yarnBall(r: number): Object3D {
  const g = new Group();
  g.add(new Mesh(new SphereGeometry(r, 10, 8), toonMaterial({ color: YARN_PINK })));
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(new TorusGeometry(r * 1.0, r * 0.12, 4, 14), toonMaterial({ color: 0xffb3d6 }));
    ring.rotation.set(i * 1.1, i * 0.7, 0);
    g.add(ring);
  }
  return g;
}

function hairball(): Object3D {
  const g = new Group();
  g.add(new Mesh(new IcosahedronGeometry(0.48, 0), toonMaterial({ color: 0x8a5a3c })));
  const tuft = new Mesh(new IcosahedronGeometry(0.3, 0), toonMaterial({ color: 0x6b4430 }));
  tuft.position.set(0.25, 0.2, 0);
  g.add(tuft);
  return g;
}

function laserDot(): Object3D {
  const g = new Group();
  const dot = new Mesh(new CircleGeometry(0.55, 16), new MeshBasicMaterial({ color: 0xff1a3a, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending }));
  dot.rotation.x = -Math.PI / 2;
  g.add(dot);
  const glow = new Mesh(new CircleGeometry(1.5, 16), new MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  g.add(glow);
  const beam = new Mesh(new CylinderGeometry(0.12, 0.12, 9, 6, 1, true), new MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  beam.position.y = 4.5;
  g.add(beam);
  return g;
}

function tangle(): Object3D {
  const m = new Mesh(new TorusKnotGeometry(0.55, 0.14, 40, 5, 2, 3), toonMaterial({ color: YARN_PINK }));
  m.scale.set(1.2, 0.45, 1.2);
  const g = new Group();
  g.add(m);
  return g;
}

function cucumber(): Object3D {
  const g = new Group();
  const body = new Mesh(new CapsuleGeometry(0.26, 1.0, 3, 8), toonMaterial({ color: 0x3f9a3a }));
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (let i = -1; i <= 1; i++) {
    const bump = new Mesh(new IcosahedronGeometry(0.07, 0), toonMaterial({ color: 0x8fd16a }));
    bump.position.set(i * 0.35, 0.24, 0.05 * i);
    g.add(bump);
  }
  return g;
}

function boxShield(): Object3D {
  const g = new Group();
  // an open-top box: "if I fits I sits", the cat's head pokes out over the walls
  const mat = toonMaterial({ color: CARDBOARD });
  const dark = toonMaterial({ color: 0x9c7442 });
  const W = 2.1;
  const D = 2.6;
  const Hh = 1.05;
  const t = 0.08;
  for (const s of [-1, 1]) {
    const side = new Mesh(new BoxGeometry(t, Hh, D), mat);
    side.position.set((s * W) / 2, Hh / 2, 0);
    g.add(side);
    const end = new Mesh(new BoxGeometry(W, Hh, t), s > 0 ? mat : dark);
    end.position.set(0, Hh / 2, (s * D) / 2);
    g.add(end);
    // flaps fold open outward on the long sides and the back
    const flap = new Mesh(new BoxGeometry(0.75, t, D * 0.96), mat);
    flap.position.set(s * (W / 2 + 0.3), Hh + 0.2, 0);
    flap.rotation.z = s * -0.65;
    g.add(flap);
  }
  const tape = new Mesh(new BoxGeometry(0.3, 0.02, D + 0.02), toonMaterial({ color: 0xe8d7a8 }));
  tape.position.set(0, 0.04, 0);
  g.add(tape);
  const label = new Mesh(new BoxGeometry(0.9, 0.5, 0.02), toonMaterial({ color: 0xfff3dc }));
  label.position.set(0, Hh * 0.55, -D / 2 - 0.05);
  g.add(label);
  return g;
}

/** Fade an item mesh group (toggles transparency only when the value changes). */
function setSeeThrough(o: Object3D, opacity: number): void {
  if (o.userData.seeThrough === opacity) return;
  o.userData.seeThrough = opacity;
  o.traverse((c) => {
    const m = (c as Mesh).material as MeshBasicMaterial | undefined;
    if (!m || Array.isArray(m)) return;
    const t = opacity < 1;
    if (m.transparent !== t) {
      m.transparent = t;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
    m.depthWrite = !t;
  });
}

function aura(): Object3D {
  return new Mesh(new SphereGeometry(1.9, 14, 10), new MeshBasicMaterial({ color: 0xff3ea5, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, side: BackSide }));
}

function bellRing(): Object3D {
  const m = new Mesh(new RingGeometry(0.85, 1, 40), new MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

const STYLE = `
.fm-laser-warn{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 92px);transform:translateX(-50%);
  padding:8px 16px;border-radius:999px;background:#ff1a3a;color:#fff;font:800 18px/1.1 ui-rounded,system-ui,sans-serif;
  letter-spacing:.04em;box-shadow:0 0 0 3px #fff,0 6px 24px rgba(255,26,58,.6);pointer-events:none;opacity:0;
  transition:opacity .12s;z-index:30;white-space:nowrap}
.fm-laser-warn.on{opacity:1;animation:fm-laser-blink .25s steps(2) infinite}
@keyframes fm-laser-blink{50%{background:#7a0018}}
@media (prefers-reduced-motion: reduce){.fm-laser-warn.on{animation:none}}`;

export class ItemView implements JuiceListener {
  private readonly hair: Pool;
  private readonly balls: Pool;
  private readonly dots: Pool;
  private readonly tangles: Pool;
  private readonly cukes: Pool;
  private readonly trail: Pool;
  private readonly boxes: Pool;
  private readonly auras: Pool;
  private readonly rings: Pool;
  private readonly warn: HTMLDivElement;
  /** every pool, for the per-frame begin / end (B58: no array literal per frame) */
  private readonly pools: Pool[];
  private bells: Array<{ x: number; y: number; z: number; t: number; own: number }> = [];
  private time = 0;
  private readonly col = new Color();

  constructor(private readonly host: ItemViewHost) {
    const s = host.scene;
    this.hair = new Pool(s, hairball);
    this.balls = new Pool(s, () => yarnBall(0.5));
    this.dots = new Pool(s, laserDot);
    this.tangles = new Pool(s, tangle);
    this.cukes = new Pool(s, cucumber);
    this.trail = new Pool(s, () => yarnBall(0.32));
    this.boxes = new Pool(s, boxShield);
    this.auras = new Pool(s, aura);
    this.rings = new Pool(s, bellRing);
    this.pools = [this.hair, this.balls, this.dots, this.tangles, this.cukes, this.trail, this.boxes, this.auras, this.rings];
    if (typeof document !== 'undefined' && !document.getElementById('fm-items-style')) {
      const st = document.createElement('style');
      st.id = 'fm-items-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    this.warn = document.createElement('div');
    this.warn.className = 'fm-laser-warn';
    this.warn.setAttribute('role', 'status');
    this.warn.textContent = '🔴 LASER DOT INCOMING!';
    host.overlay.appendChild(this.warn);
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    if (e.type !== 'itemUse') return;
    const k = info.st.karts[e.kart];
    if (e.item === 'bell') this.bells.push({ x: k.x, y: k.y + 0.3, z: k.z, t: 0, own: e.kart });
    else if (e.item === 'catnip') this.host.burst?.(e.kart, 0x7cff6a, 18, 5);
    else if (e.item === 'zoomies') this.host.burst?.(e.kart, 0xff3ea5, 30, 9);
    else if (e.item === 'box') this.host.burst?.(e.kart, CARDBOARD, 14, 4);
  }

  onReset(): void {
    this.bells = [];
    this.warn.classList.remove('on');
  }

  onFrame(info: FrameInfo): void {
    const dt = info.paused ? 0 : info.dt;
    this.time += dt;
    const tm = this.time;
    const s = itemsOf(info.st);
    for (const p of this.pools) p.begin();

    for (const p of s.proj) {
      if (p.kind === ProjKind.Hairball) {
        const o = this.hair.next();
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(tm * 14, atan2L(p.vx, p.vz), 0);
      } else if (p.kind === ProjKind.YarnBall) {
        const o = this.balls.next();
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(tm * 12, tm * 3, 0);
      } else {
        const o = this.dots.next();
        o.position.set(p.x, p.y + 0.05, p.z);
        const pulse = 1 + 0.15 * sinL(tm * 30);
        o.scale.set(pulse, 1, pulse);
      }
    }

    for (const t of s.traps) {
      if (t.kind === TrapKind.Yarn) {
        const o = this.tangles.next();
        o.position.set(t.x, t.y + 0.22, t.z);
        o.rotation.y = t.id * 1.7;
      } else {
        const o = this.cukes.next();
        if (t.flight > 0) {
          const u = 1 - t.flight / t.flightMax;
          o.position.set(t.fx + (t.x - t.fx) * u, t.fy + (t.y + 0.3 - t.fy) * u + 4 * u * (1 - u) * 2, t.fz + (t.z - t.fz) * u);
          o.rotation.set(tm * 9, t.id, tm * 7);
        } else {
          o.position.set(t.x, t.y + 0.27, t.z);
          o.rotation.set(0, t.id * 2.3, 0);
        }
      }
    }

    // per-kart item looks: trailing yarn, box shield, zoomies aura
    for (let i = 0; i < info.st.karts.length; i++) {
      const k = info.st.karts[i];
      if (k.respawnTicks > 0) continue;
      const needTrail = k.item === 'yarn' && k.rouletteTicks === 0;
      if (!needTrail && k.shieldTicks <= 0 && k.autoTicks <= 0) continue;
      const at = this.host.kartAt(i, info.alpha);
      if (!at) continue;
      const fx = sinL(at.heading);
      const fz = cosL(at.heading);
      if (needTrail) {
        const o = this.trail.next();
        const sway = sinL(tm * 6 + i) * 0.35;
        o.position.set(at.x - fx * 2.0 + fz * sway, at.y + 0.35, at.z - fz * 2.0 - fx * sway);
        o.rotation.set(tm * 5, 0, 0);
      }
      if (k.shieldTicks > 0) {
        const o = this.boxes.next();
        // the box wobbles and flashes in its last half second
        const ending = k.shieldTicks < 30 && Math.floor(tm * 16) % 2 === 0;
        o.visible = !ending;
        // B60: the player's own box is see-through, so it never fills the screen in front of the chase camera
        setSeeThrough(o, i === info.me ? 0.45 : 1);
        o.position.set(at.x, at.y + 0.05, at.z);
        o.rotation.set(0, at.heading + sinL(tm * 11) * 0.05, sinL(tm * 9) * 0.04);
      }
      if (k.autoTicks > 0) {
        const o = this.auras.next() as Mesh;
        o.position.set(at.x, at.y + 0.8, at.z);
        const sc = 1 + 0.08 * sinL(tm * 25);
        o.scale.set(sc, sc * 0.8, sc * 1.25);
        o.rotation.y = at.heading;
        this.col.setHSL((tm * 1.6) % 1, 1, 0.6);
        (o.material as MeshBasicMaterial).color.copy(this.col);
        // rainbow sparkle trail
        if (dt > 0) this.host.burst?.(i, this.col.getHex(), 2, 3);
      }
    }

    // bell rings expand to the 25 m radius in 0.45 s
    const R = ITEMS.bell.radius;
    this.bells = this.bells.filter((b) => (b.t += dt) < 0.6);
    const cam = this.host.camera?.();
    for (const b of this.bells) {
      const o = this.rings.next() as Mesh;
      const u = Math.min(1, b.t / 0.45);
      const r = 1 + (R - 1) * (1 - (1 - u) * (1 - u));
      o.position.set(b.x, b.y, b.z);
      o.scale.set(r, r, 1);
      // B60: the player's own ring at half strength, and any ring fades while its edge passes the camera
      let a = 0.85 * (1 - b.t / 0.6) * (b.own === info.me ? 0.5 : 1);
      if (cam) {
        const cx = cam.x - b.x;
        const cz = cam.z - b.z;
        const edge = Math.abs(Math.sqrt(cx * cx + cz * cz) - r);
        if (edge < 6 && Math.abs(cam.y - b.y) < 6) a *= edge / 6;
      }
      (o.material as MeshBasicMaterial).opacity = a;
    }

    for (const p of this.pools) p.end();
    this.warn.classList.toggle('on', s.laserWarn === info.me && !info.paused);
  }

  dispose(): void {
    for (const p of this.pools) p.dispose();
    this.warn.remove();
  }
}
