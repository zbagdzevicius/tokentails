/**
 * L-DJ: the hero DJ kitten (ginger tabby, cream muzzle, big headphones) behind the decks on the
 * booth. Nods on the kick, scratches on the offbeat, rides the faders through builds, raises a
 * glowing sword at every drop while pink bows rain down, and points at (and shouts out) each new
 * cat. SPEC.md "DJ".
 *
 * Wiring: main already calls raiseSword() + confetti() on clock 'drop'. The DJ also subscribes to
 * 'drop' itself (types.ts: "Auto on every 'drop' event"); repeated calls within 300 ms are merged,
 * so both paths together still give exactly one sword and one burst.
 */
import { Group, Vector2, Vector3 } from 'three';
import { LAYOUT } from '../config';
import type { BeatClock, DjApi, FrameContext, QualityProfile, WorldApi } from '../types';
import { buildBows } from './bows';
import { buildBubble } from './bubble';
import { buildDecks } from './decks';
import { buildKitten, placePaw, placeSegment, type ArmRig } from './kitten';
import { createShared } from './materials';
import { RIG, clamp01, computePose, createPose, solveTwoBone, type PoseInput } from './motion';
import { buildSword } from './sword';

/** Minimum screen gap between the speech bubble and the raised sword's tip. */
const BUBBLE_SWORD_GAP_PX = 40;

/** L-DJ extras beyond DjApi (main may use them via `as DjExtApi`; see LANE-NOTES/L-DJ.md). */
export interface DjExtApi extends DjApi {
  /** Comic speech bubble over the DJ's head, highest priority ("Cat #10 just landed!"). */
  shout(text: string, seconds?: number): void;
  /** True while the sword is up (2 bars after each drop). */
  readonly swordUp: boolean;
}

/** Fur shell layers per tier (0 = no shells on low). */
export const SHELLS_BY_QUALITY = Object.freeze({ low: 0, mid: 5, high: 9 });
/** Bow capacity is allocated once at the highest tier; the tier sets the live limit. */
const BOW_CAPACITY = 1000;
/** Deck-space placement of the kitten's feet (behind the booth, −Z). */
const KITTEN_Y = -0.42;
const KITTEN_Z = -0.8;
const DEDUPE_MS = 300;

export const DROP_LINES = Object.freeze(['No sleep. Just grind.', 'Every $1 = 1 cat!', 'Fill the dance floor!', 'For Pink Paw!', 'Drop it!']);
export const WELCOME_LINES = Object.freeze(['Welcome to the rave!', 'New cat on the floor!', 'Look who just landed!']);

