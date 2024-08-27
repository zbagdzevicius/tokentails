import { IPlayer } from "../PlayerMovement/IPlayer";

interface ControlledObject {
  isMobileLeft: boolean;
  isMobileRight: boolean;
  isMobileJumping: boolean;
  isMobileDash: boolean;
}

interface Controls {
  leftButton: HTMLElement | null;
  rightButton: HTMLElement | null;
  jumpButton: HTMLElement | null;
  dashButton: HTMLElement | null;
}

const startEventListenersKeys = ["touchstart", "mousedown"];
const endEventListenersKeys = ["touchend", "mouseleave", "mouseup"];

export function setMobileControls(
  controlledObject: ControlledObject & IPlayer
) {
  const controls: Controls = {
    leftButton: document.getElementById("left"),
    rightButton: document.getElementById("right"),
    jumpButton: document.getElementById("jump"),
    dashButton: document.getElementById("dash"),
  };

  if (
    !controlledObject ||
    !controls.leftButton ||
    !controls.rightButton ||
    !controls.jumpButton ||
    !controls.dashButton
  ) {
    // console.error("Controlled object or control buttons not found.");
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
    controls.leftButton,
    () => {
      controlledObject.isMobileLeft = true;
      controlledObject.isMobileRight = false;
    },
    () => {
      controlledObject.isMobileLeft = false;
    }
  );

  addControlListeners(
    controls.rightButton,
    () => {
      controlledObject.isMobileRight = true;
      controlledObject.isMobileLeft = false;
    },
    () => {
      controlledObject.isMobileRight = false;
    }
  );

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
}
