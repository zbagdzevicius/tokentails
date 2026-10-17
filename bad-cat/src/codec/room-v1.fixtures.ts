/**
 * Room codec v1 fixtures, captured Oct 16, 2026 with the v1 encoder/decoder (ROOM_CODE_VERSION 1) before v2 landed.
 * decodeRoom must keep returning exactly `decoded` for each `code` (old shared room links).
 */
import type { RoomDef } from '../types';

export const ROOM_V1_FIXTURES: readonly { name: string; code: string; decoded: RoomDef }[] = [
  {
    "name": "small",
    "code": "EMDAIFxiADqU",
    "decoded": {
      "id": "ugc-9010c410",
      "shell": 0,
      "routine": 1,
      "event": 2,
      "width": 12,
      "depth": 10,
      "spawn": {
        "x": 1,
        "z": 8
      },
      "props": [
        {
          "kind": 1,
          "x": 7,
          "z": 1,
          "level": 2,
          "rot": 0,
          "target": true
        }
      ],
      "seed": 2417017872,
      "ticks": 2250
    }
  },
  {
    "name": "empty",
    "code": "H-XIAJ-1",
    "decoded": {
      "id": "ugc-8534d7d8",
      "shell": 7,
      "routine": 3,
      "event": 3,
      "width": 12,
      "depth": 10,
      "spawn": {
        "x": 11,
        "z": 9
      },
      "props": [],
      "seed": 2234832856,
      "ticks": 2250
    }
  },
  {
    "name": "boss",
    "code": "G87fgEBCCEVgyGoYx8LQQD1FRJhoBcfAoEAORUGoaC7Hw_BAS0VAQOgIT8DIwBjNQtDoPU_EmMAFzUCg6A5PwajALs1D8OhLT8BBQAhVQMloGNfC0UA9VUSZaAXXwKFADlVBqWgu18PxQEtVQEHoCF_AycAY3ULR6D1fxJnABd1AoegOX8GpwC7dQ_HoS1_AQkAIZUDKaBjn0A2E6I-NCRGVLnnnnnnnnnnnmC2J",
    "decoded": {
      "id": "ugc-ca42f971",
      "shell": 5,
      "routine": 3,
      "event": 2,
      "width": 14,
      "depth": 12,
      "spawn": {
        "x": 13,
        "z": 11
      },
      "props": [
        {
          "kind": 1,
          "x": 0,
          "z": 1,
          "level": 0,
          "rot": 0,
          "target": true
        },
        {
          "kind": 2,
          "x": 1,
          "z": 1,
          "level": 1,
          "rot": 1,
          "target": true
        },
        {
          "kind": 3,
          "x": 2,
          "z": 1,
          "level": 2,
          "rot": 2,
          "target": true
        },
        {
          "kind": 6,
          "x": 3,
          "z": 1,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 11,
          "x": 4,
          "z": 1,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 15,
          "x": 5,
          "z": 1,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 18,
          "x": 6,
          "z": 1,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 1,
          "x": 7,
          "z": 1,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 2,
          "x": 8,
          "z": 1,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 3,
          "x": 9,
          "z": 1,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 6,
          "x": 10,
          "z": 1,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 11,
          "x": 11,
          "z": 1,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 15,
          "x": 12,
          "z": 1,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 18,
          "x": 13,
          "z": 1,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 1,
          "x": 0,
          "z": 3,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 2,
          "x": 1,
          "z": 3,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 3,
          "x": 2,
          "z": 3,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 6,
          "x": 3,
          "z": 3,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 11,
          "x": 4,
          "z": 3,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 15,
          "x": 5,
          "z": 3,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 18,
          "x": 6,
          "z": 3,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 1,
          "x": 7,
          "z": 3,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 2,
          "x": 8,
          "z": 3,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 3,
          "x": 9,
          "z": 3,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 6,
          "x": 10,
          "z": 3,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 11,
          "x": 11,
          "z": 3,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 15,
          "x": 12,
          "z": 3,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 18,
          "x": 13,
          "z": 3,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 1,
          "x": 0,
          "z": 5,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 2,
          "x": 1,
          "z": 5,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 3,
          "x": 2,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 6,
          "x": 3,
          "z": 5,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 11,
          "x": 4,
          "z": 5,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 15,
          "x": 5,
          "z": 5,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 18,
          "x": 6,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 1,
          "x": 7,
          "z": 5,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 2,
          "x": 8,
          "z": 5,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 3,
          "x": 9,
          "z": 5,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 6,
          "x": 10,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 11,
          "x": 11,
          "z": 5,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 15,
          "x": 12,
          "z": 5,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 18,
          "x": 13,
          "z": 5,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 1,
          "x": 0,
          "z": 7,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 2,
          "x": 1,
          "z": 7,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 3,
          "x": 2,
          "z": 7,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 6,
          "x": 3,
          "z": 7,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 11,
          "x": 4,
          "z": 7,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 15,
          "x": 5,
          "z": 7,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 18,
          "x": 6,
          "z": 7,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 1,
          "x": 7,
          "z": 7,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 2,
          "x": 8,
          "z": 7,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 3,
          "x": 9,
          "z": 7,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 6,
          "x": 10,
          "z": 7,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 11,
          "x": 11,
          "z": 7,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 15,
          "x": 12,
          "z": 7,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 18,
          "x": 13,
          "z": 7,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 1,
          "x": 0,
          "z": 9,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 2,
          "x": 1,
          "z": 9,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 3,
          "x": 2,
          "z": 9,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 6,
          "x": 3,
          "z": 9,
          "level": 3,
          "rot": 3
        }
      ],
      "seed": 3393386865,
      "ticks": 2700,
      "ancestors": [
        "AbCdEfGhIjKl",
        "zzzzzzzzzzzz"
      ]
    }
  },
  {
    "name": "kitchenV1",
    "code": "ECDD4E3SEQYhTGoRhkCcaBZGgSh4IscCBLA8TwSMzEpMQcE4BFNE4QAqkoItLBkWQJVgLZaBnWQ-lkDRrAXagimoLaHCHhAiIYPmGE0kRS5AAGVw",
    "decoded": {
      "id": "ugc-7b7e9970",
      "shell": 0,
      "routine": 0,
      "event": 1,
      "width": 12,
      "depth": 10,
      "spawn": {
        "x": 1,
        "z": 8
      },
      "props": [
        {
          "kind": 1,
          "x": 3,
          "z": 7,
          "level": 1,
          "rot": 0,
          "target": true
        },
        {
          "kind": 4,
          "x": 4,
          "z": 1,
          "level": 2,
          "rot": 0,
          "target": true
        },
        {
          "kind": 5,
          "x": 3,
          "z": 1,
          "level": 2,
          "rot": 2,
          "target": true
        },
        {
          "kind": 4,
          "x": 6,
          "z": 1,
          "level": 2,
          "rot": 1
        },
        {
          "kind": 2,
          "x": 7,
          "z": 1,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 5,
          "x": 9,
          "z": 1,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 4,
          "x": 10,
          "z": 1,
          "level": 3,
          "rot": 2
        },
        {
          "kind": 8,
          "x": 11,
          "z": 1,
          "level": 3,
          "rot": 0
        },
        {
          "kind": 8,
          "x": 1,
          "z": 2,
          "level": 3,
          "rot": 0
        },
        {
          "kind": 15,
          "x": 1,
          "z": 3,
          "level": 3,
          "rot": 0
        },
        {
          "kind": 18,
          "x": 3,
          "z": 3,
          "level": 0,
          "rot": 3
        },
        {
          "kind": 18,
          "x": 9,
          "z": 3,
          "level": 0,
          "rot": 1
        },
        {
          "kind": 7,
          "x": 0,
          "z": 4,
          "level": 3,
          "rot": 2
        },
        {
          "kind": 1,
          "x": 1,
          "z": 4,
          "level": 3,
          "rot": 1
        },
        {
          "kind": 19,
          "x": 8,
          "z": 4,
          "level": 0,
          "rot": 0
        },
        {
          "kind": 10,
          "x": 10,
          "z": 4,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 8,
          "x": 11,
          "z": 4,
          "level": 2,
          "rot": 3
        },
        {
          "kind": 6,
          "x": 4,
          "z": 5,
          "level": 2,
          "rot": 1
        },
        {
          "kind": 2,
          "x": 5,
          "z": 5,
          "level": 2,
          "rot": 0
        },
        {
          "kind": 11,
          "x": 6,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 6,
          "x": 7,
          "z": 5,
          "level": 2,
          "rot": 1
        },
        {
          "kind": 15,
          "x": 10,
          "z": 5,
          "level": 2,
          "rot": 1
        },
        {
          "kind": 3,
          "x": 4,
          "z": 6,
          "level": 2,
          "rot": 3
        },
        {
          "kind": 1,
          "x": 7,
          "z": 6,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 8,
          "x": 10,
          "z": 6,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 11,
          "x": 6,
          "z": 8,
          "level": 1,
          "rot": 3
        },
        {
          "kind": 8,
          "x": 7,
          "z": 8,
          "level": 1,
          "rot": 0
        },
        {
          "kind": 8,
          "x": 8,
          "z": 8,
          "level": 1,
          "rot": 2
        },
        {
          "kind": 15,
          "x": 9,
          "z": 8,
          "level": 1,
          "rot": 2
        },
        {
          "kind": 19,
          "x": 4,
          "z": 9,
          "level": 0,
          "rot": 1
        },
        {
          "kind": 20,
          "x": 11,
          "z": 9,
          "level": 0,
          "rot": 0
        }
      ],
      "seed": 2071894384,
      "ticks": 2250
    }
  },
  {
    "name": "glass",
    "code": "ECDD4FxiDRogjdoExsHQaB2GgGRgPofB7HgES0CE_EjMxNDMTkzBwTAcU4ShBC6Sgu0kKRbC1WgtloDdbB6WgZ2gKppD2hQt4cIiEAphxS5AALGe",
    "decoded": {
      "id": "ugc-8e527b93",
      "shell": 0,
      "routine": 0,
      "event": 1,
      "width": 12,
      "depth": 10,
      "spawn": {
        "x": 1,
        "z": 8
      },
      "props": [
        {
          "kind": 1,
          "x": 7,
          "z": 1,
          "level": 2,
          "rot": 0,
          "target": true
        },
        {
          "kind": 3,
          "x": 4,
          "z": 6,
          "level": 2,
          "rot": 0,
          "target": true
        },
        {
          "kind": 2,
          "x": 3,
          "z": 7,
          "level": 1,
          "rot": 2,
          "target": true
        },
        {
          "kind": 1,
          "x": 3,
          "z": 1,
          "level": 2,
          "rot": 3
        },
        {
          "kind": 7,
          "x": 4,
          "z": 1,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 7,
          "x": 6,
          "z": 1,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 1,
          "x": 9,
          "z": 1,
          "level": 2,
          "rot": 0
        },
        {
          "kind": 15,
          "x": 10,
          "z": 1,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 7,
          "x": 11,
          "z": 1,
          "level": 3,
          "rot": 2
        },
        {
          "kind": 1,
          "x": 1,
          "z": 2,
          "level": 3,
          "rot": 1
        },
        {
          "kind": 2,
          "x": 1,
          "z": 3,
          "level": 3,
          "rot": 3
        },
        {
          "kind": 18,
          "x": 3,
          "z": 3,
          "level": 0,
          "rot": 3
        },
        {
          "kind": 19,
          "x": 4,
          "z": 3,
          "level": 0,
          "rot": 3
        },
        {
          "kind": 19,
          "x": 9,
          "z": 3,
          "level": 0,
          "rot": 3
        },
        {
          "kind": 7,
          "x": 0,
          "z": 4,
          "level": 3,
          "rot": 0
        },
        {
          "kind": 7,
          "x": 1,
          "z": 4,
          "level": 3,
          "rot": 2
        },
        {
          "kind": 18,
          "x": 8,
          "z": 4,
          "level": 0,
          "rot": 1
        },
        {
          "kind": 11,
          "x": 10,
          "z": 4,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 11,
          "x": 11,
          "z": 4,
          "level": 2,
          "rot": 1
        },
        {
          "kind": 10,
          "x": 4,
          "z": 5,
          "level": 2,
          "rot": 3
        },
        {
          "kind": 11,
          "x": 5,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 11,
          "x": 6,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 3,
          "x": 7,
          "z": 5,
          "level": 2,
          "rot": 3
        },
        {
          "kind": 7,
          "x": 10,
          "z": 5,
          "level": 2,
          "rot": 2
        },
        {
          "kind": 6,
          "x": 7,
          "z": 6,
          "level": 2,
          "rot": 0
        },
        {
          "kind": 10,
          "x": 10,
          "z": 6,
          "level": 2,
          "rot": 1
        },
        {
          "kind": 15,
          "x": 6,
          "z": 8,
          "level": 1,
          "rot": 1
        },
        {
          "kind": 11,
          "x": 7,
          "z": 8,
          "level": 1,
          "rot": 3
        },
        {
          "kind": 8,
          "x": 8,
          "z": 8,
          "level": 1,
          "rot": 0
        },
        {
          "kind": 2,
          "x": 9,
          "z": 8,
          "level": 1,
          "rot": 3
        },
        {
          "kind": 20,
          "x": 11,
          "z": 9,
          "level": 0,
          "rot": 0
        }
      ],
      "seed": 2387770259,
      "ticks": 2250
    }
  }
];
