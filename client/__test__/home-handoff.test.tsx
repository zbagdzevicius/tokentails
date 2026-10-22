/**
 * @jest-environment jsdom
 *
 * Web "/" is the static home page (components/home/staticHome.ts). A client-side navigation to "/"
 * must reload instead of rendering pages/index.tsx; app builds and every other route render as before.
 */
import React from "react";
import { render } from "@testing-library/react";
import type { AppProps } from "next/app";

let mockPathname = "/";
const mockLoadStaticHome = jest.fn(() => true);

jest.mock("next/router", () => ({ useRouter: () => ({ pathname: mockPathname }) }));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
jest.mock("next/dynamic", () => ({ __esModule: true, default: () => () => null }));
jest.mock("@/layouts/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/AppRouteRestore", () => ({ AppRouteRestore: () => null }));
jest.mock("@/components/errors/RootBoundary", () => ({
  RootBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/home/staticHome", () => ({
  ...jest.requireActual("@/components/home/staticHome"),
  loadStaticHome: () => mockLoadStaticHome(),
}));
jest.mock("../styles/globals.scss", () => ({}), { virtual: true });

/* eslint-disable @typescript-eslint/no-require-imports */
const { clearStaticHomeStamp, loadStaticHome, servesStaticHome, STATIC_HOME_STAMP_TTL_MS } = jest.requireActual(
  "@/components/home/staticHome",
) as typeof import("@/components/home/staticHome");
const MyApp = require("../pages/_app").default as (props: AppProps) => React.ReactElement | null;

/* eslint-enable @typescript-eslint/no-require-imports */

const Page = () => <main data-testid="page">page</main>;
const renderApp = () => render(<MyApp Component={Page} pageProps={{}} router={{} as AppProps["router"]} />);

describe("static home handoff", () => {
  const previous = process.env.NEXT_PUBLIC_IS_APP;
  afterEach(() => {
    mockLoadStaticHome.mockClear();
    if (previous === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
    else process.env.NEXT_PUBLIC_IS_APP = previous;
  });

  it("servesStaticHome is true only for / in a web build", () => {
    expect(servesStaticHome("/", false)).toBe(true);
    expect(servesStaticHome("/", true)).toBe(false);
    expect(servesStaticHome("/game", false)).toBe(false);
    expect(servesStaticHome("", false)).toBe(false);
  });

  const memoryStore = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage;
  };

  it("loadStaticHome reloads the same URL, query and hash included", () => {
    const replace = jest.fn();
    const ok = loadStaticHome(
      { location: { href: "https://tokentails.com/?club_portal=expired#club", replace } as unknown as Location, sessionStorage: memoryStore() },
      1_000,
    );
    expect(ok).toBe(true);
    expect(replace).toHaveBeenCalledWith("https://tokentails.com/?club_portal=expired#club");
  });

  it("loadStaticHome reloads once: a second call moments later (rewrite missing) falls back instead of looping", () => {
    const replace = jest.fn();
    const win = { location: { href: "https://tokentails.com/", replace } as unknown as Location, sessionStorage: memoryStore() };
    expect(loadStaticHome(win, 1_000)).toBe(true);
    expect(loadStaticHome(win, 2_000)).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
    // The stamp was consumed, so a later navigation reloads again; so does one after another page cleared it.
    expect(loadStaticHome(win, 3_000)).toBe(true);
    clearStaticHomeStamp(win);
    expect(loadStaticHome(win, 4_000)).toBe(true);
    // A stale stamp (the static page loaded long ago) does not block the reload.
    expect(loadStaticHome(win, 4_000 + STATIC_HOME_STAMP_TTL_MS)).toBe(true);
  });

  it("loadStaticHome never reloads without sessionStorage (fail safe)", () => {
    const replace = jest.fn();
    const blocked = {
      location: { href: "https://tokentails.com/", replace } as unknown as Location,
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    };
    expect(loadStaticHome(blocked, 1_000)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("web: a navigation to / renders nothing and reloads", () => {
    delete process.env.NEXT_PUBLIC_IS_APP;
    mockPathname = "/";
    const { queryByTestId } = renderApp();
    expect(queryByTestId("page")).toBeNull();
    expect(mockLoadStaticHome).toHaveBeenCalledTimes(1);
  });

  it("web: when the reload guard trips, / renders pages/index.tsx instead of a blank page", async () => {
    delete process.env.NEXT_PUBLIC_IS_APP;
    mockPathname = "/";
    mockLoadStaticHome.mockReturnValueOnce(false);
    const { findByTestId } = renderApp();
    expect(await findByTestId("page")).toBeTruthy();
  });

  it("web: every other route renders its page", () => {
    delete process.env.NEXT_PUBLIC_IS_APP;
    mockPathname = "/game";
    const { getByTestId } = renderApp();
    expect(getByTestId("page")).toBeTruthy();
    expect(mockLoadStaticHome).not.toHaveBeenCalled();
  });

  it("app build: / renders pages/index.tsx", () => {
    process.env.NEXT_PUBLIC_IS_APP = "true";
    mockPathname = "/";
    const { getByTestId } = renderApp();
    expect(getByTestId("page")).toBeTruthy();
    expect(mockLoadStaticHome).not.toHaveBeenCalled();
  });
});
