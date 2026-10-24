// Game session lifecycle. FROZEN.
// title (attract) -> startStage -> play <-> paused -> finish (run-out) -> over (results) -> startStage / quit.
// Owns the track build, scenery chunk streaming (themes), set-piece spawning, checkpoints, respawns and the result.
import * as THREE from 'three';
import { attractFocus, snapCamera } from './camera';
import { addCollider, clearColliders, removeCollider } from './collision';
import { camera, getQuality, hemi, renderer, resetFpsSampler, scene, sun } from './engine';
import { events, EMPTY } from './events';
import { clearParticles } from './fx';
import { callout, clearPrompt, hud, react, tickHud } from './hud';
import { PathBuilder } from './path';
import { disposeKittenRig, P, resetPlayer, setOutOfHearts, setSpawnGrace, spawnKittenRig, teleport, TUNING } from './player';
import { setPieceTypes, stages, themes } from './registry';
import { makeRng } from './rng';
import { DIST_POINTS, finishBonus, respawnPenalty, starsFor } from './scoring';
import { G, game } from './state';
import { Track } from './track';
import { fillCheckpoints } from './checkpoints';
import { BELLS, MAX_HEARTS, type Collider, type PieceInstance, type PieceSpec, type RunResult, type StageId, type ThemeCtx, type ThemeDef } from './types';

export const CHUNK_LEN = 80;
/** scenery is built this far ahead (fog should hide the edge) */
export const VIEW_AHEAD = { high: 560, low: 360 };
const SPAWN_AHEAD = 300;
const DESPAWN_BEHIND = 40;
const CHECKPOINT_LEAD = 12;
const RUN_OUT = 90;
const FINISH_TIME = 2.2;
const ENDLESS_AHEAD = 700;

interface Live {
  spec: PieceSpec;
  inst: PieceInstance;
  group: THREE.Group;
  cols: Collider[];
}

let builder: PathBuilder | null = null;
let rng = makeRng(1);
let specs: PieceSpec[] = [];
let nextSpec = 0;
const live: Live[] = [];
const chunks = new Map<number, THREE.Object3D>();
let theme: ThemeDef | null = null;
let themeCtx: ThemeCtx | null = null;
let endlessIndex = 0;
let finishTimer = 0;
let lastS = 0;
let pendingRespawn = -1;
const warned = new Set<string>();

export const sessionInfo = {
  /** live set pieces (debug / tests) */
  get live() {
    return live.length;
  },
  get specs() {
    return specs as readonly PieceSpec[];
  },
  get chunks() {
    return chunks.size;
  },
};

// ---------------------------------------------------------------- stage build
function disposeObject(o: THREE.Object3D): void {
  o.traverse((n) => {
    const g = (n as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && !g.userData?.shared && !n.userData.shared) g.dispose();
  });
}

function unloadStage(): void {
  for (const l of live) killPiece(l);
  live.length = 0;
  clearColliders();
  for (const [, obj] of chunks) {
    scene.remove(obj);
    if (theme?.disposeChunk) theme.disposeChunk(obj);
    else disposeObject(obj);
  }
  chunks.clear();
  if (theme && themeCtx) theme.exit?.(themeCtx);
  theme = null;
  themeCtx = null;
  disposeKittenRig();
  clearParticles();
  clearPrompt();
}

/** Build the track and the theme for a stage (no run yet). The title screen shows it in attract mode. */
export function prepareStage(id: StageId): void {
  unloadStage();
  const stage = stages.get(id);
  game.stage = stage;
  const track = new Track();
  game.track = track;
  builder = new PathBuilder(track, stage.start);
  G.endless = !!stage.chunk && !stage.build;
  G.seed = G.endless ? (Date.now() & 0xffff) + 1 : 1000 + stage.index * 77;
  rng = makeRng(G.seed);
  specs = [];
  endlessIndex = 0;
  pendingRespawn = -1;
  P.s = 0;
  if (stage.build) {
    specs = stage.build(builder, rng).slice();
    G.finishS = track.length;
    builder.straight(RUN_OUT);
  } else {
    G.finishS = Infinity;
    extendEndless(ENDLESS_AHEAD);
  }
  specs.sort((a, b) => a.s - b.s);
  // checkpoints: the start + 12 u before every checkpoint piece
  const cps = [0];
  for (const sp of specs) {
    const type = setPieceTypes.has(sp.type) ? setPieceTypes.get(sp.type) : null;
    if (sp.checkpoint ?? type?.checkpoint ?? false) cps.push(Math.max(0, sp.s - CHECKPOINT_LEAD));
  }
  G.checkpoints = Number.isFinite(G.finishS) ? fillCheckpoints(cps, specs, (x) => track.kindAt(x), G.finishS - 40) : [...new Set(cps)].sort((a, b) => a - b);
  hud.ticks = Number.isFinite(G.finishS) ? G.checkpoints.slice(1).map((s) => s / G.finishS) : [];
  theme = themes.has(stage.theme) ? themes.get(stage.theme) : null;
  themeCtx = { scene, track, stage, quality: getQuality(), camera, sun, hemi };
  theme?.enter(themeCtx);
  nextSpec = 0;
  lastS = 0;
  game.mode = 'title';
  events.emit('stageLoad', { stage });
}

