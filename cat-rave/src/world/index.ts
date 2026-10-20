/**
 * L-WORLD: renderer, scene, night sky, the green moon, the glossy reflective floor, the glowing
 * booth table, lasers, spotlights, haze and post (bloom). SPEC.md "World".
 *
 * Draw calls: sky, moon, floor, booth panels, booth frame, lasers, spot cones, 1–3 haze sheets,
 * flash (only while flashing). High tier adds a half-resolution planar mirror pass of the scene.
 */
import {
  ACESFilmicToneMapping,
  Color,
  FogExp2,
  NoToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Object3D,
} from 'three';
import { LAYOUT, PALETTE } from '../config';
import type { BeatInfo, LaserMode, QualityProfile, Section, WorldApi } from '../types';
import { createEmitters, createLasers, createSpotCones } from './beams';
import { createBooth } from './booth';
import { createFloor, MAX_SPOTS } from './floor';
import { createShared } from './glsl';
import { createHaze } from './haze';
import { createPost, EXPOSURE, POST_DPR_CAP } from './post';
import { FLASH_RGB, FlashEnvelope, LASER_RIGS, aimToDir, autoLaserMode, beamSplit, beamViolet, laserAim, spotPath, type LaserAim } from './show';
import { createMoon, createSky } from './sky';
import { setRgb, ThemeFader, type Rgb, type Theme } from './theme';
import { createTokenTailsLogo, type TokenTailsLogo } from './ttLogo';
import { createPinkPawSign } from './pinkPaw';

/** Linear RGB of the drop flash (white-green; the theme's dropFlash). */
const DROP_FLASH_RGB = [0.75, 1.0, 0.8] as const;
/** Extra bloom on the drop downbeat (1 beat). */
const DROP_PUMP = 1.5;
/** Bars a manual `setLaserMode` holds before the music takes the lasers back. */
const LASER_OVERRIDE_BARS = 8;
/** Fog density (FogExp2): crisp to ~20 m, half gone at ~60 m, the floor edge (140 m) is all fog. */
const FOG_DENSITY = 0.0135;

export interface WorldExtras {
  /** Current laser mode (auto or override), for debug overlays. */
  readonly laserMode: LaserMode;
  /** Whether the bloom composer is active. */
  readonly postActive: boolean;
  /** Token Tails hero sign and booth-side marks (always on). */
  readonly ttLogo: TokenTailsLogo;
}

/** Device pixel ratio for a tier: its cap, and at most POST_DPR_CAP while the bloom composer runs. */
export function pixelRatio(dpr: number, p: QualityProfile): number {
  return Math.min(dpr, p.dprCap, p.bloom ? POST_DPR_CAP : Infinity);
}

/** Saved pictures are at least this wide (px): the capture renders one frame at a higher ratio. */
export const CAPTURE_MIN_WIDTH = 1080;

/** Pixel ratio for a capture frame: at least CAPTURE_MIN_WIDTH wide, never above 3 or 4096 px. */
export function captureRatio(width: number, height: number, current: number): number {
  const want = Math.max(current, CAPTURE_MIN_WIDTH / Math.max(1, width));
  return Math.min(want, 3, 4096 / Math.max(1, width), 4096 / Math.max(1, height));
}

