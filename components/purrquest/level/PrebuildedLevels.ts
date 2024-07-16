import Phaser from "phaser";

const prebuiltRooms = [
  [
    "0000000000",
    "0000000000",
    "0000000000",
    "0000000000",
    "00L0000L00",
    "00L0000L00",
    "00L0000L00",
    "1111111111",
  ],
  [
    "0000000000",
    "0000000000",
    "0000000000",
    "0000000000",
    "00L0000L00",
    "00L0000L00",
    "00L0000L00",
    "0000000000",
  ],
  [
    "1111111111",
    "0000000000",
    "0011111100",
    "0000000000",
    "00L0000L00",
    "00L0000L00",
    "00L0000L00",
    "1111111111",
  ],
  [
    "0000000001",
    "0000000001",
    "0000000001",
    "0000000001",
    "00L1111L01",
    "00L0000L01",
    "00L0000L01",
    "0000000001",
  ],
];

export class DevScene extends Phaser.Scene {
  private readonly tileSize: number = 32;
  private readonly roomCols: number = 10;
  private readonly roomRows: number = 8;
  private readonly levelCols: number = 4;
  private readonly levelRows: number = 4;
  private level: string[][] = [];

  constructor() {
    super("DevScene");
  }

  preload() {
    this.load.image("wall", "assets/sprite-grass.png");
    this.load.image("ladder", "assets/sprite-ladder.png");
  }

  create() {
    this.generateLevel();
    this.renderLevel();
  }

  update() {}

  private generateLevel() {
    for (let i = 0; i < this.levelRows; i++) {
      this.level[i] = [];
      for (let j = 0; j < this.levelCols; j++) {
        const randomRoom = this.getRandomRoom();
        this.level[i].push(randomRoom as any);
      }
    }
  }

  private getRandomRoom(): string[] {
    const randomIndex = Phaser.Math.Between(0, prebuiltRooms.length - 1);
    return prebuiltRooms[randomIndex];
  }

  private renderLevel() {
    for (let row = 0; row < this.levelRows; row++) {
      for (let col = 0; col < this.levelCols; col++) {
        const room = this.level[row][col];
        for (let roomRow = 0; roomRow < this.roomRows; roomRow++) {
          for (let roomCol = 0; roomCol < this.roomCols; roomCol++) {
            const tile = room[roomRow][roomCol];
            const x =
              col * this.roomCols * this.tileSize + roomCol * this.tileSize;
            const y =
              row * this.roomRows * this.tileSize + roomRow * this.tileSize;
            this.addTile(tile, x, y);
          }
        }
      }
    }

    this.addBorders();
  }

  private addTile(tile: string, x: number, y: number) {
    switch (tile) {
      case "1":
        this.add.image(x, y, "wall").setOrigin(0);
        break;
      case "L":
        this.add.image(x, y, "ladder").setOrigin(0);
        break;
      // Add more cases for other tiles as needed
    }
  }

  private addBorders() {
    const totalCols = this.levelCols * this.roomCols;
    const totalRows = this.levelRows * this.roomRows;

    // Top and Bottom Borders
    for (let col = 0; col < totalCols; col++) {
      const x = col * this.tileSize;
      // Top border
      this.addTile("1", x, 0);
      // Bottom border
      this.addTile("1", x, (totalRows - 1) * this.tileSize);
    }

    // Left and Right Borders
    for (let row = 0; row < totalRows; row++) {
      const y = row * this.tileSize;
      // Left border
      this.addTile("1", 0, y);
      // Right border
      this.addTile("1", (totalCols - 1) * this.tileSize, y);
    }
  }
}
