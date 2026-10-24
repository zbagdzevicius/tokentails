// STYLE lane entry (ITERATION2.md 6.5): air tricks, the combo chain with tier stamps, the combo HUD, near-miss slow
// motion, gold speed lines at high combo, landing shockwaves (juice) and the finish flourish. src/ugc/index.ts calls
// registerStyle() once, after the menus exist and a stage is prepared.
//
// Scoring: every style point is RAW (addPoints(n, true), never x G.mult) times the combo tier multiplier, so the star
// targets stay fair (balance.test.ts). Only this lane calls setTimeScale (always < 0.8 s real time, never with
// reduced motion, reset on pause / stageEnd / quit / respawn).
import { duckMusic } from '../audio/music';
import { fovPunch } from '../core/camera';
import { camera, renderer, scene } from '../core/engine';
import { events } from '../core/events';
import { clearPrompt, hud, prompt } from '../core/hud';
import { addFrameHook, addStepHook, clock, setTimeScale } from '../core/loop';
import { P } from '../core/player';
import { addPoints } from '../core/score';
import { G, game, prefs } from '../core/state';
import { impactMeshes, landingImpact } from '../juice/impact';
import { setSpeedLineTier } from '../juice/speedlines';
import { save, setSave } from '../ui/flow';
import { exposeTestHook, provide, type StyleSummary } from '../ugc/contract';
import { onScreen } from '../ugc/hub';
import { TUNING } from '../core/player';
import { ComboChain, type Bank } from './chain';
import { forgetSwing, startConfetti, startSwing, swinging, tickConfetti } from './finish';
import { hudRects, initHudCombo, pop, resetHudCombo, showBroken, stamp, updateHudCombo, vignette } from './hudcombo';
import { setPiecePoints, TIER_NAMES, TRICK_IDS, TRICK_NAMES, trickPoints, trickWeight, WEIGHTS, type TrickId } from './points';
import { FINISH_SLOWMO, NEAR_MISS_SLOWMO, rankFor, SLOWMO_COOLDOWN_MS, slowmoScale, type Rank, type SlowMo } from './rank';
import { bankSound, brokenSound, slamSound, sloppySound, stingSound, tierSound, trickSound, whoosh } from './sfx';
import { applySpin, demoSpin, resetSpin, settleSpin, spinVisualActive } from './spin';
import { SPIN_TIME, TrickTracker } from './tricks';

const chain = new ComboChain();
const tricks = new TrickTracker();
const live = () => game.mode === 'play' || game.mode === 'finish';
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const style = (phase: 'tier' | 'trick' | 'broken' | 'bank' | 'slowmo') => events.emit('setPiece', { id: 'style', phase });

let hasRun = false;
let lastRank: Rank | '' = '';
let flushedTricks = 0;
/** the SPIN hint: shown at take-off on up to HINT_MAX jumps (from the 2nd jump of a non-tutorial stage) until the
 *  player has spun once */
const HINT_MAX = 3;
let hintCount = 0;
let hintThisJump = false;
let stageJumps = 0;
let sessionSpins = 0;
let slowmos = 0;

// ---------------------------------------------------------------- set-piece style (cleared without a hit)
const sp = {
  vault: { on: false, hit: false, landing: false },
  cloud: { on: false, hit: false },
  wall: { on: false, hit: false },
  river: { on: false, hit: false },
  dog: { on: false, hit: false },
  yarn: { on: false, hit: false },
};
function resetSetPieces(): void {
  for (const k of Object.keys(sp) as (keyof typeof sp)[]) {
    sp[k].on = false;
    sp[k].hit = false;
  }
  sp.vault.landing = false;
}
function hitSetPieces(): void {
  for (const k of Object.keys(sp) as (keyof typeof sp)[]) sp[k].hit = true;
}

