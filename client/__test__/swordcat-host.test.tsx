/**
 * @jest-environment jsdom
 */
/**
 * The /swordcat host (Swordcat plan §5.1): the iframe gets `embed=1`, no sandbox; the exit button
 * goes back to /game; the unavailable state without a URL; the rotate hint on portrait touch
 * screens; and the page redirects to /game while its flag is off.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => undefined,
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const replace = jest.fn(() => Promise.resolve(true));
jest.mock("next/router", () => ({ useRouter: () => ({ replace, pathname: "/swordcat", query: {}, isReady: true }) }));
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: () => null }));

import {
  SWORDCAT_EXIT_GUTTER_PX,
  SWORDCAT_EXIT_INSET_PX,
  SWORDCAT_EXIT_PATH,
  SWORDCAT_EXIT_SIZE_PX,
  SWORDCAT_FRAME_TESTID,
  SWORDCAT_ROTATE_HINT_KEY,
  SWORDCAT_ROTATE_HINT_MS,
  SwordcatHost,
} from "@/components/swordcat/SwordcatHost";
import SwordcatPage from "@/pages/swordcat";
import { acquireGameSuspension } from "@/lib/game/gameRegistry";
import { SWORDCAT_HELLO_SLOW_MS, SWORDCAT_HELLO_TIMEOUT_MS, SWORDCAT_NS } from "@/components/swordcat/bridge";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

beforeEach(() => {
  replace.mockClear();
  window.localStorage.clear();
  mockMatchMedia(false);
});

describe("SwordcatHost", () => {
  it("frames the game with embed=1, the allow list and no sandbox", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("https://swordcat.tokentails.com/?embed=1");
    expect(frame.getAttribute("title")).toBe("Pink Paw Knight");
    expect(frame.getAttribute("allow")).toBe("autoplay; fullscreen; gamepad");
    expect(frame.hasAttribute("sandbox")).toBe(false);
  });

  it("appends embed=1 with & when the URL has a query", () => {
    render(<SwordcatHost url="/swordcat-game/?lang=en" navigate={jest.fn()} />);
    expect(screen.getByTestId(SWORDCAT_FRAME_TESTID).getAttribute("src")).toBe("/swordcat-game/?lang=en&embed=1");
  });

  it("goes back to /game from the exit button", () => {
    const navigate = jest.fn();
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to games" }));
    expect(navigate).toHaveBeenCalledWith(SWORDCAT_EXIT_PATH);
    expect(SWORDCAT_EXIT_PATH).toBe("/game");
  });

  it("says the game is not available without a valid URL, with a way back", () => {
    render(<SwordcatHost url={null} navigate={jest.fn()} />);
    expect(screen.getByText("Pink Paw Knight is not available right now.")).toBeTruthy();
    expect(screen.queryByTestId(SWORDCAT_FRAME_TESTID)).toBeNull();
    expect(screen.getByRole("link", { name: "Back to games" }).getAttribute("href")).toBe("/game");
  });

  it("frames the same-origin build by default (no NEXT_PUBLIC_SWORDCAT_URL in tests)", () => {
    render(<SwordcatHost navigate={jest.fn()} />);
    expect(screen.getByTestId(SWORDCAT_FRAME_TESTID).getAttribute("src")).toBe("/swordcat-game/index.html?embed=1");
  });

  it("makes the frame inert while a GameModal suspends the games", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    const host = screen.getByTestId("swordcat-host");
    let release: () => void = () => undefined;
    act(() => {
      release = acquireGameSuspension();
    });
    expect(host.getAttribute("data-suspended")).toBe("1");
    act(() => release());
    expect(host.getAttribute("data-suspended")).toBeNull();
  });

  it("shows the rotate hint on portrait touch screens until it is dismissed, and remembers that", () => {
    mockMatchMedia(true);
    const { unmount } = render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    expect(screen.getByText("Turn your phone sideways for the best view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss hint" }));
    expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
    expect(window.localStorage.getItem(SWORDCAT_ROTATE_HINT_KEY)).toBe("1");
    unmount();
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
  });

  it("hides the rotate hint by itself after a few seconds, without remembering it", () => {
    jest.useFakeTimers();
    try {
      mockMatchMedia(true);
      render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
      expect(screen.getByTestId("swordcat-rotate-hint")).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_ROTATE_HINT_MS);
      });
      expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
      expect(window.localStorage.getItem(SWORDCAT_ROTATE_HINT_KEY)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the exit button in the frame's top-left corner, inside the gutter the game keeps free", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    const exit = screen.getByTestId("swordcat-exit");
    // (jsdom reorders the calc() terms)
    for (const [value, side] of [[exit.style.top, "top"], [exit.style.left, "left"]] as const) {
      expect(value).toContain(`env(safe-area-inset-${side})`);
      expect(value).toContain(`${SWORDCAT_EXIT_INSET_PX}px`);
    }
    // 44 px at every width (no lg 64 px), and it fits the game's embed gutter (Swordcat ui.css --embed-gut)
    expect(screen.getByRole("button", { name: "Back to games" }).className).toMatch(/lg:!h-\[44px\] lg:!w-\[44px\]/);
    expect(SWORDCAT_EXIT_INSET_PX + SWORDCAT_EXIT_SIZE_PX).toBeLessThanOrEqual(SWORDCAT_EXIT_GUTTER_PX);
    // the frame fills the safe area (inside an iframe the game reads no insets of its own)
    const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
    for (const side of ["top", "bottom"]) expect(frame.style.height).toContain(`safe-area-inset-${side}`);
    for (const side of ["left", "right"]) expect(frame.style.width).toContain(`safe-area-inset-${side}`);
  });

  it("on a slow load: a 'still loading' note after 10 s, the fallback panel later, and a late ready clears both", () => {
    jest.useFakeTimers();
    try {
      render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
      const host = screen.getByTestId("swordcat-host");
      expect(host.getAttribute("data-bridge")).toBe("connecting");
      expect(screen.queryByTestId("swordcat-slow")).toBeNull();
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_HELLO_SLOW_MS + 100);
      });
      expect(host.getAttribute("data-bridge")).toBe("slow");
      expect(screen.getByText("Still loading Pink Paw Knight…")).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_HELLO_TIMEOUT_MS);
      });
      expect(host.getAttribute("data-bridge")).toBe("timeout");
      expect(screen.getByText("Pink Paw Knight is taking too long to load.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Back to games" }).getAttribute("href")).toBe("/game");
      // the game finally answers (hello never stopped): connected, the fallback goes away
      const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ns: SWORDCAT_NS, v: 1, type: "ready", version: "1" },
            origin: "https://swordcat.tokentails.com",
            source: frame.contentWindow,
          })
        );
      });
      expect(host.getAttribute("data-bridge")).toBe("ready");
      expect(screen.queryByTestId("swordcat-timeout")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Reload remounts the frame and starts connecting again", () => {
    jest.useFakeTimers();
    try {
      render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
      const before = screen.getByTestId(SWORDCAT_FRAME_TESTID);
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_HELLO_SLOW_MS + 100);
      });
      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
      expect(screen.getByTestId("swordcat-host").getAttribute("data-bridge")).toBe("connecting");
      expect(screen.getByTestId(SWORDCAT_FRAME_TESTID)).not.toBe(before);
      expect(screen.queryByTestId("swordcat-slow")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows no rotate hint in landscape or with a mouse", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
  });
});

describe("/swordcat page", () => {
  it("redirects to /game and renders nothing while NEXT_PUBLIC_SWORDCAT is off", () => {
    const { container } = render(<SwordcatPage />);
    expect(container.innerHTML).toBe("");
    expect(replace).toHaveBeenCalledWith("/game");
  });
});
