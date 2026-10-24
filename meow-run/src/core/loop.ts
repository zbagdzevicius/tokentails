// The frame loop. FROZEN. Fixed-step simulation (120 Hz) + one render per animation frame.
// Lanes hook in with addStepHook (simulation, fixed dt, only while the run is live) and addFrameHook
// (visuals, every frame, dt = 0 while paused). No edits here.
import { updateCamera } from './camera';
import { stepCollision } from './collision';
import { camera, renderer, sampleFps, scene } from './engine';
import { stepParticles } from './fx';
import { stepInput } from './input';
import { stepPlayer, updatePlayerVisual } from './player';
import { frameSession, stepSession } from './session';
import { game } from './state';

export const STEP = 1 / 120;
export type Hook = (dt: number, t: number) => void;
const stepHooks: Hook[] = [];
const frameHooks: Hook[] = [];
function add(list: Hook[], fn: Hook): () => void {
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}
/** fn(STEP, simTime) every fixed step while mode is 'play' or 'finish', after player, pieces, collision and session. */
export const addStepHook = (fn: Hook) => add(stepHooks, fn);
/** fn(dt, t) every rendered frame after camera + rig placement, before render (dt = 0 while paused). */
export const addFrameHook = (fn: Hook) => add(frameHooks, fn);

/** simulation clock (s), advances only while the run is live. scale = the slow-mo factor (1 = normal). */
export const clock = { sim: 0, frame: 0, scale: 1 };

/**
 * Slow motion (iteration 2, STYLE lane): 0.1..1 scales the simulation and the frame dt (camera, rig, particles, hooks).
 * Music and wall-clock UI are not scaled. The loop resets it to 1 whenever the run is not live (pause, results, title).
 */
export function setTimeScale(k: number): void {
  clock.scale = Math.max(0.1, Math.min(1, Number.isFinite(k) ? k : 1));
}

let last = 0;
let acc = 0;
let pausedFrames = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const t = now / 1000;
  clock.frame++;
  const live = game.mode === 'play' || game.mode === 'finish';
  if (!live) clock.scale = 1;
  const scaled = raw * clock.scale;
  if (live) {
    acc += scaled;
    let n = 0;
    while (acc >= STEP && n++ < 14) {
      acc -= STEP;
      clock.sim += STEP;
      stepInput(STEP);
      stepPlayer(STEP);
      stepSession(STEP, clock.sim); // pieces update inside (before collision so moved colliders count)
      stepCollision();
      for (let i = 0; i < stepHooks.length; i++) stepHooks[i](STEP, clock.sim);
      if (game.mode !== 'play' && game.mode !== 'finish') break;
    }
    if (acc > STEP) acc = 0; // fell too far behind: drop time rather than spiral
    sampleFps(raw);
  } else acc = 0;
  const dt = game.mode === 'paused' ? 0 : scaled;
  frameSession(dt, t);
  updatePlayerVisual(dt, t);
  updateCamera(dt, t);
  stepParticles(dt);
  for (let i = 0; i < frameHooks.length; i++) {
    try {
      frameHooks[i](dt, t);
    } catch (err) {
      console.error('frame hook failed', err);
      frameHooks.splice(i--, 1);
    }
  }
  // paused: the picture is frozen behind the card, redraw a few times a second only
  if (game.mode === 'paused' && pausedFrames++ % 10 !== 0) return;
  if (game.mode !== 'paused') pausedFrames = 0;
  renderer.render(scene, camera);
}

export function startLoop(): void {
  last = performance.now();
  requestAnimationFrame(frame);
}
