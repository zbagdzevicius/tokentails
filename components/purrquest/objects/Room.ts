import Phaser from "phaser";

export class Room {
  private readonly x: number;
  private readonly y: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly tileSize: number;
  private readonly scene: Phaser.Scene;
  private roomData: number[][];
  private prebuiltRoomPlaced: boolean = false; // Property to track if a prebuilt room is placed

  constructor(
    x: number,
    y: number,
    cols: number,
    rows: number,
    tileSize: number,
    scene: Phaser.Scene
  ) {
    this.x = x;
    this.y = y;
    this.cols = cols;
    this.rows = rows;
    this.tileSize = tileSize;
    this.scene = scene;
    this.roomData = Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  createWalls(connections: Set<string>) {
    const directions = {
      north: connections.has(`${this.x},${this.y - 1}`),
      south: connections.has(`${this.x},${this.y + 1}`),
      west: connections.has(`${this.x - 1},${this.y}`),
      east: connections.has(`${this.x + 1},${this.y}`),
    };

    for (let i = 0; i < this.cols; i++) {
      if (!directions.north) {
        this.roomData[0][i] = 122;
      }
      if (!directions.south) {
        this.roomData[this.rows - 1][i] = 122;
      }
    }
    for (let j = 0; j < this.rows; j++) {
      if (!directions.west) {
        this.roomData[j][0] = 122;
      }
      if (!directions.east) {
        this.roomData[j][this.cols - 1] = 122;
      }
    }
  }

  placePrebuiltRoom(roomData: string[]) {
    const offsetX = Math.floor((this.cols - roomData[0].split(",").length) / 2);
    const offsetY = Math.floor((this.rows - roomData.length) / 2);

    for (let row = 0; row < roomData.length; row++) {
      const cells = roomData[row].split(",");
      for (let col = 0; col < cells.length; col++) {
        const value = parseInt(cells[col]);
        if (value >= 1 && value <= 300) {
          this.roomData[row + offsetY][col + offsetX] = value;
        }
      }
    }

    this.prebuiltRoomPlaced = true; // Mark that a prebuilt room has been placed
  }

  hasPrebuiltRoom(): boolean {
    return this.prebuiltRoomPlaced; // Return whether a prebuilt room has been placed
  }

  centerX(): number {
    return this.x * this.cols * this.tileSize + (this.cols * this.tileSize) / 2;
  }

  centerY(): number {
    return this.y * this.rows * this.tileSize + (this.rows * this.tileSize) / 2;
  }

  getX(): number {
    return this.x;
  }

  getY(): number {
    return this.y;
  }

  getRoomData(): number[][] {
    return this.roomData;
  }
}
