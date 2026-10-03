import { cssViewSize, getCanvasPixelRatio } from "@/components/Phaser/look/registry";

const scene = (width: number, height: number, ratio?: number) => ({
  scale: { width, height },
  registry: { get: (key: string) => (key === "canvasPixelRatio" ? ratio : undefined) },
});

describe("cssViewSize (F10: scale.width is backing-store pixels)", () => {
  it.each([
    // [backing w, backing h, ratio, css w, css h]
    [390 * 2, 844 * 2, 2, 390, 844],
    [1688, 780, 2, 844, 390],
    [1440, 900, 1, 1440, 900],
    [1170, 2532, 1.5, 780, 1688],
  ])("%ix%i at ratio %p is %ix%i CSS", (w, h, ratio, cssW, cssH) => {
    expect(cssViewSize(scene(w, h, ratio))).toEqual({ width: cssW, height: cssH });
  });

  it("treats a missing ratio as 1", () => {
    expect(getCanvasPixelRatio(scene(800, 600))).toBe(1);
    expect(cssViewSize(scene(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it("keeps a landscape phone on the phone breakpoint (2e review: Cupid hint)", () => {
    // 844x390 CSS at ratio 2, camera CSS zoom 1.45: the old read gave 1688 / 1.45 = 1164.
    const isPhone = cssViewSize(scene(1688, 780, 2)).width / 1.45 < 768;
    expect(isPhone).toBe(true);
  });
});
