/**
 * @jest-environment jsdom
 */
/**
 * The `/yourcat` flow (bet #3, docs/plans/yourcat-v2.md §1, §9 B; docs/plans/yourcat-polish.md §4),
 * with the API mocked: S3 once the upload returns (after the scan pass, at most 400 ms), the honest
 * meter, the pixel portrait poll (schedule, stop rules, visibility), a returning visitor, the card
 * buttons, S5's place, focus, the pettable cat, the pencil rename, the per-cat share link, and the
 * friend view (`?cat=`) with its quiet fallback to S1.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { YourcatStatusView, YourcatView } from "@/models/yourcat";

const api = {
  status: jest.fn(),
  upload: jest.fn(),
  manual: jest.fn(),
  me: jest.fn(),
  get: jest.fn(),
  rename: jest.fn(),
  remove: jest.fn(),
  portraitCheckout: jest.fn(),
  ensureGuest: jest.fn(async () => undefined),
  prefetchAppCheck: jest.fn(),
  publicCat: jest.fn(),
};
jest.mock("@/api/yourcat-api", () => {
  class YourcatRequestError extends Error {
    constructor(
      readonly status: number,
      readonly kind: string,
      readonly code: string | null,
      readonly serverMessage: string | null,
    ) {
      super("request failed");
      Object.setPrototypeOf(this, YourcatRequestError.prototype);
    }
    get failure() {
      return this.kind === "code" ? { kind: "code", code: this.code } : { kind: this.kind };
    }
  }
  return { YOURCAT_API: api, YourcatRequestError };
});

const mockRender = jest.fn();
jest.mock("@/components/yourcat/shareCard", () => ({
  renderShareCard: (...args: unknown[]) => mockRender(...args),
  warmCardFonts: () => undefined,
  preloadCardImages: () => undefined,
  cardFileName: (name: string, format: string) => `tokentails-${name.toLowerCase()}-${format}.png`,
}));
jest.mock("@/components/yourcat/pinkPawPick", () => ({
  ...jest.requireActual("@/components/yourcat/pinkPawPick"),
  fetchPinkPawCandidates: jest.fn(async () => [{ name: "Raudvis", image: "/yourcat/pink-paw/raudvis-card.webp" }]),
}));
const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({ analytics: { track: (...a: unknown[]) => mockTrack(...a) }, reportAppError: jest.fn() }));
jest.mock("@/components/GoogleTagManager", () => ({ trackEvent: jest.fn() }));
const mockSetProfileUpdate = jest.fn();
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { _id: "u1", isGuest: true, cat: { _id: "old" }, cats: [{ _id: "old" }] }, setProfileUpdate: mockSetProfileUpdate }),
}));
const mockToast = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => undefined }));
jest.mock("@/features/portrait/components/StylePickerDrawer", () => ({
  PortraitStyle: { HIGHNESS: "highness", MONARCH: "monarch", ARISTOCRAT: "aristocrat", COMMANDER: "commander" },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { YourCatPage } from "@/components/yourcat/YourCatPage";

const NOW = Date.parse("2026-10-11T10:00:00.000Z");

const STATUS: YourcatStatusView = {
  enabled: true,
  uploadsOpen: true,
  appCheckEnforced: true,
  limits: { maxBytes: 10485760, types: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] },
  families: [{ family: "YELLOW", label: "Ginger", spriteImg: "https://cdn.test/assets/YELLOW/base.png" }],
  portrait: { enabled: true, priceCents: 1400, currency: "EUR", styles: ["highness", "monarch", "aristocrat", "commander"] },
};

const SHARE_ID = "AbCdEfGhIjKl";

const view = (patch: Partial<YourcatView> = {}): YourcatView => ({
  id: "64e2e0000000000000000c01",
  shareId: SHARE_ID,
  name: "My cat",
  named: false,
  family: "YELLOW",
  familyLabel: "Ginger",
  cat: {
    _id: "64e2e0000000000000000ca1",
    name: "My cat",
    type: "FIRE",
    spriteImg: "https://cdn.test/assets/YELLOW/base.png",
    catImg: "https://cdn.test/assets/YELLOW/base/GROOMING.gif",
  },
  avatar: { status: "pending", url: null },
  photo: { stored: true, deleteAfter: "2026-11-10T10:00:00.000Z" },
  portrait: { status: "none", style: null, url: null },
  createdAt: new Date(NOW).toISOString(),
  ...patch,
});

/** Lets pending promises and the effects they trigger run. */
async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const transformMode = () => screen.queryByTestId("yourcat-transform")?.getAttribute("data-mode") ?? null;

/** Advances the clock in `step` ms steps until `done()` holds (or `maxMs` has passed). */
async function advanceUntil(done: () => boolean, maxMs = 40_000, step = 100) {
  for (let spent = 0; spent < maxMs && !done(); spent += step) await advance(step);
}

