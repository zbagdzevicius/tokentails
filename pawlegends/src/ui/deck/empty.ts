/**
 * The drawer with no owned cards (a guest, or an account with no cats yet). Never invents a card: it shows the four
 * shelter champions' real card art (the host's `champions` message) as postcards, and one line on how cards arrive.
 *
 * The call to action, by context (lobby spec §2; no buy or donate button anywhere in the game):
 * - embedded guest (web): "Sign in" (the existing `request-sign-in{reason:'save-progress'}`);
 * - standalone web page: a plain link to tokentails.com (new tab);
 * - signed in with no cats, or any app build: text only.
 */
import { esc, cssUrl } from './deckCard';

export interface EmptyCtx {
  signedIn: boolean;
  isApp: boolean;
  /** Inside the Token Tails host (the bridge is live). */
  embed: boolean;
}

export interface Postcard {
  name: string;
  art?: string;
}

export const TT_URL = 'https://tokentails.com';

/** What the empty card offers: a sign-in button, a link, or nothing. Pure. */
export function emptyAction(c: EmptyCtx): 'sign-in' | 'link' | 'none' {
  if (c.isApp) return 'none';
  if (c.embed) return c.signedIn ? 'none' : 'sign-in';
  return 'link';
}

/** The empty-state card (a div in the card row; its button or link is the focus target). */
export function emptyCard(c: EmptyCtx): string {
  const act = emptyAction(c);
  const lead = 'Your Token Tails cats become skins for every champion.';
  // QA (anti-steering, App Store 3.1.1 / 3.1.3): an app build never points players to the web to collect cats
  const how = c.isApp ? 'Your Token Tails cats show up here.' : c.signedIn ? 'Cats you adopt or redeem on Token Tails show up here.' : act === 'sign-in' ? 'Sign in to bring your cats.' : 'Collect cards on Token Tails.';
  const cta =
    act === 'sign-in'
      ? '<button type="button" class="pl-btn small dk-cta" data-a="deck-sign-in" tabindex="-1">Sign in</button>'
      : act === 'link'
        ? `<a class="pl-btn small dk-cta" href="${TT_URL}" target="_blank" rel="noopener" tabindex="-1">Visit Token Tails</a>`
        : '';
  return `<div class="dk-slot dk-empty-slot" role="listitem"><div class="dk-empty"><span class="dk-empty-ico" aria-hidden="true"></span><b>${esc(lead)}</b><small>${esc(how)}</small>${cta}</div></div>`;
}

/** The shelter champions as postcards (decorative: real card art, nothing to wear). */
export function postcards(list: readonly Postcard[]): string {
  const cards = list
    .filter((p) => cssUrl(p.art))
    .slice(0, 4)
    .map((p, i) => `<figure class="dk-postcard" style="--i:${i}"><img src="${esc(p.art as string)}" alt="${esc(`${p.name}'s card`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"><figcaption>${esc(p.name)}</figcaption></figure>`)
    .join('');
  return cards ? `<div class="dk-postcards" aria-label="Shelter champions on Token Tails">${cards}</div>` : '';
}
