/**
 * Result card (GDD 9.2): 1080×1350 PNG drawn on a 2D canvas. Shows only what the game measured on this device:
 * place, race time, best lap, track and class, plus the cat's face when the player made one (local only).
 * It is the share fallback when the browser cannot encode the clip.
 */
import { fmtRaceTime, ordinalText } from './card-text';

export interface ResultCardIn {
  place: number;
  time: number | null;
  bestLap: number | null;
  trackName: string;
  className: string;
  catName: string;
  face: HTMLCanvasElement | null;
  linkLabel: string;
  accent: number;
  /** "You beat Mochi's ghost" etc. */
  extra?: string | null;
}

function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export function drawResultCard(c: ResultCardIn): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const accent = hexCss(c.accent);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a1650');
  bg.addColorStop(1, '#120b2a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // speed stripes
  g.save();
  g.globalAlpha = 0.18;
  g.fillStyle = accent;
  for (let i = 0; i < 9; i++) {
    g.save();
    g.translate(-200 + i * 180, 0);
    g.rotate(-0.35);
    g.fillRect(0, -200, 36, H + 600);
    g.restore();
  }
  g.restore();

  const font = (w: number, s: number) => `${w} ${s}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const text = (t: string, x: number, y: number, s: number, fill: string, w = 900) => {
    g.font = font(w, s);
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.lineWidth = s * 0.14;
    g.strokeStyle = '#1a1238';
    g.strokeText(t, x, y);
    g.fillStyle = fill;
    g.fillText(t, x, y);
  };

  text('FORMULA MEOW', W / 2, 120, 64, accent);
  // face (or a paw) in a ring
  const cx = W / 2;
  const cy = 360;
  g.beginPath();
  g.arc(cx, cy, 170, 0, Math.PI * 2);
  g.fillStyle = '#fff3dc';
  g.fill();
  if (c.face) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, 160, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#d9cbb8';
    g.fillRect(cx - 160, cy - 160, 320, 320);
    g.drawImage(c.face, cx - 160, cy - 160, 320, 320);
    g.restore();
  } else text('🐾', cx, cy + 60, 170, '#2a1a22', 400);
  text(c.catName, W / 2, 610, 72, '#fff3dc');
  text(ordinalText(c.place), W / 2, 820, 200, c.place <= 3 ? '#ffd27a' : '#fff3dc');
  text(`${fmtRaceTime(c.time)}  ·  best lap ${fmtRaceTime(c.bestLap)}`, W / 2, 920, 50, '#fff3dc', 800);
  text(`${c.trackName} · ${c.className}`, W / 2, 990, 42, accent, 800);
  if (c.extra) text(c.extra, W / 2, 1070, 44, '#ffd27a', 800);
  text('BEAT MY CAT', W / 2, 1200, 92, '#ff3ea5');
  text(c.linkLabel, W / 2, 1280, 40, '#fff3dc', 700);
  return cv;
}

export function canvasPng(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      cv.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
