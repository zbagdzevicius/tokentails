// The frame loop. FROZEN. Lanes that need a per-frame tick register it with addFrameHook (no edits here).
import { updateFish } from '../world/fish';
import { updatePeople } from '../world/people';
import { updateCars } from '../world/traffic';
import { updateWanted } from '../world/wanted';
import { updateCamera } from './camera';
import { camera, renderer, scene } from './engine';
import { updateEnemies } from './enemies';
import { stepParticles, updateFx, water } from './fx';
import { updateHud } from './hud';
import { updateCat, updateUltra } from './player';
import { tickSession } from './session';
import { C, G, game } from './state';
import { city } from './world';

export type FrameHook = (dt: number, t: number) => void;
const hooks: FrameHook[] = [];
/** Run fn every frame after the simulation and HUD, before render (also while paused, with dt = 0). Returns an unsubscribe. */
export function addFrameHook(fn: FrameHook): () => void {
  hooks.push(fn);
  return () => {
    const i = hooks.indexOf(fn);
    if (i >= 0) hooks.splice(i, 1);
  };
}

let last = performance.now();
let pausedFrames = 0;
let menuFrame = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (game.mode === 'paused') {
    for (let i = 0; i < hooks.length; i++) hooks[i](0, t);
    // the picture is frozen behind the pause card: draw it a couple of times, then about 4 fps (resizes, settings)
    if (pausedFrames++ < 2 || pausedFrames % 15 === 0) renderer.render(scene, camera);
    return;
  }
  pausedFrames = 0;
  if (G.hitStop > 0) {
    G.hitStop -= dt;
    dt *= 0.08;
  }
  tickSession(dt);
  updateCat(dt);
  updateCars(dt);
  updatePeople(dt, t);
  C.wet = 0; // enemies set it again through soak()
  updateEnemies(dt, t);
  if (C.wet && Math.random() < 0.6) water.spawn(C.pos.x + (Math.random() - 0.5) * 24, 30 + Math.random() * 20, C.pos.z + (Math.random() - 0.5) * 30, 0, -5, 0, 0.8, 1.2, 0x3fb4ff, -60, 0); // drips
  updateFish(dt, t);
  updateUltra(dt, t);
  updateWanted(dt, t);
  city.segs.step(dt);
  city.trees.step(dt);
  stepParticles(dt);
  updateCamera(dt);
  updateHud(dt);
  updateFx(dt, game.rig.swipeSide);
  for (let i = 0; i < hooks.length; i++) hooks[i](dt, t);
  // menus (title, map, cats, intro) show the attract city: 30 fps is plenty and saves phone battery
  if (game.mode === 'title' && menuFrame++ % 2 === 1) return;
  renderer.render(scene, camera);
}

export function startLoop(): void {
  last = performance.now();
  requestAnimationFrame(frame);
}
