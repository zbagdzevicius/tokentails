/**
 * Lobby stage: the picked hero on a turntable for the title, pick and results screens (POC.md §12 "hero
 * turntable"). Its own small scene and lights; the renderer draws it while no match runs.
 *
 * Lobby redesign (lobby spec §3a): a shader backdrop tinted by the worn card's element (else the hero colour), a
 * two-tier pedestal with a turning paw-rune ring and a light cone (Med/High), pointer parallax, the Play dolly
 * (`playOut`), the equip burst and the card's Nature motes (render/nature/lobbyNature.ts, a lazy chunk). The framing
 * keeps the whole pedestal in view (it was cut off at 1280x720 and 844x390). Cosmetic only.
 */
import * as THREE from 'three';
import type { HeroId } from '../sim/api';
import { FADE, Particles, SHAPE } from './fx/Particles.js';
import { Shockwaves } from './fx/Shockwaves.js';
import { CONFETTI_COLORS } from './ppk/fx/palette.js';
import { ELEMENT_COLOR, lookKey, mixColor, type Look } from './cosmetics';
import type { CatTier, Element } from '../meta/roster';
import { HERO_COLOR_CSS } from './palette';
import { createBackdrop, type Backdrop } from './lobby/backdrop';
import { HOME_BG, lobbyBgFor, lobbyBgOverride, lobbyBgUrl, lobbyBgVisit, screenBg, type LobbyBg } from './lobby/lobbyBg';
import { HEROES } from '../data/heroes';
import { createPedestal, PEDESTAL_BOTTOM, PEDESTAL_R, type Pedestal } from './lobby/pedestal';
import { reducedMotion, StageFx } from './lobby/stageFx';
import { FOIL_STRENGTH, setCharTime } from './chars/charMaterial';
import { coatRung } from './skins/coatRung';
import { AWAKEN_FOIL } from './skins/effectKit';
import { getSkin, isCardSkinId } from './skins/skinStore';
import type { GameRenderer } from './renderer';
import { lobbyHero, type LobbyHero } from './views/heroView';
import { HERO_TOP } from './chars/specs';

/** The hero-select frame's reference top (m): the tallest hero's drawn top, so relative sizes show. */
const LOBBY_REF_TOP = Math.max(...Object.values(HERO_TOP));

/** What the lobby needs of the Nature module (render/nature/lobbyNature.ts, loaded on the first card). */
interface LobbyNatureLike {
  setElement(el: Element | null, rung?: CatTier | null): void;
  update(dt: number): void;
  burst?(): void;
  dispose?(): void;
}

const cssToHex = (c: string): number => {
  const n = Number.parseInt(c.replace('#', ''), 16);
  return Number.isFinite(n) ? n : 0xff9f6b;
};

