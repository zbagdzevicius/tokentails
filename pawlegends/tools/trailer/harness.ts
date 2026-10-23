/**
 * Trailer capture harness (storyboard §8 step 2): a dev-only page (tools/trailer/harness.html, served by `npm run dev`
 * at /tools/trailer/harness.html; never in `build` or `build:client`). It runs the real renderer, `MatchSession`
 * (match view, effects, announcer, HUD, ping wheel) and lobby on a scripted take (take-driver.ts through
 * fake-worker.ts), on a virtual clock (vclock.js), with a director camera that only places the render camera: no
 * input, card, skin or camera state ever reaches the sim.
 *
 * capture.mjs drives it through `window.__trailer`:
 *   await load(shot)       build the scene for a shot (a take seeked to its start, or the lobby)
 *   frame(f, sub, subs)    advance one output frame (or sub-frame for motion blur) and draw it
 *   info()                 the render tick, the hash check and what the frame showed (for the timing probe)
 */
import '../../src/ui/ui.css';
import * as THREE from 'three';
import { createRenderer, isShortLandscape, MOBA_DIST, MOBA_PITCH_DROP, SHORT_LANDSCAPE_ZOOM, type GameRenderer } from '../../src/render/renderer';
import { isoPitch } from '../../src/render/camera/IsoRig.js';
import { ZOOM_DEFAULT } from '../../src/render/camera/zoom';
import { bakePortraits } from '../../src/render/portraits';
import { Lobby } from '../../src/render/lobby';
import { pickScreen } from '../../src/ui/screens';
import { MatchSession, type MatchSetup } from '../../src/app/matchSession';
import { sfx } from '../../src/audio/sfx';
import { parseRoster } from '../../src/meta/roster';
import { setRosterSkins } from '../../src/render/skins/registry';
import { skinIdOf } from '../../src/render/skins/skinStore';
import { DEMO_ROSTER } from '../../src/app/skinDemo';
import { cardLook, type Look } from '../../src/render/cosmetics';
import { lobbyHero, type LobbyHero } from '../../src/render/views/heroView';
import { setOutlineViewport } from '../../src/render/chars/charMaterial';
import type { ViewFrame } from '../../src/render/interp';
import type { Difficulty, HeroId, SimEvent, TrickId } from '../../src/sim/api';
import { FakeWorker } from './fake-worker';
import type { ScriptCmd, TakeSpec } from './take-driver';
import { camAt, follow, GAME_REL, orbit, rampAt, type CamKey, type CamState, type RampKey, type Vec3 } from './director';

interface VClock {
  advance(ms: number, uiMs?: number): void;
  free(on: boolean): void;
  jump(ms: number): void;
  sync(): void;
  seed(n: number): void;
  now(): number;
}
declare global {
  interface Window {
    __vclock: VClock;
    __trailer: unknown;
  }
}

/** What the camera looks at. Ids are snapshot entity ids (heroes = slots 0..5); points are sim mm. */
export type Target =
  | { unit: number; lift?: number }
  | { mid: [number, number]; lift?: number }
  | { point: [number, number]; lift?: number }
  | { p3: [number, number, number] }
  | { proj: number; from?: number; fallback: number; lift?: number }
  | { blend: [Target, Target]; f0: number; f1: number }
  /** The centre of `team`'s minions within `r` m of unit `near` (a wave on the march); the unit when none. */
  | { wave: number; near: number; r?: number; lift?: number }
  /** A hard cut between targets: the last entry whose frame is ≤ f (the camera snaps on the cut). */
  | { cut: [number, Target][] };

export interface LobbyStand {
  hero: HeroId;
  team?: 0 | 1;
  /** A demo card skin by cat id ('demo-ficus'), or null for the hero's own look. */
  card?: string | null;
  /** Position (m) on the lobby floor and facing (deg; 0 = toward the camera); the first stand is the lobby's own. */
  x?: number;
  z?: number;
  face?: number;
  /** Turntable: degrees per output frame added to `face` (from the shot's f0), continuous across separate passes. */
  spin?: number;
  /** The frame where `spin` starts counting (default the shot's f0): passes cut together keep one rotation. */
  spinFrom?: number;
  /** v3.1: the hero (and its pedestal) drawn this much larger (the two dogs fill their half of a line-up). */
  scale?: number;
  /** v3.2 line-up: a share on top of the shot's `fitH` (a stand farther from the lens drawn as tall on screen). */
  fitK?: number;
}

export interface ShotSpec {
  id: string;
  mode: 'match' | 'lobby';
  width: number;
  height: number;
  f0: number;
  f1: number;
  /** Frames rendered (not saved) before f0 at speed 1. */
  preroll?: number;
  take?: (TakeSpec & { look?: string | null; check?: { tick: number; eventHash: string } }) | null;
  /** Render tick at frame f0 (match mode). */
  startTick?: number;
  /**
   * `align`: turn the camera so the line from unit `a` to unit `b` runs down the screen (b nearest the camera), measured
   * on the shot's first frame with both on the map and held; the keys' yaw is added on top (a vertical two-shot).
   */
  cam?: {
    target: Target;
    keys: CamKey[];
    smooth?: number;
    align?: { a: number; b: number };
    /**
     * v3 `base: 'game'`: the game's own camera (its follow, lead and fight pull-back) each frame, the keys applied on
     * top as deltas (director.ts GAME_REL); `target` is where a key's `blend` moves the look point.
     */
    base?: 'game';
    /** v3: the look point offset on the ground (m, [x, z]): the game's 4 m lead toward the enemy core, 0.8 m south. */
    off?: [number, number];
  } | null;
  /**
   * v3 `gameLook`: the frame as the game draws it. No scenery, banner, ground, bolt, minion or structure clean-up, the
   * game's own structure x-ray and shockwaves at full strength: only the camera is the director's.
   */
  gameLook?: boolean;
  /**
   * v3 `uiFade`: [frame, alpha] keys (linear) for the world-anchored UI (name plates, damage numbers, pops): a crane up
   * to the whole map fades the plates out instead of shrinking them into a cloud of labels.
   */
  uiFade?: [number, number][];
  ramp?: RampKey[];
  /** Screen layers kept: 'pops' (CLANK!, numbers, callouts, barks), 'banner' (announcer), 'wheel', 'hud' (everything). */
  layers?: string[];
  /** Selectors hidden on top of `layers` (S19: the announcer banner over the full HUD). */
  hide?: string[];
  /** Ping wheel (frames): opens over the player's hero, highlights Group, closes. */
  wheel?: { open: number; close: number; at?: [number, number] } | null;
  touch?: boolean;
  /**
   * `key`: a flat key colour instead of the lobby's backdrop (the glow disc and, unless `keepStage`, the pedestals
   * hidden), so the edit can lay the hero over another plate (S05: Gabė over the same blurred world as the photo
   * before her; S27: the two stands over the end card's own background).
   */
  lobby?: {
    stands: LobbyStand[];
    swaps?: { f: number; card: string | null }[];
    spin?: boolean;
    key?: string;
    keepStage?: boolean;
    /** v3 line-up: every pedestal scaled to this share of its width, its trim in its stand's team colour. */
    ped?: { scale: number; trim?: [string, string] };
    /** v3.2: every stand's hero scaled to this standing height (m), so cats and dogs read the same size side by side. */
    fitH?: number;
    /**
     * v3.2: the game's real pick screen ("Choose your legend") over the lobby, as a player sees it: `hero` selected
     * first, `swaps` tap another tile on a frame (the detail panel then reads that hero, e.g. "Inspired by Lambo's
     * Token Tails card."); `zoom` a push on the page ([scale, originX, originY] from frame `from` to `to`, eased).
     */
    pick?: { hero: HeroId; side?: number; swaps?: { f: number; hero: HeroId }[]; zoom?: { from: number; to: number; s0: number; s1: number; ox: number; oy: number } };
  };
  /**
   * Render-side clean-up for a director shot (never an input; the game's own layers stay, filtered):
   *   popText    the screen pops and callouts (.pl-pops, .pl-callouts: barks, ultimate names, combo and XP pops)
   *              kept, by exact text; [] = none
   *   dmgRadius  damage numbers / words farther than this (m) from the look point are hidden (stray far numbers)
   *   realFlash  hit flashes decay in output time, so a slow ramp never holds a bleached, ghost-white unit
   *   cullHeroes heroes nearer the camera than this (m) are hidden (a head blocking the lens)
   *   near       the camera's near plane (m): scenery closer than this is not drawn (a banner pole across the lens)
   *   wheelScale the ping wheel drawn this many times larger (a punch-in on that one layer)
   */
  popText?: string[] | null;
  dmgRadius?: number | null;
  realFlash?: boolean;
  cullHeroes?: number | null;
  /** Hide every hero nearer the lens than the look point (less this margin, m): nothing stands between lens and subject. */
  cullFront?: number | null;
  near?: number | null;
  wheelScale?: number | null;
  /**
   * `xray` (v2): a tower or core standing between the lens and the look point fades to 28 % (the game's own x-ray
   * uniform; under a director camera the game's top-down rule is replaced by this line-of-sight one), so base fights
   * are never blocked by the yarn core or the doghouse.
   */
  xray?: boolean;
  /** Hit flashes on heroes last at most this many output frames (realFlash on; default 2): no ghost-white bodies. */
  flashCap?: number;
  /** Peak hit-flash strength on heroes during the cap (0-1; default 0.06 since v3: 0.2 still greyed a whole body on a hold). */
  flashMax?: number;
  /**
   * Minions nearer the lens than the look point (less this margin, m) are not drawn (a wall of creeps in front of the
   * subject); `minionsOff` hides every minion (a hero-only beat).
   */
  cullMinions?: number | null;
  minionsOff?: boolean;
  /**
   * v3 scenery clean-up (render only, director shots): `cullLens` (m) trees whose trunk stands this near the lens, and
   * bushes, rocks and props this near it, are not drawn; `cullLos` (m) trees whose trunk is within this of the
   * lens-to-subject line (in front of the subject) are not drawn, and low scenery above 0.3 m on that line neither.
   * `banners` false (default for director shots) drops the eight base banner poles from the map.
   */
  cullLens?: number | null;
  cullLos?: number | null;
  banners?: boolean;
  /** `xrayMode` 'hide' (default): a tower or core in front of the subject is not drawn; 'fade' keeps the 28 % ghost. */
  xrayMode?: 'hide' | 'fade';
  /** Pudding is not drawn (a framing aid when he would fill the foreground). */
  hidePudding?: boolean;
  /** Afterimages (anim/ghosts.ts) kept; off by default in trailer shots (close-ups stacked them into a blur). */
  ghosts?: boolean;
  /**
   * Shockwave walls drawn at this share of their intensity (default 0.5): at hero height a wall's additive band turned
   * the whole lower frame white. Its radius and timing are untouched.
   */
  shockI?: number;
  /** Projectile bolts drawn (director shots leave them out by default; the trails and hit FX stay). */
  bolts?: boolean;
  /** Debug: scene groups not drawn (by name). */
  hideGroups?: string[];
  /**
   * v4: the playfield ground drawn at this brightness (0-1; default 0.8 in director shots): the pale plaza and paths no
   * longer read as a white field under additive skill FX at hero height. Render only; telegraphs and FX untouched.
   */
  groundK?: number | null;
  /** v4: hero entity ids never drawn (heroes not involved in the beat: a clean silhouette on the hook). */
  hideIds?: number[];
  /** v4: the game's screen pops and callouts drawn this many times larger (legible at trailer speed). */
  popScale?: number | null;
  /**
   * v3.1 `uiOut`: the game's screen text (damage numbers, pops, callouts, the banner) runs in OUTPUT time, not the
   * ramped game time: under a 0.35 slow-motion a number still rises and fades in its normal 1 s instead of hanging
   * frozen for 3 s (trailer review: frozen pops glued to the core).
   */
  uiOut?: boolean;
  /** v3.1: the player's off-screen edge arrow (false on shots whose camera is not on the player). */
  selfEdge?: boolean;
  /** v3.1: name plates show the hero's own name ("Lambo"), not the bots' random pet names ("Marmalade the Lambo"). */
  heroNames?: boolean;
  /** v3.1: frame windows [from, to] where the announcer banner may show (none outside them); null = always. */
  bannerOn?: [number, number][] | null;
  /**
   * v3.2 plate options (Overhead, render only): `selfName` the player's plate reads the hero's name (not "You"),
   * `edgeArrows` false drops the off-screen enemy discs at the frame edge, `tags` false drops the status chips,
   * `minionBars` false drops the minion bars (a crowded base fight reads as heroes and structures).
   */
  /**
   * v3.2 `autoFit` (director shots, 9:16 mostly): the camera pulls back (up to `maxK` times its keyed distance, eased)
   * while a hero's plate or body near the subject would leave the frame's `margin` (share of the frame), and comes
   * back slowly once they all fit. Render only: it reads the plates the game drew on the previous frame.
   */
  autoFit?: { maxK: number; margin?: number } | null;
  selfName?: boolean;
  edgeArrows?: boolean;
  tags?: boolean;
  minionBars?: boolean;
  /**
   * v3.2 `popCull` (default on with gameLook): a damage number or word is dropped when its anchor is outside the
   * frame's 3 % margin or behind the lens, when its unit is gone or more than 3 m from it, or when it has lived
   * longer than `popLife` s of output time (default 0.7): no stray, clipped or hanging numbers.
   */
  popCull?: boolean;
  popLife?: number;
}