export function createWorld(canvas: HTMLCanvasElement, profile: QualityProfile): WorldApi & WorldExtras {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.info.autoReset = false; // main resets it once per frame (the composer renders several passes)
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE; // no-bloom tier; the composer applies it in its sanitize pass
  renderer.setPixelRatio(pixelRatio(window.devicePixelRatio || 1, profile));

  const scene = new Scene();
  scene.name = 'moon-rave';
  // Fog: the dark palette green lifted towards the moon glow so the horizon reads as lit haze.
  const fogColor = new Color(PALETTE.fog).lerp(new Color(PALETTE.moonGlow), 0.07);
  scene.background = new Color(PALETTE.sky);
  const fog = new FogExp2(fogColor.getHex(), FOG_DENSITY);
  scene.fog = fog;

  const boothTop = new Vector3(0, LAYOUT.boothSize.h, 0);
  const moonCenter = new Vector3(...LAYOUT.moon.center);

  const shared = createShared();
  shared.uFogColor.value.copy(fogColor);
  shared.uFogDensity.value = FOG_DENSITY;
  shared.uMoonCenter.value.copy(moonCenter);
  shared.uMoonRadius.value = LAYOUT.moon.radius;
  shared.uMoonColor.value.set(PALETTE.moon);
  shared.uMoonGlow.value.set(PALETTE.moonGlow);

  // ------------------------------------------------------------------ static set
  const sky = createSky(shared, 1);
  const moon = createMoon(shared, profile.quality === 'low' ? 'low' : 'high');
  const floor = createFloor(shared, {
    radius: LAYOUT.floorRadius,
    floorColor: PALETTE.floor,
    glowColor: PALETTE.floorGlow,
    boothColor: PALETTE.boothGlow,
    boothHalf: { x: LAYOUT.boothSize.w / 2, z: LAYOUT.boothSize.d / 2 },
    causticIters: profile.quality === 'low' ? 3 : 4,
  });
  const booth = createBooth(shared, LAYOUT.boothSize, PALETTE.boothGlow);
  scene.add(sky, moon, floor.mesh, booth.group);
  // The host's brand: the Token Tails lockup as the hero sign behind the DJ, the cat mark on the booth sides.
  const ttLogo = createTokenTailsLogo(LAYOUT.boothSize, renderer, profile);
  scene.add(ttLogo.sign, ttLogo.sides);
  // The shelter the rave raises money for: its logo as a lit sign on stage left (pinkPaw.ts).
  const pinkPaw = createPinkPawSign(renderer, profile);
  scene.add(pinkPaw.group);

  // ------------------------------------------------------------------ lights show
  const MAX_BEAMS = 24;
  const lasers = createLasers(shared, MAX_BEAMS);
  // +1: the booth's upward spot cone (not a floor pool).
  const spots = createSpotCones(shared, MAX_SPOTS + 1);
  scene.add(lasers.mesh, spots.mesh);
  // Saturated laser green (#39ff5a) and a few violet beams (#c04dff), as in the reference.
  const green = new Color(0x39ff5a);
  const violet = new Color(0xc04dff);
  const pink = new Color(PALETTE.pawPink);
  const spotWhite = new Color(0.75, 1.0, 0.8);
  const followColor = new Color(1.0, 0.82, 0.9);
  // Theme (world/theme.ts): green until setTheme; these are what the key light writes.
  const fader = new ThemeFader();
  let dropFlashRgb: Rgb = DROP_FLASH_RGB;
  let flashKey: Rgb = FLASH_RGB.green;
  let bloomGain = 1;
  const rigs = {
    left: new Vector3(...LASER_RIGS.left),
    right: new Vector3(...LASER_RIGS.right),
    centre: new Vector3(0, 0.35, -2.1),
  };
  const emitters = createEmitters(shared, [rigs.left, rigs.right]);
  scene.add(emitters.mesh);
  const emitLevel = [0, 0];
  const spotRigs = Array.from({ length: MAX_SPOTS - 1 }, (_, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / (MAX_SPOTS - 1)) * Math.PI * 2;
    return new Vector3(Math.cos(a) * 16, 20, Math.sin(a) * 10 - 6);
  });
  const followRig = new Vector3(0, 22, 16);
  // Booth spot: one wide cone rising straight up (+Y) from behind the booth (reference sheet 1,
  // frames 7–8): green, violet through a build (or while the viewer holds) and its drop.
  const boothSpotFrom = new Vector3(0, 0.3, -1.1);
  const boothSpotTo = new Vector3(0, 38, -1.1);
  let boothSpotViolet = 0;

  // ------------------------------------------------------------------ haze, flash, post
  let haze = createHaze(shared, profile.haze);
  scene.add(...haze.meshes, haze.flash);
  let post: ReturnType<typeof createPost> | null = null;
  const fallbackCamera = new PerspectiveCamera(50, 1, 0.1, 1000);
  const mirrorHide: Object3D[] = [];

  // ------------------------------------------------------------------ state
  let current = profile;
  let lastFrameProfile = profile;
  let width = Math.max(1, canvas.clientWidth || window.innerWidth);
  let height = Math.max(1, canvas.clientHeight || window.innerHeight);
  let dprIn = window.devicePixelRatio || 1;
  let beams = beamSplit(profile.lasers);
  let showSpots = spotCount(profile);
  let laserOverride: { mode: LaserMode; untilBar: number } | null = null;
  let pendingOverride: LaserMode | null = null;
  let laserMode: LaserMode = 'idle';
  let spotTarget: Vector3 | null = null;
  const followPos = new Vector3(0, 0, 4);
  let followLevel = 0;
  let lastSection: Section | null = null;
  let ringAge = -1;
  let dropPump = 0;
  const env = new FlashEnvelope();
  const captures: { resolve: (b: Blob) => void; reject: (e: Error) => void }[] = [];
  let lastDt = 1 / 60;

  const reducedQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!reducedQuery?.matches;
  const onReduced = (e: MediaQueryListEvent) => (reduced = e.matches);
  reducedQuery?.addEventListener?.('change', onReduced);

  function spotCount(p: QualityProfile) {
    return p.quality === 'low' ? 2 : p.quality === 'mid' ? 3 : 4;
  }

  function applyQuality(p: QualityProfile) {
    renderer.setPixelRatio(pixelRatio(dprIn, p));
    if (p.bloom && !post) {
      post = createPost(renderer, scene, fallbackCamera, p);
    } else if (!p.bloom && post) {
      post.dispose();
      post = null;
    } else if (p.bloom && post && p.quality !== current.quality) {
      post.dispose();
      post = createPost(renderer, scene, fallbackCamera, p);
    }
    renderer.toneMapping = post ? NoToneMapping : ACESFilmicToneMapping;
    floor.setMirror(p.reflections === 'mirror', p.quality === 'high' ? 0.5 : 0.35);
    floor.setCausticIters(p.quality === 'low' ? 3 : 4);
    ttLogo.setQuality(p);
    pinkPaw.setQuality(p);
    if (haze.meshes.length !== Math.max(1, Math.min(3, p.haze))) {
      scene.remove(...haze.meshes, haze.flash);
      haze.dispose();
      haze = createHaze(shared, p.haze);
      scene.add(...haze.meshes, haze.flash);
    }
    beams = beamSplit(p.lasers);
    showSpots = spotCount(p);
    current = p;
    sizeAll();
  }

  function sizeAll() {
    renderer.setSize(width, height, false);
    post?.setSize(width, height);
    const pr = renderer.getPixelRatio();
    floor.resizeMirror(width * pr, height * pr);
  }

  // ------------------------------------------------------------------ per-frame show
  const aim: LaserAim = { yaw: 0, pitch: 0, intensity: 0 };
  const dir = new Vector3();
  const tmpColor = new Color();
  const spotFloor = { x: 0, z: 0 };
  const spotPoint = new Vector3();

  function updateLasers(beat: BeatInfo) {
    const auto = autoLaserMode(beat, reduced);
    if (pendingOverride) {
      laserOverride = { mode: pendingOverride, untilBar: beat.bar + LASER_OVERRIDE_BARS };
      pendingOverride = null;
    }
    if (laserOverride && beat.bar >= laserOverride.untilBar) laserOverride = null;
    laserMode = laserOverride ? laserOverride.mode : auto;
    if (reduced && laserMode === 'strobe') laserMode = 'sweep';
    const speed = reduced ? 0.4 : 1;
    const [nl, nc, nr] = beams;
    let i = 0;
    emitLevel[0] = emitLevel[1] = 0;
    const rigList: [-1 | 0 | 1, Vector3, number][] = [
      [-1, rigs.left, nl],
      [0, rigs.centre, nc],
      [1, rigs.right, nr],
    ];
    for (const [side, origin, n] of rigList) {
      for (let k = 0; k < n && i < MAX_BEAMS; k++) {
        laserAim(laserMode, side, k, n, beat, speed, aim);
        aimToDir(aim.yaw, aim.pitch, dir);
        const useViolet = side === 0 ? (Math.floor(beat.bar / 2) + k) % 2 === 1 : beamViolet(side, k, n, beat.bar, beat.section === 'drop');
        tmpColor.copy(useViolet ? violet : green);
        if (side !== 0) emitLevel[side < 0 ? 0 : 1] = Math.max(emitLevel[side < 0 ? 0 : 1], aim.intensity);
        // Soft beams: ~6 m wide at the far end, the booth beam ~1.4 m.
        const width = side === 0 ? 1.8 : 6;
        const length = side === 0 ? 240 : 320;
        lasers.set(i, origin, dir, width, length, tmpColor, aim.intensity * (side === 0 ? 1.15 : 1) * bloomGain);
        i++;
      }
    }
    lasers.commit(i);
    // Emitter flares: the rig's brightest beam, plus a floor so the horizon points never vanish.
    emitters.set(0, (0.25 + emitLevel[0]) * bloomGain, green);
    emitters.set(1, (0.25 + emitLevel[1]) * bloomGain, green);
  }

  function updateSpots(beat: BeatInfo, dt: number) {
    const crowdR = 12;
    const speed = reduced ? 0.4 : 1;
    let n = 0;
    for (let k = 0; k < showSpots; k++) {
      spotPath(k, showSpots, beat, crowdR, speed, spotFloor);
      spotPoint.set(spotFloor.x, 0, spotFloor.z);
      const c = beat.section === 'drop' && k % 2 === 1 ? pink : k % 3 === 1 ? violet : spotWhite;
      const level = (0.55 + 0.45 * beat.energy) * (0.8 + 0.4 * beat.kick);
      const radius = 2.4;
      spots.set(n, spotRigs[k % spotRigs.length], spotPoint, radius * 1.15, c, level * bloomGain);
      floor.spots[n].set(spotFloor.x, spotFloor.z, radius, level * 0.55);
      floor.spotColors[n].copy(c);
      n++;
    }
    // Follow spot (find my cat, DJ shout-outs).
    followLevel += ((spotTarget ? 1 : 0) - followLevel) * Math.min(1, dt * 3);
    if (spotTarget) followPos.lerp(spotPoint.set(spotTarget.x, 0, spotTarget.z), Math.min(1, dt * 5));
    if (followLevel > 0.01) {
      // Soft enough that a find fly-to (camera ~3.5 m away) is not washed white.
      spots.set(n, followRig, followPos, 1.5, followColor, 0.9 * followLevel);
      floor.spots[n].set(followPos.x, followPos.z, 1.3, 0.6 * followLevel);
      floor.spotColors[n].copy(followColor);
      n++;
    }
    for (let k = n; k < MAX_SPOTS; k++) floor.spots[k].w = 0;
    // Booth spot cone straight up; no floor pool (the booth light pool is already there).
    const vt = beat.held || beat.section === 'build' ? 1 : beat.section === 'drop' ? 0.6 : 0;
    boothSpotViolet += (vt - boothSpotViolet) * Math.min(1, dt * 2.5);
    tmpColor.copy(green).lerp(violet, boothSpotViolet);
    const boothLevel = (beat.section === 'intro' || beat.section === 'breakdown' ? 0.9 : 1.6) * (0.85 + 0.3 * beat.kick);
    spots.set(n, boothSpotFrom, boothSpotTo, 5.5, tmpColor, boothLevel * bloomGain);
    n++;
    spots.commit(n);
  }

  // ------------------------------------------------------------------ theme (key light)
  const skyU = (sky.material as ShaderMaterial).uniforms;
  const moonU = (moon.material as ShaderMaterial).uniforms;
  const moonGlowTmp = new Color();
  /** Uniforms only: no shader recompiles, so the boot precompile stays valid. */
  function applyTheme(th: Theme) {
    setRgb(scene.background as Color, th.sky);
    // Fog: the theme's dark key lifted 7% towards the moon glow (as at boot).
    setRgb(moonGlowTmp, th.moonGlow);
    setRgb(fog.color, th.fog).lerp(moonGlowTmp, 0.07);
    shared.uFogColor.value.copy(fog.color);
    setRgb(shared.uMoonColor.value, th.moon);
    shared.uMoonGlow.value.copy(moonGlowTmp);
    setRgb(floor.uniforms.uFloor.value, th.floor);
    setRgb(floor.uniforms.uGlow.value, th.floorGlow);
    setRgb(floor.uniforms.uBooth.value, th.boothGlow);
    setRgb(floor.uniforms.uBoothPool.value, th.boothPool);
    booth.setColor(th.boothGlow, th.boothTint, th.boothInk);
    setRgb(skyU.uZen.value, th.zen);
    setRgb(skyU.uStarTint.value, th.starTint);
    setRgb(moonU.uMoonTint.value, th.moonTint);
    setRgb(green, th.laser);
    setRgb(spotWhite, th.spotTint);
    dropFlashRgb = th.dropFlash;
    flashKey = th.flashKey;
    bloomGain = th.bloomGain;
  }

  // ------------------------------------------------------------------ API
  const api: WorldApi & WorldExtras = {
    renderer,
    scene,
    boothTop,
    moonCenter,
    get laserMode() {
      return laserMode;
    },
    ttLogo,
    get postActive() {
      return post !== null;
    },
    resize(w, h, dpr) {
      width = Math.max(1, Math.floor(w));
      height = Math.max(1, Math.floor(h));
      // Portrait phones: the narrow view (~29° wide) can't hold the landscape moon (28° across), so
      // it sits lower and further back: ~85% of the screen width, its centre just above the DJ
      // (the counter covers the top third). Closer made it a flat green wall behind the HUD.
      const portrait = width < height;
      moonCenter.y = portrait ? LAYOUT.moon.center[1] - 8 : LAYOUT.moon.center[1];
      moonCenter.z = portrait ? LAYOUT.moon.center[2] * 1.2 : LAYOUT.moon.center[2];
      ttLogo.setPortrait(portrait);
      pinkPaw.setPortrait(portrait);
      shared.uMoonCenter.value.copy(moonCenter);
      dprIn = dpr || 1;
      renderer.setPixelRatio(pixelRatio(dprIn, current));
      sizeAll();
    },
    render(camera: Camera) {
      // A saved picture: this one frame (mirror included) renders at a higher pixel ratio
      // (>= 1080 px wide), the canvas is copied, then the normal ratio comes back.
      const capturing = captures.length > 0;
      const normalRatio = renderer.getPixelRatio();
      if (capturing) {
        const r = captureRatio(width, height, normalRatio);
        if (r > normalRatio + 1e-3) {
          renderer.setPixelRatio(r);
          sizeAll();
        }
      }
      camera.updateMatrixWorld();
      haze.sync(camera);
      if (floor.mirrorOn) {
        mirrorHide.length = 0;
        mirrorHide.push(...haze.meshes, haze.flash);
        scene.traverse((o) => {
          if (o.userData.noMirror) mirrorHide.push(o);
        });
        floor.renderMirror(renderer, scene, camera, mirrorHide);
      }
      if (post) post.render(camera, lastDt);
      else renderer.render(scene, camera);
      if (capturing) {
        const waiting = captures.splice(0);
        canvas.toBlob((blob) => {
          for (const c of waiting) blob ? c.resolve(blob) : c.reject(new Error('capture failed'));
        }, 'image/png');
        if (renderer.getPixelRatio() !== normalRatio) {
          renderer.setPixelRatio(normalRatio);
          sizeAll();
        }
      }
    },
    setLaserMode(mode) {
      pendingOverride = mode;
    },
    flash(color, strength = 1) {
      const s = reduced ? Math.min(strength, 1) * 0.35 : strength;
      const started = env.trigger(performance.now() / 1000, color === 'green' ? flashKey : FLASH_RGB[color], s);
      if (started && strength >= 0.8) ringAge = 0;
    },
    setSpotTarget(target) {
      spotTarget = target;
    },
    setTheme(id, seconds = 0.6) {
      fader.set(id, seconds);
    },
    capture() {
      return new Promise<Blob>((resolve, reject) => captures.push({ resolve, reject }));
    },
    update(frame) {
      const { beat, dt } = frame;
      lastDt = dt;
      // Follow the frame's profile only when it changes, so an explicit setQuality override holds.
      if (frame.profile !== lastFrameProfile) {
        lastFrameProfile = frame.profile;
        if (frame.profile !== current) applyQuality(frame.profile);
      }
      const th = fader.step(dt);
      if (th) applyTheme(th);
      shared.uTime.value = frame.time;
      shared.uBeat.value = beat.beat;
      shared.uKick.value = beat.kick;
      shared.uHat.value = beat.hat;
      shared.uEnergy.value = beat.energy;
      shared.uMotion.value = reduced ? 0.4 : 1;
      // High cameras (the top-down vortex) look through far less fog: the crowd keeps its contrast
      // instead of dissolving into a dark moire.
      const camY = frame.camera.position.y;
      const fogK = 1 - 0.65 * Math.min(1, Math.max(0, (camY - 6) / 16));
      fog.density = FOG_DENSITY * fogK;
      shared.uFogDensity.value = fog.density;
      const dropTarget = beat.section === 'drop' ? 1 : 0;
      shared.uDrop.value += (dropTarget - shared.uDrop.value) * Math.min(1, dt * 3);
      if (beat.section !== lastSection) {
        if (beat.section === 'drop' && lastSection !== null) {
          // Drop downbeat: a white-green flash decaying over ~0.5 s and a 1-beat bloom pump.
          ringAge = 0;
          env.trigger(performance.now() / 1000, dropFlashRgb, reduced ? 0.2 : 0.6);
          dropPump = reduced ? 0 : 1;
        }
        lastSection = beat.section;
      }
      dropPump = Math.max(0, dropPump - dt / (60 / Math.max(60, beat.bpm || 136)));
      if (ringAge >= 0) {
        ringAge += dt;
        floor.uniforms.uRing.value = ringAge * 22;
        if (ringAge > 3.5) {
          ringAge = -1;
          floor.uniforms.uRing.value = -1;
        }
      }
      const f = env.step(dt);
      shared.uFlash.value.setRGB(env.r * f, env.g * f, env.b * f);
      haze.flash.visible = f > 0.01;
      updateLasers(beat);
      updateSpots(beat, dt);
      ttLogo.update(beat, shared.uDrop.value, reduced);
      ttLogo.follow(frame.camera, frame.dt);
      pinkPaw.update(beat, shared.uDrop.value, reduced);
      pinkPaw.follow(frame.camera, frame.dt);
      post?.setPump(Math.max(beat.section === 'drop' && !reduced ? 0.18 * beat.kick : 0.05 * beat.kick, DROP_PUMP * dropPump));
    },
    setQuality(p) {
      applyQuality(p);
    },
    dispose() {
      reducedQuery?.removeEventListener?.('change', onReduced);
      post?.dispose();
      haze.dispose();
      lasers.dispose();
      emitters.dispose();
      spots.dispose();
      floor.dispose();
      booth.dispose();
      ttLogo.dispose();
      pinkPaw.dispose();
      sky.geometry.dispose();
      (sky.material as { dispose(): void }).dispose();
      moon.geometry.dispose();
      (moon.material as { dispose(): void }).dispose();
      for (const c of captures.splice(0)) c.reject(new Error('world disposed'));
      renderer.dispose();
    },
  };
  // First quality application builds post, mirror and sizes.
  applyQuality(profile);
  return api;
}