function extendEndless(ahead: number): void {
  const stage = game.stage;
  const track = game.track;
  if (!stage?.chunk || !builder || !track) return;
  let guard = 0;
  while (track.length < P.s + ahead && guard++ < 50) {
    const before = track.length;
    const add = stage.chunk(builder, rng, endlessIndex++);
    if (track.length <= before) builder.straight(60); // a chunk must add path
    for (const sp of add) insertSpec(sp);
    for (const sp of add) {
      const type = setPieceTypes.has(sp.type) ? setPieceTypes.get(sp.type) : null;
      if (sp.checkpoint ?? type?.checkpoint ?? false) G.checkpoints.push(Math.max(0, sp.s - CHECKPOINT_LEAD));
    }
  }
}
/** endless: forget specs and checkpoints far behind the player (keeps a long session's arrays bounded) */
function trimEndless(): void {
  let k = 0;
  while (k < nextSpec && specs[k].s + (specs[k].len ?? 0) < P.s - 200) k++;
  if (k > 32) {
    specs.splice(0, k);
    nextSpec -= k;
  }
  const c = G.cpIndex - 1; // keep the current checkpoint and the one before it
  if (c > 8) {
    G.checkpoints.splice(0, c);
    G.cpIndex -= c;
  }
  // the track itself: keep 1500 u behind the kitten and everything after the oldest kept checkpoint (respawns)
  const track = game.track;
  if (track) {
    const keep = Math.min(P.s - 1500, (G.checkpoints[0] ?? 0) - 300);
    if (keep - track.start > 2000) track.trimBefore(keep);
  }
}
function insertSpec(sp: PieceSpec): void {
  // endless specs arrive in order; keep the array sorted anyway
  let i = specs.length;
  while (i > 0 && specs[i - 1].s > sp.s) i--;
  specs.splice(i, 0, sp);
  if (i < nextSpec) nextSpec++;
}

// ---------------------------------------------------------------- pieces
function spawnPiece(spec: PieceSpec): void {
  const stage = game.stage!;
  const track = game.track!;
  if (!setPieceTypes.has(spec.type)) {
    if (!warned.has(spec.type)) {
      warned.add(spec.type);
      console.warn(`set piece type not registered: ${spec.type} (skipped)`);
    }
    return;
  }
  const type = setPieceTypes.get(spec.type);
  const group = new THREE.Group();
  group.name = `piece:${spec.type}`;
  scene.add(group);
  const cols: Collider[] = [];
  const inst = type.create({
    stage,
    track,
    spec,
    group,
    quality: getQuality(),
    addCollider: (c) => {
      const col = addCollider(c);
      cols.push(col);
      return col;
    },
    removeCollider: (c) => {
      removeCollider(c);
      const i = cols.indexOf(c);
      if (i >= 0) cols.splice(i, 1);
    },
  });
  live.push({ spec, inst, group, cols });
}
function killPiece(l: Live): void {
  try {
    l.inst.dispose?.();
  } catch (err) {
    console.error('set piece dispose failed', err);
  }
  for (const c of l.cols) removeCollider(c);
  scene.remove(l.group);
  disposeObject(l.group);
}