/**
 * Uploads a photo and waits for S3. POST answering `pending` keeps S2 ("Almost there", R2-01) while
 * GET /yourcat/:id is polled: with `api.get` still pending, S3 takes the pending path after
 * `PORTRAIT_WAIT_MS` (25 s); a `ready` or `failed` GET ends the wait sooner. Then the scan hold (≤ 400 ms).
 */
async function mountAndUpload(upload: YourcatView = view()) {
  api.upload.mockImplementation(async (_file: Blob, _name: string, options: { onSent?: () => void }) => {
    options.onSent?.();
    return upload;
  });
  if (!api.get.getMockImplementation()) api.get.mockResolvedValue(view());
  render(<YourCatPage isApp={false} />);
  await flush();
  const input = screen.getByTestId("yourcat-file-input") as HTMLInputElement;
  const file = new File([new Uint8Array([255, 216, 255])], "cat.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await flush();
  await advanceUntil(() => transformMode() === "reveal");
}

/**
 * An `Image` that loads on the next tick and decodes only when the test says so (jsdom loads no
 * images): S2 must not hand over to the clock before the portrait has decoded (R2-01).
 */
function installDecodingImage() {
  const Real = window.Image;
  const decodes: Array<() => void> = [];
  class DecodingImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin: string | null = null;
    width = 384;
    height = 384;
    private source = "";
    get src() {
      return this.source;
    }
    set src(value: string) {
      this.source = value;
      setTimeout(() => this.onload?.(), 0);
    }
    decode() {
      return new Promise<void>((resolve) => decodes.push(resolve));
    }
  }
  (window as unknown as { Image: unknown }).Image = DecodingImage;
  return {
    decodes,
    restore: () => {
      (window as unknown as { Image: unknown }).Image = Real;
    },
  };
}

const meterText = () => screen.queryByTestId("yourcat-meter-text")?.textContent ?? "";

