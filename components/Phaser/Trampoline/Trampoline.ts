export class Trampoline {
  private scene: Phaser.Scene;
  private bounceVelocity: number;
  private tileLayer: Phaser.Tilemaps.TilemapLayer;
  private trampolineTiles: number[];

  constructor(
    scene: Phaser.Scene,
    tileLayer: Phaser.Tilemaps.TilemapLayer,
    bounceVelocity: number = -1000,
    trampolineTiles: number[]
  ) {
    this.scene = scene;
    this.bounceVelocity = bounceVelocity;
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
    if (playerSprite.body!.velocity.y <= 0) {
      playerSprite.setVelocityY(this.bounceVelocity);
      this.scene.sound.play("powerup");
    }
    return true;
  }
}
