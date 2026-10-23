// Enemy dispatch: forwards level lifecycle and player attacks to every active EnemyType. FROZEN.
import type * as THREE from 'three';
import { events } from './events';
import { enemyTypes } from './registry';
import { G } from './state';
import type { Blast, EnemyId, EnemyType, LevelDef, SwatHit } from './types';

let inited = false;
const active: EnemyType[] = [];

/** Boot: init() every registered type once. */
export function initEnemies(): void {
  if (inited) return;
  inited = true;
  for (const t of enemyTypes.all()) t.init();
}

/** Level start: clear every type, then begin() the ones this level uses. */
export function beginEnemies(level: LevelDef): void {
  initEnemies();
  for (const t of enemyTypes.all()) t.clear();
  active.length = 0;
  for (const spec of level.enemies) {
    if (!enemyTypes.has(spec.type)) continue;
    const t = enemyTypes.get(spec.type);
    t.begin(spec, level);
    if (!active.includes(t)) active.push(t);
  }
  if (level.boss && enemyTypes.has(level.boss.type)) {
    const t = enemyTypes.get(level.boss.type);
    if (!active.includes(t)) {
      t.begin(null, level);
      active.push(t);
    }
  }
}

/** Attract mode / quit: remove everything. */
export function clearEnemies(): void {
  for (const t of enemyTypes.all()) t.clear();
  active.length = 0;
}

export function activeEnemies(): readonly EnemyType[] {
  return active;
}

export function updateEnemies(dt: number, t: number): void {
  for (let i = 0; i < active.length; i++) active[i].update(dt, t);
}

export function swatEnemies(h: SwatHit): void {
  for (let i = 0; i < active.length; i++) active[i].onSwat?.(h);
}
export function pounceAirEnemies(p: THREE.Vector3, r: number): void {
  for (let i = 0; i < active.length; i++) active[i].onPounceAir?.(p, r);
}
export function pounceLandEnemies(x: number, z: number, r: number): void {
  for (let i = 0; i < active.length; i++) active[i].onPounceLand?.(x, z, r);
}
export function laserEnemies(p: THREE.Vector3, dir: THREE.Vector3): void {
  for (let i = 0; i < active.length; i++) active[i].onLaser?.(p, dir);
}
export function laserSweepEnemies(x: number, z: number, ang: number): void {
  for (let i = 0; i < active.length; i++) active[i].onLaserSweep?.(x, z, ang);
}
/** Ability / generic area hits. */
export function blastEnemies(b: Blast): void {
  for (let i = 0; i < active.length; i++) active[i].onBlast?.(b);
}
export function frenzyEnemies(): void {
  for (let i = 0; i < active.length; i++) active[i].onFrenzy?.();
}

/**
 * Enemy types call this when an instance is destroyed by the player. Counts kills for objectives and emits events.
 * Boss kills set G.bossDefeated; session ends the level when level.boss.endsLevel.
 */
export function reportKill(type: EnemyId, at: THREE.Vector3, boss = false): void {
  G.kills[type] = (G.kills[type] ?? 0) + 1;
  if (type === 'heli') {
    G.helis++;
    events.emit('heliSwatted', { count: G.helis });
  }
  events.emit('enemyKilled', { type, boss, x: at.x, y: at.y, z: at.z, count: G.kills[type] });
  if (boss) {
    G.bossDefeated = true;
    events.emit('bossDefeated', { type });
  }
}