/** v3.1 per-frame QC (capture.mjs): what the frame shows, for the overlap, structure, edge-pop and type gates. */
export interface FrameQc {
  /** On-screen drawn heroes: id, team (0 cats), hero, body box with its plate [x0, y0, x1, y1] (viewport fractions). */
  heroes: { id: number; team: number; hero: string; box: [number, number, number, number] }[];
  /** Pairs of drawn on-screen heroes whose bodies interpenetrate (drawn ground distance under OVERLAP_M). */
  overlap: number;
  /** Drawn on-screen heroes standing inside a standing structure's or Pudding's footprint. */
  inStruct: number;
  /** Visible game text elements (pops, callouts, numbers) touching the frame edge (within 1.5 %). */
  edgeText: number;
  /** The banner's text when it is visible this frame ('' when not). */
  banner: string;
  /** v3.2: the overhead plates drawn this frame (viewport fractions) with their label ('' for bars). */
  plates?: { kind: string; id: number; name: string; box: [number, number, number, number]; dy: number }[];
  /** v3.2: visible damage numbers, words, pops and callouts (viewport fractions) with their text. */
  pops?: { text: string; box: [number, number, number, number] }[];
  /** v3.2: drawn towers, cores and Pudding (their screen boxes, viewport fractions) with their kind. */
  structs?: { kind: string; box: [number, number, number, number] }[];
  /** v3.2: hero plates the declutter pass had to lift off another plate (a pile). */
  stacked?: number;
  /** v3.2: the largest share of any drawn hero's body box covered by a nearer hero's body box. */
  hidden?: number;
  /** v3.2: drawn heroes whose body box crosses a standing tower's or core's drawn box low down (in its base). */
  inBase?: number;
  /** Debug: which pairs overlap ("id-id") and which hero stands in which footprint ("id@x,z"). */
  why?: string[];
}

const D0 = MOBA_DIST * ZOOM_DEFAULT;
const vclock = (): VClock => window.__vclock;

const root = document.getElementById('app') as HTMLElement;
let gr: GameRenderer | null = null;
let session: MatchSession | null = null;
let lobby: Lobby | null = null;
const extra: LobbyHero[] = [];
const extraPeds: THREE.Object3D[] = [];
let spec: ShotSpec | null = null;
let clockTick = 0;
let seekTarget: number | null = null;
/** The next render-clock advance lands exactly here (frame f0 on the shot's start tick). */
let pin: number | null = null;
let draw = true;
let camPos: Vec3 | null = null;
let camLook: Vec3 | null = null;
let projLock = -1;
let lastFrame = -1e9;
let lastSeg = -1;
let hadGoal = false;
let wheelOpen = false;
/** The `align` yaw (deg) once measured. */
let alignYaw: number | null = null;
/** The lobby frame being drawn (stands with `spin` turn with it). */
let lobbyF = 0;
const eventLog: { tick: number; type: string; src?: number; dst?: number; id?: number }[] = [];
let style: HTMLStyleElement | null = null;
/** v3.2 the pick screen mounted for a `lobby.pick` shot. */
let pickEl: HTMLElement | null = null;

/** The render camera's state this frame (exposed for the probe). */
let camNow: CamState | null = null;

function layersCss(keep: readonly string[]): string {
  if (keep.includes('hud')) return '';
  const allow = ['#game-canvas'];
  // the game's full-screen flash (.pl-flash) is left out: the edit lays its own capped blooms
  if (keep.includes('pops')) allow.push('.pl-pops', '.pl-callouts', '.fx-dmg-layer');
  if (keep.includes('banner')) allow.push('.pl-banner');
  if (keep.includes('wheel')) allow.push('.pl-pingwheel');
  if (keep.includes('plates')) allow.push('.pl-overhead');
  const not = allow.map((s) => `:not(${s})`).join('');
  return `.pl-match > *${not}, body > *${not}:not(#app):not(script):not(style), #app > *${not}:not(.pl-match) { display: none !important; }
  ${keep.includes('pops') ? '' : '.fx-dmg-layer { display: none !important; }'}`;
}

function setLayers(keep: readonly string[], hide: readonly string[] = []): void {
  if (!style) {
    style = document.createElement('style');
    style.id = 'trailer-layers';
    document.head.appendChild(style);
  }
  const ps = (spec?.popScale && spec.popScale !== 1 ? `.pl-pops > *, .pl-callouts > * { scale: ${spec.popScale}; }` : '')
    + (spec?.wheelScale && spec.wheelScale !== 1 ? `\n.pl-pingwheel { scale: ${spec.wheelScale} !important; transform-origin: var(--x, 50%) var(--y, 50%) !important; }` : '');
  style.textContent = `${layersCss(keep)}\n${hide.map((h) => `${h} { display: none !important; }`).join('\n')}\n${ps}\n* { cursor: none !important; }\n.fx-dmg[data-cull="1"] { visibility: hidden !important; }`;
}

function ensureRenderer(): GameRenderer {
  if (gr) return gr;
  gr = createRenderer(root, 'high');
  bakePortraits(gr);
  gr.resize();
  return gr;
}

/** Demo card skins (app/skinDemo.ts roster), registered locally; cosmetic only. */
function registerDemoSkins(): void {
  setRosterSkins(parseRoster(DEMO_ROSTER), {});
}
const lookOf = (card: string | null | undefined): Look | null => (card ? cardLook(skinIdOf(card)) : null);

function sun(g: GameRenderer): THREE.DirectionalLight | null {
  let found: THREE.DirectionalLight | null = null;
  g.scene.traverse((o) => {
    if (!found && (o as THREE.DirectionalLight).isDirectionalLight) found = o as THREE.DirectionalLight;
  });
  return found;
}

function entityPos(frame: ViewFrame | null, id: number, lift: number): Vec3 | null {
  const e = frame?.byId.get(id);
  if (!e) return null;
  return { x: e.fx / 1000, y: lift, z: -e.fy / 1000 };
}

/** The cut segment the target is in (camera smoothing restarts on a new one). */
function segmentOf(t: Target, f: number): number {
  if (!('cut' in t)) return 0;
  let k = 0;
  t.cut.forEach(([at], i) => {
    if (at <= f) k = i;
  });
  return k;
}

function resolve(t: Target, f: number, frame: ViewFrame | null): Vec3 | null {
  if ('cut' in t) return resolve(t.cut[segmentOf(t, f)][1], f, frame);
  if ('blend' in t) {
    const a = resolve(t.blend[0], f, frame);
    const b = resolve(t.blend[1], f, frame);
    if (!a || !b) return a ?? b;
    const u = Math.max(0, Math.min(1, (f - t.f0) / Math.max(1, t.f1 - t.f0)));
    const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  }
  if ('p3' in t) return { x: t.p3[0], y: t.p3[1], z: t.p3[2] };
  if ('wave' in t) {
    const c = entityPos(frame, t.near, t.lift ?? 1);
    if (!c || !frame) return c;
    const r = t.r ?? 12;
    let n = 0;
    let x = 0;
    let z = 0;
    for (const e of frame.entities) {
      if (e.kind !== 'minion' || e.team !== t.wave) continue;
      const ex = e.fx / 1000;
      const ez = -e.fy / 1000;
      if (Math.hypot(ex - c.x, ez - c.z) > r) continue;
      x += ex;
      z += ez;
      n++;
    }
    return n ? { x: x / n, y: t.lift ?? 1, z: z / n } : c;
  }
  if ('point' in t) return { x: t.point[0] / 1000, y: t.lift ?? 1, z: -t.point[1] / 1000 };
  if ('unit' in t) return entityPos(frame, t.unit, t.lift ?? 1);
  if ('mid' in t) {
    const a = entityPos(frame, t.mid[0], t.lift ?? 1);
    const b = entityPos(frame, t.mid[1], t.lift ?? 1);
    if (!a || !b) return a ?? b;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  }
  // a projectile of `proj` (the first one that appears from frame `from` on), else the fallback unit
  if (frame && f >= (t.from ?? -1e9)) {
    const list = frame.projectiles.filter((p) => p.owner === t.proj);
    let p = list.find((q) => q.index === projLock);
    if (!p && projLock < 0 && list.length) {
      p = list[list.length - 1];
      projLock = p.index;
    }
    if (p) return { x: p.fx / 1000, y: t.lift ?? 1.4, z: -p.fy / 1000 };
  }
  return entityPos(frame, t.fallback, t.lift ?? 1);
}

