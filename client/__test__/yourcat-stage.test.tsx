/**
 * @jest-environment jsdom
 */
/**
 * `/yourcat` brand kit and stage primitives (docs/plans/yourcat-polish.md §2, §3, §4.3, §11): the
 * stage keeps fixed heights and its four slots, the frame keeps its integer inner box and bevel, the
 * pet cat still purrs and updates its caption under reduced motion, the header shows the lockup (no
 * live wordmark) and takes the night state when scrolled, and the brand pieces render the landing's
 * classes.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";

const mockSound = jest.fn();
jest.mock("@/components/home/homeSfx", () => ({ playHomeSound: (kind: string) => mockSound(kind) }));
jest.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn(), systemAudioAllowed: () => true }));

import {
  ALTAR_MASK,
  ALTAR_SURFACE,
  BLANK_PIXEL,
  CAT_SPOT_MD6,
  PAGE_FIREFLIES,
  PLATE_MASK,
  IDLE_PHONE_CAT,
  IDLE_PHONE_SHIFT,
  ROOM_CAT,
  ROOM_FRAME,
  ROOM_SHIFT,
  SIDE_PLATES,
  SKY_FALLBACK,
  SKY_MASK,
  SKY_SIZE,
  SKY_SRC,
  STAGE_FIREFLIES,
  STAGE_HEIGHT_CLASS,
  STUDIO_SKY_HEIGHT,
  Stage,
  StudioSky,
} from "@/components/yourcat/Stage";
import { readFileSync } from "fs";
import { join } from "path";
import { FRIEND_EMPTY_INNER, FRIEND_EMPTY_MS, UploadStep } from "@/components/yourcat/UploadStep";
import { HeadingBlock, NIGHT_COLUMN, NIGHT_COLUMN_BOTTOM, NIGHT_COLUMN_TOP, StudioContext, type Studio } from "@/components/yourcat/studio";
import { FRAME_BEVEL, FRAME_VELVET, Frame, FrameSilhouette, type FrameHandle } from "@/components/yourcat/Frame";
import { DOUBLE_TAP_MS, LOAF_MIN_MS, PetCat } from "@/components/yourcat/PetCat";
import { YourcatHeader } from "@/components/yourcat/YourcatHeader";
import { CHIP, ChipCheck, Glow, H2, HEADLINE, Headline, PrimaryAction, YourcatMotionStyles, headlineText } from "@/components/yourcat/brand";

class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  fire(isIntersecting: boolean) {
    act(() => this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
  }
}

// jsdom has no PointerEvent: give pointer events their coordinates.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = function PointerEvent(type: string, init?: MouseEventInit) {
    return new MouseEvent(type, init);
  };
}

beforeEach(() => {
  FakeObserver.instances = [];
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
  mockSound.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Stage", () => {
  it("has fixed heights on phones and md+, and fills the first screen on the xl studio", () => {
    render(<Stage frame={<div>frame</div>} reducedMotion={false} />);
    const stage = screen.getByTestId("yourcat-stage");
    expect(STAGE_HEIGHT_CLASS).toBe("h-[clamp(320px,42svh,400px)] md:h-[clamp(560px,66svh,620px)] xl:min-h-[calc(100svh-104px)]");
    expect(stage.className).toContain("h-[clamp(320px,42svh,400px)]");
    expect(stage.className).toContain("md:h-[clamp(560px,66svh,620px)]");
    // R2-03: the altar stands at the bottom of the first screen, no empty night band under it.
    expect(stage.className).toContain("xl:min-h-[calc(100svh-104px)]");
    // The altar strip and the actors' ground keep the strip's fixed aspect.
    expect(screen.getByTestId("yourcat-stage-altar").className).toContain("aspect-[1200/340]");
    expect(screen.getByTestId("yourcat-stage-ground").className).toContain("aspect-[1200/340]");
    expect(screen.getByTestId("yourcat-stage-surface").style.bottom).toBe(`${ALTAR_SURFACE * 100}%`);
    expect(ALTAR_SURFACE).toBeGreaterThan(0.5);
    expect(ALTAR_SURFACE).toBeLessThan(0.9);
    // The re-cropped strip (80 px higher): the legs stand just behind the lit rune disc's centre (y 132 to 193 of 340).
    const lineY = 340 * (1 - ALTAR_SURFACE);
    expect(lineY).toBeGreaterThan(132);
    expect(lineY).toBeLessThan(193);
  });

  it("paints its own soft-edged sky on phones only; md+ leaves the sky to the page", () => {
    const { container } = render(<Stage frame={<div />} reducedMotion={false} />);
    // Both masks fade left/right and top/bottom, intersected.
    for (const mask of [SKY_MASK, ALTAR_MASK]) {
      expect(mask).toContain("linear-gradient(to_right,transparent");
      expect(mask).toContain("linear-gradient(to_bottom,transparent");
      expect(mask).toContain("[mask-composite:intersect]");
      expect(mask).toContain("[-webkit-mask-composite:source-in]");
    }
    const layer = screen.getByTestId("yourcat-stage-sky-layer");
    expect(layer.className).toContain(SKY_MASK);
    expect(layer.className).toMatch(/(^|\s)md:hidden(\s|$)/);
    // R2-10: the sky's colours paint first, under the picture.
    expect(layer.style.backgroundImage).toContain("linear-gradient");
    expect(layer.contains(screen.getByTestId("yourcat-stage-sky"))).toBe(true);
    // Phones keep the art clipped to the column; pointer events stay off.
    const art = screen.getByTestId("yourcat-stage-art");
    expect(art.className).toContain("max-md:overflow-hidden");
    expect(art.className).not.toMatch(/(^|\s)overflow-hidden/);
    expect(art.className).toContain("pointer-events-none");
    expect(container.querySelector('img[src="/yourcat/altar-strip.webp"]')?.className).toContain(ALTAR_MASK);
    // The old hard-edged top and bottom bands are gone.
    expect(art.querySelector(".from-tt-night-900")).toBeNull();
  });

  it("drifts six CSS fireflies over the phone sky, still under reduced motion", () => {
    const { rerender } = render(<Stage frame={<div />} reducedMotion={false} />);
    const layer = screen.getByTestId("yourcat-stage-fireflies");
    const flies = Array.from(layer.querySelectorAll<HTMLElement>(".yc-firefly"));
    expect(flies).toHaveLength(STAGE_FIREFLIES.length);
    expect(STAGE_FIREFLIES.length).toBeLessThanOrEqual(6);
    expect(flies[0].style.left).toBe(`${STAGE_FIREFLIES[0].x}%`);
    expect(flies[0].style.getPropertyValue("--yc-fly-size")).toBe(`${STAGE_FIREFLIES[0].size}px`);
    expect(flies[0].style.animationPlayState).toBe("");
    expect(layer.getAttribute("data-static")).toBeNull();
    rerender(<Stage frame={<div />} reducedMotion />);
    const still = screen.getByTestId("yourcat-stage-fireflies");
    expect(still.getAttribute("data-static")).toBe("true");
    expect(still.querySelectorAll(".yc-firefly")).toHaveLength(STAGE_FIREFLIES.length);
    still.querySelectorAll<HTMLElement>(".yc-firefly").forEach((fly) => expect(fly.style.animationPlayState).toBe("paused"));
  });

  it("paints the landing art: decorative, sized, the warm sky at default priority; the foot plate lazy on md+ only", () => {
    const { container } = render(<Stage frame={<div />} reducedMotion={false} />);
    const art = screen.getByTestId("yourcat-stage-art");
    expect(art.getAttribute("aria-hidden")).toBe("true");
    const sky = screen.getByTestId("yourcat-stage-sky");
    expect(sky.getAttribute("src")).toBe(SKY_SRC);
    expect(SKY_SRC).toBe("/yourcat/sky.webp");
    // R2-10: preloaded by the page, so never fetchpriority=low.
    expect(sky.getAttribute("fetchpriority")).toBeNull();
    expect(sky.getAttribute("width")).toBe(String(SKY_SIZE.width));
    expect(sky.className).toContain("pixelated");
    // The stage's sky is the phones' one: it holds still (the drift is the page sky's, md+).
    expect(sky.className).not.toContain("animate-hoverSlow");
    const foot = screen.getByTestId("yourcat-stage-foot");
    expect(foot.getAttribute("src")).toBe("/landing/plates/hub-night-near-v1.png");
    expect(foot.getAttribute("loading")).toBe("lazy");
    expect(foot.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(foot.className).toContain("md:block");
    const altar = container.querySelector('img[src="/yourcat/altar-strip.webp"]');
    expect(altar?.getAttribute("width")).toBe("1200");
    expect(altar?.getAttribute("height")).toBe("340");
    // Every image box has its size up front.
    container.querySelectorAll("img").forEach((img) => {
      expect(img.getAttribute("width")).toBeTruthy();
      expect(img.getAttribute("height")).toBeTruthy();
    });
  });

  it("keeps the frame group still under reduced motion", () => {
    render(<Stage frame={<div />} reducedMotion />);
    expect(screen.getByTestId("yourcat-stage-sky").className).not.toContain("animate-hoverSlow");
    expect(screen.getByTestId("yourcat-stage-group").className).not.toContain("transition-transform");
  });

  it("renders the frame, companion, cat and overlay slots", () => {
    render(
      <Stage
        frame={<span>the frame</span>}
        companion={<span>the shelter frame</span>}
        cat={<span>the cat</span>}
        overlay={<span>the burst</span>}
        reducedMotion={false}
      />,
    );
    expect(screen.getByTestId("yourcat-slot-frame").textContent).toBe("the frame");
    expect(screen.getByTestId("yourcat-slot-companion").textContent).toBe("the shelter frame");
    expect(screen.getByTestId("yourcat-slot-cat").textContent).toBe("the cat");
    const overlay = screen.getByTestId("yourcat-slot-overlay");
    expect(overlay.textContent).toBe("the burst");
    expect(overlay.className).toContain("pointer-events-none");
    // Companion on the left of the frame, the cat on its right.
    expect(screen.getByTestId("yourcat-slot-companion").className).toContain("right-full");
    expect(screen.getByTestId("yourcat-slot-cat").className).toContain("left-full");
    // The cat stays above the frame's own layers when it walks in front of it; the overlay above both.
    expect(screen.getByTestId("yourcat-slot-cat").className).toMatch(/(^|\s)z-10(\s|$)/);
    expect(overlay.className).toMatch(/(^|\s)z-20(\s|$)/);
  });

  it("leaves empty slots out", () => {
    render(<Stage frame={<span>f</span>} reducedMotion={false} />);
    expect(screen.queryByTestId("yourcat-slot-companion")).toBeNull();
    expect(screen.queryByTestId("yourcat-slot-cat")).toBeNull();
    expect(screen.queryByTestId("yourcat-slot-overlay")).toBeNull();
  });

  it("shifts the frame group 40 px left on phones only, with a transform", () => {
    const { rerender } = render(<Stage frame={<span />} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage-group").className).not.toContain("-translate-x-10");
    rerender(<Stage frame={<span />} shifted reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage-group").className).toContain("max-md:-translate-x-10");
    expect(screen.getByTestId("yourcat-stage").getAttribute("data-shifted")).toBe("true");
  });

  it("gives a marked companion its own room: the portrait steps back and the row is centred, with no overlap", () => {
    render(<Stage frame={<span />} companion={<span data-yc-room="true">empty frame</span>} cat={<span>cat</span>} reducedMotion={false} />);
    const group = screen.getByTestId("yourcat-stage-group");
    expect(group.className).toContain(ROOM_SHIFT);
    expect(ROOM_SHIFT).toContain("max-[389px]:has-[[data-yc-room]]:!translate-x-[43px]");
    expect(ROOM_SHIFT).toContain("min-[390px]:max-md:has-[[data-yc-room]]:!translate-x-[28px]");
    expect(ROOM_SHIFT).toContain("md:has-[[data-yc-room]]:translate-x-14");
    expect(group.querySelector("[data-yc-room]")).toBeTruthy();
    // The portrait steps back from its bottom-left corner (transform only).
    const frame = screen.getByTestId("yourcat-slot-frame");
    expect(frame.className).toContain(ROOM_FRAME);
    expect(ROOM_FRAME).toContain("max-[389px]:group-has-[[data-yc-room]]/yc:scale-[.66]");
    expect(ROOM_FRAME).toContain("min-[390px]:max-md:group-has-[[data-yc-room]]/yc:scale-[.8]");
    expect(ROOM_FRAME).toContain("md:group-has-[[data-yc-room]]/yc:scale-90");
    // A 6 px gap on phones, 24 on md+, instead of the overlap.
    const companion = screen.getByTestId("yourcat-slot-companion");
    expect(companion.className).toContain("group-has-[[data-yc-room]]/yc:mr-1.5");
    expect(companion.className).toContain("md:group-has-[[data-yc-room]]/yc:mr-6");
    // The cat stands 4 px right of the stepped-back portrait.
    expect(screen.getByTestId("yourcat-slot-cat").className).toContain(ROOM_CAT);
    // The geometry, per width: empty frame (92 / 148), gap, portrait (212 / 404 x scale), 4 px, the
    // cat's body (76 / 96) and its caption's overhang, centred in the stage (328 at 360, 358 at 390, 672 at 768).
    for (const [stageWidth, frameWidth, empty, gap, scale, shift, catOverlap, box, unit] of [
      [328, 212, 92, 6, 0.66, 43, 104, 144, 3],
      [358, 212, 92, 6, 0.8, 28, 74, 144, 3],
      [672, 404, 148, 24, 0.9, 56, 84, 192, 4],
    ]) {
      const frameLeft = (stageWidth - frameWidth) / 2 + shift;
      const portraitRight = frameLeft + frameWidth * scale;
      const emptyLeft = frameLeft - gap - empty;
      const catBoxLeft = frameLeft + frameWidth - catOverlap;
      const bodyLeft = catBoxLeft + 12 * unit;
      const captionRight = catBoxLeft + box / 2 + 44;
      expect(emptyLeft).toBeGreaterThanOrEqual(0);
      expect(bodyLeft - portraitRight).toBeGreaterThanOrEqual(3);
      expect(Math.max(captionRight, catBoxLeft + 36 * unit)).toBeLessThanOrEqual(stageWidth);
    }
  });

  it("idle on phones: the cat's body starts right of the frame and the group moves left so its caption fits", () => {
    render(<Stage frame={<span />} cat={<span>cat</span>} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage-group").className).toContain(IDLE_PHONE_SHIFT);
    expect(screen.getByTestId("yourcat-slot-cat").className).toContain(IDLE_PHONE_CAT);
    expect(IDLE_PHONE_CAT).toBe("-ml-8");
    for (const width of [360, 390]) {
      const stageRight = width - 16;
      const shift = Math.min(0, width / 2 - 208);
      const frameRight = width / 2 + 106 + shift;
      const catBoxLeft = frameRight - 32;
      expect(catBoxLeft + 36).toBeGreaterThan(frameRight);
      expect(catBoxLeft + 72 + 44).toBeLessThanOrEqual(stageRight);
    }
  });

  it("is a drop zone for files when onDrop is given", () => {
    const onDrop = jest.fn();
    const onDragState = jest.fn();
    render(<Stage frame={<span />} reducedMotion={false} onDrop={onDrop} onDragState={onDragState} />);
    const stage = screen.getByTestId("yourcat-stage");
    const file = new File(["x"], "cat.jpg", { type: "image/jpeg" });
    const dataTransfer = { types: ["Files"], files: [file], dropEffect: "none" };
    fireEvent.dragEnter(stage, { dataTransfer });
    expect(onDragState).toHaveBeenLastCalledWith(true);
    fireEvent.dragOver(stage, { dataTransfer });
    fireEvent.drop(stage, { dataTransfer });
    expect(onDrop).toHaveBeenCalledWith(file);
    expect(onDragState).toHaveBeenLastCalledWith(false);
  });

  it("gives a 6x cat on md+ an 84 px overlap, keyed on PetCat's md scale class", () => {
    expect(CAT_SPOT_MD6).toBe("md:[&:has([class~='md:[--s:6]'])]:-ml-[84px]");
    render(
      <Stage
        frame={<span />}
        cat={<PetCat spriteImg="/cats/yellow/sprites/original.png" name="Mochi" labels={{ pet: "Pet Mochi", tap: "Tap Mochi", purrs: "Mochi purrs." }} scale={{ base: 3, md: 6 }} reducedMotion />}
        reducedMotion={false}
      />,
    );
    const slot = screen.getByTestId("yourcat-slot-cat");
    expect(slot.className).toContain(CAT_SPOT_MD6);
    expect(slot.className).toContain("md:-ml-12");
    // The class the variant looks for is the one PetCat really sets for a 6x md scale.
    expect(slot.querySelector('[class~="md:[--s:6]"]')).toBeTruthy();
  });

  it("can stand the companion right of the cat (companionSide), keeping the cat's spot", () => {
    const { rerender } = render(<Stage frame={<span />} companion={<span>zare</span>} cat={<span>cat</span>} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-slot-companion").className).toContain("right-full");
    expect(screen.queryByTestId("yourcat-slot-right")).toBeNull();
    rerender(<Stage frame={<span />} companion={<span>zare</span>} cat={<span>cat</span>} companionSide="right" reducedMotion={false} />);
    const right = screen.getByTestId("yourcat-slot-right");
    expect(right.className).toContain("left-full");
    expect(right.className).toContain("md:-ml-12");
    expect(right.className).toContain(CAT_SPOT_MD6);
    const order = Array.from(right.children).map((child) => child.getAttribute("data-testid"));
    expect(order).toEqual(["yourcat-slot-cat", "yourcat-slot-companion"]);
    expect(screen.getByTestId("yourcat-slot-companion").getAttribute("data-side")).toBe("right");
    expect(screen.getByTestId("yourcat-slot-companion").textContent).toBe("zare");
    expect(screen.getByTestId("yourcat-slot-cat").textContent).toBe("cat");
  });

  it("ignores drags of text and has no drop zone without onDrop", () => {
    const onDragState = jest.fn();
    const { rerender } = render(<Stage frame={<span />} reducedMotion={false} onDrop={jest.fn()} onDragState={onDragState} />);
    fireEvent.dragEnter(screen.getByTestId("yourcat-stage"), { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(onDragState).not.toHaveBeenCalled();
    rerender(<Stage frame={<span />} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage").getAttribute("data-drop-zone")).toBeNull();
  });
});

describe("StudioSky (md+ page world, R2-03 and R2-10)", () => {
  it("is a full-bleed decorative layer one screen tall, on md+ only, over the sky's CSS gradient", () => {
    render(<StudioSky reducedMotion={false} />);
    const sky = screen.getByTestId("yourcat-page-sky");
    expect(sky.getAttribute("aria-hidden")).toBe("true");
    expect(sky.className).toContain("pointer-events-none");
    expect(sky.className).toContain("absolute inset-x-0 top-0");
    expect(sky.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(sky.className).toContain("md:block");
    expect(STUDIO_SKY_HEIGHT).toContain("100svh");
    expect(sky.className).toContain(STUDIO_SKY_HEIGHT);
    // The sky's colours paint before the picture (and if it fails): night top, sunset glow, dusk hills.
    expect(sky.style.backgroundImage).toContain("radial-gradient");
    expect(SKY_FALLBACK).toContain("#0e1030");
    expect(SKY_FALLBACK).toContain("#d98268");
    // The landing's fade into the night page.
    expect(screen.getByTestId("yourcat-page-sky-fade").className).toContain("to-tt-night-900");
  });

  it("uses the warm sky (not the dim one), drifting; the side plates md+ only and eager; ~18 fireflies", () => {
    const { container } = render(<StudioSky reducedMotion={false} />);
    const image = screen.getByTestId("yourcat-page-sky-image");
    expect(image.getAttribute("src")).toBe(SKY_SRC);
    expect(image.getAttribute("src")).not.toContain("-dim");
    expect(image.getAttribute("fetchpriority")).toBeNull();
    expect(image.className).toContain("animate-hoverSlow");
    expect(image.className).toContain("motion-reduce:animate-none");
    for (const side of ["left", "right"] as const) {
      const plate = screen.getByTestId(`yourcat-page-plate-${side}`);
      // Phones get a blank pixel (no fetch); md+ takes the plate from the <source>, eagerly: it is the
      // md+ LCP candidate, and a lazy LCP image waits for layout.
      expect(plate.getAttribute("src")).toBe(BLANK_PIXEL);
      expect(plate.getAttribute("loading")).toBeNull();
      const source = plate.parentElement?.querySelector("source");
      expect(plate.parentElement?.tagName).toBe("PICTURE");
      expect(source?.getAttribute("media")).toBe("(min-width: 768px)");
      expect(source?.getAttribute("srcset")).toBe(SIDE_PLATES[side].src);
      expect(plate.getAttribute("width")).toBe(String(SIDE_PLATES[side].width));
      expect(plate.getAttribute("height")).toBe(String(SIDE_PLATES[side].height));
      expect(plate.className).toContain(PLATE_MASK[side]);
      expect(PLATE_MASK[side]).toContain("linear-gradient(to_bottom,transparent");
    }
    const flies = screen.getByTestId("yourcat-page-fireflies").querySelectorAll<HTMLElement>(".yc-firefly");
    expect(flies).toHaveLength(PAGE_FIREFLIES.length);
    expect(PAGE_FIREFLIES.length).toBeGreaterThanOrEqual(16);
    expect(PAGE_FIREFLIES.length).toBeLessThanOrEqual(20);
    container.querySelectorAll("img").forEach((img) => {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("width")).toBeTruthy();
      expect(img.getAttribute("height")).toBeTruthy();
    });
  });

  it("holds still under reduced motion: no drift, the fireflies paused", () => {
    render(<StudioSky reducedMotion />);
    expect(screen.getByTestId("yourcat-page-sky-image").className).not.toContain("animate-hoverSlow");
    const layer = screen.getByTestId("yourcat-page-fireflies");
    expect(layer.getAttribute("data-static")).toBe("true");
    layer.querySelectorAll<HTMLElement>(".yc-firefly").forEach((fly) => expect(fly.style.animationPlayState).toBe("paused"));
  });

  it("the route preloads the sky in its head", () => {
    const route = readFileSync(join(__dirname, "..", "pages", "yourcat.tsx"), "utf8");
    expect(route).toMatch(/<link key="yc-sky" rel="preload" as="image" type="image\/webp" href=\{SKY_SRC\} \/>/);
    // The static app export: no server-side data functions.
    expect(route).not.toMatch(/export (const|(async )?function) (getServerSideProps|getStaticProps)/);
  });
});

describe("the xl studio's column 2 night panel", () => {
  it("the heading block is the top half and the panel the bottom half, with no backdrop filter", () => {
    render(
      <HeadingBlock>
        <h1>Title</h1>
      </HeadingBlock>,
    );
    const heading = screen.getByTestId("yourcat-heading");
    for (const part of NIGHT_COLUMN_TOP.split(" ")) expect(heading.className).toContain(part);
    expect(NIGHT_COLUMN_TOP).toContain("xl:rounded-t-2xl");
    expect(NIGHT_COLUMN_BOTTOM).toContain("xl:rounded-b-2xl");
    expect(NIGHT_COLUMN).toContain("xl:rounded-2xl");
    for (const surface of [NIGHT_COLUMN_TOP, NIGHT_COLUMN_BOTTOM, NIGHT_COLUMN]) {
      expect(surface).toContain("xl:bg-tt-night-900/85");
      // Wider than the 420 px column by its padding and border, so the content keeps 420 px.
      expect(surface).toContain("xl:-mx-[26px]");
      expect(surface).toContain("xl:px-6");
      expect(surface).not.toContain("backdrop");
      // xl only: phones and the stacked md layout are unchanged.
      for (const cls of surface.split(" ")) expect(cls.startsWith("xl:")).toBe(true);
    }
  });
});

describe("Frame", () => {
  it("has a box-content inner box of 192 on phones and 384 on md+", () => {
    render(<Frame inner={{ w: 192, h: 192, mdW: 384, mdH: 384 }} legs reducedMotion={false} />);
    const frame = screen.getByTestId("yourcat-frame");
    expect(frame.style.getPropertyValue("--yc-iw")).toBe("192px");
    expect(frame.style.getPropertyValue("--yc-ih")).toBe("192px");
    expect(frame.style.getPropertyValue("--yc-iw-md")).toBe("384px");
    expect(frame.style.getPropertyValue("--yc-ih-md")).toBe("384px");
    const inner = screen.getByTestId("yourcat-frame-inner");
    expect(inner.className).toContain("box-content");
    expect(inner.className).toContain("w-[var(--yc-iw)]");
    expect(inner.className).toContain("md:w-[var(--yc-iw-md)]");
    expect(screen.getByTestId("yourcat-frame-legs").children).toHaveLength(2);
    expect(FRAME_BEVEL.gold).toBe(10);
    expect(192 % 96).toBe(0);
  });

  it("draws the two-tone gold bevel with a night keyline", () => {
    const { container } = render(<Frame inner={{ w: 192, h: 192 }} reducedMotion={false} />);
    const html = container.innerHTML;
    expect(html).toContain("border-4 border-tt-gold-400");
    expect(html).toContain("border-4 border-tt-gold-shadow");
    expect(html).toContain("border-2 border-tt-night-950");
    expect(html).toContain("bg-tt-cream");
  });

  it("lines the gilt frame's glass with night velvet (R2-03); the cream frame stays plain", () => {
    expect(FRAME_VELVET).toContain("radial-gradient(");
    expect(FRAME_VELVET).toContain("rgb(var(--tt-night-700))");
    expect(FRAME_VELVET).toContain("rgb(var(--tt-night-950))_100%");
    const { rerender } = render(<Frame inner={{ w: 192, h: 192 }} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-frame-inner").className).toContain(FRAME_VELVET);
    rerender(<Frame tone="cream" inner={{ w: 48, h: 72 }} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-frame-inner").className).not.toContain("radial-gradient");
    expect(screen.getByTestId("yourcat-frame-inner").className).toContain("bg-tt-night-950");
  });

  it("has a cream shelter tone at 2:3", () => {
    const { container } = render(<Frame tone="cream" inner={{ w: 48, h: 72, mdW: 128, mdH: 192 }} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-frame-cream").getAttribute("data-tone")).toBe("cream");
    expect(container.innerHTML).toContain("border-2 border-tt-muted");
    expect(screen.getByTestId("yourcat-frame-cream").style.getPropertyValue("--yc-ih-md")).toBe("192px");
  });

  it("runs the sheen and breath, and drops both (with a static border) under reduced motion", () => {
    const { rerender } = render(<Frame inner={{ w: 192, h: 192 }} sheen breathe reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-frame-sheen")).toBeTruthy();
    // The band spans the glass, so it rests off the glass between passes.
    const band = screen.getByTestId("yourcat-frame-sheen").firstElementChild as HTMLElement;
    expect(band.className).toContain("yc-sheen");
    expect(band.className).toContain("inset-0");
    expect(band.className).not.toContain("w-1/4");
    expect(band.getAttribute("data-sheen")).toBe("loop");
    // The breath is a glow ring 6 px outside the bevel: no fill, no block, no panel tint.
    const ring = screen.getByTestId("yourcat-frame-breathe");
    expect(ring.className).toContain("yc-ring");
    expect(ring.className).toContain("-inset-[6px]");
    expect(ring.className).toContain("bg-transparent");
    expect(ring.className).toContain("shadow-[0_0_18px_4px_rgb(var(--tt-gold-400)/.55)");
    expect(ring.className).not.toMatch(/bg-black|bg-tt-|-inset-3|yc-breathe/);
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    rerender(<Frame inner={{ w: 192, h: 192 }} sheen breathe reducedMotion />);
    expect(screen.queryByTestId("yourcat-frame-sheen")).toBeNull();
    expect(screen.queryByTestId("yourcat-frame-breathe")).toBeNull();
    expect(screen.getByTestId("yourcat-frame-inner").innerHTML).toContain("border-tt-gold-400");
  });

  it("scales on drag-over and turns the keyline rust when failed", () => {
    const { container, rerender } = render(<Frame inner={{ w: 192, h: 192 }} dragOver reducedMotion={false} />);
    expect(container.querySelector('[data-drag-over="true"]')?.className).toContain("scale-[1.03]");
    rerender(<Frame inner={{ w: 192, h: 192 }} failed sheen reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-frame").getAttribute("data-failed")).toBe("true");
    expect(container.innerHTML).toContain("border-tt-rust");
    expect(screen.queryByTestId("yourcat-frame-sheen")).toBeNull();
  });

  it("exposes the inner box and bumps with WAAPI, never under reduced motion", () => {
    const animate = jest.fn(() => ({ cancel: jest.fn() }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const ref = createRef<FrameHandle>();
    const { rerender } = render(<Frame ref={ref} inner={{ w: 192, h: 192 }} reducedMotion={false} />);
    expect(ref.current?.inner).toBe(screen.getByTestId("yourcat-frame-inner"));
    act(() => ref.current?.bump("hold"));
    act(() => ref.current?.bump("settle"));
    act(() => ref.current?.bump("pulse"));
    expect(animate).toHaveBeenCalledTimes(3);
    expect(animate.mock.calls[0]).toEqual([
      [{ transform: "scale(1)" }, { transform: "scale(1.03)" }],
      expect.objectContaining({ duration: 150, fill: "forwards" }),
    ]);
    expect(animate.mock.calls[1]).toEqual([
      [{ transform: "scale(1.03)" }, { transform: "scale(1)" }],
      expect.objectContaining({ duration: 320 }),
    ]);
    rerender(<Frame ref={ref} inner={{ w: 192, h: 192 }} reducedMotion />);
    act(() => ref.current?.bump("drop"));
    expect(animate).toHaveBeenCalledTimes(3);
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it("shows the empty-frame silhouette with its label", () => {
    render(<FrameSilhouette label="Your cat here" />);
    expect(screen.getByText("Your cat here").className).toContain("text-tt-lilac");
    expect(screen.getByTestId("yourcat-frame-silhouette").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("sheens once after a delay when asked, never under reduced motion", () => {
    const { rerender } = render(<Frame inner={{ w: 72, h: 72 }} sheen="once" sheenDelayMs={300} reducedMotion={false} />);
    const band = screen.getByTestId("yourcat-frame-sheen").firstElementChild as HTMLElement;
    expect(band.className).toContain("yc-sheen-once");
    expect(band.getAttribute("data-sheen")).toBe("once");
    expect(band.style.getPropertyValue("--yc-delay")).toBe("300ms");
    rerender(<Frame inner={{ w: 72, h: 72 }} sheen="once" sheenDelayMs={300} reducedMotion />);
    expect(screen.queryByTestId("yourcat-frame-sheen")).toBeNull();
  });

  it("puts a compact label inside the small frame in cream text-p6", () => {
    render(<FrameSilhouette label="Your cat here" compact />);
    const label = screen.getByTestId("yourcat-frame-label");
    expect(label.textContent).toBe("Your cat here");
    expect(label.className).toContain("text-tt-cream");
    expect(label.className).toContain("text-p6");
    expect(label.className).not.toContain("md:text-p5");
    expect(screen.getByTestId("yourcat-frame-silhouette").contains(label)).toBe(true);
  });
});

describe("friend view companion (UploadStep S0)", () => {
  it("stands a 72/128 px empty frame left of the main frame, label inside, sheen once at 300 ms", () => {
    const companion = document.createElement("div");
    document.body.appendChild(companion);
    const studio: Studio = {
      slots: { frameFx: null, companion, cat: null, overlay: null, panel: null, extras: null },
      frame: { current: null },
      stage: { current: null },
      configure: () => undefined,
      listen: () => undefined,
      replay: () => undefined,
    };
    render(
      <StudioContext.Provider value={studio}>
        <UploadStep
          status={null}
          statusFailed={false}
          getting={false}
          fileError={null}
          onFile={jest.fn()}
          onManual={jest.fn()}
          reducedMotion={false}
          friend={{ name: "Mochi", familyLabel: "Ginger", spriteImg: "/cats/yellow/sprites/original.png" }}
        />
      </StudioContext.Provider>,
    );
    const empty = companion.querySelector('[data-testid="yourcat-friend-empty"]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.getAttribute("data-yc-room")).toBe("true");
    expect(empty.style.getPropertyValue("--yc-delay")).toBe(`${FRIEND_EMPTY_MS}ms`);
    expect(FRIEND_EMPTY_MS).toBe(300);
    expect(FRIEND_EMPTY_INNER).toEqual({ w: 72, h: 72, mdW: 128, mdH: 128 });
    const frame = empty.querySelector('[data-testid="yourcat-frame"]') as HTMLElement;
    expect(frame.style.getPropertyValue("--yc-iw")).toBe("72px");
    expect(frame.style.getPropertyValue("--yc-iw-md")).toBe("128px");
    expect(frame.querySelector('[data-testid="yourcat-frame-legs"]')).toBeTruthy();
    // The label sits inside the frame's glass, under the silhouette.
    const inner = frame.querySelector('[data-testid="yourcat-frame-inner"]') as HTMLElement;
    const label = inner.querySelector('[data-testid="yourcat-frame-label"]') as HTMLElement;
    expect(label.textContent).toBe("Your cat here");
    expect(label.className).toContain("text-tt-cream");
    expect(empty.textContent).toBe("Your cat here");
    const band = inner.querySelector('[data-sheen="once"]') as HTMLElement;
    expect(band.style.getPropertyValue("--yc-delay")).toBe("300ms");
    companion.remove();
  });
});

describe("PetCat", () => {
  const labels = { pet: "Pet Mochi", tap: "Tap Mochi", purrs: "Mochi purrs." };

  it("draws the cat's own sheet at an integer --s scale, idle row, with feet on the line", () => {
    const { container } = render(<PetCat spriteImg="/cats/yellow/sprites/original.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const root = screen.getByTestId("yourcat-petcat");
    expect(root.className).toContain("[--s:3]");
    expect(root.className).toContain("md:[--s:4]");
    expect(root.style.marginBottom).toBe("calc(-11px * var(--s))");
    const layer = container.querySelector('[data-anim="idle"]') as HTMLElement;
    expect(layer.getAttribute("data-row")).toBe("4");
    expect(layer.className).toContain("yc-sprite");
    expect(layer.style.backgroundImage).toContain("/cats/yellow/sprites/original.png");
    expect(screen.getByRole("button", { name: "Pet Mochi" })).toBeTruthy();
    expect(screen.getByTestId("yourcat-petcat-caption").textContent).toBe("Tap Mochi");
    expect(screen.getByTestId("yourcat-petcat-caption").getAttribute("aria-live")).toBe("polite");
  });

  it("loafs for at least 1.2 s, floats 3 to 5 hearts, purrs and says so on a tap", () => {
    jest.useFakeTimers();
    const { container } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const button = screen.getByRole("button", { name: "Pet Mochi" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(mockSound).toHaveBeenCalledWith("purr");
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("loaf");
    const hearts = screen.getAllByTestId("yourcat-heart");
    expect(hearts.length).toBeGreaterThanOrEqual(3);
    expect(hearts.length).toBeLessThanOrEqual(5);
    expect(screen.getByTestId("yourcat-petcat-caption").textContent).toBe("Mochi purrs.");
    act(() => jest.advanceTimersByTime(LOAF_MIN_MS - 100));
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("loaf");
    act(() => jest.advanceTimersByTime(200));
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("idle");
    expect(container.querySelectorAll('[data-testid="yourcat-heart"]')).toHaveLength(0);
  });

  it("jumps once on a double tap", () => {
    jest.useFakeTimers();
    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const button = screen.getByRole("button", { name: "Pet Mochi" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    act(() => jest.advanceTimersByTime(DOUBLE_TAP_MS - 100));
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("jump");
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("idle");
  });

  it("faces the side of the last tap", () => {
    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const button = screen.getByRole("button", { name: "Pet Mochi" });
    button.getBoundingClientRect = () => ({ left: 100, width: 144, top: 0, height: 144, right: 244, bottom: 144, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(button, { clientX: 110 });
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-facing")).toBe("left");
    fireEvent.pointerDown(button, { clientX: 240 });
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-facing")).toBe("right");
  });

  it("under reduced motion: still pettable, purrs, updates the caption, no hearts or loop", () => {
    jest.useFakeTimers();
    const { container } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion />);
    const button = screen.getByRole("button", { name: "Pet Mochi" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(container.querySelector(".yc-sprite")).toBeNull();
    expect(container.querySelector(".yc-hop")).toBeNull();
    const [idle, loaf] = Array.from(container.querySelectorAll<HTMLElement>("[data-anim]"));
    expect(idle.getAttribute("data-anim")).toBe("idle");
    expect(loaf.getAttribute("data-anim")).toBe("loaf");
    expect(loaf.style.opacity).toBe("0");
    expect(loaf.className).toContain("duration-[120ms]");
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(mockSound).toHaveBeenCalledWith("purr");
    expect(screen.getByTestId("yourcat-petcat-caption").textContent).toBe("Mochi purrs.");
    expect(loaf.style.opacity).toBe("1");
    expect(idle.style.opacity).toBe("0");
    expect(screen.queryAllByTestId("yourcat-heart")).toHaveLength(0);
    act(() => jest.advanceTimersByTime(LOAF_MIN_MS + 50));
    expect(loaf.style.opacity).toBe("0");
  });

  it("pets from the keyboard, stays silent with sound off, and is inert when not interactive", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} sound={false} reducedMotion={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Pet Mochi" }), { detail: 0 });
    expect(screen.getByTestId("yourcat-petcat-caption").textContent).toBe("Mochi purrs.");
    expect(mockSound).not.toHaveBeenCalled();
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} interactive={false} reducedMotion={false} />);
    expect((screen.getByRole("button", { name: "Pet Mochi" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("plays its entrance once, then calls onEntranceEnd", () => {
    jest.useFakeTimers();
    const onEnd = jest.fn();
    const { container } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} entrance="jumpOut" reducedMotion={false} onEntranceEnd={onEnd} />);
    expect(container.querySelector(".yc-jump-out")).toBeTruthy();
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("jump");
    act(() => jest.advanceTimersByTime(480));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".yc-jump-out")).toBeNull();
  });

  it("floats one heart per heartOnce increment, not on mount", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} mode="sit" heartOnce={0} reducedMotion={false} />);
    expect(screen.queryAllByTestId("yourcat-heart")).toHaveLength(0);
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} mode="sit" heartOnce={1} reducedMotion={false} />);
    expect(screen.getAllByTestId("yourcat-heart")).toHaveLength(1);
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("sit");
  });

  it("pauses its loop offscreen", () => {
    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const root = screen.getByTestId("yourcat-petcat");
    expect(root.className).toContain("yc-paused");
    FakeObserver.instances[0].fire(true);
    expect(root.className).not.toContain("yc-paused");
    FakeObserver.instances[0].fire(false);
    expect(root.className).toContain("yc-paused");
  });
});

describe("YourcatHeader", () => {
  it("shows the canonical lockup with the 320 px copy, no live TOKEN TAILS text", () => {
    render(<YourcatHeader />);
    const header = screen.getByTestId("yourcat-header");
    expect(header.textContent ?? "").not.toMatch(/token tails/i);
    const logo = screen.getByAltText("Token Tails");
    expect(logo.getAttribute("src")).toBe("/logo/logo-text.webp");
    expect(logo.getAttribute("srcset")).toBe("/yourcat/logo-text-320.webp 320w, /logo/logo-text.webp 600w");
    expect(logo.getAttribute("width")).toBe("600");
    expect(logo.getAttribute("height")).toBe("337");
    expect(logo.className).toContain("h-14");
    expect(logo.className).toContain("md:h-20");
    expect(screen.getByTestId("yourcat-header-home").getAttribute("href")).toBe("/");
    expect(screen.getByTestId("yourcat-header-socials").className).toContain("hidden md:block");
    expect(header.className).toContain("fixed");
    expect(header.className).toContain("motion-reduce:transition-none");
  });

  it("takes the night glass when scrolled and hides on scroll down, returning on scroll up", () => {
    jest.useFakeTimers();
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    render(<YourcatHeader />);
    const header = screen.getByTestId("yourcat-header");
    expect(header.getAttribute("data-scrolled")).toBe("false");
    const scrollTo = (y: number) => {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true });
      act(() => {
        window.dispatchEvent(new Event("scroll"));
        jest.advanceTimersByTime(20);
      });
    };
    scrollTo(40);
    expect(header.getAttribute("data-scrolled")).toBe("true");
    expect(header.className).toContain("bg-tt-night-900/85");
    expect(header.className).toContain("border-tt-gold-400/30");
    expect(header.getAttribute("data-hidden")).toBe("false");
    scrollTo(400);
    expect(header.getAttribute("data-hidden")).toBe("true");
    expect(header.className).toContain("-translate-y-full");
    scrollTo(300);
    expect(header.getAttribute("data-hidden")).toBe("false");
    scrollTo(0);
    expect(header.getAttribute("data-scrolled")).toBe("false");
    window.requestAnimationFrame = raf;
  });
});

describe("brand kit", () => {
  it("renders the headline with its glowing key words, focusable", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<Headline ref={ref} parts={{ before: "Your cat,", glow: "in the game." }} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Your cat, in the game.");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.className).toBe(HEADLINE);
    expect(heading.querySelector(".glow")?.textContent).toBe("in the game.");
    expect(ref.current).toBe(heading);
    expect(headlineText({ before: "Turning", glow: "your cat", after: "into pixels" })).toBe("Turning your cat into pixels");
    expect(headlineText({ before: "Mochi says", glow: "hi", after: "." })).toBe("Mochi says hi.");
  });

  it("renders the level 2 heading with H2", () => {
    render(<Headline level={2} parts={{ before: "Mochi, meet", glow: "Zare." }} />);
    expect(screen.getByRole("heading", { level: 2 }).className).toBe(H2);
  });

  it("uses the landing's headline, chip and glow classes", () => {
    expect(HEADLINE).toContain("font-primary uppercase leading-none text-white drop-shadow-lg");
    expect(HEADLINE).toContain("text-h6 sm:text-h5 md:text-h4");
    expect(H2).toContain("text-p2 md:text-h6");
    const { container } = render(
      <>
        <Glow>hi</Glow>
        <ChipCheck>One photo · free</ChipCheck>
      </>,
    );
    expect(container.querySelector(".glow.text-tt-cream")?.textContent).toBe("hi");
    const chip = screen.getByText("One photo · free");
    expect(chip.className).toBe(CHIP);
    expect(chip.querySelector("img")?.getAttribute("src")).toBe("/icons/check.webp");
  });

  it("renders the primary action as a PixelButton, or a link around a span PixelButton", () => {
    const onClick = jest.fn();
    const { rerender } = render(<PrimaryAction text="Choose a photo" onClick={onClick} describedBy="hint" />);
    const button = screen.getByRole("button", { name: /choose a photo/i });
    expect(button.getAttribute("aria-describedby")).toBe("hint");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
    rerender(<PrimaryAction text="Play Token Tails" href="/game" />);
    const link = screen.getByRole("link", { name: /play token tails/i });
    expect(link.getAttribute("href")).toBe("/game");
    expect(link.querySelector("button")).toBeNull();
    rerender(<PrimaryAction text="Wait" href="/game" disabled />);
    expect(screen.queryByRole("link")).toBeNull();
    expect((screen.getByRole("button", { name: /wait/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ships every yc- animation with a reduced-motion twin", () => {
    const { container } = render(<YourcatMotionStyles />);
    const css = container.querySelector("style")?.textContent ?? "";
    const classes = Array.from(new Set(Array.from(css.matchAll(/\.(yc-[a-z-]+)\s*[{,]/g)).map((match) => match[1])));
    expect(classes.length).toBeGreaterThan(20);
    const [, reduced = ""] = css.split("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toBeTruthy();
    for (const name of classes) {
      if (name === "yc-paused") continue;
      expect({ name, inReducedBlock: reduced.includes(`.${name}`) }).toEqual({ name, inReducedBlock: true });
    }
    expect(css).not.toMatch(/framer|phaser/i);
  });

  it("keeps the fireflies visible but still, and drops the glow ring, under reduced motion", () => {
    const { container } = render(<YourcatMotionStyles />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@keyframes yc-firefly");
    expect(css).toContain("@keyframes yc-ring");
    const [motion, reduced = ""] = css.split("@media (prefers-reduced-motion: reduce)");
    expect(motion).toMatch(/\.yc-firefly \{[^}]*animation: yc-firefly/);
    expect(reduced).toMatch(/\.yc-firefly \{ animation: none; opacity: \.6; \}/);
    expect(reduced).not.toMatch(/\.yc-firefly[^{]*\{[^}]*display: none/);
    expect(reduced).toMatch(/\.yc-ring \{ animation: none; display: none; \}/);
    // Transform and opacity only.
    const fly = css.slice(css.indexOf("@keyframes yc-firefly"), css.indexOf("}\n", css.indexOf("75% {")) + 1);
    expect(fly).not.toMatch(/\b(left|top|width|height|margin)\s*:/);
  });
});
