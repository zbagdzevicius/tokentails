import { treatRailOpen } from "@/api/impact-api";
import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { PixelButton } from "@/components/shared/PixelButton";
import { useImpact } from "@/hooks/useImpact";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { partnerShelterName } from "./live";
import { pawView, PawView } from "./pawView";
import { IMPACT_ME_QUERY_KEY, useDonateRail, useImpactMe } from "./useImpactMe";

/** Where the instant treat is sent from (the shelter payouts give page, plan G4). */
export const GIVE_TREAT_PATH = "/shelter-payouts/give";
/** The paw partner when the snapshot names none yet (the G4 copy names Pink Paw). */
export const PAW_PARTNER_FALLBACK = "Pink Paw";

export interface EndGamePawCopy {
  /** The paw line. */
  text: string;
  /** True only when today's paw is earned (two spaced runs, an eligible account). */
  earned: boolean;
}

/**
 * The end-of-run paw line (plan G4 "End of run"). "Paw earned: tonight Token Tails pays a treat to
 * Pink Paw" only when the paw is earned and the nightly settlement sends money; otherwise the
 * progress line. Never a promise the settlement does not keep.
 */
export function endGamePawCopy(view: PawView, partner: string, settlementSends: boolean): EndGamePawCopy {
  if (view.state !== "earned") return { text: view.text, earned: false };
  return settlementSends
    ? { text: `Paw earned: tonight Token Tails pays a treat to ${partner}.`, earned: true }
    : { text: `Paw earned. Paw treats to ${partner} have not started yet.`, earned: true };
}

/** The instant treat CTA shows only when the rail is open with treats left and the account may send. */
export function showTreatCta(railOpen: boolean, eligible: boolean): boolean {
  return railOpen && eligible;
}

/**
 * Follow-up reads of `/impact/me` after the panel opens (ms after mount). The panel mounts as soon
 * as the run stops, while the `/live` save may still be in flight, so the first read can predate
 * the run that earns today's paw. These reads stop as soon as the paw shows as earned.
 */
export const PAW_RECHECK_MS = [2000, 5000] as const;

/**
 * The paw line and the instant treat CTA under an end-of-run panel. It re-reads `/impact/me` when
 * it opens (and when `refreshKey` changes, for example after the save answered), since the run
 * that just ended may have earned today's paw.
 */
export const EndGamePaw = ({ refreshKey }: { refreshKey?: unknown }) => {
  const queryClient = useQueryClient();
  const { viewer, me, loading } = useImpactMe();
  const { impact } = useImpact();
  const rail = useDonateRail();

  const view = pawView(viewer, me, loading);
  const earnedNow = view.state === "earned";
  const registered = viewer === "registered";

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: [IMPACT_ME_QUERY_KEY] });
  }, [queryClient, refreshKey]);

  // The save may answer after the first read: re-read a couple of times until the paw shows.
  useEffect(() => {
    if (!registered || earnedNow) return;
    const timers = PAW_RECHECK_MS.map((ms) =>
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: [IMPACT_ME_QUERY_KEY] }), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [queryClient, registered, earnedNow, refreshKey]);

  const partner = partnerShelterName(impact) ?? PAW_PARTNER_FALLBACK;
  const copy = endGamePawCopy(view, partner, !!impact?.pawSettlements.sendEnabled);
  const isApp = isAppBuild();
  const cta = showTreatCta(treatRailOpen(rail), !!me?.instantTreat.eligible);

  return (
    <div
      data-testid="end-game-paw"
      data-paw-earned={copy.earned || undefined}
      className="flex w-full flex-col items-center gap-2 rounded-md bg-tt-night-900/70 px-3 py-2 text-center ring-1 ring-inset ring-tt-gold-500/30"
    >
      <p className="font-secondary text-p5 leading-tight text-tt-cream" data-testid="end-game-paw-text">
        {copy.text}
      </p>
      <EvidenceChip kind="in-game" isApp={isApp} />
      {cta &&
        (isApp ? (
          // F7.2: the give page carries wallet and explorer wording, so app builds open web /impact.
          <span data-testid="end-game-treat" data-app-treat="web">
            <PixelButton
              size="sm"
              onClick={() => void openWebImpact()}
              text={`SEND ${partner.toUpperCase()} A TREAT`}
            />
          </span>
        ) : (
          <Link href={GIVE_TREAT_PATH} data-testid="end-game-treat">
            <PixelButton as="span" size="sm" text={`SEND ${partner.toUpperCase()} A TREAT`} />
          </Link>
        ))}
    </div>
  );
};

export default EndGamePaw;
