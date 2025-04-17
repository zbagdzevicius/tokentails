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
  controlledObject: ControlledObject & IPlayer
) {
  console.log("Setting up mobile controls...");

  const controls: Controls = {
    jumpButton: document.getElementById("jump"),
    dashButton: document.getElementById("dash"),
    knockbackSpell: document.getElementById("knockback"),
  };

  // Add screen tap detection for jumping
  const handleScreenTap = (e: Event) => {
    console.log("Screen tap detected:", e.type);
    e.preventDefault();
    controlledObject.isMobileJumping = true;
    console.log("Jump activated");

    setTimeout(() => {
      controlledObject.isMobileJumping = false;
      console.log("Jump deactivated");
    }, 100); // Reset jump after a short delay
  };

  // Add screen tap listeners
  startEventListenersKeys.forEach((key) => {
    console.log("Adding listener for:", key);
    document.addEventListener(key, handleScreenTap, { passive: false });
  });

  // Clean up listeners when sprite is destroyed
  controlledObject.sprite.on("destroy", () => {
    console.log("Cleaning up screen tap listeners");
    startEventListenersKeys.forEach((key) => {
      document.removeEventListener(key, handleScreenTap);
    });
  });

  if (
    !controlledObject ||
    !controls.jumpButton ||
    !controls.dashButton ||
    !controls.knockbackSpell
  ) {
    console.log("Some controls not found:", {
      controlledObject: !!controlledObject,
      jumpButton: !!controls.jumpButton,
      dashButton: !!controls.dashButton,
      knockbackSpell: !!controls.knockbackSpell,
    });
    return;
  }

  const addControlListeners = (
    button: HTMLElement,
    onStart: () => void,
    onEnd: () => void
  ): void => {
    const startHandler = (e: Event) => {
      console.log("Button pressed:", button.id);
      e.preventDefault();
      onStart();
    };

    const endHandler = (e: Event) => {
      console.log("Button released:", button.id);
      e.preventDefault();
      onEnd();
    };

    startEventListenersKeys.forEach((key) => {
      console.log("Adding button listener for:", key, "on", button.id);
      button.addEventListener(key, startHandler, { passive: false });
    });
    endEventListenersKeys.forEach((key) => {
      console.log("Adding button listener for:", key, "on", button.id);
      button.addEventListener(key, endHandler, { passive: false });
    });

    controlledObject.sprite.on("destroy", () => {
      console.log("Cleaning up button listeners for:", button.id);
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
      console.log("Joystick direction:", e.detail.direction);
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
      console.log("Jump button pressed");
      controlledObject.isMobileJumping = true;
    },
    () => {
      console.log("Jump button released");
      controlledObject.isMobileJumping = false;
    }
  );

  addControlListeners(
    controls.dashButton,
    () => {
      console.log("Dash button pressed");
      controlledObject.isMobileDash = true;
    },
    () => {
      console.log("Dash button released");
      controlledObject.isMobileDash = false;
    }
  );
  addControlListeners(
    controls.knockbackSpell,
    () => {
      console.log("Knockback spell button pressed");
      controlledObject.isMobileknockbackSpell = true;
    },
    () => {
      console.log("Knockback spell button released");
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
