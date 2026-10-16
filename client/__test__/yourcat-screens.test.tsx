/**
 * @jest-environment jsdom
 */
/**
 * Batch E screens of `/yourcat` (docs/plans/yourcat-polish.md "Manual pick", S5, S6, "App build",
 * §11 `PaidFrameContent`): the manual pick (first family preselected, base six first, "More looks"),
 * the upsell (2:3 examples, price from the status), the paid frame states (painting, wipe, ready),
 * the paw pulse that stops, the reduced-motion variants, and an app notice with no price. The page's
 * manual H1 (`ManualPickHeading`, column 2 row 1 on md+) and the S6 cat beside the paid frame (sit
 * with a slow blink, then idle facing the frame at the end of the wipe; reduced motion: a 120 ms
 * cross-fade of frame 0) are pinned here too.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

const mockTrack = jest.fn();
const mockTrackEvent = jest.fn();
jest.mock("@/analytics", () => ({
  analytics: { track: (...args: unknown[]) => mockTrack(...args) },
  reportAppError: jest.fn(),
}));
jest.mock("@/components/GoogleTagManager", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
const mockCheckout = jest.fn();
jest.mock("@/api/yourcat-api", () => {
  class YourcatRequestError extends Error {
    constructor(
      readonly status: number,
      readonly kind: string,
      readonly code: string | null,
    ) {
      super("x");
      Object.setPrototypeOf(this, YourcatRequestError.prototype);
    }
  }
  return { YOURCAT_API: { portraitCheckout: (...args: unknown[]) => mockCheckout(...args) }, YourcatRequestError };
});
const mockPlayHomeSound = jest.fn();
jest.mock("@/components/home/homeSfx", () => ({
  playHomeSound: (...args: unknown[]) => mockPlayHomeSound(...args),
  primeHomeSounds: jest.fn(),
}));
// jsdom has no 2D canvas, so the real burst ends at once: a stand-in shows what was asked for.
jest.mock("@/components/yourcat/Burst", () => ({
  Burst: ({ count, reducedMotion }: { count: number; reducedMotion: boolean }) =>
    reducedMotion ? null : <span data-testid="mock-burst" data-count={count} />,
}));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn(), systemAudioAllowed: () => false }));
const mockToast = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));
jest.mock("@/features/portrait/components/StylePickerDrawer", () => ({
  PortraitStyle: { HIGHNESS: "highness", MONARCH: "monarch", ARISTOCRAT: "aristocrat", COMMANDER: "commander" },
}));
// The S3 meeting tests drive the card list by hand: `mockCards.current` is what the hook returns.
const mockCards: { current: { variants: Record<string, unknown>; failed: boolean } } = { current: { variants: {}, failed: false } };
jest.mock("@/components/yourcat/useShareCards", () => ({
  ...jest.requireActual("@/components/yourcat/useShareCards"),
  useShareCards: () => mockCards.current,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { AppOnlyNotice } from "@/components/yourcat/AppOnlyNotice";
import { headlineText, YourcatMotionStyles } from "@/components/yourcat/brand";
import { formatPrice, MANUAL, PRIVACY, S3, S5, S6, STATUS_COPY } from "@/components/yourcat/copy";
import { BASE_FAMILIES, ManualPick, ManualPickHeading, orderFamilies, TILE_STAGGER_MS } from "@/components/yourcat/ManualPick";
import { StudioContext, type Studio } from "@/components/yourcat/studio";
import {
  PAID_FADE_MS,
  PAID_FRAME_INNER,
  PAID_WIPE_MS,
  PAW_PULSE,
  PaidFrameContent,
  PaidState,
} from "@/components/yourcat/PaidState";
import { PortraitUpsell, UPSELL_EXAMPLE } from "@/components/yourcat/PortraitUpsell";
import { PrivacyPanel } from "@/components/yourcat/PrivacyPanel";
import {
  BLINK_EVERY_MS,
  GROOM_PETS,
  HEART_SPREAD,
  HEART_SWAY,
  heartSpread,
  NOSE_X_FACING_LEFT,
  PET_CAT_CSS,
  PetCat,
  RELEASE_BOUNCE_MS,
} from "@/components/yourcat/PetCat";
import {
  MEETING_GAP,
  meetingWalkDx,
  PRINT_FADE_MS,
  PRINT_STAGGER_MS,
  RevealStep,
  shelterPlate,
} from "@/components/yourcat/RevealStep";
import { CLOCK } from "@/components/yourcat/motion";
import type { YourcatFamilyOption, YourcatStatusView, YourcatView } from "@/models/yourcat";

const LABELS: Record<string, string> = {
  BLACK: "Black", GREY: "Grey", PINKIE: "Pinkie", SIAMESE: "Siamese", YELLOW: "Ginger", WHITE: "White",
  MAINE: "Maine", OREO: "Oreo", MIST: "Mist", FOLD: "Fold", OBSIDIAN: "Obsidian", SAVANHAN: "Savannah",
  BALINESE: "Balinese", OBI: "Obi", OLIVE: "Olive", PICKLES: "Pickles", RASCAL: "Rascal", SABLE: "Sable",
  FICUS: "Ficus", MERLOT: "Merlot", TROUFAS: "Troufas",
};
// Deliberately not in the base-six order: the screen must sort them.
const FAMILY_KEYS = ["MAINE", "WHITE", "OREO", "BLACK", "MIST", "YELLOW", "FOLD", "GREY", "OBSIDIAN", "SIAMESE", "SAVANHAN",
  "PINKIE", "BALINESE", "OBI", "OLIVE", "PICKLES", "RASCAL", "SABLE", "FICUS", "MERLOT", "TROUFAS"];
const FAMILIES: YourcatFamilyOption[] = FAMILY_KEYS.map((family) => ({
  family,
  label: LABELS[family],
  spriteImg: `https://cdn.test/${family}/base.png`,
}));

const RECORD: YourcatView = {
  id: "64e2e0000000000000000c01",
  shareId: "AbCdEfGhIjKl",
  name: "Mochi",
  named: true,
  family: "YELLOW",
  familyLabel: "Ginger",
  cat: { _id: "c1", name: "Mochi", type: "FIRE", spriteImg: "https://cdn.test/YELLOW/base.png", catImg: "https://cdn.test/YELLOW/base/GROOMING.gif" },
  avatar: { status: "ready", url: "https://cdn.test/avatar.png" },
  photo: { stored: true, deleteAfter: "2026-11-10T00:00:00.000Z" },
  portrait: { status: "none", style: null, url: null },
  createdAt: "2026-10-11T10:00:00.000Z",
} as YourcatView;
const PORTRAIT: YourcatStatusView["portrait"] = {
  enabled: true,
  priceCents: 1700, // deliberately not the live price: the client must never hard-code it
  currency: "EUR",
  styles: ["highness", "monarch", "aristocrat", "commander"],
};

type AnimateCall = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let animateCalls: AnimateCall[] = [];
const originalAnimate = (Element.prototype as { animate?: unknown }).animate;

beforeEach(() => {
  mockTrack.mockClear();
  mockTrackEvent.mockClear();
  mockPlayHomeSound.mockClear();
  mockCheckout.mockReset();
  animateCalls = [];
  (Element.prototype as unknown as { animate: unknown }).animate = function animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    animateCalls.push({ keyframes, options });
    return { cancel: jest.fn(), finish: jest.fn(), onfinish: null, oncancel: null } as unknown as Animation;
  };
});
afterAll(() => {
  (Element.prototype as unknown as { animate: unknown }).animate = originalAnimate;
});

const tiles = () => screen.getAllByTestId("yourcat-family-tile");

describe("ManualPick", () => {
  const renderPick = (props: Partial<React.ComponentProps<typeof ManualPick>> = {}) =>
    render(<ManualPick families={FAMILIES} busy={false} onMake={jest.fn(async () => null)} onBack={jest.fn()} {...props} />);

  it("shows the base six first in order, the first one preselected, and reports it for the stage", () => {
    const onSelect = jest.fn();
    renderPick({ onSelect });
    expect(screen.getByRole("heading", { level: 2, name: headlineText(MANUAL.titleParts) })).toBeTruthy();
    expect(tiles().map((tile) => tile.getAttribute("data-family"))).toEqual([...BASE_FAMILIES]);
    expect(tiles().map((tile) => tile.textContent)).toEqual(["Black", "Grey", "Pinkie", "Siamese", "Ginger", "White"]);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[0].value).toBe("BLACK");
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ family: "BLACK", spriteImg: "https://cdn.test/BLACK/base.png" }));
  });

  it("on the page: the H1 sits in the heading block (column 2, row 1 on md+) and the panel drops its H2", () => {
    render(
      <>
        <ManualPickHeading />
        <ManualPick families={FAMILIES} busy={false} onMake={jest.fn(async () => null)} titled={false} />
      </>,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: headlineText(MANUAL.titleParts) });
    const block = screen.getByTestId("yourcat-heading");
    expect(block.contains(h1)).toBe(true);
    expect(block.className).toMatch(/\bxl:col-start-2\b/);
    expect(block.className).toMatch(/\bxl:row-start-1\b/);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    const panel = screen.getByTestId("yourcat-manual");
    expect(panel.getAttribute("data-titled")).toBe("false");
    // The name field and the one action stay in the panel, in that order.
    const nameField = within(panel).getByLabelText(MANUAL.nameLabel);
    const make = within(panel).getByRole("button", { name: MANUAL.make });
    expect(nameField.compareDocumentPosition(make) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("'More looks' shows the other 15 after the base six and moves focus to the first of them", () => {
    renderPick();
    const more = screen.getByRole("button", { name: MANUAL.moreLooks });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(tiles()).toHaveLength(21);
    expect(tiles().slice(0, 6).map((tile) => tile.getAttribute("data-family"))).toEqual([...BASE_FAMILIES]);
    expect(tiles()[6].getAttribute("data-family")).toBe("MAINE");
    expect(document.activeElement).toBe(within(tiles()[6]).getByRole("radio"));
    expect(screen.getByRole("button", { name: MANUAL.fewerLooks }).getAttribute("aria-expanded")).toBe("true");
  });

  it("makes the selected family with the typed name", async () => {
    const onMake = jest.fn(async () => null);
    const onSelect = jest.fn();
    renderPick({ onMake, onSelect });
    fireEvent.click(within(tiles()[4]).getByRole("radio"));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ family: "YELLOW" }));
    fireEvent.change(screen.getByLabelText(MANUAL.nameLabel), { target: { value: "  Mochi " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: MANUAL.make }));
    });
    expect(onMake).toHaveBeenCalledWith("YELLOW", "Mochi");
  });

  it("staggers the tiles 50 ms apart and lifts the selected one; reduced motion does neither", () => {
    const { unmount } = renderPick();
    const staggers = animateCalls.map((call) => call.options.delay);
    expect(staggers).toEqual([0, 1, 2, 3, 4, 5].map((i) => i * TILE_STAGGER_MS));
    expect(tiles()[0].getAttribute("data-lift")).toBe("true");
    expect(tiles()[0].className).toMatch(/-translate-y-1/);
    expect(tiles()[1].getAttribute("data-lift")).toBe("false");
    unmount();

    animateCalls = [];
    renderPick({ reducedMotion: true });
    expect(animateCalls).toHaveLength(0);
    expect(tiles()[0].getAttribute("data-selected")).toBe("true");
    expect(tiles()[0].getAttribute("data-lift")).toBe("false");
    expect(tiles()[0].className).not.toMatch(/-translate-y-1/);
  });

  it("the Back pill says 'Back' while uploads are closed", () => {
    renderPick({ uploadsOpen: false });
    expect(screen.getByRole("button", { name: MANUAL.backPlain })).toBeTruthy();
  });

  it("orderFamilies keeps every family once", () => {
    const { base, more } = orderFamilies(FAMILIES);
    expect(base).toHaveLength(6);
    expect(more).toHaveLength(15);
    expect(new Set([...base, ...more].map((option) => option.family)).size).toBe(21);
  });
});

describe("PortraitUpsell", () => {
  it("shows the H2, four 2:3 examples, the strip and the price from the status", () => {
    render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} />);
    expect(screen.getByRole("heading", { level: 2, name: headlineText(S5.titleParts("Mochi")) })).toBeTruthy();
    const price = formatPrice(PORTRAIT.priceCents, PORTRAIT.currency);
    expect(price).toBe("€17");
    expect(screen.getByRole("button", { name: S5.button(price) })).toBeTruthy();
    expect(screen.getByText(S5.body("Mochi", price))).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: S5.legend })).toBeTruthy();
    const thumbs = screen.getAllByTestId("yourcat-upsell-style");
    expect(thumbs).toHaveLength(4);
    for (const thumb of thumbs) expect(thumb.querySelector("img")?.className).toMatch(/aspect-\[2\/3\]/);
    // The large example is native 2:3 on both breakpoints.
    expect(UPSELL_EXAMPLE.w / UPSELL_EXAMPLE.h).toBeCloseTo(2 / 3);
    expect(UPSELL_EXAMPLE.mdW / UPSELL_EXAMPLE.mdH).toBeCloseTo(2 / 3);
    const strip = screen.getByTestId("yourcat-upsell-strip");
    expect(within(strip).getByTestId("yourcat-upsell-avatar").getAttribute("src")).toBe("https://cdn.test/avatar.png");
    expect(strip.querySelector('img[src="/logo/arrow.webp"]')).toBeTruthy();
  });

  it("cross-fades the large example on choice, and swaps instantly under reduced motion", () => {
    const { unmount } = render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} />);
    const current = () => screen.getByTestId("yourcat-upsell-example").querySelector('[data-current="true"]') as HTMLImageElement;
    expect(current().getAttribute("data-style")).toBe("highness");
    expect(current().style.transition).toMatch(/opacity 220ms/);
    fireEvent.click(screen.getByRole("radio", { name: "Monarch" }));
    expect(current().getAttribute("data-style")).toBe("monarch");
    expect(current().getAttribute("alt")).toBe(S5.styleAlt("Monarch"));
    unmount();
    render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} reducedMotion />);
    expect(current().style.transition).toBe("");
  });

  it("runs the sheen once per hover of the action, never under reduced motion", () => {
    const { unmount } = render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} />);
    expect(screen.queryByTestId("yourcat-upsell-sheen")).toBeNull();
    fireEvent.pointerEnter(screen.getByTestId("yourcat-upsell-cta"));
    expect(screen.getByTestId("yourcat-upsell-sheen").querySelector(".yc-sheen-once")).toBeTruthy();
    unmount();
    render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} reducedMotion />);
    fireEvent.pointerEnter(screen.getByTestId("yourcat-upsell-cta"));
    expect(screen.queryByTestId("yourcat-upsell-sheen")).toBeNull();
  });

  it("opens checkout with the chosen style and the status price", async () => {
    mockCheckout.mockResolvedValue({ checkoutUrl: "https://checkout.stripe.test/s", orderId: "o1" });
    const navigate = jest.fn();
    render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} navigate={navigate} />);
    fireEvent.click(screen.getByRole("radio", { name: "Commander" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: S5.button("€17") }));
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.test/s"));
    expect(mockCheckout).toHaveBeenCalledWith(RECORD.id, "commander");
    expect(mockTrackEvent).toHaveBeenCalledWith("begin_checkout", expect.objectContaining({ value: 17 }));
  });

  it("uses the sprite in the strip while there is no pixel avatar", () => {
    const record = { ...RECORD, avatar: { status: "failed" as const, url: null } };
    render(<PortraitUpsell record={record} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} />);
    const avatar = screen.getByTestId("yourcat-upsell-avatar");
    expect(avatar.tagName).toBe("DIV");
    expect(avatar.style.backgroundImage).toContain("https://cdn.test/YELLOW/base.png");
  });

  it("has no urgency, countdown or shelter wording", () => {
    const { container } = render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={jest.fn()} />);
    const text = container.textContent || "";
    expect(text).not.toMatch(/limited|hurry|only \d|left|ends in|today only|shelter|pink paw|donat/i);
  });
});

describe("PaidFrameContent", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const frame = (props: Partial<React.ComponentProps<typeof PaidFrameContent>> = {}) => (
    <PaidFrameContent
      avatarUrl="https://cdn.test/avatar.png"
      spriteImg="https://cdn.test/YELLOW/base.png"
      portraitUrl={null}
      status="painting"
      reducedMotion={false}
      {...props}
    />
  );

  it("frames a 2:3 inner box", () => {
    expect(PAID_FRAME_INNER.w / PAID_FRAME_INNER.h).toBeCloseTo(2 / 3);
    expect(PAID_FRAME_INNER.mdW / PAID_FRAME_INNER.mdH).toBeCloseTo(2 / 3);
    expect([PAID_FRAME_INNER.w, PAID_FRAME_INNER.h, PAID_FRAME_INNER.mdW, PAID_FRAME_INNER.mdH]).toEqual([128, 192, 256, 384]);
  });

  it("painting: the quantised avatar under a cream veil with 'Painting…'", () => {
    render(frame());
    expect(screen.getByTestId("yourcat-paid-frame").getAttribute("data-phase")).toBe("painting");
    expect(screen.getByTestId("yourcat-paid-quantised")).toBeTruthy();
    expect(screen.getByText(S6.paintingLabel)).toBeTruthy();
    expect(screen.queryByTestId("yourcat-paid-portrait")).toBeNull();
    expect(mockPlayHomeSound).not.toHaveBeenCalled();
  });

  it("painting without an avatar shows the sprite frame instead", () => {
    render(frame({ avatarUrl: null }));
    expect(screen.queryByTestId("yourcat-paid-quantised")).toBeNull();
    expect(screen.getByTestId("yourcat-paid-sprite")).toBeTruthy();
  });

  it("turning ready wipes the veil (900 ms); at the end of the wipe it bursts 12 and purrs once", () => {
    const { rerender } = render(frame());
    rerender(frame({ status: "ready", portraitUrl: "https://cdn.test/hd.webp" }));
    expect(screen.getByTestId("yourcat-paid-frame").getAttribute("data-phase")).toBe("revealing");
    const veil = screen.getByTestId("yourcat-paid-veil");
    expect(veil.className).toMatch(/\byc-wipe\b/);
    expect(veil.getAttribute("data-wipe")).toBe("wipe");
    expect(screen.getByTestId("yourcat-paid-portrait").getAttribute("src")).toBe("https://cdn.test/hd.webp");
    expect(screen.getByTestId("yourcat-paid-portrait").className).not.toMatch(/pixelated/);
    // Nothing yet while the veil wipes.
    expect(screen.queryByTestId("mock-burst")).toBeNull();
    expect(mockPlayHomeSound).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(PAID_WIPE_MS + 150);
    });
    expect(screen.getByTestId("yourcat-paid-frame").getAttribute("data-phase")).toBe("ready");
    expect(screen.queryByTestId("yourcat-paid-veil")).toBeNull();
    expect(screen.getByTestId("mock-burst").getAttribute("data-count")).toBe("12");
    expect(mockPlayHomeSound).toHaveBeenCalledTimes(1);
    expect(mockPlayHomeSound).toHaveBeenCalledWith("purr");
    rerender(frame({ status: "ready", portraitUrl: "https://cdn.test/hd.webp" }));
    expect(mockPlayHomeSound).toHaveBeenCalledTimes(1);
  });

  it("the wipe also ends on animationend", () => {
    const { rerender } = render(frame());
    rerender(frame({ status: "ready", portraitUrl: "https://cdn.test/hd.webp" }));
    fireEvent.animationEnd(screen.getByTestId("yourcat-paid-veil"));
    expect(screen.getByTestId("yourcat-paid-frame").getAttribute("data-phase")).toBe("ready");
  });

  it("reduced motion: a 300 ms fade, then the purr, and no burst", () => {
    const { rerender } = render(frame({ reducedMotion: true }));
    rerender(frame({ status: "ready", portraitUrl: "https://cdn.test/hd.webp", reducedMotion: true }));
    const veil = screen.getByTestId("yourcat-paid-veil");
    expect(veil.getAttribute("data-wipe")).toBe("fade");
    expect(veil.style.animation).toMatch(/yc-fade-out 300ms/);
    expect(mockPlayHomeSound).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(PAID_FADE_MS + 150);
    });
    expect(screen.queryByTestId("yourcat-paid-burst")).toBeNull();
    expect(screen.queryByTestId("mock-burst")).toBeNull();
    expect(mockPlayHomeSound).toHaveBeenCalledTimes(1);
    expect(mockPlayHomeSound).toHaveBeenCalledWith("purr");
  });

  it("a page that opens ready shows the portrait at once, with no wipe, burst or purr", () => {
    render(frame({ status: "ready", portraitUrl: "https://cdn.test/hd.webp" }));
    expect(screen.getByTestId("yourcat-paid-frame").getAttribute("data-phase")).toBe("ready");
    expect(screen.queryByTestId("yourcat-paid-veil")).toBeNull();
    expect(screen.queryByTestId("yourcat-paid-burst")).toBeNull();
    expect(mockPlayHomeSound).not.toHaveBeenCalled();
  });
});

describe("the S6 cat beside the paid frame", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const labels = { pet: "Pet Mochi", tap: "Tap Mochi", purrs: "Mochi purrs." };
  /** What the page passes: sit with a slow blink while painting, idle facing the frame once hung. */
  const renderCat = (reducedMotion: boolean) => (phase: "painting" | "revealing" | "ready") => (
    <PetCat
      spriteImg="https://cdn.test/YELLOW/base.png"
      name="Mochi"
      labels={labels}
      mode={phase === "ready" ? "idle" : "sit"}
      facing={phase === "ready" ? "left" : "right"}
      blink
      reducedMotion={reducedMotion}
    />
  );
  /** The page's studio with only the stage's cat slot in place. */
  const withStudio = (catSlot: HTMLElement, node: React.ReactNode) => {
    const studio: Studio = {
      slots: { frameFx: null, companion: null, cat: catSlot, overlay: null, panel: null, extras: null },
      frame: { current: null },
      stage: { current: null },
      configure: () => undefined,
      listen: () => undefined,
      replay: () => undefined,
    };
    return <StudioContext.Provider value={studio}>{node}</StudioContext.Provider>;
  };
  const paidFrame = (status: "painting" | "ready", reducedMotion: boolean) => (
    <PaidFrameContent
      avatarUrl="https://cdn.test/avatar.png"
      spriteImg="https://cdn.test/YELLOW/base.png"
      portraitUrl={status === "ready" ? "https://cdn.test/hd.webp" : null}
      status={status}
      reducedMotion={reducedMotion}
      renderCat={renderCat(reducedMotion)}
    />
  );
  let catSlot: HTMLElement;
  beforeEach(() => {
    catSlot = document.createElement("div");
    catSlot.setAttribute("data-testid", "cat-slot");
    document.body.appendChild(catSlot);
  });
  afterEach(() => catSlot.remove());
  const cat = () => within(catSlot).getByTestId("yourcat-petcat");
  const layer = () => cat().querySelector<HTMLElement>("[data-anim]") as HTMLElement;

  it("stands in the stage's cat slot (as on S3), sits facing out and blinks every 4 s (frames 0, 1, 2, 1, 0)", () => {
    render(withStudio(catSlot, paidFrame("painting", false)));
    expect(cat().getAttribute("data-pose")).toBe("sit");
    expect(cat().getAttribute("data-facing")).toBe("right");
    expect(cat().getAttribute("data-blink")).toBe("true");
    // The S3 scale: 3x on phones, 4x on md+.
    expect(cat().className).toMatch(/\[--s:3\]/);
    expect(cat().className).toMatch(/md:\[--s:4\]/);
    // Held on sit frame 0: no looping strip.
    expect(layer().getAttribute("data-anim")).toBe("sit");
    expect(layer().className).not.toMatch(/\byc-sprite\b/);
    expect(layer().getAttribute("data-frame")).toBe("0");
    const seen: string[] = [];
    act(() => {
      jest.advanceTimersByTime(BLINK_EVERY_MS - 1);
    });
    seen.push(layer().getAttribute("data-frame") as string);
    for (let step = 0; step < 4; step += 1) {
      act(() => {
        jest.advanceTimersByTime(step === 0 ? 1 : 125);
      });
      seen.push(layer().getAttribute("data-frame") as string);
    }
    expect(seen).toEqual(["0", "1", "2", "1", "0"]);
  });

  it("stays pettable while it sits: a tap purrs and loafs, then it sits again", () => {
    render(withStudio(catSlot, paidFrame("painting", false)));
    const button = within(catSlot).getByRole("button", { name: "Pet Mochi" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.pointerDown(button);
    expect(mockPlayHomeSound).toHaveBeenCalledWith("purr");
    expect(cat().getAttribute("data-pose")).toBe("loaf");
    fireEvent.pointerUp(button);
    act(() => {
      jest.advanceTimersByTime(1300);
    });
    expect(cat().getAttribute("data-pose")).toBe("sit");
  });

  it("at the end of the wipe it stands (idle row) facing the frame, with the purr and the 12-pixel burst", () => {
    const { rerender } = render(withStudio(catSlot, paidFrame("painting", false)));
    rerender(withStudio(catSlot, paidFrame("ready", false)));
    // While the veil wipes it still sits.
    expect(cat().getAttribute("data-pose")).toBe("sit");
    expect(screen.queryByTestId("mock-burst")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(PAID_WIPE_MS + 150);
    });
    expect(cat().getAttribute("data-pose")).toBe("idle");
    expect(cat().getAttribute("data-facing")).toBe("left");
    expect(cat().getAttribute("data-blink")).toBeNull();
    expect(layer().className).toMatch(/\byc-sprite\b/);
    expect(screen.getByTestId("mock-burst").getAttribute("data-count")).toBe("12");
    expect(mockPlayHomeSound).toHaveBeenCalledTimes(1);
  });

  it("a page that opens ready shows it standing at once", () => {
    render(withStudio(catSlot, paidFrame("ready", false)));
    expect(cat().getAttribute("data-pose")).toBe("idle");
    expect(cat().getAttribute("data-facing")).toBe("left");
  });

  it("reduced motion: sit frame 0 (no blink), then idle frame 0 with a 120 ms fade", () => {
    const { rerender } = render(withStudio(catSlot, paidFrame("painting", true)));
    expect(cat().getAttribute("data-blink")).toBeNull();
    expect(cat().querySelector(".yc-sprite")).toBeNull();
    expect(layer().getAttribute("data-anim")).toBe("sit");
    expect(layer().getAttribute("data-frame")).toBe("0");
    act(() => {
      jest.advanceTimersByTime(BLINK_EVERY_MS * 2);
    });
    expect(layer().getAttribute("data-frame")).toBe("0");
    rerender(withStudio(catSlot, paidFrame("ready", true)));
    act(() => {
      jest.advanceTimersByTime(PAID_FADE_MS + 150);
    });
    const layers = Array.from(cat().querySelectorAll<HTMLElement>("[data-anim]"));
    const idle = layers.find((node) => node.getAttribute("data-anim") === "idle") as HTMLElement;
    const sit = layers.find((node) => node.getAttribute("data-anim") === "sit") as HTMLElement;
    expect(idle.getAttribute("data-frame")).toBe("0");
    expect(idle.style.animation).toMatch(/yc-fade-in 120ms/);
    expect(sit.style.animation).toMatch(/yc-fade-out 120ms/);
    expect(screen.queryByTestId("mock-burst")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(130);
    });
    expect(cat().querySelector('[data-anim="sit"]')).toBeNull();
    expect(cat().querySelector('[data-anim="idle"]')).toBeTruthy();
    // Still pettable under reduced motion.
    fireEvent.pointerDown(within(catSlot).getByRole("button", { name: "Pet Mochi" }));
    expect(within(catSlot).getByTestId("yourcat-petcat-caption").textContent).toBe("Mochi purrs.");
  });
});

