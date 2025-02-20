//TODO ADD HORIZONTAL HIDDEN TRAPS
export interface IHiddenTrapConfig {
  scene: Phaser.Scene;
  texture: string;
  moveDuration: number;
  speed: number;
  x: number;
  y: number;
}

export class HiddenTrap {
  private scene: Phaser.Scene;
  private sprite: Phaser.Physics.Arcade.Sprite;
  private speed: number;
  private moveDuration: number;
  private moveDirection: 1 | -1;
  private initialX: number;
  private isPaused: boolean = false;

  constructor(config: IHiddenTrapConfig) {
    this.scene = config.scene;
    this.speed = config.speed;
    this.moveDuration = config.moveDuration;
    this.moveDirection = 1;
    this.initialX = config.x;

    this.sprite = this.scene.physics.add.sprite(
      config.x,
      config.y,
      config.texture
    );
    this.sprite.setVisible(false);
    this.sprite.setScale(2).setDepth(0);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = false;
    this.sprite.setVisible(true), this.startMovement();
  }

  private startMovement() {
    this.scene.time.addEvent({
      delay: this.moveDuration,
      callback: () => {
        this.isPaused = true;
        this.scene.time.addEvent({
          delay: 1500,
          callback: () => {
            this.isPaused = false;
            this.moveDirection *= -1;
          },
          loop: false,
        });
      },
      loop: true,
    });
  }

  update() {
    if (this.isPaused) {
      return;
    }

    this.sprite.x += this.moveDirection * this.speed;

    if (this.sprite.x < 0) {
      this.sprite.x = 0;
      this.moveDirection = 1;
    } else if (this.sprite.x > this.scene.scale.width) {
      this.sprite.x = this.scene.scale.width;
      this.moveDirection = -1;
    }
  }

  public getSprite() {
    return this.sprite;
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
    }
  }
}
