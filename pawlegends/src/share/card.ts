/**
 * Legend Moment share card (MATCH-MOMENTS.md §3): a 1200x630 picture of the match drawn on a canvas from the result
 * and the champion's art (loaded lazily from the art host, like ui/art.ts), in the v6 Lightning Rivalry look: rose for
 * the cats on the left, sky for the dogs on the right, the yellow bolt between them, halftone corners, Rubik italic
 * display type. Opens in a sheet with Share (the system share sheet with the picture, where the browser or the app
 * allows it), Save image and Copy link. No prices, no store, nothing from outside the game.
 */
import { PUBLIC_GAME_URL } from '../app/platform';
import '../ui/css/moments.css';

export const CARD_W = 1200;
export const CARD_H = 630;

export interface CardData {
  won: boolean;
  draw?: boolean;
  /** The champion's display name ("Clem", or a worn cat's name). */
  heroName: string;
  /** "Fighter". */
  role: string;
  side: 'cat' | 'dog';
  k: number;
  d: number;
  a: number;
  grade: string | null;
  best: string | null;
  /** "Skirmish 3v3 · 7:12". */
  line: string;
  /** The player's name, or null (guests). */
  player: string | null;
  /** The champion's splash URL (a worn skin's), or null. */
  art: string | null;
  /** The champion's own splash, tried when `art` does not load. */
  artFallback?: string | null;
}

/** The card's headline. Pure. */
export function cardTitle(d: Pick<CardData, 'won' | 'draw' | 'best'>): string {
  // the moment, without its Fish count ("Shut down! +160 Fish" -> "SHUT DOWN!")
  const best = d.best?.replace(/\s*\+\d+\s*(fish|xp)\b.*$/i, '').trim();
  if (best) return best.toUpperCase();
  return d.won ? 'VICTORY!' : d.draw ? 'DRAW' : 'GOOD FIGHT';
}

/** The share sheet text. Pure. */
export function shareText(d: Pick<CardData, 'won' | 'best' | 'heroName' | 'k' | 'd' | 'a'>): string {
  const what = d.best ? `${d.best} with ${d.heroName}` : `${d.won ? 'A win' : 'A match'} with ${d.heroName}`;
  return `${what}, ${d.k}/${d.d}/${d.a}. My Legend Moment in Paw Legends!`;
}

const C = Object.freeze({
  rose: '#ff3d7f',
  roseTop: '#ff86a5',
  roseDeep: '#c8135b',
  sky: '#39a6ff',
  skyTop: '#7cc6ff',
  skyDeep: '#0d4fb8',
  bolt: '#ffe14a',
  boltTop: '#fff08a',
  flame: '#ff8a1e',
  night: '#12091f',
  navy: '#071334',
  cream: '#fff3e3',
  gold: '#f7bc3c',
});

const DISPLAY = (px: number): string => `italic 900 ${px}px Rubik, Fredoka, ui-rounded, system-ui, sans-serif`;
const UI = (px: number, w = 600): string => `${w} ${px}px Fredoka, ui-rounded, system-ui, sans-serif`;

/** Load an image for the canvas (CORS-clean), or null on any failure or after `ms`. */
export function loadImage(url: string | null, ms = 4000): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const end = (v: HTMLImageElement | null): void => {
      if (done) return;
      done = true;
      resolve(v);
    };
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => end(img);
    img.onerror = () => end(null);
    setTimeout(() => end(null), ms);
    img.src = url;
  });
}

/** Shrink `text` until it fits `max` px at `font(px)`, from `px` down to `min`. */
function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, min: number, max: number): number {
  for (let s = px; s >= min; s -= 2) {
    g.font = font(s);
    if (g.measureText(text).width <= max) return s;
  }
  g.font = font(min);
  return min;
}

function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: string, w: number): void {
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.strokeStyle = stroke;
  g.lineWidth = w;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function halftone(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.fillStyle = color;
  for (let y = cy - r; y <= cy + r; y += 18)
    for (let x = cx - r; x <= cx + r; x += 18) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      g.beginPath();
      g.arc(x, y, 5.5 * (1 - d), 0, Math.PI * 2);
      g.fill();
    }
}