let urls = 0;
beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  setHidden(false);
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  api.ensureGuest.mockImplementation(async () => undefined);
  api.publicCat.mockRejectedValue(new Error("not used"));
  window.history.replaceState(null, "", "/yourcat");
  window.sessionStorage.clear();
  api.status.mockResolvedValue(STATUS);
  api.me.mockResolvedValue(null);
  mockRender.mockImplementation(async () => new Blob(["png"], { type: "image/png" }));
  Object.assign(URL, { createObjectURL: jest.fn(() => `blob:${++urls}`), revokeObjectURL: jest.fn() });
  mockTrack.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("upload to reveal", () => {
  it("shows S3 once POST /yourcat returns with the portrait and the scan pass ends", async () => {
    let finish: (value: YourcatView) => void = () => undefined;
    api.upload.mockImplementation(
      (_f: Blob, _n: string, options: { onSent?: () => void }) =>
        new Promise((resolve) => {
          options.onSent?.();
          finish = resolve;
        }),
    );
    render(<YourCatPage isApp={false} />);
    await flush();
    const file = new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), { target: { files: [file] } });
    });
    await flush();
    // S2: the working heading has focus; the meter's first segment is filled by a real event.
    const working = screen.getByRole("heading", { name: "Turning your cat into pixels" });
    expect(document.activeElement).toBe(working);
    expect(meterText()).toBe("Photo received · Finding the right coat and colours…");
    expect(screen.getByTestId("yourcat-meter-1").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("yourcat-meter-2").getAttribute("data-state")).toBe("active");
    const ready = view({ avatar: { status: "ready", url: "https://cdn.test/avatar.png" } });
    await act(async () => {
      finish(ready);
    });
    await flush();
    // The response holds the visual screen until the current scan pass ends, never longer than 400 ms.
    expect(screen.queryByRole("heading", { name: "Meet your cat." })).toBeNull();
    await advance(400);
    const heading = screen.getByRole("heading", { name: "Meet your cat." });
    expect(document.activeElement).toBe(heading);
    // The portrait came with the answer: no S2 wait, no poll.
    expect(api.get).not.toHaveBeenCalled();
    expect(mockSetProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding: { state: "done" }, cat: expect.objectContaining({ _id: "64e2e0000000000000000ca1" }) }),
    );
    expect(mockTrack.mock.calls.map(([event]) => event.name)).toEqual(["upload_started", "upload_done"]);
  });

  it("keeps one stage and one frame mounted from S1 through S2 to S3", async () => {
    api.get.mockResolvedValue(view());
    let finish: (value: YourcatView) => void = () => undefined;
    api.upload.mockImplementation(
      (_f: Blob, _n: string, options: { onSent?: () => void }) =>
        new Promise((resolve) => {
          options.onSent?.();
          finish = resolve;
        }),
    );
    render(<YourCatPage isApp={false} />);
    await flush();
    const stage = screen.getByTestId("yourcat-stage");
    const frame = screen.getByTestId("yourcat-frame");
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("empty");
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    expect(screen.getByTestId("yourcat-stage")).toBe(stage);
    expect(screen.getByTestId("yourcat-frame")).toBe(frame);
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("working");
    await act(async () => {
      finish(view());
    });
    await flush();
    // POST answered `pending`: still the same S2 frame while the portrait is drawn (R2-01).
    expect(transformMode()).toBe("working");
    expect(screen.getByTestId("yourcat-frame")).toBe(frame);
    await advanceUntil(() => transformMode() === "reveal");
    expect(screen.getByTestId("yourcat-stage")).toBe(stage);
    expect(screen.getByTestId("yourcat-frame")).toBe(frame);
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("reveal");
  });

  it("polls at 1.5, 1.5, 1.5, 1.5, 2.5 s, then every 4 s", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    const at: number[] = [];
    api.get.mockImplementation(async () => {
      at.push(Date.now() - NOW);
      return view();
    });
    const revealedAt = Date.now() - NOW;
    for (let i = 0; i < 52; i++) await advance(250);
    // S2 held 25 s for the portrait (R2-01), then the scan hold; S3's poll counts from that moment.
    expect(revealedAt).toBe(25_200);
    expect(at).toEqual([1500, 3000, 4500, 6000, 8500, 12500].map((ms) => revealedAt + ms));
  });

  it("stops at once when the portrait failed", async () => {
    api.get.mockResolvedValue(view({ avatar: { status: "failed", url: null } }));
    await mountAndUpload();
    // S2's first poll (1.5 s) said failed: S3 at once, with nothing more to poll.
    expect(Date.now() - NOW).toBeLessThan(2500);
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(meterText()).toBe("The pixel portrait did not work this time. Your card uses your cat's game look.");
    expect(screen.getByTestId("yourcat-meter-3").getAttribute("data-state")).toBe("failed");
    await advance(30_000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("after the 25 s fallback, swaps in the portrait when it is ready and stops; the meter fills only when the frame shows it", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    api.get.mockClear();
    api.get.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/avatar.png" } }));
    await advance(1500);
    // The record says ready, but the frame is not showing the portrait yet: segment 3 is still working.
    expect(meterText()).toMatch(/Painting/);
    expect(screen.getByTestId("yourcat-meter-3").getAttribute("data-state")).toBe("active");
    for (let i = 0; i < 20; i++) await advance(1000);
    expect(api.get).toHaveBeenCalledTimes(1);
    // jsdom decodes no image: the frame keeps loading the portrait in a hidden <img> and lands it on load.
    expect(meterText()).toMatch(/Painting/);
    act(() => {
      fireEvent.load(screen.getByTestId("yourcat-avatar-slow"));
    });
    await flush();
    // Landed after the clock ended: the kicker is the chip "In the game".
    expect(screen.getByTestId("yourcat-kicker").textContent).toBe("In the game");
  });

  it("stops 60 s after the record was made", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    for (let i = 0; i < 70; i++) await advance(1000);
    const calls = api.get.mock.calls.length;
    expect(calls).toBeGreaterThan(5);
    expect(meterText()).toMatch(/did not work this time/);
    await advance(30_000);
    expect(api.get).toHaveBeenCalledTimes(calls);
  });

  it("pauses while the tab is hidden and resumes when it is visible", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    api.get.mockClear();
    setHidden(true);
    await advance(20_000);
    expect(api.get).not.toHaveBeenCalled();
    setHidden(false);
    await flush();
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe("S2 holds for the pixel portrait (R2-01)", () => {
  it("POST pending -> GET ready -> clock starts: 'Almost there' until the portrait has decoded", async () => {
    const images = installDecodingImage();
    try {
      const ready = view({ avatar: { status: "ready", url: "https://cdn.test/avatar.png" } });
      api.get.mockImplementation(async () => (api.get.mock.calls.length < 2 ? view() : ready));
      api.upload.mockImplementation(async (_f: Blob, _n: string, options: { onSent?: () => void }) => {
        options.onSent?.();
        return view();
      });
      render(<YourCatPage isApp={false} />);
      await flush();
      await act(async () => {
        fireEvent.change(screen.getByTestId("yourcat-file-input"), {
          target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
        });
      });
      await flush();
      // The answer is in, the portrait is still being drawn: S2 stays, Coat filled, Portrait active.
      expect(transformMode()).toBe("working");
      expect(screen.getByRole("heading", { level: 1, name: "Almost there" })).toBeTruthy();
      expect(meterText()).toBe("Painting your pixel portrait…");
      expect(screen.getByTestId("yourcat-meter-1").getAttribute("data-state")).toBe("done");
      expect(screen.getByTestId("yourcat-meter-2").getAttribute("data-state")).toBe("done");
      expect(screen.getByTestId("yourcat-meter-3").getAttribute("data-state")).toBe("active");
      // The name field stays for the wait.
      expect(screen.getByLabelText("While you wait: what's their name?")).toBeTruthy();
      expect(api.get).not.toHaveBeenCalled();
      // Polled every 1.5 s.
      await advance(1500);
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenLastCalledWith("64e2e0000000000000000c01");
      expect(transformMode()).toBe("working");
      await advance(1500);
      expect(api.get).toHaveBeenCalledTimes(2);
      // Ready, loaded, not decoded yet: still S2 (a decode never holds it past 2 s).
      await advance(10);
      expect(images.decodes.length).toBe(1);
      await advance(1000);
      expect(transformMode()).toBe("working");
      await act(async () => {
        images.decodes[0]();
      });
      await flush();
      await advanceUntil(() => transformMode() === "reveal", 1000, 50);
      // The clock starts on the real portrait: S3 with the portrait, nothing more to poll.
      expect(transformMode()).toBe("reveal");
      expect(screen.getByRole("heading", { name: "Meet your cat." })).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Almost there" })).toBeNull();
      const polls = api.get.mock.calls.length;
      await advance(10_000);
      expect(api.get).toHaveBeenCalledTimes(polls);
    } finally {
      images.restore();
    }
  });

  it("falls back to the pending path after about 25 s and keeps polling on S3", async () => {
    api.get.mockResolvedValue(view());
    api.upload.mockImplementation(async (_f: Blob, _n: string, options: { onSent?: () => void }) => {
      options.onSent?.();
      return view();
    });
    render(<YourCatPage isApp={false} />);
    await flush();
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    const at: number[] = [];
    api.get.mockImplementation(async () => {
      at.push(Date.now() - NOW);
      return view();
    });
    for (let i = 0; i < 480; i++) await advance(50);
    expect(transformMode()).toBe("working");
    expect(screen.getByRole("heading", { level: 1, name: "Almost there" })).toBeTruthy();
    // Every 1.5 s after the last answer (the fake clock moves in 50 ms steps).
    expect(at[0]).toBe(1500);
    at.slice(1).forEach((ms, i) => expect(ms - at[i]).toBeGreaterThanOrEqual(1500));
    at.slice(1).forEach((ms, i) => expect(ms - at[i]).toBeLessThanOrEqual(1550));
    expect(at.length).toBeGreaterThanOrEqual(15);
    await advanceUntil(() => transformMode() === "reveal", 2000);
    expect(Date.now() - NOW).toBeLessThanOrEqual(25_400);
    // S3's pending path: the meter still says the portrait is being painted, and the poll goes on.
    expect(screen.getByRole("heading", { name: "Meet your cat." })).toBeTruthy();
    expect(meterText()).toBe("Painting your pixel portrait…");
    expect(screen.getByTestId("yourcat-meter-3").getAttribute("data-state")).toBe("active");
    const polls = api.get.mock.calls.length;
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(polls + 1);
  });

  it("leaving the page ends the wait: no more polls", async () => {
    api.get.mockResolvedValue(view());
    api.upload.mockImplementation(async (_f: Blob, _n: string, options: { onSent?: () => void }) => {
      options.onSent?.();
      return view();
    });
    const { unmount } = render(<YourCatPage isApp={false} />);
    await flush();
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
    unmount();
    await advance(10_000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe("the visitor's own daily cap (R2-09)", () => {
  async function hitCap() {
    const { YourcatRequestError } = jest.requireMock("@/api/yourcat-api");
    api.upload.mockImplementation(async (_f: Blob, _n: string, options: { onSent?: () => void }) => {
      options.onSent?.();
      throw new YourcatRequestError(429, "code", "YOURCAT_IP_DAILY_CAP", null);
    });
    const result = render(<YourCatPage isApp={false} />);
    await flush();
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    return result;
  }

  it("has its own heading and honest line, no countdown, a rust meter with the Photo segment unfilled", async () => {
    await hitCap();
    const heading = screen.getByRole("heading", { level: 1, name: "That's today's AI cats" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("alert").textContent).toBe(
      "You have made all your AI cats for today. Your cat can still join the game with a look you pick.",
    );
    expect(screen.queryByTestId("yourcat-retry-countdown")).toBeNull();
    expect(meterText()).toBe("Stopped");
    expect(screen.getByTestId("yourcat-meter-1").getAttribute("data-state")).toBe("empty");
    expect(screen.getByTestId("yourcat-meter-2").getAttribute("data-state")).toBe("failed");
    expect(screen.getByTestId("yourcat-meter-3").getAttribute("data-state")).toBe("empty");
    expect(screen.getByRole("button", { name: "Pick your cat's look yourself" })).toBeTruthy();
    expect(window.sessionStorage.getItem("tt-yourcat-own-cap")).toBe("2026-10-11");
  });

  it("is remembered for this tab: S1 shows the spent state before the next photo", async () => {
    const first = await hitCap();
    first.unmount();
    api.upload.mockClear();
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeTruthy();
    expect(
      screen.getByText("You have made all your AI cats for today. Your cat can still join the game with a look you pick."),
    ).toBeTruthy();
    expect(screen.queryByTestId("yourcat-file-input")).toBeNull();
    expect(screen.queryByText("One photo · Free · No sign-up")).toBeNull();
    expect(screen.getByRole("button", { name: "Pick your cat's look yourself" })).toBeTruthy();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("a cap remembered on an earlier UTC day, or storage that throws, leaves S1 open", async () => {
    window.sessionStorage.setItem("tt-yourcat-own-cap", "2026-10-10");
    const { unmount } = render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByTestId("yourcat-file-input")).toBeTruthy();
    unmount();
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      render(<YourCatPage isApp={false} />);
      await flush();
      expect(screen.getByTestId("yourcat-file-input")).toBeTruthy();
    } finally {
      getItem.mockRestore();
    }
  });
});

describe("the pending target (§4.2)", () => {
  it("quantises the photo to 32 cells across, gold-tinted", () => {
    const { pendingTarget, blockForCells, BLOCK_BASE_PX, PENDING_CELLS } = jest.requireActual("@/components/yourcat/pixelateReveal");
    expect(PENDING_CELLS).toBe(32);
    const image = { width: 100, height: 100 } as unknown as HTMLImageElement;
    const target = pendingTarget(image, "#f5c542");
    expect(target.minBlock).toBe(blockForCells(32));
    expect(BLOCK_BASE_PX / target.minBlock).toBe(32);
    expect(target.tint).toBe("#f5c542");
  });
});

describe("returning visitor", () => {
  it("lands on S3 from GET /yourcat/me with no upload", async () => {
    api.me.mockResolvedValue(view({ name: "Mochi", named: true, avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByRole("heading", { name: "Meet Mochi." })).toBeTruthy();
    expect(api.upload).not.toHaveBeenCalled();
    expect(screen.getByText("Start over with a new photo")).toBeTruthy();
  });
});

describe("share block", () => {
  it("keeps Download disabled until the current card exists", async () => {
    let release: (blob: Blob) => void = () => undefined;
    mockRender.mockImplementation(() => new Promise<Blob>((resolve) => (release = resolve)));
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    // Disabled under its own label first, waiting hidden in its box (R2-04); "Preparing card…" (and the
    // row) only once the card is 600 ms late.
    const actions = screen.getByTestId("yourcat-actions");
    expect(actions.getAttribute("data-shown")).toBe("false");
    const waiting = actions.querySelector("[data-testid=yourcat-primary] button") as HTMLButtonElement;
    expect(waiting.textContent).toBe("Download");
    expect(waiting.disabled).toBe(true);
    await advance(700);
    expect(screen.getByTestId("yourcat-actions").getAttribute("data-shown")).toBe("true");
    const preparing = screen.getByRole("button", { name: "Preparing card…" }) as HTMLButtonElement;
    expect(preparing.disabled).toBe(true);
    await act(async () => {
      release(new Blob(["png"], { type: "image/png" }));
    });
    await flush();
    const download = screen.getByRole("button", { name: "Download" }) as HTMLButtonElement;
    expect(download.disabled).toBe(false);
  });

  it("renders S5 after the share block, never inside it", async () => {
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    const share = screen.getByTestId("yourcat-share");
    const upsell = screen.getByTestId("yourcat-upsell");
    expect(share.contains(upsell)).toBe(false);
    expect(screen.getByTestId("yourcat-reveal").contains(upsell)).toBe(false);
    expect(share.compareDocumentPosition(upsell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // After the footer line too (never next to Share or the meeting block).
    const footer = screen.getByTestId("yourcat-footer-line");
    expect(footer.compareDocumentPosition(upsell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("yourcat-meeting").contains(upsell)).toBe(false);
    expect(screen.getByRole("button", { name: "Get the HD portrait · €14" })).toBeTruthy();
  });

  it("the meeting: the shelter cat's frame, the H2 and the switch under the card, on by default", async () => {
    jest.useRealTimers();
    api.me.mockResolvedValue(view({ name: "Mochi", named: true, avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    const toggle = screen.getByRole("switch", { name: "Put Raudvis on my card" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("heading", { name: "Mochi, meet Raudvis." })).toBeTruthy();
    expect(screen.getByText("Raudvis is a real cat at Pink Paw, a cat shelter. Put them on one card?")).toBeTruthy();
    // The cream frame slides onto the altar, then the cat sits facing it.
    await waitFor(() => expect(screen.getByTestId("yourcat-shelter-frame")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("yourcat-petcat").getAttribute("data-facing")).toBe("left"));
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("no gallery: no shelter frame, no meeting H2, no switch; the card is solo", async () => {
    const { fetchPinkPawCandidates } = jest.requireMock("@/components/yourcat/pinkPawPick");
    (fetchPinkPawCandidates as jest.Mock).mockResolvedValueOnce([]);
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    await advance(1000);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByTestId("yourcat-shelter-frame")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /meet/i })).toBeNull();
    expect(screen.getByTestId("yourcat-coat-line").textContent).toBe("Your cat is in the game. Same ginger coat, new pixel paws.");
    const texts = mockRender.mock.calls.map(([input]) => (input as { text: { panel: unknown } }).text.panel);
    expect(texts.every((panel) => panel === null)).toBe(true);
  });
});

describe("the reveal's quiet beats", () => {
  it("holds the meeting block, the coat line and the switch invisible in their boxes until the shelter frame shows", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    // During the clock: reserved, not shown.
    const meeting = screen.getByTestId("yourcat-meeting");
    expect(meeting.getAttribute("data-shown")).toBe("false");
    expect(meeting.style.visibility).toBe("hidden");
    expect(screen.getByTestId("yourcat-coat-line")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("switch", { hidden: true }).style.visibility).toBe("hidden");
    expect(screen.queryByTestId("yourcat-shelter-frame")).toBeNull();
    for (let i = 0; i < 6; i++) await advance(1000);
    // With the shelter frame they fade in (240 ms).
    expect(screen.getByTestId("yourcat-shelter-frame")).toBeTruthy();
    expect(meeting.getAttribute("data-shown")).toBe("true");
    expect(meeting.style.visibility).toBe("visible");
    expect(meeting.style.transition).toMatch(/opacity 240ms/);
    expect(screen.getByRole("switch", { name: "Put Raudvis on my card" })).toBeTruthy();
  });

  it("with no shelter cat, the coat line still appears once the clock has ended", async () => {
    const { fetchPinkPawCandidates } = jest.requireMock("@/components/yourcat/pinkPawPick");
    (fetchPinkPawCandidates as jest.Mock).mockResolvedValueOnce([]);
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    expect(screen.getByTestId("yourcat-meeting").getAttribute("data-shown")).toBe("false");
    await advance(5000);
    expect(screen.getByTestId("yourcat-meeting").getAttribute("data-shown")).toBe("true");
    expect(screen.queryByRole("switch", { hidden: true })).toBeNull();
  });

  it("the card slot draws nothing until the show ends, and says 'Preparing card…' only 600 ms later", async () => {
    let release: (blob: Blob) => void = () => undefined;
    mockRender.mockImplementation(() => new Promise<Blob>((resolve) => (release = resolve)));
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    const slot = screen.getByTestId("yourcat-card-preview");
    expect(slot.getAttribute("data-drawn")).toBe("false");
    expect(slot.textContent).toBe("");
    expect(slot.className).toMatch(/border-transparent/);
    // The calm clock ends (the photo never decodes in jsdom); still nothing for the first 600 ms.
    for (let i = 0; i < 40; i++) {
      await advance(100);
      if (screen.queryByTestId("yourcat-replay")) break;
    }
    expect(screen.getByTestId("yourcat-replay")).toBeTruthy();
    expect(slot.textContent).toBe("");
    await advance(700);
    expect(slot.textContent).toBe("Preparing card…");
    expect(slot.getAttribute("data-drawn")).toBe("true");
    await act(async () => {
      release(new Blob(["png"], { type: "image/png" }));
    });
    await flush();
    expect(slot.querySelector("img")).toBeTruthy();
    expect(slot.textContent).toBe("");
  });
});

describe("the pettable cat", () => {
  it("a tap makes it loaf and purr, with the caption; it can still be pet under reduced motion", async () => {
    api.me.mockResolvedValue(view({ name: "Mochi", named: true, avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    const pet = screen.getByRole("button", { name: "Pet Mochi" });
    expect(screen.getByTestId("yourcat-petcat-caption").textContent).toBe("Tap Mochi");
    fireEvent.pointerDown(pet, { clientX: 10, clientY: 10 });
    await flush();
    expect(screen.getByTestId("yourcat-petcat").getAttribute("data-pose")).toBe("loaf");
    expect(screen.getByTestId("yourcat-petcat-caption").textContent).toBe("Mochi purrs.");
  });
});

describe("a fresh reveal", () => {
  it("the cat steps out on the clock, the headline lands, and Watch again replays from the photo", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    // Before the step-out the cat is still in the portrait.
    expect(screen.queryByTestId("yourcat-cat")).toBeNull();
    await advance(5000);
    expect(screen.getByTestId("yourcat-cat")).toBeTruthy();
    const replay = screen.getByRole("button", { name: "Watch your cat step out again" });
    fireEvent.click(replay);
    await flush();
    expect(screen.queryByTestId("yourcat-cat")).toBeNull();
    await advance(5000);
    expect(screen.getByTestId("yourcat-cat")).toBeTruthy();
  });

  it("a returning visitor has no clock and no replay", async () => {
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("settled");
    expect(screen.getByTestId("yourcat-cat")).toBeTruthy();
    expect(screen.queryByTestId("yourcat-replay")).toBeNull();
  });
});

describe("states before upload", () => {
  it("paused: no upload control", async () => {
    api.status.mockResolvedValue({ ...STATUS, enabled: false, uploadsOpen: false });
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText("Making cats from photos is paused right now. Please come back later.")).toBeTruthy();
    expect(screen.queryByTestId("yourcat-file-input")).toBeNull();
  });

  it("budget spent: offers the manual pick, which makes a cat with no photo", async () => {
    api.status.mockResolvedValue({ ...STATUS, uploadsOpen: false });
    api.manual.mockResolvedValue(view({ avatar: { status: "none", url: null }, photo: { stored: false, deleteAfter: null } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText("We have made all the AI cats we can for today.")).toBeTruthy();
    const stage = screen.getByTestId("yourcat-stage");
    fireEvent.click(screen.getByRole("button", { name: "Pick your cat's look yourself" }));
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Pick your cat's look" }));
    // The stage stays mounted, with the frame empty.
    expect(screen.getByTestId("yourcat-stage")).toBe(stage);
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("empty");
    fireEvent.click(screen.getByLabelText("Ginger"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Make my cat" }));
    });
    await flush();
    expect(api.manual).toHaveBeenCalledWith("YELLOW", "");
    expect(screen.getByRole("heading", { name: "Meet your cat." })).toBeTruthy();
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("manual");
    expect(screen.queryByTestId("yourcat-upsell")).toBeNull();
  });

  it("a plain 429 shows the burst copy and enables Try again after 10 s", async () => {
    const { YourcatRequestError } = jest.requireMock("@/api/yourcat-api");
    api.upload.mockRejectedValue(new YourcatRequestError(429, "rate-limited", null, null));
    render(<YourCatPage isApp={false} />);
    await flush();
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Too many tries at once. Please wait a moment and try again.");
    const retry = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    for (let i = 0; i < 10; i++) await advance(1000);
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

/** Opens the pencil's rename row and returns its field. */
function renameField(): HTMLInputElement {
  const open = screen.queryByLabelText("Your cat's name");
  if (!open) fireEvent.click(screen.getByTestId("yourcat-rename"));
  return screen.getByLabelText("Your cat's name") as HTMLInputElement;
}

describe("names: the S2 field, the pencil, the card and the share text agree", () => {
  it("a name typed during the wait reaches the heading, the pencil's field and the card", async () => {
    let finish: (value: YourcatView) => void = () => undefined;
    api.upload.mockImplementation(
      (_f: Blob, _n: string, options: { onSent?: () => void }) =>
        new Promise((resolve) => {
          options.onSent?.();
          finish = resolve;
        }),
    );
    let renamed: (value: YourcatView) => void = () => undefined;
    api.rename.mockImplementation(() => new Promise((resolve) => (renamed = resolve)));
    api.get.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([1])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    fireEvent.change(screen.getByLabelText("While you wait: what's their name?"), { target: { value: "Mochi" } });
    await act(async () => {
      finish(view());
    });
    await flush();
    // POST answered `pending`; GET says ready, and S3 starts once the portrait has loaded (R2-01).
    await advanceUntil(() => transformMode() === "reveal");
    // S3 shows before the rename lands, unnamed; S3 has no second name field, only the pencil.
    expect(api.rename).toHaveBeenCalledWith("64e2e0000000000000000c01", "Mochi");
    expect(screen.queryByLabelText("Name for the card")).toBeNull();
    expect(screen.getByRole("button", { name: "Name your cat" })).toBeTruthy();
    await act(async () => {
      renamed(view({ name: "Mochi", named: true }));
    });
    await flush();
    expect(screen.getByRole("heading", { name: "Meet Mochi." })).toBeTruthy();
    expect(renameField().value).toBe("Mochi");
    await advance(400);
    const texts = mockRender.mock.calls.map(([input]) => (input as { soloText: { nameLine: string } }).soloText.nameLine);
    expect(texts[texts.length - 1]).toBe("Mochi");
  });

  it("a name typed in S3 later is not overwritten by the server", async () => {
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    const field = renameField();
    fireEvent.change(field, { target: { value: "Biscuit" } });
    await advance(400);
    expect(field.value).toBe("Biscuit");
  });

  it("Share waits for the card of the typed name, and its text names the same cat", async () => {
    const share = jest.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    api.rename.mockImplementation(async (_id: string, name: string) => view({ name, named: true }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect((screen.getByRole("button", { name: "Share" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(renameField(), { target: { value: "Mochi" } });
    // Before the debounce the old card must not leave with a new name (or the other way round).
    expect((screen.getByRole("button", { name: "Share" }) as HTMLButtonElement).disabled).toBe(true);
    await advance(400);
    const button = screen.getByRole("button", { name: "Share" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(share).toHaveBeenCalledTimes(1);
    const [payload] = share.mock.calls[0] as unknown as [{ text: string; files: File[] }];
    // The shelter cat is on the card (on by default), so the text names it; the link is this cat's own.
    expect(payload.text.startsWith("Mochi is a pixel cat now, and just met Raudvis, a real cat from Pink Paw. Turn your cat into one: ")).toBe(true);
    expect(payload.text).toMatch(/\/yourcat\?cat=AbCdEfGhIjKl&utm_source=share&utm_medium=card&utm_campaign=yourcat&utm_content=(story|post)$/);
    expect(payload.files[0].name).toMatch(/^tokentails-mochi-(story|post)\.png$/);
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).canShare;
  });
});

describe("delete my photo", () => {
  it("focuses Keep first, describes the paid line, and stays on S3 after Delete", async () => {
    api.me.mockResolvedValue(
      view({
        name: "Mochi",
        named: true,
        avatar: { status: "ready", url: "https://cdn.test/a.png" },
        portrait: { status: "painting", style: "monarch", url: null },
      }),
    );
    api.get.mockResolvedValue(
      view({ name: "Mochi", named: true, avatar: { status: "ready", url: "https://cdn.test/a.png" }, portrait: { status: "painting", style: "monarch", url: null } }),
    );
    api.remove.mockResolvedValue({ success: true, photoKeptUntilDelivery: true });
    render(<YourCatPage isApp={false} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Delete my photo" }));
    await flush();
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep" }));
    expect(dialog.getAttribute("aria-describedby")).toBe("yourcat-delete-extra");
    expect(document.getElementById("yourcat-delete-extra")?.textContent).toMatch(/still being painted/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });
    await flush();
    await advance(10);
    expect(api.remove).toHaveBeenCalledWith("64e2e0000000000000000c01");
    // Still S3: the cat, its name and the play link stay; the delete link and the upsell go.
    const heading = screen.getByRole("heading", { name: "Meet Mochi." });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Play as Mochi")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete my photo" })).toBeNull();
    expect(screen.queryByTestId("yourcat-upsell")).toBeNull();
    expect(screen.queryByTestId("yourcat-file-input")).toBeNull();
    // The paid portrait block stays; the deleted record is no longer polled.
    expect(screen.getByText(/portrait is/)).toBeTruthy();
    const calls = api.get.mock.calls.length;
    await advance(20_000);
    expect(api.get).toHaveBeenCalledTimes(calls);
    // The card is drawn again with the game look.
    const last = mockRender.mock.calls[mockRender.mock.calls.length - 1][0] as { avatarUrl: string | null };
    expect(last.avatarUrl).toBeNull();
    expect(mockToast).toHaveBeenCalledWith({ message: "Deleted." });
  });
});

describe("in-app browsers", () => {
  it("show the large card and the press-and-hold hint at once, with no extra button", async () => {
    const agent = jest.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone) Instagram 300.0");
    api.me.mockResolvedValue(view({ name: "Mochi", named: true, avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText("Press and hold the card to save it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save the card" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    const card = screen.getByAltText(/Share card: Mochi/);
    fireEvent.touchStart(card);
    await advance(600);
    fireEvent.contextMenu(card);
    const longPresses = mockTrack.mock.calls.filter(
      ([event]) => event.name === "card_shared" && event.properties?.method === "long-press",
    );
    expect(longPresses).toHaveLength(1);
    agent.mockRestore();
  });
});

describe("the friend view (?cat=)", () => {
  const FRIEND_CAT = { name: "Mochi", familyLabel: "Ginger", avatarUrl: "https://cdn.test/friend.png", spriteImg: "https://cdn.test/assets/YELLOW/base.png" };

  it("shows the shared cat, pettable, beside the empty frame, with Choose a photo", async () => {
    window.history.replaceState(null, "", `/yourcat?cat=${SHARE_ID}&utm_source=share&utm_medium=card`);
    api.publicCat.mockResolvedValue(FRIEND_CAT);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(api.publicCat).toHaveBeenCalledWith(SHARE_ID);
    expect(screen.getByRole("heading", { level: 1, name: "Mochi says hi." })).toBeTruthy();
    expect(screen.getByText("Someone turned their cat into a pixel cat. Hang a photo of yours in the empty frame.")).toBeTruthy();
    expect(screen.getByTestId("yourcat-friend-empty").textContent).toContain("Your cat here");
    expect(screen.getByRole("button", { name: "Pet Mochi" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a photo" })).toBeTruthy();
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-mode")).toBe("settled");
    // No own cat yet: no "See your cat".
    expect(screen.queryByRole("button", { name: "See your cat" })).toBeNull();
  });

  it("an unnamed shared cat says 'A pixel cat says hi.'; a visitor with a cat can open theirs", async () => {
    window.history.replaceState(null, "", `/yourcat?cat=${SHARE_ID}`);
    api.publicCat.mockResolvedValue({ ...FRIEND_CAT, name: null });
    api.me.mockResolvedValue(view({ name: "Biscuit", named: true, avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "A pixel cat says hi." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See your cat" }));
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "Meet Biscuit." })).toBeTruthy();
    expect(window.location.search).not.toContain("cat=");
  });

  it("a 404 drops ?cat quietly and shows S1, keeping the UTM parameters", async () => {
    window.history.replaceState(null, "", `/yourcat?cat=${SHARE_ID}&utm_source=share&utm_content=story`);
    api.publicCat.mockRejectedValue(new Error("404"));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeTruthy();
    expect(window.location.search).toBe("?utm_source=share&utm_content=story");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an invalid id never reaches the API and is dropped", async () => {
    window.history.replaceState(null, "", "/yourcat?cat=not-an-id&utm_source=share");
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(api.publicCat).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?utm_source=share");
    expect(screen.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeTruthy();
  });
});
