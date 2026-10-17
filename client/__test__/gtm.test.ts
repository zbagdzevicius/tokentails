/**
 * Google Tag Manager with no consent gate (`analytics/gtm.ts`): it loads for every visitor.
 */
import { createGtm, GTM_SCRIPT_URL } from "@/analytics/gtm";

type FakeWindow = Window & { dataLayer?: unknown[] };

function fakeWindow() {
  const appended: Array<{ src: string; async: boolean; dataset: Record<string, string> }> = [];
  const win = {
    document: {
      createElement: () => ({ src: "", async: false, dataset: {} as Record<string, string> }),
      head: { appendChild: (el: (typeof appended)[number]) => appended.push(el) },
    },
  } as unknown as FakeWindow;
  return { win, appended };
}

const isConsentCommand = (entry: unknown) =>
  !!entry && typeof entry === "object" && (entry as { [0]?: unknown })[0] === "consent";

describe("gtm", () => {
  it("loads gtm.js on start with no stored state and pushes no consent commands", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: "GTM-TEST", getWindow: () => win });

    gtm.start();

    expect(gtm.isLoaded()).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(`${GTM_SCRIPT_URL}?id=GTM-TEST`);
    expect(appended[0].async).toBe(true);
    expect(win.dataLayer).toEqual([expect.objectContaining({ event: "gtm.js" })]);
    expect(win.dataLayer!.some(isConsentCommand)).toBe(false);
  });

  it("pushes page_view and other events at once, loading only once", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: "GTM-TEST", getWindow: () => win });

    expect(gtm.push({ event: "page_view", page_path: "/" })).toBe(true);
    gtm.start();
    expect(gtm.push({ event: "begin_checkout", value: 16 })).toBe(true);

    expect(appended).toHaveLength(1);
    expect(win.dataLayer).toEqual([
      expect.objectContaining({ event: "gtm.js" }),
      { event: "page_view", page_path: "/" },
      { event: "begin_checkout", value: 16 },
    ]);
    expect(win.dataLayer!.some(isConsentCommand)).toBe(false);
  });

  it("is a no-op without a container id", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: "  ", getWindow: () => win });

    gtm.start();
    expect(gtm.enabled).toBe(false);
    expect(gtm.push({ event: "page_view" })).toBe(false);
    expect(appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("is SSR safe", () => {
    const gtm = createGtm({ gtmId: "GTM-TEST", getWindow: () => undefined });

    expect(() => gtm.start()()).not.toThrow();
    expect(gtm.push({ event: "page_view" })).toBe(false);
    expect(gtm.isLoaded()).toBe(false);
  });
});