function streamPieces(): void {
  while (nextSpec < specs.length && specs[nextSpec].s < P.s + SPAWN_AHEAD) spawnPiece(specs[nextSpec++]);
  for (let i = live.length - 1; i >= 0; i--) {
    const l = live[i];
    if (l.inst.end < P.s - DESPAWN_BEHIND) {
      killPiece(l);
      live.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- scenery chunks
function streamChunks(focus: number, force = 0): void {
  const track = game.track;
  if (!track || !theme || !themeCtx) return;
  const ahead = getQuality() === 'high' ? VIEW_AHEAD.high : VIEW_AHEAD.low;
  // chunk -1 is the straight lead-in behind the start line (the track extrapolates), so the camera never sees the world's edge
  const k0 = Math.max(-1, Math.floor((focus - 40) / CHUNK_LEN));
  const k1 = Math.floor(Math.min(track.length, focus + ahead) / CHUNK_LEN);
  for (const [k, obj] of chunks) {
    if (k < k0 || k > k1 + 1) {
      scene.remove(obj);
      if (theme.disposeChunk) theme.disposeChunk(obj);
      else disposeObject(obj);
      chunks.delete(k);
    }
  }
  // build the nearest missing chunk; at most 1 per frame while playing (no hitch), all at once otherwise
  const budget = force || (game.mode === 'play' ? 1 : 64);
  let built = 0;
  for (let k = k0; k <= k1 && built < budget; k++) {
    if (chunks.has(k)) continue;
    const s0 = k * CHUNK_LEN;
    const obj = theme.buildChunk(themeCtx, s0, Math.min(track.length, s0 + CHUNK_LEN));
    if (obj) {
      scene.add(obj);
      chunks.set(k, obj);
    } else chunks.set(k, new THREE.Group());
    built++;
  }
}

/** rebuild the scenery (quality change) */
export function rebuildScenery(): void {
  if (!theme || !themeCtx) return;
  for (const [, obj] of chunks) {
    scene.remove(obj);
    if (theme.disposeChunk) theme.disposeChunk(obj);
    else disposeObject(obj);
  }
  chunks.clear();
  theme.exit?.(themeCtx);
  themeCtx.quality = getQuality();
  theme.enter(themeCtx);
  // rebuild the visible chunks now, in this same task, so no frame shows the world half missing
  streamChunks(game.mode === 'title' ? attractFocus() : P.s, 64);
}
events.on('qualityChange', () => rebuildScenery());

// ---------------------------------------------------------------- run lifecycle
function resetRun(): void {
  Object.assign(G, {
    score: 0,
    mult: 1,
    maxMult: 1,
    hearts: MAX_HEARTS,
    bells: new Array<boolean>(BELLS).fill(false),
    fish: 0,
    meter: 0,
    time: 0,
    distance: 0,
    hits: 0,
    respawns: 0,
    cpIndex: 0,
    progress: 0,
  });
  hud.now = 0;
  hud.prompt = null;
}

/**
 * Start (or restart) a stage. at = 0..1 of the way to the finish (dev.jump): the run starts exactly there (shots rely
 * on it), with the checkpoint at or before it as the respawn point and 2 s of (unflashing) hit immunity so a spawn on
 * top of a hazard costs nothing.
 */
export function startStage(id: StageId, opts: { at?: number } = {}): void {
  prepareStage(id);
  resetRun();
  const stage = game.stage!;
  let s = 0;
  if (opts.at && opts.at > 0) {
    const target = Number.isFinite(G.finishS) ? Math.min(0.999, opts.at) * G.finishS : opts.at * 2000;
    if (!Number.isFinite(G.finishS)) extendEndless(target + ENDLESS_AHEAD);
    s = target;
    while (G.cpIndex + 1 < G.checkpoints.length && G.checkpoints[G.cpIndex + 1] <= s) G.cpIndex++;
  }
  resetPlayer(s, 0);
  setSpawnGrace(s > 0 ? TUNING.respawnInvuln : 0);
  // pieces that end before the start are skipped
  nextSpec = 0;
  while (nextSpec < specs.length && specs[nextSpec].s + (specs[nextSpec].len ?? 0) < s - 1) nextSpec++;
  lastS = s;
  spawnKittenRig();
  game.mode = 'play';
  finishTimer = 0;
  resetFpsSampler();
  streamChunks(s);
  streamPieces();
  snapCamera();
  // compile every program the run's first seconds need now (stage start), not mid-run on first sight
  try {
    renderer.compile(scene, camera);
  } catch (err) {
    console.warn('shader precompile failed', err);
  }
  events.emit('stageStart', { stage, at: s });
}

export function retry(): void {
  if (game.stage) startStage(game.stage.id);
}

export function pause(): void {
  if (game.mode !== 'play') return;
  game.mode = 'paused';
  events.emit('pause', EMPTY);
}
export function resume(): void {
  if (game.mode !== 'paused') return;
  game.mode = 'play';
  events.emit('resume', EMPTY);
}
/** Back to the title (attract mode on the same stage). */
export function quit(): void {
  const stage = game.stage;
  if (stage) {
    events.emit('quit', { stage });
    prepareStage(stage.id);
  }
}

function buildResult(finished: boolean): RunResult {
  const stage = game.stage!;
  const bellCount = G.bells.filter(Boolean).length;
  const r: RunResult = {
    stageId: stage.id,
    finished,
    score: Math.round(G.score),
    bells: G.bells.slice(),
    bellCount,
    bellsTotal: stage.bells,
    fish: G.fish,
    distance: Math.round(G.distance),
    time: G.time,
    hits: G.hits,
    respawns: G.respawns,
    hearts: G.hearts,
    maxMult: G.maxMult,
    stars: [false, false, false],
  };
  r.stars = starsFor(r, stage.scoreTarget);
  return r;
}

function endRun(finished: boolean): void {
  if (game.mode === 'over') return;
  game.mode = 'over';
  clearPrompt();
  events.emit('stageEnd', { result: buildResult(finished) });
}

function crossFinish(): void {
  game.mode = 'finish';
  P.mode = 'finish';
  P.sliding = false;
  finishTimer = 0;
  G.score += finishBonus(G.hearts);
  clearPrompt();
  callout('HOME!', 'good');
  react('happy');
  events.emit('finishLine', { stage: game.stage! });
}

/** 0 hearts: endless ends the run; the campaign respawns at the last checkpoint with a score penalty. */
function outOfHearts(): void {
  const penalty = respawnPenalty(G.score);
  G.score -= penalty;
  G.respawns++;
  if (G.endless) {
    endRun(false);
    return;
  }
  const s = G.checkpoints[G.cpIndex] ?? 0;
  events.emit('lifeLost', { penalty, s });
  // deferred to the end of this fixed step (we may be inside a piece update or the collision pass)
  pendingRespawn = s;
}
setOutOfHearts(outOfHearts);

function respawnAt(s: number): void {
  G.hearts = MAX_HEARTS;
  // rebuild the pieces from the checkpoint on (collected bells stay collected: bell pieces check G.bells)
  for (const l of live) killPiece(l);
  live.length = 0;
  nextSpec = 0;
  while (nextSpec < specs.length && specs[nextSpec].s + (specs[nextSpec].len ?? 0) < s - 1) nextSpec++;
  teleport(s, 0);
  resetPlayer(s, 0);
  P.invuln = TUNING.respawnInvuln;
  lastS = s;
  streamPieces();
  for (const l of live) l.inst.onRespawn?.(s);
  callout('TRY AGAIN!', 'info');
  events.emit('respawn', { s });
}

// ---------------------------------------------------------------- ticks
/** fixed step: pieces, checkpoints, progress, finish (the loop calls it after stepPlayer) */
export function stepSession(dt: number, t: number): void {
  if (game.mode !== 'play' && game.mode !== 'finish') return;
  if (pendingRespawn >= 0) {
    const s = pendingRespawn;
    pendingRespawn = -1;
    respawnAt(s);
  }
  tickHud(dt);
  if (game.mode === 'play') G.time += dt;
  const ds = Math.max(0, P.s - lastS);
  lastS = P.s;
  G.distance += ds;
  if (game.mode === 'play') G.score += ds * DIST_POINTS;
  if (G.endless) {
    extendEndless(ENDLESS_AHEAD);
    trimEndless();
  }
  streamPieces();
  for (let i = 0; i < live.length; i++) live[i].inst.update?.(dt, t);
  while (G.cpIndex + 1 < G.checkpoints.length && P.s >= G.checkpoints[G.cpIndex + 1]) {
    G.cpIndex++;
    events.emit('checkpoint', { index: G.cpIndex, s: G.checkpoints[G.cpIndex] });
  }
  G.progress = Number.isFinite(G.finishS) ? Math.min(1, P.s / G.finishS) : (P.s % 5000) / 5000;
  if (game.mode === 'play' && P.s >= G.finishS) crossFinish();
  if (game.mode === 'finish' && (finishTimer += dt) >= FINISH_TIME) endRun(true);
}

/** every rendered frame: scenery streaming and the theme's animation */
export function frameSession(dt: number, t: number): void {
  if (!game.track) return;
  streamChunks(game.mode === 'title' ? attractFocus() : P.s);
  if (theme && themeCtx) theme.update?.(dt, t, themeCtx);
}

// auto-pause when the tab hides mid-run
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.hidden && pause());
