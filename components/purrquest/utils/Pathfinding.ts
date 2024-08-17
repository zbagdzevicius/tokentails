import EasyStar from "easystarjs";
import Phaser from "phaser";
import { GenerateLevel } from "../level/generateLevel";

export class Pathfinding {
  private easystar: EasyStar.js;
  private graphics: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;
  private generateLevel: GenerateLevel;

  constructor(scene: Phaser.Scene, generateLevel: GenerateLevel) {
    this.scene = scene;
    this.generateLevel = generateLevel;
    this.easystar = new EasyStar.js();
    this.graphics = this.scene.add.graphics();
  }

  initializePathfinding() {
    const gridData = this.generateLevel.generateGridData();
    this.easystar.setGrid(gridData);
    const walkableTiles = [-1, 289, 290];
    this.easystar.setAcceptableTiles(walkableTiles);
  }

  validatePathExistence(startTile: number, endTile: number) {
    type PathPoint = { x: number; y: number };

    const startCoords = this.generateLevel.getTileCoordinates(
      startTile,
      this.generateLevel.generateGridData()
    );
    const endCoords = this.generateLevel.getTileCoordinates(
      endTile,
      this.generateLevel.generateGridData()
    );

    if (startCoords && endCoords) {
      this.easystar.findPath(
        startCoords.x,
        startCoords.y,
        endCoords.x,
        endCoords.y,
        (path: PathPoint[] | null) => {
          if (path === null) {
            console.error(
              `No path found from tile ${startTile} to tile ${endTile}`
            );
                 this.generateLevel.generateNewRoom();
                 this.scene.scene.restart()
          } else {
            console.log(`Path found from tile ${startTile} to tile ${endTile}`);
            this.drawPath(path);
          }
        }
      );
      this.easystar.calculate();
    }
  }

  private drawPath(path: { x: number; y: number }[]) {
    this.graphics.clear();
    this.graphics.lineStyle(10, 0x0000ff);
    if (path.length > 0) {
      this.graphics.beginPath();
      this.graphics.moveTo(path[0].x * 32, path[0].y * 32);
      for (let i = 1; i < path.length; i++) {
        this.graphics.lineTo(path[i].x * 32, path[i].y * 32);
      }
      this.graphics.strokePath();
    }
  }
}
