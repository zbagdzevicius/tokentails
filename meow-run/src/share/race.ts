// Racing a challenger's ghost (SHARE lane): a translucent kitten in their look replays their run (track space, run
// time; it steps aside when it would sit inside Mochi), a small name tag of fixed screen size floats beside it (faded
// near Mochi, hidden behind the camera and while a prompt shows), a marker rides the progress bar, a HUD pill shows
// the SCORE gap at the same distance ("+12,300" / "-4,100"; metres too when the gap is over 20 m), callouts mark
// their finish, and the results card gets a win/lose banner.
import * as THREE from 'three';
import { camera, renderer, scene } from '../core/engine';
import { events } from '../core/events';
import { burst } from '../core/fx';
import { callout } from '../core/hud';
import { addFrameHook } from '../core/loop';
import { P } from '../core/player';
import { G, game } from '../core/state';
import { newFrame } from '../core/track';
import type { KittenRig, PlayerView, RunResult } from '../core/types';
import { save, setSave } from '../ui/flow';
import { fmtInt } from '../ui/format';
import { onScreen } from '../ugc/hub';
import { ugc } from '../ugc/contract';
import { decodeLook } from '../wardrobe/look';
import { active, challengeMatches, setChallenge } from './active';
import { F_ABILITY, F_SLIDE, ghostDuration, newPoint, sampleAt, unpackGhost, type Ghost } from './ghost';
import { scoreAt, unpackScores, type ScoreTrack } from './scores';

const MAX_GAP = 160;
/** the ghost steps this far aside when it would overlap Mochi */
const SIDE_STEP = 0.9;
/** the tag: px tall (clamped), faded inside TAG_NEAR..TAG_FAR u of Mochi */
const TAG_MIN_PX = 26;
const TAG_MAX_PX = 44;
const TAG_NEAR = 4;
const TAG_FAR = 8;
const TAG_OPACITY = 0.8;

// ---------------------------------------------------------------- module temps (no per-frame allocation)
const fr = newFrame();
const pos = new THREE.Vector3();
const xAxis = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const pt = newPoint();
const vtmp = new THREE.Vector3();
const view: PlayerView & { base: number } = {
  s: 0,
  x: 0,
  y: 0,
  vy: 0,
  speed: 0,
  mode: 'run',
  surface: 'ground',
  grounded: true,
  sliding: false,
  sinceLand: 99,
  sinceJump: 99,
  sincePounce: 99,
  sinceHit: 99,
  landImpact: 0,
  airTime: 0,
  lean: 0,
  invuln: 0,
  wet: 0,
  ability: null,
  abilityT: 0,
  base: 0,
  world: { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(-1, 0, 0) },
};

let ghost: Ghost | null = null;
let scores: ScoreTrack | null = null;
/** the challenger's final score (the pill's fallback estimate scales it along the course) */
let finalScore = 0;
/** first ghost sample at or past Mochi's s (moves forward only) */
let gi = 0;
/** the eased sideways step (u) */
let push = 0;
let tagAspect = 4;
let progEl: HTMLElement | null = null;
let progShown = false;
let promptEl: HTMLElement | null = null;
let rig: KittenRig | null = null;
let ownMats: THREE.Material[] = [];
let fallbackGeo: THREE.BufferGeometry | null = null;
let tag: THREE.Sprite | null = null;
let shownName = '';
let calledFinish = false;
let calledPassed = false;
let vanished = false;
let abilityT0 = 0;
let lastX = 0;
let lastY = 0;
let ghostFinished = false;
let ghostEndS = 0;
let visible = false;

let pill: HTMLElement | null = null;
let pillTxt = '';
let pillCls = '';
let banner: HTMLElement | null = null;
/** this run is against the active challenge (with or without a ghost) */
let racing = false;

export const race = {
  get active() {
    return !!ghost && !!rig;
  },
  get visible() {
    return visible;
  },
  get samples() {
    return ghost?.n ?? 0;
  },
  get s() {
    return ghost ? pt.s : 0;
  },
};

