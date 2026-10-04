// copy-lint: web-only the crypto checkout renders only in WebPayment, which app builds replace with AppCheckoutNotice
import { create } from "qrcode";
import { useMemo } from "react";

/** One SVG path of the dark modules ("M x y h1 v1 h-1 z" per module), with a 4-module quiet zone. */
export function qrPath(text: string): { size: number; d: string } {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let d = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (modules.get(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
  }
  return { size: n + 8, d };
}

/**
 * A scannable QR of the payment link: dark modules on a cream card (a QR needs a light quiet zone,
 * so it is the one light block of the night checkout).
 */
export const PaymentQr = ({ value, label }: { value: string; label: string }) => {
  const qr = useMemo(() => {
    try {
      return qrPath(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;
  return (
    <div className="rounded-xl border-4 border-tt-gold-500 bg-tt-cream p-1 shadow-[0_4px_0_rgb(var(--tt-night-950))]">
      <svg
        role="img"
        aria-label={label}
        data-testid="crypto-pay-qr"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        className="block h-44 w-44 text-tt-night-950"
        shapeRendering="crispEdges"
      >
        <path d={qr.d} fill="currentColor" />
      </svg>
    </div>
  );
};
