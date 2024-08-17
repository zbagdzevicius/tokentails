import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Player } from "../objects/Player";

export function setMobileControls(scene: Phaser.Scene, player: Player) {
  const leftButton = scene.add
    .image(50, GAME_HEIGHT - 50, "leftButton")
    .setInteractive();
  leftButton.setScrollFactor(0);
  leftButton.setDepth(2);
  leftButton.on("pointerdown", () => {
    player.isMobileLeft = true;
    player.isMobileRight = false;
  });
  leftButton.on("pointerup", () => {
    player.isMobileLeft = false;
  });

  const rightButton = scene.add
    .image(150, GAME_HEIGHT - 50, "rightButton")
    .setInteractive();
  rightButton.setScrollFactor(0);
  rightButton.setDepth(2);
  rightButton.on("pointerdown", () => {
    player.isMobileRight = true;
    player.isMobileLeft = false;
  });
  rightButton.on("pointerup", () => {
    player.isMobileRight = false;
  });

  const jumpButton = scene.add
    .image(GAME_WIDTH - 40, GAME_HEIGHT - 50, "jumpButton")
    .setInteractive();
  jumpButton.setScrollFactor(0);
  jumpButton.setDepth(2);
  jumpButton.on("pointerdown", () => {
    player.isMobileJumping = true;
  });
  jumpButton.on("pointerup", () => {
    player.isMobileJumping = false;
  });

  const dashButton = scene.add
    .image(GAME_WIDTH - 135, GAME_HEIGHT - 50, "dashButton")
    .setInteractive();
  dashButton.setScrollFactor(0);
  dashButton.setDepth(2);
  dashButton.on("pointerdown", () => {
    player.isMobileDash = true;
  });
  dashButton.on("pointerup", () => {
    player.isMobileDash = false;
  });
}

export function isMobileOrTablet(): boolean {
  const userAgent = navigator.userAgent || navigator.vendor;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspectRatio = width / height;

  const isMobile = /android|iPhone|iPod|blackberry|windows phone|mobile/i.test(
    userAgent
  );
  const isTablet = /iPad|tablet|playbook|silk/i.test(userAgent);
  const isMobileScreen = width <= 768;
  const isTabletScreen = width <= 1024 && aspectRatio < 1.5;

  return isMobile || isTablet || isMobileScreen || isTabletScreen;
}
