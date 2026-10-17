/**
 * Lobby stage: the picked hero on a turntable for the title, pick and results screens (POC.md §12 "hero
 * turntable"). Its own small scene and lights; the renderer draws it while no match runs.
 */
import * as THREE from 'three';
import type { HeroId } from '../sim/api';
import { FADE, Particles, SHAPE } from './fx/Particles.js';
import { Shockwaves } from './fx/Shockwaves.js';
import { CONFETTI_COLORS } from './ppk/fx/palette.js';
import { lookKey, type Look } from './cosmetics';
import type { GameRenderer } from './renderer';
import { lobbyHero } from './views/heroView';
import type { RigUniforms } from './views/rig';

export class Lobby {
  readonly scene = new THREE.Scene();
  private hero: { mesh: THREE.Mesh; rig: RigUniforms; dispose(): void } | null = null;
  private heroId: HeroId | null = null;
  private team: 0 | 1 = 0;
  private look = '';
  private t = 0;
  private spin = 0;
  private hop = 1;
  private particles = new Particles({ rng: Math.random, groundY: () => 0 });
  private confettiT = 0;
  /** Where on screen the hero stands: -1 left .. 1 right. */
  side = 0.42;

  constructor(private readonly gr: GameRenderer) {
    const s = this.scene;
    s.background = new THREE.Color(0x2b1d2e);
    s.fog = null;
    s.add(new THREE.HemisphereLight(0xfff4e0, 0x5a3f6e, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const sc = key.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 4;
    sc.bottom = -4;
    s.add(key);
    const rim = new THREE.DirectionalLight(0xff9fc0, 1.6);
    rim.position.set(-5, 4, -6);
    s.add(rim);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 32), new THREE.MeshLambertMaterial({ color: 0xfff3dc }));
    ped.position.y = -0.2;
    ped.receiveShadow = true;
    s.add(ped);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff6f91 }));
    trim.rotation.x = Math.PI / 2;
    s.add(trim);
    // soft glow disc behind
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 48),
      new THREE.MeshBasicMaterial({ color: 0x7d4fa8, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    glow.position.set(0, 1.6, -2.5);
    s.add(glow);
    this.particles.attach(s);
    // Register the shockwave fx modules before the fx uber program first compiles (else each gets its own program).
    const warm = new Shockwaves(null, { particles: this.particles, groundY: () => 0, rng: Math.random });
    warm.init(new THREE.Scene());
    warm.dispose();
  }

  setHero(hero: HeroId, team: 0 | 1 = 0, look: Look | null = null): void {
    const key = lookKey(look);
    if (hero === this.heroId && team === this.team && key === this.look && this.hero) return;
    if (this.hero) {
      this.scene.remove(this.hero.mesh);
      this.hero.dispose();
    }
    this.heroId = hero;
    this.team = team;
    this.look = key;
    this.hero = lobbyHero(hero, team, look);
    this.hero.mesh.name = `lobby-hero:${hero}:${key}`;
    this.hero.mesh.scale.multiplyScalar(1.15);
    this.scene.add(this.hero.mesh);
    this.hop = 0;
    this.particles.burst(new THREE.Vector3(0, 0.6, 0), { additive: true, n: 18, shape: SHAPE.STAR4, color: 0xffd34d, intensity: 1.6, size: [0.08, 0.16], life: [0.4, 0.7], speed: [1.5, 3], up: 1.5 });
  }

  /** Celebrate (results screen win). */
  confetti(seconds = 2.5): void {
    this.confettiT = seconds;
  }

  enter(): void {
    this.gr.active = this.scene;
    this.gr.preRender = null;
    this.gr.place = (cam) => {
      const aspect = cam.aspect;
      // keep the hero clear of the UI column: shift the look-at so the hero sits at `side`
      const off = this.side * Math.min(2.6, 1.3 * aspect);
      cam.position.set(-off, 2.3, 7.6);
      cam.lookAt(-off, 1.05, 0);
    };
  }

  leave(): void {
    this.gr.place = null;
    this.gr.active = this.gr.scene;
  }

  update(dt: number): void {
    this.t += dt;
    const h = this.hero;
    if (h) {
      this.spin += dt * 0.55;
      this.hop = Math.min(1, this.hop + dt * 2.5);
      const bounce = this.hop < 1 ? Math.sin(this.hop * Math.PI) * 0.5 : 0;
      h.mesh.position.set(0, bounce, 0);
      h.mesh.rotation.y = -Math.PI * 0.5 + Math.sin(this.spin) * 0.9;
      h.rig.uTime.value = this.t;
      h.rig.uSwing.value = Math.max(0, Math.sin(this.t * 1.3) - 0.9) * 8;
      h.rig.uCast.value = this.hop < 1 ? Math.sin(this.hop * Math.PI) : 0;
    }
    if (this.confettiT > 0) {
      this.confettiT -= dt;
      if (Math.random() < dt * 14) {
        const c = Number('0x' + CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0].slice(1));
        this.particles.burst(new THREE.Vector3((Math.random() - 0.5) * 6, 4.5, (Math.random() - 0.5) * 2), {
          n: 6,
          shape: SHAPE.CONFETTI,
          color: c,
          size: [0.12, 0.18],
          life: [1.6, 2.4],
          speed: [0.5, 1.5],
          gravity: 2.2,
          drag: 1.2,
          spin: 8,
          fade: FADE.HOLD,
        });
      }
    }
    this.particles.update(dt);
  }
}
