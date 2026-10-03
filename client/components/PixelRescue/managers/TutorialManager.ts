import { Scene } from "phaser";
import { canStepZoom } from "@/components/Phaser/look/cameraRig";
import { getWorldLook } from "@/components/Phaser/look/worldLook";
import { cameraCssZoom, ttWorldText } from "@/components/Phaser/typography";
import type { Cat } from "../../catbassadors/objects/Catbassador";
import { CatCrate } from "../objects/CatCrate";
import { prefersReducedMotion } from "../ftue";

/**
 * Tour pacing. The old steps looked faster on paper (1.9 s pans, 2.8 s holds) but each step's next
 * call ran from the first frame of its pan (Phaser calls a pan's callback every frame), so pans and
 * holds overlapped. Now each step waits for its pan, so these keep the old ~15 s day 1 tour.
 */
const TOUR_PAN_MS = 1300;
const TOUR_HOLD_MS = 2200;
const TOUR_LAST_HOLD_MS = 2000;

export class TutorialManager {
  private scene: Scene;
  private isActive: boolean = false;
  private tutorialText?: Phaser.GameObjects.Text;
  private tutorialBackground?: Phaser.GameObjects.Rectangle;

  private isMobile: boolean;
  private currentLevel: string;
  private speedMultiplier: number = 1;

  private onEnd?: () => void;
  /** Under `prefers-reduced-motion` the tour is text cards: camera cuts, no pans, no bobbing. */
  private reducedMotion = false;

  constructor(scene: Scene, currentLevel: string) {
    this.scene = scene;
    this.currentLevel = currentLevel;
    this.isMobile = this.detectMobile();

    this.speedMultiplier = currentLevel === "1" ? 1 : 0.5;
  }