export function createDj(world: WorldApi, clock: BeatClock, profile: QualityProfile): DjExtApi {
  const S = LAYOUT.djScale;
  const shared = createShared();

  // Deck-space container at the booth top (DjApi.root).
  const root = new Group();
  root.name = 'dj';
  root.position.copy(world.boothTop);
  world.scene.add(root);

  const kitten = buildKitten(shared);
  kitten.root.scale.setScalar(S);
  kitten.root.position.set(0, KITTEN_Y, KITTEN_Z);
  root.add(kitten.root);

  const decks = buildDecks(shared, { bottomY: -world.boothTop.y, topY: KITTEN_Y, z: KITTEN_Z });
  root.add(decks.group);

  const sword = buildSword(shared);
  kitten.body.add(sword.group);

  const bubble = buildBubble();
  root.add(bubble.sprite);

  const bows = buildBows(BOW_CAPACITY, Math.min(BOW_CAPACITY, profile.confetti));
  world.scene.add(bows.mesh);

  let current = profile;
  kitten.setShells(SHELLS_BY_QUALITY[profile.quality]);

  // ---- state ----
  const pose = createPose();
  const poseIn: PoseInput = { beat: clock.now(), time: 0, swordP: -1, pointDir: null, pointK: 0, pointYaw: 0 };
  const bodyBase = kitten.body.position.clone();
  let time = 0;
  let swordStart = -1;
  let swordPending = false;
  let lastSwordCall = -Infinity;
  let lastConfettiCall = -Infinity;
  const pendingBursts: number[] = [];
  let trickle = 0;
  let pointTarget: Vector3 | null = null;
  let pointStart = -1;
  let pointPending = false;
  let nextBlink = 2;
  let blinkUntil = 0;
  let earTwitch = 0;
  let nextTwitch = 3;
  let dropLine = 0;
  let pendingLine: { text: string; at: number } | null = null;
  let welcomeLine = 0;
  let disposed = false;

  const barSeconds = () => (4 * 60) / (clock.bpm || 136);
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const api: DjExtApi = {
    root,
    get swordUp() {
      return swordStart >= 0;
    },
    headPosition(out: Vector3) {
      kitten.head.updateWorldMatrix(true, false);
      return kitten.head.localToWorld(out.set(0, 0.17, 0.02));
    },
    raiseSword() {
      const t = nowMs();
      if (t - lastSwordCall < DEDUPE_MS) return;
      lastSwordCall = t;
      swordPending = true;
    },
    confetti(amount?: number) {
      const t = nowMs();
      if (amount === undefined) {
        if (t - lastConfettiCall < DEDUPE_MS) return;
        lastConfettiCall = t;
      }
      const n = Math.max(0, Math.floor(amount ?? Math.round(current.confetti * 0.45)));
      if (n > 0) pendingBursts.push(Math.min(n, current.confetti));
    },
    pointAt(target: Vector3) {
      pointTarget = (pointTarget ?? new Vector3()).copy(target);
      pointPending = true;
      bubble.say(WELCOME_LINES[welcomeLine++ % WELCOME_LINES.length], 2.6, 2, time);
    },
    shout(text: string, seconds = 3.2) {
      bubble.say(text, seconds, 3, time);
    },
    update(frame: FrameContext) {
      if (disposed) return;
      const { dt, beat } = frame;
      time = frame.time;
      shared.uTime.value = time;
      shared.uKick.value = beat.kick;
      shared.uEnergy.value = beat.energy;

      // Triggers queued between frames start on this frame's clock.
      if (swordPending) {
        swordPending = false;
        swordStart = time;
      }
      if (pointPending) {
        pointPending = false;
        pointStart = time;
      }
      const swordDur = 2 * barSeconds();
      let swordP = swordStart >= 0 ? (time - swordStart) / swordDur : -1;
      if (swordP > 1) {
        swordStart = -1;
        swordP = -1;
      }

      // Point gesture: ease in, hold ~1 bar, ease out.
      let pointK = 0;
      if (pointStart >= 0 && pointTarget) {
        const t = time - pointStart;
        const dur = barSeconds() * 1.15;
        if (t > dur) pointStart = -1;
        else pointK = clamp01(t / 0.18) * clamp01((dur - t) / 0.35);
      }

      // ---- pose ----
      poseIn.beat = beat;
      poseIn.time = time;
      poseIn.swordP = swordP;
      poseIn.pointK = pointK;
      if (pointK > 0 && pointTarget) {
        // Direction from the right shoulder (body space) and the head yaw (kitten space).
        kitten.root.updateWorldMatrix(true, true);
        const local = kitten.body.worldToLocal(tmpA.copy(pointTarget));
        // Point with the paw on the target's side; aim a little high so the gesture reads.
        const left = local.x > 0;
        const sh = left ? RIG.shoulderL : RIG.shoulderR;
        dirTmp.set(sh[0], sh[1], sh[2]);
        dirTmp.subVectors(local, dirTmp).normalize();
        dirTmp.y = Math.max(dirTmp.y, 0.25);
        poseIn.pointDir = dirTmp.normalize();
        poseIn.pointLeft = left;
        const k = kitten.root.worldToLocal(tmpA.copy(pointTarget));
        poseIn.pointYaw = Math.max(-1, Math.min(1, Math.atan2(k.x, Math.max(0.2, k.z))));
      } else {
        poseIn.pointDir = null;
      }
      computePose(poseIn, pose);

      // ---- body + head ----
      const body = kitten.body;
      body.position.set(bodyBase.x, bodyBase.y + pose.bob, bodyBase.z);
      body.rotation.set(pose.lean, pose.twist, pose.sway);
      kitten.head.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
      if (time > nextTwitch) {
        earTwitch = 1;
        nextTwitch = time + 2 + Math.random() * 4;
      }
      earTwitch = Math.max(0, earTwitch - dt * 6);
      const tw = Math.sin(earTwitch * Math.PI * 3) * 0.25 * earTwitch;
      kitten.earL.rotation.z = -0.34 - pose.ear - tw;
      kitten.earR.rotation.z = 0.34 + pose.ear;
      kitten.tail.rotation.set(0.15 * Math.sin(time * 1.7), pose.tail * 0.5, pose.tail * 0.25);

      // ---- face ----
      if (time > nextBlink) {
        blinkUntil = time + 0.12;
        nextBlink = time + 2.2 + Math.random() * 3.5;
      }
      const happy = pose.eyes === 'happy';
      const eyeScale = pose.eyes === 'wide' ? 1.14 : 1;
      const blink = time < blinkUntil && !happy;
      for (const e of kitten.eyesOpen) {
        e.visible = !happy;
        e.scale.set(eyeScale, blink ? 0.12 : eyeScale, eyeScale);
      }
      for (const e of kitten.eyesHappy) e.visible = happy;
      const open = pose.mouth > 0.05;
      kitten.mouthOpen.visible = open;
      kitten.mouthOpen.scale.set(1, 0.3 + 0.9 * pose.mouth, 1);
      for (const m of kitten.mouthClosed) m.visible = !open;

      // ---- glow ----
      kitten.phonesGlow.color.setRGB(0.24, 1, 0.43).multiplyScalar(1.3 + 2.4 * beat.kick * (0.4 + beat.energy));
      if (beat.section === 'drop' && Math.floor(beat.beat) % 2 === 1) kitten.phonesGlow.color.setRGB(1, 0.31, 0.62).multiplyScalar(1.4 + 2 * beat.kick);
      kitten.padGlow.color.setRGB(1, 0.31, 0.62).multiplyScalar(1.2 + 1.3 * beat.kick);

      // ---- arms (IK in body space) ----
      kitten.root.updateWorldMatrix(true, true);
      const k = 1 - Math.exp(-dt * (pose.sword > 0 ? 26 : 18));
      solveArm(kitten.armR, pose.right, k);
      solveArm(kitten.armL, pose.left, k);

      // ---- sword in the right paw ----
      if (pose.sword > 0) {
        const sg = sword.group;
        sg.position.copy(kitten.armR.end);
        // Upright overhead: cancel the body lean, tip slightly in over the head.
        sg.rotation.set(-pose.lean + 0.04 * beat.kick, -pose.twist, -pose.sway - 0.1 + 0.04 * Math.sin(time * 3));
      }
      sword.update(time, beat.beat, beat.kick, pose.sword * 1.35);

      // ---- decks ----
      const p = beat.held ? 0.8 : beat.sectionProgress;
      const building = beat.held || beat.section === 'build';
      decks.update(beat, dt, {
        scratch: pose.scratch,
        xfader: pose.xfader,
        faderR: building ? -0.6 + 1.2 * p : 0.3 + 0.1 * Math.sin(beat.beat * 0.5),
        faderL: building ? -0.6 + 1.2 * p : 0.3,
        drop: pose.sword,
      });

      // ---- bows ----
      const center = world.boothTop;
      while (pendingBursts.length) {
        const n = pendingBursts.shift() as number;
        bows.burst(n, { cx: center.x, cy: center.y, cz: center.z, radius: 9, cannon: 0.35 });
      }
      if (pose.sword > 0.5) {
        // Keep it raining while the sword is up.
        trickle += dt * current.confetti * 0.12;
        const n = Math.floor(trickle);
        if (n > 0) {
          trickle -= n;
          bows.burst(n, { cx: center.x, cy: center.y, cz: center.z, radius: 10, cannon: 0 });
        }
      } else {
        trickle = 0;
      }
      bows.update(dt, beat.kick, frame.camera.position);

      // ---- speech bubble beside the head, on the side away from the sword ----
      if (pendingLine && time >= pendingLine.at) {
        bubble.say(pendingLine.text, 2.4, 1, time);
        pendingLine = null;
      }
      const head = api.headPosition(tmpB);
      // Camera-space x of the sword tip vs the head decides the side (default: right).
      let side: 1 | -1 = 1;
      if (pose.sword > 0.05) {
        sword.group.updateWorldMatrix(true, false);
        const tip = sword.group.localToWorld(tmpC.set(0, sword.tipY, 0));
        const cam = frame.camera;
        cam.updateMatrixWorld();
        const hx = tmpD.copy(head).applyMatrix4(cam.matrixWorldInverse).x;
        const sx = tip.applyMatrix4(cam.matrixWorldInverse).x;
        side = sx < hx ? 1 : -1;
      }
      bubble.setSide(side);
      // Constant-ish on-screen size: about a sixth of the view height whatever the shot.
      const camDist = frame.camera.position.distanceTo(head);
      let size = Math.min(2.6, Math.max(0.55, camDist * 0.17));
      // Offset along the camera's right axis so "beside the head" holds from any angle: clear of
      // the head (never over the upper body), then at least BUBBLE_SWORD_GAP_PX from the sword tip.
      const right = tmpD.set(1, 0, 0).applyQuaternion(frame.camera.quaternion);
      // Lower-right of the DJ (tail at shoulder height, the bubble reaching about head height), so
      // it never covers the moon or the raised sword.
      tmpA.copy(head).addScaledVector(right, side * (0.3 * LAYOUT.djScale * 0.6 + size * 0.16));
      tmpA.y -= size * 0.42;
      if (pose.sword > 0.05) keepOffSword(tmpA, right, side, size, frame.camera);
      keepBelowMoonCentre(tmpA, size, frame.camera);
      size = keepOnScreen(tmpA, right, side, size, frame.camera);
      root.worldToLocal(tmpA);
      bubble.sprite.position.copy(tmpA);
      bubble.update(time, beat.kick, size);
    },
    setQuality(p: QualityProfile) {
      current = p;
      kitten.setShells(SHELLS_BY_QUALITY[p.quality]);
      bows.setLimit(Math.min(BOW_CAPACITY, p.confetti));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offDrop();
      world.scene.remove(root);
      world.scene.remove(bows.mesh);
      kitten.dispose();
      decks.dispose();
      sword.dispose();
      bubble.dispose();
      bows.dispose();
    },
  };

  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpC = new Vector3();
  const tmpD = new Vector3();
  const dirTmp = new Vector3();
  const tmpE = new Vector3();
  const tmpF = new Vector3();
  const tmpG = new Vector3();
  const tmpH = new Vector3();
  const vp = new Vector2();

  /**
   * Pushes the bubble anchor (world, tail corner) along `right` until the bubble's screen rect is at
   * least BUBBLE_SWORD_GAP_PX from the sword tip. The sprite grows up and towards `side` from its
   * tail (center 0.14 / 0.86, 0.02), `size` world units wide, half as tall.
   */
  function keepOffSword(anchor: Vector3, right: Vector3, side: 1 | -1, size: number, cam: FrameContext['camera']) {
    world.renderer.getSize(vp);
    const tip = sword.group.localToWorld(tmpE.set(0, sword.tipY, 0)).project(cam);
    const a = tmpF.copy(anchor).project(cam);
    if (a.z > 1 || tip.z > 1) return;
    const ax = ((a.x + 1) / 2) * vp.x;
    const ay = ((1 - a.y) / 2) * vp.y;
    const tx = ((tip.x + 1) / 2) * vp.x;
    const ty = ((1 - tip.y) / 2) * vp.y;
    const b = tmpF.copy(anchor).addScaledVector(right, size).project(cam);
    const wpx = Math.abs(((b.x + 1) / 2) * vp.x - ax);
    if (!(wpx > 1)) return;
    const hpx = wpx * 0.5;
    const left = side > 0 ? ax - 0.14 * wpx : ax - 0.86 * wpx;
    const rightEdge = left + wpx;
    const g = BUBBLE_SWORD_GAP_PX;
    if (tx < left - g || tx > rightEdge + g || ty < ay - hpx - g || ty > ay + g) return;
    const needPx = side > 0 ? tx + g - left : rightEdge - (tx - g);
    anchor.addScaledVector(right, side * needPx * (size / wpx));
  }

  /**
   * Keeps the bubble inside the viewport (phone close-ups put it past the right edge): caps its
   * width at 46% of the view, then slides the anchor along `right` so both edges sit 8 px inside.
   * Returns the (possibly smaller) world size.
   */
  function keepOnScreen(anchor: Vector3, right: Vector3, side: 1 | -1, size: number, cam: FrameContext['camera']): number {
    world.renderer.getSize(vp);
    const a = tmpF.copy(anchor).project(cam);
    if (a.z > 1) return size;
    const ax = ((a.x + 1) / 2) * vp.x;
    const b = tmpG.copy(anchor).addScaledVector(right, size).project(cam);
    let wpx = Math.abs(((b.x + 1) / 2) * vp.x - ax);
    if (!(wpx > 1)) return size;
    const maxW = vp.x * 0.46;
    if (wpx > maxW) {
      size *= maxW / wpx;
      wpx = maxW;
    }
    const m = 8;
    const left = side > 0 ? ax - 0.14 * wpx : ax - 0.86 * wpx;
    const rightEdge = left + wpx;
    let shiftPx = 0;
    if (rightEdge > vp.x - m) shiftPx = vp.x - m - rightEdge;
    else if (left < m) shiftPx = m - left;
    if (shiftPx !== 0) anchor.addScaledVector(right, shiftPx * (size / wpx));
    return size;
  }

  /** Moves the anchor down (camera up axis) until the bubble's top is below the moon's centre on screen. */
  function keepBelowMoonCentre(anchor: Vector3, size: number, cam: FrameContext['camera']) {
    const m = tmpE.copy(world.moonCenter).project(cam);
    if (m.z > 1 || m.y > 1.5) return;
    const up = tmpF.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const top = tmpG.copy(anchor).addScaledVector(up, size * 0.5).project(cam);
    const a = tmpH.copy(anchor).project(cam);
    const perUnit = (top.y - a.y) / (size * 0.5);
    if (!(perUnit > 1e-6) || top.y <= m.y) return;
    anchor.addScaledVector(up, -(top.y - m.y) / perUnit);
  }

  function solveArm(arm: ArmRig, hand: typeof pose.right, k: number) {
    // Deck target → body space, blended with the free (body-space) target.
    const deckWorld = root.localToWorld(tmpB.copy(hand.deck));
    const deckBody = kitten.body.worldToLocal(deckWorld);
    deckBody.lerp(hand.body, clamp01(hand.w));
    if (!arm.primed) {
      arm.target.copy(deckBody);
      arm.primed = true;
    } else {
      arm.target.lerp(deckBody, k);
    }
    solveTwoBone(arm.shoulder, arm.target, RIG.upperArm, RIG.foreArm, arm.pole, arm.elbow, arm.end);
    placeSegment(arm.upper, arm.shoulder, arm.elbow);
    placeSegment(arm.fore, arm.elbow, arm.end);
    arm.elbowJoint.position.copy(arm.elbow);
    placePaw(arm.paw, arm.elbow, arm.end);
  }

  const offDrop = clock.on('drop', (payload) => {
    api.raiseSword();
    api.confetti();
    // The catchphrase waits one bar, so the sword-up moment reads clean first.
    if (payload.cause !== 'new-cat') pendingLine = { text: DROP_LINES[dropLine++ % DROP_LINES.length], at: time + barSeconds() };
  });

  return api;
}
