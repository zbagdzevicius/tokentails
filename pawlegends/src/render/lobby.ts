/**
 * Lobby stage: the picked hero on a turntable for the title, pick and results screens (POC.md §12 "hero
 * turntable"). Its own small scene and lights; the renderer draws it while no match runs.
 */
import * as THREE from 'three';
import type { HeroId } from '../sim/api';
import { FADE, Particles, SHAPE } from './fx/Particles.js';
import { Shockwaves } from './fx/Shockwaves.js';
import { CONFETTI_COLORS } from './ppk/fx/palette.js';
import { ELEMENT_COLOR, lookKey, mixColor, type Look } from './cosmetics';
import { FOIL_STRENGTH, setCharTime } from './chars/charMaterial';
import { getSkin, isCardSkinId } from './skins/skinStore';
import type { GameRenderer } from './renderer';
import { lobbyHero, type LobbyHero } from './views/heroView';

export class Lobby {
  readonly scene = new THREE.Scene();
  private hero: LobbyHero | null = null;
  private swingIn = 2.5;
  private heroId: HeroId | null = null;
  private team: 0 | 1 = 0;
  private look = '';
  private t = 0;
  private spin = 0;
  private hop = 1;
  private particles = new Particles({ rng: Math.random, groundY: () => 0 });
  private confettiT = 0;
  /** Where on screen the hero stands: -1 left .. 1 right (the floor when no UI column is found). */
  side = 0.42;
  /** Camera framing of the last placement (m): its sideways offset and distance, for the hero's facing. */
  private camOff = 0;
  private camDist = 7.6;
  /** Top of the hero (m) for the framing, from its bind-pose bounds. */
  private top = 3;
  private edgeAt = -1;
  private edge: number | null = null;
  private moodAt = -1;

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
      this.scene.remove(this.hero.object);
      this.hero.dispose();
    }
    this.heroId = hero;
    this.team = team;
    this.look = key;
    this.hero = lobbyHero(hero, team, look);
    this.hero.object.name = `lobby-hero:${hero}:${key}`;
    // a Legendary card skin shows its fur foil on the turntable too
    const skin = isCardSkinId(look?.coat) ? getSkin(look?.coat) : null;
    const u = this.hero.ch.material.userData.u;
    u.uFoil.value = skin?.rung === 'LEGENDARY' ? FOIL_STRENGTH : 0;
    if (skin) u.uFoilColor.value.setHex(mixColor(0xffffff, ELEMENT_COLOR[skin.element], 0.5));
    this.hero.object.scale.setScalar(1.0);
    const g = this.hero.ch.mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    this.top = (g.boundingBox?.max.y ?? 1.05) * this.hero.ch.height;
    this.scene.add(this.hero.object);
    this.hero.ch.anim.respawn();
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
    this.edgeAt = -1;
    this.gr.place = (cam) => {
      const aspect = cam.aspect;
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      // frame the whole hero plus the pedestal with ~10% headroom (short landscape clipped the helmets and caps)
      const top = this.top + 0.35;
      // the pedestal's front rim (r 1.8 m, toward the tilted camera) projects below its centre: keep it in frame
      const bottom = -0.8;
      const span = (top - bottom) * 1.12;
      const dist = Math.max(7.6, span / 2 / tanV);
      const cy = (top + bottom) / 2 + span * 0.03;
      const halfW = tanV * dist * aspect;
      // keep the hero and the pedestal (r 1.8 m) right of the UI column, inside the screen
      const ped = 1.85 / halfW;
      const edge = this.panelEdge();
      let ndc = this.side * 0.6;
      if (edge !== null) ndc = Math.max(ndc, edge + ped + 0.03);
      ndc = Math.min(ndc, 0.97 - ped);
      const off = ndc * halfW;
      this.camOff = off;
      this.camDist = dist;
      cam.position.set(-off, cy + dist * 0.16, dist);
      cam.lookAt(-off, cy, 0);
    };
  }

  /** The right edge (NDC) of the screen's UI column (title / pick / results), re-read a few times a second. */
  private panelEdge(): number | null {
    if (typeof document === 'undefined') return null;
    if (this.t - this.edgeAt < 0.25 && this.edgeAt >= 0) return this.edge;
    this.edgeAt = this.t;
    let right = 0;
    for (const el of document.querySelectorAll<HTMLElement>('.pl-pick-col, .pl-title-col, .pl-results-col')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) right = Math.max(right, r.right);
    }
    const w = window.innerWidth || 1;
    this.edge = right > 0 ? (right / w) * 2 - 1 : null;
    return this.edge;
  }

  /** The results mood (cheer on Victory, sad on Defeat), read from the results screen. */
  private mood(): string | null {
    if (typeof document === 'undefined' || document.documentElement.dataset.screen !== 'results') return null;
    const r = document.querySelector('.pl-results');
    return r ? (r.classList.contains('won') ? 'cheer' : 'sad') : null;
  }

  leave(): void {
    this.gr.place = null;
    this.gr.active = this.gr.scene;
  }

  update(dt: number): void {
    this.t += dt;
    setCharTime(this.t);
    const h = this.hero;
    if (h) {
      this.spin += dt * 0.55;
      this.hop = Math.min(1, this.hop + dt * 2.5);
      const bounce = this.hop < 1 ? Math.sin(this.hop * Math.PI) * 0.5 : 0;
      h.object.position.set(0, bounce * 0.4, 0);
      // face the camera at a three-quarter turn (~30° off), with a gentle sway (the old ±52° swing showed backs)
      const toCam = Math.atan2(-this.camDist, -this.camOff);
      h.object.rotation.y = toCam + 0.3 + Math.sin(this.spin) * 0.22;
      if (this.t - this.moodAt > 0.3) {
        this.moodAt = this.t;
        h.ch.anim.mood = this.mood();
      }
      // an attack flourish every few seconds (not while cheering or sulking)
      this.swingIn -= dt;
      if (this.swingIn < 0) {
        this.swingIn = 3.5 + Math.random() * 2;
        if (!h.ch.anim.mood) h.ch.anim.swing();
      }
      h.ch.anim.update(dt, { state: 'idle', speed: 0, height: h.ch.height, yawRate: 0 });
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