// ---------------------------------------------------------------- the ghost rig
/** WARDROBE's ghost rig is already translucent; the stand-in rig (before WARDROBE lands) is made so here */
function ghostify(root: THREE.Object3D): void {
  let translucent = false;
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if (mm.transparent && mm.opacity < 0.7) translucent = true;
  });
  root.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
    const mesh = o as THREE.Mesh;
    if (translucent || !mesh.material) return;
    const one = (mm: THREE.Material): THREE.Material => {
      // inverted-hull outlines read as a dark shell through a translucent body: hide them
      if (mm.side === THREE.BackSide) {
        mesh.visible = false;
        return mm;
      }
      const c = mm.clone();
      c.transparent = true;
      c.opacity = 0.42;
      c.depthWrite = false;
      ownMats.push(c);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(one) : one(mesh.material);
  });
}

/** the name only (the score race lives in the HUD pill), drawn at a fixed screen size (sizeAttenuation off) */
function makeTag(name: string): THREE.Sprite {
  const H = 96;
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const probe = document.createElement('canvas').getContext('2d')!;
  let size = 60;
  probe.font = `900 ${size}px ${font}`;
  while (probe.measureText(name).width > 420 && size > 30) probe.font = `900 ${(size -= 2)}px ${font}`;
  const W = Math.max(140, Math.min(512, Math.ceil(probe.measureText(name).width) + 64));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgba(36,50,74,0.78)';
  c.strokeStyle = '#2a1c14';
  c.lineWidth = 6;
  c.beginPath();
  c.roundRect(4, 4, W - 8, H - 8, 40);
  c.fill();
  c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `900 ${size}px ${font}`;
  c.fillStyle = '#fff7ea';
  c.fillText(name, W / 2, H / 2 + 3);
  tagAspect = W / H;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: TAG_OPACITY, sizeAttenuation: false });
  const sp = new THREE.Sprite(mat);
  // anchored at its bottom-left corner: it sits above and to the side of the ghost
  sp.center.set(0, 0);
  sp.renderOrder = 5;
  return sp;
}

function stopGhost(): void {
  if (rig) {
    scene.remove(rig.root);
    try {
      rig.dispose?.();
    } catch {
      /* the rig's own cleanup */
    }
    rig = null;
  }
  for (const m of ownMats) m.dispose();
  ownMats = [];
  fallbackGeo?.dispose();
  fallbackGeo = null;
  if (tag) {
    scene.remove(tag);
    tag.material.map?.dispose();
    tag.material.dispose();
    tag = null;
  }
  ghost = null;
  scores = null;
  visible = false;
  pill?.classList.remove('on');
  progEl?.classList.remove('on');
  progShown = false;
}

function startGhost(): void {
  const c = active.challenge;
  if (!c) return;
  ghost = unpackGhost(c.ghost);
  if (!ghost) return;
  scores = unpackScores(c.scores);
  finalScore = c.score;
  gi = 0;
  push = 0;
  let r: KittenRig | null = null;
  try {
    r = ugc.buildKitten(decodeLook(c.look), { ghost: true });
  } catch (err) {
    console.warn('ghost kitten failed, using a stand-in', err);
  }
  if (!r) {
    fallbackGeo = new THREE.CapsuleGeometry(0.4, 0.5, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffb36b, transparent: true, opacity: 0.42, depthWrite: false });
    ownMats.push(mat);
    const mesh = new THREE.Mesh(fallbackGeo, mat);
    mesh.position.y = 0.65;
    const g = new THREE.Group();
    g.add(mesh);
    r = { root: g, animate: () => {} };
  }
  rig = r;
  ghostify(rig.root);
  scene.add(rig.root);
  // pre-warm the translucent ghost shaders now (the run is still counting in), so the first sighting does not hitch;
  // compileAsync gathers the programs synchronously, so the rig can be hidden again right after the call
  try {
    void renderer.compileAsync(rig.root, camera, scene).catch(() => {});
  } catch {
    /* optional */
  }
  rig.root.visible = false;
  shownName = c.name || 'A Mochi fan';
  tag = makeTag(shownName);
  tag.visible = false;
  scene.add(tag);
  calledFinish = calledPassed = vanished = false;
  ghostEndS = ghost.s[ghost.n - 1];
  ghostFinished = Number.isFinite(G.finishS) && ghostEndS >= G.finishS - 1;
  lastX = ghost.x[0];
  lastY = ghost.y[0];
  view.sinceLand = view.sinceJump = 99;
  pillTxt = pillCls = '';
}

