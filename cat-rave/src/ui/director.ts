/**
 * L-UI: camera director. Shots (hero, top-down vortex, crowd POV, DJ close-up, orbit, sweep), the
 * auto-director cutting on bar boundaries, drag-to-orbit / pinch-to-dolly that pause it for 12 s,
 * find-my-cat fly-to, drop shake and the viewer's own foreground paws. SPEC.md "Cameras".
 */
import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { LAYOUT } from '../config';
import type { BeatInfo, CrowdApi, Director, DjApi, FrameContext, ShotId, WorldApi } from '../types';
import { createForegroundPaws } from './paws';
import { MANUAL_IDLE_S, planShot, type ShotPlan } from './schedule';

/** Find my cat: the camera stays at least this far (m) from the focused cat. */
export const FOCUS_MIN_DIST = 3.4;

/** Hero over a big crowd: camera height (m) and the farthest it stands back (landscape). */
export const HERO_BIG_Y = 3.3;
export const HERO_BIG_MAX_Z = 10.5;
/** Landscape hero: aim this much (m) above the framing solution's booth-top target. */
export const HERO_AIM_LIFT = 0.4;

/**
 * Portrait hero pose for crowd extent `e`: `small` 1 = cat-eye height behind the front row (few
 * cats), 0 = above the sea of heads (big crowd), blended in between.
 */
export function portraitHero(e: number, vfovDeg: number, aspect: number, boothTopY: number) {
  const small = 1 - MathUtils.smoothstep(e, 7, 14);
  const th = Math.tan(MathUtils.degToRad(vfovDeg) / 2) * aspect;
  const bigZ = MathUtils.clamp((Math.min(e, 10) * 0.8) / th + 0.5, 7, 16);
  // Cat-eye: ~3.3 m behind the outermost front-row cat: the nearest raised paws fill the lower third.
  const smallZ = e + 3.3;
  const bigY = HERO_BIG_Y + Math.min(e, 30) * 0.01;
  return {
    small,
    z: MathUtils.lerp(bigZ, smallZ, small),
    y: MathUtils.lerp(bigY, 1.15, small),
    ty: MathUtils.lerp(boothTopY + 0.75, boothTopY + 0.7, small),
  };
}

/** Fewer cats than this: no auto top shot (a few cats on an empty floor). */
export const TOP_MIN_CATS = 150;

export interface DirectorOptions {
  auto?: boolean;
  reducedMotion?: boolean;
}

/** The Director plus hooks main.ts feeds from the beat clock and input. */
export interface RaveDirector extends Director {
  /** A drop happened (arrangement, viewer or new cat): shake + cut to top/hero. */
  onDrop(): void;
  /** Viewer tap: the foreground paws punch up. */
  onTap(): void;
  /**
   * New cats: cut to a landing shot on cat `index` (a few metres out, sky above it, so the drop-in
   * from 30 m falls through the frame) for `holdS` seconds, then hand back to the auto-director.
   * Ignored while the viewer steers the camera or a cat is focused.
   */
  landing(index: number, holdS?: number): void;
  /** Seconds a landing shot needs before a cat can start falling into it. */
  readonly landingLeadS: number;
  /** The index currently focused, or null. */
  readonly focused: number | null;
  /** Is the user steering (drag/pinch) right now or within the idle window? */
  readonly manual: boolean;
  dispose(): void;
}