describe("PaidState", () => {
  const painting = { ...RECORD, portrait: { status: "painting" as const, style: "monarch" as const, url: null } };
  const ready = { ...RECORD, portrait: { status: "ready" as const, style: "monarch" as const, url: "https://cdn.test/hd.webp" } };

  it("painting: the headline, the body and a paw that pulses every 2 s and stops after 4 cycles", () => {
    render(<PaidState record={painting} name="Mochi" portrait={PORTRAIT} late={false} onBack={jest.fn()} reportPaid />);
    expect(screen.getByRole("heading", { level: 1, name: headlineText(S6.paintingTitleParts("Mochi")) })).toBeTruthy();
    expect(screen.getByText(S6.paintingBody)).toBeTruthy();
    const paw = screen.getByTestId("yourcat-paid-paw");
    expect(paw.getAttribute("class")).toMatch(/\byc-paw\b/);
    expect(PAW_PULSE).toEqual({ periodMs: 2000, cycles: 4 });
    // The keyframe rule itself is finite: 2 s, 4 iterations, and none under reduced motion.
    const { container } = render(<YourcatMotionStyles />);
    const css = container.textContent || "";
    expect(css).toMatch(/\.yc-paw\s*\{\s*animation:\s*yc-paw 2s [^;]* 4;/);
    expect(css).not.toMatch(/\.yc-paw\s*\{[^}]*infinite/);
    expect(css.slice(css.indexOf("prefers-reduced-motion"))).toMatch(/\.yc-paw/);
  });

  it("reduced motion: the paw does not pulse", () => {
    render(<PaidState record={painting} name="Mochi" portrait={PORTRAIT} late={false} onBack={jest.fn()} reducedMotion />);
    const paw = screen.getByTestId("yourcat-paid-paw");
    expect(paw.getAttribute("class")).not.toMatch(/\byc-paw\b/);
    expect(paw.getAttribute("data-pulse")).toBe("off");
  });

  it("ready on the paid screen: the headline, Download 4K, Play as Mochi and Back, no portrait in the panel", () => {
    const onBack = jest.fn();
    render(<PaidState record={ready} name="Mochi" portrait={PORTRAIT} late={false} onBack={onBack} reportPaid />);
    expect(screen.getByRole("heading", { level: 1, name: headlineText(S6.readyTitleParts) })).toBeTruthy();
    expect(screen.getByRole("button", { name: S6.download })).toBeTruthy();
    expect(screen.getByRole("link", { name: S6.play("Mochi") }).getAttribute("href")).toBe("/game");
    fireEvent.click(screen.getByRole("button", { name: S6.back("Mochi") }));
    expect(onBack).toHaveBeenCalled();
    // The painting hangs in the stage frame on this screen (PaidFrameContent), not in the panel.
    expect(screen.queryByTestId("yourcat-paid-inline-portrait")).toBeNull();
  });

  it("inline on S3 (no stage): the ready portrait shows in the panel", () => {
    render(<PaidState record={ready} name="Mochi" portrait={PORTRAIT} late={false} onBack={jest.fn()} />);
    expect(screen.getByTestId("yourcat-paid-inline-portrait").getAttribute("src")).toBe("https://cdn.test/hd.webp");
    expect(screen.getByRole("img", { name: S6.portraitAlt("Mochi") })).toBeTruthy();
  });

  it("late and failed keep their copy", () => {
    const { unmount } = render(<PaidState record={painting} name="Mochi" portrait={PORTRAIT} late onBack={jest.fn()} />);
    expect(screen.getByRole("heading", { name: S6.lateTitle })).toBeTruthy();
    expect(screen.getByText(S6.late)).toBeTruthy();
    unmount();
    const failed = { ...RECORD, portrait: { status: "failed" as const, style: "monarch" as const, url: null } };
    render(<PaidState record={failed} name="Mochi" portrait={PORTRAIT} late={false} onBack={jest.fn()} />);
    expect(screen.getByText(S6.failed)).toBeTruthy();
  });
});

describe("AppOnlyNotice and PrivacyPanel", () => {
  it("the app notice has the headline, Play now and Copy link, and no price", () => {
    const { container } = render(<AppOnlyNotice />);
    expect(screen.getByRole("heading", { level: 1, name: STATUS_COPY.appTitle })).toBeTruthy();
    expect(screen.getByRole("link", { name: STATUS_COPY.playNow }).getAttribute("href")).toBe("/game");
    expect(screen.getByRole("button", { name: STATUS_COPY.copyLink })).toBeTruthy();
    expect(container.textContent).not.toMatch(/€|\$|EUR|price|portrait/i);
    expect(screen.queryByTestId("yourcat-frame")).toBeNull();
  });

  it("the privacy panel lists every paragraph, closed renders nothing", () => {
    const { rerender, container } = render(<PrivacyPanel open id="privacy" />);
    expect(screen.getByRole("heading", { level: 2, name: PRIVACY.title })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(PRIVACY.paragraphs.length);
    expect(container.textContent).not.toMatch(/€/);
    rerender(<PrivacyPanel open={false} id="privacy" />);
    expect(container.textContent).toBe("");
  });
});

describe("PetCat, round 3 (R2-05, R2-06)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const labels = { pet: "Pet Mochi", tap: "Tap Mochi", purrs: "Mochi purrs." };
  const cat = () => screen.getByTestId("yourcat-petcat");
  const button = () => screen.getByRole("button", { name: "Pet Mochi" });
  const pet = () => {
    fireEvent.pointerDown(button());
    fireEvent.pointerUp(button());
  };

  it("draws hearts on a 2x pixel grid: 12 px on phones, 18 px on md+, with crisp edges", () => {
    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    pet();
    const svg = screen.getAllByTestId("yourcat-heart-svg")[0];
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(svg.getAttribute("viewBox")).toBe("0 0 6 6");
    const classes = svg.getAttribute("class") ?? "";
    expect(classes).toContain("h-3 w-3");
    expect(classes).toContain("md:h-[18px] md:w-[18px]");
  });

  it("spreads a pet's 3 to 5 hearts over ±16 px, 70 ms apart, each swaying ±4 px", () => {
    for (const count of [3, 4, 5]) {
      for (const random of [() => 0, () => 0.5, () => 0.999]) {
        const spots = heartSpread(count, random);
        expect(spots).toHaveLength(count);
        spots.forEach((spot, index) => {
          expect(Math.abs(spot.x)).toBeLessThanOrEqual(HEART_SPREAD);
          expect(Math.abs(spot.sway)).toBe(HEART_SWAY);
          expect(spot.delay).toBe(index * 70);
        });
        // Left to right across the spread, the sway alternating.
        expect(spots[0].x).toBeLessThanOrEqual(-HEART_SPREAD + 2);
        expect(spots[count - 1].x).toBeGreaterThanOrEqual(HEART_SPREAD - 2);
        expect(spots[0].sway).toBe(-spots[1].sway);
      }
    }
    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    pet();
    const hearts = screen.getAllByTestId("yourcat-heart");
    expect(hearts.length).toBeGreaterThanOrEqual(3);
    expect(hearts.length).toBeLessThanOrEqual(5);
    for (const heart of hearts) {
      expect(Math.abs(Number(heart.getAttribute("data-x")))).toBeLessThanOrEqual(HEART_SPREAD);
      const rise = heart.firstElementChild as HTMLElement;
      expect(rise.className).toContain("yc-pc-heart");
      expect(["4px", "-4px"]).toContain(rise.style.getPropertyValue("--yc-sway"));
    }
  });

  it("bounces for one sprite frame when released, never under reduced motion", () => {
    expect(RELEASE_BOUNCE_MS).toBe(125);
    expect(PET_CAT_CSS).toContain(".yc-pc-bounce { animation: yc-pc-bounce 125ms steps(1, end) both;");
    const { container, unmount } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    fireEvent.pointerDown(button());
    expect(container.querySelector(".yc-pc-bounce")).toBeNull();
    fireEvent.pointerUp(button());
    expect(container.querySelector(".yc-pc-bounce")).toBeTruthy();
    unmount();
    const calm = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion />);
    pet();
    expect(calm.container.querySelector(".yc-pc-bounce")).toBeNull();
  });

  it("grooms once after three pets within 5 s, then rests; slower pets never groom", () => {
    expect(GROOM_PETS).toBe(3);
    const { unmount } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    for (let i = 0; i < GROOM_PETS; i++) {
      pet();
      act(() => jest.advanceTimersByTime(400));
    }
    expect(cat().getAttribute("data-pose")).toBe("loaf");
    act(() => jest.advanceTimersByTime(1000));
    expect(cat().getAttribute("data-pose")).toBe("groom");
    const layer = cat().querySelector('[data-anim="groom"]') as HTMLElement;
    expect(layer.getAttribute("data-row")).toBe("2");
    expect(layer.style.getPropertyValue("--yc-iter")).toBe("1");
    act(() => jest.advanceTimersByTime(15 * 125 + 10));
    expect(cat().getAttribute("data-pose")).toBe("idle");
    unmount();

    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    for (let i = 0; i < GROOM_PETS; i++) {
      pet();
      act(() => jest.advanceTimersByTime(2600));
    }
    expect(cat().getAttribute("data-pose")).toBe("idle");
  });

  it("the caption is text-p5 in a 44 px box, and pressing it pets the cat too", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const caption = screen.getByTestId("yourcat-petcat-caption");
    expect(caption.className).toContain("text-p5");
    expect(caption.className).toContain("min-h-11");
    expect(caption.className).not.toContain("pointer-events-none");
    expect(caption.getAttribute("aria-live")).toBe("polite");
    fireEvent.pointerDown(caption);
    expect(mockPlayHomeSound).toHaveBeenCalledWith("purr");
    expect(cat().getAttribute("data-pose")).toBe("loaf");
    expect(caption.textContent).toBe("Mochi purrs.");
    fireEvent.pointerUp(caption);
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} interactive={false} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-petcat-caption").className).toContain("pointer-events-none");
  });

  it("jumps out on its own arc: apex -64 px on phones, -96 px on md+", () => {
    const { container } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} entrance="jumpOut" reducedMotion={false} />);
    const jump = container.querySelector(".yc-jump-out") as HTMLElement;
    expect(jump.style.animationName).toBe("yc-pc-jump");
    expect(cat().className).toContain("[--yc-apex:-64px]");
    expect(cat().className).toContain("md:[--yc-apex:-96px]");
    expect(PET_CAT_CSS).toMatch(/50% \{ transform: translate\(calc\(var\(--yc-jx, -56px\) \/ 2\), var\(--yc-apex, -64px\)\)/);
  });

  it("walks dx px on the walk row (8 frames over the walk), facing where it goes, and stays there", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} facing="left" reducedMotion={false} />);
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} facing="left" walk={{ id: 1, dx: -150, ms: 700 }} reducedMotion={false} />);
    expect(cat().getAttribute("data-pose")).toBe("walk");
    expect(cat().getAttribute("data-walk")).toBe("walking");
    expect(cat().getAttribute("data-facing")).toBe("left");
    expect(cat().style.transform).toBe("translateX(-150px)");
    expect(cat().style.transition).toBe("transform 700ms linear");
    const layer = cat().querySelector('[data-anim="walk"]') as HTMLElement;
    expect(layer.getAttribute("data-row")).toBe("9");
    expect(layer.style.getPropertyValue("--yc-frames")).toBe("8");
    expect(layer.style.getPropertyValue("--yc-frame-ms")).toBe("88ms");
    act(() => jest.advanceTimersByTime(700));
    expect(cat().getAttribute("data-walk")).toBe("arrived");
    expect(cat().getAttribute("data-pose")).toBe("idle");
    expect(cat().style.transform).toBe("translateX(-150px)");
    expect(cat().style.transition).toBe("");
    // The same walk with a new dx (a resize) only moves it.
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} facing="left" walk={{ id: 1, dx: -120, ms: 700 }} reducedMotion={false} />);
    expect(cat().getAttribute("data-walk")).toBe("arrived");
    expect(cat().style.transform).toBe("translateX(-120px)");
  });

  it("reduced motion: no walk row; it fades in where the walk ends (120 ms)", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} facing="left" reducedMotion />);
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} facing="left" mode="sit" walk={{ id: 1, dx: -150, ms: 120 }} reducedMotion />);
    expect(cat().getAttribute("data-pose")).toBe("sit");
    expect(cat().style.transform).toBe("translateX(-150px)");
    expect(cat().style.transition).toBe("");
    expect(cat().style.animation).toContain("yc-fade-in 120ms");
    expect(cat().querySelector('[data-anim="walk"]')).toBeNull();
    act(() => jest.advanceTimersByTime(120));
    expect(cat().getAttribute("data-walk")).toBe("arrived");
  });

  it("the meeting heart rises in front of the face", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} mode="sit" facing="left" heartOnce={0} reducedMotion={false} />);
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} mode="sit" facing="left" heartOnce={1} reducedMotion={false} />);
    const [heart] = screen.getAllByTestId("yourcat-heart");
    expect(heart.getAttribute("data-x")).toBe("front");
    expect(NOSE_X_FACING_LEFT).toBe(11);
  });
});

