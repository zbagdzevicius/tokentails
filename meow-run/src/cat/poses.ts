// Mochi's pose channels and the held photo poses (pure, node-importable). The rig eases every channel toward a
// target each frame; gameplay fills the targets from the PlayerView, a held pose (setPose, ITERATION2.md contract:
// sit, wave, loaf, stretch, leap, proud) overrides all of them.
import type { PoseId } from '../ugc/contract';

export const HIP_Y = 0.42;

/** Smoothed pose channels (every frame each one eases toward its target). */
export const CH = ['hipY', 'pitch', 'roll', 'yaw', 'sx', 'sy', 'sz', 'fl', 'fr', 'bl', 'br', 'splay', 'knee', 'headPitch', 'headYaw', 'headRoll', 'ears', 'tLift', 'tCurl', 'tSway', 'tBend', 'tYaw', 'tLen', 'eyeOpen', 'mouth'] as const;
export type Ch = (typeof CH)[number];
export type Pose = Record<Ch, number>;

export const restPose = (): Pose => ({
  hipY: HIP_Y,
  pitch: 0,
  roll: 0,
  yaw: 0,
  sx: 1,
  sy: 1,
  sz: 1,
  fl: 0,
  fr: 0,
  bl: 0,
  br: 0,
  splay: 0,
  knee: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  ears: 0,
  tLift: 1.15,
  tCurl: 0.05,
  tSway: 0.1,
  tBend: 0,
  tYaw: 0,
  tLen: 0.78,
  eyeOpen: 1,
  mouth: 0,
});

const REST = restPose();

/**
 * Write the targets of a held photo pose at time t (s) into out (every channel). Channel signs follow the rig:
 * pitch < 0 = nose up, leg swing < 0 = paw forward, headPitch > 0 = nose down, tYaw = how far the tail curls round
 * to the side.
 */
export function poseTargets(id: PoseId, t: number, out: Pose): Pose {
  Object.assign(out, REST);
  const breathe = Math.sin(t * 2.1);
  switch (id) {
    case 'sit':
      // sat on her haunches (rear on the ground), front legs straight down to the ground, tail wrapped round her side
      out.hipY = 0.31 + breathe * 0.004;
      out.pitch = -0.6;
      out.bl = -0.78;
      out.br = -0.78;
      out.fl = 0.6;
      out.fr = 0.62;
      out.headPitch = 0.48 + Math.sin(t * 0.9) * 0.03;
      out.headRoll = Math.sin(t * 0.7) * 0.06;
      out.ears = 0.05;
      out.tLift = -0.3;
      out.tCurl = 0.02;
      out.tSway = 0.03;
      out.tYaw = 1.0;
      out.tBend = 0.07;
      break;
    case 'wave':
      // sitting, the RIGHT paw (the side the hero, photo and wardrobe cameras sit on) high up waving hello, big happy
      // eyes and a small open smile
      out.hipY = 0.32;
      out.pitch = -0.62;
      out.bl = -0.78;
      out.br = -0.78;
      out.fl = 0.62;
      out.fr = -2.75 + Math.sin(t * 11) * 0.4;
      out.headPitch = 0.42;
      out.headRoll = -0.1 + Math.sin(t * 5.5) * 0.1;
      out.headYaw = -0.18 + Math.sin(t * 2.2) * 0.08;
      out.tLift = 0.9;
      out.tSway = 0.3;
      out.tYaw = 0.9;
      out.mouth = 0.38;
      out.eyeOpen = 1.22;
      break;
    case 'loaf':
      // the cat loaf: paws tucked away, a contented squint, tail round the side
      out.hipY = 0.2 + breathe * 0.006;
      out.pitch = 0.02;
      // paws folded away under the chest and the haunches
      out.fl = 1.2;
      out.fr = 1.2;
      out.bl = -1.2;
      out.br = -1.2;
      out.knee = 1.1;
      out.sx = 1.1;
      out.sy = 0.86 + breathe * 0.01;
      out.sz = 0.98;
      out.headPitch = 0.04;
      out.ears = 0.1;
      out.tLift = -0.3;
      out.tCurl = 0.01;
      out.tSway = 0.02;
      out.tYaw = 0.9;
      out.tBend = 0.09;
      out.eyeOpen = 0.32;
      break;
    case 'stretch':
      // the big front stretch: chest low, bum up, paws reaching, a huge yawn
      out.hipY = 0.36;
      out.pitch = 0.42;
      out.fl = -1.35;
      out.fr = -1.3;
      out.bl = 0.1;
      out.br = 0.12;
      out.sz = 1.16;
      out.sy = 0.94;
      out.headPitch = -0.55;
      out.ears = 0.45;
      out.tLift = 1.25 + Math.sin(t * 3) * 0.05;
      out.tCurl = 0.12;
      out.tSway = 0.12;
      out.mouth = 0.85 + Math.sin(t * 1.7) * 0.1;
      out.eyeOpen = 0.1;
      break;
    case 'leap':
      // frozen mid-pounce: stretched long, paws out, big eyes
      out.hipY = 0.95 + Math.sin(t * 2.4) * 0.02;
      out.pitch = -0.32;
      out.fl = -1.45;
      out.fr = -1.3;
      out.bl = 1.25;
      out.br = 1.15;
      out.sz = 1.16;
      out.sy = 0.94;
      out.headPitch = 0.12;
      out.ears = 0.55;
      out.tLift = 0.35;
      out.tCurl = 0.05;
      out.tSway = 0.18;
      out.mouth = 0.75;
      out.eyeOpen = 1.3;
      break;
    case 'proud':
      // chest out, chin up, a confident smile, tail high with a hooked tip
      out.hipY = 0.41;
      out.pitch = -0.22;
      out.fl = 0.22;
      out.fr = 0.24;
      out.bl = -0.35;
      out.br = -0.33;
      out.sy = 1.05;
      out.headPitch = -0.12;
      out.headRoll = 0.08 + Math.sin(t * 1.3) * 0.03;
      out.ears = 0;
      out.tLift = 1.45;
      out.tCurl = 0.2;
      out.tSway = 0.06;
      // a confident little smile, eyes open (half-lidded read as sleepy)
      out.mouth = 0.22;
      out.eyeOpen = 0.92;
      break;
  }
  return out;
}
