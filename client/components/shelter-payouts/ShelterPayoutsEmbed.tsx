// copy-lint: web-only the /impact embed of /shelter-payouts; impact.tsx renders it in the web branch only (app builds show the gallery alone)
import { CampaignMeter } from "./CampaignMeter";
import { useCampaignGoal } from "./goal";
import {
  FeedSection,
  GiveCtaSection,
  HowItWorks,
  feedItems,
  payoutsEmptyCopy,
  stillReading,
  usePayouts,
  useTreatJar,
} from "./payoutSections";
import { isPinkPawWallet } from "./pinkPaw";
import { PinkPawCatsSection, PinkPawIdentity } from "./PinkPawShowcase";
import { HEADLINE, Kicker, PANEL, PinkCat } from "./ui";

/**
 * /shelter-payouts inside /impact: the Pink Paw goal meter and cat gallery, the payouts feed, how it
 * works and the give call to action. The same components as the payouts page (payoutSections.tsx,
 * CampaignMeter, PinkPawGallery), with the mainnet reads only (no testnet proof list here).
 */
export const ShelterPayoutsEmbed = () => {
  const { campaign, progress, state } = useCampaignGoal();
  const { page, results } = usePayouts({ testnet: false });
  const { closed } = useTreatJar();
  const deployments = page.status === "done" ? page.deployments : [];
  const feed = feedItems(deployments, results);
  const pending = page.status === "loading" || stillReading(deployments, results);
  const shelterName = (addr: string) =>
    campaign?.shelter.wallet && campaign.shelter.wallet === addr.toLowerCase() ? campaign.shelter.name : null;
  const pinkPaw = !campaign || isPinkPawWallet(campaign.shelter.wallet);

  return (
    <div className="flex flex-col gap-6 md:gap-8" data-testid="impact-shelter-payouts">
      <section id="pink-paw" className={`${PANEL} scroll-mt-28`} aria-labelledby="pink-paw-title">
        <Kicker>Showcase shelter</Kicker>
        <h2 id="pink-paw-title" className={HEADLINE}>
          Pink Paw, <span className="glow text-tt-cream">live from the chain.</span>
        </h2>
        <div className="mt-5 flex flex-col gap-6 md:mt-7 md:gap-8">
          {campaign && pinkPaw && <PinkPawIdentity name={campaign.shelter.name} />}
          {campaign && progress && <CampaignMeter campaign={campaign} progress={progress} state={state} />}
          {pinkPaw && <PinkPawCatsSection />}
        </div>
      </section>

      {page.status === "done" && deployments.length === 0 ? (
        <section id="payouts" className={`${PANEL} scroll-mt-28 flex flex-col items-center gap-3 text-center`}>
          <PinkCat lick className="h-40 w-40 -my-6" />
          <p className="max-w-2xl text-p5 md:text-p4" data-testid="payouts-empty">
            {payoutsEmptyCopy(campaign?.startDate)}
          </p>
        </section>
      ) : (
        <FeedSection id="payouts" feed={feed} pending={pending} shelterName={shelterName} />
      )}
      <HowItWorks id="how-it-works" />
      <GiveCtaSection jarClosed={closed} />
    </div>
  );
};

export default ShelterPayoutsEmbed;
