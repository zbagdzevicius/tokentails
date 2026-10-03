import { openWebImpact } from "@/components/claims/build";
import { PixelButton } from "@/components/shared/PixelButton";

/**
 * What the payout pages show in app builds (plan G4 "Store copy rule", F7.2): the chain reads,
 * contract addresses and explorer links stay on the web, so the app names the payer and opens web
 * /impact in an in-app browser tab instead.
 */
export const AppProofNotice = ({ title = "Shelter payouts" }: { title?: string }) => (
  <section
    data-testid="payouts-app-notice"
    className="mx-4 flex w-[calc(100%-32px)] max-w-xl flex-col items-center gap-3 mt-24 rounded-2xl border-4 border-tt-cream/70 bg-tt-night-900/90 px-4 py-6 text-center text-tt-cream"
  >
    <h2 className="font-primary text-h6 uppercase tracking-tight">{title}</h2>
    {/* claim: fiction (no figure: it says where the proof lives, not what was paid) */}
    <p className="text-p4">
      Token Tails sends every shelter payout itself. The full record, with dates and receipts, is on
      our website.
    </p>
    <PixelButton text="SEE THE PROOF" onClick={() => void openWebImpact()} />
  </section>
);

export default AppProofNotice;
