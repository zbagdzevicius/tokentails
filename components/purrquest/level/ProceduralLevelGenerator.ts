import Phaser from "phaser";
import { Player } from "../objects/Player";

class Room {
  constructor(
    public x1: number,
    public y1: number,
    public x2: number,
    public y2: number
  ) {}
}

export class DevScene extends Phaser.Scene {
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private floors!: Phaser.GameObjects.Group;
  private room_max_size: number = 8;
  private room_min_size: number = 2;
  private max_rooms: number = 16;
  private lastRoomCoords: { x: number; y: number } = { x: 0, y: 0 };
  private num_rooms: number = 6;
  private player!: Player;
  private tileSize: number = 32;
  private rooms: Room[] = [];
  private floorMap: boolean[][] = [];

  constructor() {
    super("DevScene");
  }

  preload() {
    this.load.spritesheet("cat", "cats/black/sprite/combined.png", {
      frameWidth: 64,
      frameHeight: 39,
    });
    this.load.image("wall", "assets/sprite-grass.png");
    const graphics = this.add.graphics();
    graphics.fillStyle(0x000000, 0);
    graphics.fillRect(0, 0, this.tileSize, this.tileSize);
    graphics.generateTexture("invisible_floor", this.tileSize, this.tileSize);
    graphics.destroy();
  }

  create() {
    this.walls = this.physics.add.staticGroup();
    this.floors = this.add.group(); // Change to a regular group
    this.makeMap();
    this.player = new Player(
      this,
      this.lastRoomCoords.x,
      this.lastRoomCoords.y
    );
    this.cameras.main.startFollow(this.player.sprite);
  }

  getRandom(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  createFloor(x: number, y: number) {
    this.floors.create(x, y, "invisible_floor");
  }

  createRoom(x1: number, x2: number, y1: number, y2: number) {
    for (let x = x1; x < x2; x += this.tileSize) {
      for (let y = y1; y < y2; y += this.tileSize) {
        this.createFloor(x, y);
      }
    }
    this.rooms.push(new Room(x1, y1, x2, y2));
  }

  createHTunnel(x1: number, x2: number, y: number) {
    let min = Math.min(x1, x2);
    let max = Math.max(x1, x2);
    for (let x = min; x <= max; x += this.tileSize) {
      this.createFloor(x, y);
    }
  }

  createVTunnel(y1: number, y2: number, x: number) {
    let min = Math.min(y1, y2);
    let max = Math.max(y1, y2);
    for (let y = min; y <= max; y += this.tileSize) {
      this.createFloor(x, y);
    }
  }

  findPath(x: number, y: number, minDistance: number): boolean {
    if (this.isGoal(x, y) && minDistance === 0) return true;
    if (!this.isOpen(x, y)) return false;

    this.floorMap[y][x] = true; // mark x, y as part of layout path

    const directions = this.shuffle([0, 1, 2, 3]); // shuffle directions
    for (let dir of directions) {
      let newX = x,
        newY = y;
      switch (dir) {
        case 0:
          newY -= 1;
          break; // North
        case 1:
          newX += 1;
          break; // East
        case 2:
          newY += 1;
          break; // South
        case 3:
          newX -= 1;
          break; // West
      }
      if (this.findPath(newX, newY, minDistance - 1)) return true;
    }

    this.floorMap[y][x] = false; // unmark x, y as part of solution path
    return false;
  }

  isGoal(x: number, y: number): boolean {
    return x === this.lastRoomCoords.x && y === this.lastRoomCoords.y;
  }

  isOpen(x: number, y: number): boolean {
    return (
      x >= 0 &&
      x < this.floorMap[0].length &&
      y >= 0 &&
      y < this.floorMap.length &&
      !this.floorMap[y][x]
    );
  }

  shuffle(array: number[]): number[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  makeMap() {
    const mapWidth = this.physics.world.bounds.width;
    const mapHeight = this.physics.world.bounds.height;

    for (let y = 0; y < mapHeight / this.tileSize; y++) {
      this.floorMap[y] = [];
      for (let x = 0; x < mapWidth / this.tileSize; x++) {
        this.floorMap[y][x] = false;
      }
    }

    for (let r = 0; r < this.max_rooms; r++) {
      let w =
        this.getRandom(this.room_min_size, this.room_max_size) * this.tileSize;
      let h =
        this.getRandom(this.room_min_size, this.room_max_size) * this.tileSize;
      let x =
        this.getRandom(1, mapWidth / this.tileSize - (w / this.tileSize + 1)) *
        this.tileSize;
      let y =
        this.getRandom(1, mapHeight / this.tileSize - (h / this.tileSize + 1)) *
        this.tileSize;

      this.createRoom(x, x + w, y, y + h);

      for (let i = x / this.tileSize; i < (x + w) / this.tileSize; i++) {
        for (let j = y / this.tileSize; j < (y + h) / this.tileSize; j++) {
          this.floorMap[j][i] = true;
        }
      }

      if (this.num_rooms === 0) {
        this.lastRoomCoords = { x: x + w / 2, y: y + h / 2 };
      } else {
        let new_x = Phaser.Math.Snap.Floor(x + w / 2, this.tileSize);
        let new_y = Phaser.Math.Snap.Floor(y + h / 2, this.tileSize);

        let prev_x = Phaser.Math.Snap.Floor(
          this.lastRoomCoords.x,
          this.tileSize
        );
        let prev_y = Phaser.Math.Snap.Floor(
          this.lastRoomCoords.y,
          this.tileSize
        );

        this.createHTunnel(prev_x, new_x, prev_y);
        this.createVTunnel(prev_y, new_y, new_x);

        for (
          let i = Math.min(prev_x, new_x) / this.tileSize;
          i <= Math.max(prev_x, new_x) / this.tileSize;
          i++
        ) {
          this.floorMap[prev_y / this.tileSize][i] = true;
        }
        for (
          let j = Math.min(prev_y, new_y) / this.tileSize;
          j <= Math.max(prev_y, new_y) / this.tileSize;
          j++
        ) {
          this.floorMap[j][new_x / this.tileSize] = true;
        }
      }

      this.lastRoomCoords = { x: x + w / 2, y: y + h / 2 };
      this.num_rooms++;
    }

    for (let y = 0; y < mapHeight / this.tileSize; y++) {
      for (let x = 0; x < mapWidth / this.tileSize; x++) {
        if (!this.floorMap[y][x]) {
          let wall = this.walls.create(
            x * this.tileSize,
            y * this.tileSize,
            "wall"
          );
          wall.body.immovable = true;
        }
      }
    }
  }

  update() {
    this.physics.collide(this.player.sprite, this.walls);
    this.player.update();
  }
}

//TODO FIX COLLISION BETWEEN SPRITE AND WALLS

//TODO FIX TUNNEL H FROM ONE BCO KTO 3-4

//TODO DELETE SOME PATH CHECK IF LEVELS IS 4X4 FROM 10X8
