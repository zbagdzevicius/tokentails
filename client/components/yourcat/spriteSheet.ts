/**
 * The cat sprite sheet as the DOM reads it (docs/plans/yourcat-polish.md §4.3, §11): 15 columns x 10
 * rows of 48 px cells on a 720 x 480 sheet. The row order and frame counts are the game's
 * (`components/catbassadors/objects/Catbassador.ts`, `animationConfigurations`, one row per entry in
 * that order); `__test__/yourcat-sprite-sheet.test.ts` reads that file and pins this table to it.
 * No Phaser import: this runs on the static `/yourcat` page.
 */

export const SHEET = Object.freeze({ cols: 15, rows: 10, cell: 48, width: 720, height: 480 });

/**
 * The lowest opaque row of the cat's feet inside a 48 px cell, plus one (measured on the starter and
 * base sheets: the content ends at y = 36). A cell drawn at scale `s` stands on a line when its box
 * bottom sits `(SHEET.cell - FEET_Y) * s` px below that line.
 */
export const FEET_Y = 37;

export type SpriteAnim = "sleep" | "dig" | "groom" | "hit" | "idle" | "jump" | "loaf" | "run" | "sit" | "walk";

/** Row, frame count and frame rate per animation (`Catbassador.ts` order; `hit` plays at 12 fps there). */
export const ANIMS: Readonly<Record<SpriteAnim, { row: number; frames: number; fps: number }>> = Object.freeze({
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

/**
 * The CSS `background-position` of `frame` of `anim` with the sheet drawn at `scale` (cell size
 * 48 x scale px). The frame wraps around the animation's frame count; integer scales only keep the
 * pixels even (§1.5).
 */
export function framePosition(anim: SpriteAnim, frame: number, scale: number): string {
  const { row, frames } = ANIMS[anim];
  const index = ((Math.trunc(frame) % frames) + frames) % frames;
  const size = SHEET.cell * scale;
  const x = index * size;
  const y = row * size;
  return `${x === 0 ? 0 : -x}px ${y === 0 ? 0 : -y}px`;
}
