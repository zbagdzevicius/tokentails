import { Campaign, handoverLabel } from "./campaign";
import { explorerAddress } from "./chains";

// The showcase shelter. Only its name and the wallet from campaign.json are shown; no other claims
// about the shelter are made here.
export const CUSTODY_DISCLOSURE =
  "Token Tails created this wallet and holds it on the shelter's behalf until handover. " +
  "Donations are split to it on-chain, and every payout is public.";

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

export const ShelterProfile = ({
  campaign,
  explorer,
}: {
  campaign: Campaign;
  explorer?: string;
}) => {
  const { shelter } = campaign;
  return (
    <section
      className="w-full rounded-xl border-2 border-yellow-900 bg-pink-100 p-4 font-secondary text-p5 text-yellow-900"
      data-testid="shelter-profile"
    >
      <p className="font-primary uppercase text-p6 opacity-70">Showcase shelter</p>
      <h3 className="font-primary uppercase text-p2">🐾 {shelter.name}</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-bold">Wallet</dt>
        <dd className="break-all">
          {shelter.wallet ? (
            explorer ? (
              <a
                href={explorerAddress(explorer, shelter.wallet)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline decoration-dotted"
              >
                {short(shelter.wallet)}
              </a>
            ) : (
              <span className="font-mono">{short(shelter.wallet)}</span>
            )
          ) : (
            <span>Published with the ShelterSplit deploy</span>
          )}
        </dd>
        <dt className="font-bold">Handover</dt>
        <dd>{handoverLabel(shelter.handover)}</dd>
      </dl>
      {shelter.handover !== "handed-over" && (
        <p className="mt-2 rounded-lg bg-yellow-300 px-3 py-2 text-black" data-testid="custody-disclosure">
          {CUSTODY_DISCLOSURE}
        </p>
      )}
    </section>
  );
};

export default ShelterProfile;
