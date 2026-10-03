/**
 * Typed response bodies for the mocked backend. They are built from the generated shared contracts
 * (client/shared-contracts, plan F2), so a contract change that breaks a fixture fails `tsc`
 * instead of silently drifting from the API.
 */
import { CatAbilityType, Tier } from "@/shared-contracts/enums";
import { ErrorCode } from "@/shared-contracts/errors";
import {
  STOREFRONT_META_VERSION,
  STOREFRONT_REQUIRED_KEYS,
  type StorefrontResponse,
} from "@/shared-contracts/storefront";
import { FIXED_NOW } from "./determinism";

/** The fields of a storefront cat the game and landing read. */
export interface FixtureCat {
  _id: string;
  name: string;
  type: CatAbilityType;
  tier: Tier;
  isBlueprint: boolean;
  spriteImg: string;
  catImg: string;
  resqueStory: string;
  shelter?: { _id: string; name: string; slug: string; country?: string };
}

const CDN = "https://tokentails.fra1.cdn.digitaloceanspaces.com";

export function fixtureCat(overrides: Partial<FixtureCat> = {}): FixtureCat {
  return {
    _id: "64b000000000000000000001",
    name: "Scout",
    type: CatAbilityType.FIRE,
    tier: Tier.COMMON,
    isBlueprint: true,
    spriteImg: `${CDN}/cats/scout/sprite.png`,
    catImg: `${CDN}/cats/scout/cat.png`,
    resqueStory: "Found under a market stall and now a shelter favourite.",
    ...overrides,
  };
}

/**
 * A `GET /cat/sale` body in the current (G13) shape: every required key present, plus `_meta`.
 * Pass `cats` to fill specific keys; omitted required keys are empty arrays.
 */
export function storefrontFixture(
  cats: Partial<Record<string, FixtureCat[]>> = {},
): StorefrontResponse<FixtureCat> {
  const body = {} as StorefrontResponse<FixtureCat>;
  STOREFRONT_REQUIRED_KEYS.forEach((key) => {
    body[key] = [];
  });
  Object.entries(cats).forEach(([key, value]) => {
    body[key] = value ?? [];
  });
  body._meta = {
    _v: STOREFRONT_META_VERSION,
    generatedAt: FIXED_NOW.toISOString(),
    shelters: [
      { slug: "rozine-pedute", name: "Rozine pedute", role: "partner" },
      { slug: "token-tails", name: "Token Tails", role: "house" },
      { slug: "token-tails-2", name: "Token Tails", role: "house" },
    ],
  };
  return body;
}

/** Error body in the F5.6 shape: `{ statusCode, code, message }`. */
export function errorBody(statusCode: number, code: ErrorCode, message = code) {
  return { statusCode, code, message };
}

/** Body of an unmocked route, so a missing mock is obvious in traces. */
export const NOT_MOCKED = { statusCode: 404, message: "Not mocked in e2e" };
