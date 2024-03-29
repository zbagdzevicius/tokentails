import kaboom from "kaboom";

export const loadControls = (k: ReturnType<typeof kaboom>) => {
  k.loadSprite("left", "/game/controls/left.png");
  k.loadSprite("right", "/game/controls/right.png");
  k.loadSprite("jump", "/game/controls/jump.png");
};

interface IControlsCallback {
  left: () => void;
  leftEnd: () => void;
  right: () => void;
  rightEnd: () => void;
  jump: () => void;
}

export const addControls = (
  k: ReturnType<typeof kaboom>,
  { left, leftEnd, right, rightEnd, jump }: IControlsCallback
) => {
  const leftButton = k.add([
    k.sprite("left"),
    k.pos(10, k.height() - 120),
    k.opacity(0.5),
    k.fixed(),
    k.area(),
  ]);
  const rightButton = k.add([
    k.sprite("right"),
    k.pos(120, k.height() - 120),
    k.opacity(0.5),
    k.fixed(),
    k.area(),
  ]);
  const jumpButton = k.add([
    k.sprite("jump"),
    k.pos(k.width() - 120, k.height() - 120),
    k.opacity(0.5),
    k.fixed(),
    k.area(),
  ]);

  const activeTouches = {
    left: new Set(),
    right: new Set(),
  };

  k.onTouchStart((pos, touch) => {
    if (leftButton.hasPoint(pos)) {
      activeTouches.left.add(touch.identifier);
      leftButton.opacity = 1;
    } else if (rightButton.hasPoint(pos)) {
      activeTouches.right.add(touch.identifier);
      rightButton.opacity = 1;
    } else if (jumpButton.hasPoint(pos)) {
      jump();
    }
  });

  k.onTouchEnd((pos, touch) => {
    if (activeTouches.left.has(touch.identifier)) {
      activeTouches.left.delete(touch.identifier);
      leftButton.opacity = activeTouches.left.size > 0 ? 1 : 0.5;
      leftEnd();
    }
    if (activeTouches.right.has(touch.identifier)) {
      activeTouches.right.delete(touch.identifier);
      rightButton.opacity = activeTouches.right.size > 0 ? 1 : 0.5;
      rightEnd(); 
    }
  });

  k.onUpdate(() => {
    if (activeTouches.left.size > 0) {
      left();
    }
    if (activeTouches.right.size > 0) {
      right();
    }
  });
};
