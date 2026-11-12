/**
 * @jest-environment jsdom
 */
/**
 * Sign-in: the Paw Legends account panel (the host's "Manage account" sheet and /pawlegends/account, the account
 * deletion page Google Play's Data safety links to): signed out it offers sign-in, signed in it says how, signs
 * out, and deletes the account through the Token Tails deletion.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

const mockAuth = jest.fn((): unknown => undefined);
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => mockAuth(),
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: { name: "Pat" } }) }));
const mockDeleteMe = jest.fn(async () => ({ success: true }));
jest.mock("@/api/user-api", () => ({ USER_API: { deleteMe: (...a: unknown[]) => mockDeleteMe(...(a as [])) } }));
const mockDeletion = jest.fn();
jest.mock("@/lib/accountDeletion", () => ({
  signedInWith: (p?: string[]) => (p?.includes("apple.com") ? "With Apple" : null),
  requestAccountDeletion: async (deps: { deleteMe: (c?: string) => Promise<unknown>; signOut: () => Promise<void> }) => {
    mockDeletion(deps);
    await deps.deleteMe(undefined);
    await deps.signOut();
    return { status: "deleted" };
  },
}));
jest.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "web", isNativePlatform: () => false } }));
jest.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: {} }));
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: () => null }));
jest.mock("@/components/ui/GameModal", () => ({ GameModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("@/components/ui/modal", () => ({
  ActionRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DangerZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ConfirmAction: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>
      {label}
    </button>
  ),
  ModalButton: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick: () => void; "data-testid"?: string }) => (
    <button type="button" onClick={onClick} data-testid={rest["data-testid"]}>
      {children}
    </button>
  ),
}));

import { PawlegendsAccountPanel, signedInLine } from "@/components/pawlegends/PawlegendsAccount";
import PawlegendsAccountPage from "@/pages/account";

describe("Paw Legends account", () => {
  it("signed out: Sign in, and how to delete an account", () => {
    const requireAccount = jest.fn(async () => "signed-in");
    mockAuth.mockReturnValue({ user: null, authStatus: "signed-out", requireAccount, signOut: jest.fn() });
    render(<PawlegendsAccountPage />);
    fireEvent.click(screen.getByTestId("pawlegends-account-sign-in"));
    expect(requireAccount).toHaveBeenCalledWith("sign-in");
    expect(screen.getByTestId("pawlegends-account-deletion").textContent).toContain("Delete account");
  });

  it("signed in: who and how, Sign out, and Delete account through DELETE /user/me", async () => {
    const signOut = jest.fn(async () => undefined);
    mockAuth.mockReturnValue({ user: { uid: "u", isAnonymous: false, providers: ["apple.com"] }, authStatus: "ready", requireAccount: jest.fn(), signOut });
    render(<PawlegendsAccountPanel />);
    expect(screen.getByTestId("pawlegends-account-who").textContent).toContain("Pat");
    expect(screen.getByTestId("pawlegends-account-who").textContent).toContain("Signed in with Apple");
    await act(async () => {
      fireEvent.click(screen.getByText("DELETE ACCOUNT"));
    });
    expect(mockDeleteMe).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(mockDeletion.mock.calls[0][0].needsAppleCode).toBe(false);
  });

  it("an anonymous guest counts as signed out", () => {
    mockAuth.mockReturnValue({ user: { uid: "g", isAnonymous: true, providers: [] }, authStatus: "guest", requireAccount: jest.fn(), signOut: jest.fn() });
    render(<PawlegendsAccountPanel />);
    expect(screen.getByTestId("pawlegends-account-signed-out")).toBeTruthy();
    expect(signedInLine([])).toBe("Signed in");
  });
});
