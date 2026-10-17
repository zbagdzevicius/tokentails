// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/config.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/core/config.js  (owner: core)
// Part 1 is GAME_DESIGN.md Appendix A, merged verbatim (M0). Part 2 holds core additions
// (MODEL_FIT, quality presets, input bindings, ids). Agents READ config; additions are requested
// from core (requests/<area>.md) and are additive only. No DOM / WebGL access in this module.
//
// ---------------------------------------------------------------------------------------------
// Part 1: Appendix A (design numbers)
// ---------------------------------------------------------------------------------------------
// GAME_DESIGN.md is the source of truth for every number below. Agents read config; no literals.
export const HOMAGE_LINES = false;            // always false: the homage lines were removed (docs/TOKENTAILS-PLAN.md §2.3); kept for the strings.js import
export const GRAVITY = 22;

export const PLAYER = {
  height: 1.0, radius: 0.32, mass: 1.0, hpStart: 8, hpMax: 14, lives: 9,
  walk: 2.0, run: 5.5, zoomies: 7.2, zoomiesAfter: 2.0, zoomiesClearRadius: 15,
  accelDamp: 14, decelDamp: 18, airDamp: 4, airMax: 5.5, turnDamp: 16,
  // TT5 jump preset B (docs/TOKENTAILS-PLAN.md §13.1 #2): apex 8.4²/44 = 1.604 m (was 1.245); a release cuts the rise
  // to 0.65× only after jumpCutAfter s of rise, so an 80 ms keyboard tap peaks ≈ 1.17 m and clears the 1.0 m lesson
  // fence at a run (plan: 0.10 s ≈ 1.10 m, which keeps her above the rail too briefly to cross it: smoke player:jumps)
  // hardLandSpeed 12.5 (plan: 12): a full jump onto ground 0.5 m lower meets it at 11.8 m/s, and the fixed step can
  // report up to 0.55 m/s more on the landing frame (Physics reads the post-gravity speed)
  jumpV: 8.4, fallGravityMul: 1.5, jumpCut: 0.65, jumpCutAfter: 0.12, coyote: 0.15, jumpBuffer: 0.20,
  terminalFall: 14, hardLandSpeed: 12.5, hardLandLock: 0.15, squashLand: -0.25, stretchJump: 0.18,
  stepUp: 0.3, mushroomBounceV: 10,
  water: { shallowMul: 0.6, deepDamage: 1, safeSamples: 8, safeEvery: 0.5 },
  glide: { fallMax: 1.8, speed: 4.5, maxTime: 1.5 },                                   // MVP+
  dodge: { dur: 0.40, v0: 9, v1: 4, iframes: [0.04, 0.30], cooldown: 0.20, perfect: [0.04, 0.20],
           perfectTimeScale: 0.35, perfectDur: 0.5, perfectValor: 12, perfectCrit: 1.5, perfectCritWindow: 1.2, grazeValor: 4 },
  guard: { enter: 0.08, move: 1.2, turnRate: Math.PI * 2, arc: 1.2217, touchArc: 1.5708, pushback: 0.4,
           grit: 3, gritRegenDelay: 0.8, gritRegenEvery: 1.5, heavyPoise: 3, breakStagger: 0.8,
           parryWindow: 0.15, touchParryBonus: 0.05, whiffWindow: 0.25, whiffLockout: 0.30,
           parryStagger: 1.2, eliteParryStagger: 0.8, eliteMinPoise: 5, goldParryStagger: 2.0, bossParryDizzy: 35,
           reflectSpeedMul: 1.5, reflectDmg: 25, riposteWindow: 0.8, riposteRange: 4,
           parryHitstop: 0.12, parryTimeScale: [0.5, 0.15], earTell: 0.1 },
  standingGround: { minHold: 1.0, maxSpeed: 0.1, radius: 6, perSec: 5, jeerPerSec: 10, capPerStand: 30, resetAfter: 0.5 },
  charge: { start: 0.35, tier1: 0.60, tier2: 1.10, moveMul: 0.4, holyMinValor: 50, camDist: 3.3, camFov: 42 },
  valor: { max: 100, light: 4, lightPerSwingCap: 8, heavy: 6, parry: 20, riposte: 8, choke: 10, kitten: 25,
           onHurt: -10, jeerDrainPerSec: 6, holyCost: 50, goldenCost: 100, respawnMul: 0.5 },
  golden: { inputWindow: 0.1, activate: 0.8, staggerRadius: 8, staggerDur: 0.5, dur: 8.0, postGameBonus: 3.0,
            dmgMul: 1.5, takenMul: 0.5, speedMul: 1.1, holyChargeTime: 0.5, fogMul: 0.5, bloom: 1.2, valorLockAfter: 3.0 },
  hurt: { stun: 0.35, iframes: 0.9, blinkHz: 15, hitstop: 0.07, shake: 0.3, vignette: 0.3 },
  milk: { sip: 0.9, healAt: 0.5, heal: 4, moveCap: 1.1, start: 2, max: 4 },
  stillStanding: { hp: 1, invuln: 2.0, valor: 30, riseTimeScale: 0.4, riseDur: 0.8 },
  meow: { dur: 0.6, cooldown: 1.0, aggroRadius: 8, kittenRadius: 10 },
  memeCam: { idle: 15, noEnemyRadius: 20, minFog: 0.02, manualHold: 2.5, manualClearRadius: 12,
             blendIn: 2.0, blendOut: 0.9, loop: 3.8, wind: 1.6, mist: 2, captionDelay: 1.0 },
  // CONTROLS_SPEC §7.1 / C5: the cones are around the resolved aim; touch range 4 → 4.5
  assist: { angle: Math.PI / 3, range: 3, touchAngle: Math.PI / 2, touchRange: 4.5, buffer: 0.2,
            kbmCone: 0.436, kbmExtra: 1.0, selCone: 0.698, padCone: 0.785, padRange: 3.5, sticky: 0.75, lungeExtra: 1.0 },
  lockOn: { range: 12, cone: 1.745, breakRange: 16, losTimeout: 1.5, flickPx: 40, flickTime: 0.15 },
  smallHeart: { chance: 0.10, heal: 1, magnet: 3.5 },
  // ---- core+ (additive; requests/player.md): design numbers from GAME_DESIGN prose that Appendix A does not list.
  // src/player/tuning.js reads these (same names) and keeps its own values only as fallbacks.
  faintDur: 2.2, respawnInvuln: 1.0, vigilPlant: 0.8, heartBellHp: 2,
  walkStick: 0.5, zoomiesMinStick: 0.9, zoomiesTurnReset: 0.7, zoomiesDustEvery: 4, stepsPerMetre: 1.55,
  pitY: -40, safeMinDist: 1.0, splashInvuln: 0.9,
  lungeDamp: 20, hurtDamp: 6, blockPushT: 0.2, blockPushDamp: 5, autoStand: 0.5, goldenMinShards: 2,
  combatStance: 3.0, bumpStunMul: 0.5, hurtFlash: 0.12, standCapeWind: 1.8,
  tailPuffHeight: 2.0, tailPuffDur: 1.0, slowBlinkStill: 3.0, slowBlinkRadius: 3.0, slowBlinkCooldown: 12.0,
  sneezeEvery: 90, sneezeMinFog: 0.06,
  // core+ M2 (requests/player.md, review fixes)
  splashReturnDist: 3.0, splashClearRadius: 2.0, splashCooldown: 1.5, splashLockMin: 0.5, splashLockMax: 3.0,
  comboGrace: 0.18, autoComboGrace: 0.35,
};

export const CAMERA = { dist: 3.6, lockDist: 4.5, bossDist: 6.0, ease: 0.6, fov: 45, pitch: [-0.35, 1.1],
                        pivotY: 1.05, autoFollowAfter: 1.5, treeFadeOpacity: 0.22 };

/**
 * research/CONTROLS_SPEC.md §13 (binding): the three-quarter top-down play camera ("iso rig"). `CAMERA.dist / lockDist /
 * bossDist / fov / pitch` above apply only to cutscene presets and `?cam=classic` (C3).
 */
CAMERA.iso = {
  // dist 13 → 12.4: her measured height (feet → ear tips, foreshortened at ~51°) is 77 px at 1080p at 13 m; §16.2 asks ≥ 80
  yaw: Math.PI, fov: 38, fovPortrait: 50, dist: 12.4, distPhone: 12, zoom: [0.70, 1.40], distMin: 9, distMax: 18,
  pitchNear: 0.803 /* 46° */, pitchFar: 1.012 /* 58° */, pitchPortrait: 1.012, pitchBoss: 0.977 /* 56° */,
  // TT4: portraitWidth 9 → 7.5 (a 390 px phone showed her ~45 px tall: the width fit set ~21 m); combat still zooms out
  catH: 0.8, minCatPx: 30, minCatPxBoss: 26, minCatPxPortrait: 28, portraitWidth: 7.5,
  // integration: the clamp measures her APPARENT size (feet → ear tips ≈ 1.0 m × cos pitch; 0.98 keeps a margin), what a screenshot shows
  catHView: 0.98,
  focusY: 0.6, followDamp: 12, followDampY: 6, jumpFollow: 0.3, bounceFollow: 0.5,
  // lead: AUTOCAM §12 table merged below; vel / velMax / up / damp / cursor are RETIRED (read with fallbacks until
  // camera moves to the new gains). AUTOCAM's cursor lead is 0 by default and comes from the camCursorLead setting
  // (0–0.15); the 0.15 here is what the current IsoRig reads, kept so behaviour is unchanged until then.
  lead: { vel: 0.25, velMax: 1.6, cursor: 0.15, cursorMax: 2.0, max: 2.5, up: 0.8 /* retired, not read (IsoRig FRAME) */, damp: 4 },
  // frameOffset / frameOffsetPortrait: RETIRED (not read; IsoRig FRAME / AUTOCAM derived anchor). Kept, never removed.
  frameOffset: 0.04, frameOffsetPortrait: -0.10, frameOffsetTouchX: 0.08 /* integration: touch landscape, left of the cluster */, near: 0.3, far: 90, refit: 0.4,
  hint: { blend: 1.2, calmFor: 2.0, maxPerLevel: 3 }, stickRelatch: 0.15,
  combat: { radius: 10, bias: 0.3, biasMax: 2.5, inner: 0.8, margin: 1.2, zoomOut: 3, outDamp: 2.5, holdIn: 1.5, selWeight: 1.5 },
  boss: { dist: [14, 22], weight: 0.35, maxOff: 5, herInner: 0.6, bossInner: 0.85, liftAbove: 1.6, lift: 0.3 },
  unlock: { edgePx: 12, panSpeed: 18, leash: 25, leashSoft: 3, recentre: 0.4 }, peek: { max: 6, damp: 6, back: 0.4 },
  zoomStep: 0.07, zoomDamp: 8, pinchDamp: 10, padZoom: [0.8, 1.0, 1.25],
  charge: { dd: -1.0, dfov: -1 }, holy: { dfov: 3, fovT: 0.15, dd: -0.6, ddT: 0.25 },
  parryPunch: { dd: -0.6, in: 0.08, out: 0.30 }, perfectDodge: { dd: -0.4 },
  golden: { dist: 9, pitch: 0.803, in: 0.25, out: 0.6 }, dialog: { mul: 0.8, t: 0.5 },
  shake: { rotMul: 0.5, transMul: 2.0, rotMaxDeg: 1.2, transMax: 0.35, scale: 0.6 },
  cut: { blendIn: 0.8, handback: 1.0, cutAngle: 2.094, cutDist: 30, veil: 0.25 },
  meme: { exitPx: 40, idlePxPerSec: 24, spotR: 4 },
  // archOpacity (requests/core.md, camera occlusion review): roofs / solid occluders fade to 2 of 16 dither cells
  occl: { opacity: 0.22, archOpacity: 0.1, fadeIn: 0.15, fadeOut: 0.40, herR: 1.0, enemyR: 0.6, enemies: 4, enemyRange: 8, pathR: 0.4,
          crownR: 3.5, roofPad: 1.5, xrayFrac: 0.3, xrayDelay: 0.1 },
  fog: { clear: 5, clearCombat: 7, topMul: 1.5, lowMix: 0.45, ease: 0.6, goldenClearMul: 1.5 },
  shadowHalf: 16, shadowHalfBoss: 20, lodFromFocus: true,
};

