import { currentAccessToken } from "@/api/api";
import {
  DonateRail,
  fetchDonateRail,
  fetchImpactMe,
  ImpactMe,
} from "@/api/impact-api";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";

/** Who is looking: paws and treats belong to registered accounts only (plan F5.4, F7.5). */
export type ImpactViewer = "loading" | "guest" | "unverified" | "registered";

export const IMPACT_ME_QUERY_KEY = "impact-me";
export const DONATE_RAIL_QUERY_KEY = "donate-rail";

/** The viewer state from the auth runtime, or from the profile on pages without one. */
export function useImpactViewer(): ImpactViewer {
  const auth = useOptionalFirebaseAuth();
  const { profile } = useProfile();
  if (auth) {
    if (auth.authStatus === "ready") return "registered";
    if (auth.authStatus === "guest" || auth.authStatus === "signed-out") return "guest";
    if (auth.authStatus === "needs-verification") return "unverified";
    return "loading";
  }
  if (!profile) return "guest";
  return (profile as { isGuest?: boolean }).isGuest ? "guest" : "registered";
}

export interface ImpactMeState {
  viewer: ImpactViewer;
  me: ImpactMe | null;
  /** True while a registered account's first read is in flight. */
  loading: boolean;
}

/**
 * `GET /impact/me` (plan G4), shared by the lobby tile, the strip, MY IMPACT and the end-of-run
 * panels through one react-query cache entry per account. Guests never call it (it is a 403 for
 * them, F5.4). A failed read is null: surfaces then show progress copy, never a paw claim.
 */
export function useImpactMe(): ImpactMeState {
  const viewer = useImpactViewer();
  const { profile } = useProfile();
  const enabled = viewer === "registered" && !!profile?._id;
  const { data, isLoading } = useQuery({
    queryKey: [IMPACT_ME_QUERY_KEY, profile?._id ?? null],
    queryFn: ({ signal }) => fetchImpactMe({ signal, token: currentAccessToken() }),
    enabled,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return { viewer, me: enabled ? data ?? null : null, loading: enabled && isLoading };
}

/** The public treat rail (`GET /shelter/donate/status`); null until read or on failure. */
export function useDonateRail(): DonateRail | null {
  const { data } = useQuery({
    queryKey: [DONATE_RAIL_QUERY_KEY],
    queryFn: ({ signal }) => fetchDonateRail({ signal }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data ?? null;
}