/** Place the render camera for frame `f` (director shots); returns false for the gameplay camera. */
function direct(f: number, dtReal: number): boolean {
  const s = spec;
  const g = gr;
  if (!s?.cam || !g) {
    if (g) g.place = s?.mode === 'lobby' ? g.place : null;
    return false;
  }
  const frame = session ? session.view.frame : null;
  if (s.cam.base === 'game') {
    // the game places its own focus and zoom inside session.frame(); installPlace reads them as the frame is drawn
    gameRel = camAt(s.cam.keys, f, GAME_REL);
    gameGoal = s.cam.target ? resolve(s.cam.target, f, frame) : null;
    camNow = gameRel;
    return true;
  }
  gameRel = null;
  const found = resolve(s.cam.target, f, frame);
  // nothing to look at yet (a unit not on the map): hold; when it appears, cut to it instead of panning across the map
  const goal = found ?? camLook ?? { x: 50, y: 1, z: -30 };
  const appeared = !!found && !hadGoal;
  hadGoal = !!found;
  const c = { ...camAt(s.cam.keys, f) };
  if (s.autoFit && session && dtReal > 0) {
    // the plates the game drew last frame (CSS px): how far the farthest one sits from the centre
    const ob = (session as unknown as { overhead: { boxes: { kind: string; x0: number; y0: number; x1: number; y1: number }[] | null } }).overhead.boxes ?? [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const m = s.autoFit.margin ?? 0.04;
    let need = 1;
    for (const b of ob) {
      if (b.kind !== 'hero') continue;
      const ex = Math.max(0.5 - b.x0 / W, b.x1 / W - 0.5);
      const ey = Math.max(0.5 - b.y0 / H, b.y1 / H - 0.5);
      // a plate far outside (a hero walking in from off screen) does not pull the camera across the map
      if (ex > 0.9 || ey > 0.9) continue;
      need = Math.max(need, ex / (0.5 - m), ey / (0.5 - m));
    }
    const want = Math.min(s.autoFit.maxK, Math.max(1, fitK * need));
    fitK += (want - fitK) * (want > fitK ? 0.2 : 0.02);
  }
  c.dist *= fitK;
  if (s.cam.align && alignYaw === null && frame) {
    const a = entityPos(frame, s.cam.align.a, 0);
    const b = entityPos(frame, s.cam.align.b, 0);
    if (a && b) alignYaw = (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI;
  }
  if (s.cam.align && alignYaw !== null) c.yaw += alignYaw;
  camNow = c;
  const off = s.cam.off ?? [0, 0];
  const look = { x: goal.x + off[0], y: goal.y + c.lift - 1, z: goal.z + off[1] };
  // a new shot, a cut or a jump in the frame count snaps; inside a shot the look point follows smoothly
  const seg = segmentOf(s.cam.target, f);
  const cont = camLook && !appeared && seg === lastSeg && (f === lastFrame || f === lastFrame + 1);
  camLook = cont && camLook ? follow(camLook, look, s.cam.smooth ?? 0.06, dtReal) : look;
  lastSeg = seg;
  if (f !== lastFrame) lastFrame = f;
  camPos = orbit(camLook, c.dist * D0, c.pitch, c.yaw);
  return true;
}

/** v3.2 autoFit: the current pull-back factor. */
let fitK = 1;
/** v3 game-relative camera: this frame's keys (deltas on the game's camera) and the blend target. */
let gameRel: CamState | null = null;
let gameGoal: Vec3 | null = null;
/** The game's own focus before the frame was drawn (restored after it: the game's follow damps from it). */
const savedFocus = new THREE.Vector3();
let focusSaved = false;

/** The game's own camera this frame (renderer.ts render()), with the v3 keys on top. */
function placeGameRel(g: GameRenderer): void {
  const c = gameRel as CamState;
  const w = Math.max(1, g.renderer.domElement.clientWidth || window.innerWidth);
  const h = Math.max(1, g.renderer.domElement.clientHeight || window.innerHeight);
  const d0 = MOBA_DIST * g.zoom * (isShortLandscape(w, h) ? SHORT_LANDSCAPE_ZOOM : 1);
  const pitch0 = (Math.max(0.8, isoPitch(d0) - MOBA_PITCH_DROP) * 180) / Math.PI;
  const k = Math.max(0, Math.min(1, c.blend ?? 0));
  const gx = g.focus.x;
  const gz = g.focus.z;
  const look = gameGoal && k > 0 ? { x: gx + (gameGoal.x - gx) * k, y: 0, z: gz + (gameGoal.z - gz) * k } : { x: gx, y: 0, z: gz };
  camLook = look;
  camNow = { ...c, pitch: pitch0 + c.pitch };
  camPos = orbit(look, d0 * c.dist, pitch0 + c.pitch, c.yaw);
}

function installPlace(g: GameRenderer): void {
  const light = sun(g);
  g.place = (cam) => {
    if (gameRel && spec?.cam?.base === 'game') {
      savedFocus.copy(g.focus);
      focusSaved = true;
      placeGameRel(g);
    }
    if (!camPos || !camLook || !camNow) return;
    cam.fov = camNow.fov;
    cam.position.set(camPos.x, camPos.y, camPos.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(camLook.x, camLook.y, camLook.z);
    if (session) {
      // shadows and LOD follow the look point; the game's camera shake (juice) still applies
      g.focus.set(camLook.x, 0, camLook.z);
      if (light) {
        light.target.position.set(camLook.x, 0, camLook.z);
        light.position.set(camLook.x - 20, 40, camLook.z + 25);
        light.target.updateMatrixWorld();
      }
      g.preRender?.(cam);
    }
  };
}

/** Output-frame dt of the frame being drawn (s): the render-time clean-up decays flashes by it. */
let curDtReal = 1 / 60;

interface RigLike { ch: { object: THREE.Object3D; material: { userData: { u: { uFlashK: { value: number } } } } }; flash: number; wasDead: boolean; visible: boolean }
interface StructLike { flash: number; kind: string; x: number; z: number; alive: boolean; dieT: number; height: number; material: { transparent: boolean; depthWrite: boolean; needsUpdate: boolean }; rig: { uFlashK: { value: number }; uOpacity: { value: number } } }

/** The output frame being drawn (sub-frames share it): the flash cap counts output frames. */
let curF = 0;
/** Per hero rig: the flash level after the last clean-up and the output frame its current flash began. */
const flashState = new Map<object, { last: number; start: number }>();
/** Director x-ray opacity per structure (smoothed in output time). */
const xrayOp = new Map<object, number>();

/** The hero slots the camera is framing (never culled). */
function subjects(t: Target | undefined, out: Set<number> = new Set()): Set<number> {
  if (!t) return out;
  if ('unit' in t) out.add(t.unit);
  else if ('mid' in t) t.mid.forEach((u) => out.add(u));
  else if ('blend' in t) t.blend.forEach((x) => subjects(x, out));
  else if ('cut' in t) t.cut.forEach(([, x]) => subjects(x, out));
  return out;
}

/** ShotSpec.uiFade at frame f (1 without keys). */
function uiAlpha(keys: readonly [number, number][] | undefined, f: number): number {
  if (!keys?.length) return 1;
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (f <= keys[i][0]) {
      const [f0, a0] = keys[i - 1];
      const [f1, a1] = keys[i];
      return a0 + (a1 - a0) * ((f - f0) / Math.max(1, f1 - f0));
    }
  }
  return keys[keys.length - 1][1];
}
let uiStyle: HTMLStyleElement | null = null;

/** Render-side clean-up just before the frame is drawn (see ShotSpec.popText ... near). */
function cleanUp(g: GameRenderer): void {
  const s = spec;
  const ses = session;
  if (!s || !ses || s.mode !== 'match') return;
  if (s.uiFade?.length) {
    if (!uiStyle) {
      uiStyle = document.createElement('style');
      uiStyle.id = 'trailer-uifade';
      document.head.appendChild(uiStyle);
    }
    const a = Math.max(0, Math.min(1, uiAlpha(s.uiFade, curF)));
    uiStyle.textContent = a >= 0.999 ? '' : `.pl-overhead, .fx-dmg-layer, .pl-pops, .pl-callouts { opacity: ${a.toFixed(3)} !important; }${a <= 0.001 ? ' .pl-overhead, .fx-dmg-layer, .pl-pops, .pl-callouts { visibility: hidden !important; }' : ''}`;
  } else if (uiStyle) uiStyle.textContent = '';
  const view = ses.view as unknown as { heroes: { rigs: Map<number, RigLike> }; structures: { items: Map<number, StructLike> }; effects: { numbers: { pool: { el: HTMLElement | null; pos: THREE.Vector3; active: boolean }[] } } };
  const oh = (ses as unknown as { overhead: { selfEdge: boolean; names: readonly string[]; selfName: boolean; edgeArrows: boolean; statusChips: boolean; minionBars: boolean; boxes: unknown[] | null } }).overhead;
  oh.selfEdge = s.selfEdge !== false;
  if (s.heroNames && oh.names.length) oh.names = [];
  if (s.bannerOn !== undefined && s.bannerOn !== null) {
    const on = s.bannerOn.some(([a, b]) => curF >= a && curF <= b);
    const ban = document.querySelector<HTMLElement>('.pl-banner');
    if (ban) ban.style.visibility = on ? '' : 'hidden';
  }
  if (s.realFlash) {
    const cap = s.flashCap ?? 2;
    for (const r of view.heroes.rigs.values()) {
      const fs = flashState.get(r) ?? { last: 0, start: -1e9 };
      // a new hit raised the flash since the last clean-up: it starts counting on this output frame
      if (r.flash > fs.last + 1e-3) fs.start = curF;
      r.flash = Math.max(0, r.flash - curDtReal * 5);
      fs.last = r.flash;
      flashState.set(r, fs);
      const u = r.ch.material.userData.u.uFlashK;
      if (!r.wasDead) u.value = curF - fs.start >= cap ? 0 : Math.min(u.value, Math.min(s.flashMax ?? 0.2, r.flash * 0.5));
    }
    for (const st of view.structures.items.values()) {
      st.flash = Math.max(0, st.flash - curDtReal * 5);
      // a structure under steady fire would hold a pale, washed-out flash: capped at a light tint
      st.rig.uFlashK.value = Math.min(st.rig.uFlashK.value, st.flash * 0.7, 0.12);
    }
  }
  oh.selfName = !!s.selfName;
  oh.edgeArrows = s.edgeArrows !== false;
  oh.statusChips = s.tags !== false;
  oh.minionBars = s.minionBars !== false;
  if (!oh.boxes) oh.boxes = [];
  if (s.gameLook) {
    // v3: a standing tower or core is always drawn solid (no see-through ghost under a hero or a flop); a falling one
    // keeps the view's own fade. v3.2: no hit tint on them either (the realFlash cap snapped it between 0 and 0.12, and
    // on the navy doghouse that read as a grey ghost box flickering on and off)
    for (const st of view.structures.items.values()) {
      if ((st.kind !== 'tower' && st.kind !== 'core') || !st.alive || st.dieT >= 0) continue;
      st.rig.uFlashK.value = 0;
      st.rig.uOpacity.value = 1;
      if (st.material.transparent) {
        st.material.transparent = false;
        st.material.depthWrite = true;
        st.material.needsUpdate = true;
      }
    }
  }
    if (s.xray && camPos && camLook) {
    // line of sight: a structure whose footprint (radius r) the lens-to-look segment passes through, nearer than the look point
    const dx = camLook.x - camPos.x;
    const dz = camLook.z - camPos.z;
    const L2 = dx * dx + dz * dz || 1;
    for (const st of view.structures.items.values()) {
      if (st.kind !== 'tower' && st.kind !== 'core' && st.kind !== 'fountain') continue;
      const r = st.kind === 'core' ? 3.4 : st.kind === 'fountain' ? 4 : 2.2;
      const u = ((st.x - camPos.x) * dx + (st.z - camPos.z) * dz) / L2;
      const px = camPos.x + dx * u - st.x;
      const pz = camPos.z + dz * u - st.z;
      const along = u * Math.sqrt(L2);
      // between the lens and the look point, or beside the look point on the lens side (a doghouse next to the brawl)
      const hide = (s.xrayMode ?? 'hide') === 'hide';
      // hide mode: only a structure wholly in front of the subject (never the subject structure itself)
      // hide mode: a structure in the frame's width whose centre is not behind the subject's plane (a backdrop stays)
      const sd = Math.hypot(st.x - camPos.x, st.z - camPos.z);
      const ang = Math.acos(Math.max(-1, Math.min(1, ((st.x - camPos.x) * dx + (st.z - camPos.z) * dz) / (Math.max(sd, 1e-3) * Math.sqrt(L2)))));
      const halfH = Math.atan(Math.tan(((camNow?.fov ?? 40) * Math.PI) / 360) * (window.innerWidth / Math.max(1, window.innerHeight)));
      const blocks = hide
        ? st.alive && st.dieT < 0 && (sd * Math.cos(ang) < Math.sqrt(L2) + r * 0.5 || sd - r < 0.7 * Math.sqrt(L2)) && (ang < halfH + Math.atan(r / Math.max(sd, 0.5)) + 0.05 || sd < r + 2.5)
        : st.alive && st.dieT < 0 && u > 0 && along < Math.sqrt(L2) + 1.5 && Math.hypot(px, pz) < r + 2.2;
      if (hide) {
        // a fallen structure keeps the view's own visibility (hidden, or mid-fall); only standing ones are culled
        if (st.alive && st.dieT < 0) (st as unknown as { mesh: THREE.Object3D }).mesh.visible = !blocks;
        continue;
      }
      const want = blocks ? 0.28 : 1;
      const prev = xrayOp.get(st) ?? want;
      const k = Math.min(1, curDtReal * 14);
      const op = Math.abs(want - prev) < 0.01 ? want : prev + (want - prev) * k;
      xrayOp.set(st, op);
      st.rig.uOpacity.value = op;
      const transparent = op < 0.999;
      if (st.material.transparent !== transparent) {
        st.material.transparent = transparent;
        st.material.depthWrite = !transparent;
        st.material.needsUpdate = true;
      }
    }
  }
  if (s.hideIds?.length) for (const [id, r] of view.heroes.rigs) if (s.hideIds.includes(id)) r.ch.object.visible = false;
  for (const name of s.hideGroups ?? []) {
    const o = g.scene.getObjectByName(name);
    if (o) o.visible = false;
  }
  if (s.hidePudding) {
    for (const st of view.structures.items.values()) if (st.kind === 'pudding') (st as unknown as { mesh: THREE.Object3D }).mesh.visible = false;
  }
  if (camPos && camLook && scenery.length) {
    for (const u of scenery) {
      u.uTrCam.value.set(camPos.x, camPos.y, camPos.z);
      u.uTrLook.value.set(camLook.x, camLook.y, camLook.z);
      u.uTrLens.value = s.cullLens ?? 3.5;
      u.uTrLos.value = s.cullLos ?? 2.2;
      u.uTrOn.value = s.cam ? 1 : 0;
      u.uTrHalf.value = Math.atan(Math.tan(((camNow?.fov ?? 40) * Math.PI) / 360) * (window.innerWidth / Math.max(1, window.innerHeight)));
    }
  }
  if (s.cam && !s.gameLook && camPos && camLook) {
    // the bolts are unlit ellipsoids: a tower shot crossing a hero-height frame read as a flat pink blob, so director
    // shots leave them out unless the shot is about them (`bolts`: the tower dive, the Moonshot ride), near-lens culled
    const bolts = (view as unknown as { projectiles: { bolts: THREE.InstancedMesh } }).projectiles.bolts;
    bolts.visible = !!s.bolts;
    if (s.bolts) cullBolts(bolts);
  }
  const keep = subjects(s.cam?.target);
  if ((s.minionsOff || s.cullMinions != null) && camPos && camLook) cullMinions(view as unknown as { minions: MinionsLike }, s);
  if (s.cullHeroes && camPos) {
    for (const [id, r] of view.heroes.rigs) {
      const o = r.ch.object;
      if (!r.visible || keep.has(id)) continue;
      const d = Math.hypot(o.position.x - camPos.x, o.position.z - camPos.z);
      o.visible = d >= s.cullHeroes;
    }
  }
  if (s.cullFront != null && camPos && camLook) {
    const dLook = Math.hypot(camLook.x - camPos.x, camLook.z - camPos.z);
    for (const [id, r] of view.heroes.rigs) {
      const o = r.ch.object;
      if (!r.visible || keep.has(id)) continue;
      const d = Math.hypot(o.position.x - camPos.x, o.position.z - camPos.z);
      if (d < dLook - s.cullFront) o.visible = false;
    }
  }
  if ((s.dmgRadius || s.popText) && camLook) {
    // far numbers hidden (dmgRadius); a damage-layer WORD (CLANK!, Snip!) shows only when popText lists it
    const words = s.popText ? new Set(s.popText) : null;
    for (const n of view.effects.numbers.pool) {
      if (!n.el) continue;
      const far = !!s.dmgRadius && n.active && Math.hypot(n.pos.x - camLook.x, n.pos.z - camLook.z) > s.dmgRadius;
      const t = (n.el.textContent ?? '').trim();
      const word = !!words && t !== '' && !/^[+\-]?[\d.,]+$/.test(t) && !words.has(t);
      n.el.style.visibility = far || word ? 'hidden' : '';
    }
  }
  if ((s.popCull ?? s.gameLook) && gr) {
    const cam = gr.camera;
    const fr = ses.view.frame;
    const life = s.popLife ?? 0.7;
    const pool = view.effects.numbers.pool as unknown as { el: HTMLElement | null; pos: THREE.Vector3; active: boolean; t: number; key: unknown }[];
    for (const n of pool) {
      if (!n.el || !n.active) continue;
      _pp.copy(n.pos).project(cam);
      const sx = _pp.x * 0.5 + 0.5;
      const sy = -_pp.y * 0.5 + 0.5;
      let bad = _pp.z > 1 || _pp.z < -1 || sx < 0.03 || sx > 0.97 || sy < 0.03 || sy > 0.97 || n.t > life;
      if (!bad && fr) {
        // the unit it belongs to (key = entity id) must still be drawn within 3 m; a word without a key needs any unit
        const e = typeof n.key === 'number' ? fr.byId.get(n.key) : null;
        if (typeof n.key === 'number') bad = !e || e.state === 'dead' || Math.hypot(e.fx / 1000 - n.pos.x, -e.fy / 1000 - n.pos.z) > 3;
        else bad = !fr.entities.some((u) => u.state !== 'dead' && (u.kind === 'hero' || u.kind === 'minion' || u.kind === 'tower' || u.kind === 'core' || u.kind === 'pudding') && Math.hypot(u.fx / 1000 - n.pos.x, -u.fy / 1000 - n.pos.z) < 3);
      }
      const v = bad ? '1' : '';
      if (n.el.dataset.cull !== v) n.el.dataset.cull = v;
    }
  }
  if (s.popText) {
    const keep = new Set(s.popText);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.pl-pops > *, .pl-callouts > *'))) el.style.visibility = keep.has((el.textContent ?? '').trim()) ? '' : 'hidden';
  }
  if (s.near && s.cam) {
    const cam = g.camera as THREE.PerspectiveCamera;
    if (cam.near !== s.near) {
      cam.near = s.near;
      cam.updateProjectionMatrix();
    }
  }
}

/**
 * Bolts (tower and hero shots: unlit ellipsoids) nearer the lens than the subject by more than 2 m are not drawn: one
 * passing by the lens filled a corner of the frame with a flat pink blob. A bolt at the subject (the Moonshot ride)
 * stays.
 */
function cullBolts(m: THREE.InstancedMesh): void {
  if (!camPos || !camLook || !m) return;
  const lim = Math.hypot(camLook.x - camPos.x, camLook.y - camPos.y, camLook.z - camPos.z) - 2;
  let dirty = false;
  for (let i = 0; i < m.count; i++) {
    m.getMatrixAt(i, _mm);
    _mp.setFromMatrixPosition(_mm);
    if (Math.hypot(_mp.x - camPos.x, _mp.y - camPos.y, _mp.z - camPos.z) < lim) {
      m.setMatrixAt(i, _zero);
      dirty = true;
    }
  }
  if (dirty) m.instanceMatrix.needsUpdate = true;
}

interface MinionsLike { group: THREE.Object3D; meshes: THREE.InstancedMesh[] }
const _mm = new THREE.Matrix4();
const _mp = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/** Minion clean-up (ShotSpec.cullMinions / minionsOff): instances in front of the subject collapse to zero scale. */
function cullMinions(view: { minions: MinionsLike }, s: ShotSpec): void {
  const m = view.minions;
  if (s.minionsOff) {
    m.group.visible = false;
    return;
  }
  if (!camPos || !camLook) return;
  const dLook = Math.hypot(camLook.x - camPos.x, camLook.z - camPos.z);
  const lim = dLook - (s.cullMinions ?? 0);
  for (const mesh of m.meshes) {
    let dirty = false;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _mm);
      _mp.setFromMatrixPosition(_mm);
      if (Math.hypot(_mp.x - camPos.x, _mp.z - camPos.z) < lim) {
        mesh.setMatrixAt(i, _zero);
        dirty = true;
      }
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }
}

interface SceneryU { uTrCam: { value: THREE.Vector3 }; uTrLook: { value: THREE.Vector3 }; uTrLens: { value: number }; uTrLos: { value: number }; uTrOn: { value: number }; uTrHalf: { value: number } }
/** The scenery cull uniforms of this match's map (one set per patched material). */
const scenery: SceneryU[] = [];

/** Vertices per forest tree (mapView: a 6-sided trunk cylinder and two icosahedra, non-indexed, merged in order). */
function treeVerts(): number {
  return new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed().attributes.position.count + 2 * new THREE.IcosahedronGeometry(1, 0).attributes.position.count;
}

/**
 * Render-only scenery clean-up for director shots (ShotSpec.cullLens / cullLos / banners): the forest gets a per-vertex
 * tree root so a whole tree drops out (never half a tree); the props, hedge and bushes are cut per fragment.
 */
function patchScenery(g: GameRenderer, s: ShotSpec): void {
  scenery.length = 0;
  if (!s.cam || s.gameLook) return;
  const gk = s.groundK ?? 0.8;
  const ground = g.scene.getObjectByName('ground') as THREE.Mesh | undefined;
  if (ground?.isMesh) (ground.material as THREE.MeshLambertMaterial).color.setScalar(gk);
  // the base banners are their own meshes (one per side style): dropped unless the shot keeps them
  for (const name of ['banners', 'banners-swapped']) g.scene.getObjectByName(name)?.scale.setScalar(s.banners === true ? 1 : 0);
  const tv = treeVerts();
  for (const name of ['forest', 'props', 'hedge', 'bushes']) {
    const m = g.scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!m || !m.isMesh) continue;
    const geo = m.geometry;
    const pos = geo.attributes.position;
    if (name === 'props' && s.banners !== true && !geo.userData.trailerBanners) {
      // the base banners are the only props above 1 m: their poles (to the ground) and flags drop out
      const poles: [number, number][] = [];
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 4.15) poles.push([pos.getX(i), pos.getZ(i)]);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        if (pos.getY(i) > 1.0 || poles.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.3)) pos.setXYZ(i, x, -40, z);
      }
      pos.needsUpdate = true;
      geo.userData.trailerBanners = true;
      geo.computeBoundingSphere();
    }
    const tree = name === 'forest' && pos.count % tv === 0;
    if (tree && !geo.attributes.aTrRoot) {
      const root = new Float32Array(pos.count * 2);
      // the trunk is the first cylinder of each tree: its mean x/z is the tree's root
      const trunk = new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed().attributes.position.count;
      for (let t = 0; t < pos.count; t += tv) {
        let x = 0;
        let z = 0;
        for (let i = t; i < t + trunk; i++) {
          x += pos.getX(i);
          z += pos.getZ(i);
        }
        x /= trunk;
        z /= trunk;
        for (let i = t; i < t + tv; i++) {
          root[i * 2] = x;
          root[i * 2 + 1] = z;
        }
      }
      geo.setAttribute('aTrRoot', new THREE.BufferAttribute(root, 2));
    }
    const base = m.material as THREE.MeshLambertMaterial;
    const mat = (m.userData.trailerMat as THREE.MeshLambertMaterial | undefined) ?? base.clone();
    m.userData.trailerMat = mat;
    const u: SceneryU = { uTrCam: { value: new THREE.Vector3() }, uTrLook: { value: new THREE.Vector3() }, uTrLens: { value: 3.5 }, uTrLos: { value: 2.2 }, uTrOn: { value: 1 }, uTrHalf: { value: 0.6 } };
    scenery.push(u);
    const cull = /* glsl */ `
      // a tree (root p) in the frame and nearer the lens than the subject by more than 3 m
      float trFront(vec2 p, float m) {
        if (uTrOn < 0.5) return 0.0;
        vec2 a = uTrCam.xz;
        vec2 v = uTrLook.xz - a;
        vec2 w = p - a;
        float L = max(length(v), 1e-3);
        float d = length(w);
        // nearer the lens than the subject by more than 3 m and in front of the lens (what is drawn is in frame)
        return d < L - m && dot(w, v) > 0.0 ? 1.0 : 0.0;
      }
      float trCull(vec2 p, float y, float lens, float los) {
        if (uTrOn < 0.5) return 0.0;
        vec2 a = uTrCam.xz;
        vec2 b = uTrLook.xz;
        vec2 ab = b - a;
        float L = max(length(ab), 1e-3);
        float t = dot(p - a, ab) / (L * L);
        float d = length(p - (a + ab * clamp(t, 0.0, 1.0)));
        if (length(p - a) < lens) return 1.0;
        if (t > 0.0 && t * L < L - 2.0 && d < los && y > 0.3) return 1.0;
        return 0.0;
      }`;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      const head = `uniform vec3 uTrCam;\nuniform vec3 uTrLook;\nuniform float uTrLens;\nuniform float uTrLos;\nuniform float uTrOn;\nuniform float uTrHalf;\n${cull}\n`;
      if (tree) {
        sh.vertexShader = `attribute vec2 aTrRoot;\n${head}${sh.vertexShader}`.replace(
          '#include <project_vertex>',
          '#include <project_vertex>\n  if (trCull(aTrRoot, 1.0, uTrLens, uTrLos) > 0.5 || trFront(aTrRoot, 3.0) > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);',
        );
      } else {
        sh.vertexShader = `varying vec3 vTrW;\n${sh.vertexShader}`.replace('#include <project_vertex>', '#include <project_vertex>\n  vTrW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = `varying vec3 vTrW;\n${head}${sh.fragmentShader}`.replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n  if (trCull(vTrW.xz, vTrW.y, uTrLens * 0.8, uTrLos) > 0.5 || (vTrW.y > 0.06 && trFront(vTrW.xz, 1.5) > 0.5)) discard;',
        );
      }
    };
    mat.customProgramCacheKey = () => `trailer-${name}-${tree ? 't' : 'f'}`;
    mat.needsUpdate = true;
    m.material = mat;
  }
}

