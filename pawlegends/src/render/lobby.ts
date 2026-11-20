/**
 * Lobby stage: the picked hero on a turntable for the title, pick and results screens (POC.md §12 "hero
 * turntable"). Its own small scene and lights; the renderer draws it while no match runs.
 *
 * Lobby redesign (lobby spec §3a): a shader backdrop tinted by the worn card's element (else the hero colour), a
 * two-tier pedestal with a turning paw-rune ring and a light cone (Med/High), pointer parallax, the Play dolly
 * (`playOut`), the equip burst and the card's Nature motes (render/nature/lobbyNature.ts, a lazy chunk). The framing
 * keeps the whole pedestal in view (it was cut off at 1280x720 and 844x390). Cosmetic only.
 *
 * Home poster (docs/plans/moba/HOME-POSTER.md, `poster = true`): on Home the painted arena and the pedestal give way
 * to the flat poster drawn by the backdrop (render/lobby/poster.ts): the champion stands big on its own field (a cat
 * left, a dog right), framed clear of the Home HUD, with a warm rim from its side and its rival's silhouette across the
 * bolt. A champion of the other species swings the layout over in SWAP_S.
 *
 * Home map backdrops (docs/plans/moba/HOME-MAP-BACKDROPS.md, Nov 20, `poster = true` on Home): the champion stands in a
 * real map spot (render/lobby/mapViews.ts), a picture of the empty spot behind it (render/lobby/mapBackdrop.ts) and the
 * same camera and sun the picture was shot with; every ROTATE_S the next spot fades in and the camera and light ease
 * over. The poster above is the fallback when the pictures cannot load (offline, before the art deploy).
 */
import * as THREE from 'three';
import type { HeroId } from '../sim/api';
import { FADE, Particles, SHAPE } from './fx/Particles.js';
import { Shockwaves } from './fx/Shockwaves.js';
import { CONFETTI_COLORS } from './ppk/fx/palette.js';
import { ELEMENT_COLOR, lookKey, mixColor, type Look } from './cosmetics';
import type { CatTier, Element } from '../meta/roster';
import { HERO_COLOR_CSS } from './palette';
import { createBackdrop, SWAP_S, type Backdrop } from './lobby/backdrop';
import { posterBox, posterFlip, posterSide, posterTurn, rivalFor, silhouetteFile, type PosterBox, type Rect } from './lobby/poster';
import { artRoot } from '../ui/art';
import { assetRev } from '../ui/assetRev';
import { HOME_MAP, lobbyBgFor, lobbyBgOverride, lobbyBgUrl, lobbyBgVisit, screenBg, type LobbyBg } from './lobby/lobbyBg';
import { createMapBackdrop, type MapBackdrop } from './lobby/mapBackdrop';
import { MAP_VIEWS, MapRotation, PIC_ASPECT, PIC_FOV, REL_DEG, coverCrop, mapViewEvery, mapViewOff, mapViewOrder, mapViewOverride, mapViewUrl, type RotationFrame } from './lobby/mapViews';
import { HEROES } from '../data/heroes';
import { createPedestal, PEDESTAL_BOTTOM, PEDESTAL_R, type Pedestal } from './lobby/pedestal';
import { reducedMotion, StageFx } from './lobby/stageFx';
import { FOIL_STRENGTH, setCharTime } from './chars/charMaterial';
import { coatRung } from './skins/coatRung';
import { coatSig } from './skins/coatVfx';
import { AWAKEN_FOIL } from './skins/effectKit';
import { getSkin, isCardSkinId } from './skins/skinStore';
import type { GameRenderer } from './renderer';
import { lobbyHero, type LobbyHero } from './views/lobbyHero';
import { HERO_TOP } from './chars/specs';
import { coatPartsRev, hasCoatParts, onCoatParts } from './chars/coatParts';

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

/** The poster frames a champion by its bind-pose reach widened by this much: the idle sway and a held shield swing wider. */
const REACH_K = 1.2;

/** The Home HUD the poster's champion keeps clear of (the overlap audit's Home keys). */
const HOME_HUD = ['.hm-profile', '.hm-cur', '.hm-corner', '.hm-left', '.hm-slot > *', '.hm-plate', '.hm-nav', '.hm-play', '.hm-line', '.lb-peek', '.lb-ver']
  .map((k) => `.pl-home ${k}`)
  .join(', ');

