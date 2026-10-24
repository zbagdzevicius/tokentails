// Mutable game state shared by every module. FROZEN (lanes read and write the fields, never add new ones here).
import * as THREE from 'three';
import type { CatDef, CatRig, CatStats, LevelDef, Settings, UltraAbility } from './types';

export type Mode = 'title' | 'play' | 'paused' | 'over';

/** Hard capacities of the instanced pools. City generators and level configs must stay under them. */
export const CAPS = { segs: 4200, trees: 600, cars: 90, people: 420, fish: 4 } as const;

export const COMBO_T = 2.0;

/** Session-level state. */
export const game = {
  mode: 'title' as Mode,
  level: null as unknown as LevelDef, // set by session.prepareLevel before the first frame
  cat: null as unknown as CatDef,
  ability: null as UltraAbility | null,
  rig: null as unknown as CatRig, // the model of game.cat, in the scene
  intro: 0, // 0 = street-level title shot, 1 = gameplay camera
  overAt: 0, // performance.now() when the level ended
  camYaw: 0,
};

/** Per-run counters (reset by session.prepareLevel). */
export const G = {
  time: 90,
  damage: 0,
  combo: 0,
  maxCombo: 0,
  comboT: 0,
  patience: 100,
  ultra: 0,
  ultraT: 0,
  buildings: 0,
  helis: 0,
  taxis: 0,
  fish: 0,
  hitStop: 0,
  trauma: 0,
  elapsed: 0,
  zapComboT: 0,
  zap: 0, // running ultra total for the ticking counter
  frenzy: false,
  blockedT: 0,
  bonkT: 0,
  wanted: 0, // landmarks toppled
  timeFrozen: false, // tutorial: the clock and spawners wait while true
  bossDefeated: false,
  kills: {} as Record<string, number>,
};

/** The player cat's physical state. */
export const C = {
  pos: new THREE.Vector3(),
  y: 0,
  vy: 0,
  heading: 0,
  speed: 0,
  vel: new THREE.Vector3(),
  air: false,
  swipeCd: 0,
  pounceCd: 0,
  wet: 0, // 1 while being sprayed this frame (enemies call soak())
  stun: 0, // seconds of startle left (cucumbers): no input
  tugX: 0, // per-frame pull (vacuums), world units per second, reset every frame
  tugZ: 0,
  slow: 1, // per-frame speed multiplier, reset every frame
  fwd: new THREE.Vector3(0, 0, 1),
  right: new THREE.Vector3(-1, 0, 0),
};

/** The current WANTED landmark. */
export const W = { bi: -1, t: 0, next: 5, orig: [] as THREE.Color[] };

/** Live stats of the cat being played (base stats + upgrades), copied in by session.prepareLevel. */
export const P: CatStats = {
  walk: 34,
  zoom: 62,
  turn: 7,
  radius: 13,
  headY: 46,
  scale: 1,
  swatCd: 0.32,
  swatReach: 26,
  swatRadius: 17,
  swatPower: 1,
  pounceCd: 2.0,
  pounceR: 32,
  pounceJump: 95,
  pounceFwd: 85,
  patienceMax: 100,
  wetResist: 1,
  stunResist: 1,
  ultraCharge: 1,
  ultraTime: 7,
};

export const settings: Settings = { master: 1, music: 0.6, sfx: 1, shake: 1, quality: 'high' };

/** buildings touched this run (by index) */
export const touched = new Set<number>();
