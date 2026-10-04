/**
 * @jest-environment jsdom
 */
import fs from "fs";
import path from "path";

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

const codexSource = () =>
  fs.readFileSync(path.join(__dirname, "../components/codex/Codex.tsx"), "utf8");

describe("Codex reward copy (plan G8)", () => {
  it("says 'To claim' in plain words, not the old HUD jargon", () => {
    const src = codexSource();
    expect(src).toContain('label="To claim"');
    expect(src).not.toMatch(/CLAIMABLE TREASURE|COMMAND CENTER|TIER ASCENT|COMBO POWER|BADGE YIELD/);
  });

  it("uses 'Legendary bonus' and no 'stash' wording in user-facing copy", () => {
    const src = codexSource();
    // Strip identifiers (backend/legacy field names stay) and keep string/JSX text.
    const copy = src.replace(/\bstash\w*|\w+Stash\w*/g, "");
    expect(copy).not.toMatch(/stash/i);
    expect(src).toContain("Legendary bonus");
  });
});