// ---------------------------------------------------------------- chain + points
// a tier stamp waits (up to STAMP_WAIT_MS) while a core callout is on screen, so the two never pile up; while a
// prompt shows it drops lower (class low)
const STAMP_WAIT_MS = 1300;
let stampTier = 0;
let stampAt = -1;
let calloutsEl: HTMLElement | null = null;
let promptEl: HTMLElement | null = null;
function calloutBusy(): boolean {
  calloutsEl ??= document.getElementById('callouts');
  return !!calloutsEl?.firstElementChild;
}
function promptUp(): boolean {
  promptEl ??= document.getElementById('prompt');
  return !!promptEl && !promptEl.classList.contains('hidden');
}
function tickTierStamp(now: number): void {
  if (stampAt < 0) return;
  if (!live()) {
    stampAt = -1;
    return;
  }
  if (calloutBusy() && now - stampAt < STAMP_WAIT_MS) return;
  stampAt = -1;
  stamp(TIER_NAMES[stampTier], stampTier, '', 'tier', promptUp());
}

function tierUp(t: number): void {
  if (t <= 0) return;
  stampTier = Math.max(t, stampAt >= 0 ? stampTier : 0);
  if (stampAt < 0) stampAt = performance.now();
  tickTierStamp(performance.now());
  tierSound(t);
  style('tier');
}

function award(points: number, weight: number, label: string, tone: 'trick' | 'style'): void {
  const p = addPoints(points, true);
  chain.addStyle(p);
  pop(`${label} +${fmt(p)}`, tone);
  tierUp(chain.add(weight));
}

function payTrick(id: TrickId): void {
  chain.tricks++;
  award(trickPoints(id, chain.tier), trickWeight(id), TRICK_NAMES[id], 'trick');
  trickSound(id === 'TRIPLE' ? 3 : id === 'DOUBLE' || id === 'CORKSCREW' ? 2 : 1);
  style('trick');
}

function setPieceStyle(label: string): void {
  if (!live()) return;
  award(setPiecePoints(chain.tier), WEIGHTS.setPiece, label, 'style');
  style('trick');
}

function onBank(b: Bank | null, quiet = false): void {
  if (!b) return;
  addPoints(b.points, true);
  if (b.n >= 5 && !quiet) {
    pop(`COMBO x${b.n} +${fmt(b.points)}`, 'bank');
    bankSound(b.n);
  }
  style('bank');
}

function breakChain(): void {
  const lost = chain.break();
  if (lost >= 5) {
    showBroken(performance.now());
    brokenSound();
    style('broken');
  }
}

function add(weight: number, stylish = true): void {
  if (game.mode !== 'play') return;
  tierUp(chain.add(weight, stylish));
}

// ---------------------------------------------------------------- slow motion (real time, performance.now)
let slowAt = -1;
let slowCurve: SlowMo = NEAR_MISS_SLOWMO;
let lastSlowAt = -1e9;

function slowmoAllowed(nearMiss: boolean): boolean {
  if (prefs.reducedMotion || !live()) return false;
  // near-miss slow-mo never while the stage-1 tutorial is still teaching
  if (nearMiss && game.stage?.tutorial && !save.tutorialDone) return false;
  return true;
}
function startSlowmo(curve: SlowMo, cooldown: boolean): boolean {
  const now = performance.now();
  if (!slowmoAllowed(curve === NEAR_MISS_SLOWMO)) return false;
  if (cooldown && now - lastSlowAt < SLOWMO_COOLDOWN_MS) return false;
  lastSlowAt = now;
  slowAt = now;
  slowCurve = curve;
  slowmos++;
  setTimeScale(curve.k);
  vignette();
  if (curve === NEAR_MISS_SLOWMO) {
    whoosh();
    fovPunch(3);
  }
  duckMusic(-6, 0.3);
  style('slowmo');
  return true;
}
function stopSlowmo(): void {
  slowAt = -1;
  setTimeScale(1);
}

// ---------------------------------------------------------------- save (only ugcStats.bestChain / tricks)
function flush(): void {
  if (!hasRun) return;
  const st = save.ugcStats;
  const best = Math.max(st.bestChain, chain.bestChain);
  const addTricks = Math.max(0, chain.tricks - flushedTricks);
  if (best === st.bestChain && addTricks === 0) return;
  flushedTricks = chain.tricks;
  setSave({ ...save, ugcStats: { ...save.ugcStats, bestChain: best, tricks: st.tricks + addTricks } });
}

