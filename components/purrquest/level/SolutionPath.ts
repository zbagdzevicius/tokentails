import Phaser from "phaser";

export class DevScene extends Phaser.Scene {
  private readonly tileSize: number = 32;
  private readonly roomCols: number = 10;
  private readonly roomRows: number = 8;
  private readonly levelCols: number = 4;
  private readonly levelRows: number = 4;
  private grid: number[][] = [];
  private rooms: Room[] = [];
  private solutionPath!: Phaser.GameObjects.Graphics;
  private solutionCells: Phaser.Math.Vector2[] = [];
  private roomConnections: Map<string, Set<string>> = new Map();

  constructor() {
    super("DevScene");
  }

  preload() {
    this.load.image("wall", "assets/sprite-grass.png");
  }

  create() {
    this.generateGrid();
    this.createRooms();
    this.createSolutionPath();
    this.createWalls();
  }

  update() {}

  private generateGrid() {
    this.grid = Array.from({ length: this.levelRows }, () =>
      Array(this.levelCols).fill(0)
    );
  }

  private createRooms() {
    for (let y = 0; y < this.levelRows; y++) {
      for (let x = 0; x < this.levelCols; x++) {
        const room = new Room(
          x,
          y,
          this.roomCols,
          this.roomRows,
          this.tileSize,
          this
        );
        this.rooms.push(room);
      }
    }
  }

  private createSolutionPath() {
    this.solutionPath = this.add.graphics({
      lineStyle: { width: 4, color: 0xffff00 },
    });

    const path = this.findPath(0, 0, this.levelCols - 1, this.levelRows - 1);
    if (path) {
      this.solutionCells = path;
      for (let i = 0; i < path.length - 1; i++) {
        const room1 = this.rooms[path[i].y * this.levelCols + path[i].x];
        const room2 =
          this.rooms[path[i + 1].y * this.levelCols + path[i + 1].x];
        this.connectRooms(room1, room2, path[i], path[i + 1]);
      }
    }
  }

  private findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Phaser.Math.Vector2[] | null {
    const path: Phaser.Math.Vector2[] = [];
    const visited: boolean[][] = Array.from({ length: this.levelRows }, () =>
      Array(this.levelCols).fill(false)
    );

    const dfs = (x: number, y: number): boolean => {
      if (
        x < 0 ||
        x >= this.levelCols ||
        y < 0 ||
        y >= this.levelRows ||
        visited[y][x]
      ) {
        return false;
      }

      visited[y][x] = true;
      path.push(new Phaser.Math.Vector2(x, y));

      if (x === endX && y === endY) {
        return true;
      }

      const directions = Phaser.Utils.Array.Shuffle([
        { dx: 0, dy: -1 }, // north
        { dx: 1, dy: 0 }, // east
        { dx: 0, dy: 1 }, // south
        { dx: -1, dy: 0 }, // west
      ]);

      for (const { dx, dy } of directions) {
        if (dfs(x + dx, y + dy)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    return dfs(startX, startY) ? path : null;
  }

  private connectRooms(
    room1: Room,
    room2: Room,
    cell1: Phaser.Math.Vector2,
    cell2: Phaser.Math.Vector2
  ) {
    const x1 = room1.centerX();
    const y1 = room1.centerY();
    const x2 = room2.centerX();
    const y2 = room2.centerY();

    this.solutionPath.moveTo(x1, y1);

    if (x1 === x2 || y1 === y2) {
      this.solutionPath.lineTo(x2, y2);
    } else {
      this.solutionPath.lineTo(x2, y1).lineTo(x2, y2);
    }

    this.solutionPath.strokePath();

    this.markConnection(cell1, cell2);
    this.markConnection(cell2, cell1);
  }

  private markConnection(
    cell1: Phaser.Math.Vector2,
    cell2: Phaser.Math.Vector2
  ) {
    const key = `${cell1.x},${cell1.y}`;
    const value = `${cell2.x},${cell2.y}`;

    if (!this.roomConnections.has(key)) {
      this.roomConnections.set(key, new Set());
    }
    this.roomConnections.get(key)!.add(value);
  }

  private createWalls() {
    this.rooms.forEach((room) => {
      const key = `${room.getX()},${room.getY()}`;
      const connections = this.roomConnections.get(key) || new Set();
      room.createWalls(connections);
    });
  }
}

class Room {
  private readonly x: number;
  private readonly y: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly tileSize: number;
  private readonly scene: Phaser.Scene;

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
  }

  createWalls(connections: Set<string>) {
    const roomX = this.x * this.cols * this.tileSize;
    const roomY = this.y * this.rows * this.tileSize;

    const directions = {
      north: connections.has(`${this.x},${this.y - 1}`),
      south: connections.has(`${this.x},${this.y + 1}`),
      west: connections.has(`${this.x - 1},${this.y}`),
      east: connections.has(`${this.x + 1},${this.y}`),
    };

    for (let i = 0; i < this.cols; i++) {
      if (!directions.north) {
        this.scene.add
          .image(roomX + i * this.tileSize, roomY, "wall")
          .setOrigin(0, 0);
      }
      if (!directions.south) {
        this.scene.add
          .image(
            roomX + i * this.tileSize,
            roomY + (this.rows - 1) * this.tileSize,
            "wall"
          )
          .setOrigin(0, 0);
      }
    }
    for (let j = 0; j < this.rows; j++) {
      if (!directions.west) {
        this.scene.add
          .image(roomX, roomY + j * this.tileSize, "wall")
          .setOrigin(0, 0);
      }
      if (!directions.east) {
        this.scene.add
          .image(
            roomX + (this.cols - 1) * this.tileSize,
            roomY + j * this.tileSize,
            "wall"
          )
          .setOrigin(0, 0);
      }
    }
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
}

//my fix https://phaser.discourse.group/t/arcade-physics-stuck-in-wall-if-jumping-while-moving/7406/3
