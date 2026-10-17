/**
 * "Post as..." templates (GDD 7.5): the six post formats plus the household variant. Each pre-fills a post caption
 * that carries the short URL and the one owned hashtag (#badcatdaily), never "link in bio", and picks the artifact.
 */
import type { FormatContext, FormatTemplate, ShareFormat } from '../types';
import { bareUrl, catName } from './card-text';
import { LINK_IN_BIO } from './clip/gates';
import { FORMAT_HOOKS, normalizeHandle } from './clip/format-plan';

export const HASHTAG = '#badcatdaily';

/** FormatContext plus the household partner's name (the UI knows it; types.ts does not carry it yet). */
export type FormatContextX = FormatContext & { secondName?: string };

/** Order in the share sheet: borrowed reach first (GDD 7.5), then the default POV clip. */
export const FORMAT_ORDER: readonly ShareFormat[] = ['pov', 'stitch', 'reply', 'irl_vs_game', 'roomba', 'carousel', 'still_waiting', 'household'];

function tags(...extra: string[]): string {
  return [HASHTAG, ...extra].join(' ');
}

/** Post caption per format (sound-off readable; URL + #badcatdaily in every one). */
export function formatCaption(format: ShareFormat, ctx: FormatContextX): string {
  const url = bareUrl(ctx.shortUrl);
  const cat = catName(ctx.cat);
  const handle = normalizeHandle(ctx.handle);
  const at = handle ? `@${handle}` : '@owner';
  switch (format) {
    case 'stitch':
      return `I put ${at}'s cat in my game 😼 Type ${url} to put yours in ${tags('#catsoftiktok', '#cattok')}`;
    case 'reply':
      return `Replying to ${handle ? `@${handle}` : '@you'}: I put ${cat} in the game 😼 Comment your cat's name and I'll do yours. ${url} ${tags('#catsoftiktok')}`;
    case 'irl_vs_game':
      return `My cat in real life vs. my cat in the game 😼 Make yours: ${url} ${tags('#catsofreddit', '#cattok')}`;
    case 'roomba':
      return `Framed the Roomba. Again. He never suspected a thing 🤖 ${url} ${tags()}`;
    case 'carousel':
      return `Rate how bad ${cat} is 1–10 😼 Your cat next? ${url} ${tags('#catsoftiktok')}`;
    case 'still_waiting': {
      const p = ctx.pinkPaw;
      const name = p?.name?.trim() || cat;
      if (p && !p.waiting) return `${name} went home. Her crimes stay in the game 🏠💛 ${url} ${tags('#adoptdontshop', '#pinkpaw')}`;
      const adopt = p?.adoptUrl ? ` Adopt her: ${bareUrl(p.adoptUrl)}` : '';
      return `${name} wrecked the ${ctx.play.shell.name} and is still waiting for a home 🏠${adopt} Play her room: ${url} ${tags('#adoptdontshop', '#pinkpaw')}`;
    }
    case 'household': {
      const b = ctx.secondName?.trim() || 'the other one';
      return `${cat} vs ${b}: who's worse? 😼 Settle it at ${url} ${tags('#catsoftiktok')}`;
    }
    case 'pov':
    default:
      return `${cat} chose violence 😼 ${url} ${tags('#catsoftiktok', '#cattok')}`;
  }
}

/** Share-sheet label (the template's title) per format. */
export function formatLabel(format: ShareFormat, ctx: FormatContextX): string {
  const cat = catName(ctx.cat);
  const handle = normalizeHandle(ctx.handle);
  switch (format) {
    case 'stitch':
      return FORMAT_HOOKS.stitch(handle || 'owner');
    case 'reply':
      return `Replying to @${handle || 'user'}: ${FORMAT_HOOKS.reply(cat)}`;
    case 'irl_vs_game':
      return FORMAT_HOOKS.irl();
    case 'roomba':
      return FORMAT_HOOKS.roomba();
    case 'carousel':
      return `Rate how bad ${cat} is 1–10`;
    case 'still_waiting': {
      const name = ctx.pinkPaw?.name?.trim() || cat;
      return ctx.pinkPaw && !ctx.pinkPaw.waiting ? `${name} went home` : `${name} is still waiting for a home`;
    }
    case 'household':
      return FORMAT_HOOKS.household(cat, ctx.secondName?.trim() || 'your other cat');
    case 'pov':
    default:
      return `POV: you left ${cat} alone for ${ctx.play.mode === 'ftue' ? 40 : 75} seconds`;
  }
}

function availability(format: ShareFormat, ctx: FormatContextX): { available: boolean; reason?: string } {
  switch (format) {
    case 'roomba':
      return ctx.run.framed > 0 ? { available: true } : { available: false, reason: 'Needs a Roomba crime' };
    case 'irl_vs_game':
      return ctx.hasPhoto === false ? { available: false, reason: 'Needs a photo of your cat' } : { available: true };
    case 'still_waiting':
      return ctx.pinkPaw ? { available: true } : { available: false, reason: 'Play a Pink Paw cat (Felony Friday)' };
    case 'household':
      return ctx.hasSecondCat ? { available: true } : { available: false, reason: ctx.club ? 'Play this room with your second cat' : 'Club: up to 5 cats' };
    default:
      return { available: true };
  }
}

const ARTIFACT: Record<ShareFormat, FormatTemplate['artifact']> = {
  pov: 'clip',
  stitch: 'reply_video',
  reply: 'reply_video',
  irl_vs_game: 'clip',
  roomba: 'clip',
  carousel: 'card',
  still_waiting: 'clip',
  household: 'clip',
};

/** Every template for this run, in share-sheet order (unavailable ones carry a reason). */
export function formats(ctx: FormatContextX): FormatTemplate[] {
  return FORMAT_ORDER.map((format) => {
    const a = availability(format, ctx);
    const caption = formatCaption(format, ctx);
    return {
      format,
      artifact: ARTIFACT[format],
      label: formatLabel(format, ctx),
      caption: LINK_IN_BIO.test(caption) ? caption.replace(LINK_IN_BIO, bareUrl(ctx.shortUrl)) : caption,
      needsHandle: format === 'stitch' || format === 'reply',
      available: a.available,
      ...(a.reason ? { reason: a.reason } : {}),
    };
  });
}
