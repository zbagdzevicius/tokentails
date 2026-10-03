/**
 * @jest-environment jsdom
 */
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";

jest.mock("@/api/user-api", () => ({ USER_API: {} }));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({}) }));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
jest.mock("@/components/codex/ImmortalizePetFlow", () => ({
  ImmortalizePetFlow: () => null,
}));
jest.mock("@/components/codex/impact/ImpactTab", () => ({ ImpactTab: () => null }));
jest.mock("@/hooks/useAccountAction", () => ({
  useAccountAction: () => jest.fn(),
  useLatest: (v: unknown) => ({ current: v }),
}));

import {
  CLAIMABLE_TREASURE_TITLE,
  ProgressHudTile,
} from "@/components/codex/Codex";

describe("Codex reward copy (plan G8)", () => {
  it("renders the CLAIMABLE TREASURE tile with its gold theme, not the pink fallback", () => {
    render(
      <ProgressHudTile
        icon="icons/check.webp"
        title={CLAIMABLE_TREASURE_TITLE}
        value="10 $TAILS"
        detail="2 REWARDS READY"
        progress={30}
      />,
    );
    const title = screen.getByText("CLAIMABLE TREASURE");
    expect(title.className).toContain("text-tt-gold-400");
    expect(title.className).not.toContain("text-tt-pink");
  });

  it("uses 'Legendary bonus' and no 'stash' wording in user-facing copy", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/codex/Codex.tsx"),
      "utf8",
    );
    // Strip identifiers (backend/legacy field names stay) and keep string/JSX text.
    const copy = src.replace(/\bstash\w*|\w+Stash\w*/g, "");
    expect(copy).not.toMatch(/stash/i);
    expect(src).toContain("Legendary bonus");
  });
});