/** NDC limits the framing keeps the hero top and the pedestal's front rim inside. */
const NDC_TOP = 0.9;
const NDC_BOTTOM = -0.92;

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
  /**
   * Home (HOME-MODES.md §4): the hero's height as a share of the framing band (1 = the full band; Home 0.72, so the
   * key art's teams stay visible) and the share of the screen height under its feet (Home: the key art's sand floor).
   */
  heroScale = 1;
  footShare = 0;
  /** A `?lobbybg=` override is on: every screen keeps that scene (e2e, screenshots). */
  private bgForced = false;
  /** Camera framing of the last placement (m): its sideways offset and distance, for the hero's facing. */
  private camOff = 0;
  private camDist = 7.6;
  /** Top of the hero (m) for the framing, from its bind-pose bounds. */
  private top = 3;
  private edgeAt = -1;
  private edge: number | null = null;
  /** Share of the screen height a footer under the hero takes (short landscape pick: Play and the bots row). */
  private foot = 0;
  /** The left edge (NDC) of the results card (MVP / team best), or null: the hero is framed clear of it. */
  private cardEdge: number | null = null;
  /** Half the drawn hero's widest horizontal extent (m), at least the pedestal's radius. */
  private halfWide = 1.85;
  private moodAt = -1;
  /** Feel pass: the visit's scene, and the scene now shown (the pick / results screens swap in their own). */
  private visitBg: LobbyBg = 'castles';
  private shownBg: LobbyBg | null = null;
  private readonly backdrop: Backdrop;
  private readonly pedestal: Pedestal;
  private readonly stage: StageFx;
  private nature: LobbyNatureLike | null = null;
  private natureLoading = false;
  private natureEl: Element | null = null;
  private natureRung: CatTier | null = null;
  /** The tint of the current look (element colour of a worn card, else the hero colour). */
  private tint = 0xff9f6b;

  constructor(private readonly gr: GameRenderer) {
    const s = this.scene;
    // v6 one style (Nov 13): bright midday stadium light to match the comic key art: a clear sky over warm pale sand,
    // a white key from the front, a rose rim from the cat side (left) and a sky rim from the dog side (right)
    s.background = new THREE.Color(0x12091f);
    s.fog = null;
    s.add(new THREE.HemisphereLight(0xffffff, 0xf3dcae, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const sc = key.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 4;
    sc.bottom = -4;
    s.add(key);
    const rim = new THREE.DirectionalLight(0xff86a5, 1.5);
    rim.position.set(-5, 4, -6);
    s.add(rim);
    const rimSky = new THREE.DirectionalLight(0x7cc6ff, 1.3);
    rimSky.position.set(5, 4, -6);
    s.add(rimSky);
    // backdrop, two-tier pedestal and rune ring (render/lobby/*)
    this.backdrop = createBackdrop();
    s.add(this.backdrop.mesh);
    // UX pass 2: the painted scene starts loading with the lobby (the first screen), so it is in by the first look
    this.loadScene();
    this.pedestal = createPedestal();
    s.add(this.pedestal.group);
    this.particles.attach(s);
    this.stage = new StageFx(s, this.particles);
    // Register the shockwave fx modules before the fx uber program first compiles (else each gets its own program).
    const warm = new Shockwaves(null, { particles: this.particles, groundY: () => 0, rng: Math.random });
    warm.init(new THREE.Scene());
    warm.dispose();
  }

  setHero(hero: HeroId, team: 0 | 1 = 0, look: Look | null = null): void {
    // v6 facelift: outside the match a dog hero wears its own side's cloth (Woof ochre, team 1; never sky, GFX-01), not
    // the cat team's rose: the menus show the species rivalry, the match keeps its relation colours
    if (team === 0 && HEROES[hero]?.side === 'dog') team = 1;
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
    // a Legendary card skin (or Legendary coat, CARD-SKINS.md) shows its fur foil on the turntable too; an Awakened
    // card at its full Legend stage
    const skin = isCardSkinId(look?.coat) ? getSkin(look?.coat) : null;
    const coatFx = skin ? null : coatRung(look?.coat, hero);
    const u = this.hero.ch.material.userData.u;
    const legendary = skin?.rung === 'LEGENDARY' || coatFx?.rung === 'LEGENDARY';
    u.uFoil.value = legendary ? (skin?.awakened ? AWAKEN_FOIL[3] : FOIL_STRENGTH) : 0;
    const fel = skin?.element ?? coatFx?.element;
    if (fel) u.uFoilColor.value.setHex(mixColor(0xffffff, ELEMENT_COLOR[fel], 0.75));
    // the stage takes the card's element colour (else the hero's own) and its Nature motes
    this.tint = skin ? ELEMENT_COLOR[skin.element] : cssToHex(HERO_COLOR_CSS[hero] ?? '#ff9f6b');
    this.backdrop.setTint(this.tint);
    this.pedestal.setTint(this.tint);
    this.setNature(skin ? skin.element : null, skin ? skin.rung : null);
    this.hero.object.scale.setScalar(1.0);
    const g = this.hero.ch.mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    // frame every hero against the same reference (the tallest drawn top), not its own: Pixel stands small and
    // Sir Brutus big on the same pedestal (per-hero visual size, chars/heroSize.ts); never clip a taller bounds
    this.top = Math.max(LOBBY_REF_TOP, (g.boundingBox?.max.y ?? 1.05) * this.hero.ch.height);
    // the widest the body gets as it turns (bind-space X/Z × the drawn height and girth): wide Meatball is framed by
    // his width as well as his height (feel QA: the results card covered his body)
    const bb = g.boundingBox;
    const sc = this.hero.ch.inner.scale;
    const reach = bb ? Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * Math.max(sc.x, sc.z) : 0;
    this.halfWide = Math.max(1.85, reach);
    this.scene.add(this.hero.object);
    this.hero.ch.anim.respawn();
    this.hop = 0;
    this.particles.burst(new THREE.Vector3(0, 0.6, 0), { additive: true, n: 18, shape: SHAPE.STAR4, color: 0xffe14a, intensity: 1.6, size: [0.08, 0.16], life: [0.4, 0.7], speed: [1.5, 3], up: 1.5 });
  }

  /** Celebrate (results screen win). */
  confetti(seconds = 2.5): void {
    this.confettiT = seconds;
  }

  /**
   * The worn card's Nature (element and rung), or null for none. The motes module loads on the first card (its own
   * chunk); setHero calls this itself, so callers only need it for a preview without a hero change.
   */
  setNature(el: Element | null, rung: CatTier | null = null): void {
    this.natureEl = el;
    this.natureRung = rung;
    if (this.nature) {
      this.nature.setElement(el, rung);
      return;
    }
    if (!el || this.natureLoading) return;
    this.natureLoading = true;
    void import('./nature/lobbyNature')
      .then((m) => {
        this.nature = m.createLobbyNature(this.scene, this.particles, () => this.gr.settings.tier === 'low') as LobbyNatureLike;
        this.nature.setElement(this.natureEl, this.natureRung);
      })
      .catch(() => {
        // no motes (offline chunk): the tint still shows the element
        this.natureLoading = false;
      });
  }

  /** The equip moment: a ground ring and a star burst in the stage tint, and a pulse of the rune ring. */
  equipBurst(): void {
    this.pedestal.pulse();
    this.stage.equipBurst(this.tint, this.gr.settings.tier === 'low');
    this.nature?.burst?.();
  }

  /** The hero's chest on screen (viewport px), for the drawer's card flight; null before the first frame. */
  heroPoint(): { x: number; y: number } | null {
    if (!this.hero || typeof window === 'undefined') return null;
    const cam = this.gr.camera;
    const r = this.gr.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    P.set(0, this.top * 0.45, 0).project(cam);
    return { x: r.left + ((P.x + 1) / 2) * r.width, y: r.top + ((1 - P.y) / 2) * r.height };
  }

  /** The Play dolly (~400 ms in toward the hero); resolves at once with reduced motion. */
  playOut(): Promise<void> {
    return this.stage.playOut();
  }

  enter(): void {
    this.gr.active = this.scene;
    this.gr.preRender = null;
    this.edgeAt = -1;
    this.stage.reset();
    this.stage.listen(true);
    const low = this.gr.settings.tier === 'low';
    this.pedestal.setCone(!low);
    // QA: Low drew both bokeh layers per pixel every frame for a frozen picture; none on Low
    this.backdrop.setBokeh(low ? 0 : 1);
    this.gr.place = (cam) => {
      const aspect = cam.aspect;
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      // the whole hero (~10% headroom) and the whole pedestal: its front rim (r PEDESTAL_R, toward the tilted camera)
      // projects well below its centre, so the frame is fitted on the projected points, not on a guessed bottom
      const top = this.top + 0.35;
      const edge = this.panelEdge();
      // a footer under the hero (844x390 pick: the bots row and Play) gets its own band at the foot of the frame, so
      // it no longer covers the feet or the pedestal (the hero frames in the screen above it)
      const lowLimit = Math.min(0.2, NDC_BOTTOM + this.foot * 2);
      // keep the hero and the pedestal right of the UI column, inside the screen, and left of the results card (MVP /
      // team best); the widest body (wide Meatball) or the pedestal, whichever is wider, has to fit in that gap
      const right = this.cardEdge !== null ? this.cardEdge - 0.03 : 0.97;
      const left = edge !== null ? edge + 0.03 : -0.97;
      const room = right - left;
      const wide = Math.max(PEDESTAL_R + 0.05, this.halfWide);
      // when the gap is too narrow for the widest body, the camera backs off until it fits (a floor on the distance)
      const minDist = Math.max(7.6, room > 0.2 ? (2 * wide) / (tanV * aspect * room) : 0);
      let dist = Math.max(minDist, ((top - PEDESTAL_BOTTOM) * 1.25) / (1 - this.foot) / 2 / tanV);
      let cy = (top + PEDESTAL_BOTTOM) / 2;
      let off = 0;
      for (let i = 0; i < 4; i++) {
        const halfW = tanV * dist * aspect;
        const ped = wide / halfW;
        let ndc = this.side * 0.6;
        if (edge !== null) ndc = Math.max(ndc, edge + ped + 0.03);
        ndc = Math.min(ndc, right - ped);
        off = ndc * halfW;
        cam.position.set(-off, cy + dist * 0.16, dist);
        cam.lookAt(-off, cy, 0);
        cam.updateMatrixWorld();
        cam.updateProjectionMatrix();
        const yTop = P.set(0, top, 0).project(cam).y;
        const yBot = P.set(0, PEDESTAL_BOTTOM, PEDESTAL_R).project(cam).y;
        const want = (NDC_TOP - lowLimit) * this.heroScale;
        const span = yTop - yBot;
        // the band's foot stays put; a smaller hero (Home) stands on it with the room above it
        const mid = lowLimit + want / 2;
        // held back by the width floor, the hero is smaller than the band: only centre it in the band
        const spanOk = Math.abs(span - want) < 0.01 || (dist <= minDist + 1e-6 && span < want);
        if (spanOk && Math.abs((yTop + yBot) / 2 - mid) < 0.01) break;
        // re-fit: the distance scales the span, then the centre slides to the band's middle
        dist = Math.max(minDist, dist * (span / want));
        cy += ((yTop + yBot) / 2 - mid) * tanV * dist;
      }
      this.camOff = off;
      this.camDist = dist;
      cam.position.set(-off, cy + dist * 0.16, dist);
      LOOK.set(-off, cy, 0);
      this.stage.apply(cam, LOOK);
      if (E2E) this.reportFrame(cam, top);
    };
  }

  private frameKey = '';
  /** `?e2e=1`: the framing in NDC (hero top, pedestal front-bottom, pedestal left and right) on `html[data-lobby-frame]`. */
  private reportFrame(cam: THREE.PerspectiveCamera, top: number): void {
    cam.updateMatrixWorld();
    const r = (n: number): string => n.toFixed(2);
    const k = [
      P.set(0, top, 0).project(cam).y,
      P.set(0, PEDESTAL_BOTTOM, PEDESTAL_R).project(cam).y,
      P.set(-PEDESTAL_R, PEDESTAL_BOTTOM, 0).project(cam).x,
      P.set(PEDESTAL_R, PEDESTAL_BOTTOM, 0).project(cam).x,
    ]
      .map(r)
      .join(',');
    if (k !== this.frameKey) document.documentElement.dataset.lobbyFrame = this.frameKey = k;
  }

  /** The right edge (NDC) of the screen's UI column (title / pick / results), re-read a few times a second. */
  private panelEdge(): number | null {
    if (typeof document === 'undefined') return null;
    if (this.t - this.edgeAt < 0.25 && this.edgeAt >= 0) return this.edge;
    this.edgeAt = this.t;
    let right = 0;
    // (the champion select has no column: its grid and panel cover the stage, so the hero stands centred behind them)
    for (const el of document.querySelectorAll<HTMLElement>('.pl-title-col, .pl-results-col, .lb-col')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) right = Math.max(right, r.right);
    }
    const w = window.innerWidth || 1;
    this.foot = this.footShare;
    this.edge = right > 0 ? (right / w) * 2 - 1 : null;
    let card = Infinity;
    for (const el of document.querySelectorAll<HTMLElement>('.tt-mvp')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left > w * 0.45) card = Math.min(card, r.left);
    }
    this.cardEdge = card < Infinity ? (card / w) * 2 - 1 : null;
    return this.edge;
  }

  /** The results mood (cheer on Victory, sad on Defeat), read from the results screen. */
  private mood(): string | null {
    if (typeof document === 'undefined' || document.documentElement.dataset.screen !== 'results') return null;
    const r = document.querySelector('.pl-results');
    return r ? (r.classList.contains('won') ? 'cheer' : 'sad') : null;
  }

  /** UX pass 2: the visit's painted scene behind the turntable (the gradient shows until it loads). */
  private loadScene(): void {
    if (typeof window === 'undefined') return;
    const forced = lobbyBgOverride(window.location.search);
    this.bgForced = forced !== null;
    this.visitBg = forced ?? lobbyBgFor(lobbyBgVisit());
    this.syncScene();
  }

  /** Shows the current screen's scene (pick: the stage; results: the species' victory / defeat), else the visit's. */
  private syncScene(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const side = this.heroId ? HEROES[this.heroId].side : 'cat';
    const won = !!document.querySelector('.pl-results.won');
    const bg = screenBg(document.documentElement.dataset.screen, { won, side, forced: this.bgForced }) ?? this.visitBg;
    if (bg === this.shownBg) return;
    this.shownBg = bg;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const url = lobbyBgUrl(bg, {
      base: import.meta.env.BASE_URL ?? './',
      bufferWidth: (window.innerWidth || 1280) * dpr,
      low: this.gr.settings.tier === 'low',
      aspect: (window.innerWidth || 16) / (window.innerHeight || 9),
    });
    document.documentElement.dataset.lobbyBg = bg;
    // Home's key art is shown as painted (no dim, tint or vignette: the rose and sky sides are in the art)
    this.backdrop.setSplit(bg === HOME_BG ? 1 : 0);
    this.backdrop.setImage(url, reducedMotion());
  }

  leave(): void {
    this.stage.listen(false);
    this.gr.place = null;
    this.gr.active = this.gr.scene;
  }

  update(dt: number): void {
    this.t += dt;
    setCharTime(this.t);
    const h = this.hero;
    if (this.t - this.moodAt > 0.3) this.syncScene();
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
    const frozen = this.gr.settings.tier === 'low' || reducedMotion();
    const aim = this.stage.aim();
    this.backdrop.setParallax(-aim.x, aim.y);
    this.backdrop.update(dt, frozen);
    this.pedestal.update(dt, frozen);
    this.stage.update(dt);
    this.nature?.update(dt);
    this.particles.update(dt);
  }
}

const P = new THREE.Vector3();
const E2E = ((): boolean => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('e2e') === '1';
  } catch {
    return false;
  }
})();
const LOOK = new THREE.Vector3();