/** Shockwave walls at `k` of their intensity (ShotSpec.shockI): the view's pool, patched per session. */
function dimShock(k: number): void {
  const sh = (session as unknown as { view: { shock: { start(p: unknown, o?: Record<string, unknown>): unknown } } } | null)?.view.shock;
  if (!sh || k === 1) return;
  const start = sh.start.bind(sh);
  sh.start = (p, o = {}) => start(p, { ...o, intensity: ((o.intensity as number | undefined) ?? 1.6) * k });
}

/** Afterimages off (ShotSpec.ghosts), by the ghosts' own tier switch. */
function setGhosts(on: boolean): void {
  const gh = (session as unknown as { view: { ghosts: { setTier(t: string, r: boolean): void } } } | null)?.view.ghosts;
  gh?.setTier(on ? 'high' : 'low', !on);
}

function wrapRender(g: GameRenderer): void {
  const orig = g.render.bind(g);
  g.render = () => {
    if (!draw) return;
    cleanUp(g);
    setOutlineViewport(g.renderer.domElement.width, g.renderer.domElement.height);
    orig();
    // v3 game-relative camera: the game's follow keeps its own focus (the look point was only borrowed for the draw)
    if (focusSaved) {
      g.focus.copy(savedFocus);
      focusSaved = false;
    }
  };
}

