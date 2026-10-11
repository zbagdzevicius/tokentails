/**
 * @jest-environment jsdom
 */
/**
 * The `/yourcat` flow (bet #3, docs/plans/yourcat-v2.md §1, §9 B), with the API mocked: S3 as soon as
 * the upload returns, the pixel portrait poll (schedule, stop rules, visibility), a returning visitor,
 * the card buttons, S5's place, focus, and the GIF's 5 s rule.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
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

const view = (patch: Partial<YourcatView> = {}): YourcatView => ({
  id: "64e2e0000000000000000c01",
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

async function mountAndUpload(upload: YourcatView = view()) {
  api.upload.mockImplementation(async (_file: Blob, _name: string, options: { onSent?: () => void }) => {
    options.onSent?.();
    return upload;
  });
  render(<YourCatPage isApp={false} />);
  await flush();
  const input = screen.getByTestId("yourcat-file-input") as HTMLInputElement;
  const file = new File([new Uint8Array([255, 216, 255])], "cat.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await flush();
}

let urls = 0;
beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  setHidden(false);
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  api.ensureGuest.mockImplementation(async () => undefined);
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
  it("shows S3 as soon as POST /yourcat returns, while the portrait is still pending", async () => {
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
    // S2: the working heading has focus.
    const working = screen.getByRole("heading", { name: "Making your pixel cat" });
    expect(document.activeElement).toBe(working);
    expect(screen.getByText("Matching your cat to a pixel cat family…")).toBeTruthy();
    api.get.mockResolvedValue(view());
    await act(async () => {
      finish(view());
    });
    await flush();
    const heading = screen.getByRole("heading", { name: "Meet your cat." });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByTestId("yourcat-portrait-status").textContent).toBe("Drawing your cat's pixel portrait…");
    expect(mockSetProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding: { state: "done" }, cat: expect.objectContaining({ _id: "64e2e0000000000000000ca1" }) }),
    );
    expect(mockTrack.mock.calls.map(([event]) => event.name)).toEqual(["upload_started", "upload_done"]);
  });

  it("polls at 1.5, 1.5, 1.5, 1.5, 2.5 s, then every 4 s", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    const at: number[] = [];
    api.get.mockImplementation(async () => {
      at.push(Date.now() - NOW);
      return view();
    });
    for (let i = 0; i < 52; i++) await advance(250);
    expect(at).toEqual([1500, 3000, 4500, 6000, 8500, 12500]);
  });

  it("stops at once when the portrait failed", async () => {
    api.get.mockResolvedValue(view({ avatar: { status: "failed", url: null } }));
    await mountAndUpload();
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("yourcat-portrait-status").textContent).toBe(
      "The pixel portrait did not work this time. Your card uses your cat's game look.",
    );
    await advance(30_000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("swaps in the portrait when it is ready and stops", async () => {
    api.get.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/avatar.png" } }));
    await mountAndUpload();
    await advance(1500);
    expect(screen.getByTestId("yourcat-portrait-status").textContent).toBe("");
    await advance(20_000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("stops 60 s after the record was made", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    for (let i = 0; i < 70; i++) await advance(1000);
    const calls = api.get.mock.calls.length;
    expect(calls).toBeGreaterThan(5);
    expect(screen.getByTestId("yourcat-portrait-status").textContent).toMatch(/did not work this time/);
    await advance(30_000);
    expect(api.get).toHaveBeenCalledTimes(calls);
  });

  it("pauses while the tab is hidden and resumes when it is visible", async () => {
    api.get.mockResolvedValue(view());
    await mountAndUpload();
    setHidden(true);
    await advance(20_000);
    expect(api.get).not.toHaveBeenCalled();
    setHidden(false);
    await flush();
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole("button", { name: "Get the HD portrait for €14" })).toBeTruthy();
  });

  it("offers the Pink Paw switch only with a qualifying cat, as a switch", async () => {
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    const toggle = screen.getByRole("switch", { name: "With Raudvis from Pink Paw" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});

describe("playable cat", () => {
  it("plays the GIF for 5 s, then shows the still frame; a tap plays it again", async () => {
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByTestId("yourcat-gif")).toBeTruthy();
    await advance(4999);
    expect(screen.queryByTestId("yourcat-gif")).toBeTruthy();
    await advance(2);
    expect(screen.queryByTestId("yourcat-gif")).toBeNull();
    fireEvent.click(screen.getByTestId("yourcat-playable"));
    expect(screen.getByTestId("yourcat-gif")).toBeTruthy();
    await advance(5001);
    expect(screen.queryByTestId("yourcat-gif")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Pick your cat's look yourself" }));
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Pick your cat's look yourself" }));
    fireEvent.click(screen.getByLabelText("Ginger"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Make my cat" }));
    });
    await flush();
    expect(api.manual).toHaveBeenCalledWith("YELLOW", "");
    expect(screen.getByRole("heading", { name: "Meet your cat." })).toBeTruthy();
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

describe("names: the S2 field, the S3 field, the card and the share text agree", () => {
  it("a name typed during the wait reaches the S3 field and the card", async () => {
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
    fireEvent.change(screen.getByLabelText("What is your cat's name?"), { target: { value: "Mochi" } });
    await act(async () => {
      finish(view());
    });
    await flush();
    // S3 shows before the rename lands, unnamed.
    expect(api.rename).toHaveBeenCalledWith("64e2e0000000000000000c01", "Mochi");
    expect((screen.getByLabelText("Name for the card") as HTMLInputElement).value).toBe("");
    await act(async () => {
      renamed(view({ name: "Mochi", named: true }));
    });
    await flush();
    expect(screen.getByRole("heading", { name: "Meet Mochi." })).toBeTruthy();
    expect((screen.getByLabelText("Name for the card") as HTMLInputElement).value).toBe("Mochi");
    await advance(400);
    const names = mockRender.mock.calls.map(([input]) => (input as { name: string }).name);
    expect(names[names.length - 1]).toBe("Mochi");
  });

  it("a name typed in S3 later is not overwritten by the server", async () => {
    api.me.mockResolvedValue(view({ avatar: { status: "ready", url: "https://cdn.test/a.png" } }));
    render(<YourCatPage isApp={false} />);
    await flush();
    const field = screen.getByLabelText("Name for the card") as HTMLInputElement;
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
    fireEvent.change(screen.getByLabelText("Name for the card"), { target: { value: "Mochi" } });
    // Before the debounce the old card must not leave with a new name (or the other way round).
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    await advance(400);
    const button = screen.getByRole("button", { name: "Share" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(share).toHaveBeenCalledTimes(1);
    const [payload] = share.mock.calls[0] as unknown as [{ text: string; files: File[] }];
    expect(payload.text.startsWith("Meet Mochi, now a pixel cat")).toBe(true);
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
    expect(screen.getByText(/We are painting Mochi/)).toBeTruthy();
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