function summary(): StyleSummary {
  return {
    bestChain: chain.bestChain,
    tricks: chain.tricks,
    stylePoints: Math.round(chain.stylePoints),
    rank: !hasRun ? '' : game.mode === 'over' || game.mode === 'title' ? lastRank || rankFor(chain.stylePoints, G.distance) : rankFor(chain.stylePoints, G.distance),
  };
}

function resetRun(): void {
  chain.resetRun();
  tricks.reset();
  resetSpin();
  resetSetPieces();
  resetHudCombo();
  stopSlowmo();
  forgetSwing();
  setSpeedLineTier(0);
  flushedTricks = 0;
  lastRank = '';
  rankStampAt = -1;
  stampAt = -1;
  stageJumps = 0;
  hintThisJump = false;
}

const RANK_TIER: Record<Rank, number> = { S: 6, A: 3, B: 2, C: 0 };

function finishFlourish(): void {
  // banked quietly: the rank stamp's subtitle carries the best combo (no popup over it)
  onBank(chain.bank(), true);
  stampAt = -1;
  const rank = rankFor(chain.stylePoints, G.distance);
  lastRank = rank;
  startConfetti();
  if (!prefs.reducedMotion) {
    startSlowmo(FINISH_SLOWMO, false);
    startSwing(camera);
  }
  // after core's HOME! callout has had its moment (it sits right under the stamp)
  rankStampAt = performance.now() + RANK_STAMP_DELAY_MS;
}

const RANK_STAMP_DELAY_MS = 1150;
let rankStampAt = -1;
function tickRankStamp(now: number): void {
  if (rankStampAt < 0 || now < rankStampAt) return;
  rankStampAt = -1;
  if (game.mode !== 'finish' || !lastRank) return;
  const pts = Math.round(chain.stylePoints);
  const sub = pts > 0 ? `STYLE ${fmt(pts)}${chain.bestChain >= 5 ? ` - BEST COMBO ${chain.bestChain}` : ''}` : '';
  stamp(`RANK ${lastRank}`, RANK_TIER[lastRank], sub, 'rank');
  stingSound(lastRank);
}

/** predicted seconds until touchdown (plain gravity, from the current height and vertical speed); undefined on the
 *  ground, in a vault arc, or with no floor under her (a gap) */
function landIn(): number | undefined {
  if (P.grounded || P.mode === 'arc') return undefined;
  const g = TUNING.gravity;
  const h = P.mode === 'ride' ? P.y - P.base : P.y;
  const disc = P.vy * P.vy + 2 * g * Math.max(0, h);
  return (P.vy + Math.sqrt(disc)) / g;
}

// ---------------------------------------------------------------- results: the style row (rank, best combo, tricks)
let resRow: HTMLElement | null = null;
function showStyleRow(): void {
  resRow?.remove();
  resRow = null;
  if (!hasRun) return;
  const sum = summary();
  // nothing stylish happened (a dev jump, a quiet run): no row
  if (!sum.tricks && sum.bestChain < 5) return;
  const chips = document.getElementById('resChips');
  if (!chips?.parentElement) return;
  const row = document.createElement('div');
  row.id = 'resStyle';
  row.className = 'style-res';
  const part = (k: string, v: string, cls = '') => {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    const b = document.createElement('b');
    b.textContent = v;
    s.append(`${k} `, b);
    return s;
  };
  // the row brags: a C rank stays off it (the finish stamp still showed it)
  if (sum.rank && sum.rank !== 'C') row.append(part('RANK', sum.rank, `rank r${sum.rank}`));
  row.append(part('BEST COMBO', String(sum.bestChain)), part(sum.tricks === 1 ? 'TRICK' : 'TRICKS', String(sum.tricks)));
  // "8 TRICKS" reads better number-first
  const last = row.lastElementChild as HTMLElement;
  last.textContent = '';
  const nb = document.createElement('b');
  nb.textContent = String(sum.tricks);
  last.append(nb, ` ${sum.tricks === 1 ? 'TRICK' : 'TRICKS'}`);
  chips.after(row);
  resRow = row;
}

/**
 * Pre-warm the shaders a run meets in its first seconds (the shockwave rings, the pieces streamed in so far) with
 * compileAsync, so the first landing or set piece does not stall a frame on a shader compile. compileAsync gathers the
 * programs synchronously, so hidden meshes are shown for the call only.
 */