/** Fredoka, as the game installs it (app/app.ts installFont): the Latin face and the one with the combining dot. */
let fonts: Promise<unknown> | null = null;
function installFonts(): Promise<unknown> {
  if (fonts) return fonts;
  const base = import.meta.env.BASE_URL ?? '/';
  const faces = [
    new FontFace('Fredoka', `url("${base}assets/fonts/Fredoka-Latin.woff2") format("woff2")`, { weight: '300 700' }),
    new FontFace('Fredoka', `url("${base}assets/fonts/Fredoka-Ext.woff2") format("woff2")`, { weight: '300 700', unicodeRange: 'U+0000-024F, U+0300-036F, U+1E00-1EFF' }),
  ];
  fonts = Promise.all(faces.map((f) => f.load().then((x) => document.fonts.add(x)).catch(() => undefined)));
  return fonts;
}

async function load(s: ShotSpec): Promise<{ ok: true; tick: number }> {
  spec = s;
  setLayers(s.layers ?? ['pops'], s.hide ?? []);
  const g = ensureRenderer();
  g.resize();
  sfx.setMuted(true);
  registerDemoSkins();
  await installFonts();
  await document.fonts.ready;
  vclock().free(false);
  vclock().jump(10_000_000);
  vclock().seed(0x5eed ^ s.f0);
  camPos = camLook = null;
  gameRel = null;
  gameGoal = null;
  focusSaved = false;
  alignYaw = null;
  fitK = 1;
  lobbyF = s.f0;
  projLock = -1;
  lastFrame = -1e9;
  eventLog.length = 0;
  flashState.clear();
  xrayOp.clear();
  lastPos.clear();
  curF = s.f0;
  if (s.mode === 'lobby') {
    const lb = new Lobby(g);
    lobby = lb;
    lb.enter();
    const [first, ...rest] = s.lobby?.stands ?? [{ hero: 'clem' as HeroId }];
    lb.setHero(first.hero, first.team ?? 0, lookOf(first.card));
    for (const st of rest) {
      const h = lobbyHero(st.hero, st.team ?? 0, lookOf(st.card));
      h.object.position.set(st.x ?? 0, 0, st.z ?? 0);
      if (st.scale) h.object.scale.multiplyScalar(st.scale);
      lb.scene.add(h.object);
      extra.push(h);
      // a pedestal of its own (the lobby's pedestal and trim, cloned)
      // v3 (`ped`): only the lobby's own pedestal and trim are cloned (not the clones already added for earlier stands)
      const ped = lb.scene.children.filter((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).geometry instanceof THREE.CylinderGeometry || (o as THREE.Mesh).geometry instanceof THREE.TorusGeometry) && !(s.lobby?.ped && extraPeds.includes(o)));
      for (const p of ped) {
        const c = p.clone();
        c.position.x += st.x ?? 0;
        c.position.z += st.z ?? 0;
        stylePed(c, s.lobby?.ped, st.team ?? 0);
        if (st.scale) c.scale.multiplyScalar(st.scale);
        lb.scene.add(c);
        extraPeds.push(c);
      }
    }
    if (s.lobby?.ped) {
      // the glow disc sits behind the lobby's single stand: a wide line-up drops it (a half disc behind the gap)
      for (const o of lb.scene.children) if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry instanceof THREE.CircleGeometry) o.visible = false;
      // the lobby's own pedestal and trim (the first stand's)
      for (const o of lb.scene.children) {
        if (extraPeds.includes(o) || extra.some((h) => h.object === o)) continue;
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.geometry instanceof THREE.CylinderGeometry || m.geometry instanceof THREE.TorusGeometry)) stylePed(m, s.lobby.ped, first.team ?? 0);
      }
    }
    if (first.x || first.z) {
      // move the lobby's own hero and pedestal together
      for (const o of lb.scene.children) {
        if (extra.some((h) => h.object === o) || extraPeds.includes(o)) continue;
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.geometry instanceof THREE.CylinderGeometry || m.geometry instanceof THREE.TorusGeometry)) {
          m.position.x += first.x ?? 0;
          m.position.z += first.z ?? 0;
        }
      }
    }
    if (s.lobby?.key) {
      lb.scene.background = new THREE.Color(s.lobby.key);
      for (const o of lb.scene.children) {
        const m = o as THREE.Mesh;
        if (!m.isMesh) continue;
        if (m.geometry instanceof THREE.CircleGeometry) m.visible = false;
        else if (!s.lobby.keepStage && (m.geometry instanceof THREE.CylinderGeometry || m.geometry instanceof THREE.TorusGeometry)) m.visible = false;
      }
    }
    if (s.lobby?.pick) {
      const pk = s.lobby.pick;
      lb.side = pk.side ?? 0.5;
      lb.setHero(pk.hero, 0, null);
      const champs = Object.fromEntries((['lambo', 'aviete', 'bengas', 'gabe'] as HeroId[]).map((h) => [h, { owned: false }]));
      pickEl = pickScreen(root, {
        initial: { hero: pk.hero, trick: 'pounce' as TrickId, difficulty: 'normal' as Difficulty },
        champions: champs,
        onHero: (h) => lb.setHero(h, 0, null),
        onStart: () => undefined,
        onBack: () => undefined,
        difficultyNote: 'Easy bots. More bots after 3 matches.',
      });
    }
    // the pick screen keeps the lobby's own camera (the hero framed right of the UI column, as in the game)
    if (!s.lobby?.pick) installPlace(g);
    wrapRender(g);
    // let shaders compile and the hero pop settle before the shot
    for (let i = 0; i < (s.preroll ?? 90); i++) lobbyStep(-1 - i, 1 / 60, 1);
    return { ok: true, tick: 0 };
  }
  const take = s.take;
  if (!take) throw new Error(`${s.id}: no take`);
  FakeWorker.take = { seed: take.seed, hero: take.hero, trick: take.trick, difficulty: take.difficulty, script: (take.script ?? []) as ScriptCmd[] };
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
  const setup: MatchSetup = {
    hero: take.hero as HeroId,
    trick: take.trick as TrickId,
    difficulty: take.difficulty as Difficulty,
    seed: take.seed,
    speed: 1,
    firstMatch: false,
    muted: true,
    newPlayer: false,
    emote: false,
    look: lookOf(take.look ?? null),
    frame: null,
    title: null,
    companions: [],
    guide: 'off',
    knowsUlt: true,
    skinFx: 'all',
    showcase: [],
    pingTip: false,
    forfeitFrom: 0,
  };
  session = new MatchSession(g, root, setup, { onEnd: () => undefined, onLeave: () => undefined, onMute: () => undefined, onError: (m) => console.error('sim', m) });
  await Promise.resolve();
  await Promise.resolve();
  // the structures' x-ray (a tower fades while a hero stands in the patch it hides from the top-down gameplay camera)
  // is a gameplay-camera aid: under a director camera it would ghost towers, so the director shots switch it off
  if (s.cam) {
    const st = (session as unknown as { view: { structures: { heroes: { x: number; z: number }[] } } }).view.structures;
    st.heroes = Object.assign([] as { x: number; z: number }[], { push: () => 0 });
  }
  const worker = FakeWorker.last;
  if (!worker?.run) throw new Error('fake worker did not start');
  worker.onTick = (tick, events: readonly SimEvent[]) => {
    for (const e of events) {
      if (e.type === 'hit' || e.type === 'death' || e.type === 'cast' || e.type === 'tower' || e.type === 'pudding' || e.type === 'comeback' || e.type === 'shutdown' || e.type === 'bark' || e.type === 'ping') {
        const x = e as { src?: number; dst?: number; id?: number };
        eventLog.push({ tick, type: e.type, src: x.src, dst: x.dst, id: x.id });
        if (eventLog.length > 4000) eventLog.splice(0, 1000);
      }
    }
  };
  // the render clock and the sim are ours: the buffer's own smoothing is replaced by the harness clock
  const buf = session.buffer;
  buf.advance = (dt: number, scale = 1): ViewFrame | null => {
    if (seekTarget !== null) clockTick = Math.min(seekTarget, clockTick + 15);
    else if (pin !== null) {
      clockTick = pin;
      pin = null;
    } else clockTick += dt * 30 * scale;
    worker.pumpTo(Math.ceil(clockTick) + 2);
    const last = buf.latest;
    if (!last) return null;
    buf.renderTick = Math.min(clockTick, last.clock.tick);
    return buf.sample(buf.renderTick);
  };
  // v3.1 uiOut: damage numbers rise and fade in output time (the pops layer's CSS runs on the vclock's UI clock)
  const nums = (session.view as unknown as { effects: { numbers: { render(dt: number): void } } }).effects.numbers;
  const numRender = nums.render.bind(nums);
  nums.render = (dt: number) => numRender(spec?.uiOut ? curDtReal : dt);
  installPlace(g);
  wrapRender(g);
  patchScenery(g, s);
  setGhosts(!!s.ghosts);
  dimShock(s.gameLook ? (s.shockI ?? 1) : s.cam ? (s.shockI ?? 0.5) : 1);
  // run the countdown frames (two rAFs, then "3, 2, 1, Go!"), then fast-forward to just before the shot
  clockTick = 0;
  const start = Math.max(0, (s.startTick ?? 0) - Math.round((s.preroll ?? 90) / 2));
  draw = false;
  seekTarget = start;
  for (let i = 0; i < 4000 && clockTick < start; i++) {
    vclock().advance(500);
    session.frame(0.5);
  }
  seekTarget = null;
  draw = true;
  // pre-roll at speed 1 until the next frame would pass startTick; frame f0 then lands on it exactly
  const target = s.startTick ?? clockTick;
  for (let i = 0; i < 2000; i++) {
    if (clockTick + 0.5 > target - 1e-6) break;
    matchStep(s.f0 - 1, 1 / 60, 1);
  }
  pin = target;
  return { ok: true, tick: clockTick };
}

