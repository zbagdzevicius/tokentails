/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";

// A guest now has a profile `_id` on /portrait (guest mode, yourcat-v2.md section 6.6). The signed
// checkout route is registered-only and would answer 403 GUEST_FORBIDDEN, so a guest must keep the
// email path, like an anonymous visitor.
const mockProfile: { current: Record<string, unknown> | null } = { current: null };
const mockCreateSigned = jest.fn();
const mockCreateEmail = jest.fn();

jest.mock("@/api/stripe-api", () => ({
  STRIPE_API: {
    createSignedCheckoutSession: (...args: unknown[]) => mockCreateSigned(...args),
    createCheckoutSession: (...args: unknown[]) => mockCreateEmail(...args),
  },
}));
jest.mock("@/components/GoogleTagManager", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: mockProfile.current }) }));
jest.mock("@/features/portrait/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/portrait/components/PortraitFooter", () => ({ PortraitFooter: () => null }));
jest.mock("@/features/portrait/components/LuxuryEffects", () => ({
  LuxuryReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PreviewPage, portraitCheckoutPath } from "@/features/portrait/components/PreviewPage";

function renderPreview() {
  return render(
    <PreviewPage generatedImages={["https://example.test/p.png"]} onRetry={jest.fn()} onBack={jest.fn()} imageId="img-1" />,
  );
}

describe("portrait checkout path", () => {
  beforeEach(() => {
    // jsdom cannot navigate; the redirect is not under test.
    mockCreateSigned.mockResolvedValue({ url: "" });
    mockCreateEmail.mockResolvedValue({ url: "" });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("chooses the signed route only for a registered profile without a typed email", () => {
    expect(portraitCheckoutPath({ _id: "u1" })).toBe("signed");
    expect(portraitCheckoutPath({ _id: "u1", isGuest: false })).toBe("signed");
    expect(portraitCheckoutPath({ _id: "g1", isGuest: true })).toBe("email");
    expect(portraitCheckoutPath(null)).toBe("email");
    expect(portraitCheckoutPath({ _id: "u1" }, "a@b.test")).toBe("email");
  });

  it("a guest profile gets the email form and the unsigned route", async () => {
    mockProfile.current = { _id: "g1", isGuest: true };
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: /download now/i }));
    expect(mockCreateSigned).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "cat@example.test" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to checkout/i }));
    });
    expect(mockCreateSigned).not.toHaveBeenCalled();
    expect(mockCreateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ productType: "digital", imageId: "img-1", email: "cat@example.test" }),
    );
  });

  it("a registered profile goes straight to the signed route", async () => {
    mockProfile.current = { _id: "u1" };
    renderPreview();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download now/i }));
    });
    expect(mockCreateSigned).toHaveBeenCalledWith(expect.objectContaining({ productType: "digital", imageId: "img-1" }));
    expect(mockCreateEmail).not.toHaveBeenCalled();
  });
});
