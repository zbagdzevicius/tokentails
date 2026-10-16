/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// CR1-02: a paid /portrait or /portraits buyer must download the paid full-resolution PNG, not the
// watermarked 1024 px preview the page showed before payment.

const PREVIEW = "https://cdn.test/preview-1024.webp";
const PAID = "https://cdn.test/paid-4k.png";

const mockRouter = {
  isReady: true,
  pathname: "/portrait",
  query: { image_id: "img-1", _id: "order-1" } as Record<string, string>,
  replace: jest.fn(),
  push: jest.fn(),
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));

const mockGet = jest.fn();
const mockGetOrderById = jest.fn();
jest.mock("@/api/image-api", () => ({
  IMAGE_API: {
    get: (...args: unknown[]) => mockGet(...args),
    getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
    generatePortrait: jest.fn(),
    regeneratePortrait: jest.fn(),
  },
  PortraitPreviewError: class extends Error {},
  SignInRequiredError: class extends Error {},
}));
jest.mock("@/api/stripe-api", () => ({ STRIPE_API: {} }));
jest.mock("@/components/GoogleTagManager", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: null }) }));
jest.mock("@/context/FirebaseAuthContext", () => ({
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// The real `toast` is a module-level function, so its identity is stable across renders; a new jest.fn()
// per render would re-run the pages' restore effects in a loop.
const mockToast = jest.fn();
jest.mock("@/features/portrait/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/features/portrait/ui/toaster", () => ({ Toaster: () => null }));
jest.mock("@/features/portrait/components/PortraitFooter", () => ({ PortraitFooter: () => null }));
jest.mock("@/features/portrait/components/LuxuryEffects", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    LuxuryReveal: Pass,
    FloatingParticles: () => null,
    AmbientGlow: () => null,
    SparkleEffect: () => null,
    AttentionPulse: Pass,
  };
});

import {
  PAID_PORTRAIT_RETRY_DELAYS_MS,
  fetchPaidPortraitUrl,
  paidPortraitUrl,
  portraitDownloadName,
} from "@/features/portrait/paid-portrait";
import { PreviewPage } from "@/features/portrait/components/PreviewPage";
import { OrderStatus } from "@/models/order";
import PortraitPage from "@/pages/portrait";
import PortraitsPage from "@/pages/portraits";

const previewImage = { url: "https://cdn.test/upload.jpg", aiUrl: PREVIEW, previewUrl: PREVIEW };
const paidImage = { url: "https://cdn.test/upload.jpg", aiUrl: PAID, previewUrl: PREVIEW };

describe("paidPortraitUrl", () => {
  it("is null while the answer still carries the watermarked preview", () => {
    expect(paidPortraitUrl(previewImage)).toBeNull();
    expect(paidPortraitUrl(null)).toBeNull();
    expect(paidPortraitUrl({ url: "u" })).toBeNull();
  });

  it("is the paid URL once aiUrl differs from the preview", () => {
    expect(paidPortraitUrl(paidImage)).toBe(PAID);
  });

  it("accepts an older portrait without a preview (its aiUrl is already the full file)", () => {
    expect(paidPortraitUrl({ url: "u", aiUrl: PAID })).toBe(PAID);
  });
});

describe("fetchPaidPortraitUrl", () => {
  const noSleep = jest.fn(() => Promise.resolve());

  beforeEach(() => noSleep.mockClear());

  it("retries with backoff while the image still returns the preview", async () => {
    const getImage = jest
      .fn()
      .mockResolvedValueOnce(previewImage)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(paidImage);
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(fetchPaidPortraitUrl("img-1", getImage, { sleep: noSleep })).resolves.toBe(PAID);
    expect(getImage).toHaveBeenCalledTimes(3);
    expect(noSleep.mock.calls.map((call: unknown[]) => call[0])).toEqual([1000, 2000]);
  });

  it("gives up with null after the last attempt", async () => {
    const getImage = jest.fn().mockResolvedValue(previewImage);
    await expect(fetchPaidPortraitUrl("img-1", getImage, { sleep: noSleep })).resolves.toBeNull();
    expect(getImage).toHaveBeenCalledTimes(PAID_PORTRAIT_RETRY_DELAYS_MS.length + 1);
  });

  it("stops when cancelled", async () => {
    const getImage = jest.fn().mockResolvedValue(paidImage);
    await expect(
      fetchPaidPortraitUrl("img-1", getImage, { sleep: noSleep, isCancelled: () => true }),
    ).resolves.toBeNull();
    expect(getImage).not.toHaveBeenCalled();
  });
});

describe("portraitDownloadName", () => {
  it("uses the paid file's extension, png by default", () => {
    expect(portraitDownloadName("img-1", PAID)).toBe("portrait-img-1.png");
    expect(portraitDownloadName("img-1", "https://cdn.test/a.webp?x=1")).toBe("portrait-img-1.webp");
    expect(portraitDownloadName(undefined, "https://cdn.test/no-extension")).toBe(
      "portrait-download.png",
    );
  });
});

describe("PreviewPage download button after a COMPLETE order", () => {
  const renderPaid = (props: Partial<React.ComponentProps<typeof PreviewPage>>) =>
    render(
      <PreviewPage
        generatedImages={[PAID]}
        onRetry={jest.fn()}
        onBack={jest.fn()}
        imageId="img-1"
        orderStatus={OrderStatus.COMPLETE}
        {...props}
      />,
    );

  it("is disabled and says it is preparing until the paid URL arrives", () => {
    renderPaid({ generatedImages: [PREVIEW], downloadStatus: "preparing" });
    const button = screen.getByRole("button", { name: /preparing your file/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /^download$/i })).toBeNull();
  });

  it("offers a retry when the paid file could not be fetched", () => {
    const onRetryDownload = jest.fn();
    renderPaid({ generatedImages: [PREVIEW], downloadStatus: "unavailable", onRetryDownload });
    expect(screen.queryByRole("button", { name: /^download$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetryDownload).toHaveBeenCalledTimes(1);
  });

  it("saves the paid PNG with a .png name once ready", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = jest.fn(() => "blob:paid");
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
    const names: string[] = [];
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });

    renderPaid({ downloadStatus: "ready" });
    fireEvent.click(screen.getByRole("button", { name: /^download$/i }));

    await waitFor(() => expect(names).toEqual(["portrait-img-1.png"]));
    expect(fetchMock).toHaveBeenCalledWith(PAID);
    click.mockRestore();
  });
});

