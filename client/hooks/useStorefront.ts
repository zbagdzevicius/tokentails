import { analytics } from "@/analytics";
import { CAT_API, StorefrontResult } from "@/api/cat-api";
import { ICat } from "@/models/cats";
import type { ShelterRole } from "@/shared-contracts/enums";
import {
  emptyStorefront,
  Storefront,
  StorefrontMeta,
} from "@/shared-contracts/storefront";
import { useProfile } from "@/context/ProfileContext";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

/**
 * The one storefront (`GET /cat/sale`) query in the client (plan G13). Every consumer shares this
 * key, so the Shelter, the marketplace and the cat pages read one cached response.
 */
export const STOREFRONT_QUERY_KEY = ["storefront"] as const;

/** Matches the backend's 45 s single-flight cache: fetching sooner only returns the same body. */
export const STOREFRONT_STALE_MS = 45_000;

export interface StorefrontRoles {
  /** Slugs of partner shelters: real shelters whose cats are adopted through Token Tails. */
  partner: string[];
  /** Slugs of house shelters: Token Tails' own zones (famous, event and home cats). */
  house: string[];
}

/**
 * The famous cats' shelter. The marketplace FAMOUS tab and the "famous" cat page read this one
 * slug, not every house shelter: the `role` backfill marks `token-tails-2` (event cats) and `home`
 * as `house` too, and those are not famous cats.
 */
export const FAMOUS_SLUG = "token-tails";

/**
 * The slugs the client used before `_meta` carried roles. A fallback slug keeps its role unless
 * `_meta` gives that shelter a role of its own (the `role` backfill has not run everywhere, and it
 * may run shelter by shelter).
 */
export const FALLBACK_STOREFRONT_ROLES: Readonly<StorefrontRoles> = Object.freeze({
  partner: ["rozine-pedute"],
  house: [FAMOUS_SLUG],
});

export function storefrontRoles(
  meta: StorefrontMeta | null | undefined
): StorefrontRoles {
  const shelters = meta?.shelters || [];
  const hasOwnRole = new Set(
    shelters.filter((shelter) => !!shelter.role).map((shelter) => shelter.slug)
  );
  const forRole = (role: ShelterRole, fallback: readonly string[]) => {
    const slugs = shelters
      .filter((shelter) => shelter.role === role)
      .map((shelter) => shelter.slug);
    fallback.forEach((slug) => {
      if (!hasOwnRole.has(slug) && !slugs.includes(slug)) {
        slugs.push(slug);
      }
    });
    return slugs;
  };
  return {
    partner: forRole("partner", FALLBACK_STOREFRONT_ROLES.partner),
    house: forRole("house", FALLBACK_STOREFRONT_ROLES.house),
  };
}

/** Role of a shelter slug, or null when the slug is neither a partner nor a house shelter. */
export function shelterRoleOf(
  slug: string | null | undefined,
  roles: StorefrontRoles
): ShelterRole | null {
  if (!slug) {
    return null;
  }
  if (roles.partner.includes(slug)) {
    return "partner";
  }
  if (roles.house.includes(slug)) {
    return "house";
  }
  return null;
}

/** The cats listed under `slugs`, in slug order, without repeating a cat `_id`. */
export function catsForSlugs(
  cats: Storefront<ICat>,
  slugs: readonly string[]
): ICat[] {
  const seen = new Set<string>();
  const result: ICat[] = [];
  slugs.forEach((slug) => {
    const list = Object.prototype.hasOwnProperty.call(cats, slug)
      ? cats[slug]
      : [];
    list.forEach((cat) => {
      const id = cat?._id;
      if (id) {
        if (seen.has(id)) {
          return;
        }
        seen.add(id);
      }
      result.push(cat);
    });
  });
  return result;
}

/** Refetch the storefront now, for example after an adoption or a purchase. */
export function invalidateStorefront(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: STOREFRONT_QUERY_KEY });
}

// The signed-in user and how many cats they own, as last seen by any useStorefront consumer.
// `/cat/sale` is public (no `accesstoken`), so signing in or out does not change the response and
// does not refetch. An adoption or purchase that lands on the profile changes the same user's cat
// count; then the storefront is refetched once, however many consumers are mounted.
let lastProfileSignature: string | null = null;