interface Pose {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const UP = new Vector3(0, 1, 0);

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = MathUtils.clamp;

export function createDirector(world: WorldApi, crowd: CrowdApi, dj: DjApi, initial: ShotId | null, opts: DirectorOptions = {}): RaveDirector {
  const camera = new PerspectiveCamera(50, 1, 0.1, 700);
  camera.name = 'director';
  world.scene.add(camera); // camera children (the viewer's paws) render only when it is in the scene
  const paws = createForegroundPaws();
  camera.add(paws.root);

  const reducedMotion = !!opts.reducedMotion;
  let aspect = 1;
  let shot: ShotId = initial ?? 'hero';
  let auto = opts.auto ?? true;
  /** Shot locked by the viewer (picker / keys) while auto is off, or `?shot=`. */
  let shotUntilBar = -1;
  let shotStartTime = 0;
  let lastBar = -1;
  let lastSection: BeatInfo['section'] | null = null;
  let dropCount = 0;
  let pendingDropCut = false;

  // Transition (eased move between poses).
  const cur: Pose = { pos: new Vector3(0, 2, 9), target: new Vector3(0, 1.4, 0), fov: 50 };
  const from: Pose = { pos: new Vector3(), target: new Vector3(), fov: 50 };
  let blendT = 1;
  let blendDur = 1.4;
  let blendArc = 0;

  // Manual orbit.
  let manual = false;
  let manualUntil = 0;
  const manualTarget = new Vector3();
  const sph = new Spherical();
  let now = 0;

  // Find my cat.
  let focused: number | null = null;
  const focusPos = new Vector3();

  // New-cat landing shot.
  let landingIdx: number | null = null;
  let landingUntil = 0;
  const landingPos = new Vector3();
  const landingOn = () => landingIdx !== null && now < landingUntil && !manual && focused === null;

  // 0..1 eased vertical view offset while a cat is focused.
  let viewShift = 0;

  // Shake.
  let shake = 0;
  const desired: Pose = { pos: new Vector3(), target: new Vector3(), fov: 50 };

  const extent = () => Math.max(3.6, crowd.extentRadius || 0);

  /**
   * Landscape hero framing: camera distance from the horizontal fov so the crowd's width (up to
   * 10 m each side) fits, then the height that puts the nearest visible front row at ~72% of the
   * frame height. Cached per (extent, fov, aspect).
   */
  const heroCache = { key: '', z: 0, y: 0, ty: 0 };
  const heroFit = (e: number, vfovDeg: number) => {
    const key = `${e.toFixed(2)}|${vfovDeg.toFixed(2)}|${aspect.toFixed(3)}`;
    if (heroCache.key === key) return heroCache;
    const tv = Math.tan(MathUtils.degToRad(vfovDeg) / 2);
    const th = tv * aspect;
    const halfW = Math.min(e, 10) * 1.05;
    // The fit solves for the booth-top aim; the camera then aims HERO_AIM_LIFT higher, so the moon
    // sits in the upper half and the DJ and booth at ~55% of the frame height.
    const ty = world.boothTop.y + 0.75;
    const want = -0.44; // NDC y of the front row's raised paws (~72% down the frame)
    const headY = 1.2;
    const ndcAt = (y: number, z: number, pz: number) => Math.tan(Math.atan2(headY - y, z - pz) - Math.atan2(ty - y, z)) / tv;
    let z = clamp(halfW / th, 5.2, 14);
    let y = 2;
    // Step back until a camera height exists that puts the front row at `want` (a lower camera
    // raises the near heads on screen), then find that height by bisection.
    // A big crowd surrounds the camera: stand like a raver a head above the cats and let the sea of
    // paws overflow the frame (the reference look) instead of chasing a front row behind us.
    // Also when the crowd reaches within ~3 m of the camera: its nearest heads would fill the frame.
    if (e > z - 3) {
      heroCache.key = key;
      heroCache.z = Math.min(z, HERO_BIG_MAX_Z);
      heroCache.y = HERO_BIG_Y;
      heroCache.ty = ty + HERO_AIM_LIFT;
      return heroCache;
    }
    for (let tries = 0; tries < 24; tries++) {
      // Nearest cats in view: the front row, or ~2.4 m ahead when the camera stands inside the crowd.
      const pz = Math.min(e - 0.3, z - 2.4);
      let lo = 1.25;
      let hi = 9;
      if (ndcAt(lo, z, pz) < want && z < 22) {
        z += 0.5;
        continue;
      }
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (ndcAt(mid, z, pz) < want) hi = mid;
        else lo = mid;
      }
      y = (lo + hi) / 2;
      break;
    }
    heroCache.key = key;
    heroCache.z = z;
    heroCache.y = y;
    heroCache.ty = ty + HERO_AIM_LIFT;
    return heroCache;
  };
  /** Vertical fov that keeps portrait phones framed like landscape. */
  const baseFov = (wide: number) => (aspect >= 1 ? wide : wide + (1 - aspect) * 26);

  /** The auto-director skips the top-down vortex until there is a crowd to swirl (~150 cats). */
  const noLonelyTop = (p: ShotPlan): ShotPlan => (p.shot === 'top' && crowd.count < TOP_MIN_CATS ? { ...p, shot: p.shot === shot ? 'orbit' : 'hero' } : p);

  const startBlend = (dur: number, arc = 0) => {
    from.pos.copy(cur.pos);
    from.target.copy(cur.target);
    from.fov = cur.fov;
    blendT = 0;
    blendDur = dur;
    blendArc = arc;
  };

