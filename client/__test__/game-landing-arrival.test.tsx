/**
 * @jest-environment jsdom
 *
 * `landing_cta {from}` is sent from /game, not from the landing click (Task 6b review #1): the
 * landing CTAs link to `/game?from=landing_<cta>`, and /game tracks it once the router is ready,
 * then drops `from` from the address bar and keeps every other param.
 */
import React from "react";
import { render } from "@testing-library/react";

const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({
  analytics: { track: (event: unknown) => mockTrack(event) },
  buildEvent: (name: string, properties: unknown) => ({ name, properties }),
}));
const mockReplace = jest.fn(() => Promise.resolve(true));
const mockRouter: { isReady: boolean; pathname: string; query: Record<string, string>; replace: typeof mockReplace } = {
  isReady: true,
  pathname: "/game",
  query: {},
  replace: mockReplace,
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/components/game/Game", () => ({ Game: () => null }));
jest.mock("@/context/FirebaseAuthContext", () => ({
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/context/GameContext", () => ({
  GameProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: () => null }));

import { LandingArrival } from "@/pages/game";

function visit(search: string, ready = true) {
  window.history.replaceState(null, "", `/game${search}`);
  mockRouter.isReady = ready;
  mockRouter.query = Object.fromEntries(new URLSearchParams(search));
  return render(<LandingArrival />);
}

beforeEach(() => {
  mockTrack.mockClear();
  mockReplace.mockClear();
});

it("tracks the landing CTA once and drops only `from` from the URL", () => {
  const { rerender } = visit("?ref=64e2e0000000000000000bbb&from=landing_hero");
  rerender(<LandingArrival />);
  expect(mockTrack.mock.calls).toEqual([[{ name: "landing_cta", properties: { from: "hero" } }]]);
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith(
    { pathname: "/game", query: { ref: "64e2e0000000000000000bbb" } },
    undefined,
    { shallow: true, scroll: false }
  );
});

it("waits for the router before reading the URL", () => {
  visit("?from=landing_crew", false);
  expect(mockTrack).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it("sends nothing for a direct visit, and only cleans an unknown `from`", () => {
  visit("");
  expect(mockTrack).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  visit("?from=somewhere");
  expect(mockTrack).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
