/**
 * Share card layout, "the gallery print" (docs/plans/yourcat-polish.md §9.2) as a still of the stage
 * (R1-05) with the meeting below the portrait (R2-07): every rect but the background foot plate and
 * ground fill inside the safe area (the leaning shelter frame by its rotated bounds), the avatar at an
 * integer 672/576, a ground line under the portrait (the foot plate's horizon) where the 8x/6x sprite
 * and the shelter cat's 2:3 cream frame (leaning -4°) stand, nothing of the scene over the portrait,
 * one heart above the gap between the heads, the uppercase title below the scene, the logo at 337/600,
 * long names shrink then fall back then ellipsise, and no panel rects without a shelter cat.
 */
import {
  BEVEL_UNITS,
  cardLayout,
  FOOT_GROUND,
  FRAME_SCALE,
  insideRect,
  LOGO_ASPECT,
  NAME_MIN,
  NAME_START,
  PANEL_ANGLE,
  rotatedBounds,
  SPRITE_FEET_Y,
  WALK_VISIBLE,
  type CardFormat,
  type CardLayout,
  type CardText,
  type Rect,
} from "@/components/yourcat/cardLayout";
import { cardFileName } from "@/components/yourcat/shareCard";

/** A fake measure: every character is 0.8 x the font size wide. */
const measure = (text: string, size: number) => Array.from(text).length * size * 0.8;

const PANEL = { name: "Zare" };
function text(patch: Partial<CardText> = {}): CardText {
  return {
    wordmark: "TOKEN TAILS",
    link: "tokentails.com/yourcat",
    nameLine: "Mochi & Zare",
    nameFallback: "Mochi",
    subline: "Zare · a real cat at Pink Paw",
    panel: PANEL,
    ...patch,
  };
}
const solo = (patch: Partial<CardText> = {}) => text({ nameLine: "Mochi", subline: "Now a pixel cat in Token Tails", panel: null, ...patch });

function rects(layout: CardLayout): Array<[string, Rect]> {
  const out: Array<[string, Rect]> = [
    ["logo", layout.logo],
    ["wordmark", layout.wordmark],
    ["avatar", layout.avatar],
    ["frame", layout.frame],
    ["spriteBody", layout.spriteBody],
    ["shadow", layout.shadow],
    ["stand", layout.stand],
    ["name", layout.name],
    ["subline", layout.subline],
    ["link", layout.link],
  ];
  if (layout.panel) out.push(["panel", layout.panel]);
  if (layout.panelImage) out.push(["panelImage", layout.panelImage]);
  if (layout.roundel) out.push(["roundel", layout.roundel]);
  if (layout.panelBounds) out.push(["panelBounds", layout.panelBounds]);
  if (layout.heart) out.push(["heart", layout.heart]);
  return out;
}

const FORMATS: CardFormat[] = ["story", "post"];
/** Every combination the card draws: meeting, solo, and the shelter frame alone (no avatar). */
const VARIANTS = [
  { t: text(), standing: true },
  { t: solo(), standing: true },
  { t: text(), standing: false },
  { t: solo(), standing: false },
];
const bottom = (r: Rect) => r.y + r.h;
const right = (r: Rect) => r.x + r.w;

