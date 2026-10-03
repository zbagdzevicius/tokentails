/**
 * @jest-environment jsdom
 *
 * The storefront surfaces (plan G13 step 5): the Shelter spawns its zones from the shared hook,
 * shows "All adopted, thank you!" for empty zones (decision #87) and a degraded toast with RETRY on
 * a failed load; the marketplace picks cats by shelter role. None of them crash on any response.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ICat } from "@/models/cats";

jest.mock("@/analytics", () => ({ analytics: { track: jest.fn() }, reportAppError: jest.fn() }));
const mockStorefront = jest.fn();
jest.mock("@/api/cat-api", () => ({
  CAT_API: { storefront: () => mockStorefront() },
}));
jest.mock("@/components/shelter/config", () => ({
  StartGame: () => ({ destroy: jest.fn() }),
}));
let mockProfile: { _id?: string; cats?: unknown[] } | null = null;
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: mockProfile }) }));
jest.mock("@/context/CatContext", () => ({ useCat: () => ({ cat: null }) }));
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ setOpenedModal: jest.fn() }) }));
jest.mock("@/components/tailsCard/TailsCardModal", () => ({ TailsCardModal: () => null }));
jest.mock("@/components/tailsCard/TailsCard", () => ({ TailsCard: () => <div data-testid="tails-card" /> }));
jest.mock("@/components/shared/ShelterBenefits", () => ({
  ShelterBenefits: () => <div data-testid="shelter-benefits" />,
}));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, onClick, disabled }: { text: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {text}
    </button>
  ),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GameEvents, NPC_TYPE } = require("@/components/Phaser/events");
const {
  default: Shelter,
  shelterZones,
  PARTNER_NPC_LIMIT,
  EMPTY_SIGN_MS,
  EMPTY_SIGN_SESSION_KEY,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("@/components/shelter/Shelter");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MarketplaceItems } = require("@/components/marketplace/MarketplaceItems");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MarketplaceItemDetails } = require("@/components/marketplace/MarketplaceItemDetails");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseStorefrontDetailed, emptyStorefront } = require("@/shared-contracts/storefront");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { storefrontRoles, STOREFRONT_QUERY_KEY, resetStorefrontReporting } = require("@/hooks/useStorefront");

const cat = (id: string, name = `Cat ${id}`, slug = "rozine-pedute") =>
  ({ _id: id, name, type: "FIRE", catImg: `/cats/${id}.png`, shelter: { slug, name: slug } }) as unknown as ICat;

const ok = (body: unknown) => ({ ...parseStorefrontDetailed(body), failure: null, status: 200 });
const failed = (failure: string) => ({
  ...parseStorefrontDetailed({}),
  degraded: true,
  failure,
  status: failure === "http" ? 500 : undefined,
});

const renderWithQuery = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const spawned: { npc: ICat; type: string }[] = [];
let batches = 0;
let singles = 0;
const onBatch = (event: Event) => {
  batches += 1;
  spawned.push(...(event as CustomEvent).detail.npcs);
};
const onSingle = () => {
  singles += 1;
};

beforeEach(() => {
  window.sessionStorage.clear();
  spawned.length = 0;
  batches = 0;
  singles = 0;
  mockStorefront.mockReset();
  mockProfile = null;
  resetStorefrontReporting();
  window.addEventListener("NPC_SPAWN_BATCH", onBatch);
  window.addEventListener("NPC_SPAWN", onSingle);
});
afterEach(() => {
  window.removeEventListener("NPC_SPAWN_BATCH", onBatch);
  window.removeEventListener("NPC_SPAWN", onSingle);
});

const loadScene = () =>
  act(() => {
    GameEvents.GAME_LOADED.push({ scene: {} });
  });

describe("shelterZones", () => {
  it("samples at most the partner limit and keeps the house floors by slug", () => {
    const partner = Array.from({ length: 30 }, (_, i) => cat(`p${i}`));
    const cats = emptyStorefront();
    cats["token-tails"] = [cat("f1", "Famous", "token-tails")];
    const zones = shelterZones(
      { cats, partnerCats: partner, meta: null, roles: storefrontRoles(null) },
      1,
    );
    expect(zones.map((zone: { type: string }) => zone.type)).toEqual([
      NPC_TYPE.ROZINE_PEDUTE,
      NPC_TYPE.TOKENTAILS,
      NPC_TYPE.TOKENTAILS_2,
    ]);
    expect(zones[0].cats).toHaveLength(PARTNER_NPC_LIMIT);
    expect(zones[0].label).toBe("Pink Paw");
    expect(zones[1].cats).toHaveLength(1);
    expect(zones[2].cats).toEqual([]);
    // Same seed, same walkers.
    const again = shelterZones({ cats, partnerCats: partner, meta: null, roles: storefrontRoles(null) }, 1);
    expect(again[0].cats).toEqual(zones[0].cats);
    // The source list is untouched.
    expect(partner[0]._id).toBe("p0");
  });
});

describe("<Shelter />", () => {
  it("spawns every zone once the scene and the storefront are ready", async () => {
    mockStorefront.mockResolvedValue(
      ok({
        "rozine-pedute": [cat("p1", "Mia"), cat("p2", "Mia")],
        "token-tails": [cat("f1", "Famous", "token-tails")],
        "token-tails-2": [cat("e1", "Event", "token-tails-2")],
      }),
    );
    renderWithQuery(<Shelter />);
    loadScene();
    await waitFor(() => expect(spawned).toHaveLength(4));
    // One batch (one load pass in ShelterScene), never the legacy one-cat events.
    expect(batches).toBe(1);
    expect(singles).toBe(0);
    // Two cats with the same name are both spawned (distinct ids).
    expect(spawned.filter((entry) => entry.npc.name === "Mia")).toHaveLength(2);
    expect(screen.queryByTestId("shelter-empty-zones")).toBeNull();
    expect(screen.queryByTestId("storefront-degraded")).toBeNull();
  });

  it("shows an All adopted sign for every empty zone and does not crash on the legacy shape", async () => {
    // Legacy backend: the Pink Paw key is missing once every cat is adopted.
    mockStorefront.mockResolvedValue(ok({ "token-tails": [cat("f1", "Famous", "token-tails")] }));
    renderWithQuery(<Shelter />);
    loadScene();
    const signs = await screen.findByTestId("shelter-empty-zones");
    const zones = Array.from(signs.querySelectorAll("li")).map((li) => li.getAttribute("data-zone"));
    expect(zones).toEqual([NPC_TYPE.ROZINE_PEDUTE, NPC_TYPE.TOKENTAILS_2]);
    expect(signs.textContent).toContain("All adopted, thank you!");
    expect(signs.textContent).toContain("Pink Paw");
    expect(spawned).toHaveLength(1);
  });

  it("says Back soon, not thank you, when only the house zones are empty", async () => {
    mockStorefront.mockResolvedValue(ok({ "rozine-pedute": [cat("p1", "Mia")] }));
    renderWithQuery(<Shelter />);
    loadScene();
    const sign = await screen.findByTestId("shelter-empty-zones");
    expect(sign.textContent).toContain("Back soon");
    expect(sign.textContent).not.toContain("thank you");
    expect(sign.querySelector('[data-group="adopted"]')).toBeNull();
    const zones = Array.from(sign.querySelectorAll("li")).map((li) => li.getAttribute("data-zone"));
    expect(zones).toEqual([NPC_TYPE.TOKENTAILS, NPC_TYPE.TOKENTAILS_2]);
  });

  it("keeps the sign on the zones the scene spawned from after a refetch", async () => {
    mockStorefront.mockResolvedValue(ok({ "token-tails": [cat("f1", "Famous", "token-tails")] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Shelter />
      </QueryClientProvider>,
    );
    loadScene();
    await screen.findByTestId("shelter-empty-zones");
    expect(spawned).toHaveLength(1);
    // A later refetch fills the Pink Paw zone, but nothing new spawns, so the sign must not change.
    mockStorefront.mockResolvedValue(
      ok({
        "rozine-pedute": [cat("p1", "Mia")],
        "token-tails": [cat("f1", "Famous", "token-tails")],
        "token-tails-2": [cat("e1", "Event", "token-tails-2")],
      }),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: STOREFRONT_QUERY_KEY });
    });
    expect(mockStorefront).toHaveBeenCalledTimes(2);
    const zones = Array.from(
      screen.getByTestId("shelter-empty-zones").querySelectorAll("li"),
    ).map((li) => li.getAttribute("data-zone"));
    expect(zones).toEqual([NPC_TYPE.ROZINE_PEDUTE, NPC_TYPE.TOKENTAILS_2]);
    expect(spawned).toHaveLength(1);
  });

  it("closes the sign on demand and fades it on its own", async () => {
    mockStorefront.mockResolvedValue(ok({}));
    const { unmount } = renderWithQuery(<Shelter />);
    loadScene();
    await screen.findByTestId("shelter-empty-zones");
    fireEvent.click(screen.getByRole("button", { name: "Close notice" }));
    expect(screen.queryByTestId("shelter-empty-zones")).toBeNull();
    unmount();
    // A new session (the same empty zones would otherwise stay announced).
    window.sessionStorage.clear();

    jest.useFakeTimers();
    try {
      renderWithQuery(<Shelter />);
      loadScene();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId("shelter-empty-zones").getAttribute("data-state")).toBe("shown");
      await act(async () => {
        await jest.advanceTimersByTimeAsync(EMPTY_SIGN_MS);
      });
      expect(screen.getByTestId("shelter-empty-zones").getAttribute("data-state")).toBe("fading");
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
      expect(screen.queryByTestId("shelter-empty-zones")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("announces the same empty zones once per session and again when they change", async () => {
    mockStorefront.mockResolvedValue(ok({ "rozine-pedute": [cat("p1", "Mia")] }));
    const first = renderWithQuery(<Shelter />);
    loadScene();
    await screen.findByTestId("shelter-empty-zones");
    expect(window.sessionStorage.getItem(EMPTY_SIGN_SESSION_KEY)).toBe(
      [NPC_TYPE.TOKENTAILS, NPC_TYPE.TOKENTAILS_2].sort().join(","),
    );
    first.unmount();

    // Second visit, same empty zones: the cats spawn, the notice is not repeated.
    spawned.length = 0;
    const second = renderWithQuery(<Shelter />);
    loadScene();
    await waitFor(() => expect(spawned).toHaveLength(1));
    expect(screen.queryByTestId("shelter-empty-zones")).toBeNull();
    second.unmount();

    // Third visit, a different set (Pink Paw is now empty too): the sign shows again.
    spawned.length = 0;
    mockStorefront.mockResolvedValue(ok({}));
    renderWithQuery(<Shelter />);
    loadScene();
    const sign = await screen.findByTestId("shelter-empty-zones");
    expect(sign.textContent).toContain("All adopted, thank you!");
  });

  it("shows the sign every visit when sessionStorage is blocked", async () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      mockStorefront.mockResolvedValue(ok({}));
      const first = renderWithQuery(<Shelter />);
      loadScene();
      await screen.findByTestId("shelter-empty-zones");
      first.unmount();
      renderWithQuery(<Shelter />);
      loadScene();
      await screen.findByTestId("shelter-empty-zones");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("shows the degraded toast with RETRY on a failed load and spawns after a good retry", async () => {
    mockStorefront.mockResolvedValueOnce(failed("http"));
    renderWithQuery(<Shelter />);
    loadScene();
    const toast = await screen.findByTestId("storefront-degraded");
    expect(toast.getAttribute("role")).toBe("alert");
    expect(spawned).toHaveLength(0);
    expect(screen.queryByTestId("shelter-empty-zones")).toBeNull();

    mockStorefront.mockResolvedValueOnce(ok({ "rozine-pedute": [cat("p1")] }));
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await waitFor(() => expect(screen.queryByTestId("storefront-degraded")).toBeNull());
    await waitFor(() => expect(spawned).toHaveLength(1));
    expect(mockStorefront).toHaveBeenCalledTimes(2);
  });

  it("opens a card for an NPC with an unknown type without mutating the cached cat", async () => {
    const odd = { ...cat("p1"), type: "NOT_A_TYPE" } as unknown as ICat;
    mockStorefront.mockResolvedValue(ok({ "rozine-pedute": [odd] }));
    renderWithQuery(<Shelter />);
    loadScene();
    await waitFor(() => expect(spawned).toHaveLength(1));
    const cached = spawned[0].npc;
    act(() => {
      GameEvents.CAT_CARD_DISPLAY.push({ npc: cached });
    });
    expect(cached.type).toBe("NOT_A_TYPE");
  });

  it("sends no batch when every zone is empty", async () => {
    mockStorefront.mockResolvedValue(ok({}));
    renderWithQuery(<Shelter />);
    loadScene();
    const signs = await screen.findByTestId("shelter-empty-zones");
    expect(signs.querySelectorAll("li")).toHaveLength(3);
    expect(batches).toBe(0);
  });

  it("waits for the scene before spawning", async () => {
    mockStorefront.mockResolvedValue(ok({ "rozine-pedute": [cat("p1")] }));
    renderWithQuery(<Shelter />);
    await waitFor(() => expect(mockStorefront).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(spawned).toHaveLength(0);
    loadScene();
    await waitFor(() => expect(spawned).toHaveLength(1));
  });
});

describe("<MarketplaceItems />", () => {
  const setType = jest.fn();

  it("lists partner cats as shelter cats and house cats as famous, by _meta roles", async () => {
    mockStorefront.mockResolvedValue(
      ok({
        "pink-paw-2": [cat("p9", "Luna", "pink-paw-2")],
        "rozine-pedute": [cat("p1", "Mia")],
        "token-tails": [cat("f1", "Famous", "token-tails")],
        _meta: {
          _v: 1,
          generatedAt: "2026-09-30T12:00:00.000Z",
          shelters: [
            { slug: "pink-paw-2", name: "Pink Paw 2", role: "partner" },
            { slug: "rozine-pedute", name: "Pink Paw", role: "partner" },
          ],
        },
      }),
    );
    const { rerender } = renderWithQuery(<MarketplaceItems type="shelter" setType={setType} />);
    await screen.findByAltText("Luna");
    expect(screen.getByAltText("Mia")).toBeTruthy();
    expect(screen.queryByAltText("Famous")).toBeNull();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MarketplaceItems type="famous" setType={setType} />
      </QueryClientProvider>,
    );
    await screen.findByAltText("Famous");
  });

  it("keeps FAMOUS to token-tails and Pink Paw as a partner once the backfill marks house zones", async () => {
    // backfill-shelter-fields.js marks token-tails, token-tails-2 and home as `house`, and may run
    // before rozine-pedute has a role of its own.
    mockStorefront.mockResolvedValue(
      ok({
        "rozine-pedute": [cat("p1", "Mia")],
        "token-tails": [cat("f1", "Famous", "token-tails")],
        "token-tails-2": [cat("e1", "Event", "token-tails-2")],
        home: [cat("h1", "Homecat", "home")],
        _meta: {
          _v: 1,
          generatedAt: "2026-09-30T12:00:00.000Z",
          shelters: [
            { slug: "token-tails", name: "Token Tails", role: "house" },
            { slug: "token-tails-2", name: "Events", role: "house" },
            { slug: "home", name: "Home", role: "house" },
            { slug: "pink-paw-2", name: "Pink Paw 2", role: "partner" },
          ],
        },
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MarketplaceItems type="shelter" setType={setType} />
      </QueryClientProvider>,
    );
    await screen.findByAltText("Mia");
    rerender(
      <QueryClientProvider client={client}>
        <MarketplaceItems type="famous" setType={setType} />
      </QueryClientProvider>,
    );
    await screen.findByAltText("Famous");
    expect(screen.queryByAltText("Event")).toBeNull();
    expect(screen.queryByAltText("Homecat")).toBeNull();
    expect(screen.queryByAltText("Mia")).toBeNull();
  });

  it("refetches the shared storefront when the profile gains a cat, not on sign-in", async () => {
    mockStorefront.mockResolvedValue(ok({ "rozine-pedute": [cat("p1", "Mia")] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (
      <QueryClientProvider client={client}>
        <MarketplaceItems type="shelter" setType={setType} />
      </QueryClientProvider>
    );
    const { rerender } = render(view);
    await screen.findByAltText("Mia");
    expect(mockStorefront).toHaveBeenCalledTimes(1);
    mockProfile = { _id: "u1", cats: [] };
    rerender(
      <QueryClientProvider client={client}>
        <MarketplaceItems type="shelter" setType={setType} />
      </QueryClientProvider>,
    );
    await act(async () => undefined);
    expect(mockStorefront).toHaveBeenCalledTimes(1);
    mockProfile = { _id: "u1", cats: [{}] };
    rerender(
      <QueryClientProvider client={client}>
        <MarketplaceItems type="shelter" setType={setType} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mockStorefront).toHaveBeenCalledTimes(2));
  });

  it("shows a loading notice, not an empty grid, until the storefront arrives", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockStorefront.mockReturnValue(new Promise((done) => (resolve = done)));
    renderWithQuery(<MarketplaceItems type="shelter" setType={setType} />);
    expect(screen.getByTestId("storefront-loading").textContent).toContain("Loading cats");
    expect(screen.queryByTestId("storefront-empty")).toBeNull();
    await act(async () => {
      resolve(ok({ "rozine-pedute": [cat("p1", "Mia")] }));
    });
    await screen.findByAltText("Mia");
    expect(screen.queryByTestId("storefront-loading")).toBeNull();
  });

  it("shows an adopted notice when the partner list is empty", async () => {
    mockStorefront.mockResolvedValue(ok({}));
    renderWithQuery(<MarketplaceItems type="shelter" setType={setType} />);
    expect((await screen.findByTestId("storefront-empty")).textContent).toContain("All adopted");
  });

  it("offers RETRY after a failure", async () => {
    mockStorefront.mockResolvedValueOnce(failed("malformed_json"));
    renderWithQuery(<MarketplaceItems type="shelter" setType={setType} />);
    await screen.findByTestId("storefront-degraded");
    mockStorefront.mockResolvedValueOnce(ok({ "rozine-pedute": [cat("p1", "Mia")] }));
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await screen.findByAltText("Mia");
  });
});

describe("<MarketplaceItemDetails />", () => {
  it("shows shelter benefits for a partner cat and hides the shelter link for a house cat", async () => {
    mockStorefront.mockResolvedValue(ok({}));
    const { unmount } = renderWithQuery(<MarketplaceItemDetails cat={cat("p1", "Mia")} />);
    expect(screen.getByTestId("shelter-benefits")).toBeTruthy();
    expect(screen.getByText("SEE ALL SHELTER CATS")).toBeTruthy();
    unmount();
    renderWithQuery(<MarketplaceItemDetails cat={cat("f1", "Famous", "token-tails")} />);
    expect(screen.queryByTestId("shelter-benefits")).toBeNull();
    expect(screen.queryByText("SEE ALL SHELTER CATS")).toBeNull();
    await waitFor(() => expect(mockStorefront).toHaveBeenCalled());
  });

  it("treats event and home cats as shelter-linked house cats, not famous, once roles arrive", async () => {
    mockStorefront.mockResolvedValue(
      ok({
        _meta: {
          _v: 1,
          generatedAt: "",
          shelters: [
            { slug: "token-tails", name: "Token Tails", role: "house" },
            { slug: "token-tails-2", name: "Events", role: "house" },
          ],
        },
      }),
    );
    renderWithQuery(<MarketplaceItemDetails cat={cat("e1", "Event", "token-tails-2")} />);
    await waitFor(() => expect(mockStorefront).toHaveBeenCalled());
    expect(screen.getByText("SEE ALL SHELTER CATS")).toBeTruthy();
    expect(screen.queryByTestId("shelter-benefits")).toBeNull();
  });
});
