export class Room {
  private readonly x: number;
  private readonly y: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly tileSize: number;
  private readonly scene: Phaser.Scene;
  private roomData: number[][][];
  private prebuiltRoomPlaced: boolean = false;

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
    this.roomData = Array.from({ length: 2 }, () =>
      Array.from({ length: rows }, () => Array(cols).fill(0))
    );
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
        if (i === 0) {
          this.roomData[0][0][i] = 2; // Start tile at the north, index 0
        } else if (i === this.cols - 1) {
          this.roomData[0][0][i] = 4; // End tile at the north, last column
        } else {
          this.roomData[0][0][i] = 3; // Middle tiles
        }
      }

      if (!directions.south) {
        if (i === 0) {
          this.roomData[0][this.rows - 1][i] = 2; // Start tile at the south, index 0
        } else if (i === this.cols - 1) {
          this.roomData[0][this.rows - 1][i] = 4; // End tile at the south, last column
        } else {
          this.roomData[0][this.rows - 1][i] = 3; // Middle tiles
        }
      }
    }

    for (let j = 0; j < this.rows; j++) {
      if (!directions.west) {
        if (j === 0) {
          this.roomData[0][j][0] = 8; // Start tile at the west, index 0
        } else if (j === this.rows - 1) {
          this.roomData[0][j][0] = 66; // End tile at the west, last row
        } else {
          this.roomData[0][j][0] = 37; // West side middle tiles
        }
      }

      if (!directions.east) {
        if (j === 0) {
          this.roomData[0][j][this.cols - 1] = 8; // Start tile at the east, index 0
        } else if (j === this.rows - 1) {
          this.roomData[0][j][this.cols - 1] = 66; // End tile at the east, last row
        } else {
          this.roomData[0][j][this.cols - 1] = 37; // East side middle tiles
        }
      }
    }
  }

  placePrebuiltRoom(layersData: string[][]) {
    // if (!Array.isArray(layersData) || layersData.length === 0) {
    //   console.warn("Invalid or missing layers data:", layersData);
    //   return;
    // }

    layersData.forEach((layerData, layerIndex) => {
      // if (!Array.isArray(layerData)) {
      //   console.warn(`Invalid layerData at index ${layerIndex}:`, layerData);
      //   return;
      // }
      //for check
      const offsetX = Math.floor(
        (this.cols - layerData[0].split(",").length) / 2
      );
      const offsetY = Math.floor((this.rows - layerData.length) / 2);

      for (let row = 0; row < layerData.length; row++) {
        const cells = layerData[row].split(",");
        for (let col = 0; col < cells.length; col++) {
          const value = parseInt(cells[col]);
          if (value >= 1 && value <= 300) {
            this.roomData[layerIndex][row + offsetY][col + offsetX] = value;
          }
        }
      }
    });

    this.prebuiltRoomPlaced = true; // Mark that a prebuilt room has been placed
  }
  // placePrebuiltRoom(roomData: string[]) {
  //   const offsetX = Math.floor((this.cols - roomData[0].split(",").length) / 2);
  //   const offsetY = Math.floor((this.rows - roomData.length) / 2);

  //   for (let row = 0; row < roomData.length; row++) {
  //     const cells = roomData[row].split(",");
  //     for (let col = 0; col < cells.length; col++) {
  //       const value = parseInt(cells[col]);
  //       if (value >= 1 && value <= 300) {
  //         this.roomData[row + offsetY][col + offsetX] = value;
  //       }
  //     }
  //   }

  //   this.prebuiltRoomPlaced = true; // Mark that a prebuilt room has been placed
  // }

  hasPrebuiltRoom(): boolean {
    return this.prebuiltRoomPlaced;
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

  getRoomData(): number[][][] {
    return this.roomData;
  }
}
