// import Phaser from "phaser";
// import { prebuiltRooms } from "../prebuiltRooms/PrebuiltRooms";
// import { prebuiltRoomsWithoutWalls } from "../prebuiltRooms/prebuiltRoomsWithoutWalls";
// import { Player } from "../objects/Player";
// import { Room } from "../objects/Room";

// export class DevScene extends Phaser.Scene {
//   private readonly tileSize: number = 32;
//   private readonly roomCols: number = 11;
//   private readonly roomRows: number = 9;
//   private readonly levelCols: number = 4;
//   private readonly levelRows: number = 4;
//   private grid: { room: Room; x: number; y: number }[][] = [];
//   private player!: Player;
//   private rooms: Room[] = [];
//   private solutionPath!: Phaser.GameObjects.Graphics;
//   private solutionCells: Phaser.Math.Vector2[] = [];
//   private roomConnections: Map<string, Set<string>> = new Map();
//   private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
//   private ironWallGroup!: Phaser.Physics.Arcade.StaticGroup;

//   constructor() {
//     super("DevScene");
//   }

//   preload() {
//     this.load.spritesheet("cat", "cats/black/sprite/combined.png", {
//       frameWidth: 64,
//       frameHeight: 39,
//     });
//     this.load.tilemapTiledJSON("levelOne", "purrquest2/levels/levelOne.json");
//     this.load.image("wall", "assets/sprite-grass.png");
//     this.load.image("ironWall", "purrquest/sprites/steel.png");
//     this.load.spritesheet("sprite-grass", "assets/sprite-grass.png", {
//       frameWidth: 32,
//       frameHeight: 32,
//     });
//   }

//   create() {
//     // this.generateGrid();
//     // this.createRooms();
//     // this.createSolutionPath();
//     // this.wallGroup = this.physics.add.staticGroup();
//     // this.ironWallGroup = this.physics.add.staticGroup();
//     // this.placePrebuiltRooms();
//     // this.createWalls();
//     this.createPlayer();
//     // this.setupCollisions();
//     this.createTileset();
//     // this.downloadGridData();
//   }

//   update() {
//     this.player.update();
//   }

//   private generateGrid() {
//     this.grid = Array.from({ length: this.levelRows }, (_, y) =>
//       Array.from({ length: this.levelCols }, (_, x) => ({
//         room: null as any,
//         x,
//         y,
//       }))
//     );
//   }

//   private createTileset() {
//     this.tilemap = this.make.tilemap({ key: "levelOne" });
//     const tileset = this.tilemap.addTilesetImage(
//       "sprite-grass",
//       "sprite-grass"
//     );
//     this.groundLayer = this.tilemap.createLayer("wallLayer", tileset!)!;
//     this.groundLayer?.setCollisionByProperty({ collides: true });
//     this.physics.add.collider(this.player.sprite, this.groundLayer);
//   }

//   private createRooms() {
//     for (let y = 0; y < this.levelRows; y++) {
//       for (let x = 0; x < this.levelCols; x++) {
//         const room = new Room(
//           x,
//           y,
//           this.roomCols,
//           this.roomRows,
//           this.tileSize,
//           this
//         );
//         this.rooms.push(room);
//         this.grid[y][x].room = room;
//       }
//     }
//   }

//   private createSolutionPath() {
//     this.solutionPath = this.add.graphics({
//       lineStyle: { width: 4, color: 0xffff00 },
//     });

//     const path = this.findPath(0, 0, this.levelCols - 1, this.levelRows - 1);
//     if (path) {
//       this.solutionCells = path;
//       for (let i = 0; i < path.length - 1; i++) {
//         const room1 = this.rooms[path[i].y * this.levelCols + path[i].x];
//         const room2 =
//           this.rooms[path[i + 1].y * this.levelCols + path[i + 1].x];
//         this.connectRooms(room1, room2, path[i], path[i + 1]);
//       }
//     }
//   }

//   private findPath(
//     startX: number,
//     startY: number,
//     endX: number,
//     endY: number
//   ): Phaser.Math.Vector2[] | null {
//     const path: Phaser.Math.Vector2[] = [];
//     const visited: boolean[][] = Array.from({ length: this.levelRows }, () =>
//       Array(this.levelCols).fill(false)
//     );

//     const dfs = (x: number, y: number): boolean => {
//       if (
//         x < 0 ||
//         x >= this.levelCols ||
//         y < 0 ||
//         y >= this.levelRows ||
//         visited[y][x]
//       ) {
//         return false;
//       }

//       visited[y][x] = true;
//       path.push(new Phaser.Math.Vector2(x, y));

//       if (x === endX && y === endY) {
//         return true;
//       }

