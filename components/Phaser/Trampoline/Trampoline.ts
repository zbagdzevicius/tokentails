const BOUNCE_VELOCITY = -1000;

export class Trampoline {
  private scene: Phaser.Scene;
  private tileLayer: Phaser.Tilemaps.TilemapLayer;
  private trampolineTiles: number[];

  constructor(
    scene: Phaser.Scene,
    tileLayer: Phaser.Tilemaps.TilemapLayer,
    trampolineTiles: number[]
  ) {
    this.scene = scene;
    this.tileLayer = tileLayer;
    this.trampolineTiles = trampolineTiles;

    this.initializeTrampoline();
  }

  private initializeTrampoline() {
    this.tileLayer.setCollision(this.trampolineTiles);
    this.tileLayer.setTileIndexCallback(
      this.trampolineTiles,
      this.handleBounce,
      this
    );
  }

  private handleBounce(player: Phaser.GameObjects.GameObject) {
    const playerSprite = player as Phaser.Physics.Arcade.Sprite;

    if (
      playerSprite.body!.velocity.y > 0 ||
      playerSprite.body!.velocity.y <= 0
    ) {
      playerSprite.setVelocityY(BOUNCE_VELOCITY);
      this.scene.sound.play("powerup", { volume: 0.3 });
    }
    return true;
  }
}
