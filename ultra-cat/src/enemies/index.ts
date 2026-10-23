// ENEMIES lane registration point. main.ts calls registerEnemies() once at boot.
import { enemyTypes } from '../core/registry';
import { cannonTruckType, debugTrucks } from './cannon-truck';
import { cucumberJetType, debugJets, spawnJet } from './cucumber-jet';
import { cucumberTowerType, debugTowers } from './cucumber-tower';
import { heliType } from './heli';
import { countProjectiles } from './projectiles';
import { debugDog, dogState, mechaDogType } from './mecha-dog';
import { debugRoomba, debugRoombaState, roombaPrimeType, roombaState } from './roomba-prime';
import { debugVacuums, spawnVacuum, vacuumType } from './vacuum';

export function registerEnemies(): void {
  for (const t of [heliType, cannonTruckType, cucumberTowerType, cucumberJetType, vacuumType, mechaDogType, roombaPrimeType]) enemyTypes.add(t);
  // test hook for shots/enemies-*.mjs (read-only helpers + boss HP control; no gameplay effect unless called)
  (window as unknown as { __enemies: unknown }).__enemies = { debugDog, dogState, debugRoomba, debugRoombaState, roombaState, spawnVacuum, spawnJet, trucks: debugTrucks, vacuums: debugVacuums, towers: debugTowers, jets: debugJets, cukes: () => countProjectiles('cuke') };
}
