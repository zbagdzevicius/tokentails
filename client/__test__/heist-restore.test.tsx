/**
 * @jest-environment jsdom
 *
 * Capacitor restore of /heist (plan G2 layer 1). App builds have no server redirects: Capacitor
 * answers a full load of `/heist` (the picker's `window.location.assign`) with index.html, and
 * AppRouteRestore routes to the exported `heist.html` page. The device test is deferred to the
 * native release train (docs/plans/alignment-log/4b.md).
 */
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppRouteRestore } from "@/components/AppRouteRestore";

const replace = jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true));
const routerState = { pathname: "/", isReady: true, replace };

jest.mock("next/router", () => ({ useRouter: () => routerState }));
jest.mock("@/models/app", () => ({ isApp: true }));

beforeEach(() => {
  replace.mockClear();
  sessionStorage.clear();
});
afterEach(() => window.history.replaceState(null, "", "/"));

it("restores a cold load of /heist from the picker, query included", () => {
  window.history.replaceState(null, "", "/heist?from=picker");
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledWith("/heist?from=picker");
});

it("restores /heist?ref=X so the referral is captured on the host page", () => {
  window.history.replaceState(null, "", "/heist?ref=64e2e0000000000000000f01");
  render(<AppRouteRestore />);
  expect(replace).toHaveBeenCalledWith("/heist?ref=64e2e0000000000000000f01");
});

it("the old static path forwards to /heist, keeping the query, so it lands on the same restore", () => {
  const stub = readFileSync(join(__dirname, "..", "public", "heist", "index.html"), "utf8");
  expect(stub).toMatch(/location\.replace\("\/heist" \+ location\.search \+ location\.hash\)/);
  expect(stub).toContain('content="0; url=/heist"');
});
