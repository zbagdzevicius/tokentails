// Draws a 1200x630 share card on a canvas and saves it as a PNG. Runs entirely in the browser.

export interface ShareCardData {
  shelterName: string;
  amount: string; // already formatted, e.g. "0.01 USDC"
  chainName: string;
  blockNumber: number;
  txHash: string;
}

const W = 1200;
const H = 630;

export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not supported");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#fbcfe8");
  bg.addColorStop(1, "#fde68a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(113, 63, 18, 0.12)";
  ctx.font = "220px sans-serif";
  ctx.fillText("🐾", 860, 600);

  ctx.fillStyle = "#713f12";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("TOKEN TAILS · SHELTER RECEIPT", 72, 110);

  ctx.font = "bold 68px sans-serif";
  ctx.fillText("I sent a rescue treat to", 72, 230);
  ctx.fillStyle = "#be185d";
  ctx.fillText(data.shelterName, 72, 315, W - 144);

  ctx.fillStyle = "#713f12";
  ctx.font = "44px sans-serif";
  ctx.fillText(`${data.amount}, split on-chain`, 72, 400);

  ctx.font = "28px monospace";
  const tx = `${data.txHash.slice(0, 18)}…${data.txHash.slice(-8)}`;
  ctx.fillText(`${data.chainName} · block ${data.blockNumber} · ${tx}`, 72, 500, W - 144);
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("tokentails.com/shelter-payouts", 72, 560);
}

export function downloadShareCard(data: ShareCardData) {
  const canvas = document.createElement("canvas");
  drawShareCard(canvas, data);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `token-tails-receipt-${data.txHash.slice(2, 10)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