export class Lobby {
  readonly scene = new THREE.Scene();
  private hero: LobbyHero | null = null;
  private swingIn = 2.5;
  private heroId: HeroId | null = null;
  private team: 0 | 1 = 0;
  private look = '';
  /** gaps5: the look last set (a coat with parts rebuilds when the part builders land). */
  private lastLook: Look | null = null;
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
  /** Home's poster (the app sets it while Home is up): on the title screen the poster replaces the scene and pedestal. */
  poster = false;
  private posterOn = false;
  /** The hero's own drawn top and widest reach (m): the poster frames each champion by its own size. */
  private ownTop = 1.4;
  private reach = 0.8;
  /** The poster box the champion is framed in (CSS px), eased toward the HUD-clear target on a swap. */
  private box: PosterBox | null = null;
  private boxFrom: PosterBox | null = null;
  private boxTo: PosterBox | null = null;
  private boxT = 1;
  private hud: Rect[] = [];
  private hudAt = -1;
  private readonly rimWarm: THREE.DirectionalLight;
  private readonly rimField: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  /** Home's map backdrop (HOME-MAP-BACKDROPS.md): the picture, the shadow-only ground, the rotation and its frame. */
  private readonly mapBg: MapBackdrop;
  private readonly mapGround: THREE.Mesh;
  private readonly rotation: MapRotation;
  private mapFrame: RotationFrame;
  /** `?mapbg=<id>`: that spot only (e2e, screenshots). */
  private readonly mapHold: boolean;
  private mapOn = false;
  /** The pictures cannot load (two spots in a row failed, or `?mapbg=off`): Home falls back to the poster. */
  private mapFailed = false;
  private mapFails = 0;
  private mapKey = '';
  /** The camera's FOV outside the map backdrop (the map sets its picture's FOV and aspect; the other screens get these back). */
  private readonly baseFov: number;
  /** Something covers Home (a panel, a modal, the loading veil; the app sets it): the rotation waits. */
  covered = false;

