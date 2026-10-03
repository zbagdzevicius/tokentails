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

  ctx.font = ttCanvasFont("title", 70);
  ctx.fillStyle = INK.cream;
  ctx.fillText("I sent a rescue treat to", 72, 230);
  ctx.fillStyle = GOLD[400];
  ctx.fillText(data.shelterName, 72, 315, W - 144);

  ctx.fillStyle = INK.cream;
  ctx.font = ttCanvasFont("caption", 44, { weight: 800 });
  ctx.fillText(`${data.amount}, split on-chain`, 72, 400);

  // The tx hash is the one `code` (system mono) text.
  ctx.fillStyle = INK.muted;
  ctx.font = ttCanvasFont("code", 28);
  const tx = `${data.txHash.slice(0, 18)}…${data.txHash.slice(-8)}`;
  ctx.fillText(`${data.chainName} · block ${data.blockNumber} · ${tx}`, 72, 500, W - 144);
  ctx.fillStyle = STATES.pink;
  ctx.font = ttCanvasFont("caption", 30, { weight: 800 });
  ctx.fillText("tokentails.com/shelter-payouts", 72, 560);
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
