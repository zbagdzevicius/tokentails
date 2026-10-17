// copy-lint: web-only (rendered only by the web ShelterPayouts page; app builds show AppProofNotice)
// The live "Motored fundraising for cats" line (Oct 2026): sponsor money from Motored, read from the
// same on-chain payouts as the totals above it, with the disclosure every time. Nothing renders
// before the first Motored gift.
import type { FeedItem } from "./payoutSections";
import { MOTORED_ADDRESSES_URL, motoredLine, motoredNote, motoredTotal } from "./motored";

export const MotoredLine = ({ items, shelterName }: { items: FeedItem[]; shelterName: string }) => {
  const total = motoredTotal(items);
  const line = motoredLine(total, shelterName);
  if (!line) return null;
  return (
    <div
      className="flex max-w-2xl flex-col items-center gap-1 rounded-2xl border-2 border-tt-cream/30 bg-tt-night-900/70 px-4 py-3 text-center"
      data-testid="motored-line"
      aria-live="polite"
    >
      <p className="font-primary text-p4 md:text-p3 text-tt-cream">{line}</p>
      <p className="text-p6 md:text-p5 text-tt-cream/80" data-testid="motored-note">
        {motoredNote(total.count)}{" "}
        <a href={MOTORED_ADDRESSES_URL} className="underline decoration-dotted underline-offset-2">
          Event wallets
        </a>
      </p>
    </div>
  );
};