  constructor(private readonly gr: GameRenderer) {
    // gaps5: the lobby lives as long as the app; a coat with parts rebuilds when the part builders land
    onCoatParts(() => {
      if (this.heroId && hasCoatParts(this.lastLook?.coat)) this.setHero(this.heroId, this.team, this.lastLook);
    });
    const s = this.scene;
    // v6 one style (Nov 13): bright midday stadium light to match the comic key art: a clear sky over warm pale sand,
    // a white key from the front, a rose rim from the cat side (left) and a sky rim from the dog side (right)
    s.background = new THREE.Color(0x12091f);
    s.fog = null;
    const hemi = new THREE.HemisphereLight(0xffffff, 0xf3dcae, 2.0);
    s.add(hemi);
    this.hemi = hemi;
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    this.key = key;
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
    this.rimWarm = rim;
    this.rimField = rimSky;
    // backdrop, two-tier pedestal and rune ring (render/lobby/*)
    this.backdrop = createBackdrop();
    s.add(this.backdrop.mesh);
    // Home's map backdrop: one picture at a time from pawlegends.app (outside the game bundle), uploaded on arrival
    this.baseFov = gr.camera.fov;
    this.mapBg = createMapBackdrop(
      (v) =>
        mapViewUrl(v.id, {
          root: artRoot(),
          rev: assetRev(),
          bufferWidth: (typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280) * Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1),
          low: this.gr.settings.tier === 'low',
        }),
      (t) => this.gr.renderer.initTexture(t),
    );
    this.mapBg.mesh.visible = false;
    s.add(this.mapBg.mesh);
    this.mapGround = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.3, depthWrite: false }));
    this.mapGround.name = 'lobby-map-ground';
    this.mapGround.rotation.x = -Math.PI / 2;
    this.mapGround.receiveShadow = true;
    this.mapGround.visible = false;
    s.add(this.mapGround);
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const order = mapViewOrder();
    const pinned = mapViewOverride(search);
    this.mapHold = pinned !== null;
    this.mapFailed = mapViewOff(search);
    // a random spot per page load (founder: rotate through all 18), then one spot of each map in turn
    this.rotation = new MapRotation(order, pinned ?? order[Math.floor(Math.random() * order.length)], mapViewEvery(search));
    this.mapFrame = { from: this.rotation.current, to: this.rotation.current, k: 0 };
    this.pedestal = createPedestal();
    s.add(this.pedestal.group);
    // UX pass 2: the painted scene starts loading with the lobby (the first screen), so it is in by the first look
    this.loadScene();
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
    const key = `${lookKey(look)}${hasCoatParts(look?.coat) ? `:p${coatPartsRev()}` : ''}`;
    this.lastLook = look;
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
    // (an Epic or Legendary coat: its signature glow, skins/coatVfx.ts)
    this.tint = skin ? ELEMENT_COLOR[skin.element] : ((coatFx ? coatSig(look?.coat)?.glow : undefined) ?? cssToHex(HERO_COLOR_CSS[hero] ?? '#ff9f6b'));
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
    this.ownTop = Math.max(0.6, (g.boundingBox?.max.y ?? 1.05) * this.hero.ch.height);
    this.reach = Math.max(0.45, reach);
    this.layoutPoster();
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

  /** The poster's side, rival and lights for the current hero (a swap animates unless reduced motion or Low). */
  private layoutPoster(instant = false): void {
    if (!this.posterOn || !this.heroId) return;
    const side = posterSide(this.heroId);
    const still = instant || reducedMotion() || this.gr.settings.tier === 'low';
    this.backdrop.setLayout(side, `${artRoot()}${silhouetteFile(rivalFor(this.heroId))}${assetRev()}`, still);
    // a warm rim from the champion's own side, and a soft rim in its field's colour from the bolt side
    const f = posterFlip(side);
    this.rimWarm.color.setHex(0xffc27a);
    this.rimWarm.intensity = 2.4;
    this.rimWarm.position.set(-5 * f, 4, -5);
    this.rimField.color.setHex(side === 'cat' ? 0xff86a5 : 0x7cc6ff);
    this.rimField.intensity = 1.2;
    this.rimField.position.set(5 * f, 3, -6);
    this.hudAt = -1;
    if (still) this.boxT = 1;
  }

  /** Leaves the poster: the arena lights and pedestal of the other lobby screens come back. */
  private posterOff(): void {
    this.rimWarm.color.setHex(0xff86a5);
    this.rimWarm.intensity = 1.5;
    this.rimWarm.position.set(-5, 4, -6);
    this.rimField.color.setHex(0x7cc6ff);
    this.rimField.intensity = 1.3;
    this.rimField.position.set(5, 4, -6);
    this.box = this.boxTo = this.boxFrom = null;
    delete document.documentElement.dataset.poster;
    delete document.documentElement.dataset.posterHero;
    delete document.documentElement.dataset.posterGaze;
  }

  /** The Home HUD's rects (CSS px), re-read a few times a second. */
  private hudRects(): Rect[] {
    if (this.t - this.hudAt < 0.25 && this.hudAt >= 0) return this.hud;
    this.hudAt = this.t;
    const out: Rect[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(HOME_HUD)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    this.hud = out;
    return out;
  }

  /** The poster framing: the champion fills its HUD-clear box (eased over SWAP_S when it moves to the other side). */
  private placePoster(cam: THREE.PerspectiveCamera): void {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const side = this.heroId ? posterSide(this.heroId) : 'cat';
    const want = posterBox({ w, h, side, aspect: (2 * REACH_K * this.reach) / this.ownTop, hud: this.hudRects() });
    const prev = this.boxTo;
    if (!prev || Math.abs(prev.cx - want.cx) > 1 || Math.abs(prev.top - want.top) > 1 || Math.abs(prev.bottom - want.bottom) > 1) {
      // a side swap glides; a resize or a HUD change snaps
      const swing = !!prev && !!this.box && Math.sign(prev.cx - w / 2) !== Math.sign(want.cx - w / 2) && !reducedMotion() && this.gr.settings.tier !== 'low';
      this.boxFrom = this.box ?? want;
      this.boxTo = want;
      this.boxT = swing ? 0 : 1;
    }
    this.boxT = Math.min(1, this.boxT + this.dtLast / SWAP_S);
    const k = this.boxT < 0.5 ? 4 * this.boxT ** 3 : 1 - (-2 * this.boxT + 2) ** 3 / 2;
    const a = this.boxFrom ?? want;
    const b = this.boxTo ?? want;
    const box = (this.box = { cx: a.cx + (b.cx - a.cx) * k, top: a.top + (b.top - a.top) * k, bottom: a.bottom + (b.bottom - a.bottom) * k });
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const yTop = 1 - (2 * box.top) / h;
    const yBot = 1 - (2 * box.bottom) / h;
    const xN = (2 * box.cx) / w - 1;
    const top = this.ownTop;
    let dist = Math.max(3, (top * 2) / ((yTop - yBot) * tanV));
    let cy = top / 2;
    let off = 0;
    for (let i = 0; i < 5; i++) {
      off = xN * tanV * dist * cam.aspect;
      cam.position.set(-off, cy + dist * 0.12, dist);
      cam.lookAt(-off, cy, 0);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const t = P.set(0, top, 0).project(cam).y;
      const f = P.set(0, 0, 0).project(cam).y;
      const span = t - f;
      if (Math.abs(span - (yTop - yBot)) < 0.004 && Math.abs((t + f) / 2 - (yTop + yBot) / 2) < 0.004) break;
      dist = Math.max(2, dist * (span / (yTop - yBot)));
      cy += ((t + f) / 2 - (yTop + yBot) / 2) * tanV * dist;
    }
    this.camOff = off;
    this.camDist = dist;
    cam.position.set(-off, cy + dist * 0.12, dist);
    LOOK.set(-off, cy, 0);
    this.stage.apply(cam, LOOK);
    cam.updateMatrixWorld();
    this.backdrop.setFoot(box.cx / w, 1 - box.bottom / h, (box.bottom - box.top) * 0.3 / h);
    if (E2E) this.reportPoster(cam, side, w, h);
  }

  private posterKey = '';
  /** `?e2e=1`: the poster's side and the champion's drawn box (CSS px, from its bounds) on `html[data-poster(-hero)]`. */
  private reportPoster(cam: THREE.PerspectiveCamera, side: string, w: number, h: number): void {
    let l = Infinity;
    let r = -Infinity;
    let t = Infinity;
    let b = -Infinity;
    const q = this.reach * REACH_K;
    // the body turns toward the camera, so its reach is measured across (x) at its own depth
    for (const x of [-q, q]) for (const y of [0, this.ownTop]) for (const z of [0]) {
      P.set(x, y, z).project(cam);
      const px = ((P.x + 1) / 2) * w;
      const py = ((1 - P.y) / 2) * h;
      l = Math.min(l, px);
      r = Math.max(r, px);
      t = Math.min(t, py);
      b = Math.max(b, py);
    }
    // where the champion looks on screen: its chest and a point 1 m ahead along its facing (+X turned by rotation.y);
    // a gaze straight at the camera projects to no sideways move, so the sign is the turn toward or away from the centre
    const o = this.hero?.object;
    if (o) {
      const cy = this.ownTop * 0.6;
      const yaw = o.rotation.y + (this.hero?.ch.anim.lookYaw ?? 0);
      const a = P.set(0, cy, 0).project(cam).x;
      const g = P.set(Math.cos(yaw), cy, -Math.sin(yaw)).project(cam).x;
      document.documentElement.dataset.posterGaze = String(Math.round((((g - a) / 2) * w) / 4) * 4);
    }
    const st = this.backdrop.posterState();
    const k = `${side},${st.flip.toFixed(2)},${st.rival.toFixed(2)}|${[l, t, r, b].map((n) => Math.round(n)).join(',')}`;
    if (k === this.posterKey) return;
    this.posterKey = k;
    document.documentElement.dataset.poster = k.split('|')[0];
    document.documentElement.dataset.posterHero = k.split('|')[1];
  }

  /**
   * The map backdrop's camera: the blended spot's camera (champion-centred frame: the feet at the origin), the picture's
   * FOV and aspect, and the picture's cover crop as the view offset, so the champion stands where the picture was shot.
   */
  private placeMap(cam: THREE.PerspectiveCamera): void {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const { from, to, k } = this.mapFrame;
    const a = MAP_VIEWS[from];
    const b = MAP_VIEWS[to];
    const mix = (x: number, y: number): number => x + (y - x) * k;
    const c = coverCrop(w / h);
    cam.fov = PIC_FOV;
    cam.aspect = PIC_ASPECT;
    cam.position.set(0, mix(a.h, b.h), mix(a.gd, b.gd));
    LOOK.set(mix(a.target[0], b.target[0]), mix(a.target[1], b.target[1]), mix(a.target[2], b.target[2]));
    cam.lookAt(LOOK);
    const FH = 1000;
    const FW = FH * PIC_ASPECT;
    cam.setViewOffset(FW, FH, c.x * FW, c.y * FH, c.w * FW, c.h * FH);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.camOff = 0;
    this.camDist = cam.position.z;
    this.mapBg.setAspect(w / h);
    // a tall champion on a near spot would reach under the nameplate (844x390): it is drawn smaller, feet kept on the
    // spot, so its head stays clear (never under 0.72 of its size)
    const o = this.hero?.object;
    if (o) {
      const feetY = P.set(0, 0, 0).project(cam).y;
      const topY = P.set(0, this.ownTop * 1.06, 0).project(cam).y;
      const lim = this.plateBottom();
      const limY = lim === null ? 1 : 1 - (2 * (lim + 6)) / h;
      const k = topY > limY && topY > feetY ? Math.max(0.72, Math.min(1, (limY - feetY) / (topY - feetY))) : 1;
      o.scale.setScalar(k);
    }
    // the contact shadow: the feet on screen and the body's half width (screen heights)
    const f = P.set(0, 0, 0).project(cam);
    const fx = f.x;
    const fy = f.y;
    const r = P.set(this.reach * (o?.scale.x ?? 1), 0, 0).project(cam).x;
    this.mapBg.setFoot((fx + 1) / 2, (fy + 1) / 2, Math.max(0.02, (Math.abs(r - fx) / 2) * (w / h) * 1.15));
    if (E2E) this.reportMap(cam, w, h);
  }

  /** `?e2e=1`: the spot shown (`html[data-map-bg]`), whether its picture is in, and the champion's drawn box (CSS px). */
  private reportMap(cam: THREE.PerspectiveCamera, w: number, h: number): void {
    let l = Infinity;
    let r = -Infinity;
    let t = Infinity;
    let b = -Infinity;
    const sc = this.hero?.object.scale.x ?? 1;
    const q = this.reach * REACH_K * sc;
    for (const x of [-q, q])
      for (const y of [0, this.ownTop * sc]) {
        P.set(x, y, 0).project(cam);
        const px = ((P.x + 1) / 2) * w;
        const py = ((1 - P.y) / 2) * h;
        l = Math.min(l, px);
        r = Math.max(r, px);
        t = Math.min(t, py);
        b = Math.max(b, py);
      }
    const v = MAP_VIEWS[this.mapFrame.from];
    const k = `${v.id}|${this.mapBg.ready(v) ? 1 : 0}|${[l, t, r, b].map((n) => Math.round(n)).join(',')}`;
    if (k === this.mapKey) return;
    this.mapKey = k;
    const [id, ready, box] = k.split('|');
    const d = document.documentElement.dataset;
    d.mapBg = id;
    d.mapBgReady = ready;
    d.heroBox = box;
  }

  private plateAt = -1;
  private plate: number | null = null;
  /** The bottom (CSS px) of Home's champion nameplate, re-read a few times a second; null when it is not shown. */
  private plateBottom(): number | null {
    if (this.t - this.plateAt < 0.25 && this.plateAt >= 0) return this.plate;
    this.plateAt = this.t;
    const r = document.querySelector<HTMLElement>('.pl-home .hm-plate')?.getBoundingClientRect();
    this.plate = r && r.height > 0 ? r.bottom : null;
    return this.plate;
  }

  /** Home's map backdrop on or off: the picture and the shadow ground replace the poster / scene and the pedestal. */
  private setMap(on: boolean): void {
    if (on === this.mapOn) return;
    this.mapOn = on;
    this.mapBg.mesh.visible = on;
    this.backdrop.mesh.visible = !on;
    if (on) {
      this.rimWarm.intensity = 0;
      this.rimField.intensity = 0;
      return;
    }
    this.mapGround.visible = false;
    this.hemi.color.setHex(0xffffff);
    this.hemi.groundColor.setHex(0xf3dcae);
    this.hemi.intensity = 2.0;
    this.key.color.setHex(0xffffff);
    this.key.intensity = 2.6;
    this.key.position.set(4, 8, 6);
    this.rimWarm.intensity = 1.5;
    this.rimField.intensity = 1.3;
    this.mapKey = '';
    const d = document.documentElement.dataset;
    delete d.mapBg;
    delete d.mapBgReady;
    delete d.heroBox;
  }

  /** The rotation's step and the blended spot's light (the map's sun and sky, so the champion is lit like the picture). */
  private updateMap(dt: number): void {
    const still = reducedMotion();
    const hidden = typeof document !== 'undefined' && document.hidden;
    let f = this.rotation.tick(dt, { paused: this.covered || hidden, hold: this.mapHold || still, ready: (i) => this.mapBg.ready(MAP_VIEWS[i]) });
    // a spot whose picture failed is skipped; two in a row (offline, or the art not deployed yet) fall back to the poster
    if (f.k === 0 && this.mapBg.failed(MAP_VIEWS[f.from])) {
      this.mapFails++;
      if (this.mapFails >= 2 || this.mapHold) {
        this.mapFailed = true;
        return;
      }
      this.rotation.skip();
      f = { from: this.rotation.current, to: this.rotation.current, k: 0 };
    } else if (this.mapBg.ready(MAP_VIEWS[f.from])) this.mapFails = 0;
    this.mapFrame = f;
    const a = MAP_VIEWS[f.from];
    const b = MAP_VIEWS[f.to];
    const hold = this.mapHold || still;
    this.mapBg.show(a, b, f.k, hold ? null : MAP_VIEWS[this.rotation.upcoming]);
    this.hemi.color.set(a.sky).lerp(C1.set(b.sky), f.k);
    this.hemi.groundColor.set(a.ground).lerp(C1.set(b.ground), f.k);
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * f.k;
    this.key.color.set(a.sun).lerp(C1.set(b.sun), f.k);
    this.key.intensity = a.sunI + (b.sunI - a.sunI) * f.k;
    this.key.position.set(...a.sunDir).lerp(P.set(...b.sunDir), f.k).normalize().multiplyScalar(20);
    this.mapGround.visible = this.gr.settings.shadows;
  }

  private dtLast = 0;

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
      if (this.mapOn) {
        this.placeMap(cam);
        return;
      }
      // the map backdrop set its picture's FOV and aspect (and may have drawn the champion smaller): the other framings
      // start from the screen's own
      this.hero?.object.scale.setScalar(1);
      cam.fov = this.baseFov;
      const size = this.gr.renderer.getSize(V2);
      cam.aspect = size.x / Math.max(1, size.y);
      if (this.posterOn) {
        this.placePoster(cam);
        return;
      }
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

  /** UX pass 2: the visit's painted scene behind the turntable (the gradient shows until it loads; Home: the poster). */
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
    let bg = screenBg(document.documentElement.dataset.screen, { won, side, forced: this.bgForced }) ?? this.visitBg;
    // Home: the map backdrop (a real spot, no pedestal); the drawn poster when its pictures cannot load
    const home = bg === HOME_MAP && this.poster;
    if (home && this.mapFailed) bg = 'poster';
    const poster = home && this.mapFailed;
    this.setMap(home && !this.mapFailed);
    if (poster !== this.posterOn) {
      this.posterOn = poster;
      this.backdrop.setPoster(poster ? 1 : 0);
      if (poster) this.layoutPoster(true);
      else this.posterOff();
    }
    this.pedestal.group.visible = !home;
    if (bg === this.shownBg) return;
    this.shownBg = bg;
    document.documentElement.dataset.lobbyBg = bg;
    if (bg === 'poster' || bg === HOME_MAP) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const url = lobbyBgUrl(bg, {
      base: import.meta.env.BASE_URL ?? './',
      bufferWidth: (window.innerWidth || 1280) * dpr,
      low: this.gr.settings.tier === 'low',
      aspect: (window.innerWidth || 16) / (window.innerHeight || 9),
    });
    this.backdrop.setSplit(0);
    this.backdrop.setImage(url, reducedMotion());
  }

  leave(): void {
    this.stage.listen(false);
    this.gr.place = null;
    this.gr.active = this.gr.scene;
  }

  update(dt: number): void {
    this.t += dt;
    this.dtLast = dt;
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
      // on the poster the champion turns toward the screen centre (the bolt and the rival) from where it is drawn, so a
      // cat on the left looks right, a dog on the right looks left, and mid swap it turns through the camera; the head
      // leads a little. A smaller sway that never swings it past the camera toward the outer edge.
      const turn = this.posterOn && this.box ? posterTurn(this.box.cx, window.innerWidth || 1, window.innerHeight || 1) : null;
      const facing = turn ? turn.body : 0.3;
      h.object.rotation.y = toCam + facing + Math.sin(this.spin) * (turn ? 0.12 * Math.min(1, Math.abs(turn.body) / 0.3) : 0.22);
      h.ch.anim.lookYaw = turn ? turn.head : 0;
      // on a map spot: turned REL_DEG toward screen right (toward PLAY), as the picture was framed for, a small sway
      if (this.mapOn) h.object.rotation.y = -Math.PI / 2 + THREE.MathUtils.degToRad(REL_DEG) + (reducedMotion() ? 0 : Math.sin(this.spin) * 0.08);
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
    if (this.mapOn) {
      this.updateMap(dt);
      // the pictures failed: the poster takes Home over at once
      if (this.mapFailed) this.syncScene();
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
const V2 = new THREE.Vector2();
const C1 = new THREE.Color();
