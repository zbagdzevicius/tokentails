import { PixelButton } from "@/components/shared/PixelButton";

// Shown in app builds (isApp) wherever the web offers Stripe or Stellar
// checkout. App store rules require in-app purchase for digital goods, and
// IAP is not built yet, so the app sells nothing. Keep the copy neutral: no
// price, no link or pointer to buying elsewhere.
export const AppCheckoutNotice = ({ onBack }: { onBack?: () => void }) => {
  return (
    <div className="flex flex-col items-center gap-2 relative z-10">
      <div className="mx-auto w-full max-w-[420px] rounded-lg border-2 border-tt-gold-500 bg-tt-night-800/95 px-3 py-2 text-center font-primary text-p6 md:text-p5 text-tt-cream">
        Purchases are not available in the app yet.
      </div>
      {onBack && <PixelButton size="sm" text="BACK" onClick={onBack} />}
    </div>
  );
};
