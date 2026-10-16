/**
 * The share card on a fake 2D context (docs/plans/yourcat-polish.md §9, §14.1; R1-05 "a still of the
 * stage"; R2-07 the meeting below the portrait): the shelter art is drawn at 2:3 with smoothing on
 * inside a cream frame leaning at -4° on the ground line, the avatar at 672 (story) / 576 (post) with
 * smoothing off, the sprite from walk row 9 frame 3 at 8x/6x with smoothing off, facing the shelter
 * cat, below the portrait, one pink pixel heart above the gap between them, the uppercase title with a
 * cream glow and one line (no NEW FRIEND block, no shelter-share claim), the nebula cover-cropped from
 * x 0.15, the logo at 337/600 with the text wordmark as the fallback, a failed shelter image draws the
 * card solo, and the file uses tokens only.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { CardText } from "@/components/yourcat/cardLayout";
import { cardText } from "@/components/yourcat/copy";
import {
  BACKGROUND_CROP_X,
  drawFrame,
  drawShareCard,
  frameWidth,
  NAME_GLOW,
  tokenRgba,
  type CardImages,
  type ShareCardInput,
} from "@/components/yourcat/shareCard";
import { GOLD, INK, NIGHT, STATES } from "@/design/tokens";

interface DrawCall {
  image: FakeImage;
  args: number[];
  smoothing: boolean;
  quality: string;
}

interface FakeImage {
  tag: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

const img = (tag: string, width: number, height: number): FakeImage => ({ tag, width, height, naturalWidth: width, naturalHeight: height });

function fakeCanvas() {
  const draws: DrawCall[] = [];
  const texts: Array<{ text: string; font: string; fill: string; shadowColor: string; shadowBlur: number }> = [];
  const fills: Array<{ fill: string; rect: number[]; alpha: number }> = [];
  const rotations: number[] = [];
  const scales: Array<[number, number]> = [];
  const saved: Array<{ shadowColor: string; shadowBlur: number }> = [];
  const ctx = {
    // The fake context's own state, not a font choice.
    // eslint-disable-next-line tt/no-raw-font
    font: "",
    fillStyle: "" as string,
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    textAlign: "left",
    textBaseline: "alphabetic",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    shadowColor: "transparent",
    shadowBlur: 0,
    measureText: (text: string) => ({ width: Array.from(text).length * (parseInt(/(\d+)px/.exec(ctx.font)?.[1] ?? "10", 10) * 0.5) }),
    drawImage: (image: FakeImage, ...args: number[]) =>
      draws.push({ image, args, smoothing: ctx.imageSmoothingEnabled, quality: ctx.imageSmoothingQuality }),
    fillText: (text: string) =>
      // eslint-disable-next-line tt/no-raw-font
      texts.push({ text, font: ctx.font, fill: ctx.fillStyle, shadowColor: ctx.shadowColor, shadowBlur: ctx.shadowBlur }),
    fillRect: (...rect: number[]) => fills.push({ fill: ctx.fillStyle, rect, alpha: ctx.globalAlpha }),
    strokeRect: () => undefined,
    clearRect: () => undefined,
    save: () => saved.push({ shadowColor: ctx.shadowColor, shadowBlur: ctx.shadowBlur }),
    restore: () => Object.assign(ctx, saved.pop() ?? {}),
    translate: () => undefined,
    rotate: (angle: number) => rotations.push(angle),
    scale: (x: number, y: number) => scales.push([x, y]),
    beginPath: () => undefined,
    ellipse: () => undefined,
    moveTo: () => undefined,
    fill: () => undefined,
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ctx, draws, texts, fills, rotations, scales };
}

const PANEL_TEXT: CardText = {
  wordmark: "TOKEN TAILS",
  link: "tokentails.com/yourcat",
  nameLine: "Mochi & Zare",
  nameFallback: "Mochi",
  subline: "Zare · a real cat at Pink Paw",
  panel: { name: "Zare" },
};
const SOLO_TEXT: CardText = { ...PANEL_TEXT, nameLine: "Mochi", subline: "Now a pixel cat in Token Tails", panel: null };

function images(patch: Partial<Record<keyof CardImages, FakeImage | null>> = {}): CardImages {
  return {
    avatar: img("avatar", 96, 96),
    sprite: img("sprite", 720, 480),
    shelter: img("shelter", 216, 322),
    background: img("background", 2752, 1536),
    foot: img("foot", 1376, 384),
    logo: img("logo", 600, 337),
    roundel: img("roundel", 400, 400),
    ...patch,
  } as unknown as CardImages;
}

const input = (format: "story" | "post", text: CardText = PANEL_TEXT): ShareCardInput => ({
  format,
  text,
  soloText: SOLO_TEXT,
  avatarUrl: "https://cdn.test/avatar.png",
  spriteImg: "https://cdn.test/sprite.png",
  shelterImage: "/yourcat/pink-paw/zare-card.webp",
  seed: "64e2e0000000000000000c01",
});

const dest = (call: DrawCall) => {
  const a = call.args;
  return a.length === 8 ? { x: a[4], y: a[5], w: a[6], h: a[7] } : { x: a[0], y: a[1], w: a[2], h: a[3] };
};
const drawsOf = (draws: DrawCall[], tag: string) => draws.filter((d) => d.image.tag === tag);

describe("share card drawing", () => {
  it.each([
    ["story", 672],
    ["post", 576],
  ] as const)("%s: avatar at %i px nearest-neighbour, shelter art 2:3 smooth, logo at 337/600", (format, side) => {
    const { canvas, draws } = fakeCanvas();
    const layout = drawShareCard(canvas, input(format), images());
    expect(canvas.width).toBe(1080);

    const [avatar] = drawsOf(draws, "avatar");
    expect(dest(avatar)).toMatchObject({ w: side, h: side });
    expect(avatar.smoothing).toBe(false);

    const [shelter] = drawsOf(draws, "shelter");
    const s = dest(shelter);
    expect(s.w * 3).toBe(s.h * 2);
    expect(shelter.smoothing).toBe(true);
    expect(shelter.quality).toBe("high");
    // The source is a centre crop to 2:3, never the squashed full image.
    expect(shelter.args[2] / shelter.args[3]).toBeCloseTo(2 / 3, 5);

    const [logo] = drawsOf(draws, "logo");
    const l = dest(logo);
    expect(Math.abs(l.h / l.w - 337 / 600)).toBeLessThan(0.003);
    expect(logo.smoothing).toBe(true);

    const [roundel] = drawsOf(draws, "roundel");
    expect(dest(roundel)).toEqual(layout.roundel);
  });

  it.each(["story", "post"] as const)("%s: the sprite is walk row 9 frame 3, nearest-neighbour, at 8x/6x, facing the shelter cat", (format) => {
    const { canvas, draws, scales } = fakeCanvas();
    drawShareCard(canvas, input(format), images());
    const [sprite] = drawsOf(draws, "sprite");
    expect(sprite.args.slice(0, 4)).toEqual([3 * 48, 9 * 48, 48, 48]);
    expect(dest(sprite).w).toBe(48 * (format === "story" ? 8 : 6));
    expect(sprite.smoothing).toBe(false);
    // Mirrored (the walk row faces right; the shelter cat is on the left).
    expect(scales).toContainEqual([-1, 1]);
    // Solo, nothing to face: drawn as it is.
    const solo = fakeCanvas();
    drawShareCard(solo.canvas, input(format, SOLO_TEXT), images());
    expect(solo.scales).not.toContainEqual([-1, 1]);
    expect(dest(drawsOf(solo.draws, "sprite")[0]).w).toBe(48 * (format === "story" ? 8 : 6));
  });

  it.each(["story", "post"] as const)("%s: the shelter frame leans at -4° and one pink pixel heart sits between the cats", (format) => {
    const { canvas, fills, rotations } = fakeCanvas();
    const layout = drawShareCard(canvas, input(format), images());
    expect(rotations).toHaveLength(1);
    expect(rotations[0]).toBeCloseTo((-4 * Math.PI) / 180, 10);
    const pink = fills.filter((f) => f.fill === STATES.pink);
    // The 8 rects of PetCat's PixelHeart, inside the layout's heart box.
    expect(pink).toHaveLength(8);
    const heart = layout.heart!;
    for (const f of pink) {
      const [x, y, w, h] = f.rect;
      expect(x >= heart.x && y >= heart.y && x + w <= heart.x + heart.w && y + h <= heart.y + heart.h).toBe(true);
    }
    // Solo, or without an avatar (no standing cat): no lean and no heart.
    for (const [t, patch] of [
      [SOLO_TEXT, {}],
      [PANEL_TEXT, { avatar: null }],
    ] as const) {
      const other = fakeCanvas();
      drawShareCard(other.canvas, input(format, t), images(patch));
      expect(other.fills.some((f) => f.fill === STATES.pink)).toBe(false);
      if (t === SOLO_TEXT) expect(other.rotations).toHaveLength(0);
    }
  });

  it("without an avatar draws sprite frame 0 once, at 12x (story) / 10x (post), and no walking sprite", () => {
    for (const [format, scale] of [
      ["story", 12],
      ["post", 10],
    ] as const) {
      const { canvas, draws } = fakeCanvas();
      drawShareCard(canvas, input(format), images({ avatar: null }));
      const sprites = drawsOf(draws, "sprite");
      expect(sprites).toHaveLength(1);
      expect(sprites[0].args.slice(0, 4)).toEqual([0, 0, 48, 48]);
      expect(dest(sprites[0]).w).toBe(48 * scale);
      expect(sprites[0].smoothing).toBe(false);
    }
  });

  it("a failed logo draws the text wordmark in cream", () => {
    const { canvas, draws, texts } = fakeCanvas();
    drawShareCard(canvas, input("post"), images({ logo: null }));
    expect(drawsOf(draws, "logo")).toHaveLength(0);
    const wordmark = texts.find((t) => t.text === "TOKEN TAILS");
    expect(wordmark?.fill).toBe(INK.cream);
    // With the logo there is no live wordmark text.
    const ok = fakeCanvas();
    drawShareCard(ok.canvas, input("post"), images());
    expect(ok.texts.some((t) => t.text === "TOKEN TAILS")).toBe(false);
  });

  it("draws the uppercase title and one line from CardText: no NEW FRIEND block", () => {
    const { canvas, texts } = fakeCanvas();
    drawShareCard(canvas, input("story"), images());
    expect(texts.map((t) => t.text)).toEqual(["MOCHI & ZARE", "Zare · a real cat at Pink Paw", "tokentails.com/yourcat"]);
    expect(texts.find((t) => t.text === "MOCHI & ZARE")?.fill).toBe(GOLD[400]);
    expect(texts.find((t) => t.text === "Zare · a real cat at Pink Paw")?.fill).toBe(INK.cream);
  });

  it("the title alone carries the page's .glow: cream, blur 24, at 0.6 alpha", () => {
    const { canvas, texts } = fakeCanvas();
    drawShareCard(canvas, input("post"), images());
    expect(NAME_GLOW).toEqual({ blur: 24, alpha: 0.6 });
    const title = texts.find((t) => t.text === "MOCHI & ZARE");
    expect(title?.shadowBlur).toBe(24);
    expect(title?.shadowColor).toBe(tokenRgba(INK.cream, 0.6));
    // The glow is restored before the subline and the link.
    for (const t of texts.filter((x) => x !== title)) expect(t.shadowBlur).toBe(0);
  });

  it("the card copy makes no shelter-share or donation claim", () => {
    for (const shelter of ["Judas", "Raudvis", "Zare", "Simas", null]) {
      for (const t of [cardText("Mochi", true, "Ginger", shelter), cardText("", false, "Ginger", shelter)]) {
        const all = [t.wordmark, t.link, t.nameLine, t.nameFallback, t.subline].join(" ");
        expect(all).not.toMatch(/donat|share of|% |percent|proceeds|funds?\b|support|help(s|ing)? (the )?shelter/i);
      }
    }
  });

  it("a failed shelter image draws the card solo, with the solo text", () => {
    const { canvas, draws, texts } = fakeCanvas();
    const layout = drawShareCard(canvas, input("story"), images({ shelter: null }));
    expect(layout.panel).toBeNull();
    expect(drawsOf(draws, "roundel")).toHaveLength(0);
    const lines = texts.map((t) => t.text);
    expect(lines).toContain("MOCHI");
    expect(lines).toContain("Now a pixel cat in Token Tails");
    expect(lines.some((l) => /zare/i.test(l))).toBe(false);
    expect(layout.foot.y).toBe(1187);
  });

  it.each([
    ["story", 1920, 864],
    ["post", 1350, 1229],
  ] as const)("%s: covers the nebula cropped from x 0.15 (off the bright beam), then a night-950 scrim at .35", (format, h, cropW) => {
    const { canvas, draws, fills } = fakeCanvas();
    drawShareCard(canvas, input(format), images());
    const [bg] = drawsOf(draws, "background");
    expect(dest(bg)).toEqual({ x: 0, y: 0, w: 1080, h });
    // Source crop: the card's aspect at full height, its left edge at 15% of the 2752 px width.
    expect(BACKGROUND_CROP_X).toBe(0.15);
    expect(bg.args[0]).toBe(Math.round(2752 * 0.15));
    expect(bg.args[1]).toBe(0);
    expect(Math.round(bg.args[2])).toBe(cropW);
    expect(bg.args[3]).toBe(1536);
    expect(fills.some((f) => f.fill === NIGHT[950] && f.alpha === 0.35 && f.rect[2] === 1080)).toBe(true);
  });

  it.each(["story", "post"] as const)("%s: the scene stands on the foot plate's horizon, below the portrait", (format) => {
    const { canvas, draws, fills } = fakeCanvas();
    const layout = drawShareCard(canvas, input(format), images());
    const frameBottom = layout.frame.y + layout.frame.h;
    const foot = dest(drawsOf(draws, "foot")[0]);
    expect(foot).toEqual(layout.foot);
    // The night fill runs from under the plate to the bottom edge.
    expect(fills.some((f) => f.fill === NIGHT[950] && f.rect[1] === layout.groundFill.y && f.rect[1] + f.rect[3] === layout.height)).toBe(true);
    // The walking sprite's whole cell is under the portrait, its feet on the ground (mirrored it is
    // drawn at the origin after a translate, so the solo card, drawn as it is, checks the pixels).
    expect(layout.sprite.y).toBeGreaterThanOrEqual(frameBottom);
    const solo = fakeCanvas();
    const soloLayout = drawShareCard(solo.canvas, input(format, SOLO_TEXT), images());
    const cell = dest(drawsOf(solo.draws, "sprite").find((d) => d.args[1] === 9 * 48)!);
    expect(cell).toEqual(soloLayout.sprite);
    expect(cell.y).toBeGreaterThanOrEqual(soloLayout.frame.y + soloLayout.frame.h);
    expect(cell.y + 36 * soloLayout.spriteScale).toBe(soloLayout.ground);
    // The shelter art is drawn under the portrait too (before the lean), and the heart never touches it.
    const shelter = dest(drawsOf(draws, "shelter")[0]);
    expect(shelter.y).toBeGreaterThan(frameBottom);
    for (const f of fills.filter((x) => x.fill === STATES.pink)) expect(f.rect[1]).toBeGreaterThan(frameBottom);
    // Four gold cross stars: two arms each.
    expect(fills.filter((f) => f.fill === GOLD[400] && (f.rect[2] === 3 || f.rect[3] === 3)).length).toBeGreaterThanOrEqual(8);
  });

  it("the canvas bevel matches the Frame: 4 gold, 4 shadow, 2 keyline, cream corner pixels", () => {
    const { ctx, fills } = fakeCanvas();
    drawFrame(ctx as unknown as CanvasRenderingContext2D, { x: 0, y: 0, w: 100, h: 100 }, 2);
    expect(frameWidth(2)).toBe(20);
    expect(frameWidth(1.6, "cream")).toBe(8);
    const colours = fills.map((f) => f.fill);
    expect(colours.slice(0, 4)).toEqual([GOLD[400], GOLD[400], GOLD[400], GOLD[400]]);
    expect(colours.slice(4, 8)).toEqual(Array(4).fill(GOLD.shadow));
    expect(colours.slice(8, 12)).toEqual(Array(4).fill(NIGHT[950]));
    expect(colours.slice(12)).toEqual([INK.cream, INK.cream, INK.cream]);
    expect(fills[0].rect).toEqual([0, 0, 100, 8]);
    expect(fills[4].rect).toEqual([8, 8, 84, 8]);
  });

  it("uses tokens only: no hex colour literals in shareCard.ts", () => {
    const source = readFileSync(join(__dirname, "../components/yourcat/shareCard.ts"), "utf8");
    expect(source.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });
});
