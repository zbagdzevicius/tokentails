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
  private solutionCells: Phaser.Math.Vector2[] = [];
  private roomConnections: Map<string, Set<string>> = new Map();
  private readonly MAX_PLACED_ROOMS = 4;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generateNewRoom() {
    this.rooms = [];
    this.grid = [];

    this.generateGrid();
    this.createRooms();
    this.createSolutionPath();
    this.createWalls();
    this.placePrebuiltRooms();
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

    this.solutionPath = this.scene.add.graphics({
      lineStyle: { width: 4, color: 0xffff00 },
    });

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

  countPlacedPrebuiltRooms(): number {
    let placedRoomCount = 0;

    for (const room of this.rooms) {
      if (room.hasPrebuiltRoom()) {
        placedRoomCount++;
      }
    }

    return placedRoomCount;
  }

  // Example of how you might use this method after placing the rooms
  placePrebuiltRooms() {
    for (let i = 0; i < this.solutionCells.length; i++) {
      const { x, y } = this.solutionCells[i];
      let placed = false;

      if (i === 0) {
        this.rooms[y * this.levelCols + x].placePrebuiltRoom(spawnRoom);
        placed = true;
      } else if (i === this.solutionCells.length - 1) {
        this.rooms[y * this.levelCols + x].placePrebuiltRoom(exitRoom);
        placed = true;
      } else {
        for (let attempt = 0; attempt < 3; attempt++) {
          const roomsToTry =
            attempt < 2 ? prebuiltRooms : prebuiltRoomsWithoutWalls;
          const shuffledRooms = Phaser.Utils.Array.Shuffle(roomsToTry);

          for (let j = 0; j < shuffledRooms.length; j++) {
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
            if (this.isValidRoom(shuffledRooms[j], x, y, entryDir, exitDir)) {
              this.rooms[y * this.levelCols + x].placePrebuiltRoom(
                shuffledRooms[j]
              );
              placed = true;
              break;
            }
          }

          if (placed) break;
        }

        if (!placed) {
          const randomRoom = Phaser.Utils.Array.GetRandom(
            prebuiltRoomsWithoutWalls
          );
          this.rooms[y * this.levelCols + x].placePrebuiltRoom(randomRoom);
          placed = true;

          if (!placed) {
            console.error(
              `No valid prebuilt room found for position (${x}, ${y})`
            );
          }
        }
      }
    }
    //FLAG if cpalced room amount is less from MAX_PLACED_ROOMS than regenerate all level
    const placedRoomCount = this.countPlacedPrebuiltRooms();
    if (placedRoomCount <= this.MAX_PLACED_ROOMS) {
      // console.warn(
      //   "Placed prebuilt rooms are 4 or fewer. Regenerating the level..."
      // );
      this.generateNewRoom(); 
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

  generateGridData(): number[][] {
    const fullLevelData: number[][] = [];

    for (let y = 0; y < this.levelRows * this.roomRows; y++) {
      fullLevelData[y] = [];
      for (let x = 0; x < this.levelCols * this.roomCols; x++) {
        const roomX = Math.floor(x / this.roomCols);
        const roomY = Math.floor(y / this.roomRows);
        const blockX = x % this.roomCols;
        const blockY = y % this.roomRows;

        if (y === 0 && x === 0) {
          fullLevelData[y].push(91); // Top-left corner
        } else if (y === 0 && x === this.levelCols * this.roomCols - 1) {
          fullLevelData[y].push(93); // Top-right corner
        } else if (y === this.levelRows * this.roomRows - 1 && x === 0) {
          fullLevelData[y].push(149); // Bottom-left corner
        } else if (
          y === this.levelRows * this.roomRows - 1 &&
          x === this.levelCols * this.roomCols - 1
        ) {
          fullLevelData[y].push(151); // Bottom-right corner
        } else if (y === 0) {
          fullLevelData[y].push(92); // Top boundary
        } else if (y === this.levelRows * this.roomRows - 1) {
          fullLevelData[y].push(150); // Bottom boundary
        } else if (x === 0) {
          fullLevelData[y].push(120); // Left boundary
        } else if (x === this.levelCols * this.roomCols - 1) {
          fullLevelData[y].push(122); // Right boundary
        } else {
          const tileIndex =
            this.grid[roomY][roomX].room.getRoomData()[blockY][blockX];
          fullLevelData[y].push(tileIndex - 1);
        }
      }
    }
    return fullLevelData;
  }
}