/** the challenger's score when they first reached s (their run time there, then their score track at that time) */
function theirScoreAt(s: number): number {
  const g = ghost;
  if (!g) return finalScore;
  const endS = g.s[g.n - 1];
  if (s >= endS) return finalScore;
  if (gi > 0 && g.s[gi] > s + 40) gi = 0; // a new run (dev jumps)
  while (gi < g.n - 1 && g.s[gi] < s) gi++;
  const i0 = Math.max(0, gi - 1);
  const s0 = g.s[i0];
  const s1 = g.s[gi];
  const t = (i0 + (s1 > s0 ? Math.max(0, Math.min(1, (s - s0) / (s1 - s0))) : 0)) / g.hz;
  if (scores) return scoreAt(scores, t);
  // an older link without a score track: their final score spread along their course
  const s00 = g.s[0];
  return finalScore * Math.max(0, Math.min(1, (s - s00) / Math.max(1, endS - s00)));
}

// ---------------------------------------------------------------- every frame
function frame(dt: number, t: number): void {
  if (!ghost || !rig) return;
  const track = game.track;
  const m = game.mode;
  if (!track || m === 'title') return;
  const tt = G.time;
  sampleAt(ghost, tt, pt);
  const ended = !pt.inside && tt > 0;
  const live = m === 'play' || m === 'finish';

  // callouts (only while the player is still running)
  if (m === 'play') {
    if (ghostFinished && !calledFinish && pt.s >= G.finishS - 0.5) {
      calledFinish = true;
      callout(`${shownName.toUpperCase()} FINISHED!`, 'info');
    }
    if (!ghostFinished && ended && !calledPassed && P.s > ghostEndS) {
      calledPassed = true;
      callout(`PASSED ${shownName.toUpperCase()}!`, 'good');
    }
  }
  // a run that ended (out of hearts) fades out with a puff where it stopped
  const gone = ended && !ghostFinished && tt > ghostDuration(ghost) + 0.6;
  visible = !gone && pt.s >= track.start && pt.s <= track.length && Math.abs(pt.s - P.s) <= MAX_GAP;
  if (gone && !vanished) {
    vanished = true;
    if (Math.abs(pt.s - P.s) <= MAX_GAP && pt.s <= track.length) {
      track.toWorld(pt.s, pt.x, pt.y + 0.6, pos);
      burst(pos, 14, 0xfff7ea, 3, 0.6, 0.35, 2, 0.8);
    }
  }
  rig.root.visible = visible;
  if (tag) tag.visible = visible;
  // overlapping Mochi: step aside so it reads as a rival beside her, not inside her
  const dx = pt.x - P.x;
  const ds = Math.abs(pt.s - P.s);
  let want = 0;
  if (ds < 3 && Math.abs(dx) < SIDE_STEP) {
    const half = Math.max(1, track.widthAt(pt.s) / 2 - 0.45);
    let dir = dx >= 0 ? 1 : -1;
    if (Math.abs(P.x + dir * SIDE_STEP) > half) dir = -dir;
    want = (dir * SIDE_STEP - dx) * Math.min(1, (3 - ds) / 1.5);
  }
  if (dt > 0) push += (want - push) * Math.min(1, dt * 8);
  const gx = pt.x + push;
  if (visible) {
    track.sample(pt.s, fr);
    pos.copy(fr.pos).addScaledVector(fr.right, gx).addScaledVector(fr.up, pt.y);
    xAxis.copy(fr.right).negate();
    m4.makeBasis(xAxis, fr.up, fr.fwd);
    rig.root.quaternion.setFromRotationMatrix(m4);
    rig.root.position.copy(pos);
    // the PlayerView the rig animates from
    const grounded = pt.y < 0.05;
    if (dt > 0) {
      if (grounded && !view.grounded) {
        view.sinceLand = 0;
        view.landImpact = Math.max(0, -view.vy);
      }
      if (!grounded && view.grounded) view.sinceJump = 0;
      view.sinceLand += dt;
      view.sinceJump += dt;
      view.vy = (pt.y - lastY) / dt;
      view.lean = Math.max(-1, Math.min(1, (pt.x - lastX) / dt / 11));
      view.airTime = grounded ? 0 : view.airTime + dt;
    }
    lastX = pt.x;
    lastY = pt.y;
    view.s = pt.s;
    view.x = pt.x;
    view.y = pt.y;
    view.speed = ended && ghostFinished ? 0 : pt.speed;
    view.grounded = grounded;
    view.sliding = (pt.flags & F_SLIDE) !== 0;
    view.surface = fr.kind;
    const ab = (pt.flags & F_ABILITY) !== 0 ? (fr.kind === 'cloud' ? 'cloud' : fr.kind === 'river' ? null : 'vault') : null;
    if (ab && !view.ability) abilityT0 = tt;
    view.ability = ab;
    view.abilityT = ab ? Math.min(1, (tt - abilityT0) / 1.1) : 0;
    view.mode = ghostFinished && pt.s >= G.finishS ? 'finish' : ab === 'vault' ? 'arc' : ab === 'cloud' ? 'ride' : 'run';
    view.world.pos.copy(pos);
    view.world.fwd.copy(fr.fwd);
    view.world.up.copy(fr.up);
    view.world.right.copy(fr.right);
    try {
      rig.animate(dt, t, view);
    } catch (err) {
      console.warn('ghost animate failed', err);
      stopGhost();
      return;
    }
    if (tag) {
      // above and to the outside of the ghost; a fixed 26..44 px tall on screen; faded near Mochi; hidden behind
      // the camera and while a prompt is up (it must never hide what is coming)
      const out = gx - P.x >= 0 ? 1 : -1;
      tag.position.copy(pos).addScaledVector(fr.up, 1.55).addScaledVector(fr.right, 0.45 * out);
      const H = Math.max(1, innerHeight);
      const px = Math.max(TAG_MIN_PX, Math.min(TAG_MAX_PX, H * 0.045));
      const sy = (2 * px) / (H * Math.max(0.1, camera.projectionMatrix.elements[5]));
      tag.scale.set(sy * tagAspect, sy, 1);
      // a tag to the left of the ghost grows leftwards
      tag.center.set(out >= 0 ? 0 : 1, 0);
      vtmp.copy(tag.position).applyMatrix4(camera.matrixWorldInverse);
      promptEl ??= document.getElementById('prompt');
      const near = Math.max(0, Math.min(1, (ds - TAG_NEAR) / (TAG_FAR - TAG_NEAR)));
      const a = vtmp.z < -1 && !(promptEl && !promptEl.classList.contains('hidden')) ? TAG_OPACITY * near : 0;
      tag.material.opacity = a;
      tag.visible = a > 0.02;
    }
  }

  // the progress-bar marker (campaign and trails: the course has a finish)
  if (progEl) {
    const on = (live || m === 'paused') && Number.isFinite(G.finishS) && G.finishS > 0;
    if (on !== progShown) {
      progShown = on;
      progEl.classList.toggle('on', on);
    }
    if (on) progEl.style.left = `${(Math.max(0, Math.min(1, (ended ? ghostEndS : pt.s) / G.finishS)) * 100).toFixed(2)}%`;
  }

  // the HUD pill: the score gap at the same distance (+ = you lead), and the metres when they are far apart
  if (pill) {
    const on = live || m === 'paused';
    pill.classList.toggle('on', on);
    if (on) {
      const gap = Math.round(G.score - theirScoreAt(P.s));
      const metres = Math.round(P.s - (ended ? ghostEndS : pt.s));
      const cls = gap > 0 || (gap === 0 && metres >= 0) ? 'ahead' : 'behind';
      const far = Math.abs(metres) > 20 ? ` · ${metres >= 0 ? '+' : '-'}${fmtInt(Math.abs(metres))} m` : '';
      const txt = `${gap >= 0 ? '+' : '-'}${fmtInt(Math.abs(gap))}${far}`;
      if (txt !== pillTxt) {
        pillTxt = txt;
        (pill.lastChild as HTMLElement).textContent = txt;
      }
      if (cls !== pillCls) {
        pill.classList.remove(pillCls || 'x');
        pill.classList.add(cls);
        pillCls = cls;
      }
    }
  }
}