  private detectMobile(): boolean {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768
    );
  }

  public start(
    cat: Cat,
    catCrate: CatCrate,
    heartCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number,
    onEnd?: () => void
  ) {
    if (!cat || !catCrate) {
      console.warn("Cannot start tutorial: cat or crate not found");
      onEnd?.();
      return;
    }

    // Whether the tour plays at all (once per level per player, or "Replay tutorial") is the
    // scene's decision (`ftue.tutorialDecision`); the seen flag is written by `onEnd`.
    this.isActive = true;
    this.onEnd = onEnd;
    this.reducedMotion = prefersReducedMotion();
    // The camera tours the level: it must not drift back to the cat between steps.
    this.scene.cameras.main.stopFollow();

    if (cat && cat.sprite.body) {
      const body = cat.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.setAllowGravity(true);
    }

    this.step1_ShowCagedCat(
      cat,
      catCrate,
      heartCoins,
      exitPortalSprite,
      exitPortalX,
      exitPortalY
    );
  }

  /**
   * Moves the camera to (x, y) and calls `done` once when it arrives. Phaser calls a pan's callback
   * on every frame of the pan, so the old steps ran their next step many times over; `done` runs
   * only at progress 1. Under reduced motion the camera cuts there instead (text cards, no pans).
   */
  private moveCamera(x: number, y: number, duration: number, done: () => void) {
    const camera = this.scene.cameras.main;
    if (this.reducedMotion) {
      camera.centerOn(x, y);
      this.scene.time.delayedCall(0, done);
      return;
    }
    let called = false;
    camera.pan(x, y, duration, "Power2", true, (_camera: unknown, progress: number) => {
      if (called || progress < 1) return;
      called = true;
      done();
    });
  }

  /**
   * Zooms `steps` whole levels in from the scene's integer zoom (0 goes back to it) and calls
   * `done` once at the end, instantly under reduced motion. G7: zoom targets are integers (the
   * old `ZOOM * 1.1` gave a fractional zoom that blurred the pixel art).
   */
  private zoomSteps(steps: number, duration: number, done: () => void) {
    const rig = getWorldLook(this.scene)?.rig;
    const time = this.reducedMotion ? 0 : duration;
    const camera = this.scene.cameras.main;
    const k = rig ? rig.zoom : Math.max(1, Math.round(camera.zoom));
    // One whole level is a big jump on a phone (k = 2 to 3 is +50 %): only step in while at
    // least 10 tiles stay visible across, else hold the current zoom (task 6e review).
    const stepIn = steps > 0 && canStepZoom(camera.width, k, steps) ? steps : 0;
    if (rig) {
      if (stepIn === 0) rig.zoomHome(time, done);
      else rig.zoomBy(stepIn, time, done);
      return;
    }
    this.zoomCamera(Math.max(1, k + stepIn), duration, done);
  }

  /** Zooms the camera and calls `done` once at the end (instantly under reduced motion). */
  private zoomCamera(zoom: number, duration: number, done: () => void) {
    const camera = this.scene.cameras.main;
    if (this.reducedMotion) {
      camera.setZoom(zoom);
      this.scene.time.delayedCall(0, done);
      return;
    }
    let called = false;
    camera.zoomTo(zoom, duration, "Power2", true, (_camera: unknown, progress: number) => {
      if (called || progress < 1) return;
      called = true;
      done();
    });
  }

  /** A short bob on a target to draw the eye; skipped under reduced motion. */
  private bob(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    if (this.reducedMotion) return;
    this.scene.tweens.add(config);
  }

  /** A step's wait, unless the tour was ended or the scene went away meanwhile. */
  private after(ms: number, next: () => void) {
    this.scene.time.delayedCall(ms, () => {
      if (this.isActive) next();
    });
  }

  private step1_ShowCagedCat(
    cat: Cat,
    catCrate: CatCrate,
    heartCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number
  ) {
    const crateX = catCrate.x;
    const crateY = catCrate.y;

    this.moveCamera(crateX, crateY, TOUR_PAN_MS * this.speedMultiplier, () => {
      this.zoomSteps(1, 550 * this.speedMultiplier, () => {
        this.createTutorialText("Save this cat!", crateX, crateY, 20);

        const catSprite = catCrate.getCatSprite();
        if (catSprite) {
          this.bob({
            targets: catSprite,
            y: catSprite.y - 6,
            duration: 400 * this.speedMultiplier,
            yoyo: true,
            repeat: 4,
          });
        }

        this.after(TOUR_HOLD_MS * this.speedMultiplier, () => {
          this.step2_ShowheartCoins(
            cat,
            catCrate,
            heartCoins,
            exitPortalSprite,
            exitPortalX,
            exitPortalY
          );
        });
      });
    });
  }

  private step2_ShowheartCoins(
    cat: Cat,
    catCrate: CatCrate,
    heartCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number
  ) {
    if (heartCoins.length === 0) {
      this.step3_ShowExit(
        cat,
        catCrate,
        heartCoins,
        exitPortalSprite,
        exitPortalX,
        exitPortalY
      );
      return;
    }

    const firstCoin = heartCoins[0];
    const coinX = firstCoin.x;
    const coinY = firstCoin.y;

    this.moveCamera(coinX, coinY, TOUR_PAN_MS * this.speedMultiplier, () => {
      this.createTutorialText(
        "Collect every heart. They open the cage.",
        coinX,
        coinY,
        20
      );

      this.bob({
        targets: firstCoin,
        scaleX: 1.8,
        scaleY: 1.8,
        duration: 400 * this.speedMultiplier,
        yoyo: true,
        repeat: 4,
      });

      this.after(TOUR_HOLD_MS * this.speedMultiplier, () => {
        this.step3_ShowExit(
          cat,
          catCrate,
          heartCoins,
          exitPortalSprite,
          exitPortalX,
          exitPortalY
        );
      });
    });
  }

  private step3_ShowExit(
    cat: Cat,
    catCrate: CatCrate,
    heartCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite,
    exitPortalX: number,
    exitPortalY: number
  ) {
    this.moveCamera(exitPortalX, exitPortalY, TOUR_PAN_MS * this.speedMultiplier, () => {
      this.createTutorialText(
        "Then bring the cat to this portal.",
        exitPortalX,
        exitPortalY,
        20
      );

      this.bob({
        targets: exitPortalSprite,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 400 * this.speedMultiplier,
        yoyo: true,
        repeat: 4,
      });

      this.after(TOUR_LAST_HOLD_MS * this.speedMultiplier, () => {
        this.step4_BackToCat(cat, catCrate, heartCoins, exitPortalSprite);
      });
    });
  }

  private step4_BackToCat(
    cat: Cat,
    catCrate: CatCrate,
    heartCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite
  ) {
    const crateX = catCrate.x;
    const crateY = catCrate.y;

    this.moveCamera(crateX, crateY, 900 * this.speedMultiplier, () => {
      this.createTutorialText(
        this.isMobile
          ? "Your turn! Use the buttons to run and jump."
          : "Your turn! Arrows or A and D to run, Space or W to jump.",
        crateX,
        crateY,
        20
      );

      this.after(TOUR_LAST_HOLD_MS * this.speedMultiplier, () => {
        this.end(cat, catCrate, heartCoins, exitPortalSprite);
      });
    });
  }

  /**
   * Ends the tour. The camera returns to the cat first; only then does the tour stop counting as
   * active and `onEnd` resume the clock, so the clock never runs (and input is never read) while
   * the cat is still off-screen.
   */
  public end(
    cat: Cat,
    catCrate: CatCrate,
    heartCoins: Phaser.GameObjects.Sprite[],
    exitPortalSprite: Phaser.GameObjects.Sprite
  ) {
    if (!this.isActive) return;

    // Reset object scales and tweens first
    heartCoins.forEach((coin) => {
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

    const finish = () => {
      if (!this.isActive) return;
      if (cat?.sprite?.active) {
        const look = getWorldLook(this.scene);
        if (look) look.follow(cat.sprite);
        else this.scene.cameras.main.startFollow(cat.sprite, true, 0.1, 0.1);
      }
      this.isActive = false;
      const onEnd = this.onEnd;
      this.onEnd = undefined;
      onEnd?.();
    };

    if (!cat || !cat.sprite.body) {
      this.destroyText();
      finish();
      return;
    }

    const body = cat.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);

    this.moveCamera(cat.sprite.x, cat.sprite.y, 1000 * this.speedMultiplier, () => {
      this.destroyText();
      this.zoomSteps(0, 340 * this.speedMultiplier, finish);
    });
  }

  private destroyText() {
    if (this.tutorialText) {
      this.tutorialText.destroy();
      this.tutorialText = undefined;
    }
    if (this.tutorialBackground) {
      this.tutorialBackground.destroy();
      this.tutorialBackground = undefined;
    }
  }

  private createTutorialText(
    text: string,
    x: number,
    y: number,
    fontSize: number = 20
  ) {
    if (this.tutorialText) {
      this.tutorialText.destroy();
    }
    if (this.tutorialBackground) {
      this.tutorialBackground.destroy();
    }

    // The `hint` role (plan G12, decision #80) replaces the unlicensed CDN pixel font. Sizes are
    // CSS pixels on screen (16 on phones, 20 on desktop for the default 20), whatever the zoom.
    const cssSize = Math.round((this.isMobile ? 16 : 20) * (fontSize / 20));
    const textY = this.isMobile ? y - 60 : y - 80;
    const wrapWorld = this.isMobile ? 150 : 400;

    this.tutorialText = ttWorldText(this.scene, x, textY, text, "hint", cssSize, {
      color: "#fbcc93",
      stroke: "#000000",
      strokeThickness: this.isMobile ? 4 : 5,
      align: "center",
      // The wrap width is in the text's own (unscaled) pixels.
      wordWrapWidth: wrapWorld * cameraCssZoom(this.scene),
      origin: 0.5,
      depth: 1000,
    });
  }

  public get active(): boolean {
    return this.isActive;
  }
}
