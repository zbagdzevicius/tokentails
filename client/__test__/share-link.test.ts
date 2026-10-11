/**
 * @jest-environment jsdom
 */
import { readFileSync } from "fs";
import { join } from "path";
import { COPIED_INVITE_MESSAGE, shareLink } from "@/context/auth/shareLink";

// Known issue KI-21: `utils.shareURL(url, text?)` dropped `text`, and ShareModal toasted "coppied".
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Nav = { share?: unknown; clipboard?: unknown };
const nav = navigator as unknown as Nav;

describe("shareLink (utils.shareURL)", () => {
  const original = { share: nav.share, clipboard: nav.clipboard };
  let toast: jest.Mock;
  let writeText: jest.Mock;

  beforeEach(() => {
    toast = jest.fn();
    writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: original.share, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: original.clipboard, configurable: true });
  });

  it("passes the url and the text to the share sheet", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    shareLink("https://tokentails.com/?ref=a", "Play with my cat", toast);
    await flush();
    expect(share).toHaveBeenCalledWith({ url: "https://tokentails.com/?ref=a", text: "Play with my cat" });
    expect(writeText).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("shares the url alone when there is no text", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    shareLink("https://tokentails.com/", undefined, toast);
    await flush();
    expect(share).toHaveBeenCalledWith({ url: "https://tokentails.com/" });
  });

  it("does nothing when the player cancels the share sheet", async () => {
    const share = jest.fn().mockRejectedValue(Object.assign(new Error("cancel"), { name: "AbortError" }));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    shareLink("https://tokentails.com/", "hi", toast);
    await flush();
    expect(writeText).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("copies the link when sharing fails for another reason", async () => {
    const share = jest.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    shareLink("https://tokentails.com/", "hi", toast);
    await flush();
    expect(writeText).toHaveBeenCalledWith("https://tokentails.com/");
    expect(toast).toHaveBeenCalledWith({ message: COPIED_INVITE_MESSAGE });
  });

  it("copies the link where the browser has no share sheet", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    shareLink("https://tokentails.com/", "hi", toast);
    await flush();
    expect(writeText).toHaveBeenCalledWith("https://tokentails.com/");
    expect(toast).toHaveBeenCalledWith({ message: COPIED_INVITE_MESSAGE });
  });

  it("shows the link itself when copying fails", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    writeText.mockRejectedValue(new Error("blocked"));
    shareLink("https://tokentails.com/", undefined, toast);
    await flush();
    expect(toast).toHaveBeenCalledWith({ message: "https://tokentails.com/" });
  });

  it("FirebaseAuthContext hands the text through to shareLink", () => {
    const source = readFileSync(join(__dirname, "../context/FirebaseAuthContext.tsx"), "utf8");
    expect(source).toMatch(/shareURL: \(url: string, text\?: string\) => shareLink\(url, text, toast\)/);
  });
});

describe("ShareModal copy", () => {
  it("says 'Link copied' and never 'coppied'", () => {
    const source = readFileSync(join(__dirname, "../components/shared/ShareModal.tsx"), "utf8");
    expect(source).not.toMatch(/coppied/i);
    expect(source).toMatch(/message: "Link copied"/);
  });
});