/** v3 line-up pedestal: scaled on the ground plane, the trim (a torus) in the team colour. Render only. */
function stylePed(o: THREE.Object3D, ped: { scale: number; trim?: [string, string] } | undefined, team: number): void {
  if (!ped) return;
  const m = o as THREE.Mesh;
  m.scale.x *= ped.scale;
  m.scale.z *= ped.scale;
  if (m.geometry instanceof THREE.TorusGeometry) {
    // the trim torus lies flat (rotated): scale its own plane instead
    m.scale.set(ped.scale, ped.scale, 1);
    if (ped.trim) {
      m.material = (m.material as THREE.MeshBasicMaterial).clone();
      (m.material as THREE.MeshBasicMaterial).color.set(ped.trim[team] ?? ped.trim[0]);
    }
  }
}

/** v3.2 line-up: the scale that makes a hero model `h` m tall (its height measured once at scale 1). */
const baseH = new WeakMap<THREE.Object3D, number>();
function fitBase(o: THREE.Object3D): number {
  let b = baseH.get(o);
  if (b === undefined) {
    const sc = o.scale.x;
    o.scale.setScalar(1);
    o.updateMatrixWorld(true);
    b = Math.max(0.1, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y);
    o.scale.setScalar(sc);
    baseH.set(o, b);
  }
  return b;
}