// framer-motion's whileInView on the landing sections needs it; jsdom has none.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
(global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NoopIntersectionObserver;

describe.each([
  ["/portrait", PortraitPage],
  ["/portraits", PortraitsPage],
])("%s after Stripe returns with a COMPLETE order", (_path, Page) => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGet.mockReset();
    mockGetOrderById.mockReset();
    mockGetOrderById.mockResolvedValue({ status: OrderStatus.COMPLETE, id: "digital", price: 14 });
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("re-fetches the image and swaps the preview for the paid PNG before the download is enabled", async () => {
    // Restore shows the preview; the first refetch still has it, the second has the paid copy.
    mockGet
      .mockResolvedValueOnce(previewImage)
      .mockResolvedValueOnce(previewImage)
      .mockResolvedValue(paidImage);

    const { container } = render(<Page />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector(`img[src="${PREVIEW}"]`)).not.toBeNull();

    // The order poll runs every 2 s and finds the order COMPLETE.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect((screen.getByRole("button", { name: /preparing your file/i }) as HTMLButtonElement).disabled).toBe(true);

    // First backoff (1 s) passes; the second refetch carries the paid URL.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    expect((screen.getByRole("button", { name: /^download$/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector(`img[src="${PAID}"]`)).not.toBeNull();
    expect(container.querySelector(`img[src="${PREVIEW}"]`)).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockGet).toHaveBeenCalledWith("img-1");
  });
});
