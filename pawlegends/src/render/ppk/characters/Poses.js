// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/Poses.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// Pose library + analytic two-bone IK for the kitten rig (GAME_DESIGN §19.4 pose names; art.md §2.2 signature poses).
// Kitten space: feet at the origin, facing +Z, the cat's LEFT is +X. 1 unit = H.
// Joint entries are Euler offsets [x, y, z] (radians) applied on top of the rest rotation.
//   +x pitches the top forward (head: look down; thigh: leg swings BACK; knee: bends), +y yaws toward her left,
//   +z rolls +x toward +y (left leg: splay out).
// Arms are solved by IK from paw-centre targets (root space) or from points on the sword ("grip": sword-local y).
// Pure data + math: safe in node tests.
import * as THREE from 'three';

/** Sword-local landmarks (must match Sword.js). */
export const SWORD_PTS = Object.freeze({ pommel: -0.132, gripTop: -0.012, gripMid: -0.055, gripLow: -0.1 });

/**
 * The nine contract poses (GAME_DESIGN §19.4) + the Phase W procedural poses (WARM_ADVENTURE_SPEC §5.6, characters.W2:
 * 'cheer', 'groom', 'twirl', 'boop', 'pawBump'; their motion is the same-named emote on top of the held pose).
 */
export const POSE_NAMES = Object.freeze(['vigil', 'oath', 'sip', 'selfie', 'faint', 'kneel', 'sit', 'sleep', 'idle', 'cheer', 'groom', 'twirl', 'boop', 'pawBump']);
/** Phase W poses (a subset of POSE_NAMES): hold the pose, play `kitten.emote(name)` for the motion. */
export const WARM_POSE_NAMES = Object.freeze(['cheer', 'groom', 'twirl', 'boop', 'pawBump']);
/** Extra poses beyond the contract nine (M1 extras + M2 activity poses). */
export const EXTRA_POSE_NAMES = Object.freeze(['ready', 'restUp', 'coinHold', 'guard', 'block', 'selfie_sit', 'cheer', 'hug', 'wave', 'read', 'fish', 'aim', 'heal', 'spoonReady', 'nap']);

