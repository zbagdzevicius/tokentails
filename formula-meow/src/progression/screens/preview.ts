/**
 * Garage turntable: the player's kart (the feel lane's KartView, so it is exactly the race kart) slowly spinning on a
 * plinth, wearing the hat and dropping the trail being looked at. Its own small WebGL canvas, created when the garage
 * opens and freed (context included) when it closes. Rendering pauses while the canvas is hidden.
 */
import { CylinderGeometry, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { RacerInfo } from '../../types';
import { KartView } from '../../core/render/kart-view';
import { toonMaterial } from '../../core/render/toon';
import { newKart } from '../../core/sim/kart';
import { wearHat } from '../cosmetics/hats';
import { KartTrail } from '../cosmetics/trail';
import { reducedMotion } from '../../ui/a11y';

export class KartPreview {
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private cam = new PerspectiveCamera(30, 1, 0.1, 60);
  private kart: KartView | null = null;
  private trail: KartTrail;
  private plinth: Mesh;
  private angle = 0.6;
  private raf = 0;
  private last = 0;
  private state = newKart();
  private w = 0;
  private h = 0;
  private key = '';

  constructor(private readonly host: HTMLElement) {
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.renderer.setClearColor(0x000000, 0);
      host.appendChild(this.renderer.domElement);
    } catch {
      this.renderer = null; // no WebGL: the garage still works, without the turntable
    }
    this.scene.add(new HemisphereLight(0xfff3dc, 0x6d3fa8, 2.2));
    const sun = new DirectionalLight(0xffffff, 2.4);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);
    this.plinth = new Mesh(new CylinderGeometry(2.1, 2.25, 0.22, 28), toonMaterial({ color: 0xfff3dc }));
    this.plinth.position.y = -0.11;
    this.scene.add(this.plinth);
    this.trail = new KartTrail(this.scene);
    this.cam.position.set(0, 2.3, 6.6);
    this.cam.lookAt(0, 0.65, 0);
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Show this racer (rebuilds the kart only when the look changed). */
  show(info: RacerInfo, trail: number): void {
    const key = JSON.stringify([info.kart, info.cat, info.hat ?? 0]);
    if (key !== this.key) {
      this.key = key;
      if (this.kart) {
        this.kart.root.removeFromParent();
        this.kart.dispose();
      }
      this.kart = new KartView(info);
      wearHat(this.kart.cat.head, info.hat ?? 0);
      this.scene.add(this.kart.root);
      this.pose(0);
    }
    this.trail.set(trail);
  }

  private pose(dt: number): void {
    if (!this.kart) return;
    this.kart.update(this.state, 0, 0, 0, this.angle, 0, 0, 0, dt, 20);
  }

  private frame(dt: number): void {
    const r = this.renderer;
    if (!r || !this.host.isConnected || this.host.offsetParent === null) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      r.setSize(w, h, false);
      this.cam.aspect = w / Math.max(1, h);
      // a narrow canvas (landscape side panel) steps back so the whole kart fits
      const k = Math.max(1, 1.5 / this.cam.aspect);
      this.cam.position.set(0, 2.3 * k, 6.6 * k);
      this.cam.lookAt(0, 0.65, 0);
      this.cam.updateProjectionMatrix();
    }
    this.angle += dt * (reducedMotion() ? 0.25 : 0.7);
    this.pose(dt);
    this.plinth.rotation.y = this.angle;
    this.trail.update(dt, 0, 0, 0, this.angle, 9, true, reducedMotion());
    r.render(this.scene, this.cam);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    if (this.kart) {
      this.kart.root.removeFromParent();
      this.kart.dispose();
      this.kart = null;
    }
    this.trail.dispose();
    this.plinth.geometry.dispose();
    (this.plinth.material as { dispose(): void }).dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
  }
}
