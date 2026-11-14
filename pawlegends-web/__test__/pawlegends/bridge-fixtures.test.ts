/**
 * The host side of the tt-pawlegends v1 bridge against the shared fixture (`shared/pawlegends-bridge.fixtures.json`),
 * the same file the game's parser tests read. Host-to-game samples go through `sanitizeHostMessage` (the function
 * every host post is built with), game-to-host samples through `parsePawlegendsMessage`.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  artUrlOf,
  hostMessage,
  parsePawlegendsMessage,
  sanitizeHostMessage,
} from "@/components/pawlegends/bridge";

type Sample = Record<string, unknown>;
interface Case {
  valid: Sample;
  invalid: Sample;
  sanitize?: { input: Sample; expected: Sample }[];
}
const fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "shared", "pawlegends-bridge.fixtures.json"), "utf8")
) as { hostToGame: Record<string, Case>; gameToHost: Record<string, Case> };

const strip = (sample: Sample) => {
  const rest = { ...sample };
  delete rest.ns;
  delete rest.v;
  return rest;
};

describe("pawlegends bridge fixture: host to game", () => {
  it("covers every host message type", () => {
    expect(Object.keys(fixture.hostToGame).sort()).toEqual(
      [
        "api-result",
        "app",
        "audio",
        "champions",
        "entitlements",
        "featured",
        "hello",
        "offer",
        "party-ticket",
        "pause",
        "purchase-result",
        "resume",
        "roster",
        "save-result",
        "session",
        "store",
      ].sort()
    );
  });

  for (const [type, sample] of Object.entries(fixture.hostToGame)) {
    it(`${type}: the valid sample is kept as is, the invalid one is refused`, () => {
      expect(sanitizeHostMessage(sample.valid)).toEqual(sample.valid);
      expect(sanitizeHostMessage(sample.invalid)).toBeNull();
      for (const { input, expected } of sample.sanitize ?? []) expect(sanitizeHostMessage(input)).toEqual(expected);
    });

    it(`${type}: hostMessage rebuilds the valid sample from its payload`, () => {
      const payload = strip(sample.valid);
      const { type: t, ...fields } = payload as { type: string };
      expect(hostMessage(t as never, fields as never)).toEqual(sample.valid);
    });
  }
});

describe("pawlegends bridge fixture: game to host", () => {
  it("covers every game message type", () => {
    expect(Object.keys(fixture.gameToHost).sort()).toEqual(
      ["account", "analytics", "api-request", "champ-unlock", "champion-offer", "client-error", "exit", "match-result", "notify", "offer-seen", "open-cat", "party-result", "party-ticket-request", "pass-claim", "paused", "purchase-intent", "ready", "reload-request", "request-sign-in", "share", "skin-preview", "sound"].sort()
    );
  });

  for (const [type, sample] of Object.entries(fixture.gameToHost)) {
    it(`${type}: the valid sample parses, the invalid one is ignored`, () => {
      const parsed = parsePawlegendsMessage(sample.valid);
      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe(type);
      expect(parsePawlegendsMessage(sample.invalid)).toBeNull();
    });
  }

  it("purchase-intent for a store or pass SKU is a store intent (STORE-PASS.md); a retired pl_* SKU stays legacy", () => {
    const base = { ns: "tt-pawlegends", v: 1, type: "purchase-intent" };
    expect(parsePawlegendsMessage({ ...base, sku: "pl_coat_clem_calico" })).toEqual({ type: "store-intent", sku: "pl_coat_clem_calico" });
    expect(parsePawlegendsMessage({ ...base, sku: "pl_founder" })).toEqual({ type: "purchase-intent", sku: "pl_founder" });
    expect(parsePawlegendsMessage({ ns: "tt-pawlegends", v: 1, type: "pass-claim", all: true })).toEqual({ type: "pass-claim", row: null, tier: null });
  });

  it("match-result keeps the game's matchId and drops a malformed one", () => {
    const valid = fixture.gameToHost["match-result"].valid;
    expect(parsePawlegendsMessage(valid)).toMatchObject({ matchId: "k9x2m4" });
    expect(parsePawlegendsMessage({ ...valid, matchId: "Not-An-Id" })).toMatchObject({ matchId: null });
  });
});

describe("cat art allowlist", () => {
  it("accepts the Token Tails CDN only (both address styles), https, no credentials or port", () => {
    expect(artUrlOf("https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/a.png")).toBe(
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/a.png"
    );
    expect(artUrlOf("https://fra1.cdn.digitaloceanspaces.com/tokentails-nfts/a.png")).not.toBeNull();
    expect(artUrlOf("https://fra1.cdn.digitaloceanspaces.com/other-bucket/a.png")).toBeNull();
    expect(artUrlOf("http://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png")).toBeNull();
    expect(artUrlOf("https://user:pw@tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png")).toBeNull();
    expect(artUrlOf("https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com:8443/a.png")).toBeNull();
    expect(artUrlOf("https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com.evil.example/a.png")).toBeNull();
    expect(artUrlOf("javascript:alert(1)")).toBeNull();
    expect(artUrlOf('https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png" onerror="x')).toBeNull();
  });
});
