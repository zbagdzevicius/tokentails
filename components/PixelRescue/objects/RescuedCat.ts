import { Scene } from "phaser";

export class RescuedCat {
  public catSprite!: Phaser.GameObjects.Sprite;
  public cloudSprite: Phaser.GameObjects.Sprite;
  public heartsSprite!: Phaser.GameObjects.Sprite;
  private scene: Scene;
  private playerSprite: Phaser.Physics.Arcade.Sprite;
  private followDistance: number = 16;
  private catImageKey: string;
  private isBeingExtracted: boolean = false;

  constructor(
    scene: Scene,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    catImageUrl: string,
    catImageKey: string,
    cratePosition?: { x: number; y: number }
  ) {
    this.scene = scene;
    this.playerSprite = playerSprite;
    this.catImageKey = catImageKey;
    this.playerSprite.setDepth(12);

    this.cloudSprite = scene.add.sprite(
      playerSprite.x - this.followDistance,
      playerSprite.y,
      "cloud"
    );
    this.cloudSprite.setDepth(10);
    this.cloudSprite.setDisplaySize(42, 31);
    this.cloudSprite.setTint(0xff69b4);

    if (scene.anims.exists("cloud-anim")) {
      this.cloudSprite.play("cloud-anim");
    }

    if (
      catImageUrl &&
      catImageUrl.length > 0 &&
      !scene.textures.exists(catImageKey)
    ) {
      scene.load.image(catImageKey, catImageUrl);
      scene.load.once("complete", () => {
        this.createCatSprite(catImageKey);
        if (cratePosition) {
          this.playExtractionEffect(cratePosition);
        }
      });
      scene.load.start();
    } else {
      this.createCatSprite(catImageKey);
      if (cratePosition) {
        this.playExtractionEffect(cratePosition);
      }
    }
  }

  private createCatSprite(spriteKey: string) {
    const spriteAnimationKey = spriteKey + "-anim";

    this.catSprite = this.scene.add.sprite(
      this.playerSprite.x - this.followDistance,
      this.playerSprite.y,
      spriteKey
    );
    this.catSprite.setAlpha(0.8);
    this.catSprite.setDisplaySize(25, 25);

    if (this.scene.anims.exists(spriteAnimationKey)) {
      this.catSprite.play(spriteAnimationKey);
    }

    this.scene.time.delayedCall(750, () => {
      this.heartsSprite = this.scene.add.sprite(
        this.catSprite.x,
        this.catSprite.y - 20,
        "hearts"
      );
      this.heartsSprite.setDisplaySize(24, 24);
      this.heartsSprite.setAlpha(0.9);

      if (this.scene.anims.exists("hearts-anim")) {
        this.heartsSprite.play("hearts-anim");
      }

      this.cloudSprite.setDepth(this.playerSprite.depth - 2);
      this.catSprite.setDepth(this.playerSprite.depth - 1);
      this.heartsSprite.setDepth(this.playerSprite.depth);
    });
  }

  private playExtractionEffect(cratePosition: { x: number; y: number }) {
    if (!this.catSprite || !this.cloudSprite) return;

    this.isBeingExtracted = true;
    this.catSprite.setPosition(cratePosition.x, cratePosition.y);
    this.cloudSprite.setPosition(cratePosition.x, cratePosition.y);
    this.cloudSprite.setAlpha(0);
    this.catSprite.setAlpha(1);

    const extractionPuff = this.scene.add.sprite(
      cratePosition.x,
      cratePosition.y,
      "puff"
    );
    extractionPuff.setDisplaySize(64, 64);
    extractionPuff.setDepth(this.catSprite.depth + 1);
    extractionPuff.setTint(0xddddff);

    if (this.scene.anims.exists("puff")) {
      extractionPuff.play("puff");
    }
    const featherParticles = this.scene.add.particles(
      cratePosition.x,
      cratePosition.y,
      "puff",
      {
        frame: 0,
        lifespan: 1000,
        speed: { min: 20, max: 60 },
        angle: { min: 0, max: 360 },
        gravityY: 150,
        scale: { start: 0.3, end: 0.1 },
        alpha: { start: 0.8, end: 0 },
        quantity: 2,
        frequency: 50,
        tint: 0xffffff,
        blendMode: "ADD",
      }
    );

    if (this.scene.sound.get("powerup")) {
      this.scene.sound.play("powerup", { volume: 0.4 });
    }
    this.scene.tweens.add({
      targets: this.catSprite,
      y: cratePosition.y - 40,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0.9,
      duration: 300,
      ease: "Back.easeOut",
      onComplete: () => {
        this.cloudSprite.setAlpha(1);
        this.cloudSprite.setPosition(this.catSprite.x, this.catSprite.y + 10);

        this.scene.tweens.add({
          targets: this.catSprite,
          scaleX: 1,
          scaleY: 1,
          y: this.cloudSprite.y - 8,
          duration: 200,
          ease: "Bounce.easeOut",
          onComplete: () => {
            this.isBeingExtracted = false;

            this.catSprite.setDisplaySize(25, 25);

            featherParticles.stop();
            this.scene.time.delayedCall(1000, () => {
              featherParticles.destroy();
            });
          },
        });
      },
    });

    extractionPuff.on("animationcomplete", () => {
      extractionPuff.destroy();
    });
  }

  update() {
    if (!this.playerSprite || !this.playerSprite.active) {
      return;
    }

    if (!this.catSprite) {
      return;
    }

    if (this.isBeingExtracted) {
      return;
    }

    const offsetDirection = this.playerSprite.flipX ? 1 : -1;
    const targetX = this.playerSprite.x + this.followDistance * offsetDirection;
    const targetY = this.playerSprite.y;

    const lerpFactor = 0.1;
    this.cloudSprite.x += (targetX - this.cloudSprite.x) * lerpFactor;
    this.cloudSprite.y += (targetY - this.cloudSprite.y) * lerpFactor;

    this.catSprite.x = this.cloudSprite.x;
    this.catSprite.y = this.cloudSprite.y - 8;
    this.catSprite.setFlipX(this.playerSprite.flipX);
    this.cloudSprite.setFlipX(this.playerSprite.flipX);

    if (this.heartsSprite) {
      this.heartsSprite.x = this.catSprite.x;
      this.heartsSprite.y = this.catSprite.y - 6;
    }
  }

  destroy() {
    if (this.catSprite) {
      this.catSprite.destroy();
    }
    if (this.cloudSprite) {
      this.cloudSprite.destroy();
    }
    if (this.heartsSprite) {
      this.heartsSprite.destroy();
    }
  }

  setFollowDistance(distance: number) {
    this.followDistance = distance;
  }
}
