export interface IMovableBlockConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  platformsLayer: Phaser.Tilemaps.TilemapLayer;
  jumperLayer: Phaser.Tilemaps.TilemapLayer;
  x: number;
  y: number;
}

export class MovableBlockManager {
  private scene: Phaser.Scene;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private platformsLayer: Phaser.Tilemaps.TilemapLayer;
  private jumperLayer: Phaser.Tilemaps.TilemapLayer;
  private blocks: Phaser.Physics.Arcade.Sprite[] = [];
  private x: number;
  private y: number;

  constructor(config: IMovableBlockConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;
    this.platformsLayer = config.platformsLayer;
    this.jumperLayer = config.jumperLayer;
    this.x = config.x;
    this.y = config.y;

    this.createMovableBlock(this.x, this.y);
  }

  createMovableBlock(x: number, y: number) {
    const block = this.scene.physics.add.sprite(x, y, "movable-block");

    block.setImmovable(false);
    (block.body as Phaser.Physics.Arcade.Body).setGravityY(400);
    (block.body as Phaser.Physics.Arcade.Body).setDrag(1000);
    (block.body as Phaser.Physics.Arcade.Body).setMass(0.5);
    this.blocks.push(block);
  }

  create() {
    this.enableCollision();
  }

  enableCollision() {
    this.scene.physics.add.collider(this.blocks, this.groundLayer);
    this.scene.physics.add.collider(this.blocks, this.platformsLayer);
    this.scene.physics.add.collider(this.blocks, this.jumperLayer);
  }

  handlePlayerPush(
    player: Phaser.Physics.Arcade.Sprite,
    block: Phaser.Physics.Arcade.Sprite
  ) {
    const blockBody = block.body as Phaser.Physics.Arcade.Body;
    const playerBody = player.body as Phaser.Physics.Arcade.Body;

    const playerVelX = playerBody.velocity.x;

    // Calculate relative player position to the block
    const isPlayerAbove = playerBody.bottom <= blockBody.top + 2; // Reduced margin

    if (!isPlayerAbove) {
      const isLeftSidePush =
        playerBody.center.x < blockBody.center.x && playerVelX > 0;
      const isRightSidePush =
        playerBody.center.x > blockBody.center.x && playerVelX < 0;

      if (isLeftSidePush && !blockBody.blocked.right) {
        block.setVelocityX(playerVelX * 0.5);
      } else if (isRightSidePush && !blockBody.blocked.left) {
        block.setVelocityX(playerVelX * 0.5);
      } else {
        block.setVelocityX(0);
      }
    } else {
      block.setVelocityX(0);
      block.setVelocityY(0); // Stabilize block when the player is above
    }

    block.setDrag(100, 0);
  }

  getMovableBlocks() {
    return this.blocks;
  }

  destroy() {
    this.blocks.forEach((block) => block.destroy());
    this.blocks = [];
  }
}
