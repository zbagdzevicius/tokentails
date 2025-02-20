export interface ISawHalfConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  x: number;
  y: number;
}

export class SawHalf {
  sprite: Phaser.GameObjects.Sprite;
  scene: Phaser.Scene;
  speed: number;
  direction: number;
  groundLayer: Phaser.Tilemaps.TilemapLayer;

  constructor(config: ISawHalfConfig) {
    this.scene = config.scene;
    this.sprite = config.scene.physics.add
      .sprite(config.x, config.y, "sawHalf")
      .setOrigin(0.5, 0.5)
      .setImmovable(true);
    this.speed = 75;
    this.direction = 1;
    this.groundLayer = config.groundLayer;

    this.sprite.play("sawHalf-anim");
    this.create();
  }

  create() {
    this.enableCollision();
  }

  enableCollision() {
    this.scene.physics.add.collider(this.sprite, this.groundLayer);
  }

  update(delta: number) {
    const distance = this.speed * this.direction * (delta / 1000);
    this.sprite.x += distance;

    this.sprite.setDepth(this.sprite.y);

    const nextX = this.sprite.x + this.direction * this.sprite.width * 0.5;
    const tileAhead = this.groundLayer.getTileAtWorldXY(nextX, this.sprite.y);
    const tileBelow = this.groundLayer.getTileAtWorldXY(
      this.sprite.x,
      this.sprite.y + this.sprite.height * 0.5
    );
    const tileBelowLeft = this.groundLayer.getTileAtWorldXY(
      this.sprite.x - this.sprite.width * 0.5,
      this.sprite.y + this.sprite.height * 0.5
    );
    const tileBelowRight = this.groundLayer.getTileAtWorldXY(
      this.sprite.x + this.sprite.width * 0.5,
      this.sprite.y + this.sprite.height * 0.5
    );

    if (
      !tileBelow ||
      tileBelow.index === -1 ||
      (tileBelowLeft && tileBelowLeft.index === -1) ||
      (tileBelowRight && tileBelowRight.index === -1) ||
      (tileAhead && tileAhead.index !== -1)
    ) {
      this.direction *= -1;
    }
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
    }
  }

  getSprite() {
    return this.sprite;
  }
}
