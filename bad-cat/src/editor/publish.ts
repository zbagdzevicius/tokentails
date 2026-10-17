/**
 * Room Maker publish (GDD 6.4, 6.6, 6.7): filtered title and author, remix ancestors, the room code (codec v2) and
 * link, and the 1200 x 630 room card. Nothing is uploaded: the room lives in the link.
 */
import { propKind, type CodecApi, type PlayableRoom, type RenderApi, type RoomDef, type ShellDef } from '../types';
import { kindIcon } from './palette';

export const TITLE_MAX = 24;
export const AUTHOR_MAX = 12;
export const ANCESTORS_MAX = 3;
export const UNTITLED = 'Untitled Room';
export const ANON = 'A Cat';
export const CARD_W = 1200;
export const CARD_H = 630;
export const SPEED_BUILD_MS = 90_000;
export const CARD_TAGLINE = 'Can your cat wreck it?';

/** Room title through the 6.7 filter; blocked or empty -> "Untitled Room". */
export function cleanTitle(codec: Pick<CodecApi, 'filterName'>, raw: string): string {
  return codec.filterName(raw ?? '', TITLE_MAX) || UNTITLED;
}

/** Author name through the 6.7 filter; blocked or empty -> "A Cat". */
export function cleanAuthor(codec: Pick<CodecApi, 'filterName'>, raw: string): string {
  return codec.filterName(raw ?? '', AUTHOR_MAX) || ANON;
}

/**
 * Ancestors of a remix of `src`: up to 3 author names, newest first (the remixed room's author, then its own
 * ancestors). Empty names drop out.
 */
export function remixAncestors(src: Pick<RoomDef, 'author' | 'ancestors'>): string[] {
  const out: string[] = [];
  for (const a of [src.author, ...(src.ancestors ?? [])]) {
    const n = (a ?? '').trim();
    if (n && out.length < ANCESTORS_MAX) out.push(n);
  }
  return out;
}

/**
 * "Remix of Zyg's Kitchen" (newest ancestor first), '' for an original. The remixer is credited by the title line
 * ("“Mia Kitchen” by Mochi"); review round 1: a trailing "by Mochi" here read as if Mochi built the original.
 */
export function remixLine(room: Pick<RoomDef, 'author' | 'ancestors'>, shellName: string): string {
  const from = room.ancestors?.[0];
  if (!from) return '';
  return `Remix of ${from}'s ${shellName}`;
}

