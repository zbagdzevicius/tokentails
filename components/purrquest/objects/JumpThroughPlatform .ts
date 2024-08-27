export class JumpThroughPlatform {
  private scene: Phaser.Scene;
  private platforms: Phaser.Physics.Arcade.StaticGroup;
  private player: Phaser.Physics.Arcade.Sprite;

  constructor(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite) {
    this.scene = scene;
    this.player = player;
    this.platforms = this.scene.physics.add.staticGroup();
  }

  createPlatform(x: number, y: number, texture: string) {
    const platform = this.platforms.create(x, y, texture);

    this.scene.physics.add.collider(
      this.player,
      platform,
      undefined,
      (playerObject) => {
        const player = playerObject as Phaser.Physics.Arcade.Sprite;
        return player.body!.velocity.y > 0;
      },
      this
    );
  }

  getGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.platforms;
  }
}
