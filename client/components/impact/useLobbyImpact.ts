import type { PublicImpact } from "@/api/impact-api";
import { useImpact } from "@/hooks/useImpact";
import { pawView, PawView } from "./pawView";
import { ImpactViewer, useImpactMe } from "./useImpactMe";

export interface LobbyImpact {
  viewer: ImpactViewer;
  impact: PublicImpact | null;
  paw: PawView;
  lifetimePaws: number;
}

/** Everything the lobby's impact surfaces read: the public snapshot and the player's paws. */
export function useLobbyImpact(): LobbyImpact {
  const { impact } = useImpact();
  const { viewer, me, loading } = useImpactMe();
  const paw = pawView(viewer, me, loading);
  return { viewer, impact, paw, lifetimePaws: paw.lifetime };
}