  const applyFormation = () => crowd.setFormation(shot === 'top' && focused === null ? 'vortex' : 'floor');

  const setShotInternal = (next: ShotId, cut: boolean) => {
    const changed = next !== shot;
    const involvesTop = next === 'top' || shot === 'top';
    shot = next;
    shotStartTime = now;
    if (cut && !reducedMotion) blendT = 1;
    else if (changed) startBlend(reducedMotion ? 2.2 : 1.6, involvesTop ? 0 : 0.6);
    applyFormation();
  };

  /** The live pose of a shot at time `t` (seconds since the shot started). */
  const shotPose = (s: ShotId, t: number, beat: BeatInfo, out: Pose) => {
    const e = extent();
    const top = world.boothTop;
    switch (s) {
      case 'hero': {
        // Low, behind the crowd, moon behind the DJ (the reference's main shot).
        const drift = Math.sin(t * 0.18) * 0.6;
        if (aspect >= 1) {
          // Landscape: fit the crowd's width with the horizontal fov (a big crowd still overflows
          // the frame, like the reference), then lift the camera until the front row sits at ~72%
          // of the frame height instead of falling off the bottom edge.
          const fov = baseFov(44);
          const half = heroFit(e, fov);
          out.pos.set(drift, half.y, half.z);
          out.target.set(drift * 0.25, half.ty, 0);
          out.fov = fov;
        } else {
          // Portrait phones see a narrow slice. A small crowd: drop to cat-eye height just behind
          // the front row, so the nearest raised paws fill the lower third and the DJ stands in
          // front of the moon (no empty floor). A big crowd: look over a sea of heads from HERO_BIG_Y,
          // framing the crowd's width with the horizontal fov.
          const fov = baseFov(44);
          const p = portraitHero(e, fov, aspect, top.y);
          out.pos.set(drift * (0.3 + 0.7 * (1 - p.small)), p.y, p.z);
          out.target.set(drift * 0.25, p.ty, 0);
          out.fov = fov;
        }
        break;
      }
      case 'top': {
        // The reference top shot is a dense swirl of chubby heads that overflows every edge: about
        // 25 rows across the frame's width (~60% of the crowd radius at most), never the whole disc.
        const tanHalfW = Math.tan(MathUtils.degToRad(baseFov(52)) / 2) * aspect;
        const h = clamp(Math.min(e * 0.62, 13) / tanHalfW, 6, 40);
        const a = t * 0.07;
        out.pos.set(Math.sin(a) * h * 0.06, h, Math.cos(a) * h * 0.06);
        out.target.set(0, 0, 0);
        out.fov = baseFov(52);
        break;
      }
      case 'pov': {
        // Inside the crowd just above cat height, looking up at the DJ (nearby cats dissolve).
        const r = Math.min(e, 7) + 1.4;
        const a = 0.35 * Math.sin(t * 0.05) + 0.12;
        const bob = reducedMotion ? 0 : beat.kick * 0.06 * beat.energy;
        out.pos.set(Math.sin(a) * r, 1.3 + bob, Math.cos(a) * r);
        out.target.set(0, top.y + 0.9, 0);
        out.fov = baseFov(58);
        break;
      }
      case 'dj': {
        dj.headPosition(tmpA);
        if (!Number.isFinite(tmpA.y) || tmpA.lengthSq() === 0) tmpA.set(0, top.y + 0.9, -0.25);
        const wob = reducedMotion ? 0 : 1;
        const back = 2.6 * (LAYOUT.djScale / 1.35); // keep head + paws on the decks in frame
        out.pos.set(tmpA.x + Math.sin(t * 0.4) * 0.5 + Math.sin(t * 2.3) * 0.03 * wob, tmpA.y + 0.15 + Math.sin(t * 1.7) * 0.03 * wob, tmpA.z + back);
        out.target.set(tmpA.x, tmpA.y - 0.25, tmpA.z);
        out.fov = baseFov(36);
        break;
      }
      case 'orbit': {
        const r = clamp(e * 0.6 + 5.5, 7.5, 32);
        const a = t * 0.11 + 0.4;
        out.pos.set(Math.sin(a) * r, 2.6 + r * 0.22, Math.cos(a) * r);
        out.target.set(0, top.y * 0.9, 0);
        out.fov = baseFov(46);
        break;
      }
      case 'sweep': {
        const span = clamp(e + 5, 8, 26);
        const x = Math.sin(t * 0.16 - Math.PI / 2) * span;
        const z = clamp(e * 0.45 + 2.6, 4.5, 14);
        out.pos.set(x, 0.75, z);
        out.target.set(x * 0.35, top.y + 0.5, 0);
        out.fov = baseFov(50);
        break;
      }
    }
  };

