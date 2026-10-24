// The clip's hype timeline (browser): while capture records, a light log of what the DOM HUD showed (tier and rank
// stamps, trick popups, core callouts, the combo count) plus a 10 Hz sample of the score and of where Mochi (and a
// chaser) sit across the screen, all stamped with the capture clock (recNow). The clip render reads it to paint the
// hype layer into the video and to steer the 9:16 crop. No per-frame JS during play: events append, a 100 ms timer
// samples. Old entries are dropped once they are older than anything the ring can still hold.
import * as THREE from 'three';
import { camera } from '../core/engine';
import { colliders } from '../core/collision';
import { events } from '../core/events';
import { P } from '../core/player';
import { G, game } from '../core/state';
import { onHype } from '../ugc/hype';
import { isRecording, recNow } from './capture';
import { newTimeline, pushMark, pushSample, prune, type Timeline } from './hype';

export const timeline: Timeline = newTimeline();

const SAMPLE_MS = 100;
const KEEP_SECONDS = 40;
const v3 = new THREE.Vector3();
let timer = 0;
let chaseOn = false;

/** Mochi's (and the nearest chaser's) screen x, 0..1 of the canvas width (NaN = off screen) */
function screenX(): [number, number] {
  v3.copy(P.world.pos).addScaledVector(P.world.up, 0.5).project(camera);
  const mx = Math.abs(v3.z) <= 1 ? (v3.x + 1) / 2 : NaN;
  let cx = NaN;
  if (chaseOn && game.track) {
    let best = 1e9;
    for (const c of colliders()) {
      if (c.kind !== 'hurt' || !/dog|yarn/.test(c.label ?? '')) continue;
      const d = Math.abs(c.s - P.s);
      if (d > 14 || d >= best) continue;
      best = d;
      game.track.toWorld(c.s, c.x, c.y + 0.4, v3);
      v3.project(camera);
      cx = Math.abs(v3.z) <= 1 && v3.x > -1.4 && v3.x < 1.4 ? (v3.x + 1) / 2 : NaN;
    }
  }
  return [mx, cx];
}

function sample(): void {
  if (!isRecording()) return;
  if (game.mode !== 'play' && game.mode !== 'finish') return;
  const [mx, cx] = screenX();
  pushSample(timeline, recNow(), G.score, mx, cx);
  prune(timeline, recNow() - KEEP_SECONDS);
}

let installed = false;
export function installTimeline(): void {
  if (installed) return;
  installed = true;
  onHype((e) => {
    if (!isRecording()) return;
    pushMark(timeline, recNow(), e.kind, e.text, e.sub, e.tier, e.n, e.tone);
  });
  events.on('callout', ({ text, tone }) => {
    if (!isRecording() || !text) return;
    pushMark(timeline, recNow(), 'callout', text, '', 0, 0, tone ?? '');
  });
  events.on('chase', (e) => (chaseOn = e.on));
  events.on('stageStart', () => {
    chaseOn = false;
    newTimeline(timeline);
    clearInterval(timer);
    timer = window.setInterval(sample, SAMPLE_MS);
  });
  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };
  events.on('quit', stop);
  events.on('stageEnd', () => {
    // one last sample on the final score (the finish bonus), then the timer stops
    if (isRecording()) pushSample(timeline, recNow(), G.score, NaN, NaN);
    stop();
  });
}
