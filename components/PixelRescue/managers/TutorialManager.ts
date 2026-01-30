import { Scene } from "phaser";
import { ZOOM } from "@/constants/utils";
import { CatCrate } from "../objects/CatCrate";

export class TutorialManager {
  private scene: Scene;
  private isActive: boolean = false;
  private isCompleted: boolean = false;
  private tutorialText?: Phaser.GameObjects.Text;
  private tutorialBackground?: Phaser.GameObjects.Rectangle;

  private isMobile: boolean;

  private static hasCompletedTutorial: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.isMobile = this.detectMobile();

    this.isCompleted = TutorialManager.hasCompletedTutorial;
  }

  private detectMobile(): boolean {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) || window.innerWidth < 768
    );
  }

  public start(
    cat: any,
    catCrate: CatCrate,
    hearthCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number,
  ) {
    if (!cat || !catCrate) {
      console.warn("Cannot start tutorial: cat or crate not found");
      return;
    }

    this.isActive = true;
    this.isCompleted = false;

    if (cat && cat.sprite.body) {
      const body = cat.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.setAllowGravity(true);
    }

    this.step1_ShowCagedCat(
      cat,
      catCrate,
      hearthCoins,
      exitPortalSprite,
      exitPortalX,
      exitPortalY,
    );
  }

  private step1_ShowCagedCat(
    cat: any,
    catCrate: CatCrate,
    hearthCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number,
  ) {
    const crateX = catCrate.x;
    const crateY = catCrate.y;

    this.scene.cameras.main.pan(crateX, crateY, 1900, "Power2", false, () => {
      this.scene.cameras.main.zoomTo(ZOOM * 1.1, 550, "Power2", false, () => {
        this.createTutorialText("SAVE THIS CAT!", crateX, crateY, 20);

        const catSprite = catCrate.getCatSprite();
        if (catSprite) {
          this.scene.tweens.add({
            targets: catSprite,
            y: catSprite.y - 6,
            duration: 400,
            yoyo: true,
            repeat: 4,
          });
        }

        this.scene.time.delayedCall(2800, () => {
          this.step2_ShowHearthCoins(
            cat,
            catCrate,
            hearthCoins,
            exitPortalSprite,
            exitPortalX,
            exitPortalY,
          );
        });
      });
    });
  }

  private step2_ShowHearthCoins(
    cat: any,
    catCrate: CatCrate,
    hearthCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number,
  ) {
    if (hearthCoins.length === 0) {
      this.step3_ShowExit(
        cat,
        catCrate,
        hearthCoins,
        exitPortalSprite,
        exitPortalX,
        exitPortalY,
      );
      return;
    }

    const firstCoin = hearthCoins[0];
    const coinX = firstCoin.x;
    const coinY = firstCoin.y;

    this.scene.cameras.main.pan(coinX, coinY, 1900, "Power2", false, () => {
      this.createTutorialText(
        "AND THERE'S A KEY FROM A CAGE",
        coinX,
        coinY,
        20,
      );

      this.scene.tweens.add({
        targets: firstCoin,
        scaleX: 1.8,
        scaleY: 1.8,
        duration: 400,
        yoyo: true,
        repeat: 4,
      });

      this.scene.time.delayedCall(2800, () => {
        this.step3_ShowExit(
          cat,
          catCrate,
          hearthCoins,
          exitPortalSprite,
          exitPortalX,
          exitPortalY,
        );
      });
    });
  }

  private step3_ShowExit(
    cat: any,
    catCrate: CatCrate,
    hearthCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number,
  ) {
    this.scene.cameras.main.pan(
      exitPortalX,
      exitPortalY,
      1900,
      "Power2",
      false,
      () => {
        this.createTutorialText(
          "HERE'S AN EXIT, BUT FIRST!",
          exitPortalX,
          exitPortalY,
          20,
        );

        this.scene.tweens.add({
          targets: exitPortalSprite,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 400,
          yoyo: true,
          repeat: 4,
        });

        this.scene.time.delayedCall(2500, () => {
          this.step4_BackToCat(cat, catCrate, hearthCoins, exitPortalSprite);
        });
      },
    );
  }

  private step4_BackToCat(
    cat: any,
    catCrate: CatCrate,
    hearthCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
  ) {
    const crateX = catCrate.x;
    const crateY = catCrate.y;

    this.scene.cameras.main.pan(crateX, crateY, 1200, "Power2", false, () => {
      this.createTutorialText("LET'S SAVE THIS CAT", crateX, crateY, 20);

      this.scene.time.delayedCall(2500, () => {
        this.end(cat, catCrate, hearthCoins, exitPortalSprite);
      });
    });
  }

  public end(
    cat: any,
    catCrate: CatCrate,
    hearthCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
  ) {
    this.isActive = false;
    this.isCompleted = true;

    TutorialManager.hasCompletedTutorial = true;

    // Reset object scales and tweens first
    hearthCoins.forEach((coin) => {
      coin.setScale(1.0);
    });
    if (exitPortalSprite) {
      this.scene.tweens.killTweensOf(exitPortalSprite);
      exitPortalSprite.setScale(1.0);
    }

    if (catCrate) {
      const catSprite = catCrate.getCatSprite();
      if (catSprite) {
        this.scene.tweens.killTweensOf(catSprite);
        catSprite.y = catCrate.y;
        catSprite.setScale(1.0);
      }
    }

    if (cat && cat.sprite.body) {
      const body = cat.sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(true);

      this.scene.cameras.main.pan(
        cat.sprite.x,
        cat.sprite.y,
        1400,
        "Power2",
        false,
        () => {
          // Destroy text after camera starts panning to prevent flickering
          if (this.tutorialText) {
            this.tutorialText.destroy();
            this.tutorialText = undefined;
          }
          if (this.tutorialBackground) {
            this.tutorialBackground.destroy();
            this.tutorialBackground = undefined;
          }

          this.scene.cameras.main.zoomTo(ZOOM, 340, "Power2", false, () => {
            if (cat) {
              this.scene.cameras.main.startFollow(cat.sprite, true, 0.1, 0.1);
            }
          });
        },
      );
    }
  }

  private createTutorialText(
    text: string,
    x: number,
    y: number,
    fontSize: number = 20,
  ) {
    if (this.tutorialText) {
      this.tutorialText.destroy();
    }
    if (this.tutorialBackground) {
      this.tutorialBackground.destroy();
    }

    const mobileSize = fontSize * 0.6;
    const effectiveFontSize = this.isMobile ? mobileSize : fontSize;

    const textY = this.isMobile ? y - 60 : y - 80;

    this.tutorialText = this.scene.add.text(x, textY, text, {
      fontSize: `${effectiveFontSize}px`,
      color: "#fbcc93",
      fontFamily: "pixel-font",
      fontStyle: "bold",
      stroke: "#000000ff",
      strokeThickness: this.isMobile ? 3 : 4,
      align: "center",
      wordWrap: { width: this.isMobile ? 150 : 400 },
    });
    this.tutorialText.setOrigin(0.5);
    this.tutorialText.setDepth(1000);
  }

  public get active(): boolean {
    return this.isActive;
  }

  public get completed(): boolean {
    return this.isCompleted;
  }

  public static resetTutorial(): void {
    TutorialManager.hasCompletedTutorial = false;
  }
}
