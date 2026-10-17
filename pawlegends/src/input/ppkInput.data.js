// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/config.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports none: data extracted by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// The INPUT.presets and INPUT.keys blocks of PPK config, as plain data. src/input/presets.ts remaps them to MOBA
// defaults (POC.md §9).
export const PPK_INPUT_PRESETS = Object.freeze({
  "hybrid": {
    "wasd": true,
    "lmbMoves": false,
    "keys": {}
  },
  "moba": {
    "wasd": false,
    "lmbMoves": false,
    "keys": {
      "move": [
        "Mouse2"
      ],
      "guard": [
        "KeyQ",
        "KeyL"
      ],
      "dodge": [
        "Space",
        "KeyK",
        "Mouse3"
      ],
      "jump": [
        "KeyT"
      ],
      "attackMove": [
        "KeyA"
      ],
      "stop": [
        "KeyS",
        "KeyH"
      ],
      "milk": [
        "KeyD",
        "KeyR"
      ]
    }
  },
  "diablo": {
    "wasd": true,
    "lmbMoves": true,
    "keys": {
      "move": [
        "Mouse0"
      ],
      "attack": [
        "KeyJ"
      ],
      "guard": [
        "Mouse2",
        "KeyQ",
        "KeyL"
      ],
      "dodge": [
        "Space",
        "KeyK"
      ],
      "jump": [
        "KeyT"
      ]
    }
  },
  "mouseOnly": {
    "wasd": true,
    "lmbMoves": false,
    "keys": {
      "move": [
        "Mouse2"
      ],
      "guard": [
        "Mouse4",
        "KeyQ",
        "KeyL"
      ],
      "dodge": [
        "Mouse3",
        "KeyK",
        "ShiftLeft",
        "ShiftRight"
      ],
      "jump": [
        "Space",
        "Mouse1"
      ],
      "peek": [
        "KeyZ"
      ],
      "ranges": [
        "KeyZ"
      ]
    }
  },
  "keyboardOnly": {
    "wasd": true,
    "lmbMoves": false,
    "keys": {
      "attack": [
        "KeyJ"
      ],
      "guard": [
        "KeyL",
        "KeyQ"
      ],
      "dodge": [
        "KeyK",
        "ShiftLeft",
        "ShiftRight"
      ],
      "jump": [
        "Space"
      ],
      "peek": [
        "KeyZ"
      ],
      "ranges": [
        "KeyZ"
      ],
      "move": []
    }
  }
});

export const PPK_INPUT_KEYS = Object.freeze({
  "attack": [
    "Mouse0",
    "KeyJ"
  ],
  "guard": [
    "Mouse2",
    "KeyQ",
    "KeyL"
  ],
  "dodge": [
    "ShiftLeft",
    "ShiftRight",
    "KeyK",
    "Mouse3"
  ],
  "jump": [
    "Space"
  ],
  "interact": [
    "KeyE",
    "Enter",
    "NumpadEnter"
  ],
  "confirm": [
    "Enter",
    "NumpadEnter",
    "KeyE"
  ],
  "back": [
    "Escape",
    "Backspace"
  ],
  "lockon": [
    "Tab"
  ],
  "pause": [
    "Escape",
    "KeyP"
  ],
  "ability": [
    "KeyG"
  ],
  "milk": [
    "KeyR"
  ],
  "meow": [
    "KeyC"
  ],
  "golden": [
    "KeyV"
  ],
  "trick": [
    "KeyF"
  ],
  "trick1": [
    "Digit1"
  ],
  "trick2": [
    "Digit2"
  ],
  "trick3": [
    "Digit3"
  ],
  "sprint": [],
  "recenter": [],
  "lockPrev": [],
  "lockNext": [],
  "navUp": [
    "ArrowUp",
    "KeyW"
  ],
  "navDown": [
    "ArrowDown",
    "KeyS"
  ],
  "navLeft": [
    "ArrowLeft",
    "KeyA"
  ],
  "navRight": [
    "ArrowRight",
    "KeyD"
  ],
  "move": [],
  "attackMove": [
    "KeyX"
  ],
  "stop": [
    "KeyH"
  ],
  "zoomIn": [],
  "zoomOut": [],
  "zoomCycle": [],
  "peek": [
    "KeyZ",
    "Mouse1"
  ],
  "camLock": [
    "KeyY"
  ],
  "centre": [
    "Home"
  ],
  "ranges": [
    "KeyZ",
    "Mouse1"
  ],
  "controls": []
});