/** Draw the card on `canvas` (resized to 1200x630). `art` is the loaded champion picture, or null. */
export function drawCard(canvas: HTMLCanvasElement, d: CardData, art: HTMLImageElement | null): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = CARD_W;
  const H = CARD_H;
  // the split: rose left, sky right, the bolt slanting from top-left of centre to bottom-right of centre
  const top = W * 0.47;
  const bot = W * 0.55;
  const rose = g.createLinearGradient(0, 0, 0, H);
  rose.addColorStop(0, C.roseTop);
  rose.addColorStop(1, C.roseDeep);
  g.fillStyle = rose;
  g.fillRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, C.skyTop);
  sky.addColorStop(1, C.skyDeep);
  g.fillStyle = sky;
  g.beginPath();
  g.moveTo(top, 0);
  g.lineTo(W, 0);
  g.lineTo(W, H);
  g.lineTo(bot, H);
  g.closePath();
  g.fill();
  // speed lines toward the centre
  g.save();
  g.globalAlpha = 0.12;
  g.strokeStyle = C.cream;
  g.lineWidth = 3;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.beginPath();
    g.moveTo(W / 2 + Math.cos(a) * 260, H / 2 + Math.sin(a) * 200);
    g.lineTo(W / 2 + Math.cos(a) * 900, H / 2 + Math.sin(a) * 700);
    g.stroke();
  }
  g.restore();
  halftone(g, 0, 0, 220, 'rgba(255,243,227,0.22)');
  halftone(g, W, H, 220, 'rgba(255,243,227,0.22)');
  halftone(g, W, 0, 160, 'rgba(7,19,52,0.18)');
  halftone(g, 0, H, 160, 'rgba(62,8,32,0.22)');
  // the bolt: a flat zig-zag, lemon core, orange rim, thin dark outline
  const bolt: [number, number][] = [
    [top - 26, -10],
    [top + 40, -10],
    [W * 0.5 + 22, H * 0.4],
    [W * 0.53 + 30, H * 0.4],
    [bot + 34, H + 10],
    [bot - 40, H + 10],
    [W * 0.495 - 24, H * 0.58],
    [W * 0.465 - 30, H * 0.58],
  ];
  const path = (): void => {
    g.beginPath();
    bolt.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  path();
  g.lineJoin = 'round';
  g.strokeStyle = C.night;
  g.lineWidth = 14;
  g.stroke();
  g.strokeStyle = C.flame;
  g.lineWidth = 8;
  g.stroke();
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.boltTop);
  bg.addColorStop(1, C.bolt);
  g.fillStyle = bg;
  g.fill();

  // the champion on its own side (cats left, dogs right); the words on the other
  const artLeft = d.side === 'cat';
  const artBox = { x: artLeft ? 20 : W * 0.52, y: 30, w: W * 0.46, h: H - 60 };
  if (art) {
    const k = Math.max(artBox.w / art.naturalWidth, artBox.h / art.naturalHeight);
    const iw = art.naturalWidth * k;
    const ih = art.naturalHeight * k;
    g.save();
    g.beginPath();
    g.roundRect?.(artBox.x, artBox.y, artBox.w, artBox.h, 28);
    if (!g.roundRect) g.rect(artBox.x, artBox.y, artBox.w, artBox.h);
    g.clip();
    g.drawImage(art, artBox.x + (artBox.w - iw) / 2, artBox.y + (artBox.h - ih) / 2, iw, ih);
    g.restore();
    g.save();
    g.beginPath();
    g.roundRect?.(artBox.x, artBox.y, artBox.w, artBox.h, 28);
    if (!g.roundRect) g.rect(artBox.x, artBox.y, artBox.w, artBox.h);
    g.strokeStyle = C.night;
    g.lineWidth = 10;
    g.stroke();
    g.strokeStyle = C.gold;
    g.lineWidth = 4;
    g.stroke();
    g.restore();
  } else {
    // no picture: the champion's initial on a big medal
    const cx = artBox.x + artBox.w / 2;
    const cy = artBox.y + artBox.h / 2;
    g.fillStyle = 'rgba(7,19,52,0.35)';
    g.beginPath();
    g.arc(cx, cy, 190, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = C.gold;
    g.lineWidth = 10;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = DISPLAY(200);
    outlined(g, d.heroName.slice(0, 1).toUpperCase(), cx, cy + 6, C.cream, C.night, 14);
  }

  // the words
  const tx = artLeft ? W * 0.56 : 60;
  const tw = W * 0.4;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const kicker = d.won ? 'VICTORY' : d.draw ? 'DRAW' : 'DEFEAT';
  g.font = DISPLAY(30);
  outlined(g, `LEGEND MOMENT · ${kicker}`, tx, 92, C.bolt, C.night, 8);
  const title = cardTitle(d);
  // one line when it fits at 56 px or more, else two lines (split at the space nearest the middle)
  let ts = fit(g, title, DISPLAY, 92, 56, tw);
  let lines = [title];
  if (g.measureText(title).width > tw && title.includes(' ')) {
    const mid = title.length / 2;
    let cut = -1;
    for (let i = 0; i < title.length; i++) if (title[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    lines = [title.slice(0, cut), title.slice(cut + 1)];
    ts = Math.min(...lines.map((l) => fit(g, l, DISPLAY, 72, 36, tw)));
  } else if (g.measureText(title).width > tw) ts = fit(g, title, DISPLAY, 56, 28, tw);
  g.font = DISPLAY(ts);
  let y = 92;
  for (const l of lines) {
    y += ts + 6;
    outlined(g, l, tx, y, C.cream, C.night, Math.max(8, Math.round(ts / 6.5)));
  }
  y += 4;
  const name = d.heroName.toUpperCase();
  const ns = fit(g, name, DISPLAY, 58, 32, tw);
  y += ns + 18;
  outlined(g, name, tx, y, d.side === 'cat' ? '#ffd6e4' : '#e3f2ff', C.night, 10);
  g.font = UI(26, 600);
  y += 40;
  outlined(g, d.role, tx, y, C.cream, C.night, 6);
  // the stat pills: K / D / A and the grade
  y += 34;
  const pill = (x: number, label: string, value: string, w: number, fill: string): void => {
    g.save();
    g.beginPath();
    g.roundRect?.(x, y, w, 92, 22);
    if (!g.roundRect) g.rect(x, y, w, 92);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = C.night;
    g.lineWidth = 6;
    g.stroke();
    g.restore();
    g.textAlign = 'center';
    g.font = DISPLAY(44);
    outlined(g, value, x + w / 2, y + 54, C.cream, C.night, 8);
    g.font = UI(18, 700);
    g.fillStyle = 'rgba(255,243,227,0.85)';
    g.fillText(label, x + w / 2, y + 80);
    g.textAlign = 'left';
  };
  pill(tx, 'K / D / A', `${d.k}/${d.d}/${d.a}`, d.grade ? 250 : tw, 'rgba(7,19,52,0.72)');
  if (d.grade) pill(tx + 266, 'GRADE', d.grade, 140, d.grade === 'S' ? 'rgba(247,188,60,0.92)' : 'rgba(7,19,52,0.72)');
  y += 132;
  g.font = UI(24, 600);
  outlined(g, d.line, tx, y, C.cream, C.night, 6);
  if (d.player) {
    y += 34;
    g.font = UI(22, 500);
    outlined(g, d.player, tx, y, 'rgba(255,243,227,0.9)', C.night, 5);
  }
  // footer: the game's name and where to play it
  g.font = DISPLAY(34);
  g.textAlign = artLeft ? 'right' : 'left';
  const fx = artLeft ? W - 40 : 40;
  outlined(g, 'PAW LEGENDS', fx, H - 66, C.gold, C.night, 9);
  g.font = UI(22, 600);
  outlined(g, 'Play free at pawlegends.app', fx, H - 32, C.cream, C.night, 6);
  g.textAlign = 'left';
}

/** The canvas as a PNG blob, or null (a tainted canvas or no toBlob). */
export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

export interface ShareCardOpts {
  data: CardData;
  /** The link the share carries (the dare link after a win, else the public game). */
  url?: string | null;
  /** Copy the link through the game's share path (the host's share sheet or the clipboard). */
  onLink(url: string, text: string): void;
  onClose?(): void;
  track?(event: string, props: Record<string, string | number | boolean>): void;
}

/** Open the card sheet over `parent`. Draws at once without art, then again when the picture arrives. */
export function openShareCard(parent: HTMLElement, o: ShareCardOpts): HTMLElement {
  const url = o.url || PUBLIC_GAME_URL;
  const text = shareText(o.data);
  const root = document.createElement('div');
  root.className = 'mm-share';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Legend Moment card');
  root.innerHTML = `<div class="mm-share-card">
    <button type="button" class="pl-x" data-s="close" aria-label="Close">✕</button>
    <h2>Legend Moment</h2>
    <div class="mm-share-pic"><canvas width="${CARD_W}" height="${CARD_H}" data-testid="share-card-canvas" aria-label="${text.replace(/"/g, '&quot;')}"></canvas></div>
    <div class="mm-row">
      <button type="button" class="pl-btn ghost small" data-s="save" data-testid="share-card-save">Save image</button>
      <button type="button" class="pl-btn ghost small" data-s="link" data-testid="share-card-link">Copy link</button>
      <button type="button" class="pl-btn small" data-s="share" data-testid="share-card-share">Share</button>
    </div>
    <p class="mm-share-note" aria-live="polite"></p>
  </div>`;
  parent.appendChild(root);
  const canvas = root.querySelector('canvas')!;
  const note = root.querySelector<HTMLElement>('.mm-share-note')!;
  document.documentElement.dataset.shareCard = 'open';
  let art: HTMLImageElement | null = null;
  const draw = (): void => {
    drawCard(canvas, o.data, art);
    canvas.dataset.art = art ? '1' : '0';
  };
  draw();
  // the display face, then the champion picture: each redraws when it lands
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  void fonts
    ?.load(DISPLAY(40))
    .then(() => root.isConnected && draw())
    .catch(() => undefined);
  void loadImage(o.data.art)
    .then((img) => img ?? (o.data.artFallback && o.data.artFallback !== o.data.art ? loadImage(o.data.artFallback) : null))
    .then((img) => {
    if (!img || !root.isConnected) return;
    art = img;
    draw();
    // a picture without CORS headers taints the canvas: draw without it so Save and Share still work
    try {
      canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    } catch {
      art = null;
      draw();
    }
  });
  const close = (): void => {
    if (!root.isConnected) return;
    root.remove();
    delete document.documentElement.dataset.shareCard;
    document.removeEventListener('keydown', onKey, true);
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  const save = async (): Promise<void> => {
    const b = await cardBlob(canvas);
    if (!b) {
      note.textContent = 'Could not make the picture. Try again.';
      return;
    }
    const a = document.createElement('a');
    const href = URL.createObjectURL(b);
    a.href = href;
    a.download = 'paw-legends-moment.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    note.textContent = 'Saved.';
    o.track?.('share_card', { via: 'save' });
  };
  const share = async (): Promise<void> => {
    const b = await cardBlob(canvas);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const file = b && typeof File !== 'undefined' ? new File([b], 'paw-legends-moment.png', { type: 'image/png' }) : null;
    const data: ShareData = file ? { files: [file], text, url } : { text, url };
    try {
      if (file && typeof nav.share === 'function' && nav.canShare?.(data)) {
        await nav.share(data);
        o.track?.('share_card', { via: 'share' });
        return;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
    }
    // no picture sharing here: save the picture and send the link the usual way
    await save();
    o.onLink(url, text);
    note.textContent = 'Picture saved and link copied: paste it with the picture.';
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-s]')?.dataset.s;
    if (a === 'close' || t === root) close();
    else if (a === 'save') void save();
    else if (a === 'share') void share();
    else if (a === 'link') {
      o.onLink(url, text);
      note.textContent = 'Link copied.';
      o.track?.('share_card', { via: 'link' });
    }
  });
  o.track?.('share_card_open', { won: o.data.won, best: !!o.data.best });
  root.querySelector<HTMLElement>('[data-s="share"]')?.focus({ preventScroll: true });
  return root;
}
