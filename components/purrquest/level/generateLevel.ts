import { prebuiltRooms } from "../prebuiltRooms/PrebuiltRooms";
import { prebuiltRoomsWithoutWalls } from "../prebuiltRooms/prebuiltRoomsWithoutWalls";
import { spawnRoom } from "../prebuiltRooms/SpawnRoom";
import { exitRoom } from "../prebuiltRooms/ExitRoom";
import { Room } from "../objects/Room";

export class GenerateLevel {
  private scene: Phaser.Scene;
  private readonly tileSize: number = 32;
  private readonly roomCols: number = 10;
  private readonly roomRows: number = 8;
  private readonly levelCols: number = 4;
  private readonly levelRows: number = 4;
  private grid: { room: Room; x: number; y: number }[][] = [];
  private rooms: Room[] = [];
  private solutionPath!: Phaser.GameObjects.Graphics;
  public solutionCells: Phaser.Math.Vector2[] = [];
  private roomConnections: Map<string, Set<string>> = new Map();
  private readonly MIN_PLACED_ROOMS = 8;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }
  generateNewRoom() {
    this.clearLevelData();
    this.generateGrid();
    this.createRooms();
    this.createSolutionPath();
    this.createWalls();
    this.placePrebuiltRooms();
    if (this.solutionCells.length <= this.MIN_PLACED_ROOMS) {
      this.generateNewRoom();
    }
  }

  clearLevelData() {
    this.rooms = [];
    this.grid = [];
    this.roomConnections.clear();
    this.solutionCells = [];

    if (this.solutionPath) {
      this.solutionPath.destroy();
    }
  }

  generateGrid() {
    this.grid = Array.from({ length: this.levelRows }, (_, y) =>
      Array.from({ length: this.levelCols }, (_, x) => ({
        room: null as any,
        x,
        y,
      }))
    );
  }

  createRooms() {
    for (let y = 0; y < this.levelRows; y++) {
      for (let x = 0; x < this.levelCols; x++) {
        const room = new Room(
          x,
          y,
          this.roomCols,
          this.roomRows,
          this.tileSize,
          this.scene
        );
        this.rooms.push(room);
        this.grid[y][x].room = room;
      }
    }
  }

  createSolutionPath() {
    const corners = [
      { x: 0, y: 0, name: "LU" },
      { x: 0, y: this.levelRows - 1, name: "LD" },
      { x: this.levelCols - 1, y: 0, name: "RU" },
      { x: this.levelCols - 1, y: this.levelRows - 1, name: "RD" },
    ];

    const shuffledCorners = Phaser.Utils.Array.Shuffle(corners);
    const startCorner = shuffledCorners[0];
    let endCorner = shuffledCorners[1];

    while (endCorner.name === startCorner.name) {
      endCorner = Phaser.Utils.Array.Shuffle(corners)[1];
    }

    const { x: startX, y: startY } = startCorner;
    const { x: endX, y: endY } = endCorner;

    // Finding the path without creating the graphics object
    const path = this.findPath(startX, startY, endX, endY);
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
  getStartCoordinates(): Phaser.Math.Vector2 {
    return this.solutionCells.length > 0
      ? this.solutionCells[0]
      : new Phaser.Math.Vector2(0, 0);
  }

  getTileSize(): number {
    return this.tileSize;
  }

  getRoomCols(): number {
    return this.roomCols;
  }

  getRoomRows(): number {
    return this.roomRows;
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
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
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
    pos1: Phaser.Math.Vector2,
    pos2: Phaser.Math.Vector2
  ): void {
    const key1 = `${pos1.x},${pos1.y}`;
    const key2 = `${pos2.x},${pos2.y}`;

    if (!this.roomConnections.has(key1)) {
      this.roomConnections.set(key1, new Set());
    }
    if (!this.roomConnections.has(key2)) {
      this.roomConnections.set(key2, new Set());
    }

    this.roomConnections.get(key1)!.add(key2);
    this.roomConnections.get(key2)!.add(key1);
  }

  placePrebuiltRooms() {
    for (let i = 0; i < this.solutionCells.length; i++) {
      const { x, y } = this.solutionCells[i];
      let placed = false;

      if (i === 0) {
        this.rooms[y * this.levelCols + x].placePrebuiltRoom(spawnRoom.layers);
        placed = true;
      } else if (i === this.solutionCells.length - 1) {
        this.rooms[y * this.levelCols + x].placePrebuiltRoom(exitRoom.layers);
        placed = true;
      } else {
        for (let attempt = 0; attempt < 3; attempt++) {
          const roomsToTry =
            attempt < 2 ? prebuiltRooms : prebuiltRoomsWithoutWalls;
          const randomRoom = Phaser.Utils.Array.GetRandom(roomsToTry);

          let entryDir = -1;
          let exitDir = -1;
          if (i > 0) {
            const prevExitDir = this.getDirection(
              this.solutionCells[i - 1],
              this.solutionCells[i]
            );
            entryDir = this.oppositeDirection(prevExitDir);
          }
          if (i < this.solutionCells.length - 1) {
            exitDir = this.getDirection(
              this.solutionCells[i],
              this.solutionCells[i + 1]
            );
          }

          if (this.isValidRoom(randomRoom.layers[0], x, y, entryDir, exitDir)) {
            this.rooms[y * this.levelCols + x].placePrebuiltRoom(
              randomRoom.layers
            );
            placed = true;
            break;
          }
        }

        if (!placed) {
          const fallbackRoom = Phaser.Utils.Array.GetRandom(
            prebuiltRoomsWithoutWalls
          );
          this.rooms[y * this.levelCols + x].placePrebuiltRoom(
            fallbackRoom.layers
          );
          placed = true;
        }
      }
    }

    for (let y = 0; y < this.levelRows; y++) {
      for (let x = 0; x < this.levelCols; x++) {
        const roomIndex = y * this.levelCols + x;
        const room = this.rooms[roomIndex];

        if (!room.hasPrebuiltRoom()) {
          const useNoWalls = Math.random() < 0.55; // 55% chance to choose a room without walls
          const roomsToTry = useNoWalls
            ? prebuiltRoomsWithoutWalls
            : prebuiltRooms;
          const randomRoom = Phaser.Utils.Array.GetRandom(roomsToTry);
          room.placePrebuiltRoom(randomRoom.layers);
        }
      }
    }
  }

  private isValidRoom(
    room: string[],
    posX: number,
    posY: number,
    entryDir: number,
    exitDir: number
  ): boolean {
    const blocked = this.checkBlockedSides(room);
    if (entryDir !== -1 && blocked[entryDir]) return false;
    if (exitDir !== -1 && blocked[exitDir]) return false;
    return true;
  }

  private checkBlockedSides(room: string[]): boolean[] {
    const blocked = [false, false, false, false];

    const isBlocked = (cell: string): boolean => {
      return [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "89",
        "90",
        "91",
        "33",
        "34",
        "35",
        "36",
        "37",
        "62",
        "63",
        "64",
        "65",
        "66",
        "70",
        "71",
        "72",
        "92",
        "93",
        "94",
        "99",
        "100",
        "101",
        "120",
        "121",
        "122",
        "123",
        "150",
        "151",
        "152",
      ].includes(cell);
    };

    // Check top row for blocked values
    if (room[0].split(",").every(isBlocked)) {
      blocked[1] = true;
    }

    // Check bottom row for blocked values
    if (room[room.length - 1].split(",").every(isBlocked)) {
      blocked[3] = true;
    }

    // Check left column for blocked values
    if (room.every((row) => isBlocked(row.split(",")[0]))) {
      blocked[2] = true;
    }

    // Check right column for blocked values
    if (
      room.every((row) => isBlocked(row.split(",")[row.split(",").length - 1]))
    ) {
      blocked[0] = true;
    }

    return blocked;
  }

  private getDirection(
    cell1: Phaser.Math.Vector2,
    cell2: Phaser.Math.Vector2
  ): number {
    if (cell1.x < cell2.x) return 0; // Right
    if (cell1.y > cell2.y) return 1; // Up
    if (cell1.x > cell2.x) return 2; // Left
    if (cell1.y < cell2.y) return 3; // Down
    return -1;
  }

  private oppositeDirection(direction: number): number {
    switch (direction) {
      case 0:
        return 2; // Right -> Left
      case 1:
        return 3; // Up -> Down
      case 2:
        return 0; // Left -> Right
      case 3:
        return 1; // Down -> Up
      default:
        return -1;
    }
  }

  createWalls() {
    for (const room of this.rooms) {
      const roomKey = `${room.getX()},${room.getY()}`;
      const connections = this.roomConnections.get(roomKey) || new Set();
      room.createWalls(connections);
    }
  }

  getTileCoordinates(
    tileId: number,
    levelData: number[][]
  ): Phaser.Math.Vector2 | null {
    for (let row = 0; row < levelData.length; row++) {
      for (let col = 0; col < levelData[row].length; col++) {
        if (levelData[row][col] === tileId) {
          return new Phaser.Math.Vector2(col, row);
        }
      }
    }
    return null;
  }

  generateGridData(): { baseLayer: number[][]; overlayLayer: number[][] } {
    const totalCols = this.levelCols * this.roomCols + 2;
    const totalRows = this.levelRows * this.roomRows + 2;

    const baseLayerData: number[][] = Array.from({ length: totalRows }, () =>
      Array(totalCols).fill(0)
    );
    const overlayLayerData: number[][] = Array.from({ length: totalRows }, () =>
      Array(totalCols).fill(0)
    );

    const getTileIndex = (x: number, y: number, layer: number): number => {
      const roomX = Math.floor((x - 1) / this.roomCols);
      const roomY = Math.floor((y - 1) / this.roomRows);
      const blockX = (x - 1) % this.roomCols;
      const blockY = (y - 1) % this.roomRows;
      return (
        this.grid[roomY][roomX].room.getRoomData()[layer][blockY][blockX] - 1
      );
    };

    for (let y = 0; y < totalRows; y++) {
      for (let x = 0; x < totalCols; x++) {
        if (y === 0 && x === 0) {
          baseLayerData[y][x] = 91; // Top-left corner
          overlayLayerData[y][x] = 91; // Top-left corner (overlay)
        } else if (y === 0 && x === totalCols - 1) {
          baseLayerData[y][x] = 93; // Top-right corner
          overlayLayerData[y][x] = 93; // Top-right corner (overlay)
        } else if (y === totalRows - 1 && x === 0) {
          baseLayerData[y][x] = 149; // Bottom-left corner
          overlayLayerData[y][x] = 149; // Bottom-left corner (overlay)
        } else if (y === totalRows - 1 && x === totalCols - 1) {
          baseLayerData[y][x] = 151; // Bottom-right corner
          overlayLayerData[y][x] = 151; // Bottom-right corner (overlay)
        }
        // Check boundaries
        else if (y === 0 || y === totalRows - 1) {
          baseLayerData[y][x] = 31; // Top or Bottom boundary
          overlayLayerData[y][x] = 31; // Top or Bottom boundary (overlay)
        } else if (x === 0 || x === totalCols - 1) {
          baseLayerData[y][x] = 123; // Left or Right boundary
          overlayLayerData[y][x] = 123; // Left or Right boundary (overlay)
        } else {
          // Inner grid tiles
          baseLayerData[y][x] = getTileIndex(x, y, 0);
          overlayLayerData[y][x] = getTileIndex(x, y, 1);
        }
      }
    }

    return { baseLayer: baseLayerData, overlayLayer: overlayLayerData };
  }
}