/**
 * research/next/AUTOCAM_SPEC.md §12 (binding; IMPLEMENTATION_PLAN §4 "AUTOCAM wins on overlap"): the MOBA auto-camera
 * tables, merged into `CAMERA.iso`. Retired CONTROLS §13 keys stay above with their old values so current readers keep
 * working (`followDamp`, `followDampY`, `lead.vel / velMax / up / damp`, `combat.inner / outDamp / biasMax`,
 * `boss.herInner` (numeric 0.6; AUTOCAM's `'frame'` = the `herFrame` clamp once camera reads `frame.herInner`),
 * `frameOffset*`, `shadowHalf*` (footprint-fit fallback), `far` (→ `foot.far`)).
 */
Object.assign(CAMERA.iso, {
  distRangePortrait: [16, 26],                                         // D19; landscape keeps distMin 9 / distMax 18
  follow: { rigidXZ: true, groundST: 0.18, resetJump: 4, veilJump: 8, dtMax: 0.1 },
  aimPan: { minRange: 5, gain: 0.40, dead: 3.0, in: 0.30, hold: 0.35, out: 0.6,
            cap: { desktop: 2.5, tablet: 2.0, phone: 1.6, portrait: 1.0 } },
  frame: { coreInset: 0.04, threatInset: 0.02, holePad: 12, thumbPad: 36, maxShiftX: 0.06, maxShiftY: 0.12,
           landBiasY: 0.04, herInner: 0.75, herHeadPad: 0.6, herFeetPad: 0.3, herSidePad: 0.4, herBottomPad: 0.07 /* TT4 */,
           fitScale: 0.90, fitBottomExtra: 0.04, hysteresisFrame: 0.92, anchorEase: 0.4, grid: [32, 18] },
  framing: { solver: true, hz: 20, maxSubjects: 16, ternarySteps: 10, pitchPasses: 2, holeRepair: [0.5, 4],
             engage: { in: 10, out: 12.5, hold: 1.5 }, selHard: 12, selSoft: 16,
             pad: { threat: 0.8, enemy: 0.6, boss: 1.5, lane: 1.0, her: 0.6 },
             w: { threat: 2.0, preAttend: 1.0, boss: 1.0, lane: 1.0, selected: 1.5, engaged: 1.0, add: 0.5 },
             weightIn: 0.35, weightOut: 0.5, hardMinW: 0.5,
             lean: { bias: 0.5, kappa: 0.10, capUp: 2.5, capDown: { desktop: 4.0, tablet: 3.0, phone: 2.0, portrait: 2.0 },
                     capDownCalm: { desktop: 2.5, tablet: 2.5, phone: 2.0, portrait: 2.0 }, boss: 5.0, st: 0.45, vmax: 5 },
             crowd: { per: 0.25, after: 2, max: 1.5 }, zoomOut: 3,
             dist: { outST: 0.35, outVmax: 6, inST: 1.2, inVmax: 1.5, holdIn: 1.5 },
             hysteresis: { d: 0.35, lean: 0.30 }, rate: { pitchDeg: 20, fovDeg: 12 },
             orbitPenalty: { k: 1.5, free: 3.0 } },                                       // enemies read orbitPenalty
  beats: { maxLean: 2.5, maxDd: 1.5, cancelFade: 0.3,
           peekaboo: { frac: 0.6, lean: 2.5, dd: 0.5, t: [0.6, 1.0, 0.8] },
           cosy: { dd: -1.5, dMin: 10, dfov: -1.5, t: [0.5, 1.2, 0.9], calmR: 12 },
           roomRead: { lean: 3, ddMax: 3, t: [0.5, 0.7, 0.6] },
           exhale: { dd: 0.8, t: [0.4, 0.6, 1.5] } },
  snuggle: { after: 5, dd: -0.6, st: 1.2, back: 0.35 },
  reduce: { anchorY: 0.50, combatFitEase: 0.6 },
  touchShakeRot: 0,
  pinch: { startPx: 16, secondMs: 400, rubber: 0.25, rubberBack: 0.6, elastic: 0.06 },
  semi: { returnST: 0.4, returnMove: 2, returnIdle: 3, edgeAccel: 0.35 },
  foot: { casterH: 6, shadowPad: 1.5, shadowQuant: 1, shadowShrink: [2, 1.0],
          shadowCacheMargin: 8, shadowCacheSnap: 8,                                       // X7 stage 2 (world reads)
          farMul: 1.25, farPad: 25, farQuant: 5, far: [45, 90], farFallback: 60, fogFarPad: 4,   // X12
          grassPad: 3, mistQuant: 1 },
  budget: { msDesktop: 0.08, msPhone: 0.15, heapKB: 64 },
});
Object.assign(CAMERA.iso.lead, {
  gainUp: 0.12, gainDown: 0.42, gainSide: 0.26, gainSidePortrait: 0.10,
  caps: { desktop: [1.7, 0.8, 2.4], tablet: [1.4, 0.8, 2.0], phone: [1.4, 0.8, 2.0], portrait: [0.8, 1.2, 2.0] },   // [side, up, down]
  speedRamp: [1.2, 4.0], build: 0.55, release: 0.80, vmax: 4.5,
  debounce: 0.20, debounceCone: 0.873 /* 50° */, reverse: 2.094 /* 120° */, orderLook: 2.5,
  biasST: 1.0,
});
Object.assign(CAMERA.iso.boss, {
  establish: { in: 0.6, hold: 0.8 }, phaseBreath: { dd: 1.5, t: 1.0 },
  dizzy: { dd: -1.0, in: 0.4, maxHold: 3, out: 0.6 }, defeatHold: 0.6,
});

/** §5.3 nav grid + §5.2 order follower (physics/NavGrid.js, physics/Pathfind.js, player/Orders.js). */
export const NAV = {
  cell: 0.5, agentR: 0.32, margin: 0.08, minNy: 0.7, stepUp: 0.3, spanLo: 0.3, spanHi: 1.0,
  hop: { upMin: 0.3, upMax: 1.1, horiz: 2.4 }, drop: 3.0, gap: 2.0, fence: { top: 1.05, thick: 0.8 }, bounce: 1.8,
  linkCost: 3, linkEvery: 1.5, maxExpand: 6000, maxPoints: 48, sliceMs: 8, snap: 4, minCorridor: 1.6,
  arrive: 0.25, arriveMid: 0.6, slowR: 0.8, cornerLook: 0.6, linkStart: 0.6, linkFacing: 0.611 /* 35° */,
  hopMaxH: 5.5, follow: 0.1, pathsPerSec: 4, stuck: { dist: 0.3, time: 0.4, retries: 3 }, retarget: 1.5,
  queueMax: 4, leash: 16, attackMoveR: 4.5, useOffset: 0.3,
};

/** §7 one aim resolver, magnet cones, the soft auto-target score, picking (player/Aim.js, combat, camera/Picker.js). */
export const AIM = {
  kbmCone: 0.436 /* 25° */, kbmExtra: 1.0, selCone: 0.698 /* 40° */, padCone: 0.785, padRange: 3.5, touchCone: Math.PI / 2,
  touchRange: 4.5, kbRange: 3.0, padDead: 0.25, padAimMax: 6, cursorIdle: 3.0, sticky: 0.75, lungeExtra: 1.0,
  score: { angle: 2.0, windup: 2.5, selected: 1.0, lowHp: 0.8, lowHpFrac: 0.3, recentHit: 0.5, breakable: 3.0 },
  breakableClear: 6, standSnapRange: 5, standSnapLead: 0.7, cursorReaimPx: 30, chargeTurn: 9.42,
  pounceMax: 3.5, pounceMagnet: 2.5, pounceTouchDisc: 3.0, jumpAssist: { range: 2.4, dv: 1.5, ang: 0.349, inset: 0.3, maxRise: 1.4 },   // TT5: dv 1.2 → 1.5 (the 1.6 m jump flies longer; a full run must still land on a 1.2 m stump), maxRise 1.1 → 1.4
  pick: { px: 28, pad: 6, touchPx: 56, interactR: 1.2 }, autoChainRest: 0.10, autoRiposte: 0.15,
  onScreenMargin: 0.5, rangedNear: 9,
  // combat (CONTROLS_SPEC prose numbers; combat/targeting.js aimCfg merges these over its AIM_FALLBACK)
  lungeFrac: 0.7, selExtra: 1.5, recentHitWindow: 2.0, reflectCone: 0.436 /* ±25° */, reflectRange: 16,
  projectileLead: 1.0, lungeSettle: 0.05, ringLead: 0.6, threatRange: 6, threatKeep: 0.1, hittableBelowDefault: 2.2,
};

/** §9 touch cluster geometry (CSS px × settings.touchSize; buttons: [size, dx, dy] from the ⚔ centre). */
export const TOUCH = {
  stickZone: [0.42, 0.80], stickZonePortrait: [0.48, 0.38], stickR: 60, stickDead: 0.10, stickFollow: 1.6,
  anchor: 68, minBtn: 56, deadRing: 40, gap: 8, portraitScale: 0.85,
  buttons: { attack: [96, 0, 0], guard: [76, -124, 4], dodge: [64, -100, -92], jump: [64, 0, -124],
             ability: [64, -196, -128], golden: [64, -96, -204], milk: [56, 16, -206], meow: [56, -300, -60],
             interact: [64, -214, 0] },
  // integration: on a portrait phone the §9.2 landscape offsets spill over the joystick half; the cluster stacks up the
  // right half instead (×portraitScale like the rest), leaving the left 48 % × bottom 38 % to the stick
  buttonsPortrait: { attack: [96, 0, 0], guard: [76, -114, 18], dodge: [64, -104, -82], jump: [64, 0, -118], ability: [64, 0, -212],
                     interact: [64, -96, -170], milk: [56, -100, -258], meow: [56, 0, -298], golden: [64, -100, -340] },
  tapMs: 250, tapPx: 12, longMs: 350, swipePx: 48, swipeMs: 150, afterButton: 0.3, aimPx: 16, aimRangePx: 90,
  steerWindow: 0.08, cancelChip: 72, aimPad: 96,
};

