/**
 * @jest-environment jsdom
 */
/**
 * Web Share helper (bet #3, docs/plans/yourcat-v2.md §5.6).
 */
import { copyShareText, isInAppBrowser, shareCardFile } from "@/components/yourcat/share";

const card = () => new File([new Uint8Array([137, 80, 78, 71])], "tokentails-mochi-story.png", { type: "image/png" });

function setNavigator(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

afterEach(() => {
  setNavigator({ share: undefined, canShare: undefined, clipboard: undefined });
  jest.restoreAllMocks();
});

describe("shareCardFile", () => {
  it("shares the file and the text, with no url, synchronously inside the tap", async () => {
    const share = jest.fn(() => Promise.resolve());
    setNavigator({ share, canShare: jest.fn(() => true) });
    const file = card();
    const pending = shareCardFile(file, "Meet Mochi. https://tokentails.com/yourcat");
    // Called before anything was awaited: the user activation is still there.
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ files: [file], title: "Token Tails", text: "Meet Mochi. https://tokentails.com/yourcat" });
    expect(Object.keys((share.mock.calls[0] as unknown[])[0] as object)).not.toContain("url");
    await expect(pending).resolves.toBe("web-share");
  });

  it("an AbortError is 'cancelled'", async () => {
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    setNavigator({ share: jest.fn(() => Promise.reject(abort)), canShare: () => true });
    await expect(shareCardFile(card(), "x")).resolves.toBe("cancelled");
  });

  it("another share error is 'failed'", async () => {
    setNavigator({ share: jest.fn(() => Promise.reject(new Error("NotAllowedError"))), canShare: () => true });
    await expect(shareCardFile(card(), "x")).resolves.toBe("failed");
  });

  it("without canShare it downloads with a temporary link and revokes the URL", async () => {
    jest.useFakeTimers();
    try {
      setNavigator({ share: jest.fn(), canShare: undefined });
      const create = jest.fn(() => "blob:card");
      const revoke = jest.fn();
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
      const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
      await expect(shareCardFile(card(), "x")).resolves.toBe("download");
      expect(click).toHaveBeenCalledTimes(1);
      expect(navigator.share).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledWith("blob:card");
    } finally {
      jest.useRealTimers();
    }
  });

  it("canShare false for files also downloads", async () => {
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const share = jest.fn();
    setNavigator({ share, canShare: () => false });
    await expect(shareCardFile(card(), "x")).resolves.toBe("download");
    expect(share).not.toHaveBeenCalled();
  });
});

describe("copyShareText", () => {
  it("copies with the clipboard", async () => {
    const writeText = jest.fn(async () => undefined);
    setNavigator({ clipboard: { writeText } });
    await expect(copyShareText("Meet Mochi")).resolves.toBe("copy-link");
    expect(writeText).toHaveBeenCalledWith("Meet Mochi");
  });

  it("reports failure when the clipboard refuses or is missing", async () => {
    setNavigator({ clipboard: { writeText: jest.fn(async () => Promise.reject(new Error("denied"))) } });
    await expect(copyShareText("x")).resolves.toBe("failed");
    setNavigator({ clipboard: undefined });
    await expect(copyShareText("x")).resolves.toBe("failed");
  });
});

describe("isInAppBrowser", () => {
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0]",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0;]",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TikTok 32.0",
  ])("true for in-app browsers: %s", (ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ])("false for browsers: %s", (ua) => {
    expect(isInAppBrowser(ua)).toBe(false);
  });
});
