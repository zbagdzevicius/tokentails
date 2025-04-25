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

  const handleScreenTap = (e: Event) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "BUTTON" ||
      target.tagName === "A" ||
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.closest("button") ||
      target.closest("a") ||
      target.closest("input") ||
      target.closest("div") ||
      target.closest("select")
    ) {
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
    const handler = (e: any) => {
      if (e.detail.direction === "LEFT") {
        controlledObject.isMobileLeft = true;
        controlledObject.isMobileRight = false;
      } else if (e.detail.direction === "RIGHT") {
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