export const POSES = {
  // ref2: sword planted point-down, both gauntlets stacked on the pommel, head straight, eyes on the camera.
  vigil: {
    joints: { hips: [0.0, 0, 0], chest: [0.05, 0, 0], head: [-0.03, 0, 0], thighL: [0, 0.05, 0.06], thighR: [0, -0.05, -0.06], footL: [0, 0.3, -0.05], footR: [0, -0.3, 0.05] },
    sword: { mode: 'hand', pommel: [0.0, 0.49, 0.17], dir: [0, -1, 0.05], face: [0, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.pommel, off: [-0.012, 0.03, -0.004], pole: [-1, -0.8, -0.2], twist: [0.15, 0, 0.25] },
      L: { grip: SWORD_PTS.gripMid - 0.004, off: [0.014, 0.0, 0.008], pole: [1, -0.9, -0.2], twist: [0.1, 0, -0.3] },
    },
    tail: [[0, 0.1, 0], [0, 0.1, 0], [0, 0.12, 0], [0, 0.1, 0], [0, 0.06, 0], [0, 0, 0]],
    expr: 'worried',
  },
  // ref1 / ref3: sword vertical in front of the face, slightly to her right; head peeks beside the blade.
  oath: {
    joints: { chest: [0.0, -0.12, 0], hips: [0, -0.04, 0], head: [-0.04, 0.16, 0.05], thighL: [0, 0.05, 0.06], thighR: [0, -0.05, -0.06], footL: [0, 0.3, 0], footR: [0, -0.25, 0] },
    sword: { mode: 'hand', guard: [-0.175, 0.585, 0.17], dir: [-0.04, 1, -0.05], face: [0.35, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0.0, 0, 0.012], pole: [-1, -0.8, -0.1], twist: [0, 0.5, 1.4] },
      L: { paw: [0.035, 0.45, 0.155], pole: [1, -0.8, -0.3], twist: [-0.3, -0.2, -0.9] },
    },
    tail: [[0.05, 0.15, 0], [0, 0.12, 0], [0, 0.1, 0], [0, 0.1, 0], [0, 0.06, 0], [0, 0, 0]],
    expr: 'earnest',
  },
  // Milk Break: cup to the mouth in the left paw, sword resting point-down in the right.
  sip: {
    joints: { chest: [-0.06, 0.05, 0], head: [0.12, 0.08, 0.08], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'hand', guard: [-0.2, 0.3, 0.1], dir: [-0.12, -1, 0.42], face: [1, 0, 0.2] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.2, -0.6], twist: [0, 0, 0] },
      L: { paw: [0.035, 0.57, 0.19], pole: [1, -0.6, -0.4], twist: [-0.6, 0.4, -1.0] },
    },
    expr: 'joy',
  },
  // Selfie (TREND V3): right gauntlet held out as the "camera", cup in the left paw, sword stuck in the ground.
  selfie: {
    joints: { chest: [-0.08, -0.12, 0.04], head: [-0.12, -0.28, 0.14], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'root', pommel: [-0.3, 0.52, -0.02], dir: [0.08, -1, 0.06], face: [0.3, 0, 1] },
    arms: {
      R: { paw: [-0.075, 0.655, 0.22], pole: [-1, -0.5, -0.4], twist: [-1.2, 0, 0.4] },
      L: { paw: [0.04, 0.565, 0.19], pole: [1, -0.6, -0.4], twist: [-0.6, 0.4, -1.0] },
    },
    expr: 'happy',
  },
  // Faint (Nine Lives): curled up on her side on her cape.
  faint: {
    body: { p: [0.26, 0.17, -0.02], r: [0, 0, Math.PI / 2] },
    joints: { hips: [0.35, 0, 0], chest: [0.3, 0, 0], head: [0.25, 0.25, -0.2], thighL: [-1.3, 0, 0.15], thighR: [-1.2, 0, -0.1], kneeL: [1.4, 0, 0], kneeR: [1.3, 0, 0], footL: [0.3, 0, 0], footR: [0.3, 0, 0], earL: [-0.4, 0, -0.3], earR: [-0.4, 0, 0.3] },
    sword: { mode: 'root', guard: [0.1, 0.03, 0.42], dir: [-0.25, -0.02, 1], face: [0, 1, 0] },
    arms: { L: { fk: { shoulder: [-1.2, 0, 0.3], elbow: [-1.2, 0, 0] } }, R: { fk: { shoulder: [-1.1, 0, -0.2], elbow: [-1.3, 0, 0] } } },
    tail: [[0.2, 0.6, 0], [0, 0.5, 0], [0, 0.5, 0], [0, 0.4, 0], [0, 0.35, 0], [0, 0.2, 0]],
    expr: 'faint',
  },
  // Kneel (CS-16 knighting, Brutus duel): right knee down, sword planted before her, head bowed.
  kneel: {
    body: { p: [0, -0.115, 0.02] },
    joints: { hips: [-0.1, 0, 0], chest: [0.16, 0, 0], head: [0.4, 0, 0], thighL: [-1.45, 0.1, 0.06], kneeL: [1.5, 0, 0], footL: [0.0, 0.1, 0], thighR: [0.55, -0.05, -0.06], kneeR: [1.95, 0, 0], footR: [-0.3, 0, 0] },
    sword: { mode: 'hand', pommel: [0.0, 0.39, 0.24], dir: [0, -1, 0.12], face: [0, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.pommel, off: [-0.004, 0.034, -0.004], pole: [-1, -0.3, -0.6], twist: [0.2, 0, 0.25] },
      L: { grip: SWORD_PTS.gripMid - 0.008, off: [0.008, 0, 0.012], pole: [1, -0.4, -0.5], twist: [0.15, 0, -0.35] },
    },
    tail: [[-0.1, 0.2, 0], [0, 0.15, 0], [0, 0.1, 0], [0, 0.1, 0], [0, 0.05, 0], [0, 0, 0]],
    expr: 'earnest',
  },
  // Sit on the ground, legs forward, paws in the lap, sword leaning beside her.
  sit: {
    body: { p: [0, -0.165, -0.02] },
    joints: { hips: [-0.18, 0, 0], chest: [0.1, 0, 0], head: [0.06, 0, 0.04], thighL: [-1.5, 0.15, 0.1], thighR: [-1.5, -0.15, -0.1], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0], footL: [-0.3, 0.2, 0], footR: [-0.3, -0.2, 0] },
    sword: { mode: 'root', pommel: [-0.25, 0.47, 0.07], dir: [-0.12, -1, 0.04], face: [0.3, 0, 1] },
    arms: {
      R: { paw: [-0.06, 0.255, 0.18], pole: [-1, -0.2, -0.3], twist: [-0.4, 0, 0.2] },
      L: { paw: [0.06, 0.255, 0.18], pole: [1, -0.2, -0.3], twist: [-0.4, 0, -0.2] },
    },
    tail: [[0.0, 0.7, 0], [0, 0.5, 0], [0, 0.45, 0], [0, 0.4, 0], [0, 0.3, 0], [0, 0.2, 0]],
    expr: 'neutral',
  },
  // Sleep: loaf, head down on her paws, tail wrapped around.
  sleep: {
    body: { p: [0, -0.2, 0.05], r: [0.25, 0, 0] },
    joints: { hips: [0.1, 0, 0], chest: [0.15, 0, 0], head: [0.2, 0.15, 0.25], thighL: [-1.5, 0.25, 0.25], thighR: [-1.5, -0.25, -0.25], kneeL: [2.0, 0, 0], kneeR: [2.0, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0], earL: [-0.2, 0, -0.15], earR: [-0.2, 0, 0.15] },
    sword: { mode: 'root', guard: [0.27, 0.025, 0.3], dir: [-0.2, -0.02, -1], face: [0, 1, 0] },
    arms: { L: { fk: { shoulder: [-1.35, 0, -0.15], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [-1.35, 0, 0.15], elbow: [-0.3, 0, 0] } } },
    tail: [[0.2, -0.5, 0], [0, -0.8, 0], [0, -0.8, 0], [0, -0.7, 0], [0, -0.6, 0], [0, -0.5, 0]],
    expr: 'sleep',
  },
  // Relaxed stand: sword in the right paw, tip resting on the ground ahead like a cane. The flat faces front/back
  // (not sideways), so the blade reads as a broad bright strip from the gameplay camera behind her.
  idle: {
    joints: { chest: [0.02, 0.04, 0], head: [0.0, 0.06, 0.03], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'hand', guard: [-0.19, 0.31, 0.13], dir: [-0.06, -1, 0.42], face: [0.45, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.2, -0.6], twist: [0, 0, 0] },
      L: { fk: { shoulder: [0.05, 0, 0.12], elbow: [-0.25, 0, 0], paw: [0, 0, 0] } },
    },
    expr: 'neutral',
  },
  // Hero rest stand (WARM_ADVENTURE_SPEC §3.3 readability): the blade held upright at her right side, flat to the front,
  // tip above her ear line, so from the 50° iso lens the bright blade always reads beside her silhouette (the cane
  // idle hid it behind her body). Swordcat's `idlePose`; long skins (claymore, toobig) keep the cane idle (tip drag).
  restUp: {
    joints: { chest: [0.0, 0.04, 0], head: [0.0, 0.06, 0.03], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'hand', guard: [-0.23, 0.37, 0.1], dir: [-0.22, 1, 0.12], face: [0.3, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.4, -0.6], twist: [0, 0, 0] },
      L: { fk: { shoulder: [0.05, 0, 0.12], elbow: [-0.25, 0, 0], paw: [0, 0, 0] } },
    },
    expr: 'neutral',
  },
  // Combat-ready base (player animator layers swings on top): two-paw grip at chest height, blade up-forward.
  ready: {
    joints: { chest: [0.08, -0.1, 0], head: [-0.02, 0.06, 0], thighL: [-0.15, 0.1, 0.08], thighR: [0.15, -0.1, -0.08], kneeL: [0.15, 0, 0], kneeR: [0.2, 0, 0], footL: [0.05, 0.35, 0], footR: [0, -0.35, 0] },
    // TT3: held out at her right side and angled away (was straight up in front of her face: walk, hurt)
    sword: { mode: 'hand', guard: [-0.15, 0.44, 0.22], dir: [-0.5, 0.78, 0.38], face: [0.6, 0, -0.3] },
    arms: {
      R: { grip: SWORD_PTS.gripTop - 0.022, off: [0, 0, 0], pole: [-1, -0.5, -0.4], twist: [0, 0, 0.6] },
      L: { grip: SWORD_PTS.gripLow + 0.006, off: [0.01, 0, 0], pole: [1, -0.6, -0.4], twist: [0, 0, -0.6] },
    },
    expr: 'determined',
  },
  // Sitting selfie (CS-03 on the hay bale): sit legs + selfie arms.
  selfie_sit: null,
  // ---- Phase W poses (WARM_ADVENTURE_SPEC §5.6): held bases; the motion is the same-named emote.
  // Groom: left paw up at the mouth (the paw lick), head tipped into it; sword resting like idle.
  groom: {
    joints: { chest: [0.06, 0.12, 0], head: [0.22, 0.25, 0.12], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'hand', guard: [-0.19, 0.31, 0.13], dir: [-0.06, -1, 0.42], face: [0.45, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.2, -0.6], twist: [0, 0, 0] },
      L: { paw: [0.03, 0.66, 0.2], pole: [1, -0.6, -0.3], twist: [0, 0, 0] },
    },
    expr: 'happy',
  },
  // Twirl: blade held out to her right side at shoulder height (the emote spins it around the grip).
  twirl: {
    joints: { chest: [-0.04, -0.18, 0], head: [-0.06, -0.2, 0], thighL: [0, 0.05, 0.06], thighR: [0, -0.05, -0.06], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'hand', guard: [-0.36, 0.52, 0.1], dir: [-0.6, 0.75, 0.25], face: [0, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.6, -0.5], twist: [0, 0, 0] },
      L: { fk: { shoulder: [-0.2, 0, 0.5], elbow: [-0.4, 0, 0] } },
    },
    expr: 'happy',
  },
  // Boop: leaning in, nose first, head tilted (kitten rescue reunion). TT4: the sword rests point-down in her right paw
  // (planted beside her it read as a sword standing on its own), the left paw reaches in.
  boop: {
    joints: { body: [0.12, 0, 0], chest: [0.18, 0, 0], head: [0.1, 0, 0.21], thighL: [-0.1, 0.05, 0.05], thighR: [-0.1, -0.05, -0.05] },
    sword: { mode: 'hand', guard: [-0.2, 0.3, 0.14], dir: [-0.08, -1, 0.38], face: [0.45, 0, 1] },
    arms: {
      L: { fk: { shoulder: [-0.6, 0, 0.15], elbow: [-0.6, 0, 0] } },
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.2, -0.6], twist: [0, 0, 0] },
    },
    expr: 'happy',
  },
  // Paw bump: right paw held out forward at chest height (companions after an encounter clear).
  pawBump: {
    joints: { chest: [0.05, 0.12, 0], head: [0.02, 0.1, 0], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'root', pommel: [0.32, 0.5, -0.05], dir: [-0.06, -1, 0.0], face: [0.2, 0, 1] },
    arms: {
      R: { paw: [-0.08, 0.55, 0.36], pole: [-1, -0.6, -0.3], twist: [0, 0, 0] },
      L: { fk: { shoulder: [0.05, 0, 0.12], elbow: [-0.25, 0, 0], paw: [0, 0, 0] } },
    },
    expr: 'happy',
  },
  // TT4 Stand (her block): the blade held flat across in front of her face, the right paw on the grip, the left paw
  // bracing the flat; feet apart, chest and head tucked. Reads from behind and from the iso lens as a bar across her
  // (the planted-sword vigil hid the blade behind her body).
  block: {
    joints: { hips: [0.04, 0, 0], chest: [0.1, 0, 0], head: [0.08, 0, 0], thighL: [-0.12, 0.08, 0.14], thighR: [0.1, -0.08, -0.14], kneeL: [0.22, 0, 0], kneeR: [0.18, 0, 0], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'hand', guard: [-0.16, 0.6, 0.24], dir: [1, 0.12, 0.08], face: [0, 0.3, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.6, -0.4], twist: [0, 0, 0] },
      L: { paw: [0.16, 0.6, 0.25], pole: [1, -0.6, -0.4], twist: [0, 0, -0.6] },
    },
    tail: [[0, 0.15, 0], [0, 0.15, 0], [0, 0.12, 0], [0, 0.1, 0], [0, 0.06, 0], [0, 0, 0]],
    expr: 'determined',
  },
  // Victory cheer: sword raised high in the right paw. TT4: the fist up and out beside her head, the blade leaning out
  // and the head tipped the other way (the old grip at x −0.2 was out of the arm's reach and pressed the fist into her cheek)
  cheer: {
    joints: { chest: [-0.1, 0, 0.08], head: [-0.16, 0, 0.12], thighL: [0, 0.05, 0.06], thighR: [0, -0.05, -0.06], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'hand', guard: [-0.36, 0.66, 0.1], dir: [-0.45, 1, 0.06], face: [0, 0, 1] },
    arms: {
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, 0, -1], twist: [0, 0, 0] },
      L: { fk: { shoulder: [-0.3, 0, 1.6], elbow: [-0.8, 0, 0] } },
    },
    expr: 'happy',
  },
  // TT3: the Token Tails Cat's idle: the gold ':3' coin held up at chest height in both paws (`idlePose`; no sword).
  coinHold: {
    joints: { chest: [0.0, 0.0, 0], head: [-0.04, 0.0, 0.04], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'hidden' },
    arms: {
      L: { paw: [0.05, 0.41, 0.15], pole: [1, -0.6, -0.4], twist: [0, 0, -0.5] },
      R: { paw: [-0.05, 0.41, 0.15], pole: [-1, -0.6, -0.4], twist: [0, 0, 0.5] },
    },
    expr: 'happy',
  },
  // Hug (CS-11): arms forward and around, sword stuck in the ground.
  hug: {
    joints: { chest: [0.15, 0, 0], head: [0.15, 0.2, 0.2], footL: [0, 0.2, 0], footR: [0, -0.2, 0] },
    sword: { mode: 'root', pommel: [-0.32, 0.5, -0.05], dir: [0.06, -1, 0.0], face: [0.2, 0, 1] },
    arms: { L: { fk: { shoulder: [-1.25, 0.2, 0.35], elbow: [-0.9, 0.6, 0] } }, R: { fk: { shoulder: [-1.25, -0.2, -0.35], elbow: [-0.9, -0.6, 0] } } },
    expr: 'happy',
  },
  // ---- M2 activity / companion poses (§12.5 hub spots, §3.3 companions, §9.3 Spoon Brigade). The sword (if any) is
  // stuck in the ground beside her, like 'hug'.
  // Waving (Waffles on the balcony, Clover greeting): right paw high; the wave itself is the 'wave' emote / idle life.
  // TT4: the LEFT paw waves (the wave emote follows the pose), the sword rests point-down in the right paw (planted beside
  // her it read as a sword standing on its own)
  wave: {
    joints: { chest: [-0.04, -0.08, 0], head: [-0.08, -0.12, 0.08], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'hand', guard: [-0.2, 0.3, 0.14], dir: [-0.08, -1, 0.38], face: [0.45, 0, 1] },
    arms: {
      L: { fk: { shoulder: [-0.45, 0, 1.95], elbow: [-0.75, 0, 0] } },
      R: { grip: SWORD_PTS.gripMid, off: [0, 0, 0], pole: [-1, -0.2, -0.6], twist: [0, 0, 0] },
    },
    tail: [[0, 0.3, 0], [0, 0.25, 0], [0, 0.2, 0], [0, 0.15, 0], [0, 0.1, 0], [0, 0, 0]],
    expr: 'happy',
  },
  // Reading (Juniper in the library, Earl Grey): sitting, book held in both paws in the lap, head bowed over it.
  read: {
    body: { p: [0, -0.165, -0.02] },
    joints: { hips: [-0.18, 0, 0], chest: [0.16, 0, 0], head: [0.32, 0, 0], thighL: [-1.5, 0.15, 0.1], thighR: [-1.5, -0.15, -0.1], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0], footL: [-0.3, 0.2, 0], footR: [-0.3, -0.2, 0] },
    sword: { mode: 'root', pommel: [-0.25, 0.47, 0.07], dir: [-0.12, -1, 0.04], face: [0.3, 0, 1] },
    arms: {
      R: { paw: [-0.065, 0.3, 0.2], pole: [-1, -0.3, -0.3], twist: [-0.9, 0, 0.3] },
      L: { paw: [0.065, 0.3, 0.2], pole: [1, -0.3, -0.3], twist: [-0.9, 0, -0.3] },
    },
    tail: [[0.0, 0.7, 0], [0, 0.5, 0], [0, 0.45, 0], [0, 0.4, 0], [0, 0.3, 0], [0, 0.2, 0]],
    expr: 'neutral',
  },
  // Fishing on the fountain rim (Biscuit, Pebble): sitting, the rod held out in both paws.
  fish: {
    body: { p: [0, -0.165, -0.02] },
    joints: { hips: [-0.18, 0, 0], chest: [0.06, 0, 0], head: [0.12, 0, 0], thighL: [-1.5, 0.15, 0.1], thighR: [-1.5, -0.15, -0.1], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], footL: [0, 0.2, 0], footR: [0, -0.2, 0] },
    sword: { mode: 'root', pommel: [-0.25, 0.47, 0.07], dir: [-0.12, -1, 0.04], face: [0.3, 0, 1] },
    arms: {
      R: { paw: [-0.03, 0.31, 0.21], pole: [-1, -0.3, -0.3], twist: [-0.3, 0, 0.3] },
      L: { paw: [0.03, 0.34, 0.24], pole: [1, -0.3, -0.3], twist: [-0.3, 0, -0.3] },
    },
    tail: [[0.0, 0.7, 0], [0, 0.5, 0], [0, 0.45, 0], [0, 0.4, 0], [0, 0.3, 0], [0, 0.2, 0]],
    expr: 'happy',
  },
  // Sage's draw: bow arm (left) straight out at the target, right paw drawn back to the cheek, body side-on.
  aim: {
    joints: { hips: [0, 0.35, 0], chest: [0, 0.45, 0], head: [-0.02, -0.7, 0], thighL: [-0.15, 0.2, 0.12], thighR: [0.15, -0.1, -0.08], footL: [0, 0.4, 0], footR: [0, -0.2, 0] },
    sword: { mode: 'root', pommel: [-0.32, 0.5, -0.05], dir: [0.06, -1, 0.0], face: [0.2, 0, 1] },
    arms: {
      L: { paw: [0.2, 0.47, 0.28], pole: [1, -1, 0], twist: [0, 0, -1.2] },
      R: { paw: [0.0, 0.52, 0.06], pole: [-1, -0.2, -0.6], twist: [0, 0, 0.4] },
    },
    tail: [[0, -0.2, 0], [0, -0.15, 0], [0, -0.1, 0], [0, -0.05, 0], [0, 0, 0], [0, 0, 0]],
    expr: 'determined',
  },
  // Clover's heal: flower staff raised high in the right paw, left paw out, chin up.
  heal: {
    joints: { chest: [-0.1, 0, 0], head: [-0.22, 0, 0], thighL: [0, 0.05, 0.06], thighR: [0, -0.05, -0.06], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'root', pommel: [-0.32, 0.5, -0.05], dir: [0.06, -1, 0.0], face: [0.2, 0, 1] },
    arms: { R: { fk: { shoulder: [-2.2, 0, -0.35], elbow: [-0.3, 0, 0] } }, L: { fk: { shoulder: [-0.7, 0, 0.7], elbow: [-0.4, 0, 0] } } },
    tail: [[0, 0.2, 0], [0, 0.2, 0], [0, 0.15, 0], [0, 0.1, 0], [0, 0.05, 0], [0, 0, 0]],
    expr: 'happy',
  },
  // Spoon Brigade ready stance behind the Line: spoon held up and back, ready to lob (the throw is the 'throw' emote).
  spoonReady: {
    joints: { chest: [0.04, -0.15, 0], head: [-0.04, 0.12, 0], thighL: [-0.12, 0.1, 0.08], thighR: [0.12, -0.1, -0.08], footL: [0, 0.35, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'root', pommel: [-0.32, 0.5, -0.05], dir: [0.06, -1, 0.0], face: [0.2, 0, 1] },
    arms: { R: { fk: { shoulder: [-1.9, 0, -0.5], elbow: [-1.2, 0, 0] } }, L: { fk: { shoulder: [-0.6, 0, 0.4], elbow: [-0.6, 0, 0] } } },
    tail: [[0, 0.2, 0], [0, 0.2, 0], [0, 0.15, 0], [0, 0.1, 0], [0, 0.05, 0], [0, 0, 0]],
    expr: 'determined',
  },
};
// TT3: the rest tail is an upright question-mark curl (KittenBuilder TAIL_CURVE); poses that sit or lie on the ground
// tip it back down onto the grass first (tail0 pitch), so their sideways curl still wraps around her
export const TAIL_LAY = -1.25;
for (const n of ['faint', 'sit', 'sleep', 'read', 'fish']) {
  const t = POSES[n].tail;
  if (t) t[0] = [t[0][0] + TAIL_LAY, t[0][1], t[0][2]];
}
// derived poses
POSES.guard = POSES.vigil;
POSES.nap = POSES.sleep;
POSES.selfie_sit = { ...POSES.sit, arms: POSES.selfie.arms, sword: POSES.sit.sword, joints: { ...POSES.sit.joints, chest: [0.0, -0.12, 0.04], head: POSES.selfie.joints.head }, expr: 'happy' };