// ---------------------------------------------------------------- results banner
function removeBanner(): void {
  banner?.remove();
  banner = null;
}
function showBanner(): void {
  removeBanner();
  const c = active.challenge;
  if (!c || active.won === null) return;
  const card = document.querySelector('#results .card');
  if (!card) return;
  const name = c.name || 'A Mochi fan';
  const b = document.createElement('div');
  b.className = `share-banner ${active.won ? 'won' : 'lost'}`;
  const big = document.createElement('b');
  const small = document.createElement('span');
  if (active.won) {
    big.textContent = `You beat ${name}'s ${fmtInt(c.score)}!`;
    small.textContent = 'Send it back with SHARE';
  } else if (active.myScore === c.score) {
    big.textContent = `A tie with ${name} at ${fmtInt(c.score)}!`;
    small.textContent = 'Rematch?';
  } else {
    big.textContent = `${name} wins by ${fmtInt(c.score - active.myScore)} - rematch?`;
    small.textContent = `Beat ${fmtInt(c.score)} to win`;
  }
  b.append(big, small);
  card.insertBefore(b, card.firstChild);
  banner = b;
}

function onRunEnd(r: RunResult): void {
  const c = active.challenge;
  if (!c || !racing) return;
  racing = false;
  active.myScore = r.score;
  active.won = r.score > c.score;
  if (active.won) setSave({ ...save, ugcStats: { ...save.ugcStats, challengesWon: save.ugcStats.challengesWon + 1 } });
}