function lobbyStep(f: number, dtReal: number, ramp: number): void {
  const g = gr;
  const s = spec;
  if (!g || !lobby || !s) return;
  const dt = Math.max(0, ramp) * dtReal;
  const pk = s.lobby?.pick;
  if (pk && pickEl && dtReal > 0) {
    for (const sw of pk.swaps ?? []) if (sw.f === f) pickEl.querySelector<HTMLElement>(`[data-h="${sw.hero}"]`)?.click();
    const z = pk.zoom;
    if (z && f >= 0) {
      const u = Math.max(0, Math.min(1, (f - z.from) / Math.max(1, z.to - z.from)));
      const k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const sc = z.s0 + (z.s1 - z.s0) * k;
      root.style.transformOrigin = `${z.ox * 100}% ${z.oy * 100}%`;
      root.style.transform = `scale(${sc.toFixed(4)})`;
    }
  }
  for (const sw of s.lobby?.swaps ?? []) {
    if (sw.f === f && dtReal > 0) {
      const first = s.lobby?.stands[0];
      if (first) lobby.setHero(first.hero, first.team ?? 0, lookOf(sw.card));
    }
  }
  vclock().advance(dt * 1000);
  lobby.update(dt);
  const stands = s.lobby?.stands ?? [];
  const own = (lobby as unknown as { hero: LobbyHero | null }).hero;
  // models face +X at rotation 0: face 0 turns them toward the camera (+Z), +90 toward screen right
  if (f >= 0) lobbyF = f;
  const faceOf = (st: LobbyStand | undefined): number => (st?.face ?? 0) + (st?.spin ?? 0) * (lobbyF - (st?.spinFrom ?? s.f0));
  if (own && (stands[0]?.face !== undefined || stands[0]?.spin)) own.object.rotation.y = -Math.PI / 2 + (faceOf(stands[0]) * Math.PI) / 180;
  if (own && (stands[0]?.x || stands[0]?.z)) own.object.position.set(stands[0].x ?? 0, own.object.position.y, stands[0].z ?? 0);
  if (own && stands[0]?.scale) own.object.scale.setScalar(stands[0].scale);
  if (s.lobby?.fitH) {
    [own, ...extra].forEach((h, i) => {
      if (h) h.object.scale.setScalar(((stands[i]?.fitK ?? 1) * (s.lobby?.fitH ?? 1)) / Math.max(0.1, (h.ch as unknown as { height: number }).height || fitBase(h.object)));
    });
  }
  extra.forEach((h, i) => {
    const st = stands[i + 1];
    h.object.rotation.y = -Math.PI / 2 + (faceOf(st) * Math.PI) / 180;
    h.ch.anim.update(dt, { state: 'idle', speed: 0, height: h.ch.height, yawRate: 0 });
  });
  direct(f, dtReal);
  g.render();
  vclock().sync();
}

function matchStep(f: number, dtReal: number, ramp: number): void {
  const s = spec;
  const ses = session;
  if (!s || !ses) return;
  const dt = Math.max(1e-6, Math.max(0, ramp) * dtReal);
  curDtReal = dtReal;
  // v3.1 uiOut: the screen text animates in output time (the game keeps its own ramped clock)
  vclock().advance(dt * 1000, s.uiOut ? dtReal * 1000 : dt * 1000);
  // wheel: real UI, opened over the player's hero and pointed at Group on me
  if (s.wheel) {
    const wheel = (ses as unknown as { pingWheel: { openAt(x: number, y: number): void; aim(x: number, y: number): void; close(): void } | null }).pingWheel;
    const at = (ses as unknown as { heroScreen(): { x: number; y: number } | null }).heroScreen();
    // `at`: a fixed screen point (fractions of the viewport) for a director shot, where the hero is framed
    const pt = s.wheel.at ? { x: s.wheel.at[0] * window.innerWidth, y: s.wheel.at[1] * window.innerHeight + 40 } : at;
    if (wheel && f >= s.wheel.open && f < s.wheel.close && !wheelOpen && pt) {
      wheel.openAt(pt.x, pt.y - 40);
      wheel.aim(pt.x, pt.y - 160);
      wheelOpen = true;
      const k = s.wheelScale ?? 1;
      const el = document.querySelector<HTMLElement>('.pl-pingwheel');
      if (el && k !== 1) {
        el.style.transformOrigin = `${el.style.getPropertyValue('--x')} ${el.style.getPropertyValue('--y')}`;
        el.style.scale = String(k);
      }
    } else if (wheel && wheelOpen && f >= s.wheel.close) {
      wheel.close();
      wheelOpen = false;
    }
  }
  const directed = direct(f, dtReal);
  if (!directed && gr) gr.place = null;
  ses.frame(dt);
  // the player-bot chose its talent in the sim; close the card the UI opened for it as a player would (an open card
  // holds the centre band, so announcer banners would queue behind it). The UI's pick command is dropped by the take.
  const tp = (ses as unknown as { talents: { open: boolean; waiting: boolean; reveal(): void; pick(c: 0 | 1, auto?: boolean): boolean } | null }).talents;
  if (tp?.waiting) tp.reveal();
  if (tp?.open) tp.pick(0, true);
  vclock().sync();
}

/** Hero render positions after the last frame() call: a jump between two calls is a snap (knockback, blink). */
const lastPos = new Map<number, [number, number, number]>();
/** The largest hero move (m) since the previous frame() call, among drawn heroes. */
function heroMove(): number {
  const view = session?.view as unknown as { heroes: { rigs: Map<number, RigLike> } } | undefined;
  if (!view) return 0;
  let m = 0;
  for (const [id, r] of view.heroes.rigs) {
    const p = r.ch.object.position;
    const q = lastPos.get(id);
    if (q && r.ch.object.visible) m = Math.max(m, Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]));
    lastPos.set(id, [p.x, p.y, p.z]);
  }
  return m;
}

/** v3.1 screen-space gate: two drawn bodies whose boxes share more than this of the smaller box overlap. */
const OVERLAP_SHARE = 0.45;
/** One output frame (or sub-frame `sub` of `subs`, for motion blur): frame time 1/60 s split evenly. */
function frame(f: number, sub = 0, subs = 1): { tick: number; ramp: number; move: number; overlap: number; qc: FrameQc | null } {
  const s = spec;
  if (!s) throw new Error('no shot loaded');
  curF = f;
  const ramp = rampAt(s.ramp ?? [], f + sub / subs);
  const dtReal = 1 / 60 / subs;
  if (s.mode === 'lobby') lobbyStep(sub === 0 ? f : -1, dtReal, ramp);
  else matchStep(f, dtReal, ramp);
  const qc = s.mode === 'match' && sub === 0 ? frameQc() : null;
  return { tick: clockTick, ramp, move: s.mode === 'match' ? heroMove() : 0, overlap: qc ? qc.overlap : 0, qc };
}

const _qa = new THREE.Vector3();
const _pp = new THREE.Vector3();
const _bb = new THREE.Box3();
const _qr = new THREE.Vector3();
/** v3.1 per-frame QC (see FrameQc). */
function frameQc(): FrameQc {
  const out: FrameQc = { heroes: [], overlap: 0, inStruct: 0, edgeText: 0, banner: '', why: [] };
  const bodyIds: number[] = [];
  const bodies: [number, number, number, number][] = [];
  const depth: number[] = [];
  const view = session?.view as unknown as { heroes: { rigs: Map<number, RigLike & { hero: string; team: number }> }; frame: ViewFrame | null; structures: { footprints(o: { x: number; z: number; r: number }[]): { x: number; z: number; r: number }[] } } | undefined;
  const cam = gr?.camera;
  if (!view || !cam) return out;
  const W = window.innerWidth;
  const H = window.innerHeight;
  _qr.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
  const fps = view.structures.footprints([]);
  for (const [id, r] of view.heroes.rigs) {
    const o = r.ch.object;
    if (!o.visible || r.wasDead) continue;
    const e = view.frame?.byId.get(id);
    if (!e || e.state === 'dead') continue;
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    let behind = false;
    // the body (0.55 m either side, 0-1.8 m up) and the plate over it (2.6 m up, 1 m either side)
    for (const [side, up] of [[-0.55, 0], [0.55, 0], [-0.55, 1.8], [0.55, 1.8], [-1, 2.6], [1, 2.6]] as const) {
      _qa.copy(o.position).addScaledVector(_qr, side);
      _qa.y = up;
      _qa.project(cam);
      if (_qa.z > 1 || _qa.z < -1) behind = true;
      x0 = Math.min(x0, (_qa.x * 0.5 + 0.5));
      x1 = Math.max(x1, (_qa.x * 0.5 + 0.5));
      y0 = Math.min(y0, (-_qa.y * 0.5 + 0.5));
      y1 = Math.max(y1, (-_qa.y * 0.5 + 0.5));
    }
    if (behind || x1 < 0 || x0 > 1 || y1 < 0 || y0 > 1) continue;
    out.heroes.push({ id, team: e.team, hero: e.hero ?? '', box: [+x0.toFixed(4), +y0.toFixed(4), +x1.toFixed(4), +y1.toFixed(4)] });
    // v3.2 the body alone (no plate): the drawn model's world box, projected (a big Sir Brutus gets a big box)
    _bb.setFromObject(o);
    let bx0 = 1e9;
    let by0 = 1e9;
    let bx1 = -1e9;
    let by1 = -1e9;
    for (let c = 0; c < 8; c++) {
      _qa.set(c & 1 ? _bb.max.x : _bb.min.x, c & 2 ? _bb.max.y : _bb.min.y, c & 4 ? _bb.max.z : _bb.min.z).project(cam);
      bx0 = Math.min(bx0, _qa.x * 0.5 + 0.5);
      bx1 = Math.max(bx1, _qa.x * 0.5 + 0.5);
      by0 = Math.min(by0, -_qa.y * 0.5 + 0.5);
      by1 = Math.max(by1, -_qa.y * 0.5 + 0.5);
    }
    // the box of a skinned, posed model is generous: keep its middle 80 % across (weapons and capes stick out)
    const shrink = (bx1 - bx0) * 0.1;
    bodies.push([bx0 + shrink, by0, bx1 - shrink, by1]);
    depth.push(_qa.copy(o.position).project(cam).z);
    bodyIds.push(id);
    const hr = Math.min(0.9, Math.max(0.35, Math.max(_bb.max.x - _bb.min.x, _bb.max.z - _bb.min.z) * 0.35));
    for (const c of fps) {
      const d = Math.hypot(o.position.x - c.x, o.position.z - c.z);
      if (d < c.r + hr) {
        out.inStruct++;
        out.why!.push(`${id}@${c.x.toFixed(1)},${c.z.toFixed(1)} d${d.toFixed(2)} r${c.r.toFixed(2)}`);
      }
    }
  }
  // bodies interpenetrating on screen: two body boxes sharing more than OVERLAP_SHARE of the smaller one; v3.2 also the
  // largest share of a farther body covered by a nearer one (`hidden`)
  out.hidden = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const iw = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const ih = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (iw <= 0 || ih <= 0) continue;
      const areaA = (a[2] - a[0]) * (a[3] - a[1]);
      const areaB = (b[2] - b[0]) * (b[3] - b[1]);
      const small = Math.min(areaA, areaB);
      const far = depth[i] > depth[j] ? areaA : areaB;
      out.hidden = Math.max(out.hidden, (iw * ih) / far);
      if ((iw * ih) / small > OVERLAP_SHARE) {
        out.overlap++;
        out.why!.push(`${bodyIds[i]}-${bodyIds[j]} ${((iw * ih) / small).toFixed(2)}`);
      }
    }
  }
  out.hidden = +out.hidden.toFixed(3);
  // v3.2 plates (Overhead boxes, CSS px -> fractions) and the pile count
  const ob = (session as unknown as { overhead: { boxes: { kind: string; id: number; name: string; x0: number; y0: number; x1: number; y1: number; dy: number }[] | null } }).overhead.boxes ?? [];
  // plates faded out by the shot (uiFade 0: the crane's whole-map view) are not on screen
  const shown = uiAlpha(spec?.uiFade ?? undefined, curF) > 0.05;
  out.plates = (shown ? ob : []).map((p) => ({ kind: p.kind, id: p.id, name: p.name, box: [+(p.x0 / W).toFixed(4), +(p.y0 / H).toFixed(4), +(p.x1 / W).toFixed(4), +(p.y1 / H).toFixed(4)] as [number, number, number, number], dy: Math.round(p.dy) }));
  out.stacked = shown ? ob.filter((p) => p.kind === 'hero' && p.dy < -0.5).length : 0;
  out.pops = [];
  out.structs = [];
  for (const st of (session?.view as unknown as { structures: { items: Map<number, { kind: string; mesh: THREE.Object3D }> } }).structures.items.values()) {
    if ((st.kind !== 'tower' && st.kind !== 'core' && st.kind !== 'pudding') || !st.mesh.visible) continue;
    _bb.setFromObject(st.mesh);
    if (_bb.isEmpty()) continue;
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (let c = 0; c < 8; c++) {
      _qa.set(c & 1 ? _bb.max.x : _bb.min.x, c & 2 ? _bb.max.y : _bb.min.y, c & 4 ? _bb.max.z : _bb.min.z).project(cam);
      x0 = Math.min(x0, _qa.x * 0.5 + 0.5);
      x1 = Math.max(x1, _qa.x * 0.5 + 0.5);
      y0 = Math.min(y0, -_qa.y * 0.5 + 0.5);
      y1 = Math.max(y1, -_qa.y * 0.5 + 0.5);
    }
    if (x1 < 0 || x0 > 1 || y1 < 0 || y0 > 1 || x0 < -1 || y0 < -1 || x1 > 2 || y1 > 2) continue;
    out.structs.push({ kind: st.kind, box: [+x0.toFixed(4), +y0.toFixed(4), +x1.toFixed(4), +y1.toFixed(4)] });
  }
  const m = 0.015;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.pl-pops > *, .pl-callouts > *, .fx-dmg'))) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    let a = 1;
    for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden') a = 0;
      a *= Number(ps.opacity);
    }
    if (a < 0.05) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1) continue;
    out.pops!.push({ text: (el.textContent ?? '').trim(), box: [+(b.left / W).toFixed(4), +(b.top / H).toFixed(4), +(b.right / W).toFixed(4), +(b.bottom / H).toFixed(4)] });
    if (b.left < W * m || b.right > W * (1 - m) || b.top < H * m || b.bottom > H * (1 - m)) {
      out.edgeText++;
      out.why!.push(`edge:${(el.textContent ?? '').trim()}@${Math.round(b.left)},${Math.round(b.top)}`);
    }
  }
  const ban = document.querySelector<HTMLElement>('.pl-banner');
  if (ban && ban.classList.contains('on') && getComputedStyle(ban).display !== 'none' && getComputedStyle(ban).visibility !== 'hidden') {
    out.banner = (ban.querySelector('.pl-banner-title')?.textContent ?? '').trim();
    // v3.2: the banner's box joins the pops, so the trailer type is kept off the game's own announcement
    const b = ban.getBoundingClientRect();
    if (b.width > 1) out.pops!.push({ text: `banner ${out.banner}`, box: [+(b.left / W).toFixed(4), +(b.top / H).toFixed(4), +(b.right / W).toFixed(4), +(b.bottom / H).toFixed(4)] });
  }
  return out;
}

