/**
 * Sim v9 shelter champions, host side: `championsOf` turns `GET /pawlegends/champions` into the game's `champions`
 * message. A card counts as for sale only when the server says so, the client mirror agrees and the player holds no
 * copy, and never in an app build; art only from the Token Tails CDN.
 */
import { championsOf } from "@/components/pawlegends/championsBridge";
import { createPawlegendsBridge, hostMessage } from "@/components/pawlegends/bridge";
import type { ICat } from "@/models/cats";

const LAMBO = "6a30473c1d6649b19b03622b";
const GABE = "6992227d890a12f52a317e22";
const ART = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MAINE/festive-lights-tangled.png";

const cat = (id: string, over: Record<string, unknown> = {}): ICat =>
  ({ _id: id, name: "Lambo", type: "STELLAR", catImg: ART, blessing: { _id: "b" + id.slice(1), status: "WAITING" }, ...over }) as unknown as ICat;

describe("championsOf", () => {
  it("keeps cards with art, for sale only when the server, the mirror and ownership agree", () => {
    const body = {
      cats: [
        { hero: "lambo", catalogId: LAMBO, forSale: true, cat: cat(LAMBO) },
        { hero: "gabe", catalogId: GABE, forSale: true, cat: cat(GABE, { blessing: { _id: "x", status: "ADOPTED" }, catImg: "https://evil.example/a.png" }) },
        { hero: "bad", catalogId: "nope", forSale: true },
        { hero: "lambo", catalogId: LAMBO, forSale: true, cat: cat(LAMBO) },
      ],
    };
    const pick = championsOf(body, [], false);
    expect(pick.cards).toEqual([
      { catalogId: LAMBO, forSale: true, catImg: ART },
      { catalogId: GABE, forSale: false },
    ]);
    expect(Array.from(pick.byId.keys())).toEqual([LAMBO]);
  });

  it("never for sale to an owner of a copy or in an app build", () => {
    const body = { cats: [{ hero: "lambo", catalogId: LAMBO, forSale: true, cat: cat(LAMBO) }] };
    const mine = [{ _id: "c1", sourceCat: LAMBO } as unknown as ICat];
    expect(championsOf(body, mine, false).cards[0].forSale).toBe(false);
    expect(championsOf(body, [], true).cards[0]).toEqual({ catalogId: LAMBO, forSale: false, catImg: ART });
    expect(championsOf(body, [], true).byId.size).toBe(0);
    expect(championsOf(null, [], false).cards).toEqual([]);
    expect(championsOf({ cats: "x" }, [], false).cards).toEqual([]);
  });
});

describe("bridge: champions and champion-offer", () => {
  const ORIGIN = "https://tokentails.com";
  function setup(handlers: Record<string, jest.Mock> = {}) {
    let listener: ((e: MessageEvent) => void) | null = null;
    const posted: unknown[] = [];
    const target = { postMessage: (m: unknown) => posted.push(m) };
    const win = { addEventListener: (_: string, l: (e: MessageEvent) => void) => (listener = l), removeEventListener: () => undefined };
    const timers = { setTimeout: () => 0, clearTimeout: () => undefined, now: () => 0 };
    const bridge = createPawlegendsBridge({ win, target: () => target, origin: ORIGIN, handlers, timers });
    const send = (data: Record<string, unknown>) =>
      listener!({ source: target, origin: ORIGIN, data: { ns: "tt-pawlegends", v: 1, ...data } } as unknown as MessageEvent);
    send({ type: "ready", version: "t" });
    return { bridge, posted, send };
  }

  it("sends the cards, accepts an offer and open-cat for a card for sale, and passes champion-offer on", () => {
    const onChampionOffer = jest.fn();
    const onOpenCat = jest.fn();
    const { bridge, posted, send } = setup({ onChampionOffer, onOpenCat });
    bridge.setChampions([
      { catalogId: LAMBO, forSale: true, catImg: ART },
      { catalogId: GABE, forSale: false },
    ]);
    expect(posted).toContainEqual(hostMessage("champions", { cats: [{ catalogId: LAMBO, forSale: true, catImg: ART }, { catalogId: GABE, forSale: false }] }));
    expect(bridge.setOffer({ kind: "meet", catalogId: LAMBO })).toBe(true);
    expect(bridge.setOffer({ kind: "meet", catalogId: GABE })).toBe(false);
    send({ type: "open-cat", catalogId: LAMBO });
    send({ type: "open-cat", catalogId: GABE });
    expect(onOpenCat.mock.calls).toEqual([[LAMBO]]);
    send({ type: "champion-offer", catalogId: LAMBO });
    send({ type: "champion-offer", catalogId: GABE });
    expect(onChampionOffer.mock.calls).toEqual([[LAMBO]]);
  });

  it("card skins: skin-preview reaches the host only for a featured cat, never in an app build", () => {
    const onSkinPreview = jest.fn();
    const FEAT = "65a1b2c3d4e5f6a7b8c9d0e1";
    const { bridge, send } = setup({ onSkinPreview });
    bridge.setFeatured([{ catalogId: FEAT, name: "Pumpkin", type: "GRASS" }]);
    send({ type: "skin-preview", catalogId: FEAT });
    send({ type: "skin-preview", catalogId: LAMBO });
    send({ type: "skin-preview", catalogId: "Pumpkin" });
    expect(onSkinPreview.mock.calls).toEqual([[FEAT]]);
    bridge.setApp(true, false, false);
    send({ type: "skin-preview", catalogId: FEAT });
    expect(onSkinPreview).toHaveBeenCalledTimes(1);
  });

  it("an app build hears no card for sale and drops champion-offer", () => {
    const onChampionOffer = jest.fn();
    const { bridge, posted, send } = setup({ onChampionOffer });
    bridge.setApp(true, false, false);
    bridge.setChampions([{ catalogId: LAMBO, forSale: true, catImg: ART }]);
    expect(posted).toContainEqual(hostMessage("champions", { cats: [{ catalogId: LAMBO, forSale: false, catImg: ART }] }));
    send({ type: "champion-offer", catalogId: LAMBO });
    expect(onChampionOffer).not.toHaveBeenCalled();
    expect(bridge.setOffer({ kind: "meet", catalogId: LAMBO })).toBe(false);
  });
});
