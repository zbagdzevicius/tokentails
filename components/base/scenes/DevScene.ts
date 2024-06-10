import { Scene } from "phaser";
import { GAME_HEIGHT } from "../config";
import { Player } from "../objects/NPC";
import { Toy } from "../objects/Toy";

type ArcadeGameObjectOrTile =
  | Phaser.Types.Physics.Arcade.GameObjectWithBody
  | Phaser.Tilemaps.Tile;

export class DevScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  player!: Player;
  toy!: Toy;
  NPCs!: (Player | Toy)[];
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  // coin!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  coins!: Phaser.Physics.Arcade.Group;
  score: number = 0;
  scoreText!: Phaser.GameObjects.Text;
  key!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  keyIsCollected: boolean = false;
  keyText: string = this.keyIsCollected ? "found" : "missing";

  constructor() {
    super("DevScene");
  }

  preload() {
    this.load.spritesheet("cat", "cats/yellow.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet("bird", "base/bird.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image("coin", "purrquest/sprites/coin.png");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.tilemapTiledJSON("tilemap", "base/base.json");
    this.load.image("blocks", "base/blocks.png");
    this.load.image("bg", "base/bg.svg");
    this.load.image("platforms", "base/pirate/platforms.png");
    this.load.image("walls", "base/pirate/walls.png");
    this.load.image("decorations", "base/pigs/decorations.png");
    this.load.image("grass", "base/outer-bg/grass.png");
    this.load.image("clouds", "base/outer-bg/clouds.png");
    this.load.image("rock", "base/outer-bg/rock.png");
    this.load.image("sky", "base/outer-bg/sky.png");
  }

  create() {
    this.add.image(0, -600, "bg").setDisplaySize(2200, 1600);

    this.tilemap = this.make.tilemap({ key: "tilemap" });

    const sugarTileset = this.tilemap.addTilesetImage("blocks", "blocks")!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;

    this.tilemap.createLayer("decorations", [sugarTileset]);

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByExclusion([-1]);

    // Create the player
    this.player = new Player(this, 0, -400);
    this.toy = new Toy(this, 0, -400);

    // Enable collision between player and tilemap layer
    this.physics.add.collider(this.player.sprite, this.groundLayer);
    this.physics.add.collider(this.toy.sprite, this.groundLayer);
    this.physics.add.collider(this.player.sprite, this.toy.sprite, () =>
      console.log("colide")
    );

    // Adjust camera to follow the player
    this.cameras.main.startFollow(this.player.sprite);
    this.cameras.main.zoom = 1.2;
  }

  update() {
    this.player?.update();
    this.toy?.update();
    const distance = this.getDistance(this.player.sprite, this.toy.sprite);
    // console.log(distance);
    this.player.setJump(distance < 80);
  }

  getDistance(
    obj1: Phaser.Physics.Arcade.Sprite,
    obj2: Phaser.Physics.Arcade.Sprite
  ) {
    return Math.abs(obj1.x - obj2.x);
  }
}