//       const directions = Phaser.Utils.Array.Shuffle([
//         { dx: 0, dy: -1 }, // north
//         { dx: 1, dy: 0 }, // east
//         { dx: 0, dy: 1 }, // south
//         { dx: -1, dy: 0 }, // west
//       ]);

//       for (const { dx, dy } of directions) {
//         if (dfs(x + dx, y + dy)) {
//           return true;
//         }
//       }

//       path.pop();
//       return false;
//     };

//     return dfs(startX, startY) ? path : null;
//   }

//   private connectRooms(
//     room1: Room,
//     room2: Room,
//     cell1: Phaser.Math.Vector2,
//     cell2: Phaser.Math.Vector2
//   ) {
//     const x1 = room1.centerX();
//     const y1 = room1.centerY();
//     const x2 = room2.centerX();
//     const y2 = room2.centerY();

//     this.solutionPath.moveTo(x1, y1);

//     if (x1 === x2 || y1 === y2) {
//       this.solutionPath.lineTo(x2, y2);
//     } else {
//       this.solutionPath.lineTo(x2, y1).lineTo(x2, y2);
//     }

//     this.solutionPath.strokePath();

//     this.markConnection(cell1, cell2);
//     this.markConnection(cell2, cell1);
//   }

//   private markConnection(
//     cell1: Phaser.Math.Vector2,
//     cell2: Phaser.Math.Vector2
//   ) {
//     const key = `${cell1.x},${cell1.y}`;
//     const value = `${cell2.x},${cell2.y}`;

//     if (!this.roomConnections.has(key)) {
//       this.roomConnections.set(key, new Set());
//     }
//     this.roomConnections.get(key)!.add(value);
//   }

//   private createWalls() {
//     this.rooms.forEach((room) => {
//       const key = `${room.getX()},${room.getY()}`;
//       const connections = this.roomConnections.get(key) || new Set();
//       room.createWalls(connections, this.wallGroup, this.ironWallGroup);
//     });
//   }

//   private checkBlockedSides(room: string[]): boolean[] {
//     const blocked = [false, false, false, false]; // [right, up, left, down]

//     if (room[0].split("").every((cell) => cell === "1")) {
//       blocked[1] = true;
//     }

//     if (room[room.length - 1].split("").every((cell) => cell === "1")) {
//       blocked[3] = true;
//     }

//     if (room.every((row) => row[0] === "1")) {
//       blocked[2] = true;
//     }

//     if (room.every((row) => row[row.length - 1] === "1")) {
//       blocked[0] = true;
//     }

//     return blocked;
//   }

//   private isValidRoom(
//     room: string[],
//     posX: number,
//     posY: number,
//     entryDir: number,
//     exitDir: number
//   ): boolean {
//     const blocked = this.checkBlockedSides(room);
//     console.log(
//       `Room at (${posX}, ${posY}) - Entry Dir: ${entryDir}, Exit Dir: ${exitDir}, Blocked Sides: ${blocked}`
//     );

//     if (entryDir !== -1 && blocked[entryDir]) {
//       console.log(`Entry direction ${entryDir} is blocked`);
//       return false;
//     }
//     if (exitDir !== -1 && blocked[exitDir]) {
//       console.log(`Exit direction ${exitDir} is blocked`);
//       return false;
//     }

//     return true;
//   }

//   private getDirection(
//     cell1: Phaser.Math.Vector2,
//     cell2: Phaser.Math.Vector2
//   ): number {
//     if (cell1.x < cell2.x) return 0; // Right
//     if (cell1.y > cell2.y) return 1; // Up
//     if (cell1.x > cell2.x) return 2; // Left
//     if (cell1.y < cell2.y) return 3; // Down
//     return -1; // Invalid direction
//   }

//   private oppositeDirection(direction: number): number {
//     switch (direction) {
//       case 0:
//         return 2; // Right -> Left
//       case 1:
//         return 3; // Up -> Down
//       case 2:
//         return 0; // Left -> Right
//       case 3:
//         return 1; // Down -> Up
//       default:
//         return -1; // Invalid direction
//     }
//   }

//   private placePrebuiltRooms() {
//     for (let i = 0; i < this.solutionCells.length; i++) {
//       const { x, y } = this.solutionCells[i];
//       let placed = false;

//       for (let attempt = 0; attempt < 3; attempt++) {
//         const roomsToTry =
//           attempt < 2 ? prebuiltRooms : prebuiltRoomsWithoutWalls;
//         const shuffledRooms = Phaser.Utils.Array.Shuffle(roomsToTry);

