export interface IPlayer {
  sprite: Phaser.Physics.Arcade.Sprite;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
  };
  isMobileJumping: boolean;
  isMobileLeft: boolean;
  isMobileRight: boolean;
  isMobileDash: boolean;
  isDashing: boolean;
  walkSpeed: number;
  jumpSpeed: number;
  wallSlideSpeed: number;
  disableLeftMovement: boolean;
  disableRightMovement: boolean;
  justJumped: boolean;
  isSliding: boolean;
  wallTouchTime: number;
  lastWallTouched: "left" | "right" | null;
  jumpTimer: number;
  dashTime: number;
  dashCooldown: number;
  dashSpeed: number;
  isJumping: boolean;
  wallJumpCount: number;
  scene: Phaser.Scene;
}
