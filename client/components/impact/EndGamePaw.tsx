import { treatRailOpen } from "@/api/impact-api";
import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { labelSet } from "@/components/claims/labels";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ModalButton, modalButtonClass, StatusPill } from "@/components/ui/modal";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useImpact } from "@/hooks/useImpact";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId } from "react";
import { partnerShelterName } from "./live";
import { pawRuleText, pawView, PawView } from "./pawView";
import { IMPACT_ME_QUERY_KEY, useDonateRail, useImpactMe } from "./useImpactMe";

/** Where the instant treat is sent from (the shelter payouts give page, plan G4). */
export const GIVE_TREAT_PATH = "/shelter-payouts/give";
/** The treat link, drawn by the secondary ModalButton's own classes (a link cannot hold a button). */
const TREAT_LINK_CLASS = modalButtonClass({ variant: "secondary", size: "sm", className: "w-fit" });

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

  const titleId = useId();
  const auth = useOptionalFirebaseAuth();
  // No paw data yet (the server has none for this account): no card rather than an empty one.
  if (view.state === "unavailable") return null;
  const runs = view.runs && !copy.earned ? view.runs : null;
  const progress = view.state === "progress";
  // A guest or an unverified account can act on the line: the AuthSheet opens on the right view.
  const accountAction =
    (view.state === "guest" || view.state === "unverified") && auth?.requireAccount
      ? view.state === "guest"
        ? { label: "SAVE MY PROGRESS", icon: "user" as const }
        : { label: "VERIFY MY EMAIL", icon: "mail" as const }
      : null;

  return (
    <section
      data-testid="end-game-paw"
      data-paw-earned={copy.earned || undefined}
      data-paw-state={view.state}
      data-tone={copy.earned ? "success" : "default"}
      aria-labelledby={titleId}
      className="tt-card flex flex-col gap-2 p-3 short:!gap-1.5 short:!p-2.5"
    >
      <header className="flex min-h-[24px] flex-wrap items-center gap-x-2 gap-y-1">
        <span className={copy.earned ? "text-tt-mint" : "text-tt-gold-400"} aria-hidden="true">
          <PixelIcon name="paw" size={20} />
        </span>
        <h3 id={titleId} className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-gold-400">
          Today&apos;s paw
        </h3>
        {copy.earned && (
          <StatusPill tone="mint" icon="check" className="ml-auto">
            Earned
          </StatusPill>
        )}
        {runs && runs.needed > 0 && (
          // The line below says the same in words.
          <span className="ml-auto flex items-center gap-1.5" aria-hidden="true" data-testid="end-game-paw-runs">
            {Array.from({ length: runs.needed }, (_, i) => (
              <span
                key={i}
                className={
                  i < runs.done
                    ? "h-3 w-6 bg-tt-gold-400 [box-shadow:0_0_0_2px_rgb(var(--tt-night-950))]"
                    : "h-3 w-6 bg-tt-night-950 [box-shadow:0_0_0_2px_rgb(var(--tt-night-500))]"
                }
              />
            ))}
          </span>
        )}
      </header>
      <p className="font-sans text-p5 font-bold leading-snug text-tt-cream text-balance" data-testid="end-game-paw-text">
        {copy.text}
      </p>
      {progress && (
        <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5 short:sr-only" data-testid="end-game-paw-rule">
          {pawRuleText(view.runs?.needed)}
        </p>
      )}
      {accountAction && (
        <ModalButton
          variant="secondary"
          size="sm"
          icon={accountAction.icon}
          className="w-fit"
          data-testid="end-game-paw-account"
          onClick={() => void Promise.resolve(auth?.requireAccount("save-progress")).catch(() => undefined)}
        >
          {accountAction.label}
        </ModalButton>
      )}
      {/* The truth-layer chip, explained once, right next to it. */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-p6 font-semibold leading-snug text-tt-muted">
        <EvidenceChip kind="in-game" isApp={isApp} />
        <span>{labelSet(isApp).explain["in-game"]}</span>
      </p>
      {cta &&
        (isApp ? (
          // F7.2: the give page carries wallet and explorer wording, so app builds open web /impact.
          <span data-testid="end-game-treat" data-app-treat="web" className="flex">
            <ModalButton variant="secondary" size="sm" icon="heart" onClick={() => void openWebImpact()}>
              {`SEND ${partner.toUpperCase()} A TREAT`}
            </ModalButton>
          </span>
        ) : (
          <Link href={GIVE_TREAT_PATH} data-testid="end-game-treat" data-variant="secondary" className={TREAT_LINK_CLASS}>
            <PixelIcon name="heart" size="1.1em" />
            <span className="whitespace-nowrap">{`SEND ${partner.toUpperCase()} A TREAT`}</span>
          </Link>
        ))}
    </section>
  );
};

export default EndGamePaw;
