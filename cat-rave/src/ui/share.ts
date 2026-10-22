/**
 * L-UI: share a link (Web Share API, else clipboard) and save a picture of the rave with the
 * counter burned in (SPEC.md "Share and meta").
 */
import { LINKS } from '../config';

export function shareUrl(focusedCat: number | null): string {
  const onSite = /(^|\.)tokentails\.com$/i.test(location.hostname);
  const base = onSite ? `${location.origin}${location.pathname}` : LINKS.self;
  return focusedCat === null ? base : `${base}?cat=${focusedCat + 1}`;
}

/** 'shared' | 'copied' | 'failed' */
export async function shareLink(url: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ title: 'Moon Rave', text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = `${text} ${url}`;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }
}

/** Burns the counter into a scene capture and returns a PNG. */
/** Counter glow and ink per stage light, so the burned-in text matches the scene behind it. */
const PICTURE_INK = {
  green: { glow: '#46ff7a', ink: '#eafff0', small: 'rgba(234,255,240,0.75)' },
  red: { glow: '#ff4656', ink: '#ffeef0', small: 'rgba(255,238,240,0.75)' },
} as const;

export async function composePicture(
  scene: Blob,
  lines: { amount: string; cats: string; tag: string; demo?: string | null },
  light: keyof typeof PICTURE_INK = 'green',
): Promise<Blob> {
  const ink = PICTURE_INK[light];
  const bmp = await createImageBitmap(scene);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0);
  bmp.close?.();
  const u = Math.min(c.width, c.height) / 100;
  // Bottom gradient for legibility.
  const grad = g.createLinearGradient(0, c.height * 0.58, 0, c.height);
  grad.addColorStop(0, 'rgba(2,10,5,0)');
  grad.addColorStop(1, 'rgba(2,10,5,0.88)');
  g.fillStyle = grad;
  g.fillRect(0, c.height * 0.58, c.width, c.height * 0.42);
  const font = getComputedStyle(document.documentElement).getPropertyValue('--rave-display').trim() || 'system-ui';
  const url = 'tokentails.com/cat-rave';
  const margin = u * 5;
  // Small print first: the tag line and the URL share a line only when both fit (with a gap);
  // otherwise (portrait) the URL gets its own line under the tag and everything above moves up.
  let small = Math.round(u * 3.2);
  g.font = `600 ${small}px system-ui, sans-serif`;
  const maxW = c.width - margin - u * 4;
  while (small > 10 && g.measureText(lines.tag).width > maxW) {
    small -= 1;
    g.font = `600 ${small}px system-ui, sans-serif`;
  }
  const oneLine = g.measureText(lines.tag).width + u * 4 + g.measureText(url).width <= maxW;
  const lineH = small * 1.45;
  const base = c.height - u * 4;
  const lift = oneLine ? 0 : lineH;
  g.textBaseline = 'alphabetic';
  g.shadowColor = ink.glow;
  g.shadowBlur = u * 3;
  g.fillStyle = ink.ink;
  g.font = `${Math.round(u * 11)}px ${font}, system-ui, sans-serif`;
  g.fillText(`${lines.amount} raised`, margin, c.height - u * 17 - lift);
  g.shadowColor = '#ff4f9e';
  g.fillStyle = '#ffd1e6';
  g.font = `${Math.round(u * 6.5)}px ${font}, system-ui, sans-serif`;
  g.fillText(`= ${lines.cats}`, margin, c.height - u * 9 - lift);
  g.shadowBlur = 0;
  g.fillStyle = ink.small;
  g.font = `600 ${small}px system-ui, sans-serif`;
  g.fillText(lines.tag, margin, base - lift);
  if (oneLine) {
    g.textAlign = 'right';
    g.fillText(url, c.width - u * 4, base);
    g.textAlign = 'left';
  } else {
    g.fillText(url, margin, base);
  }
  if (lines.demo) {
    // DEMO crowd: a diagonal band across the middle so the picture can't pass for the real floor.
    g.save();
    g.translate(c.width / 2, c.height * 0.2);
    g.rotate(-0.12);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255, 207, 61, 0.92)';
    const bandH = u * 13;
    g.fillRect(-c.width, -bandH / 2, c.width * 2, bandH);
    g.fillStyle = '#1a1200';
    g.font = `800 ${Math.round(u * 6.5)}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText(lines.demo.toUpperCase(), 0, 0);
    g.restore();
  }
  return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

export async function savePicture(png: Blob): Promise<'shared' | 'downloaded'> {
  const file = new File([png], 'moon-rave.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Moon Rave' });
      return 'shared';
    } catch {
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(png);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moon-rave.png';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