function info(): unknown {
  const w = FakeWorker.last;
  return {
    tick: clockTick,
    simTick: w?.run?.tick ?? 0,
    said: document.documentElement.dataset.said ?? '',
    banner: document.documentElement.dataset.banner ?? '',
    cam: camNow,
    look: camLook,
    pos: camPos,
    heroes: (session?.view.frame?.entities ?? []).filter((e) => e.kind === 'hero' || e.kind === 'pudding').map((e) => ({ id: e.id, kind: e.kind, hero: e.hero, x: e.fx, y: e.fy, hp: e.hp, state: e.state })),
    events: eventLog.slice(-40),
  };
}

/** Step the take to its check tick (no drawing) and compare the event-log hash with the one seed-search wrote. */
function verify(): { ok: boolean; tick: number; browser: string; node: string } {
  const run = FakeWorker.last?.run;
  const check = spec?.take?.check;
  if (!run || !check) return { ok: false, tick: 0, browser: '', node: check?.eventHash ?? '' };
  run.runTo(check.tick);
  return { ok: run.eventHash === check.eventHash, tick: run.tick, browser: run.eventHash, node: check.eventHash };
}

/**
 * Whip frames (capture.mjs): 'canvas' hides every DOM layer (the 3D sub-frames are blended), 'dom' hides the canvas
 * and the page background (the screen-space layer is shot once per output frame, with alpha), 'all' restores.
 */
function layerMode(mode: 'canvas' | 'dom' | 'all'): void {
  let el = document.getElementById('trailer-mode') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'trailer-mode';
    document.head.appendChild(el);
  }
  el.textContent =
    mode === 'canvas'
      ? 'body *:not(#game-canvas) { visibility: hidden !important; } #game-canvas { visibility: visible !important; }'
      : mode === 'dom'
        ? 'html, body { background: transparent !important; } #game-canvas, canvas#game-canvas { visibility: hidden !important; }'
        : '';
}

/** The touch HUD (S19 in 9:16): the real controls, as on a phone. */
function touch(on: boolean): void {
  const t = (session as unknown as { touch: { enable(on: boolean): void } | null } | null)?.touch;
  t?.enable(on);
  document.documentElement.dataset.touch = on ? '1' : '0';
}

/** Debug: what the lens sees at screen fraction (x, y) (names, kinds, distances). */
function pick(x: number, y: number): unknown {
  const g = gr;
  if (!g) return [];
  if (x < 0) return g.scene.children.map((c) => `${c.name || c.type}:${c.type}:${c.visible}:${c.children.length}`);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), g.camera as THREE.PerspectiveCamera);
  const shown = (o: THREE.Object3D | null): boolean => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  return rc.intersectObjects(g.scene.children, true).filter((h) => shown(h.object)).slice(0, 4).map((h) => {
    const names: string[] = [];
    for (let o: THREE.Object3D | null = h.object; o; o = o.parent) names.push(`${o.name || o.type}`);
    const mm = (h.object as THREE.Mesh).material as THREE.Material | undefined;
    return { pt: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)], prog: mm ? (mm as unknown as { customProgramCacheKey(): string }).customProgramCacheKey() : '', trailer: !!(mm && h.object.userData.trailerMat === mm), progs: (g.renderer.info.programs ?? []).filter((p) => /trailer/.test((p as unknown as { cacheKey: string }).cacheKey)).length, d: +h.distance.toFixed(2), path: names.slice(0, 5).join(' < '), mat: (h.object as THREE.Mesh).material ? ((h.object as THREE.Mesh).material as THREE.Material).type : '', vis: h.object.visible };
  });
}

/** Debug (capture.mjs --debug): the structures' render state this frame. */
function debug(): unknown {
  const view = session?.view as unknown as { structures: { items: Map<number, StructLike & { mesh: THREE.Object3D }> } } | undefined;
  if (!view) return null;
  const nums = (session?.view as unknown as { effects: { numbers: { pool: { el: HTMLElement | null; t: number; life: number; key: unknown; active: boolean }[] } } }).effects.numbers.pool.filter((n) => n.active).map((n) => `${n.el?.textContent}:${n.key}:${n.t.toFixed(2)}/${n.life}:${n.el?.style.opacity}`);
  const h0 = (session?.view as unknown as { heroes: { rigs: Map<number, RigLike> } }).heroes.rigs.get(0)?.ch.object.position;
  const hv = (session?.view as unknown as { heroes: { obstacles: { x: number; z: number; r: number }[]; rigs: Map<number, { sepX: number; sepZ: number; simX: number; simZ: number }> } }).heroes;
  const sepInfo = { obs: hv.obstacles.map((o) => `${o.x.toFixed(1)},${o.z.toFixed(1)},${o.r.toFixed(2)}`), rigs: [...hv.rigs.entries()].map(([id, r]) => `${id}:${r.simX.toFixed(1)},${r.simZ.toFixed(1)}+${r.sepX.toFixed(2)},${r.sepZ.toFixed(2)}`) };
  const cp = gr?.camera.position;
  const cf = (gr?.camera as THREE.PerspectiveCamera | undefined)?.fov;
  const fo = gr?.focus;
  return { camP: cp ? [+cp.x.toFixed(2), +cp.y.toFixed(2), +cp.z.toFixed(2)] : null, fov: cf, focus: fo ? [+fo.x.toFixed(2), +fo.z.toFixed(2)] : null, zoom: gr?.zoom, sepInfo, look: camLook ? [+camLook.x.toFixed(1), +camLook.z.toFixed(1)] : null, h0: h0 ? [+h0.x.toFixed(1), +h0.z.toFixed(1)] : null, nums, st: [...view.structures.items.values()].filter((st) => st.kind === 'core' || st.kind === 'tower').map((st) => ({ k: st.kind, x: +st.x.toFixed(1), z: +st.z.toFixed(1), alive: st.alive, dieT: +st.dieT.toFixed(2), op: +st.rig.uOpacity.value.toFixed(2), tr: st.material.transparent, fk: +st.rig.uFlashK.value.toFixed(2), vis: (st as unknown as { mesh: THREE.Object3D }).mesh.visible })) };
}

window.__trailer = { load, frame, info, verify, touch, layerMode, pick, debug, ready: true };
document.documentElement.dataset.trailer = 'ready';