//         for (let j = 0; j < shuffledRooms.length; j++) {
//           let entryDir = -1;
//           let exitDir = -1;
//           if (i > 0) {
//             const prevExitDir = this.getDirection(
//               this.solutionCells[i - 1],
//               this.solutionCells[i]
//             );
//             entryDir = this.oppositeDirection(prevExitDir);
//           }
//           if (i < this.solutionCells.length - 1) {
//             exitDir = this.getDirection(
//               this.solutionCells[i],
//               this.solutionCells[i + 1]
//             );
//           }
//           if (this.isValidRoom(shuffledRooms[j], x, y, entryDir, exitDir)) {
//             this.rooms[y * this.levelCols + x].placePrebuiltRoom(
//               shuffledRooms[j],
//               this.ironWallGroup
//             );
//             placed = true;
//             break;
//           }
//         }

//         if (placed) break;
//       }

//       if (!placed) {
//         console.error(`No valid prebuilt room found for position (${x}, ${y})`);
//       }
//     }
//   }

//   private createPlayer() {
//     const firstRoom = this.rooms[0];
//     this.player = new Player(this, 100, 10);
//     this.cameras.main.startFollow(this.player.sprite);
//   }

//   private setupCollisions() {
//     this.physics.add.collider(this.player.sprite, this.wallGroup);
//     this.physics.add.collider(this.player.sprite, this.ironWallGroup);
//     this.physics.add.overlap(
//       this.player.sprite,
//       this.wallGroup,
//       this.handleOverlap,
//       undefined,
//       this
//     );
//     this.physics.add.overlap(
//       this.player.sprite,
//       this.ironWallGroup,
//       this.handleOverlap,
//       undefined,
//       this
//     );
//   }

//   private handleOverlap(
//     player: Phaser.Physics.Arcade.Sprite,
//     wall: Phaser.Physics.Arcade.Sprite
//   ) {
//     const overlapX = player.x - wall.x;
//     const overlapY = player.y - wall.y;

//     if (Math.abs(overlapX) > Math.abs(overlapY)) {
//       if (overlapX > 0) {
//         player.x = wall.x + wall.width / 2 + player.width / 2;
//       } else {
//         player.x = wall.x - wall.width / 2 - player.width / 2;
//       }
//     } else {
//       if (overlapY > 0) {
//         player.y = wall.y + wall.height / 2 + player.height / 2;
//       } else {
//         player.y = wall.y - wall.height / 2 - player.height / 2;
//       }
//     }
//   }
//   private downloadGridData() {
//     const fullLevelData = this.generateGridData();
//     const tiledData = this.generateTiledData(fullLevelData);
//     const jsonData = JSON.stringify(tiledData, null, 2);

//     const blob = new Blob([jsonData], { type: "application/json" });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = "levelData.json";
//     a.click();
//     URL.revokeObjectURL(url);
//   }
//   private generateGridData(): number[][] {
//     const fullLevelData: number[][] = [];

//     for (let y = 0; y < this.levelRows * this.roomRows; y++) {
//       fullLevelData[y] = [];
//       for (let x = 0; x < this.levelCols * this.roomCols; x++) {
//         const roomX = Math.floor(x / this.roomCols);
//         const roomY = Math.floor(y / this.roomRows);
//         const blockX = x % this.roomCols;
//         const blockY = y % this.roomRows;
//         fullLevelData[y][x] =
//           this.grid[roomY][roomX].room.getRoomData()[blockY][blockX];
//       }
//     }

//     console.log("Full Level Data:");
//     for (const row of fullLevelData) {
//       console.log(row.join(" "));
//     }

//     return fullLevelData;
//   }

//   private generateTiledData(fullLevelData: number[][]) {
//     return {
//       compressionlevel: -1,
//       height: this.levelRows * this.roomRows,
//       infinite: false,
//       layers: [
//         {
//           data: fullLevelData.flat(), // Flatten 2D array into 1D
//           height: this.levelRows * this.roomRows,
//           id: 1,
//           name: "wallLayer",
//           opacity: 1,
//           type: "tilelayer",
//           visible: true,
//           width: this.levelCols * this.roomCols,
//           x: 0,
//           y: 0,
//         },
//       ],
//       nextlayerid: 2,
//       nextobjectid: 1,
//       orientation: "orthogonal",
//       renderorder: "right-down",
//       tiledversion: "1.10.2",
//       tileheight: this.tileSize,
//       tilesets: [
//         {
//           columns: 1,
//           firstgid: 1,
//           image: "../../../public/assets/sprite-grass.png",
//           imageheight: 32,
//           imagewidth: 32,
//           margin: 0,
//           name: "sprite-grass",
//           spacing: 0,
//           tilecount: 1,
//           tileheight: 32,
//           tiles: [
//             {
//               id: 0,
//               properties: [
//                 {
//                   name: "collides",
//                   type: "bool",
//                   value: true,
//                 },
//               ],
//             },
//           ],
//           tilewidth: 32,
//         },
//       ],
//       tilewidth: this.tileSize,
//       type: "map",
//       version: "1.10",
//       width: this.levelCols * this.roomCols,
//     };
//   }
// }
