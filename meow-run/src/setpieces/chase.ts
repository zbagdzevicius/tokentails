// Chases. SETPIECES lane.
// dog: a huge goofy dog (actor 'dog') bursts out of the bushes and bounds along the path edge beside Mochi. Every few
//   seconds it barks (the telegraph: "WOOF!" + a red chevron strip on its side of the path) and snaps inward; steer
//   to the far side. A clean dodge is a near miss ("CLOSE ONE!"); a hit makes the dog tumble over comically.
// yarnchase: giant yarn balls roll down the hill behind Mochi. Each one is announced (callout + chevron strip on the
//   lane it will take), thunders past on that lane and bounces off the path into the ravine; then the next one comes.
import * as THREE from 'three';
import { cameraPull, shake } from '../core/camera';
import { colliders } from '../core/collision';
import { camera } from '../core/engine';
import { events } from '../core/events';
import { burst } from '../core/fx';
import { callout, react } from '../core/hud';
import { placeOnTrack } from '../core/place';
import { P } from '../core/player';
import { actors, setPieceTypes } from '../core/registry';
import { addPoints, nearMiss } from '../core/score';
import type { ActorRig, ActorState, Collider, PieceCtx, SetPieceType } from '../core/types';
import { GEO, MAT, num, TEX } from './kit';
import { chasePlan, DOG } from './chaseplan';

const tmp = new THREE.Vector3();
const ndc = new THREE.Vector3();
/** portrait phones see less width: the dog bounds further ahead there, so it stays in frame */
const dogLead = () => DOG.lead + (camera.aspect < 1 ? 4.5 : 0);

