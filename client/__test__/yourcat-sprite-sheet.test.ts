/**
 * The `/yourcat` sprite sheet table (docs/plans/yourcat-polish.md §4.3, §11, §15): the rows and frame
 * counts of `spriteSheet.ts` are the game's (`Catbassador.ts` `animationConfigurations`, one row per
 * entry, 15 frames per row), and the local starter and base-colour sheets follow that order: each row
 * has exactly that many drawn frames and the paws end above `FEET_Y`. `Catbassador.ts` imports Phaser,
 * so it is read as text.
 */
import { readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { ANIMS, FEET_Y, SHEET, framePosition, type SpriteAnim } from "@/components/yourcat/spriteSheet";

const ROOT = path.join(__dirname, "..");
const CATBASSADOR = readFileSync(path.join(ROOT, "components/catbassadors/objects/Catbassador.ts"), "utf8");

const GAME_NAMES: Record<string, SpriteAnim> = {
  SLEEP: "sleep",
  DIGGING: "dig",
  GROOMING: "groom",
  HIT: "hit",
  IDLE: "idle",
  JUMPING: "jump",
  LOAF: "loaf",
  RUNNING: "run",
  SITTING: "sit",
  WALKING: "walk",
};

function gameTable() {
  const block = CATBASSADOR.slice(CATBASSADOR.indexOf("const animationConfigurations"));
  const body = block.slice(0, block.indexOf("];"));
  const entries = Array.from(body.matchAll(/\{\s*key:\s*PlayerAnimation\.(\w+),\s*frames:\s*(\d+),\s*repeat:\s*(-?\d+),\s*frameRate:\s*(\d+)\s*\}/g));
  return entries.map((match) => ({ key: match[1], frames: Number(match[2]), fps: Number(match[4]) }));
}

describe("ANIMS is pinned to Catbassador.ts", () => {
  const table = gameTable();

  it("reads the game's ten animation rows", () => {
    expect(table.map((entry) => entry.key)).toEqual(Object.keys(GAME_NAMES));
  });

  it("has the same row, frame count and frame rate for every animation", () => {
    table.forEach((entry, row) => {
      const anim = GAME_NAMES[entry.key];
      expect({ anim, ...ANIMS[anim] }).toEqual({ anim, row, frames: entry.frames, fps: entry.fps });
    });
    expect(Object.keys(ANIMS).sort()).toEqual(Object.values(GAME_NAMES).sort());
  });

  it("uses the game's 15-frame row stride and the 720 x 480 sheet of 48 px cells", () => {
    const stride = Number(/const maxAnimationFrames = (\d+);/.exec(CATBASSADOR)?.[1]);
    expect(stride).toBe(SHEET.cols);
    expect(SHEET).toEqual({ cols: 15, rows: 10, cell: 48, width: 720, height: 480 });
    expect(SHEET.cols * SHEET.cell).toBe(SHEET.width);
    expect(SHEET.rows * SHEET.cell).toBe(SHEET.height);
  });

  it("matches the §4.3 table", () => {
    expect(ANIMS).toEqual({
      sleep: { row: 0, frames: 7, fps: 8 },
      dig: { row: 1, frames: 4, fps: 8 },
      groom: { row: 2, frames: 15, fps: 8 },
      hit: { row: 3, frames: 7, fps: 12 },
      idle: { row: 4, frames: 12, fps: 8 },
      jump: { row: 5, frames: 7, fps: 8 },
      loaf: { row: 6, frames: 9, fps: 8 },
      run: { row: 7, frames: 4, fps: 8 },
      sit: { row: 8, frames: 5, fps: 8 },
      walk: { row: 9, frames: 8, fps: 8 },
    });
  });
});

describe("framePosition", () => {
  it("offsets by whole cells at the given scale", () => {
    expect(framePosition("sleep", 0, 3)).toBe("0px 0px");
    expect(framePosition("idle", 0, 3)).toBe("0px -576px");
    expect(framePosition("idle", 2, 4)).toBe("-384px -768px");
    expect(framePosition("walk", 3, 6)).toBe("-864px -2592px");
    expect(framePosition("jump", 3, 1)).toBe("-144px -240px");
  });

  it("wraps the frame around the animation's length", () => {
    expect(framePosition("sit", 5, 2)).toBe(framePosition("sit", 0, 2));
    expect(framePosition("sit", -1, 2)).toBe(framePosition("sit", 4, 2));
    expect(framePosition("loaf", 10, 1)).toBe(framePosition("loaf", 1, 1));
  });
});

/** The local sheets: the four base colours, a hat variant and the starter sheet (CDN families are spot-checked in e2e). */
const LOCAL_SHEETS = [
  "public/cats/yellow/sprites/original.png",
  "public/cats/grey/sprites/original.png",
  "public/cats/pinkie/sprites/original.png",
  "public/cats/siamese/sprites/original.png",
  "public/cats/black/sprites/hat-wizard-blue.png",
  "public/cats/starters/scout/sheet.png",
];

describe("local sheets follow the row order", () => {
  it.each(LOCAL_SHEETS)("%s", async (file) => {
    const { data, info } = await sharp(path.join(ROOT, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([SHEET.width, SHEET.height]);
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    for (const anim of Object.keys(ANIMS) as SpriteAnim[]) {
      const { row, frames } = ANIMS[anim];
      let drawn = 0;
      let lowest = -1;
      for (let frame = 0; frame < SHEET.cols; frame += 1) {
        let any = false;
        for (let y = 0; y < SHEET.cell; y += 1) {
          for (let x = 0; x < SHEET.cell; x += 1) {
            if (alpha(frame * SHEET.cell + x, row * SHEET.cell + y) > 0) {
              any = true;
              lowest = Math.max(lowest, y);
            }
          }
        }
        if (any) drawn = frame + 1;
      }
      expect({ anim, drawn }).toEqual({ anim, drawn: frames });
      // The paws end on or above the stone line PetCat puts at FEET_Y.
      expect(lowest).toBeLessThan(FEET_Y + 1);
    }
  });
});
