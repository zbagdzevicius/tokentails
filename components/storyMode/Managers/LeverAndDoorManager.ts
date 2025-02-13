export interface ILeverAndDoorConfig {
  scene: Phaser.Scene;
  leverX: number;
  leverY: number;
  doorX: number;
  doorY: number;
  doorOpenDuration: number;
  player: Phaser.Physics.Arcade.Sprite;
}

export class LeverAndDoorManager {
  private scene: Phaser.Scene;
  private lever: Phaser.GameObjects.Sprite;
  private door: Phaser.GameObjects.Sprite;
  private doorOpenPosition: number;
  private doorClosedPosition: number;
  private leverActive: boolean = false;
  private doorOpenDuration: number;
  private countdown: number = 0;

  constructor(config: ILeverAndDoorConfig) {
    this.scene = config.scene;
    this.doorOpenDuration = config.doorOpenDuration;

    this.lever = this.scene.physics.add
      .sprite(config.leverX, config.leverY, "lever")
      .setInteractive();
    const leverBody = this.lever.body as Phaser.Physics.Arcade.Body;

    this.lever.setScale(1.5); // Adjust this value as needed

    leverBody.allowGravity = false;
    leverBody.setSize(28, 28);

    this.door = this.scene.physics.add
      .sprite(config.doorX, config.doorY, "plumb-door")
      .setInteractive();
    this.doorClosedPosition = this.door.y;
    this.doorOpenPosition = this.doorClosedPosition - 96;
    (this.door.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    (this.door.body as Phaser.Physics.Arcade.Body).immovable = true;

    this.scene.physics.add.collider(config.player, this.door);

    this.scene.physics.add.overlap(
      config.player,
      this.lever,
      this.activateLever,
      undefined,
      this
    );
  }

  private activateLever = () => {
    if (this.leverActive) return;

    this.leverActive = true;
    this.countdown = this.doorOpenDuration / 1000;
    this.openDoor();
    this.lever.play("lever-anim");

    this.scene.time.addEvent({
      delay: 1000,
      repeat: this.doorOpenDuration / 1000 - 1,
      callback: this.updateTimer,
      callbackScope: this,
    });

    this.scene.time.delayedCall(
      this.doorOpenDuration,
      () => {
        this.closeDoor();
        this.leverActive = false;
        this.lever.playReverse("lever-anim");
      },
      undefined,
      this
    );
  };

  private openDoor() {
    this.scene.add.tween({
      targets: this.door,
      y: this.doorOpenPosition,
      duration: 1000,
      ease: "Power2",
    });
  }

  private closeDoor() {
    this.scene.add.tween({
      targets: this.door,
      y: this.doorClosedPosition,
      duration: 1000,
      ease: "Power2",
    });
  }

  private updateTimer = () => {
    this.countdown -= 1;
  };

  destroy() {
    if (this.lever) {
      this.lever.destroy();
    }
    if (this.door) {
      this.door.destroy();
    }
  }

  //  update() {

  // }
}
