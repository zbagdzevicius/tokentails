import { isAppBuild } from "@/components/claims/build";
import { Campaign, handoverLabel } from "./campaign";
import { explorerAddress } from "./chains";
import { CARD } from "./ui";

// The showcase shelter. Only its name and the wallet from campaign.json are shown; no other claims
// about the shelter are made here.

/** The custody line for this build (F7.2): app builds name the holder, never a wallet or a chain. */
export function custodyDisclosure(isApp: boolean = isAppBuild()): string {
  return isApp
    ? "Token Tails holds the shelter's share on its behalf until handover. Every payout is listed on our website."
    : "Token Tails created this wallet and holds it on the shelter's behalf until handover. " +
        "Donations are split to it on-chain, and every payout is public.";
}

/** The line for the current build (read once: `NEXT_PUBLIC_IS_APP` is fixed at build time). */
export const CUSTODY_DISCLOSURE = custodyDisclosure();

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

export const ShelterProfile = ({
  campaign,
  explorer,
  isApp = isAppBuild(),
}: {
  campaign: Campaign;
  explorer?: string;
  isApp?: boolean;
}) => {
  const { shelter } = campaign;
  return (
    <section
      className={`${CARD} flex h-full flex-col gap-3 text-p5`}
      data-testid="shelter-profile"
    >
      <h3 className="font-primary uppercase text-p3 md:text-p2 leading-none text-tt-cream">
        <span aria-hidden="true">🐾 </span>
        {shelter.name}
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