// ------------------------------------------------------------------ IK

const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _f = new THREE.Vector3();
const _mb = new THREE.Matrix4(), _qi = new THREE.Quaternion();
/**
 * Analytic two-bone IK in the shoulder's parent space. Bones hang along local -Y; the elbow bends about local X.
 * @param {THREE.Vector3} S shoulder position
 * @param {THREE.Vector3} T wrist (paw joint) target
 * @param {number} a upper length  @param {number} b fore length
 * @param {THREE.Vector3} pole direction the elbow should point toward (parent space)
 * @param {THREE.Quaternion} qS out: shoulder local rotation   @param {THREE.Quaternion} qE out: elbow local rotation
 * @returns {number} reach error (0 when the target is reachable)
 */
export function solveTwoBone(S, T, a, b, pole, qS, qE) {
  _d.subVectors(T, S);
  const raw = _d.length();
  const d = THREE.MathUtils.clamp(raw, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  _d.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const A = Math.acos(cosA);
  _n.crossVectors(_d, pole);
  if (_n.lengthSq() < 1e-8) { _n.set(1, 0, 0).cross(_d); if (_n.lengthSq() < 1e-8) _n.set(0, 0, 1); }
  _n.normalize();
  _e.copy(_d).applyAxisAngle(_n, A); // upper-arm direction, bent toward the pole
  // shoulder basis: local -Y -> e, local X -> n (bend axis)
  _y.copy(_e).negate();
  _x.copy(_n).addScaledVector(_y, -_n.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  _mb.makeBasis(_x, _y, _z);
  qS.setFromRotationMatrix(_mb);
  // elbow: forearm direction in shoulder-local space, rotation about X
  const E = _f.copy(S).addScaledVector(_e, a);
  _f.subVectors(T, E).normalize();
  _qi.copy(qS).invert();
  _f.applyQuaternion(_qi);
  const th = Math.atan2(-_f.z, -_f.y);
  qE.setFromAxisAngle(_x.set(1, 0, 0), th);
  return Math.max(0, raw - d);
}

/** Build a sword root-space matrix from a pose's sword spec. Returns null for mode 'hidden'. */
export function swordMatrix(spec, out = new THREE.Matrix4()) {
  if (!spec || spec.mode === 'hidden') return null;
  const dir = new THREE.Vector3(...spec.dir).normalize();
  let face = new THREE.Vector3(...(spec.face || [0, 0, 1]));
  face.addScaledVector(dir, -face.dot(dir)).normalize();
  if (face.lengthSq() < 1e-6) face = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
  const xA = new THREE.Vector3().crossVectors(dir, face).normalize();
  const origin = new THREE.Vector3();
  if (spec.guard) origin.set(...spec.guard);
  else if (spec.pommel) origin.set(...spec.pommel).addScaledVector(dir, -SWORD_PTS.pommel);
  out.makeBasis(xA, dir, face).setPosition(origin);
  return out;
}
