export class Spike extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number, rotation: number) {
    super(scene, x, y, "spike");
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;

    body.immovable = true;
    body.allowGravity = false;
    this.setOrigin(0.5, 1);
    this.setPosition(x, y);
    this.setRotation(rotation);

    this.setVisible(false);
    this.setAlpha(0); // Set alpha to 0 for complete invisibility
  }
}
