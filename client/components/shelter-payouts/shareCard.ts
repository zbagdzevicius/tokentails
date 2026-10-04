// copy-lint: web-only used only by the web ShelterReceipt (app builds show AppProofNotice)
// Draws a 1200x630 share card on a canvas and saves it as a PNG. Runs entirely in the browser.
import { reportAppError } from "@/analytics";
import { gameFontsResult, loadGameFonts, ttCanvasFont } from "@/components/typography";
import { GOLD, INK, NIGHT, STATES } from "@/design/tokens";

export interface ShareCardData {
  shelterName: string;
  amount: string; // already formatted, e.g. "0.01 USDC"
  chainName: string;
  blockNumber: number;
  txHash: string;
  /**
   * "treat" (default): a treat Token Tails sent. "gift": a wallet gift through the router.
   * "matched": a wallet gift Token Tails matched 1:1 ("1 became 2"). No donor identity on any card.
   */
  variant?: "treat" | "gift" | "matched";
  /** A testnet transaction: the card carries a "TESTNET · no real money" band, so a shared image never passes for real money. */
  testnet?: boolean;
}

/** The band drawn across a testnet card. */
export const TESTNET_BAND = "TESTNET · NO REAL MONEY";

/** The card's two headline lines for a variant. */
export function shareCardHeadline(data: Pick<ShareCardData, "shelterName" | "variant">): [string, string] {
  if (data.variant === "matched") return ["1 became 2 for", data.shelterName];
  if (data.variant === "gift") return ["A wallet gift to", data.shelterName];
  return ["I sent a rescue treat to", data.shelterName];
}

const W = 1200;
const H = 630;

/**
 * Draws the card. Fonts are the brand roles (plan G12): call `loadGameFonts()` first (as
 * `downloadShareCard` does), or the canvas bakes in the fallback faces.
 */
export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not supported");

  // Night palette (plan G6: /shelter-payouts is a night page, so its exported card is too).
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, NIGHT[900]);
  bg.addColorStop(1, NIGHT[700]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = GOLD[500];
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // The paw watermark is drawn, not an emoji glyph (no emoji face is declared in the brand roles).
  drawPaw(ctx, 960, 470, 1.6, `${GOLD[400]}1f`);

  ctx.fillStyle = INK.lilac;
  ctx.font = ttCanvasFont("hud", 44);
  ctx.fillText("TOKEN TAILS · SHELTER RECEIPT", 72, 110);

  const [lead, name] = shareCardHeadline(data);
  ctx.font = ttCanvasFont("title", 70);
  ctx.fillStyle = INK.cream;
  ctx.fillText(lead, 72, 230);
  ctx.fillStyle = GOLD[400];
  ctx.fillText(name, 72, 315, W - 144);

  ctx.fillStyle = INK.cream;
  ctx.font = ttCanvasFont("caption", 44, { weight: 800 });
  ctx.fillText(
    data.variant === "matched" ? `${data.amount} given, Token Tails matched it on-chain` : `${data.amount}, split on-chain`,
    72,
    400,
    W - 144
  );

  // The tx hash is the one `code` (system mono) text.
  ctx.fillStyle = INK.muted;
  ctx.font = ttCanvasFont("code", 28);
  const tx = `${data.txHash.slice(0, 18)}…${data.txHash.slice(-8)}`;
  ctx.fillText(`${data.chainName} · block ${data.blockNumber} · ${tx}`, 72, 500, W - 144);
  ctx.fillStyle = STATES.pink;
  ctx.font = ttCanvasFont("caption", 30, { weight: 800 });
  ctx.fillText("tokentails.com/shelter-payouts", 72, 560);

  if (data.testnet) {
    // A solid band in the bottom-right corner, clear of the URL and the tx line.
    ctx.fillStyle = STATES.mint;
    ctx.fillRect(W - 24 - 520, H - 24 - 64, 520, 64);
    ctx.fillStyle = NIGHT[900];
    ctx.font = ttCanvasFont("hud", 34);
    ctx.fillText(TESTNET_BAND, W - 24 - 500, H - 24 - 20, 480);
  }
}

/** A paw print: one pad and four toes, centred on (x, y), about 100 px across at scale 1. */
function drawPaw(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 22, 34, 28, 0, 0, Math.PI * 2);
  for (const [tx, ty] of [[-38, -14], [-14, -40], [14, -40], [38, -14]]) {
    ctx.moveTo(tx + 13, ty);
    ctx.ellipse(tx, ty, 13, 16, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

// Warm the brand faces as soon as this module loads (it is imported by the receipt), so the
// fonts are usually ready by the time someone taps "Download" and the save stays inside the
// tap's user activation (iOS Safari and in-app WebKit block late programmatic downloads).
if (typeof document !== "undefined") void loadGameFonts();

/** True when the card's faces can be drawn now, without waiting. */
function shareCardFontsReady(): boolean {
  if (gameFontsResult() !== null) return true;
  try {
    return (
      document.fonts.check(ttCanvasFont("title", 70)) &&
      document.fonts.check(ttCanvasFont("hud", 44)) &&
      document.fonts.check(ttCanvasFont("caption", 44, { weight: 800 }))
    );
  } catch {
    return false;
  }
}

/**
 * Draws and saves the PNG. Draws straight away when the brand faces are ready; otherwise waits
 * for them (3 s at most, never rejects). Never rejects itself: failures go to `reportAppError`.
 */
export async function downloadShareCard(data: ShareCardData) {
  try {
    if (!shareCardFontsReady()) await loadGameFonts();
    const canvas = document.createElement("canvas");
    drawShareCard(canvas, data);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `token-tails-receipt-${data.txHash.slice(2, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    reportAppError("share_card_error", error, { chain: data.chainName });
  }
}