let warmT = 0;
function prewarm(): void {
  try {
    const ms = impactMeshes();
    const was = ms.map((m) => m.visible);
    for (const m of ms) m.visible = true;
    void renderer.compileAsync(scene, camera).catch(() => {});
    ms.forEach((m, i) => (m.visible = was[i]));
  } catch {
    /* optional */
  }
}

// ---------------------------------------------------------------- entry
export function registerStyle(): void {
  initHudCombo();
  provide({ styleSummary: summary });
  onScreen((s) => {
    if (s === 'results') showStyleRow();
  });

  events.on('stageStart', () => {
    flush();
    resetRun();
    hasRun = true;
    clearTimeout(warmT);
    warmT = window.setTimeout(prewarm, 250);
  });
  events.on('stageEnd', (e) => {
    stopSlowmo();
    forgetSwing();
    lastRank = rankFor(chain.stylePoints, e.result.distance);
    setSpeedLineTier(0);
    flush();
  });
  events.on('quit', () => {
    flush();
    stopSlowmo();
    forgetSwing();
    tricks.reset();
    resetSpin();
    setSpeedLineTier(0);
  });
  events.on('pause', stopSlowmo);
  events.on('respawn', () => {
    stopSlowmo();
    tricks.reset();
    resetSpin();
    resetSetPieces();
  });

  // ---- tricks
  events.on('jump', (e) => {
    tricks.jump(e);
    if (game.mode === 'play') stageJumps++;
    hintThisJump = false;
  });
  events.on('pounce', () => tricks.pounce());
  events.on('fastFall', () => tricks.fastFall());
  events.on('abilityPress', (e) => {
    if (game.mode !== 'play') return;
    const t = tricks.ability({ consumed: e.consumed, airborne: !P.grounded, mode: P.mode });
    if (!t) return;
    sessionSpins++;
    if (hud.prompt?.text === 'SPIN!') clearPrompt();
    // a queued 2nd / 3rd spin registers on screen at the press
    if (t === 'DOUBLE' || t === 'TRIPLE') pop(`SPIN x${t === 'DOUBLE' ? 2 : 3}!`, 'trick');
  });
  events.on('land', (e) => {
    if (hud.prompt?.text === 'SPIN!') clearPrompt();
    // vault style: the arc ended and she touched down without a hit
    if (sp.vault.landing) {
      sp.vault.landing = false;
      if (!sp.vault.hit) setPieceStyle('CLEAN VAULT');
    }
    const spin = tricks.spinAngle;
    const roll = tricks.rollAngle;
    const l = tricks.land(e);
    settleSpin(spin, roll);
    if (!l || !live()) return;
    if (l.sloppy) {
      pop('SLOPPY!', 'bad');
      sloppySound();
      return;
    }
    for (const id of l.paid) payTrick(id);
    if (l.paid.includes('PAW-DIVE')) {
      landingImpact(1);
      slamSound();
    }
  });
  events.on('hit', () => {
    tricks.hitNow();
    hitSetPieces();
    breakChain();
  });
  events.on('fall', () => {
    hitSetPieces();
    breakChain();
  });

  // ---- chain feeders
  events.on('pickup', (e) => add(e.kind === 'fish' ? WEIGHTS.fish : e.kind === 'bell' ? WEIGHTS.bell : WEIGHTS.pickup, e.kind === 'bell'));
  events.on('nearMiss', (e) => {
    add(WEIGHTS.nearMiss);
    const chaser = /dog|yarn/i.test(e.label);
    if (chain.links >= 5 || chaser) startSlowmo(NEAR_MISS_SLOWMO, true);
  });

  // ---- set-piece style
  events.on('abilityStart', (e) => {
    if (e.id === 'vault') {
      sp.vault.on = true;
      sp.vault.hit = false;
    } else if (e.id === 'cloud') {
      sp.cloud.on = true;
      sp.cloud.hit = false;
    }
  });
  events.on('abilityEnd', (e) => {
    if (e.id === 'vault' && sp.vault.on) {
      sp.vault.on = false;
      sp.vault.landing = true;
    } else if (e.id === 'cloud' && sp.cloud.on) {
      sp.cloud.on = false;
      if (!sp.cloud.hit && game.mode === 'play') setPieceStyle('CLOUD SURFER');
    }
  });
  events.on('surface', (e) => {
    if (game.mode !== 'play') return;
    for (const k of ['wall', 'river'] as const) {
      if (e.kind === k && e.prev !== k) {
        sp[k].on = true;
        sp[k].hit = false;
      } else if (e.prev === k && e.kind !== k && sp[k].on) {
        sp[k].on = false;
        if (!sp[k].hit) setPieceStyle(k === 'wall' ? 'WALL RUN' : 'RIVER RIDER');
      }
    }
  });
  events.on('chase', (e) => {
    const k = /yarn/i.test(e.kind) ? 'yarn' : 'dog';
    if (e.on) {
      sp[k].on = true;
      sp[k].hit = false;
    } else if (sp[k].on) {
      sp[k].on = false;
      if (!sp[k].hit && game.mode === 'play') setPieceStyle(k === 'dog' ? 'DOG DODGER' : 'YARN ESCAPE');
    }
  });

  events.on('finishLine', finishFlourish);

  // ---- simulation: tricks rotate and the chain window drains in sim time (slow-mo slows them too)
  addStepHook((dt) => {
    tricks.tick(dt, landIn());
    if (game.mode !== 'play') return;
    onBank(chain.tick(dt, !P.grounded));
    // teach the spin at take-off (a press then always lands clean), from the 2nd jump of a non-tutorial stage, on up
    // to HINT_MAX jumps until the player has spun once; it clears on the press or the landing
    if (
      hintCount < HINT_MAX &&
      !hintThisJump &&
      sessionSpins === 0 &&
      stageJumps >= 2 &&
      !game.stage?.tutorial &&
      P.mode === 'run' &&
      !P.grounded &&
      P.airTime > 0.03 &&
      P.airTime < 0.2 &&
      P.vy > 0 &&
      !P.ability &&
      !hud.prompt
    ) {
      hintCount++;
      hintThisJump = true;
      prompt('ability', 'SPIN!', 1.2);
    }
  });

  // ---- every frame: the rig post-rotation, the slow-mo curve, confetti, HUD, speed-line tier
  addFrameHook((dt) => {
    const now = performance.now();
    if (slowAt >= 0) {
      const k = slowmoScale(slowCurve, now - slowAt);
      if (k >= 1 || !live()) stopSlowmo();
      else setTimeScale(k);
    }
    tickConfetti(now);
    tickTierStamp(now);
    tickRankStamp(now);
    if (live()) applySpin(dt, tricks.spinAngle, tricks.rollAngle, SPIN_TIME);
    setSpeedLineTier(live() ? chain.tier : 0);
    if (dt > 0 || !live()) updateHudCombo(chain.links, chain.tier, chain.fraction, !P.grounded && chain.n > 0, now);
  });

  exposeTestHook('style', {
    state: () => ({
      chain: chain.links,
      tier: chain.tier,
      tricks: chain.tricks,
      stylePoints: Math.round(chain.stylePoints),
      bestChain: chain.bestChain,
      spinning: tricks.spinning || spinVisualActive(),
      timeScale: clock.scale,
      slowmos,
      swinging: swinging(),
      rank: summary().rank,
    }),
    /** jump the chain to n links (its tier follows); holdS keeps the window open that long */
    forceTier(n: number, holdS?: number): number {
      const before = chain.tier;
      const t = chain.force(n, holdS);
      if (t > before) tierUp(t);
      return t;
    },
    /** pay a trick as if it was just landed (plus a visual spin for the spins) */
    trick(id: string): boolean {
      if (!(TRICK_IDS as readonly string[]).includes(id)) return false;
      const tid = id as TrickId;
      payTrick(tid);
      if (tid === 'SPIN' || tid === 'DOUBLE' || tid === 'TRIPLE') demoSpin(tid === 'SPIN' ? 1 : tid === 'DOUBLE' ? 2 : 3);
      if (tid === 'PAW-DIVE') landingImpact(1);
      return true;
    },
    /** HUD rects for overlap checks (null = hidden) */
    rects: hudRects,
    summary,
  });
}
