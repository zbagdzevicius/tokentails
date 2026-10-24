// SETPIECES lane entry. Registers every set-piece type (setPieceTypes registry). Called once by main.ts.
import { registerChases } from './chase';
import { registerCloud } from './cloud';
import { registerObstacles } from './obstacles';
import { registerPickups } from './pickups';
import { registerRiver } from './river';
import { registerVault } from './vault';
import { registerWall } from './wall';

export function registerSetPieces(): void {
  registerObstacles();
  registerPickups();
  registerVault();
  registerCloud();
  registerWall();
  registerRiver();
  registerChases();
}
