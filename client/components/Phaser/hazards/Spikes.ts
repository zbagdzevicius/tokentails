export class Spike extends Phaser.GameObjects.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number, rotation: number) {
    super(scene, x, y, "spike");
    scene.add.existing(this);

    this.setOrigin(0, 0.5);
    this.setPosition(x, y);
    this.setRotation(rotation);

    this.setVisible(false);
    this.setAlpha(0);
  }
}
