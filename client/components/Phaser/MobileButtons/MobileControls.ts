import { isGameSuspended } from "@/lib/game/gameRegistry";
import { isRunSurfaceTap } from "../onboarding/run-gate";
import { IPlayer } from "../PlayerMovement/IPlayer";

interface ControlledObject {
  isMobileLeft: boolean;
  isMobileRight: boolean;
  isMobileJumping: boolean;
  isMobileDash: boolean;
  isMobileknockbackSpell: boolean;
}

interface Controls {
  jumpButton: HTMLElement | null;
  dashButton: HTMLElement | null;
  knockbackSpell: HTMLElement | null;
}

interface JumpControlledObject {
  isMobileJumping: boolean;
}

const startEventListenersKeys = ["touchstart", "mousedown"];
const endEventListenersKeys = ["touchend", "mouseleave", "mouseup"];

export function setMobileControls(
  controlledObject: ControlledObject & IPlayer,
  enableTapScreen?: boolean
) {
  const controls: Controls = {
    jumpButton: document.getElementById("jump"),
    dashButton: document.getElementById("dash"),
    knockbackSpell: document.getElementById("knockback"),
  };

  // G10 labelled fix (known bug, MobileControls.ts:44): this used to bail on `closest("div")`,
  // which matches almost every element on the page, so a tap outside the canvas never jumped.
  // It now jumps only for taps on the run's own surface (#game-container, `[data-run-surface]`)
  // that are not controls and not the canvas itself, whose taps the scene's own pointer handlers
  // already turn into a jump (handling them twice would cut a held flight short after 100 ms).
  // While a modal suspends the game nothing jumps and nothing is `preventDefault`ed, so a tap on
  // a backdrop or a toast closes or scrolls it as usual (5a review #5).
  const handleScreenTap = (e: Event) => {
    if (isGameSuspended() || !isRunSurfaceTap(e.target)) {
      return;
    }

    e.preventDefault();
    controlledObject.isMobileJumping = true;

    setTimeout(() => {
      controlledObject.isMobileJumping = false;
    }, 100); // Reset jump after a short delay
  };

  if (enableTapScreen) {
    // Add screen tap listeners
    startEventListenersKeys.forEach((key) => {
      document.addEventListener(key, handleScreenTap, { passive: false });
    });

    // Clean up listeners when sprite is destroyed
    controlledObject.sprite.on("destroy", () => {
      startEventListenersKeys.forEach((key) => {
        document.removeEventListener(key, handleScreenTap);
      });
    });
  }

  if (
    !controlledObject ||
    !controls.jumpButton ||
    !controls.dashButton ||
    !controls.knockbackSpell
  ) {
    return;
  }

  const addControlListeners = (
    button: HTMLElement,
    onStart: () => void,
    onEnd: () => void
  ): void => {
    const startHandler = (e: Event) => {
      e.preventDefault();
      onStart();
    };

    const endHandler = (e: Event) => {
      e.preventDefault();
      onEnd();
    };

    startEventListenersKeys.forEach((key) => {
      button.addEventListener(key, startHandler, { passive: false });
    });
    endEventListenersKeys.forEach((key) => {
      button.addEventListener(key, endHandler, { passive: false });
    });

    controlledObject.sprite.on("destroy", () => {
      startEventListenersKeys.forEach((key) =>
        button.removeEventListener(key, startHandler)
      );
      endEventListenersKeys.forEach((key) =>
        button.removeEventListener(key, endHandler)
      );
    });
  };

  const addMovementListener = () => {
    const handler = (e: Event) => {
      const { detail } = e as CustomEvent<{ direction?: string }>;
      if (detail.direction === "LEFT") {
        controlledObject.isMobileLeft = true;
        controlledObject.isMobileRight = false;
      } else if (detail.direction === "RIGHT") {
        controlledObject.isMobileLeft = false;
        controlledObject.isMobileRight = true;
      } else {
        controlledObject.isMobileLeft = false;
        controlledObject.isMobileRight = false;
      }

      e.preventDefault();
    };
    window.addEventListener("joystick-direction", handler);

    controlledObject.sprite.on("destroy", () => {
      window.removeEventListener("joystick-direction", handler);
    });
  };

  addMovementListener();

  addControlListeners(
    controls.jumpButton,
    () => {
      controlledObject.isMobileJumping = true;
    },
    () => {
      controlledObject.isMobileJumping = false;
    }
  );

  addControlListeners(
    controls.dashButton,
    () => {
      controlledObject.isMobileDash = true;
    },
    () => {
      controlledObject.isMobileDash = false;
    }
  );
  addControlListeners(
    controls.knockbackSpell,
    () => {
      controlledObject.isMobileknockbackSpell = true;
    },
    () => {
      controlledObject.isMobileknockbackSpell = false;
    }
  );
}

export function setMobileJumpControl(
  controlledObject: JumpControlledObject & IPlayer
) {
  const jumpButton = document.getElementById("jump");

  if (!controlledObject || !jumpButton) {
    return;
  }

  const addControlListeners = (
    button: HTMLElement,
    onStart: () => void,
    onEnd: () => void
  ): void => {
    const startHandler = (e: Event) => {
      e.preventDefault();
      onStart();
    };

    const endHandler = (e: Event) => {
      e.preventDefault();
      onEnd();
    };

    startEventListenersKeys.forEach((key) =>
      button.addEventListener(key, startHandler)
    );
    endEventListenersKeys.forEach((key) =>
      button.addEventListener(key, endHandler)
    );

    controlledObject.sprite.on("destroy", () => {
      startEventListenersKeys.forEach((key) =>
        button.removeEventListener(key, startHandler)
      );
      endEventListenersKeys.forEach((key) =>
        button.removeEventListener(key, endHandler)
      );
    });
  };

  addControlListeners(
    jumpButton,
    () => {
      controlledObject.isMobileJumping = true;
    },
    () => {
      controlledObject.isMobileJumping = false;
    }
  );
}