/** §10.6 haptics: navigator.vibrate patterns (ms) on touch; pad rumble [weak, strong, ms] is derived. */
export const HAPTICS = {
  button: 8, hitHeavy: 12, parry: [18, 30, 36], perfectDodge: 25, block: 10,
  guardBreak: [40, 40, 40], hurt: 55, holy: 70, golden: 110, kitten: [15, 60, 15], orderRejected: [10, 40, 10],
};

export const ATTACKS = {
  // ---- player (dmg on ×10 scale) ----
  slash1:   { dur: .40, active: [.10, .22], arc: { range: 1.9, from:  1.2, to: -1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4, poise: 1, hitstop: .05, shake: .15, lunge: 2.5, combo: [.18, .40], next: 'slash2', valor: 'light' },
  slash2:   { dur: .40, active: [.10, .22], arc: { range: 1.9, from: -1.2, to:  1.2, y0: 0, y1: 1.4 }, dmg: 10, knock: 4, poise: 1, hitstop: .05, shake: .15, lunge: 2.5, combo: [.18, .40], next: 'slash3', valor: 'light' },
  slash3:   { dur: .60, active: [.20, .32], arc: { range: 2.3, from:  1.7, to: -1.7, y0: 0, y1: 1.6 }, dmg: 20, knock: 9, poise: 3, hitstop: .09, shake: .35, lunge: 4.0, rollCancel: .32, valor: 'heavy', heavy: true },
  pounce:   { hang: .12, diveSpeed: 14, arc: { range: .9, from: .9, to: -.9, y0: -1.2, y1: .6 }, dmg: 18, ring: { r: 1.3, dmg: 10 }, knock: 6, poise: 2, hitstop: .07, shake: .25, pogoV: 6, landRecover: .25, valor: 'heavy', heavy: true, breaksShieldFromAbove: true },
  bright:   { dur: .55, active: [.14, .26], arc: { range: 2.6, from:  1.6, to: -1.6, y0: 0, y1: 1.6 }, dmg: 28, knock: 10, poise: 4, hitstop: .10, shake: .40, lunge: 3.0, guardBreak: true, popsSlime: true, breaks: ['cracked'], valor: 'heavy', heavy: true },
  holy:     { dur: .85, active: [.22, .36], arc: { range: 3.6, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 50, knock: 14, poise: 99, hitstop: .14, shake: .60, iframes: [0, .46], timeScale: [.35, .25], cost: 50, minShards: 1, projectile: 'holyWave', projectileMinShards: 2, guardBreak: true, popsSlime: true, heavy: true, breaks: ['cracked'] },
  holyWave: { speed: 14, range: 10, width: 2.4, height: 1.6, dmg: 30, knock: 8, poise: 6, pierce: true, eatsProjectiles: true, popsSlime: true, heavy: true },
  riposte:  { dur: .50, active: [.10, .20], arc: { range: 2.4, from: .3, to: -.3, y0: 0, y1: 1.4 }, dmg: 18, crit: 2, knock: 10, poise: 4, hitstop: .12, shake: .35, lunge: 5.0, valorFlat: 8, heavy: true },
  gleam:    { speed: 18, range: 8, width: 1.2, dmg: 12, knock: 4, poise: 2, pierce: true, popsSlime: true },
  sunburst: { dur: .60, active: [.20, .30], arc: { range: 6, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 40, knock: 16, poise: 99, hitstop: .16, shake: .70, popsSlime: true, heavy: true },
  // ---- enemies (dmg in player HP = half-hearts) ----
  rat_poke:     { telegraph: 'parry', windup: .55, dur: .5, active: [0, .12], arc: { range: 1.8, from: .3, to: -.3, y0: 0, y1: 1.0 }, dmg: 1, knock: 3, poise: 1, hitstop: .07, shake: .2, lunge: 4, recover: .8 },
  rat_poke2:    { telegraph: 'gold',  windup: .30, dur: .5, active: [0, .12], arc: { range: 1.8, from: .3, to: -.3, y0: 0, y1: 1.0 }, dmg: 1, knock: 3, poise: 1, hitstop: .07, shake: .2, lunge: 4, recover: .8, goldStagger: 2.0 },
  rat_bolt:     { telegraph: 'aim', windup: .8, aimLock: .6, projectile: { speed: 16, range: 18, r: .15 }, dmg: 1, knock: 2, poise: 1, reload: 2.0, reflectDmg: 25 },
  crow_dive:    { telegraph: 'shadow', windup: 1.0, track: .6, speed: 12, r: .9, dmg: 2, knock: 5, poise: 1, recover: 1.2 },
  jelly_slam:   { telegraph: 'aoe', windup: .5, leap: 3, air: .6, r: { L: .9, M: .7, S: .5 }, dmg: { L: 2, M: 1, S: 1 }, knock: 4, poise: 1, recover: .8 },
  spider_web:   { telegraph: 'parry', windup: .6, projectile: { speed: 10, range: 7, r: .2 }, dmg: 0, slow: .5, slowDur: 2.0, patch: { r: 1.0, life: 8 }, reflectDmg: 10, recover: 1.0 },
  spider_bite:  { telegraph: 'parry', windup: .45, dur: .4, active: [0, .1], arc: { range: 1.2, from: .6, to: -.6, y0: 0, y1: .8 }, dmg: 2, knock: 3, poise: 1, recover: .9 },
  hyena_slash:  { telegraph: 'parry', windup: .5, dur: .45, active: [0, .14], arc: { range: 1.8, from: 1.0, to: -1.0, y0: 0, y1: 1.5 }, dmg: 2, knock: 5, poise: 2, recover: .7 },
  hyena_lunge:  { telegraph: 'red', windup: .6, from: [3, 5], speed: 6, dur: .4, dmg: 2, knock: 6, poise: 2, recover: .8, unblockable: true },
  stealer_snatch: { telegraph: 'grab', windup: .6, speed: 9, dur: .35, steal: { frac: .10, min: 5, max: 50 }, fleeSpeed: 6, despawnAfter: 8, returnBonus: 5 },
  pug_bash:     { telegraph: 'parry', windup: .6, dur: .4, active: [0, .12], arc: { range: 1.5, from: .5, to: -.5, y0: 0, y1: 1.3 }, dmg: 2, knock: 8, poise: 3, recover: .9, parriedStun: 2.0 },
  pug_slam:     { telegraph: 'red', windup: 1.0, ring: { rMax: 2.5, grow: .4, height: .3 }, dmg: 2, knock: 6, poise: 3, recover: 1.2, unblockable: true },
  pug_chop:     { telegraph: 'parry', windup: .5, dur: .4, active: [0, .12], arc: { range: 1.7, from: .8, to: -.8, y0: 0, y1: 1.4 }, dmg: 2, knock: 4, poise: 2, recover: .8 },
  bone_chop:    { telegraph: 'parry', windup: .5, dur: .4, active: [0, .12], arc: { range: 1.6, from: .8, to: -.8, y0: 0, y1: 1.3 }, dmg: 2, knock: 4, poise: 2, recover: .7 },
  bone_stab2:   { telegraph: 'parry', windups: [.4, .3], arc: { range: 1.6, from: .3, to: -.3, y0: 0, y1: 1.2 }, dmg: 1, hits: 2, knock: 3, poise: 1, recover: .7 },
  bone_bolt:    { telegraph: 'aim', windup: .7, projectile: { speed: 12, range: 12, r: .2 }, dmg: 2, knock: 3, poise: 1, reload: 2.0, reflectDmg: 25 },
  // ---- tutorial props (prologue; can't hurt, can't fail) ----
  dummy_swing:  { telegraph: 'parry', windup: .8, every: 2.0, dur: .4, active: [0, .12], arc: { range: 1.6, from: .8, to: -.8, y0: 0, y1: 1.2 }, dmg: 0, knock: 2, poise: 1, recover: 1.2, parriedSpin: 1.0 },  // Wobble Knight; first glint → 0.25× slow-mo hint once
  sack_swing:   { period: 2.0, r: .3, dmg: 0, knock: 3, poise: 1 },   // swinging sack (0.6 m) on a 1.8 m rope; a hit just knocks her back
  // bosses: see BOSSES.*.moves (same fields)
};

export const ENEMIES = {
  rat_pike:  { model: 'models/creatures/polypizza/Rat.glb', fit: { h: 0.8 }, radius: .30, height: .8, mass: .8, hp: 30, poise: 2, walk: 1.6, run: 3.8, sight: 10, fov: 2.09, leash: 18, patrolRadius: 4,
               attacks: [{ id: 'rat_poke', weight: 1, range: 1.9 }], followUp: { id: 'rat_poke2', chance: .3 }, fleeBelow: .2, fleeDur: 2.0, fish: [2, 3], props: ['kettleHelm', 'spear', 'buckler'] },
  rat_xbow:  { model: 'models/creatures/polypizza/Rat.glb', fit: { h: 0.8 }, radius: .30, height: .8, mass: .8, hp: 20, poise: 1, walk: 1.6, run: 3.6, sight: 16, fov: 2.09, leash: 22,
               attacks: [{ id: 'rat_bolt', weight: 1, range: 16 }], keep: [7, 11], hopBack: { within: 3, dist: 3, cooldown: 3 }, fish: [2, 2],
               weapon: { model: 'models/weapons/kaykit/crossbow_1handed.glb', bone: 'FrontLeg.R', fit: { max: 0.5 } } },
  crow:      { model: 'models/creatures/monsters-flying/Pigeon.glb', fit: { x: 1.2 }, tint: '#17181C', radius: .35, height: .5, mass: .5, hp: 20, poise: 1, fly: { speed: 5, alt: 4, circleR: 5 }, sight: 14, fov: 6.28, leash: 25,
               attacks: [{ id: 'crow_dive', weight: 1, range: 10 }], hittableBelow: 2.2, peck: 1.2, fish: [2, 2], tags: ['flyer'] },
  jelly:     { procedural: 'gloomjelly', sizes: { L: { h: .8, r: .45, hp: 40, fish: 2 }, M: { h: .5, r: .30, hp: 20, fish: 1 }, S: { h: .3, r: .20, hp: 10, fish: 1 }, GIANT: { h: 1.6, r: .9, hp: 120, fish: 10, splitTo: ['M', 2], releases: 'earlgrey' } },
               poise: 1, hopEvery: 1.2, hopDist: 1.5, attacks: [{ id: 'jelly_slam', weight: 1, range: 3 }], split: { L: ['M', 2], M: ['S', 2] }, childInvuln: .3, childPop: 2, maxAlive: 12, sight: 8, leash: 14 },
  spider:    { model: 'models/creatures/polypizza/Spider.glb', fit: { h: 0.5 }, tint: '#4E5A2C', radius: .35, height: .5, mass: .6, hp: 35, poise: 2, burst: { speed: 5, move: 1.2, pause: 1.0 }, sight: 10, fov: 3.14, leash: 16,
               attacks: [{ id: 'spider_web', weight: 1, range: 7 }, { id: 'spider_bite', weight: 2, range: 1.3 }], fish: [3, 3] },
  hyena:     { model: 'models/characters/kaykit/Barbarian.glb', fit: { h: 1.35 }, head: 'hyena', plateWords: ['GRUMP', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER'],
               plateWordsFriend: ['FAN', 'GIGGLER', 'YAYSAYER', 'HUGGER', 'CHEERER', 'SPOONER'],   // WA §12 (index-paired with plateWords)
               hide: ['Barbarian_Head', 'Barbarian_Hat', '1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Mug', 'Barbarian_Round_Shield'],
               weapon: { model: 'models/weapons/skeleton/Skeleton_Blade.glb', bone: 'handslot.r', fit: { max: 0.9 } },
               radius: .40, height: 1.35, mass: 1.4, hp: 50, poise: 3, walk: 2.0, run: 5.0, sight: 14, fov: 2.44, leash: 22,
               attacks: [{ id: 'hyena_slash', weight: 3, range: 1.9 }, { id: 'hyena_lunge', weight: 1, range: 5, minRange: 3, cooldown: 4 }],
               gloat: { dur: 1.0, chokeStagger: 1.0, chokeValor: 10 },
               jeer: { windup: .5, dur: 2.0, r: 8, cooldown: 12, onlyWithin: 10, fogAdd: .01, maxPerPack: 1 }, flank: { giggleLead: .6 }, fish: [4, 6] },
  stealer:   { model: 'models/characters/kaykit/Rogue_Hooded.glb', fit: { h: 1.2 }, head: 'hyena', plateWords: ['SNACK SNATCHER'], plateWordsFriend: ['SNACK SHARER'], hide: ['Rogue_Head_Hooded', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
               radius: .35, height: 1.2, mass: 1.0, hp: 30, poise: 1, walk: 2.0, run: 6.0, sight: 16, fov: 2.79, leash: 30,
               attacks: [{ id: 'stealer_snatch', weight: 1, range: 4 }], fish: [3, 3] },
  pug:       { model: 'models/characters/kaykit/Knight.glb', fit: { h: 1.25 }, head: 'pug', show: ['Rectangle_Shield', '1H_Sword', 'Knight_Helmet'], helmetScale: .9,
               hide: ['Knight_Head', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Round_Shield', 'Spike_Shield'],
               radius: .45, height: 1.25, mass: 2.0, hp: 60, poise: 5, walk: 2.5, run: 3.2, turnRate: 2.094, sight: 12, fov: 2.09, leash: 18,
               shield: { arc: 1.2217, brokenBy: ['bright', 'holy', 'pounceFromAbove', 'parry:pug_bash'], downFor: 4.0, stagger: 1.5 },
               attacks: [{ id: 'pug_bash', weight: 3, range: 1.6 }, { id: 'pug_slam', weight: 1, range: 2.5, cooldown: 6 }, { id: 'pug_chop', weight: 2, range: 1.8, onlyShieldDown: true }], fish: [5, 5] },
  bonehead:  { variants: {
                 minion:  { model: 'models/creatures/skeletons/Skeleton_Minion.glb',  hp: 30, poise: 2, attack: 'bone_chop',  weapon: 'models/weapons/skeleton/Skeleton_Blade.glb' },
                 warrior: { model: 'models/creatures/skeletons/Skeleton_Warrior.glb', hp: 45, poise: 3, attack: 'bone_chop',  weapon: 'models/weapons/skeleton/Skeleton_Axe.glb', shield: 'models/weapons/skeleton/Skeleton_Shield_Small_A.glb', blocksFirst: true },
                 rogue:   { model: 'models/creatures/skeletons/Skeleton_Rogue.glb',   hp: 30, poise: 2, attack: 'bone_stab2', weapon: 'models/weapons/skeleton/Skeleton_Blade.glb' },
                 mage:    { model: 'models/creatures/skeletons/Skeleton_Mage.glb',    hp: 25, poise: 1, attack: 'bone_bolt',  weapon: 'models/weapons/skeleton/Skeleton_Staff.glb' } },
               fit: { h: 1.0 }, radius: .35, height: 1.0, mass: 1.0, walk: 1.5, run: 3.5, sight: 12, fov: 2.44, leash: 18,
               reassemble: { after: 4.0, hpFrac: .5, max: 2, scatterBy: 'heavy' }, fish: [3, 3] },
  // MVP+
  warhound:  { model: 'models/creatures/animals/Husky.glb', fit: { z: 1.1 }, tint: '#3A3436', hp: 45, poise: 3, walk: 3.0, run: 7.5, fetch: { radius: 8, chance: .6, chew: 3.0 }, fish: [4, 4] },
  bat:       { model: 'models/creatures/polypizza/Bat.glb', fit: { h: 0.4 }, hp: 10, poise: 0, speed: 6, fish: [1, 1] },
  hornet:    { model: 'models/creatures/polypizza/Wasp.glb', fit: { h: 0.6 }, hp: 25, poise: 1, hover: 1.2, fish: [3, 3] },
};

export const DIZZY = { perPoise: 4, perParry: 35, decayDelay: 2.0, decayPerSec: 8, dur: 3.0, critMul: 2 };

export const BOSSES = {
  grizzlechop: { name: 'CAPTAIN GRIZZLECHOP', hp: 450, poise: 12, dizzyMax: 100, fit: { h: 1.6 }, arenaR: 12, pillars: { n: 6, r: 8, radius: .8, height: 2.5 }, fish: 100,
                 phases: [ { at: 1.00, moves: ['sabreFlurry', 'cheeseToss'], weights: [3, 2], events: [{ at: .80, spawn: [['rat_pike', 2]] }] },
                           { at: 0.60, moves: ['wheelRide', 'sabreFlurry'], weights: [2, 1], wheel: { laps: 3, tele: 1.0, speed: 9, every: 12, laneW: 3, dizzyAfter: 2.0 }, events: [{ at: .60, spawn: [['rat_xbow', 2]] }] },
                           { at: 0.25, moves: ['sabreFlurry', 'cheeseBombs', 'snack'], weights: [2, 2, 1], windupMul: .8, snack: { dur: .8, heal: 30, cooldown: 15 } } ] },
  cacklejaw:   { name: 'BIG CHIEF CACKLEJAW', hp: 700, poise: 15, dizzyMax: 120, fit: { h: 2.2 }, gloat: 1.5, fish: 120,
                 phases: [ { at: 1.00, moves: ['cackleCombo', 'laughQuake'], weights: [3, 2] },
                           { at: 0.60, moves: ['ratioRush', 'cackleCombo'], weights: [2, 2], rush: { dashes: 3, tele: .8, speed: 12, blockPush: 2, blockGrit: 2, stumble: 2.5 }, events: [{ at: .60, spawn: [['stealer', 2]] }] },
                           { at: 0.30, moves: ['cackleCombo', 'laughQuake'], weights: [3, 1], windupMul: .85, clones: { n: 3, windupMul: 1.2, respawnEvery: 10 }, fog: .09 } ] },
  brutus:      { name: 'SIR BRUTUS OF THE WOOF BRIGADE', hp: 400, poise: 12, dizzyMax: 100, fit: { h: 1.9 }, fish: 50,
                 phases: [ { at: 1.00, moves: ['overheadChop', 'wideSweep', 'shoulderCharge'], weights: [2, 2, 1] },
                           { at: 0.50, duel: { exchanges: 3, windup: 1.0, parryGrace: .05, missDmg: 2, retryAfter: 2.0, guardMul: .5 } } ] },
  barkus:      { name: 'LORD BARKUS GRUMPJAW', hp: 1500, poise: [25, 25, 20], dizzyMax: 200, fit: { h: 3.0 }, arenaR: 10, fish: 250,
                 phases: [ { at: 1.00, moves: ['cleaverCombo', 'bigBark', 'boneMerang', 'backKick'], weights: [3, 2, 2, 1] },
                           { at: 0.65, moves: ['cleaverCombo', 'spinToWin', 'boneToss', 'howl'], weights: [3, 2, 2, 0], events: [{ at: .65, spawn: [['pug', 2], ['bonehead:minion', 2]] }, { at: .50, spawn: [['pug', 2], ['bonehead:minion', 2]] }] },
                           { at: 0.35, moves: ['shardSlam', 'cleaverCombo'], shardSlam: { every: 6, tele: .8, dmg: 2, blockChip: 1, parriesNeeded: 3, dizzyAfter: 5 }, windupMul: .85, hpFloor: .10 } ],
                 rallyAt: .10 },
  sovereign:   { name: 'THE SLIME SOVEREIGN', hp: [300, 150, 60], counts: [1, 2, 4], sizes: [4, 2.8, 1.8], dizzyMax: 80, fish: 100 },   // MVP+
};

export const COMPANIONS = {
  maxActive: 1, maxActiveAfterGate: 2 /* MVP+ */, hp: 8, napTime: 8, follow: 2.5, teleportBeyond: 15, teleportLos: 4, engage: 6, dmg: 5, rate: 1.6, tokenShare: .2,
  mochi:  { ability: 'shieldWall', cd: 18, dist: 1.5, width: 3.0, height: 1.6, dur: 4.0, taunt: 6, staggerAttacker: 1.0, milkBonus: 1 },
  sage:   { ability: 'volley', cd: 14, arrows: 5, over: .6, targets: 3, range: 14, dmg: 8, groundFlyers: 3.0, passive: { flyerEvery: 2.5, flyerDmg: 6, sparkleRadius: 15 } },
  clover: { ability: 'mend', cd: 30, channel: 1.0, heal: 4, over: 3.0, cleanse: ['slow'], passive: { outOfCombatEvery: 20, heal: 1 } },
  spoons: { every: 2.0, perThree: 1, dmg: 5, range: 12 },
};

export const DIFFICULTY = {
  kitten: { taken: (d) => Math.max(1, Math.floor(d * .5)), lives: Infinity, tokens: [1, 1], enemyHp: .8,  windup: 1.25, parry: .25, p3BlockIsParry: true },
  knight: { taken: (d) => d,                                lives: 9,        tokens: [2, 2], enemyHp: 1.0, windup: 1.0,  parry: .15 },
  nine:   { taken: (d) => Math.ceil(d * 1.5),               lives: 9, livesScope: 'game', tokens: [3, 2], enemyHp: 1.25, windup: .9, parry: .12 },
};

export const ECONOMY = {
  fish: { silver: 1, gold: 10, crate: [1, 3], magnet: 3 },
  shops: { satchel: { cost: [100, 200], max: [3, 4] }, sharp: { cost: [120, 240, 400], mul: [1.15, 1.30, 1.50] },
           quickCharge: { cost: 200, tier1: .45, tier2: .85 }, valorGain: { cost: 150, mul: 1.25 }, waveReach: { cost: 200, range: 15, needShards: 2 },
           cape: 80 },
  skins: { borrowed: 'start', twig: 'start', fishbone: { kittens: 6 }, baguette: { kittens: 12 }, diamond: { kittens: 18 }, toobig: { flag: 'keep.brutus' }, dawnblade: { flag: 'ending.seen' } },
  capes: { cream: 'start', red: 'start', memeWhite: { memeCam: 1 }, blue: 80, green: 80, midnight: 80, gold: { flag: 'ending.seen' } },
  heartBells: 3, lettersRefund: 100, replayFishMul: .6,
};

export const LINE = { durationAtFullRate: 240, winch: [0, 41], winchRadius: 4, lanes: [[-4, -58], [0, -58], [4, -58]],
  waves: [ { at: 0,   spawn: [['hyena', 4]], runners: 1 },
           { at: .20, spawn: [['hyena', 3], ['stealer', 2]], runners: 2, pinThief: true },
           { at: .45, spawn: [['hyena', 3], ['rat_xbow', 2], ['crow', 3]], runners: 1 },
           { at: .70, cutscene: 'cs08', then: [['hyena', 6], ['pug', 1]], runners: 2, spoons: true },
           { at: .85, cutscene: 'g02' } ],
  trickle: { every: 15, spawn: [['hyena', 2]], runners: 1 } };

// WA §12 (core.W1): warm danger hues (red #FF3B30 → #FF5A4E, aoe #FF6A3D → #FF9A3D), the crow shadow plum #3A2346 (never
// black, WA §2.7); `glyph` = the shape language of WA §3.4 (fx maps each to a GroundDecals SDF), `ink` = the cocoa sandwich
export const TELEGRAPH = { colors: { parry: '#FFFFFF', gold: '#FFD34D', red: '#FF5A4E', aoe: '#FF9A3D', aim: '#FFFFFF', grab: '#9B5CFF', jeer: '#B07CFF', shadow: '#3A2346' },
                           minLead: { parry: .45, gold: .6, red: .6, aoe: .5, aim: .8, grab: .6, jeer: .5, shadow: 1.0 }, arrowRadius: 15, maxArrows: 4, decalPool: 32,
                           glyph: { parry: 'shield', gold: 'star8', red: 'chevron2', aoe: 'dots6', grab: 'paw', shadow: 'crowfoot', aim: 'arrow' },
                           ink: { color: '#4A2A1F', width: 0.03, alpha: 0.35 }, glyphSize: 0.45, glyphSizeTouch: 0.55, rimMinTouch: 0.14 };

export const JUICE = { light: { hitstop: .05, shake: .15, rumble: [.25, 0, 60] }, heavy: { hitstop: .09, shake: .35, rumble: [.4, .5, 120] },
                       holy: { hitstop: .14, shake: .6, rumble: [.8, .8, 250], bloom: [.55, 1.2, .4], fovPunch: 5 }, parry: { hitstop: .12, shake: .25, rumble: [.3, .7, 90] },
                       block: { hitstop: .04, shake: .1, rumble: [.2, .2, 60] }, guardBreak: { hitstop: .08, shake: .4, rumble: [.5, .5, 150] },
                       kill: { hitstopAdd: .04, shakeAdd: .1 }, hurt: { hitstop: .07, shakeMul: 1.4, rumble: [.6, .3, 150] }, dizzy: { hitstop: .1, shake: .3, rumble: [.3, .3, 120] },
                       finalBlow: { hitstopAdd: 0.06, slowMo: 0.25, timeScale: 0.35 } };   // WA §12: the last alerted enemy of an encounter (via game.slowMo)


/**
 * §18.1 MODEL_FIT, keyed by asset path relative to public/assets/ (the same string you pass to
 * ctx.assets.gltf/model). `axis`: 'y' (height), 'x', 'z' or 'max' (largest extent). `target` in metres.
 * `yaw`: radians added so the model faces +Z (checked by the M0 screenshots; 0 = already +Z).
 * `uses`: per-role targets for models reused at several sizes (e.g. `fit: MODEL_FIT[p].uses.brutus`).
 * `hide`: prop nodes ignored when measuring (KayKit weapons/shields hang outside the body).
 */
const KAYKIT_PROPS = ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield',
  '1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Mug', 'Barbarian_Round_Shield', 'Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'];
const SKELETON_PROPS = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A',
  'Skeleton_Crossbow', 'Skeleton_Shield_Small_B', 'Skeleton_Shield_Large_B'];
export const MODEL_FIT = {
  'models/characters/kaykit/Barbarian.glb':              { axis: 'y', target: 1.35, yaw: 0, uses: { hyena: 1.35, cacklejaw: 2.2 }, hide: KAYKIT_PROPS },
  'models/characters/kaykit/Rogue_Hooded.glb':           { axis: 'y', target: 1.2, yaw: 0, uses: { stealer: 1.2, pilfer: 1.2 }, hide: KAYKIT_PROPS },
  'models/characters/kaykit/Knight.glb':                 { axis: 'y', target: 1.25, yaw: 0, uses: { pug: 1.25, brutus: 1.9, barkus: 3.0, tallbert: 6.0 }, hide: KAYKIT_PROPS },
  'models/creatures/polypizza/Rat.glb':                  { axis: 'y', target: 0.8, yaw: 0, uses: { rat: 0.8, grizzlechop: 1.6 } },
  'models/creatures/monsters-flying/Pigeon.glb':         { axis: 'x', target: 1.2, yaw: 0 },
  'models/creatures/monsters-blob/Pigeon.glb':           { axis: 'y', target: 0.5, yaw: 0 },
  'models/creatures/monsters-flying/Dragon_Evolved.glb': { axis: 'max', target: 6.0, yaw: 0 },
  'models/creatures/polypizza/Spider.glb':               { axis: 'y', target: 0.5, yaw: 0 },
  'models/creatures/skeletons/Skeleton_Minion.glb':      { axis: 'y', target: 1.0, yaw: 0, hide: SKELETON_PROPS },
  'models/creatures/skeletons/Skeleton_Warrior.glb':     { axis: 'y', target: 1.0, yaw: 0, hide: SKELETON_PROPS },
  'models/creatures/skeletons/Skeleton_Rogue.glb':       { axis: 'y', target: 1.0, yaw: 0, hide: SKELETON_PROPS },
  'models/creatures/skeletons/Skeleton_Mage.glb':        { axis: 'y', target: 1.0, yaw: 0, hide: SKELETON_PROPS },
  'models/creatures/animals/Cow.glb':                    { axis: 'y', target: 1.6, yaw: 0 },
  'models/creatures/animals/Donkey.glb':                 { axis: 'y', target: 1.4, yaw: 0 },
  'models/creatures/animals/Husky.glb':                  { axis: 'z', target: 1.1, yaw: 0 },
  'models/cats/Cat_Blocky.glb':                          { axis: 'y', target: 1.0, yaw: 0 },   // placeholder Swordcat (M0–M1 only)
  'models/props/Crown.glb':                              { axis: 'x', target: 0.25, yaw: 0, uses: { snowpaw: 0.25, sovereign: 0.8 } },
  'models/weapons/kaykit/crossbow_1handed.glb':          { axis: 'max', target: 0.5, yaw: 0 },
  'models/weapons/kaykit/sword_2handed.glb':             { axis: 'max', target: 1.0, yaw: 0 },  // placeholder Borrowed Blade (M0–M1)
  'models/weapons/skeleton/Skeleton_Blade.glb':          { axis: 'max', target: 0.9, yaw: 0, uses: { hyena: 0.9, cacklejaw: 1.4 } },
  'models/weapons/quaternius/Sword_B.glb':               { axis: 'max', target: 0.6, yaw: 0 },
  'models/weapons/quaternius/Claymore.glb':              { axis: 'max', target: 2.2, yaw: 0, uses: { barkus: 2.2, toobig: 1.6 } },
  'models/weapons/quaternius/Sword_Diamond.glb':         { axis: 'max', target: 1.0, yaw: 0 },
};

// ---------------------------------------------------------------------------------------------
// Part 2: core additions (M0). Additive only; never rename a key above.
// ---------------------------------------------------------------------------------------------

// Every table entry knows its own key (HIT events carry def.id; enemy/boss defs carry their type id).
for (const [k, v] of Object.entries(ATTACKS)) v.id = k;
for (const [k, v] of Object.entries(ENEMIES)) v.id = k;
for (const [k, v] of Object.entries(BOSSES)) v.id = k;

/** Placeholder Swordcat parts (M0–M1; the player agent replaces them with characters' buildKitten). */
export const PLACEHOLDER = { swordcat: 'models/cats/Cat_Blocky.glb', sword: 'models/weapons/kaykit/sword_2handed.glb' };

/** Boss type ids (EnemyManager.spawn('boss_<key>')) → model + MODEL_FIT role. Appendix B files override. */
export const BOSS_MODELS = {
  grizzlechop: { model: 'models/creatures/polypizza/Rat.glb', role: 'grizzlechop' },
  cacklejaw:   { model: 'models/characters/kaykit/Barbarian.glb', role: 'cacklejaw' },
  brutus:      { model: 'models/characters/kaykit/Knight.glb', role: 'brutus' },
  barkus:      { model: 'models/characters/kaykit/Knight.glb', role: 'barkus' },
};

/** §19.1 A1: level ids in story order (`sky` is STRETCH and not listed). */
export const LEVEL_IDS = ['meadow', 'forest', 'town', 'gate', 'bog', 'keep'];

/** §3.5: the 18 lost kittens, in level order (3 per level). */
export const KITTEN_IDS = ['biscuit', 'noodle', 'button', 'pickles', 'pebble', 'sprout', 'waffles', 'toffee', 'muffin',
  'tater', 'mittens', 'socks', 'juniper', 'bramble', 'fennel', 'bean', 'crumpet', 'dumpling'];
export const KITTENS_BY_LEVEL = { meadow: KITTEN_IDS.slice(0, 3), forest: KITTEN_IDS.slice(3, 6), town: KITTEN_IDS.slice(6, 9),
  gate: KITTEN_IDS.slice(9, 12), bog: KITTEN_IDS.slice(12, 15), keep: KITTEN_IDS.slice(15, 18) };
/** Levels that are still bootable stubs with no kittens in them (STATUS.md Known issues). */
export const STUB_LEVEL_IDS = ['bog', 'keep'];
/** The kittens a player can rescue today (12 until bog and keep ship). Progress counts and public copy use this. */
export const REACHABLE_KITTEN_IDS = KITTEN_IDS.filter((id) => !STUB_LEVEL_IDS.some((l) => KITTENS_BY_LEVEL[l].includes(id)));

/** Game modes (§19.1 A7). */
export const MODES = ['play', 'dialog', 'cutscene', 'menu', 'memecam'];

/**
 * Fixed-step loop (tech.md §6; PERF_SPEC §4.1): 60 Hz everywhere; when the step cap is hit the remainder is dropped
 * (game time dilates for that frame). `maxStepsLow` applies on the Low preset.
 */
export const LOOP = { step: 1 / 60, maxSteps: 4, maxStepsLow: 3, maxFrameDt: 0.1 };

/**
 * Renderer / post (tech.md §13; PERF_SPEC §2 + §6; ART_WARM_SPEC §3 + §4.1).
 * - `toneMapping` 'neutral' (K1: ACES → Neutral; Game.js applies it in S1), `medAA` 'canvas' | 'fxaa' (build-time,
 *   decided once by the PERF §6.1 A/B), `toon` = the global toon ramp (core/toon.js; `sat` never above 1.15).
 * - RETIRED (read with fallbacks until PostFX drops the composer in S1): `bloom`, `vignette` (K1: no vignette pass;
 *   ui draws a warm CSS vignette), `dynamicRes` (→ QUALITY.*.dynRes, PERF §5).
 */
export const RENDER = {
  fov: CAMERA.fov, near: 0.1, far: 600, exposure: 1.0,
  toneMapping: 'neutral', medAA: 'canvas',
  toon: { band: [0, 0.07], step: [0.42, 0.50, 0.86], shadow: [0.38, 0.62], sat: 1.12 },
  /** first-frame clear colour until Env sets `scene.background` (= `meadow_day` fog; WA §2.1, never grey) */
  background: '#F6E4C0',
  /**
   * High-only cinematic chain (ART §3.3, PERF §6.1; core/postfx/PostChain.js): bloom [strength, radius, threshold],
   * soft knee, the seamless on/off fade (s), and the optional uber grades (sat, gain rgb; identity = none).
   */
  cinematic: { bloom: [0.6, 0.4, 0.9], knee: 0.5, fade: 0.6, maxBloom: 1.2, nanClamp: 64,
    grades: { none: [1, 1, 1, 1], warm: [1.04, 1.03, 1.0, 0.97], gold: [1.06, 1.05, 1.0, 0.92], night: [0.96, 0.97, 0.99, 1.04], hush: [0.92, 1.0, 0.98, 1.02] } },
  bloom: { strength: 0.6, radius: 0.4, threshold: 0.85 },
  vignette: { offset: 0.95, darkness: 1.15 },
  dynamicRes: { slowMs: 18, fastMs: 12, window: 2.0, step: 0.1 },
};

/**
 * Performance controller + instrumentation (PERF_SPEC §5, §12; IMPLEMENTATION_PLAN §5). core/pacing.js reads
 * `dynRes`, `pacing`, `thermal`; core/perf.js reads `ring`, `overlayHz`, `stage`, `budgets`.
 * - `stage`: which §5 budget column this build is gated against ('I1' → 'I2' → 'End'); `perf().stage` reports it.
 * - `dynRes`: the asymmetric render-scale controller (§5.2). `thermal`: the shedding ladder + the 30 fps fallback (§5.4).
 */
export const PERF = deepFreeze({
  stage: 'I1',
  budgets: {
    I1: { frameCalls: { low: 70, med: 120, high: 150 } },
    I2: { frameCalls: { low: 60, med: 90, high: 110 } },
    End: { sceneCalls: { low: 40, med: 60, high: 90 }, tris: { low: 80000, med: 150000, high: 260000 } },
    bossExtra: 15,
    // PERF_SPEC §5 memory rows (every stage): JS heap in play / at T_title, MB of performance.memory.usedJSHeapSize
    // after a GC (Chrome counts ArrayBuffer backing stores in it). Gate: smoke perf:frame (heap).
    heapMB: { low: 90, med: 120, high: 120 },
    titleHeapMB: { low: 60, med: 60, high: 60 },
  },
  dynRes: { ema: 0.1, gpuDownMs: 12.5, rafDownMs: 17.5, downHold: 1.0, gpuUpMs: 9.0, upHold: 3.0,
    probeEvery: 5, probeWindow: 2, probeMax: 40, minInterval: 2 },
  pacing: { refreshSamples: 60, highRefreshHz: 100, baseFps: 60 },
  thermal: { floorHold: 10, grassScale: 0.5, particleScale: 0.5, lock30Ms: 18.5, lock30Hold: 20,
    retryAfter: 120, retryWorkMs: 12, retryHold: 30 },
  ring: 600, overlayHz: 4,
});

/**
 * Quality presets: the ONE merged key set (IMPLEMENTATION_PLAN §4 / PERF_SPEC §2, values binding). 'auto' picks low on
 * coarse pointers, high on discrete GPUs, else med. Agents read ctx.quality (the active preset) and listen to
 * E.QUALITY for changes.
 * - `shadows` is a string now (K3): 'none' | 'sun'. Use `qualityShadowsOn(preset)` instead of a truthiness test.
 * - `furShellsIso` / `furShellsClose` / `kittenShellsIso`: shell counts at the iso lens / in close-ups (X8).
 * - `outline`: 'hero' | 'heroCompanionsEngaged' | 'all'. `programs`: the per-level program budget (PERF §1.2).
 * - `charDetail`: tessellation factor for cats built under the preset (characters; Low ≈ the lite tier's 0.55).
 * - RETIRED (kept with their old values until every reader moved; never removed): `composer`, `msaa`, `bloom`,
 *   `furShells`, `kittenShells`, `grass`, `minDpr` (→ `dynRes.min`), `dynamicRes`.
 */
export const QUALITY = {
  low: { id: 'low',
    maxDpr: 1.25, dynRes: { min: 0.6, max: 1.0, step: 0.05 },
    aa: 'canvas', cinematic: false,
    toneMapping: 'neutral', dither: true, cssVignette: true, glowCards: true,
    shadows: 'none', shadowMap: 0, vertexAO: 'height',
    furShellsIso: 0, furShellsClose: 8, kittenShellsIso: 0, charTufts: false,
    outline: 'hero', grassTufts: 1300, groundMist: 4, particles: 300,
    maxEnemies: 6, maxSkinned: 6, fpsCap: 60, programs: 30, charDetail: 0.55,
    // retired
    minDpr: 0.6, composer: false, msaa: 0, bloom: false, grass: 4000, furShells: 0, kittenShells: 0, dynamicRes: true },
  med: { id: 'med',
    maxDpr: 1.25, dynRes: { min: 0.7, max: 1.0, step: 0.05 },
    aa: 'canvas' /* RENDER.medAA decides 'canvas' | 'fxaa' */, cinematic: false,
    toneMapping: 'neutral', dither: true, cssVignette: true, glowCards: true,
    shadows: 'sun', shadowMap: 1024, vertexAO: 'none',
    furShellsIso: 0, furShellsClose: 16, kittenShellsIso: 0, charTufts: true,
    outline: 'heroCompanionsEngaged', grassTufts: 4000, groundMist: 8, particles: 1500,
    maxEnemies: 8, maxSkinned: 12, fpsCap: 60, programs: 40 /* → 30 after WarmToon */, charDetail: 1,
    // retired
    minDpr: 0.7, composer: true, msaa: 4, bloom: true, grass: 30000, furShells: 16, kittenShells: 10, dynamicRes: true },
  high: { id: 'high',
    maxDpr: 1.5, dynRes: { min: 0.8, max: 1.0, step: 0.05 },
    aa: 'canvas', cinematic: true, cinematicSamples: 4, bloomRes: 0.5, bloomMips: 3,
    toneMapping: 'neutral', dither: true, cssVignette: true, glowCards: true,
    shadows: 'sun', shadowMap: 2048, vertexAO: 'none',
    furShellsIso: 0 /* 4 only if PERF S2 passes */, furShellsClose: 16, kittenShellsIso: 0, charTufts: true,
    outline: 'all', grassTufts: 8000, groundMist: 8, particles: 2000,
    maxEnemies: 8, maxSkinned: 12, fpsCap: 0 /* uncapped */, programs: 36, programsCinematic: 36, charDetail: 1,
    // retired
    minDpr: 0.8, composer: true, msaa: 4, bloom: true, grass: 45000, furShells: 16, kittenShells: 10, dynamicRes: true },
};

/**
 * K3 helper: does this QUALITY preset render a sun shadow map? Accepts the new string ('sun' | 'none') and the
 * retired boolean, so every reader can switch to it before the presets change again.
 * @param {{shadows?: string|boolean}|null|undefined} preset
 */
export const qualityShadowsOn = (preset) => preset?.shadows === true || preset?.shadows === 'sun';

/**
 * Input bindings (GAME_DESIGN §15 + §19.1 A2; tech.md §7). Keyboard entries are KeyboardEvent.code;
 * mouse buttons are 'Mouse0' (LMB), 'Mouse1' (MMB), 'Mouse2' (RMB); `pad` entries are standard-mapping
 * button indices. Wheel down/up produce `lockNext` / `lockPrev` edges.
 */
export const INPUT = {
  actions: ['attack', 'guard', 'dodge', 'jump', 'interact', 'confirm', 'back', 'lockon', 'lockPrev', 'lockNext',
            'pause', 'ability', 'milk', 'meow', 'golden', 'recenter', 'navUp', 'navDown', 'navLeft', 'navRight',
            // CONTROLS_SPEC §6.1 (iso controls)
            'move', 'attackMove', 'stop', 'zoomIn', 'zoomOut', 'zoomCycle', 'peek', 'camLock', 'centre', 'ranges', 'controls',
            // TOKENTAILS-PLAN §11.2 (TT3): `sprint` is virtual (the dodge key held past INPUT.sprintAfter), `trick` the
            // Paw Trick slot, `trick1`..`trick3` pick a Paw Trick
            'sprint', 'trick', 'trick1', 'trick2', 'trick3'],
  // TOKENTAILS-PLAN §11.2 (TT3) preset `hybrid`, the default: WASD moves, LMB attacks (LMB on a foe walks in and
  // chains), RMB / Q / L = the Stand, Space = jump, Shift = Tumble (held = sprint), F = the Paw Trick, G = the kitten.
  // No action uses Ctrl, Alt, Meta or an F-key (Ctrl+W closes the tab and cannot be blocked). Mouse1 = MMB,
  // Mouse3 = the back side button (Tumble), Mouse4 = the forward one.
  keys: {
    attack: ['Mouse0', 'KeyJ'], guard: ['Mouse2', 'KeyQ', 'KeyL'], dodge: ['ShiftLeft', 'ShiftRight', 'KeyK', 'Mouse3'], jump: ['Space'],
    interact: ['KeyE', 'Enter', 'NumpadEnter'], confirm: ['Enter', 'NumpadEnter', 'KeyE'], back: ['Escape', 'Backspace'],
    lockon: ['Tab'], pause: ['Escape', 'KeyP'], ability: ['KeyG'], milk: ['KeyR'], meow: ['KeyC'], golden: ['KeyV'],
    trick: ['KeyF'], trick1: ['Digit1'], trick2: ['Digit2'], trick3: ['Digit3'], sprint: [],
    recenter: [], lockPrev: [], lockNext: [],
    navUp: ['ArrowUp', 'KeyW'], navDown: ['ArrowDown', 'KeyS'], navLeft: ['ArrowLeft', 'KeyA'], navRight: ['ArrowRight', 'KeyD'],
    move: [], attackMove: ['KeyX'], stop: ['KeyH'], zoomIn: [], zoomOut: [], zoomCycle: [], peek: ['KeyZ', 'Mouse1'],
    camLock: ['KeyY'], centre: ['Home'], ranges: ['KeyZ', 'Mouse1'], controls: [],
  },
  /** `?cam=classic` (§15.3): the M1/M2 orbit-camera binding table (RMB guard, Space jump, MMB lock-on, wheel switch). */
  classicKeys: {
    attack: ['KeyJ', 'Mouse0'], guard: ['KeyL', 'Mouse2'], dodge: ['ShiftLeft', 'ShiftRight', 'KeyK'], jump: ['Space'],
    lockon: ['Tab', 'Mouse1'], move: [], peek: [], centre: [], camLock: [], ranges: [], attackMove: [], stop: [],
  },
  /**
   * §6.2 KBM presets: each a `keys` table merged over `keys` (then `settings.bindings` on top) plus two flags:
   * `wasd` (WASD moves her) and `lmbMoves` (LMB issues orders, diablo). Click-to-move lives in `moba` (RMB),
   * `diablo` (LMB) and `mouseOnly` (RMB); `hybrid` and `keyboardOnly` walk on WASD.
   */
  presets: {
    hybrid: { wasd: true, lmbMoves: false, keys: {} },
    // moba: Shift+RMB queues moves (Orders.js), so Shift does not Tumble here: Space does (as in diablo), jump is T
    moba: { wasd: false, lmbMoves: false, keys: { move: ['Mouse2'], guard: ['KeyQ', 'KeyL'], dodge: ['Space', 'KeyK', 'Mouse3'], jump: ['KeyT'], attackMove: ['KeyA'], stop: ['KeyS', 'KeyH'], milk: ['KeyD', 'KeyR'] } },
    diablo: { wasd: true, lmbMoves: true, keys: { move: ['Mouse0'], attack: ['KeyJ'], guard: ['Mouse2', 'KeyQ', 'KeyL'], dodge: ['Space', 'KeyK'], jump: ['KeyT'] } },
    mouseOnly: { wasd: true, lmbMoves: false, keys: { move: ['Mouse2'], guard: ['Mouse4', 'KeyQ', 'KeyL'], dodge: ['Mouse3', 'KeyK', 'ShiftLeft', 'ShiftRight'], jump: ['Space', 'Mouse1'], peek: ['KeyZ'], ranges: ['KeyZ'] } },
    keyboardOnly: { wasd: true, lmbMoves: false, keys: { attack: ['KeyJ'], guard: ['KeyL', 'KeyQ'], dodge: ['KeyK', 'ShiftLeft', 'ShiftRight'], jump: ['Space'], peek: ['KeyZ'], ranges: ['KeyZ'], move: [] } },
  },
  /** TT3 §11.2: the `dodge` key still held this long (s) after the Tumble starts = `sprint` (Zoomies speed at once). */
  sprintAfter: 0.18,
  /** TT3 §11.2: `guard` + `attack` pressed within this many seconds of each other = `golden` (KBM and pad). */
  goldenChord: 0.1,
  /**
   * TT3 §11.5 K task 8, the rebinding screen: codes a binding may never hold (modifiers, F-keys). Esc is refused by the
   * screen too, but stays bound to `pause` / `back` always (Input.rebind keeps it there).
   */
  unbindable: /^(?:Control|Alt|Meta|OS|F\d{1,2}$|ContextMenu$|CapsLock$|Fn)/,
  /** The touch / pointer model (§6.1): mouse speed under which a moving cursor is not "activity" (Photo Cam idle). */
  pointer: { idlePxPerSec: 24, speedWindow: 0.25, clickQueue: 8 },   // speed = net px over speedWindow s; cursor freshness: AIM.cursorIdle
  move: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] },
  // §6.3 twin-stick pad, standard layout (TT3 §11.2): A jump, B Tumble, X attack, Y interact, LB / RB the Stand,
  // LT kitten, RT Paw Trick (hold RT + D-pad ← → ↑ picks one), View zooms, R3 selects, D-pad ↑ Milk, D-pad ↓ Meow
  // (TT4: Meow was L3, easy to press by accident while moving and odd for an action the onboarding teaches), L3 held
  // peeks (+ RS) and shows the ranges. Golden Hour is the Stand + X within INPUT.goldenChord s (Input.js derives it).
  pad: { jump: [0], confirm: [0], dodge: [1], back: [1], attack: [2], interact: [3], guard: [4, 5], lockon: [11], ability: [6],
         trick: [7], golden: [], controls: [], zoomCycle: [8], pause: [9], meow: [13], milk: [12], lockPrev: [14], lockNext: [15],
         peek: [10], ranges: [10], navUp: [12], navDown: [13], navLeft: [14], navRight: [15] },
  /** TT3 §11.2: while RT (`trick`) is held, these D-pad buttons pick a Paw Trick instead of their own action. */
  padTrickPick: { 14: 'trick1', 15: 'trick2', 12: 'trick3' },
  classicPad: { recenter: [11], lockon: [5], guard: [4], zoomCycle: [], peek: [], ranges: [], controls: [] },
  deadZone: 0.15, triggerThreshold: 0.5,
  mouseSens: 0.0025,          // rad per px at sensitivity 1
  padLookSpeed: 2.6,          // rad/s at full right-stick deflection, sensitivity 1
  touchLookSens: 0.006,       // rad per px (tech.md §7 TouchControls)
  wheelRepeat: 0.12,          // s between wheel lock-switch edges
  preventDefault: ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Home'],
};

// ---- core+ M2: area tuning tables adopted into config (requests/combat.md, enemies.md, physics.md). The owning
// area keeps authoring the numbers; its old module re-exports these (combat/attacks.js COMBAT, enemies/tuning.js
// TUNING, physics/Physics.js PHYSICS_DEFAULTS).
/**
 * Combat tuning not covered by Appendix A. Every value is quoted from the spec it comes from.
 * Owner of the values: combat (adopted into config by core, M2; src/combat/attacks.js re-exports it).
 */
export const COMBAT = Object.freeze({
  /** tech.md §9.3: an enemy's invulnT after taking a hit (anti multi-hit; the player uses PLAYER.hurt.iframes). */
  antiMultiHit: 0.12,
  /** tech.md §9.3 / GAME_DESIGN §10.3: poise break → stagger 0.6 s, poise refilled. */
  poiseBreakStagger: 0.6,
  /** tech.md §9.3: knockback lifts the target by min(3, k × 0.25) m/s. */
  knockLiftMul: 0.25, knockLiftMax: 3,
  /** §19.4: a block pushes the guard back by `PLAYER.guard.pushback × 6` m/s. */
  pushbackVelMul: 6,
  /** tech.md §9.2: point-blank radius added to the target radius; broad-phase query pad. */
  pointBlank: 0.25, queryPad: 1.5,
  /** Body-contact attacks with no `arc` (hyena_lunge, stealer_snatch dashes): reach past the attacker's radius, half-angle. */
  contactReach: 0.45, contactHalfArc: Math.PI / 2,
  /** AttackTokens: a waiting request older than this stops blocking newer requesters; a token held this long is reclaimed. */
  tokenStale: 0.25, tokenMaxHold: 10,
  /** Tokenless enemies orbit at 1.4× their attack range (GAME_DESIGN §8.3). */
  orbitMul: 1.4,
  /** The same auto-spawned projectile (holyWave / gleam) from one owner within this window is deduplicated. */
  projectileDedupe: 0.1,
  /** Reflected projectiles home on their original shooter when it lies within this half-angle of the flipped path. */
  reflectAimCone: Math.PI / 3,
  /** ...and keep curving toward it at up to this rate (rad/s) while it stays inside that cone (it may dodge). */
  reflectHomingRate: 5,
  /** Wave crescents (holyWave, gleam) ride the ground with their centre at max(height/2, waveHover) m. */
  waveHover: 0.6,
  /** Wave hit-shape thickness (m, along travel) and crescent height when a def has no `height` (× width). */
  waveThickness: 0.35, waveHeightOfWidth: 0.4,
  /** Fallback projectile numbers for defs that omit them. */
  projectileSpeed: 12, projectileRange: 12, projectileRadius: 0.2,
  /** Pooled projectiles alive at once (the oldest is recycled beyond this). */
  maxProjectiles: 48,
});


// Enemy / boss numbers GAME_DESIGN states in prose (§8, §10, §11) but Appendix A doesn't carry (owner: enemies).
export const ENEMY_TUNING = Object.freeze({
  windupMin: 0.45,                       // §10.1 minimum windup on Knight (scaled by the difficulty windup multiplier)
  alertHopV: 2.2,                        // §10.1 alert: a 0.4 s "!" hop (vertical speed; GRAVITY 22 → ~0.2 s up + 0.2 s down)
  alertDur: 0.4,
  bang: { dur: 0.6, pop: 0.2, perH: 0.4, min: 0.28, max: 0.6, lift: 0.1, color: '#F2E6C8', ink: '#2B2330' },   // the alert "!" (m)
  groupAlertRadius: 8,                   // idle pack-mates within this radius join an alert
  groupAlertDelay: [0.15, 0.45],
  hitFlash: 0.06,                        // §8.2 light hit: 60 ms white flash on the target
  hitReact: 0.12,                        // §10.3 hit reactions: 0.12 s Hit_A / HitReact, else squash
  squash: { dur: 0.15, y: 0.8 },         // §10.1 missing clip → procedural squash (0.15 s, scale y 0.8)
  orbitMul: 1.4,                         // §8.3 tokenless enemies orbit at 1.4× their attack range
  orbitDrift: 0.45,                      // rad/s around the player while waiting for a token
  orbitRepick: [1.5, 3.0],
  windupTrackStop: 0.15,                 // stop turning this long before the strike (fair windups)
  turnRate: 10, chaseTurnRate: 8, windupTurnRate: 6,
  steerDamp: 8,
  idleTime: [1.5, 3.5],                  // tech.md §10 idle → patrol
  patrolTimeout: 6,
  arrive: 0.4,
  heardFrac: 0.35,                       // tech.md §10 canSee: closer than sight × 0.35 is "heard" (no FOV check)
  thinkEvery: 0.1,                       // perception at 10 Hz, staggered per id
  returnHeal: true,                      // tech.md §10 return: hp back to max at home
  cooldown: [0.35, 0.9],                 // between attacks when the row gives none
  recoverDefault: 0.8,
  blockRecoil: 2.5,                      // m/s pushed back when the player blocks
  die: { dur: 1.0, scamperDur: 1.1, scamperSpeed: 4.5, shrink: 0.3 },   // §10.1 never violent: poof, helmet, scamper
  helmet: { up: 3.2, side: 1.6, spin: 14, life: 1.2 },
  crow: { hoverDist: 3.5, hoverUp: 0.6, landDist: 0.35 },
  xbow: { strafe: [1.5, 3.0], perchMinY: 0.3, muzzleUp: 0.45, muzzleFwd: 0.45 },
  boss: { phaseInvuln: 1.0, addsRing: 6, dizzyEventEvery: 0.25, fallbackRange: 2.2 },
  animFarDist: 40,                       // tech.md §11.1: mixers beyond this update every 2nd frame
  pending: true,                         // §8.3 arena budget: spawns beyond the cap wait dormant for a free slot
  capRadius: 30,                         // §8.3: unalerted enemies farther than this from a spawn are another fight
  // walkers never path into deep water (the Old Bridge stream): a step whose probe point (radius + probe + speed × look
  // ahead) is deep turns by the listed angles (rad) until dry, else stops; one that ends up in deep water anyway
  // (knockback) for `rescueAfter` s, or an arena member more than `arenaSlack` m outside its locked arena, is put back
  // on its last dry footing / the nearest valid arena ring point (else despawned: the wave can still clear)
  water: { probe: 0.45, lookAhead: 0.3, turns: [0.6, -0.6, 1.2, -1.2, 1.75, -1.75, 2.4, -2.4], rescueAfter: 0.35, arenaSlack: 2, dryEvery: 0.2 },
  // open-zone enemies leave a locked arena they don't belong to alone: no alert on her while she is inside it,
  // a running chase drops back to `return`, and flyers are kept `flyerPad` m outside its fog wall
  foreignArena: { pad: 0.5, flyerPad: 1.0 },
  standoff: 0.35,                        // m between a long-bodied enemy's capsule front (its snout) and her collider
  perch: { search: 2.5, ring: 0.2, arc: 0.12, minFrac: 0.6, slack: 0.45 },   // `{ y }` spawns snap onto a nearby wall / cart top
  // M2 (§10.3 / §11 / §12 prose numbers; enemies/tuning.js `M2` merges this over its defaults, one level deep)
  m2: {
    // objective runners (§12.6 The Line): path straight for the goal (the winch), fight only if she is this close
    runner: { fightWithin: 3, arrive: 1.4, hold: 0.6 },
    // hyena pack (§10.3): flankers circle to her back (the "behind" slot), giggle, then attack
    flank: { behindArc: 1.0, maxApproach: 3.0, keepMul: 0.9 },
    jeer: { packRadius: 16, maxFogContrib: 3, duetR: 10, duetDur: 3.0 },
    gloat: { laughVol: 0.9 },
    // spider (§10.3): web patches that slow her; the abdomen pulses during the web windup
    web: { maxPatches: 16, refresh: 0.25, cutRange: 0.6, cutArc: 1.2, fade: 0.6, pulse: 0.12 },
    // stealer (§10.3): getaway to the nearest fog edge; the loot drops in front of it
    stealer: { fogEdges: 8, snatchRecover: 0.4, dropSpread: 0.6, pinArrive: 1.6 },
    // pug (§10.3): shield; the raised-shield guard clip plays when it stands its ground near her
    pug: { guardWithin: 4.5, shieldBack: 0.5, slamBand: 0.5 },
    // Gloomjelly (§10.3): hop timing; squash anticipation; children pop out on a little arc
    jelly: { hopAir: 0.42, squash: 0.18, popUp: 4.0, wobble: 0.05, opacity: 0.66, wanderEvery: [1.5, 3.0] },
    // Pilfer's town chase (§12.5): anchors chase_0..5, 3 stumbles drop the bag, too far behind restarts it
    pilferChase: { anchors: 6, hits: 3, stumble: 0.6, tooFar: 25, lead: 7, waitLead: 12, arrive: 1.0, crates: [1, 3], letterEvery: 1.2 },
    // world requests: far pre-placed enemies sleep (no AI / mixer / draw); prewarm stand-ins for the shader warm-up
    sleep: { dist: 42, hysteresis: 4, every: 0.25 },
    prewarm: { ring: 2.5, timeout: 8000 },
    // bosses (§11.2-11.3)
    boss: {
      approachSlack: 0.3, wheelMount: 0.6, wheelLapGap: 0.45, wheelRideY: 1.45, wheelContact: 0.9, wheelArenaPad: 1.2,
      tossSpeed: 7, tossR: 0.45, tossLife: 6, bombSpread: 2.6, bombFly: 1.0, snackMinDist: 3.5,
      rushW: 2.4, rushPad: 1.0, quakeBand: 0.6, quakeHeight: 0.3, cloneRing: 4.5, laughEvery: [2.5, 4.0], meowQuiet: 2.0,
      cloneTint: '#1B1C24', p3FogDur: 2.0, hatPop: true, critBoost: 1.5,
    },
  },
});

/** Physics engine tunables (GAME_DESIGN §7.1 / tech.md §5; owner: physics). */
export const PHYSICS = Object.freeze({
  walkableNormalY: 0.7,    // §7.1: slopes steeper than normal.y 0.7 slide
  steepFaceTol: 0.05,      // terrain: a rendered triangle steeper than walkableNormalY - this is always too steep (cliff
                           // banks: no standing on the smoothed foot of a cliff); between the two the smoothed slope decides
  groundSnap: 0.3,         // tech.md §5: stick to downhill slopes / step down
  skin: 0.02,              // resting-contact tolerance (m)
  substep: 0.5,            // max motion per sub-step as a fraction of the collision radius
  maxSubsteps: 24,         // (r 0.32: tunnel-free up to ~230 m/s; faster motion is clamped to that)
  deepWater: 0.5,          // water deeper than this (m) is "deep" unless the water entry says deep: true/false
  ceilingNormalY: -0.2,
  edgeSlip: 2.0,           // m/s: a grounded actor resting on a ledge edge (capsule rim) rolls off it at this speed
});

// ---------------------------------------------------------------------------------------------
// Phase W: Warm Adventure (research/next/WARM_ADVENTURE_SPEC.md §12; core.W1, one commit). Binding on tone, clarity,
// onboarding and story. Every table is deep-frozen. TELEGRAPH (glyph / ink / colours), JUICE.finalBlow and
// ENEMIES.*.plateWordsFriend are merged into their tables above.
// ---------------------------------------------------------------------------------------------
/** @template T @param {T} o @returns {Readonly<T>} */
function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  return Object.freeze(o);
}

/**
 * WA §3.2 / §3.5a class marks (fx GroundDecals; 0 draws): her pink ring, the dashed companion ring, the mint interact
 * ring, pickup twinkles and her in-world heart arc (shown `show` s after an HP change and while HP ≤ 1).
 */
export const CLASS_MARKS = deepFreeze({
  hero: { color: '#FF8FB1', alpha: 0.55, width: 0.08, r: 0.75 },
  companion: { color: '#8FD3FF', alpha: 0.35, r: 0.5, dashes: 8 },
  interact: { color: '#9BE3C4', alpha: 0.30, hz: 0.8, pulse: 0.06, twinkleEvery: 2.5, range: 8, maxZones: 6 },
  pickup: { twinkle: '#FFF1C4', gold: '#FFD57A', every: 1.2, goldEvery: 0.6, spin: 1.2 },
  heroHearts: { full: '#FF6F9C', fullA: 0.75, empty: '#4A2A1F', emptyA: 0.18, r0: 0.82, r1: 0.92, spreadDeg: 120, gapDeg: 4, show: 2.5, lowHz: 1.4 },
});

/** WA §5.7 knock-out look (player-owned timings, read by fx / ui): sit, dizzy stars, then the respawn pop at sitT + wipeT. */
export const KO = deepFreeze({ sitT: 1.2, wipeT: 0.35, starR: 0.35, starRev: 2.5, hearts: 6 });

/** WA §2.6 `world/Bunting.js` (the one added play draw; no shadow). Low halves pennants and lanterns. */
export const BUNTING = deepFreeze({ max: 240, maxLow: 120, lanternMax: 60, lanternMaxLow: 30, sag: 0.12, spacing: 0.55, minH: 3.2, flutter: 0.06 });

/** WA §5 idle ladder (s of no input; player): every step before the Photo Cam (`PLAYER.memeCam.idle`), loops from `loopFrom`. */
export const IDLE = deepFreeze({ glance: 4, look: 7, groom: 10, twirl: 12.5, loopFrom: 7, sneezeP: 0.1, hubSit: 20 });

/** WA §4.1 calm HUD (the hudMode setting, 'calm' by default): tuck `after` s out of combat (no alerted enemy within `combatR` m). */
export const HUD = deepFreeze({ tuck: { combatR: 15, after: 4, fade: 0.3, popShow: 3 } });

/** WA §6 one reward system (`ui/celebrate.js`): durations per size, combat dock, confetti cap; never pauses the game. */
export const CELEBRATE = deepFreeze({ skipAfter: 0.6, sticker: 1.6, card: 2.2, friend: 2.6, dockScale: 0.6, dockFly: 1.2, safeR: 15, confettiMax: 24 });

/** WA §5 pickups: hop, fly-to-HUD, pitch ladder (rate = 1 + pitchStep × n, n ≤ pitchMax, reset after pitchReset s). */
export const PICKUP_FX = deepFreeze({ hop: 0.35, flyMs: 450, flyLift: 120, pool: 8, pitchStep: 0.06, pitchMax: 8, pitchReset: 1.5 });

/** fx-wide design numbers. `comicPops`: parry pops always; other pops only the first time within `firstMinutes`. */
export const FX = deepFreeze({ comicPops: { parry: 'always', other: 'first', firstMinutes: 10 } });

/**
 * Story switches (WA §12 + §13 default sign-offs). `cs02Cut`: the shortened CS-02 (≤ 55 s); `kittenOffer`: offer
 * Kitten mode after `knockouts` KOs or `failedParries` failed parries within `windowS` s (once per save);
 * `mochiCage`: Mochi's tipped cart on the meadow ([x, z]; D-01 triggers there, WA20).
 */
export const STORY = deepFreeze({ cs02Cut: true, kittenOffer: { knockouts: 2, windowS: 180, failedParries: 3 }, mochiCage: [-14, -41] });

/**
 * TT2 guided onboarding (docs/TOKENTAILS-PLAN.md §10.3; story G2 reads it). Metres / seconds.
 *  wobble: Sir Wobble's home; standR: the drill's stand spot from him; stepR: he steps toward her beyond this;
 *  closeR: past this the prompt says "Get close to Sir Wobble!"; fight: the first fight on the practice field (arena id,
 *  the rats wait for her first order or `calm` s, the first hit on her deals at most `softHit`); noodleR: Noodle's
 *  barrel teaches Meow within this; mochiNearR: at Mochi's cart the line teaches the Bright Slash within this; stonesR: the Standing Stones count as reached; sceneCap: measured scene caps (s);
 *  arriveR: the default guide arrive radius; bowBark: Pearl's bow bark (s).
 */
export const ONBOARD = deepFreeze({
  wobble: [0, -86], standR: 1.3, stepR: 1.4, closeR: 1.6, arriveR: 2.2, bowBark: 2.0,
  fight: { arena: 'yard', at: [0, -77], r: 13, calm: 3, softHit: 1, spill: [0, -67.5] },
  noodle: [-30, -26], noodleR: 6, mochiNearR: 4, stones: [-20, -4], stonesR: 12,
  sceneCap: { cs01: 10, cs02: 20, cs01b: 6, d01: 12 },
});

/** WA §2.7: load / cutscene fades are cream, never black (core.W3; ui `cinema.js` and world LevelManager read it). */
export const FADE_COLOR = '#FFF1DE';

/**
 * IMPLEMENTATION_PLAN §7.4 + Phase W: the settings added by this phase and their allowed values (GameState holds the
 * defaults, save validates with these lists, ui builds its panel from them). Numeric entries are [min, max].
 */
export const SETTING_VALUES = deepFreeze({
  camLockMode: ['locked', 'semi', 'free'],            // AUTOCAM §10.4 (X19; replaces the boolean camLock, K7)
  camCursorLead: [0, 0.15],                           // AUTOCAM §5.4
  camZoomPortrait: [0.7, 1.4],                        // AUTOCAM §10.3
  fpsCap: ['auto', 30, 60, 'off'],                    // PERF §5.3
  quality: ['auto', 'low', 'med', 'high'],
  hudMode: ['calm', 'full'],                          // WA §4.1
  pathPreview: ['auto', 'on', 'off'],                 // WA §3.6 ('auto' = touch during the prologue and Chapter 1)
});

for (const t of [ENEMIES.hyena.plateWordsFriend, ENEMIES.stealer.plateWordsFriend, TELEGRAPH.glyph, TELEGRAPH.ink, JUICE.finalBlow]) Object.freeze(t);
