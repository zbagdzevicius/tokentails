import { Scene } from "phaser";
import { Player } from "../objects/Player";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

type ArcadeGameObjectOrTile =
  | Phaser.Types.Physics.Arcade.GameObjectWithBody
  | Phaser.Tilemaps.Tile;

export class DevScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  player!: Player;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  // coin!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  coins!: Phaser.Physics.Arcade.Group;
  score: number = 0;
  scoreText!: Phaser.GameObjects.Text;
  trampoline!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  key!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  keyIsCollected: boolean = false;
  keyText: string = this.keyIsCollected ? "found" : "missing";

  constructor() {
    super("DevScene");
  }

  preload() {
    this.load.spritesheet("cat", "cats/black/sprite/combined.png", {
      frameWidth: 64,
      frameHeight: 39,
    });
    this.load.image("coin", "purrquest/sprites/coin.webp");
    this.load.image("trampoline", "purrquest/sprites/trampoline.png");
    // this.load.image("ground", "purrquest/sprites/platform.png");
    this.load.image("key", "purrquest/sprites/key.png");
    this.load.audio("blip", "purrquest/sounds/blip.mp3");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.tilemapTiledJSON("tilemap", "assets/maps/levelone.json");
    this.load.image("grass", "assets/maps/grass.png");
  }

  create() {
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const tileset = this.tilemap.addTilesetImage("grass", "grass");
    this.groundLayer = this.tilemap.createLayer("grasslevel", tileset!)!;

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByProperty({ collides: true });

    // Create the player
    this.player = new Player(this, 500, GAME_HEIGHT - 600);

    // Enable collision between player and tilemap layer
    this.physics.add.collider(this.player.sprite, this.groundLayer);

    // Adjust camera to follow the player
    this.cameras.main.startFollow(this.player.sprite);

    console.log("Touching Down:", this.player.sprite.body!.touching.down);
    this.coins = this.physics.add.group({
      key: "coin",
      repeat: 2,
      setXY: { x: 250, y: GAME_HEIGHT - 600, stepX: 70 },
    });

    // Add collider between coins and groundLayer
    this.physics.add.collider(this.coins, this.groundLayer);
    this.player.addCollider(this.groundLayer as any);
    // Create trampoline and key
    this.trampoline = this.physics.add.staticSprite(
      150,
      GAME_HEIGHT - 500,
      "trampoline"
    );
    this.key = this.physics.add.staticSprite(400, GAME_HEIGHT - 800, "key");

    // Set collision between player and trampoline
    this.physics.add.collider(
      this.player.sprite,
      this.trampoline,
      this.bounceOffTrampoline,
      undefined,
      this
    );

    // Set collision between player and key
    this.physics.add.overlap(
      this.player.sprite,
      this.key,
      this.collectKey,
      undefined,
      this
    );

    // Set collision between player and coins
    this.physics.add.overlap(
      this.player.sprite,
      this.coins,
      this.collectCoin,
      undefined,
      this
    );

    // Initialize score text
    this.scoreText = this.add.text(
      16,
      16,
      `score: ${this.score} | key: ${this.keyText}`,
      {
        fontSize: "32px",
        color: "#000",
      }
    );
    this.updateScoreText();
  }
  update() {
    this.player.update();
  }

  collectCoin(player: ArcadeGameObjectOrTile, coin: ArcadeGameObjectOrTile) {
    const coinSprite = coin as Phaser.Physics.Arcade.Sprite;
    coinSprite.disableBody(true, true);
    this.sound.play("blip");
    this.score += 1;
    this.updateScoreText(); // Update the score display
  }

  bounceOffTrampoline(player: any, trampoline: any) {
    // Check if the bottom of the player is just above the top of the trampoline
    if (player.y + player.height <= trampoline.y) {
      player.setVelocityY(-800); // This triggers the bounce
      this.sound.play("powerup"); // Play bounce sound effect
    }
  }

  collectKey(player: any, key: any) {
    if (!this.keyIsCollected) {
      key.disableBody(true, true); // Disable the key's body and make it invisible
      this.keyIsCollected = true; // Set the isCollected flag to true
      this.keyText = "found"; // Update the keyText to reflect the new state
      this.sound.play("blip"); // Optionally play a sound effect
      this.updateScoreText(); // Update the display text
    }
  }

  updateScoreText() {
    this.scoreText.setText(`score: ${this.score} | key: ${this.keyText}`);
  }
}
