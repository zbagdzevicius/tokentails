export class CollectiveItem {
  private scene: Phaser.Scene;
  sprite: Phaser.Physics.Arcade.Sprite;
  private player: Phaser.Physics.Arcade.Sprite;
  private isFloating: boolean;

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    texture: string,
    isFloating: boolean = false
  ) {
    this.scene = scene;
    this.player = player;
    this.isFloating = isFloating;

    this.sprite = scene.physics.add.sprite(player.x, player.y, texture);
    this.sprite.setScale(0.5);
    this.sprite.setDepth(-1);

    if (isFloating) {
      this.setupFloatingAnimation();
    }
  }

  setupFloatingAnimation() {
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 10,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  update() {
    this.sprite.x = this.player.x;
    this.sprite.y = this.player.y + (this.isFloating ? -20 : 0);
  }

  drop() {
    this.sprite.setVelocity(0, 0);
    this.sprite.setGravityY(500);
    this.sprite.setCollideWorldBounds(true);
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
    }
  }
}
