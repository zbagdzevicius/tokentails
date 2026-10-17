/**
 * L-UI: helpers for the countries leaderboard, the country chip and the HUD's Arc badge layout. The
 * pure parts (labels, summary, key) need no DOM; `flagImg` / `flagEmojiWorks` touch a canvas and fall
 * back quietly without one. The board data itself comes from the data lane (`orders.countries()`).
 */
import { countryName, drawFlag, flagEmoji, cleanCountry, type CountryBoard, type CountryRow, type FlagCtx } from '../data/countries';
import { plural } from './format';

export type SheetKind = 'add' | 'find' | 'share' | 'shots' | 'ads' | 'countries';

/**
 * From this width the Arc badge (with the logo) sits in the bottom-right corner above the hint
 * (arc/arc.css); below it, a text pill in the top-left stats block. The top band is where the hero
 * shot puts the moon-ring ad slots and the world's Token Tails logo, so the badge stays out of it.
 */
export const BADGE_ROW_MIN_WIDTH = 1180;

/** Rows the leaderboard lists before "+N more countries". */
export const BOARD_MAX_ROWS = 60;

/** True when another row shares this row's rank. */
export function isTied(rows: readonly Pick<CountryRow, 'rank'>[], i: number): boolean {
  const r = rows[i]?.rank;
  return r !== undefined && (rows[i - 1]?.rank === r || rows[i + 1]?.rank === r);
}

/**
 * "🥇" / "🥈" / "🥉" for a podium place one country holds alone, "=3" for a shared place (no row of
 * four bronze medals), "#4" after the podium.
 */
export const rankLabel = (rank: number, tied = false) =>
  tied ? `=${rank}` : rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

/**
 * "70 cats from 12 countries (rave buyers)": the leaderboard's summary line. It counts only cats bought
 * in the rave with a country, so it says so (the counter's "cats dancing" also counts payouts made
 * elsewhere, and the two numbers otherwise look contradictory).
 */
export function boardSummary(board: CountryBoard | null): string {
  if (!board || !board.countries) return 'No flags on the floor yet.';
  return `${board.demo ? 'DEMO · ' : ''}${plural(board.totalCats, 'cat', 'cats')} from ${plural(board.countries, 'country', 'countries')} (rave buyers)`;
}

/** The chip on the stats block: "12 countries", or "Countries" before any. */
export const chipLabel = (board: CountryBoard | null) => (board?.countries ? plural(board.countries, 'country', 'countries') : 'Countries');

/** Changes when anything the board shows changes (the open board re-renders only then). */
export const boardKey = (b: CountryBoard | null) => (b ? `${b.demo ? 'D' : ''}${b.countries}:${b.totalCats}:${b.unknownCats}:${b.rows.map((r) => `${r.code}${r.cats}`).join()}` : '');

/** "🇱🇹 Lithuania" for plain text (aria, share); '' for none. The card uses `flagImg` + the name. */
export const countryLabel = (code: string | null | undefined) => {
  const name = countryName(code);
  return name ? `${flagEmoji(code)} ${name}`.trim() : '';
};

let emojiOk: boolean | undefined;
/**
 * Whether this system draws flag emoji (Windows shows two letters instead). Checked once by painting
 * 🇱🇹 to a canvas and looking for colour. False without a canvas.
 */
export function flagEmojiWorks(): boolean {
  if (emojiOk !== undefined) return emojiOk;
  emojiOk = false;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return emojiOk;
    ctx.font = '20px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('\u{1F1F1}\u{1F1F9}', 0, 0);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && (Math.abs(d[i] - d[i + 1]) > 30 || Math.abs(d[i + 1] - d[i + 2]) > 30)) {
        emojiOk = true;
        break;
      }
    }
  } catch {
    emojiOk = false;
  }
  return emojiOk;
}

/** Emoji flag for option text where images cannot go (a native <select>): '' where it would show letters. */
export const optionFlag = (code: string | null | undefined) => (flagEmojiWorks() ? flagEmoji(code) : '');

const flagUrls = new Map<string, string>();
/**
 * A small flag image painted with the same `drawFlag` designs the crowd's flags use, so it looks the
 * same on every OS (unlike emoji on Windows). Decorative: alt is empty. Null for unknown codes or
 * without a canvas.
 */
export function flagImg(code: string | null | undefined, cls = 'rv-flag'): HTMLImageElement | null {
  const c = cleanCountry(code);
  if (!c || typeof document === 'undefined') return null;
  let url = flagUrls.get(c);
  if (!url) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      drawFlag(ctx as unknown as FlagCtx, c, 0, 0, 60, 40);
      url = canvas.toDataURL('image/png');
      if (!url.startsWith('data:image/png')) return null;
      flagUrls.set(c, url);
    } catch {
      return null;
    }
  }
  const img = document.createElement('img');
  img.className = cls;
  img.src = url;
  img.alt = '';
  img.width = 24;
  img.height = 16;
  img.decoding = 'async';
  return img;
}