/** a red chevron strip on the ground that follows the player (the chase telegraph) */
function warnStrip(ctx: PieceCtx): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const mat = new THREE.MeshBasicMaterial({ map: TEX.chevrons(), color: 0xff4a2e, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
  const tex = mat.map!.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  mat.map = tex;
  const m = new THREE.Mesh(GEO.plane(), mat);
  m.renderOrder = 4;
  m.visible = false;
  ctx.group.add(m);
  return { mesh: m, mat };
}
function placeStrip(ctx: PieceCtx, m: THREE.Mesh, s: number, x: number, w: number, len: number, t: number): void {
  placeOnTrack(m, ctx.track, s, x, 0.07);
  m.rotateX(-Math.PI / 2);
  m.rotateZ(Math.PI);
  m.scale.set(w, len, 1);
  const map = (m.material as THREE.MeshBasicMaterial).map!;
  map.repeat.set(Math.max(1, Math.round(w / 1.6)), len / 1.6);
  map.offset.y = -t * 2.2;
}

// ---------------------------------------------------------------- dog
const dog: SetPieceType = {
  id: 'dog',
  checkpoint: true,
  create(ctx) {
    const { s } = ctx.spec;
    const len = ctx.spec.len ?? 300;
    let side = num(ctx, 'side', -1) < 0 ? -1 : 1;
    const rig: ActorRig | null = actors.has('dog') ? actors.get('dog').build() : null;
    const root = rig?.root ?? new THREE.Group();
    root.visible = false;
    root.traverse((o) => ((o as THREE.Mesh).castShadow = ctx.quality === 'high'));
    ctx.group.add(root);
    const strip = warnStrip(ctx);
    const st: ActorState = { speed: 0, action: 'run' };
    const head: Collider = ctx.addCollider({ shape: 'sphere', s: -999, x: 0, y: 1, r: DOG.headR, kind: 'hurt', label: 'dog', near: false, once: false });
    head.enabled = false;

    let phase: 'wait' | 'enter' | 'run' | 'bark' | 'lunge' | 'back' | 'tumble' | 'exit' | 'gone' = 'wait';
    let pt = 0; // time in phase
    let nextBark = DOG.firstBark;
    let ds = 0; // dog s
    let rel = 0; // dog s relative to the kitten (tracks her exactly, no lag)
    let dx = 0;
    let dy = 0;
    let yaw = 0;
    let vOff = 0;
    let lungeMin = Infinity;
    let lungeHit = false;
    let barks = 0;
    let exited = false;
    const hw = () => ctx.track.widthAt(P.s) / 2;
    const go = (p: typeof phase) => {
      phase = p;
      pt = 0;
    };
    const offHit = events.on('hit', (e) => {
      if (phase === 'lunge' && e.label === 'dog') lungeHit = true;
      if (phase === 'run' || phase === 'bark' || phase === 'back' || phase === 'lunge') {
        head.enabled = false;
        go('tumble');
      }
    });
    let chasing = false;
    const setChase = (on: boolean) => {
      if (chasing === on) return;
      chasing = on;
      events.emit('chase', { on, kind: 'dog' });
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    return {
      end: s + len + 30,
      update(dt, t) {
        pt += dt;
        ds = P.s + rel;
        const edge = hw() + DOG.edgeOut;
        switch (phase) {
          case 'wait':
            if (P.s >= s && P.mode === 'run') {
              go('enter');
              root.visible = true;
              rel = 12;
              dx = side * (edge + 7);
              setChase(true);
              callout('WOOF WOOF!', 'bad');
              react('scared');
              shake(0.5);
              events.emit('setPiece', { id: 'dog', phase: 'start' });
            }
            break;
          case 'enter': {
            // bursts out of the bushes ahead-side and lands beside the path
            const u = Math.min(1, pt / DOG.enterT);
            rel = lerp(12, dogLead(), u);
            dx = lerp(side * (edge + 7), side * edge, u);
            dy = Math.sin(u * Math.PI) * 3;
            st.action = 'leap';
            if (u >= 1) {
              dy = 0;
              go('run');
              tmp.copy(root.position);
              burst(tmp, 30, 0x6fbf3a, 7, 0.8, 0.45, 10, 1);
              shake(0.4);
            }
            break;
          }
          case 'run':
          case 'back': {
            const want = dogLead() + Math.sin(t * 1.3) * 0.8;
            rel = lerp(rel, want, Math.min(1, dt * (phase === 'back' ? 3 : 4)));
            dx = lerp(dx, side * edge, Math.min(1, dt * 5));
            dy = 0;
            yaw = lerp(yaw, 0, Math.min(1, dt * 6));
            st.action = 'run';
            if (phase === 'back' && pt > DOG.backT) go('run');
            if (P.s >= s + len) {
              go('exit');
              break;
            }
            if (phase === 'run' && (nextBark -= dt) <= 0 && P.s < s + len - DOG.minRoomToBark) {
              go('bark');
              barks++;
              callout('WOOF!', 'bad');
              react('scared');
            }
            break;
          }
          case 'bark': {
            st.action = 'bark';
            rel = lerp(rel, dogLead() + 0.5, Math.min(1, dt * 4));
            dx = lerp(dx, side * edge, Math.min(1, dt * 5));
            yaw = lerp(yaw, side * 0.6, Math.min(1, dt * 6));
            if (pt >= DOG.barkT) {
              go('lunge');
              lungeMin = Infinity;
              lungeHit = false;
              head.enabled = true;
            }
            break;
          }
          case 'lunge': {
            const u = Math.min(1, pt / DOG.lungeT);
            const reach = Math.sin(u * Math.PI);
            st.action = 'leap';
            // swerves in beside Mochi: drops back until its head is level with her
            rel = lerp(rel, -DOG.headFwd + 0.4, Math.min(1, dt * 10));
            dx = side * (edge - DOG.reach * reach);
            dy = reach * 0.6;
            yaw = side * (0.25 + reach * 0.35);
            // the head sits forward and inward of the body
            ds = P.s + rel;
            head.s = ds + DOG.headFwd;
            head.x = dx - side * DOG.headIn;
            head.y = 1.1;
            const lat = Math.abs(P.x - head.x) - DOG.headR - 0.4;
            lungeMin = Math.min(lungeMin, lat);
            if (u >= 1) {
              head.enabled = false;
              head.s = -999;
              if (!lungeHit && lungeMin < DOG.nearMiss && lungeMin >= 0) nearMiss('dog');
              go('back');
              nextBark = chasePlan(barks, 'dog');
              if (barks % 2 === 0) {
                // hop to the other side of the path behind Mochi
                side = -side as 1 | -1;
              }
            }
            break;
          }
          case 'tumble': {
            // comic tumble: rolls over and drops back, then gets up and keeps chasing
            st.action = 'tumble';
            rel = lerp(rel, -10, Math.min(1, dt * 2));
            dy = 0;
            if (pt > DOG.tumbleT) {
              go('back');
              nextBark = chasePlan(barks, 'dog') + 0.6;
            }
            if (P.s >= s + len) go('exit');
            break;
          }
          case 'exit': {
            const u = Math.min(1, pt / 1.2);
            st.action = u < 0.5 ? 'bark' : 'tumble';
            rel = lerp(rel, -14, Math.min(1, dt * 2));
            dx = lerp(dx, side * (edge + 9), Math.min(1, dt * 2));
            if (!exited) {
              exited = true;
              setChase(false);
              addPoints(300);
              callout('PHEW!');
              react('happy');
              events.emit('setPiece', { id: 'dog', phase: 'end' });
            }
            if (u >= 1) {
              go('gone');
              root.visible = false;
            }
            break;
          }
          case 'gone':
            break;
        }
        // warn strip while barking: the zone the snap will sweep
        const warn = phase === 'bark' || (phase === 'lunge' && pt < DOG.lungeT * 0.6);
        strip.mesh.visible = warn;
        if (warn) {
          const zoneW = DOG.reach + DOG.headR + 0.4;
          strip.mat.opacity = phase === 'bark' ? 0.5 + 0.4 * Math.abs(Math.sin(pt * 14)) : 0.8;
          placeStrip(ctx, strip.mesh, P.s + 3, side * (hw() - zoneW / 2), zoneW, 10, t);
        }
        ds = P.s + rel;
        if (root.visible) {
          // keep its body inside the frame while it bounds alongside (visual only, eased; the snap's collider is
          // the head, and the offset fades out during the lunge)
          let need = 0;
          if (phase === 'run' || phase === 'back' || phase === 'bark') {
            for (let k = 0; k < 8; k++) {
              placeOnTrack(root, ctx.track, ds, dx - side * need, dy, true);
              ndc.copy(root.position).addScaledVector(P.world.up, 1.6).project(camera);
              if (Math.abs(ndc.x) <= (camera.aspect < 1 ? 0.62 : 0.8) || ndc.z > 1) break;
              need += 0.45;
            }
          }
          vOff += (need - vOff) * Math.min(1, dt * 6);
          placeOnTrack(root, ctx.track, ds, dx - side * vOff, dy, true);
          root.rotateY(yaw);
          st.speed = P.speed;
          rig?.animate(dt, t, st);
        }
      },
      dispose() {
        offHit();
        setChase(false);
        rig?.dispose?.();
        strip.mat.map?.dispose();
        strip.mat.dispose();
      },
    };
  },
};

// ---------------------------------------------------------------- giant yarn balls
let wrapG: THREE.BufferGeometry | null = null;
let wrapM: THREE.MeshStandardMaterial | null = null;
const wrapGeo = () => {
  if (!wrapG) {
    wrapG = new THREE.TorusGeometry(1, 0.022, 4, 48);
    wrapG.userData.shared = true;
  }
  return wrapG;
};
const wrapMat = () => (wrapM ??= new THREE.MeshStandardMaterial({ color: 0x18a99c, roughness: 0.95 }));
let outlineM: THREE.MeshBasicMaterial | null = null;
/** inverted-hull dark outline (toon look, reads against any background) */
const outlineMat = () => (outlineM ??= new THREE.MeshBasicMaterial({ color: 0x3a0f2a, side: THREE.BackSide }));
let bigYarnGeo: THREE.BufferGeometry | null = null;
function bigYarn(): THREE.BufferGeometry {
  if (bigYarnGeo) return bigYarnGeo;
  bigYarnGeo = new THREE.SphereGeometry(1, 28, 20);
  bigYarnGeo.userData.shared = true;
  return bigYarnGeo;
}

const yarnchase: SetPieceType = {
  id: 'yarnchase',
  checkpoint: true,
  create(ctx) {
    const { s } = ctx.spec;
    const len = ctx.spec.len ?? 400;
    const R = num(ctx, 'r', 2.2);
    const ball = new THREE.Group();
    const sphere = new THREE.Mesh(bigYarn(), MAT.yarnBig());
    sphere.scale.setScalar(R);
    sphere.rotation.z = Math.PI / 2; // poles on the rolling axis: the strands wrap around the ball as it rolls
    sphere.castShadow = ctx.quality === 'high';
    const strand = new THREE.Mesh(GEO.yarnTail(), MAT.yarnBig());
    strand.scale.setScalar(R * 1.4);
    strand.position.set(0, 0, 0);
    const outline = new THREE.Mesh(bigYarn(), outlineMat());
    outline.scale.setScalar(R * 1.07);
    const roll = new THREE.Group();
    roll.add(sphere, strand);
    ball.add(outline);
    // loose wraps crossing the ball
    for (let i = 0; i < 7; i++) {
      const wrap = new THREE.Mesh(wrapGeo(), wrapMat());
      wrap.scale.setScalar(R * (1.002 + (i % 3) * 0.004));
      wrap.rotation.set(i * 1.37 + 0.3, i * 2.11, i * 0.73);
      roll.add(wrap);
    }
    ball.add(roll);
    ball.visible = false;
    ctx.group.add(ball);
    const strip = warnStrip(ctx);
    const col: Collider = ctx.addCollider({ shape: 'sphere', s: -999, x: 0, y: R * 0.95, r: R * 0.92, kind: 'hurt', label: 'yarn ball', near: false, once: false });
    col.enabled = false;

    let phase: 'wait' | 'rest' | 'warn' | 'pass' | 'leave' | 'done' = 'wait';
    let pt = 0;
    let bs = 0;
    let bx = 0;
    let by = R;
    let lane = 1;
    let passes = 0;
    let minGap = Infinity;
    let hitThis = false;
    let restFor = 0.4;
    let chasing = false;
    const setChase = (on: boolean) => {
      if (chasing === on) return;
      chasing = on;
      events.emit('chase', { on, kind: 'yarn' });
    };
    const offHit = events.on('hit', (e) => {
      if (e.label === 'yarn ball') hitThis = true;
    });
    const go = (p: typeof phase) => {
      phase = p;
      pt = 0;
    };
    const hw = () => ctx.track.widthAt(P.s) / 2;
    /** a golden bell on the path in the next pass: hold the ball until Mochi has it (or is past it) */
    const bellAhead = () => {
      const reach = Math.max(10, P.speed) * 3.4;
      for (const c of colliders()) if (c.enabled && c.label === 'bell' && c.s > P.s - 2 && c.s < P.s + reach) return true;
      return false;
    };
    return {
      end: s + len + 40,
      update(dt, t) {
        pt += dt;
        switch (phase) {
          case 'wait':
            if (P.s >= s && P.mode === 'run') {
              setChase(true);
              callout('GIANT YARN!', 'bad');
              react('scared');
              shake(0.6);
              // the reveal: the camera pulls back and up so the first ball is seen rolling in behind Mochi
              cameraPull(9, 3, 3);
              restFor = 1.0; // let the camera settle back before the first ball shows
              events.emit('setPiece', { id: 'yarn', phase: 'start' });
              go('rest');
            }
            break;
          case 'rest':
            ball.visible = false;
            if (P.s >= s + len) {
              go('done');
              setChase(false);
              addPoints(300);
              callout('PHEW!');
              react('happy');
              events.emit('setPiece', { id: 'yarn', phase: 'end' });
              break;
            }
            if (pt >= restFor && P.s < s + len - 40 && !bellAhead()) {
              // pick the lane away from where Mochi is now on odd passes, toward her on even ones
              lane = chasePlan(passes, 'yarn') > 0.5 ? (P.x >= 0 ? 1 : -1) : P.x >= 0 ? -1 : 1;
              go('warn');
              callout(lane > 0 ? 'GO LEFT!' : 'GO RIGHT!', 'bad');
              // rear-view cue: the HUD flashes an arrow at the bottom on the incoming lane
              events.emit('setPiece', { id: 'yarn', phase: lane > 0 ? 'incoming-right' : 'incoming-left' });
            }
            break;
          case 'warn':
            if (pt > 0.35) shake(0.12 + pt * 0.12); // the rumble grows as it comes
            if (passes === 0) {
              // first ball: already visible, rolling up behind Mochi on its lane while the camera is pulled back
              const u = Math.min(1, pt / 1.15);
              bs = P.s - 8 + 3.4 * u;
              bx = lane * (hw() - R + 0.3);
              by = R + Math.abs(Math.sin(pt * 5)) * 0.35;
              roll.rotation.x += ((P.speed + 3.4 / 1.15) * dt) / R;
              ball.visible = true;
            }
            if (pt >= 1.15) {
              go('pass');
              // it rolls in from just ahead of the camera (never through it) and thunders past on its lane
              bs = P.s - 4.6;
              bx = lane * (hw() - R + 0.3);
              by = R;
              minGap = Infinity;
              hitThis = false;
              ball.visible = true;
              col.enabled = true;
              shake(0.35);
            }
            break;
          case 'pass': {
            const v = P.speed + 11;
            bs += v * dt;
            roll.rotation.x += (v * dt) / R;
            by = R + Math.abs(Math.sin(pt * 5)) * 0.35;
            col.s = bs;
            col.x = bx;
            col.y = by;
            const gap = Math.hypot(P.s - bs, P.x - bx, Math.max(0, P.y + 0.5 - by)) - R * 0.92 - 0.4;
            if (Math.abs(P.s - bs) < R + 1) minGap = Math.min(minGap, gap);
            if (bs > P.s + R + 1 && col.enabled) {
              col.enabled = false;
              if (!hitThis && minGap < 1.1 && minGap >= 0) nearMiss('yarn');
            }
            if (bs > P.s + 16) go('leave');
            break;
          }
          case 'leave': {
            // bounces off the path edge into the ravine
            const v = P.speed + 10;
            bs += v * dt;
            roll.rotation.x += (v * dt) / R;
            bx += lane * dt * 14;
            by = R + Math.sin(Math.min(1, pt / 0.5) * Math.PI) * 2.5 - Math.max(0, pt - 0.5) * 18;
            if (pt > 0.18 && pt - dt <= 0.18) {
              tmp.copy(ball.position);
              burst(tmp, 26, 0xd9b27a, 8, 0.9, 0.5, 10, 0.8);
            }
            if (pt > 1.2) {
              ball.visible = false;
              passes++;
              restFor = 0.9 + (passes % 2) * 0.6;
              go('rest');
            }
            break;
          }
          case 'done':
            break;
        }
        const warn = phase === 'warn' || (phase === 'pass' && bs < P.s);
        strip.mesh.visible = warn;
        if (warn) {
          strip.mat.opacity = 0.4 + 0.35 * Math.abs(Math.sin(t * 12));
          const zw = R * 2;
          placeStrip(ctx, strip.mesh, P.s + 4, lane * (hw() - R + 0.3), zw, 16, t);
        }
        if (ball.visible) placeOnTrack(ball, ctx.track, bs, bx, by, true);
      },
      dispose() {
        offHit();
        setChase(false);
        strip.mat.map?.dispose();
        strip.mat.dispose();
      },
    };
  },
};

export function registerChases(): void {
  for (const t of [dog, yarnchase]) setPieceTypes.add(t);
}