export function initRace(): void {
  // the pill (HUD child, pointer-events none): "vs Mia +34 m"
  const hud = document.querySelector('.hud');
  if (hud) {
    pill = document.createElement('div');
    pill.id = 'sharePill';
    const vs = document.createElement('span');
    vs.className = 'vs';
    const gap = document.createElement('b');
    pill.append(vs, gap);
    hud.appendChild(pill);
  }
  // the challenger's marker on the progress bar
  const prog = document.getElementById('prog');
  if (prog) {
    progEl = document.createElement('i');
    progEl.id = 'progGhost';
    prog.appendChild(progEl);
  }
  events.on('stageLoad', () => stopGhost());
  events.on('quit', () => {
    racing = false;
    stopGhost();
  });
  events.on('stageStart', ({ stage }) => {
    removeBanner();
    stopGhost();
    racing = false;
    const c = active.challenge;
    if (!c) return;
    if (!challengeMatches(c, stage)) {
      setChallenge(null);
      return;
    }
    active.won = null;
    racing = true;
    startGhost();
    if (pill) (pill.firstChild as HTMLElement).textContent = `vs ${c.name || 'A Mochi fan'} `;
  });
  events.on('stageEnd', ({ result }) => onRunEnd(result));
  onScreen((s) => {
    if (s === 'results') showBanner();
  });
  addFrameHook(frame);
}