describe("card layout", () => {
  it.each(FORMATS)("%s: every rect sits inside the safe area, in every variant", (format) => {
    for (const { t, standing } of VARIANTS) {
      const layout = cardLayout({ format, text: t, standing }, measure);
      for (const [label, rect] of rects(layout)) {
        expect({ label, standing, inside: insideRect(rect, layout.safe) }).toEqual({ label, standing, inside: true });
      }
      expect(insideRect(layout.safe, { x: 0, y: 0, w: layout.width, h: layout.height })).toBe(true);
    }
  });

  it("has the two sizes", () => {
    expect(cardLayout({ format: "story", text: solo() }, measure)).toMatchObject({ width: 1080, height: 1920 });
    expect(cardLayout({ format: "post", text: solo() }, measure)).toMatchObject({ width: 1080, height: 1350 });
  });

  it("the avatar is an integer multiple of 96: 672 on the story, 576 on the post, centred", () => {
    for (const t of [text(), solo()]) {
      const story = cardLayout({ format: "story", text: t }, measure);
      expect(story.avatar).toMatchObject({ w: 672, h: 672, x: 204, y: 410 });
      const post = cardLayout({ format: "post", text: t }, measure);
      expect(post.avatar).toMatchObject({ w: 576, h: 576, x: 252, y: 222 });
      for (const l of [story, post]) {
        expect(Number.isInteger(l.avatar.x) && Number.isInteger(l.avatar.y)).toBe(true);
        expect(l.avatar.w % 96).toBe(0);
        // The bevel at scale 2 grows it by 20 on every side.
        expect(l.frame).toEqual({ x: l.avatar.x - 20, y: l.avatar.y - 20, w: l.avatar.w + 40, h: l.avatar.h + 40 });
        expect(BEVEL_UNITS * FRAME_SCALE).toBe(20);
        // The frame starts just under the logo.
        expect(l.frame.y).toBeGreaterThanOrEqual(bottom(l.logo));
        expect(l.frame.y - bottom(l.logo)).toBeLessThanOrEqual(24);
      }
    }
  });

  it.each(FORMATS)("%s: the logo keeps the lockup's 337/600 aspect and sits centred at the top", (format) => {
    const l = cardLayout({ format, text: text() }, measure);
    expect(Math.abs(l.logo.h - l.logo.w * LOGO_ASPECT)).toBeLessThanOrEqual(0.5);
    expect(l.logo.x * 2 + l.logo.w).toBe(l.width);
    expect(l.logo.w).toBe(format === "story" ? 260 : 220);
    // The text fallback stays inside the logo box.
    expect(insideRect(l.wordmark, l.logo)).toBe(true);
  });

  it.each([
    ["story", 1392],
    ["post", 1034],
  ] as const)("%s: the ground line (y %i) is under the portrait with a whole sprite cell of room", (format, ground) => {
    for (const { t, standing } of VARIANTS) {
      const l = cardLayout({ format, text: t, standing }, measure);
      expect(l.ground).toBe(ground);
      // The whole cell (hat room included) fits between the frame's bottom edge and the ground.
      expect(l.ground - bottom(l.frame)).toBeGreaterThanOrEqual(SPRITE_FEET_Y * l.spriteScale);
    }
  });

  it.each(FORMATS)("%s: the sprite is 8x/6x with its feet on the ground line, outside the portrait", (format) => {
    for (const t of [text(), solo()]) {
      const l = cardLayout({ format, text: t }, measure);
      const scale = format === "story" ? 8 : 6;
      expect(l.spriteScale).toBe(scale);
      expect(l.sprite.w).toBe(48 * scale);
      expect(l.sprite.w).toBe(format === "story" ? 384 : 288);
      expect(l.sprite.y + SPRITE_FEET_Y * scale).toBe(l.ground);
      // Never over the portrait: the whole cell starts below the frame.
      expect(l.sprite.y).toBeGreaterThanOrEqual(bottom(l.frame));
      // The shadow sits under the feet, on the ground.
      expect(l.shadow.y).toBeLessThanOrEqual(l.ground);
      expect(bottom(l.shadow)).toBeGreaterThan(l.ground);
    }
  });

  it.each(FORMATS)("%s: solo, the cat stands alone at the centre, facing right", (format) => {
    const l = cardLayout({ format, text: solo() }, measure);
    expect(l.spriteMirror).toBe(false);
    const visibleLeft = l.sprite.x + WALK_VISIBLE.left * l.spriteScale;
    const visibleRight = l.sprite.x + WALK_VISIBLE.right * l.spriteScale;
    expect(Math.abs(visibleLeft + visibleRight - l.width)).toBeLessThanOrEqual(1);
  });

  it.each([
    ["story", 184, 268],
    ["post", 136, 196],
  ] as const)("%s: the shelter cat's cream frame (%i x %i) stands on the ground left of the cat, leaning -4°", (format, w, h) => {
    const l = cardLayout({ format, text: text() }, measure);
    const art = l.panelImage as Rect;
    const frame = l.panel as Rect;
    expect(art.w * 3).toBe(art.h * 2);
    expect(frame).toEqual({ x: art.x - 8, y: art.y - 8, w: art.w + 16, h: art.h + 16 });
    expect({ w: frame.w, h: frame.h }).toEqual({ w, h });
    expect(bottom(frame)).toBe(l.ground);
    expect(l.panelAngle).toBe(-4);
    expect(PANEL_ANGLE).toBe(-4);
    expect(l.panelPivot).toEqual({ x: frame.x + frame.w / 2, y: l.ground });
    // The cat faces it.
    expect(l.spriteMirror).toBe(true);
    // The roundel overlaps the cream frame's bottom-right corner.
    const roundel = l.roundel as Rect;
    expect(roundel.w).toBe(roundel.h);
    expect(roundel.x).toBeLessThan(right(frame));
    expect(right(roundel)).toBeGreaterThan(right(frame));
    expect(roundel.y).toBeLessThan(bottom(frame));
    // The rotated bounds hold the whole leaning frame, stay below the portrait and clear of the cat.
    const bounds = l.panelBounds as Rect;
    expect(insideRect(frame, { x: bounds.x - 40, y: bounds.y - 40, w: bounds.w + 80, h: bounds.h + 80 })).toBe(true);
    expect(bounds.x).toBeLessThan(frame.x);
    expect(bounds.y).toBeGreaterThanOrEqual(bottom(l.frame));
    expect(right(bounds)).toBeLessThan(l.spriteBody.x);
    // The pair is centred under the portrait: the frame's left edge and the cat's right edge mirror.
    const catRight = l.sprite.x + (48 - WALK_VISIBLE.left) * l.spriteScale;
    expect(Math.abs(frame.x + catRight - l.width)).toBeLessThanOrEqual(1);
  });

  it.each(FORMATS)("%s: without an avatar the shelter frame stands alone, centred, and there is no heart", (format) => {
    const l = cardLayout({ format, text: text(), standing: false }, measure);
    const frame = l.panel as Rect;
    expect(Math.abs(frame.x * 2 + frame.w - l.width)).toBeLessThanOrEqual(1);
    expect(bottom(frame)).toBe(l.ground);
    expect(l.heart).toBeNull();
    expect(l.spriteMirror).toBe(false);
    // The sprite then sits in the portrait box at 12x / 10x.
    expect(l.stand.w).toBe(48 * (format === "story" ? 12 : 10));
    expect(insideRect(l.stand, l.avatar)).toBe(true);
  });

  it.each(FORMATS)("%s: one 6x6 pixel heart floats above the gap between the two heads, never over the portrait", (format) => {
    const l = cardLayout({ format, text: text() }, measure);
    const heart = l.heart as Rect;
    const bounds = l.panelBounds as Rect;
    expect(heart.w).toBe(6 * l.heartUnit);
    expect(heart.h).toBe(heart.w);
    // In the gap: right of the leaning frame, left of the cat's visible body.
    const catLeft = l.sprite.x + (48 - WALK_VISIBLE.right) * l.spriteScale;
    expect(heart.x).toBeGreaterThan(right(bounds));
    expect(right(heart)).toBeLessThan(catLeft);
    // Above the cat's head top, under the portrait.
    const headTop = l.ground - (SPRITE_FEET_Y - WALK_VISIBLE.top) * l.spriteScale;
    expect(heart.y).toBeLessThan(headTop);
    expect(heart.y).toBeGreaterThan(bottom(l.frame));
    expect(bottom(heart)).toBeLessThan(l.ground);
  });

  it("rotatedBounds turns rects around a pivot", () => {
    const r = { x: 0, y: -100, w: 100, h: 100 };
    expect(rotatedBounds([r], 0, { x: 50, y: 0 })).toEqual(r);
    const quarter = rotatedBounds([r], 90, { x: 50, y: 0 });
    expect(quarter).toEqual({ x: 50, y: -50, w: 100, h: 100 });
    const lean = rotatedBounds([r], -4, { x: 50, y: 0 });
    // Tipping left: the top-left corner moves left past the frame's own left edge.
    expect(lean.x).toBeLessThan(0);
    expect(lean.w).toBeGreaterThan(100);
  });

  it.each(FORMATS)("%s: the foot plate's horizon is the ground line, and a night fill runs to the bottom edge", (format) => {
    for (const t of [text(), solo()]) {
      const l = cardLayout({ format, text: t }, measure);
      expect(Math.abs(l.foot.y + l.foot.h * FOOT_GROUND - l.ground)).toBeLessThanOrEqual(1);
      expect(l.foot.w).toBeGreaterThanOrEqual(l.width);
      expect(l.foot.x * 2 + l.foot.w).toBe(l.width);
      // The fill tucks under the plate's bottom edge and reaches the card's.
      expect(l.groundFill.y).toBeLessThan(bottom(l.foot));
      expect(bottom(l.groundFill)).toBe(l.height);
      expect(l.groundFill).toMatchObject({ x: 0, w: l.width });
    }
    expect(cardLayout({ format: "story", text: text() }, measure).foot).toEqual({ x: -91, y: 1187, w: 1262, h: 352 });
    expect(cardLayout({ format: "post", text: solo() }, measure).foot.y).toBe(829);
  });

  it.each(FORMATS)("%s: the portrait and the title stay put with and without the shelter cat; the title is under the scene", (format) => {
    const panel = cardLayout({ format, text: text() }, measure);
    const plain = cardLayout({ format, text: solo() }, measure);
    for (const key of ["avatar", "frame", "subline", "link", "foot", "groundFill"] as const) {
      expect({ key, rect: plain[key] }).toEqual({ key, rect: panel[key] });
    }
    expect(plain.ground).toBe(panel.ground);
    expect(plain.name.baseline).toBe(panel.name.baseline);
    for (const l of [panel, plain]) {
      expect(l.name.y).toBeGreaterThanOrEqual(l.ground);
      expect(l.name.y).toBeGreaterThanOrEqual(bottom(l.shadow));
      if (l.panelBounds) expect(l.name.y).toBeGreaterThanOrEqual(bottom(l.panelBounds));
      // Title, subline and link stack without overlapping.
      expect(l.subline.y).toBeGreaterThanOrEqual(bottom(l.name));
      expect(l.link.y).toBeGreaterThanOrEqual(bottom(l.subline));
    }
  });

  it("pins the story and post text baselines", () => {
    const story = cardLayout({ format: "story", text: solo() }, measure);
    expect([story.name.baseline, story.subline.baseline, story.link.baseline]).toEqual([1500, 1560, 1660]);
    const post = cardLayout({ format: "post", text: solo() }, measure);
    expect([post.name.baseline, post.subline.baseline, post.link.baseline]).toEqual([1128, 1178, 1255]);
  });

  it.each(FORMATS)("%s: the title is uppercase; a long one shrinks in 4 px steps, then falls back to the name, then ellipsises", (format) => {
    const short = cardLayout({ format, text: solo({ nameLine: "Mo", nameFallback: "Mo" }) }, measure);
    expect(short.name.size).toBe(NAME_START[format]);
    expect(short.name.text).toBe("MO");
    expect(cardLayout({ format, text: text() }, measure).name.text).toBe("MOCHI & ZARE");
    const medium = cardLayout({ format, text: solo({ nameLine: "Bartholomew Jr", nameFallback: "Bartholomew Jr" }) }, measure);
    expect(medium.name.size).toBeLessThan(NAME_START[format]);
    expect((NAME_START[format] - medium.name.size) % 4).toBe(0);
    expect(measure(medium.name.text, medium.name.size)).toBeLessThanOrEqual(920);
    // "Bartholomew Jrr & Zare" at 0.8 x 56 > 920 even at the minimum: the name alone.
    const pair = cardLayout({ format, text: text({ nameLine: "Bartholomew Jrr & Zare", nameFallback: "Bartholomew Jrr" }) }, measure);
    expect(pair.name.text).toBe("BARTHOLOMEW JRR");
    // Wide glyphs (1 x the size each): 20 of them do not fit even at the minimum.
    const wide = (line: string, size: number) => Array.from(line).length * size;
    const long = cardLayout({ format, text: solo({ nameLine: "WWWWWWWWWWWWWWWWWWWW", nameFallback: "WWWWWWWWWWWWWWWWWWWW" }) }, wide);
    expect(long.name.size).toBe(NAME_MIN[format]);
    expect(long.name.text.endsWith("…")).toBe(true);
    expect(wide(long.name.text, long.name.size)).toBeLessThanOrEqual(920);
  });

  it("without a panel there are no panel rects and no heart", () => {
    const plain = cardLayout({ format: "story", text: solo() }, measure);
    expect(plain.panel).toBeNull();
    expect(plain.panelImage).toBeNull();
    expect(plain.roundel).toBeNull();
    expect(plain.panelPivot).toBeNull();
    expect(plain.panelBounds).toBeNull();
    expect(plain.heart).toBeNull();
    const withPanel = cardLayout({ format: "story", text: text() }, measure);
    expect(withPanel.panelImage).toEqual({ x: 286, y: 1132, w: 168, h: 252 });
  });

  it("names the file tokentails-{slug}-{format}.png", () => {
    expect(cardFileName("Mochi Bun", "story")).toBe("tokentails-mochi-bun-story.png");
    expect(cardFileName("Žemė", "post")).toBe("tokentails-zeme-post.png");
    expect(cardFileName("!!!", "post")).toBe("tokentails-cat-post.png");
  });
});
