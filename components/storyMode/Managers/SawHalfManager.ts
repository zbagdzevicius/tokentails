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
    this.scene.physics.add.collider(this.sprite as any, this.groundLayer);
  }

  update(delta: number) {
    if (!this.groundLayer) return;

    const distance = this.speed * this.direction * (delta / 1000);
    this.sprite.x += distance;

    this.sprite.setDepth(this.sprite.y);

    // Alternative approach using tilemap directly
    try {
      const tilemap = this.groundLayer.tilemap;
      if (!tilemap) {
        console.warn("Tilemap not available on groundLayer");
        return;
      }

      const nextX = this.sprite.x + this.direction * this.sprite.width * 0.5;

      // Convert world coordinates to tile coordinates
      const tileAheadX = Math.floor(nextX / tilemap.tileWidth);
      const tileAheadY = Math.floor(this.sprite.y / tilemap.tileHeight);

      const tileBelowX = Math.floor(this.sprite.x / tilemap.tileWidth);
      const tileBelowY = Math.floor(
        (this.sprite.y + this.sprite.height * 0.5) / tilemap.tileHeight
      );

      const tileBelowLeftX = Math.floor(
        (this.sprite.x - this.sprite.width * 0.5) / tilemap.tileWidth
      );
      const tileBelowRightX = Math.floor(
        (this.sprite.x + this.sprite.width * 0.5) / tilemap.tileWidth
      );

      // Get tiles using layer's getTileAt method
      const tileAhead = this.groundLayer.getTileAt(tileAheadX, tileAheadY);
      const tileBelow = this.groundLayer.getTileAt(tileBelowX, tileBelowY);
      const tileBelowLeft = this.groundLayer.getTileAt(
        tileBelowLeftX,
        tileBelowY
      );
      const tileBelowRight = this.groundLayer.getTileAt(
        tileBelowRightX,
        tileBelowY
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
    } catch (error) {
      console.error("Error in SawHalf tile detection:", error);
      // Fallback: reverse direction on error
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
