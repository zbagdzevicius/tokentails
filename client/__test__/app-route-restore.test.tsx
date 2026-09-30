/**
 * @jest-environment jsdom
 *
 * Capacitor serves index.html for any extensionless path, so the app export
 * boots on "/" and AppRouteRestore routes to the page the URL names.
 */
import { render } from "@testing-library/react";
import { AppRouteRestore } from "@/components/AppRouteRestore";

const replace = jest.fn((_url: string) => Promise.resolve(true));
const routerState = { pathname: "/", isReady: true, replace };
let mockIsApp = true;

jest.mock("next/router", () => ({
  useRouter: () => routerState,
}));

jest.mock("@/models/app", () => ({
  get isApp() {
    return mockIsApp;
  },
}));

beforeEach(() => {
  replace.mockClear();
  sessionStorage.clear();
  routerState.pathname = "/";
  mockIsApp = true;
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

it("routes a cold load of a deep link to its page in app builds", () => {
  window.history.replaceState(null, "", "/cats/view?id=abc#top");
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledWith("/cats/view?id=abc#top");
});

it("does nothing on the homepage itself", () => {
  render(<AppRouteRestore />);
  expect(replace).not.toHaveBeenCalled();
});

it("does nothing once another page is rendered", () => {
  window.history.replaceState(null, "", "/game");
  routerState.pathname = "/game";
  render(<AppRouteRestore />);
  expect(replace).not.toHaveBeenCalled();
});

it("does nothing on the web", () => {
  window.history.replaceState(null, "", "/game");
  mockIsApp = false;
  render(<AppRouteRestore />);
  expect(replace).not.toHaveBeenCalled();
});

it("rewrites old-form dynamic paths to the exported query-param routes", () => {
  window.history.replaceState(null, "", "/cats/abc");
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledWith("/cats/view?id=abc");

  replace.mockClear();
  window.history.replaceState(null, "", "/feed/announcements/hello-world#intro");
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledWith(
    "/feed/article?category=announcements&slug=hello-world#intro"
  );
});

it("tries each path once, so an unservable path cannot reload forever", () => {
  // The restore navigated hard and the page reloaded before it resolved.
  replace.mockImplementationOnce(() => new Promise<boolean>(() => {}));
  window.history.replaceState(null, "", "/stats");
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledTimes(1);

  // index.html boots again on the same URL: stay on "/".
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledTimes(1);

  // The guard is spent, so a later cold load of that path restores again.
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledTimes(2);
});
