import { isAppBuild } from "@/components/claims/build";
import { Campaign, HandoverStatus, handoverLabel } from "./campaign";
import { explorerAddress } from "./chains";
import { CARD } from "./ui";

// The showcase shelter. Only its name and the wallet from campaign.json are shown; no other claims
// about the shelter are made here.

/**
 * The custody line for this build (F7.2): app builds never name a wallet or a chain. After the handover
 * (campaign.json `shelter.handover`, 16 Oct 2026) payouts go to Pink Paw's wallet; the web line keeps
 * the history (earlier payouts went to a wallet Token Tails held). No claim about who else holds a key.
 */
export function custodyDisclosure(isApp: boolean = isAppBuild(), handover: HandoverStatus = "held-by-token-tails"): string {
  if (handover === "handed-over") {
    // claim: C-001 (campaign.wallets: a wallet Token Tails held until 16 Oct 2026, Pink Paw's wallet since)
    return isApp
      ? "Payouts go to Pink Paw. Every payout is listed on our website."
      : "Payouts go to Pink Paw's wallet. Before 16 Oct 2026 they went to a wallet Token Tails held for the shelter. Every payout is public.";
  }
  return isApp
    ? "Token Tails holds the shelter's share on its behalf until handover. Every payout is listed on our website."
    : "Token Tails created this wallet and holds it on the shelter's behalf until handover. " +
        "Sponsored treats are split to it on-chain today; gifts open after handover. Every payout is public.";
}

/** The line for the current build (read once: `NEXT_PUBLIC_IS_APP` is fixed at build time). */
export const CUSTODY_DISCLOSURE = custodyDisclosure();

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

export const ShelterProfile = ({
  campaign,
  explorer,
  isApp = isAppBuild(),
  heading,
}: {
  campaign: Campaign;
  explorer?: string;
  isApp?: boolean;
  /** The card's title; defaults to the shelter's name (set it when the name is already shown above). */
  heading?: string;
}) => {
  const { shelter } = campaign;
  return (
    <section
      className={`${CARD} flex flex-col gap-3 self-start text-p5`}
      data-testid="shelter-profile"
    >
      <h3 className="font-primary uppercase text-p3 md:text-p2 leading-none text-tt-cream">
        <span aria-hidden="true">🐾 </span>
        {heading ?? shelter.name}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {!isApp && (
          <>
            <dt className="font-primary uppercase tracking-wide text-tt-gold-400">Wallet</dt>
            <dd className="break-all">
              {shelter.wallet ? (
                explorer ? (
                  <a
                    href={explorerAddress(explorer, shelter.wallet)}
                    target="_blank"
                    rel="noopener noreferrer"
                    // The `code` role: a wallet address (plan F4, G14).
                    // eslint-disable-next-line tt/no-raw-font
                    className="font-mono underline decoration-dotted underline-offset-2 hover:text-tt-gold-400"
                  >
                    {short(shelter.wallet)}
                  </a>
                ) : (
                  // The `code` role: a wallet address (plan F4, G14).
                  // eslint-disable-next-line tt/no-raw-font
                  <span className="font-mono">{short(shelter.wallet)}</span>
                )
              ) : (
                <span>Published with the ShelterSplit deploy</span>
              )}
            </dd>
          </>
        )}
        <dt className="font-primary uppercase tracking-wide text-tt-gold-400">Handover</dt>
        <dd>{handoverLabel(shelter.handover, isApp)}</dd>
      </dl>
      {shelter.handover !== "handed-over" && (
        <p
          className="rounded-xl border-2 border-tt-cream/50 bg-tt-cream/10 px-3 py-2 text-p6 md:text-p5 text-tt-cream/90"
          data-testid="custody-disclosure"
        >
          {custodyDisclosure(isApp)}
        </p>
      )}
    </section>
  );
};

export default ShelterProfile;
