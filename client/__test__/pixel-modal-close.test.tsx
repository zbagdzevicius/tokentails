/**
 * @jest-environment jsdom
 */
import React from "react";
import fs from "fs";
import path from "path";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
}));
jest.mock("@/components/codex/Codex", () => ({
  Codex: () => <div>codex</div>,
}));
// CodexModal reads the scene for the Tails explainer (task 6a); no GameProvider here.
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ gameType: null, isStarted: false, gameStop: null }) }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: null, setProfileUpdate: jest.fn() }),
}));
jest.mock("@/context/ToastContext", () => ({
  useToast: () => jest.fn(),
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => undefined }));
jest.mock("@/hooks/useSuspendGame", () => ({ useSuspendGame: jest.fn() }));
jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/api/ticket-api", () => ({
  TICKET_API: { getTickets: jest.fn(), createTicket: jest.fn() },
}));

import { CodexModal } from "@/components/shared/CodexModal";
import { SupportModal } from "@/components/shared/SupportModal";

// CloseButton is a real <button aria-label="Close"> (F3.4), so each modal has
// exactly one keyboard-reachable Close control and no duplicate sr-only copy.
describe("modal keyboard close", () => {
  it.each([
    ["CodexModal", CodexModal],
    ["SupportModal", SupportModal],
  ] as const)("%s has a focusable, labelled Close button", (_, Modal) => {
    const close = jest.fn();
    render(<Modal close={close} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.getAttribute("type")).toBe("button");
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    "InviteModal",
    "ProfileModal",
    "CodexModal",
    "QuestsModal",
    "SupportModal",
  ])("%s closes through GameModal's CloseButton only (no duplicate Close button)", (name) => {
    const source = fs.readFileSync(
      path.join(__dirname, `../components/shared/${name}.tsx`),
      "utf8"
    );
    // Task 4c: these are GameModals, which render the one CloseButton (F3.3/F3.4).
    expect(source).toMatch(/from "@\/components\/ui\/GameModal"/);
    expect(source).not.toMatch(/aria-label="Close"/);
  });
});
