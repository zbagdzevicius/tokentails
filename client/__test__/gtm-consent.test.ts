/**
 * @jest-environment jsdom
 *
 * Google Tag Manager consent gate (analytics/gtm.ts), the GoogleTagManager
 * component, and the article URLs in the sitemap config.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  writeConsent,
  type ConsentState,
} from "@/analytics/consent";
import { createGtmGate, GTM_SCRIPT_URL } from "@/analytics/gtm";

const mockRouterEvents = { on: jest.fn(), off: jest.fn() };
jest.mock("next/router", () => ({
  useRouter: () => ({ events: mockRouterEvents }),
}));

type TestWindow = Window & { dataLayer?: unknown[] };
const win = window as TestWindow;

const gtmScripts = () =>
  Array.from(document.querySelectorAll("script")).filter((script) =>
    script.src.startsWith(GTM_SCRIPT_URL),
  );

const events = () =>
  (win.dataLayer ?? [])
    .filter((entry) => !isArguments(entry))
    .map((entry) => (entry as { event?: string }).event);

const consentCommands = () =>
  (win.dataLayer ?? [])
    .filter(isArguments)
    .map((entry) => Array.from(entry as IArguments));

function isArguments(value: unknown): boolean {
  return Object.prototype.toString.call(value) === "[object Arguments]";
}

function dispatchConsent(state: ConsentState) {
  window.dispatchEvent(
    new CustomEvent<ConsentState>(CONSENT_CHANGE_EVENT, { detail: state }),
  );
}

beforeEach(() => {
  delete win.dataLayer;
  document.head.innerHTML = "";
  window.localStorage.clear();
});

describe("GTM consent gate", () => {
  it("loads nothing and sends nothing before consent", () => {
    for (const stored of ["unset", "denied"] as const) {
      const gate = createGtmGate({
        gtmId: "GTM-TEST",
        readConsent: () => stored,
      });
      const stop = gate.start();
      expect(gate.push({ event: "page_view" })).toBe(false);
      expect(gate.isLoaded()).toBe(false);
      stop();
    }
    expect(gtmScripts()).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("loads once on grant with Consent Mode defaults denied", () => {
    const gate = createGtmGate({
      gtmId: "GTM-TEST",
      readConsent: () => "unset",
    });
    const stop = gate.start();
    dispatchConsent("granted");
    dispatchConsent("granted");

    expect(gtmScripts()).toHaveLength(1);
    expect(gtmScripts()[0].src).toBe(`${GTM_SCRIPT_URL}?id=GTM-TEST`);
    const [first, second] = consentCommands();
    expect(first).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(second).toEqual([
      "consent",
      "update",
      { analytics_storage: "granted" },
    ]);
    // The consent default is the first thing GTM sees.
    expect(isArguments(win.dataLayer?.[0])).toBe(true);
    expect(events()).toEqual(["gtm.js"]);
    stop();
  });

  it("does not replay events dropped before consent", () => {
    const gate = createGtmGate({
      gtmId: "GTM-TEST",
      readConsent: () => "unset",
    });
    gate.push({ event: "view_item" });
    gate.applyConsent("granted");
    gate.push({ event: "purchase" });
    expect(events()).toEqual(["gtm.js", "purchase"]);
  });

  it("stops pushing and downgrades consent when revoked", () => {
    const gate = createGtmGate({
      gtmId: "GTM-TEST",
      readConsent: () => "granted",
    });
    const stop = gate.start();
    expect(gate.isLoaded()).toBe(true);
    dispatchConsent("denied");

    expect(gate.push({ event: "page_view" })).toBe(false);
    expect(consentCommands().at(-1)).toEqual([
      "consent",
      "update",
      { analytics_storage: "denied" },
    ]);
    expect(events()).toEqual(["gtm.js"]);
    stop();
  });

  it("calls onGranted only on a fresh opt-in", () => {
    const onGranted = jest.fn();
    const gate = createGtmGate({
      gtmId: "GTM-TEST",
      readConsent: () => "unset",
    });
    const stop = gate.start(onGranted);
    dispatchConsent("granted");
    dispatchConsent("granted");
    expect(onGranted).toHaveBeenCalledTimes(1);
    stop();
    dispatchConsent("denied");
    dispatchConsent("granted");
    expect(onGranted).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without a container id, even with consent", () => {
    const gate = createGtmGate({ gtmId: " ", readConsent: () => "granted" });
    gate.start();
    expect(gate.enabled).toBe(false);
    expect(gate.push({ event: "page_view" })).toBe(false);
    expect(gtmScripts()).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("is SSR safe when there is no window", () => {
    const gate = createGtmGate({
      gtmId: "GTM-TEST",
      readConsent: () => "granted",
      getWindow: () => undefined,
    });
    expect(() => gate.start()()).not.toThrow();
    expect(gate.push({ event: "page_view" })).toBe(false);
    expect(() => gate.applyConsent("granted")).not.toThrow();
    expect(gate.isLoaded()).toBe(false);
  });

  it("reads the shared tt-analytics-consent key by default", () => {
    expect(CONSENT_STORAGE_KEY).toBe("tt-analytics-consent");
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    const gate = createGtmGate({ gtmId: "GTM-TEST" });
    gate.start();
    expect(gtmScripts()).toHaveLength(1);
  });

  it("keeps the document free of an unconditional GTM snippet", () => {
    const source = readFileSync(
      join(__dirname, "..", "pages", "_document.js"),
      "utf8",
    );
    expect(source).not.toMatch(/googletagmanager\.com/);
    expect(source).not.toMatch(/dataLayer/);
  });
});

describe("GoogleTagManager component", () => {
  type Loaded = {
    mod: typeof import("@/components/GoogleTagManager");
    React: typeof import("react");
    ReactDOM: typeof import("react-dom/client");
  };

  // A fresh module registry per test gives a fresh `gtm` singleton that sees
  // NEXT_PUBLIC_GTM_ID. React and react-dom come from the same registry
  // (Testing Library is not used here: it registers hooks when required).
  function load(): Loaded {
    let loaded: Loaded | undefined;
    jest.isolateModules(() => {
      loaded = {
        /* eslint-disable @typescript-eslint/no-require-imports */
        mod: require("@/components/GoogleTagManager"),
        React: require("react"),
        ReactDOM: require("react-dom/client"),
        /* eslint-enable @typescript-eslint/no-require-imports */
      };
    });
    return loaded!;
  }

  let unmount: (() => void) | undefined;

  function mount() {
    const loaded = load();
    const root = loaded.ReactDOM.createRoot(document.createElement("div"));
    loaded.React.act(() => {
      root.render(loaded.React.createElement(loaded.mod.GoogleTagManager));
    });
    unmount = () => loaded.React.act(() => root.unmount());
    return { mod: loaded.mod, act: loaded.React.act };
  }

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST";
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    jest.useRealTimers();
    delete process.env.NEXT_PUBLIC_GTM_ID;
  });

  it("sends no page_view and no trackEvent before consent", () => {
    const { mod, act } = mount();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    mod.trackEvent("view_item", { item_id: "x" });
    expect(gtmScripts()).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("loads and records the current page when the player accepts", () => {
    const { mod, act } = mount();
    act(() => {
      jest.advanceTimersByTime(200);
      writeConsent("granted");
    });
    mod.trackEvent("add_to_cart", { item_id: "x" });
    expect(gtmScripts()).toHaveLength(1);
    expect(events()).toEqual(["gtm.js", "page_view", "add_to_cart"]);

    const onRoute = mockRouterEvents.on.mock.calls.find(
      ([name]) => name === "routeChangeComplete",
    )?.[1];
    onRoute("/feed");
    expect(win.dataLayer?.at(-1)).toEqual({
      event: "page_view",
      page_path: "/feed",
    });
  });

  it("pushes the initial page_view when consent is already stored", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    const { act } = mount();
    expect(gtmScripts()).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(events()).toEqual(["gtm.js", "page_view"]);
  });
});

describe("sitemap article URLs", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it("prefixes every article with /feed to match pages/feed/[category]/[article]", async () => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_BE_URL = "https://api.example";
    delete process.env.NEXT_PUBLIC_IS_APP;
    jest.doMock("node-fetch", () => ({
      __esModule: true,
      default: async () => ({
        ok: true,
        json: async () => ({
          article: [
            {
              category: "cats-nft",
              slug: "best-virtual-pet-games",
              updatedAt: "2026-01-01T00:00:00.000Z",
              featuredImage: "https://img.example/a.webp",
              title: "A",
            },
            { category: "", slug: "broken", updatedAt: "2026-01-01" },
          ],
        }),
      }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../next-sitemap.config.js");
    const paths = await config.additionalPaths();
    expect(paths.map((path: { loc: string }) => path.loc)).toEqual([
      "/feed/cats-nft/best-virtual-pet-games",
    ]);
    expect(config.exclude).toEqual(
      expect.arrayContaining(["/gaming", "/cats/view", "/feed/article"]),
    );
  });
});