  const focusPose = (out: Pose) => {
    if (focused === null || !crowd.catPosition(focused, focusPos)) return false;
    // From the front (cats face the booth), 45° off so the camera clears the booth, and at least
    // FOCUS_MIN_DIST away so the cat is framed whole, never filling the screen.
    tmpB.set(-focusPos.x, 0, -focusPos.z);
    if (tmpB.lengthSq() < 1e-4) tmpB.set(0, 0, -1);
    tmpB.normalize().applyAxisAngle(UP, Math.PI / 4);
    out.pos.copy(focusPos).addScaledVector(tmpB, FOCUS_MIN_DIST).setY(focusPos.y + 1.2);
    out.target.copy(focusPos).setY(focusPos.y + 0.3);
    out.fov = baseFov(42);
    return true;
  };

  /** Landing shot: outside the cat's slot (the booth and the moon behind it), sky above it. */
  const landingPose = (out: Pose) => {
    if (landingIdx === null || !crowd.catPosition(landingIdx, landingPos)) return false;
    tmpB.set(landingPos.x, 0, landingPos.z);
    if (tmpB.lengthSq() < 1e-4) tmpB.set(0, 0, 1);
    tmpB.normalize().applyAxisAngle(UP, 0.4);
    const dist = aspect < 1 ? 5.4 : 5.8;
    // Low and looking up a little: ~5 m of sky above the slot is in frame for the last of the fall.
    out.pos.copy(landingPos).addScaledVector(tmpB, dist).setY(1.5);
    out.target.set(landingPos.x, 2.1, landingPos.z);
    out.fov = baseFov(52);
    return true;
  };

  const enterManual = () => {
    if (!manual) {
      manual = true;
      manualTarget.copy(cur.target);
      sph.setFromVector3(tmpA.copy(cur.pos).sub(manualTarget));
      blendT = 1;
    }
    manualUntil = now + MANUAL_IDLE_S;
  };