describe("the S3 meeting walk (R2-02) and the md+ controls (R2-04)", () => {
  const ZARE = { name: "Zare", image: "/yourcat/pink-paw/zare-card.webp" };
  const box = (left: number, right: number, top = 0, bottom = 100) =>
    ({ left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  const SLOT_KEYS = ["frameFx", "companion", "cat", "overlay", "panel", "extras"] as const;
  let slots: Record<(typeof SLOT_KEYS)[number], HTMLElement>;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  let layout = true;

  beforeEach(() => {
    jest.useFakeTimers();
    layout = true;
    mockCards.current = { variants: {}, failed: false };
    slots = Object.fromEntries(
      SLOT_KEYS.map((key) => {
        const node = document.createElement("div");
        node.setAttribute("data-slot", key);
        document.body.appendChild(node);
        return [key, node];
      }),
    ) as unknown as typeof slots;
    // The companion slot ends at x 140; the cat's slot child starts at x 290, 144 px wide (scale 3).
    HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
      if (layout && this === slots.companion) return box(82, 140);
      if (layout && this.getAttribute("data-testid") === "yourcat-cat") return box(290, 434);
      return originalRect.call(this);
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    Object.values(slots).forEach((node) => node.remove());
    jest.useRealTimers();
  });

  const studio = (): Studio => ({
    slots,
    frame: { current: null },
    stage: { current: null },
    configure: () => undefined,
    listen: () => undefined,
    replay: () => undefined,
  });
  const reveal = (reducedMotion: boolean) => (
    <StudioContext.Provider value={studio()}>
      <RevealStep
        record={RECORD}
        avatarStatus="ready"
        clocked={false}
        reducedMotion={reducedMotion}
        nameError={null}
        onRename={async () => null}
        onDelete={async () => true}
        onStartOver={() => undefined}
        isGuest={false}
        secondsToReveal={null}
        shelterCandidates={() => Promise.resolve([ZARE])}
        toast={() => undefined}
      />
    </StudioContext.Provider>
  );
  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(0));
  };
  const cat = () => within(slots.cat).getByTestId("yourcat-petcat");

  it("the cat walks over to the shelter frame, then sits facing it with one heart between them", async () => {
    render(reveal(false));
    await settle();
    expect(within(slots.companion).getByTestId("yourcat-shelter-frame")).toBeTruthy();
    // Nose 8 px right of the frame: 140 + 8 - (290 + 11 x 3) = -175.
    expect(meetingWalkDx(box(290, 434), box(82, 140), MEETING_GAP.phone)).toBe(-175);
    expect(cat().getAttribute("data-walk")).toBe("walking");
    expect(cat().getAttribute("data-pose")).toBe("walk");
    expect(cat().getAttribute("data-facing")).toBe("left");
    expect(cat().style.transform).toBe("translateX(-175px)");
    expect(cat().style.transition).toBe(`transform ${CLOCK.MEETING_WALK}ms linear`);
    expect(within(slots.cat).queryAllByTestId("yourcat-heart")).toHaveLength(0);
    act(() => jest.advanceTimersByTime(CLOCK.MEETING_WALK));
    expect(cat().getAttribute("data-pose")).toBe("sit");
    expect(cat().getAttribute("data-facing")).toBe("left");
    expect(cat().style.transform).toBe("translateX(-175px)");
    const hearts = within(slots.cat).getAllByTestId("yourcat-heart");
    expect(hearts).toHaveLength(1);
    expect(hearts[0].getAttribute("data-x")).toBe("front");
  });

  it("md+ cat: scale 6 on md+ (3 on phones), with the wider gap", () => {
    render(reveal(false));
    expect(cat().className).toContain("[--s:3]");
    expect(cat().className).toContain("md:[--s:6]");
    // At scale 6 the nose is 66 px into the 288 px cell; the gap is 16.
    expect(meetingWalkDx(box(700, 988), box(300, 438), MEETING_GAP.md)).toBe(438 + 16 - (700 + 66));
    // Already there (or further left): no walk; no layout: null.
    expect(meetingWalkDx(box(100, 244), box(0, 140), 8)).toBe(0);
    expect(meetingWalkDx(box(0, 0), box(0, 140), 8)).toBeNull();
  });

  it("the shelter art is cropped to its cat, and a cream plate names it under the frame", async () => {
    render(reveal(false));
    await settle();
    const art = within(slots.companion).getByTestId("yourcat-shelter-art") as HTMLImageElement;
    expect(art.style.objectPosition).toBe("44% 58%");
    expect(art.style.transform).toBe("scale(1.2)");
    expect(art.className).toContain("object-cover");
    expect(shelterPlate("Zare", S3.meeting.frameAlt)).toBe("Zare · Pink Paw");
    const plate = within(slots.companion).getByTestId("yourcat-shelter-plate");
    expect(plate.textContent).toBe("Zare·Pink Paw");
    expect(plate.className).toMatch(/\bbg-tt-cream\b/);
    expect(plate.className).toMatch(/\btext-p6\b/);
    expect(plate.className).toMatch(/\buppercase\b/);
    expect(plate.getAttribute("aria-hidden")).toBe("true");
    // Inside the frame's wrapper, so it moves (and tilts) with the frame.
    expect(within(slots.companion).getByTestId("yourcat-shelter-frame").contains(plate)).toBe(true);
  });

  it("reduced motion: no walk; the cat fades to its sit beside the frame (120 ms) and the heart fades", async () => {
    render(reveal(true));
    await settle();
    expect(cat().getAttribute("data-pose")).toBe("sit");
    expect(cat().querySelector('[data-anim="walk"]')).toBeNull();
    expect(cat().style.transform).toBe("translateX(-175px)");
    expect(cat().style.animation).toContain(`yc-fade-in ${CLOCK.MEETING_WALK_RM}ms`);
    const [heart] = within(slots.cat).getAllByTestId("yourcat-heart");
    expect((heart.firstElementChild as HTMLElement).style.animation).toContain("yc-heart-calm");
  });

  it("with no layout to measure, the cat sits where it is after 300 ms", async () => {
    layout = false;
    render(reveal(false));
    await settle();
    expect(cat().getAttribute("data-walk")).toBeNull();
    act(() => jest.advanceTimersByTime(300));
    expect(cat().getAttribute("data-pose")).toBe("sit");
    expect(cat().style.transform).toBe("");
  });

  it("md+: the pills, the switch and the actions wait in their boxes for the card, then fade in 0/80/160 ms", async () => {
    const { rerender } = render(reveal(false));
    await settle();
    act(() => jest.advanceTimersByTime(300));
    const pills = within(slots.panel).getByTestId("yourcat-format-pills");
    const actions = within(slots.panel).getByTestId("yourcat-actions");
    const toggle = within(slots.panel).getByRole("switch", { hidden: true });
    for (const node of [pills, actions, toggle]) {
      expect(node.style.visibility).toBe("hidden");
      expect(node.style.opacity).toBe("0");
    }
    expect(actions.getAttribute("data-shown")).toBe("false");
    mockCards.current = {
      variants: { "post-panel": { file: new File(["png"], "mochi.png", { type: "image/png" }), url: "blob:card", name: "Mochi" } },
      failed: false,
    };
    rerender(reveal(false));
    await settle();
    expect(PRINT_STAGGER_MS).toEqual([0, 80, 160]);
    expect(PRINT_FADE_MS).toBe(240);
    [pills, toggle, actions].forEach((node, index) => {
      expect(node.style.visibility).toBe("visible");
      expect(node.style.opacity).toBe("1");
      expect(node.style.transition).toBe(`opacity 240ms cubic-bezier(.2,.8,.2,1) ${PRINT_STAGGER_MS[index]}ms, visibility 0ms linear ${PRINT_STAGGER_MS[index]}ms`);
    });
    expect(actions.getAttribute("data-shown")).toBe("true");
    // The card going away again (a format still drawing) keeps them shown.
    mockCards.current = { variants: {}, failed: false };
    rerender(reveal(false));
    await settle();
    expect(actions.style.visibility).toBe("visible");
  });

  it("md+: a card later than 600 ms shows them too, with 'Preparing card…' in the action row", async () => {
    render(reveal(false));
    await settle();
    const actions = within(slots.panel).getByTestId("yourcat-actions");
    expect(actions.style.visibility).toBe("hidden");
    act(() => jest.advanceTimersByTime(600));
    expect(actions.style.visibility).toBe("visible");
    expect(within(actions).getByRole("button", { name: S3.preparing })).toBeTruthy();
  });

  it("md+ under reduced motion: a 120 ms opacity change, no stagger", async () => {
    mockCards.current = {
      variants: { "post-panel": { file: new File(["png"], "mochi.png", { type: "image/png" }), url: "blob:card", name: "Mochi" } },
      failed: false,
    };
    render(reveal(true));
    await settle();
    const actions = within(slots.panel).getByTestId("yourcat-actions");
    expect(actions.style.visibility).toBe("visible");
    expect(actions.style.transition).toBe("opacity 120ms linear, visibility 120ms linear");
  });
});

describe("source rules", () => {
  const read = (file: string) => readFileSync(join(__dirname, "..", "components", "yourcat", file), "utf8");
  const FILES = ["ManualPick.tsx", "PortraitUpsell.tsx", "PaidState.tsx", "AppOnlyNotice.tsx", "PrivacyPanel.tsx"];

  it("no framer-motion, phaser, old button styles or hard-coded price", () => {
    for (const file of FILES) {
      const source = read(file);
      expect(source).not.toMatch(/from ["'](framer-motion|phaser)/);
      expect(source).not.toMatch(/GOLD_BUTTON|GHOST_BUTTON|EYEBROW|SUBTITLE|\bTITLE\b/);
      expect(source).not.toMatch(/€\s?\d|\b1400\b|value:\s*14\b/);
    }
  });

  it("the app notice and the privacy panel have no stage", () => {
    for (const file of ["AppOnlyNotice.tsx", "PrivacyPanel.tsx"]) {
      expect(read(file)).not.toMatch(/Stage|Frame|formatPrice|PortraitUpsell/);
    }
  });
});