/** Build clock text: m:ss ("1:27"). Negative or bad input reads 0:00. */
export function formatBuildTime(ms: number): string {
  const s = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Speed build countdown (90 s): the time left as m:ss, or "+m:ss" in overtime. */
export function speedClock(elapsedMs: number, limitMs = SPEED_BUILD_MS): { text: string; over: boolean } {
  const left = limitMs - elapsedMs;
  return left >= 0 ? { text: formatBuildTime(left + 999), over: false } : { text: `+${formatBuildTime(-left)}`, over: true };
}

/** Badge on the card: "built in 1:27" (speed build only, within 90 s). */
export function speedBadge(buildMs: number | undefined, speedBuild: boolean): string {
  if (!speedBuild || buildMs === undefined || buildMs > SPEED_BUILD_MS) return '';
  return `built in ${formatBuildTime(buildMs)}`;
}

export interface Published {
  room: RoomDef;
  code: string;
  link: string;
}

/**
 * The room as receivers decode it: title and author filtered, ancestors capped, encoded (v2) and decoded back so
 * the id (`ugc-<crc>`) and seed match what a link opens. Falls back to the draft when the codec has no room codec.
 */
export function finalizeRoom(draft: RoomDef, codec: CodecApi, title: string, author: string, ancestors?: string[]): { room: RoomDef; code: string } {
  const room: RoomDef = { ...draft, title: cleanTitle(codec, title), author: cleanAuthor(codec, author) };
  const anc = (ancestors ?? []).map((a) => codec.filterName(a, AUTHOR_MAX)).filter(Boolean).slice(0, ANCESTORS_MAX);
  if (anc.length) room.ancestors = anc;
  else delete room.ancestors;
  if (!codec.encodeRoom) return { room, code: '' };
  const code = codec.encodeRoom(room);
  const back = codec.decodeRoom?.(code) ?? null;
  return { room: back ?? room, code };
}

// ---------------------------------------------------------------------------------------------
// Room card (1200 x 630)
// ---------------------------------------------------------------------------------------------

export interface CardInfo {
  title: string;
  author: string;
  remix: string;
  badge: string;
  shellName: string;
}

function hex(c: number | undefined, fallback: string): string {
  return c === undefined ? fallback : `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Flat illustration of the room: the heightmap in tones of the shell's colours, a prop icon per prop, gold rings. */
export function drawFlatRoom(g: CanvasRenderingContext2D, room: RoomDef, shell: ShellDef, box: { x: number; y: number; w: number; h: number }): void {
  const W = shell.width;
  const D = shell.depth;
  const cs = Math.floor(Math.min(box.w / W, box.h / D));
  const ox = box.x + Math.floor((box.w - cs * W) / 2);
  const oy = box.y + Math.floor((box.h - cs * D) / 2);
  const floor = hex(shell.floorColor, '#e9d6b9');
  const tones = [floor, '#c99c76', '#a9744f', '#7c4f37'];
  g.fillStyle = hex(shell.wallColor, '#f4e3c9');
  g.fillRect(ox - 10, oy - 10, cs * W + 20, cs * D + 20);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const lv = shell.levels[z * W + x];
      g.fillStyle = tones[lv] ?? floor;
      g.fillRect(ox + x * cs + 1, oy + z * cs + 1, cs - 2, cs - 2);
    }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.floor(cs * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  for (const p of room.props) {
    const cx = ox + p.x * cs + cs / 2;
    const cy = oy + p.z * cs + cs / 2;
    if (propKind(p.kind)?.pull === 'cloth') {
      g.fillStyle = 'rgba(226,91,91,0.55)';
      g.fillRect(ox + p.x * cs + 2, oy + p.z * cs + 2, (p.w ?? 1) * cs - 4, (p.d ?? 1) * cs - 4);
      continue;
    }
    if (p.target) {
      g.strokeStyle = '#ffd166';
      g.lineWidth = Math.max(3, cs * 0.1);
      g.beginPath();
      g.arc(cx, cy, cs * 0.48, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillText(kindIcon(p.kind), cx, cy + 1);
  }
  g.fillText('🧍', ox + shell.humanSpot.x * cs + cs / 2, oy + shell.humanSpot.z * cs + cs / 2);
  g.fillText('🐈', ox + room.spawn.x * cs + cs / 2, oy + room.spawn.z * cs + cs / 2);
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800): void {
  let s = size;
  do {
    g.font = `${weight} ${s}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif`;
    if (g.measureText(text).width <= maxW) return;
    s -= 2;
  } while (s > 12);
}

/** Text panel and badges over the room image (left 46 % of the card). */
export function drawCardText(g: CanvasRenderingContext2D, info: CardInfo): void {
  const pw = Math.round(CARD_W * 0.44);
  const grad = g.createLinearGradient(0, 0, pw + 120, 0);
  grad.addColorStop(0, 'rgba(43,29,46,0.96)');
  grad.addColorStop(0.75, 'rgba(43,29,46,0.88)');
  grad.addColorStop(1, 'rgba(43,29,46,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, pw + 120, CARD_H);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffd27a';
  g.font = '800 30px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';
  g.fillText('🐾 BAD CAT DAILY · ROOM MAKER', 56, 88);
  g.fillStyle = '#fff3dc';
  fitText(g, info.title, pw - 40, 76);
  g.fillText(info.title, 56, 200);
  g.fillStyle = 'rgba(255,243,220,0.8)';
  fitText(g, `by ${info.author} · ${info.shellName}`, pw - 40, 36, 700);
  g.fillText(`by ${info.author} · ${info.shellName}`, 56, 256);
  if (info.remix) {
    g.fillStyle = '#9fd3ff';
    fitText(g, info.remix, pw - 40, 28, 700);
    g.fillText(info.remix, 56, 302);
  }
  g.fillStyle = '#ff6f91';
  g.beginPath();
  const by = 470;
  const bw = pw - 40;
  if (typeof g.roundRect === 'function') g.roundRect(48, by, bw, 92, 28);
  else g.rect(48, by, bw, 92);
  g.fill();
  g.fillStyle = '#2a1a22';
  fitText(g, CARD_TAGLINE, bw - 40, 44);
  g.fillText(CARD_TAGLINE, 70, by + 60);
  if (info.badge) {
    g.save();
    g.translate(CARD_W - 150, 110);
    g.rotate(-0.12);
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(0, 0, 104, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1a22';
    g.textAlign = 'center';
    fitText(g, 'SPEED BUILD', 150, 24);
    g.fillText('SPEED BUILD', 0, -18);
    fitText(g, info.badge, 170, 30);
    g.fillText(info.badge, 0, 22);
    g.restore();
  }
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/**
 * The 1200 x 630 room card: the renderer's room still when it has one, else the flat illustration; then the title,
 * author, remix line, tagline and the speed badge. null without a 2D canvas (Node, very old browsers). Never throws.
 */
export async function makeRoomCard(play: PlayableRoom, info: CardInfo, render?: Pick<RenderApi, 'renderRoomStill'>): Promise<Blob | null> {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = CARD_W;
    c.height = CARD_H;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#2b1d2e';
    g.fillRect(0, 0, CARD_W, CARD_H);
    let drew = false;
    if (render?.renderRoomStill && typeof createImageBitmap !== 'undefined') {
      try {
        const still = await render.renderRoomStill(play, { w: CARD_W, h: CARD_H });
        if (still) {
          const bmp = await createImageBitmap(still);
          g.drawImage(bmp, 0, 0, CARD_W, CARD_H);
          bmp.close?.();
          drew = true;
        }
      } catch {
        drew = false;
      }
    }
    if (!drew) drawFlatRoom(g, play.room, play.shell, { x: Math.round(CARD_W * 0.44), y: 40, w: Math.round(CARD_W * 0.54), h: CARD_H - 80 });
    drawCardText(g, info);
    return await canvasBlob(c);
  } catch {
    return null;
  }
}

/** Admin export: the RoomDef as content JSON (GDD 13.7 content pipeline), pretty-printed. */
export function exportJson(room: RoomDef, id = 'maker-export'): string {
  const out: RoomDef = { ...room, id, props: room.props.map((p) => ({ ...p })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}