  const director: RaveDirector = {
    camera,
    get shot() {
      return shot;
    },
    get auto() {
      return auto;
    },
    get focused() {
      return focused;
    },
    get manual() {
      return manual;
    },
    setAuto(on) {
      auto = on;
      if (on) {
        shotUntilBar = -1; // re-plan on the next bar
        if (manual) {
          manual = false;
          startBlend(1.6);
        }
      }
    },
    setShot(next, o) {
      manual = false;
      if (focused !== null) director.focusCat(null);
      setShotInternal(next, !!o?.cut);
      shotUntilBar = lastBar + 8;
    },
    focusCat(index) {
      if (index === focused) return;
      focused = index;
      crowd.highlight(index);
      if (index === null) {
        world.setSpotTarget(null);
        manual = false;
        startBlend(1.4, 0.8);
      } else {
        manual = false;
        startBlend(reducedMotion ? 2.4 : 1.8, 2.5);
      }
      applyFormation();
    },
    orbit(dx, dy) {
      enterManual();
      sph.theta -= dx * 0.006;
      sph.phi = clamp(sph.phi - dy * 0.005, 0.08, 1.52);
    },
    dolly(delta) {
      enterManual();
      sph.radius = clamp(sph.radius * Math.exp(delta * 0.0015), 1.6, 140);
    },
    onDrop() {
      dropCount++;
      if (!reducedMotion) shake = Math.max(shake, 1);
      paws.pump(1.4);
      pendingDropCut = true;
    },
    onTap() {
      paws.pump(1);
    },
    landingLeadS: reducedMotion ? 1.7 : 1.0,
    landing(index, holdS = 6) {
      if (manual || focused !== null) return;
      landingIdx = index;
      landingUntil = now + holdS;
      startBlend(reducedMotion ? 1.6 : 0.9, 0);
      crowd.setFormation('floor');
    },
    resize(width, height) {
      aspect = width / Math.max(1, height);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    update(frame: FrameContext) {
      const { beat, dt } = frame;
      now = frame.time;

      // ----- landing shot over: blend back and re-plan on the next bar -----
      if (landingIdx !== null && !landingOn()) {
        landingIdx = null;
        if (focused === null) world.setSpotTarget(null);
        shotUntilBar = -1;
        if (!manual && focused === null) startBlend(1.8, 0.5);
        applyFormation();
      }

      // ----- schedule (bar boundaries) -----
      const sectionStart = lastSection !== null && beat.section !== lastSection;
      const newBar = beat.bar !== lastBar;
      if (newBar || sectionStart || pendingDropCut) {
        lastBar = beat.bar;
        const dropCut = pendingDropCut && beat.section !== 'drop';
        pendingDropCut = false;
        if (auto && !manual && focused === null && !landingOn()) {
          if (lastSection === null && shotUntilBar < 0) {
            shotUntilBar = beat.bar + (initial ? 8 : 4);
            setShotInternal(shot, true);
          } else if (sectionStart || dropCut || beat.bar >= shotUntilBar || shotUntilBar < 0) {
            const plan = noLonelyTop(planShot({ section: dropCut ? 'drop' : beat.section, sectionStart: sectionStart || dropCut, bar: beat.bar, prev: shot, dropCount }));
            setShotInternal(plan.shot, plan.cut);
            shotUntilBar = beat.bar + plan.holdBars;
          }
        }
      }
      lastSection = beat.section;

      // ----- manual idle → back to auto -----
      if (manual && now > manualUntil && auto && focused === null) {
        manual = false;
        shotUntilBar = -1;
        const plan = noLonelyTop(planShot({ section: beat.section, sectionStart: false, bar: beat.bar, prev: null, dropCount }));
        setShotInternal(plan.shot, false);
        shotUntilBar = beat.bar + plan.holdBars;
        startBlend(2.2, 0.6);
      }

      // ----- desired pose -----
      let pawPresence = 0;
      if (focused !== null && focusPose(desired)) {
        world.setSpotTarget(focusPos);
        if (manual) {
          manualTarget.copy(desired.target);
          desired.pos.setFromSpherical(sph).add(manualTarget);
          desired.fov = cur.fov;
        }
      } else if (landingOn() && landingPose(desired)) {
        world.setSpotTarget(landingPos);
      } else if (manual) {
        desired.target.copy(manualTarget);
        desired.pos.setFromSpherical(sph).add(manualTarget);
        if (desired.pos.y < 0.35) desired.pos.y = 0.35;
        desired.fov = cur.fov;
      } else {
        shotPose(shot, now - shotStartTime, beat, desired);
        // Only the crowd POV shows the viewer's own paws (in the hero shot they sat behind the
        // bottom HUD as clipped pink blobs).
        pawPresence = shot === 'pov' ? 1 : 0;
      }
      paws.setPresence(pawPresence);
      crowd.clearCone(pawPresence === 1 ? 1 : 0);

      // ----- blend -----
      if (blendT < 1) {
        blendT = Math.min(1, blendT + dt / blendDur);
        const k = smooth(blendT);
        cur.pos.lerpVectors(from.pos, desired.pos, k);
        cur.pos.y += Math.sin(Math.PI * k) * blendArc;
        cur.target.lerpVectors(from.target, desired.target, k);
        cur.fov = MathUtils.lerp(from.fov, desired.fov, k);
      } else {
        cur.pos.copy(desired.pos);
        cur.target.copy(desired.target);
        cur.fov = desired.fov;
      }

      // ----- find my cat: frame the cat in the upper third (the card sits at the bottom) -----
      const offTarget = focused !== null ? 1 : 0;
      viewShift += (offTarget - viewShift) * Math.min(1, dt * 3);
      if (viewShift > 0.002) {
        const fullH = 1000;
        camera.setViewOffset(fullH * aspect, fullH, 0, (fullH / 6) * viewShift, fullH * aspect, fullH);
      } else if (camera.view?.enabled) {
        viewShift = 0;
        camera.clearViewOffset();
      }

      // ----- shake + kick punch -----
      camera.position.copy(cur.pos);
      if (shake > 0.001) {
        const a = shake * shake * 0.12;
        camera.position.x += (Math.sin(now * 91) + Math.sin(now * 37)) * a;
        camera.position.y += (Math.sin(now * 77) + Math.sin(now * 53)) * a;
        shake *= Math.exp(-dt * 3.2);
      }
      camera.lookAt(cur.target);
      const punch = reducedMotion || manual ? 0 : beat.kick * (beat.section === 'drop' ? 1.6 : 0.4);
      const fov = cur.fov - punch;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      paws.update(dt, now, beat, camera, reducedMotion);
    },
    dispose() {
      paws.dispose();
      camera.removeFromParent();
    },
  };
  applyFormation();
  return director;
}
