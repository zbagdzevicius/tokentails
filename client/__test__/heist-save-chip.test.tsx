/**
 * @jest-environment jsdom
 */
/**
 * The /heist save chip (plan G2 layer 1): a 409 never says "saved" for another account's row.
 */
import { HeistSaveChip, saveChipText } from "@/components/heist/HeistSaveChip";
import { render, screen } from "@testing-library/react";

describe("saveChipText for a 409 duplicate", () => {
  it("tells the caller's own row from another account's", () => {
    expect(saveChipText({ kind: "duplicate", duplicate: "mine", account: true })).toBe("Already saved to your account.");
    expect(saveChipText({ kind: "duplicate", duplicate: "unknown" })).toBe("Already saved.");
    expect(saveChipText({ kind: "duplicate", duplicate: "other", account: true })).toBe(
      "This heist is already saved on another account."
    );
    expect(saveChipText({ kind: "duplicate", duplicate: "other" })).not.toMatch(/saved to your account|Heist saved/);
  });

  it("renders it in the status region", () => {
    render(<HeistSaveChip state={{ kind: "duplicate", duplicate: "other" }} onDismiss={() => undefined} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-kind")).toBe("duplicate");
    expect(status.className).toContain("border-tt-rust/80");
  });
});
