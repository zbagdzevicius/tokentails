/**
 * @jest-environment jsdom
 */
import React from "react";
import fs from "fs";
import path from "path";
import { fireEvent, render, screen } from "@testing-library/react";
import { CloseButton } from "@/components/shared/CloseButton";

/**
 * CloseButton finalisation (plan F3.4, task 4d): `inside` is the default and the legacy `absolute`
 * prop is gone (task 4d deleted it once the last caller dropped it). The guard below keeps it
 * from coming back.
 */

const CLIENT = path.resolve(__dirname, "..");
const SOURCE_DIRS = ["components", "pages", "features", "context", "layouts", "hooks", "lib"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Files that render `<CloseButton ... absolute ...>`. */
function legacyAbsoluteCallers(): string[] {
  return SOURCE_DIRS.flatMap((d) => sourceFiles(path.join(CLIENT, d)))
    .filter((file) => /<CloseButton\b[^>]*\babsolute\b/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(CLIENT, file).split(path.sep).join("/"))
    .sort();
}

describe("CloseButton (F3.4 final)", () => {
  it("defaults to the inside placement", () => {
    render(<CloseButton onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.getAttribute("data-placement")).toBe("inside");
    expect(button.className).toMatch(/(^|\s)absolute(\s|$)/);
    expect(button.className).not.toMatch(/(^|\s)sticky(\s|$)/);
  });

  it("is a real 44 px button with a decorative image, and only viewport applies safe areas", () => {
    const { rerender } = render(<CloseButton onClick={() => {}} label="Back to levels" placement="viewport" />);
    const button = screen.getByRole("button", { name: "Back to levels" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toMatch(/h-\[44px\].*w-\[44px\]|w-\[44px\].*h-\[44px\]/);
    expect(button.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(button.getAttribute("style")).toMatch(/safe-area-inset-top/);
    for (const placement of ["inside", "outside", "sticky"] as const) {
      rerender(<CloseButton onClick={() => {}} placement={placement} />);
      expect(screen.getByRole("button").getAttribute("style") || "").not.toMatch(/safe-area/);
    }
  });

  it("ignores clicks while disabled and does not bubble them", () => {
    const onClick = jest.fn();
    const parent = jest.fn();
    render(
      <div onClick={parent}>
        <CloseButton onClick={onClick} disabled />
      </div>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled();
  });

  it("no caller passes the deleted legacy absolute prop", () => {
    expect(legacyAbsoluteCallers()).toEqual([]);
  });

  it("every caller in the 4d files passes an explicit placement or uses GameModal", () => {
    for (const file of [
      "components/Match3/Match3.tsx",
      "components/shared/EndGameModal.tsx",
      "components/shared/PixelRescueEndGameModal.tsx",
      "components/shared/SuccesPaymentModal.tsx",
      "components/tailsCard/TailsCardModal.tsx",
      "components/tailsCard/VideoPlayer.tsx",
      "components/codex/ProgressStylePickerModal.tsx",
    ]) {
      const text = fs.readFileSync(path.join(CLIENT, file), "utf8");
      const calls = text.match(/<CloseButton\b[^>]*>/g) || [];
      calls.forEach((call) => expect(call).toMatch(/placement=/));
      expect(text).not.toMatch(/fixed inset-0[^"]*z-\[/);
    }
  });
});