/** `<user id>:<owned cat count>`, or "" without a signed-in user. Exposed for tests. */
export function profileSignature(
  profile: { _id?: string; cats?: unknown[] } | null | undefined
): string {
  return profile?._id ? `${profile._id}:${profile.cats?.length ?? 0}` : "";
}

/**
 * Records `signature` and says whether the storefront should be refetched: only when the same
 * user's cat count changed since the last signature.
 */
export function storefrontNeedsRefresh(signature: string): boolean {
  const previous = lastProfileSignature;
  lastProfileSignature = signature;
  if (!previous || !signature || previous === signature) {
    return false;
  }
  const userOf = (value: string) => value.slice(0, value.lastIndexOf(":"));
  return userOf(previous) === userOf(signature);
}

// A usable but partial response (the legacy shape drops keys for fully adopted shelters) is
// reported once per page session, so the `storefront_degraded` guardrail counts sessions on an old
// backend instead of every refetch. Failures are reported on every fetch.
let partialReported = false;

/** Test hook: forget that a partial response was already reported this session. */
export function resetStorefrontReporting() {
  partialReported = false;
  lastProfileSignature = null;
}

/**
 * Fetches the storefront and reports a degraded load once per fetch (not once per consumer). When
 * a refetch fails after a good load, the last good cats stay on screen instead of emptying zones.
 */
export async function loadStorefront(
  previous?: StorefrontResult
): Promise<StorefrontResult> {
  const result = await CAT_API.storefront();
  if (result.failure) {
    analytics.track({
      name: "storefront_degraded",
      properties: {
        reason: `${result.failure}${result.status ? `_${result.status}` : ""}`,
      },
    });
  } else if (result.degraded && !partialReported) {
    partialReported = true;
    analytics.track({
      name: "storefront_degraded",
      properties: { reason: "partial" },
    });
  }
  if (result.failure && previous && !previous.failure) {
    return previous;
  }
  return result;
}

export interface UseStorefront {
  /** Every required key is an array, also while loading and after a failure. */
  cats: Storefront<ICat>;
  meta: StorefrontMeta | null;
  roles: StorefrontRoles;
  /** Cats of every partner shelter (fallback: `rozine-pedute`). */
  partnerCats: ICat[];
  /** The famous cats (`FAMOUS_SLUG` only, not the event or home cats). */
  famousCats: ICat[];
  /** True until the first response (good or failed) arrives. */
  isLoading: boolean;
  /** True once a response arrived that the UI can trust, even if some keys were empty. */
  isReady: boolean;
  /** Why the last load was unusable, or null. */
  failure: StorefrontResult["failure"];
  isRetrying: boolean;
  retry: () => void;
}

export function useStorefront(): UseStorefront {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const signature = profileSignature(profile);
  useEffect(() => {
    if (storefrontNeedsRefresh(signature)) {
      void invalidateStorefront(queryClient);
    }
  }, [signature, queryClient]);
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: STOREFRONT_QUERY_KEY,
    queryFn: () =>
      loadStorefront(
        queryClient.getQueryData<StorefrontResult>(STOREFRONT_QUERY_KEY)
      ),
    staleTime: STOREFRONT_STALE_MS,
    // loadStorefront never throws; a failure is data with `failure` set and a RETRY in the UI.
    retry: false,
  });

  const cats = useMemo(() => data?.cats ?? emptyStorefront<ICat>(), [data]);
  const meta = data?.meta ?? null;
  const roles = useMemo(() => storefrontRoles(meta), [meta]);
  const partnerCats = useMemo(
    () => catsForSlugs(cats, roles.partner),
    [cats, roles]
  );
  const famousCats = useMemo(() => catsForSlugs(cats, [FAMOUS_SLUG]), [cats]);
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const failure = data?.failure ?? null;
  return {
    cats,
    meta,
    roles,
    partnerCats,
    famousCats,
    isLoading: isPending,
    isReady: !!data && !failure,
    failure,
    isRetrying: isFetching && !isPending,
    retry,
  };
}
