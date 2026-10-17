/**
 * Paywall moments (GDD 9.1 #7, 9.2): small cards, never blocking. Pure decision; the UI calls
 * `markPaywallShown` when a card is actually displayed.
 *
 * Rules (in order):
 * - nothing without server checkout (BadcatServerStatus.checkout, online), in session 1, or after a card
 *   was already shown this session;
 * - Club members see nothing, except the S1 gift card;
 * - post_share / perfect_crime only after the share sheet was shared or dismissed; A/B: arm A offers on
 *   post_share, arm B on perfect_crime (50/50 by stable arm);
 * - S1 (Dec 1 – Jan 10) on alternate (even) sessions: the gift card replaces the Club/cameo card;
 * - catmaker_saved only from session 2 (implied by the session-1 rule);
 * - streak_break only when the streak breaks tonight and no freeze is left;
 * - archive_old: tap on an archive day older than the free window.
 */
import { BADCAT_SKUS, SEASONS, type PaywallContext, type PaywallOffer, type PaywallTrigger } from '../types';

/** Local adapter: `breaksTonight` is not in PaywallContext yet (change request filed). */
export type PaywallCtx = PaywallContext & { breaksTonight?: boolean };

export const PAYWALL_TRIGGERS: readonly PaywallTrigger[] = ['post_share', 'perfect_crime', 'catmaker_saved', 'streak_break', 'archive_old', 'gift_s1'];

const price = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** SEASONS id for a local date ('pre' before launch), null outside every season. */
export function seasonAt(now: Date): string | null {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
  const ymd = localYmd(now);
  for (const s of SEASONS) if (ymd >= s.start && ymd <= s.end) return s.id;
  return null;
}
export function inS1(now: Date): boolean {
  return seasonAt(now) === 's1';
}

function cleanName(n: string): string {
  const v = (n || '').trim();
  return v ? v.slice(0, 12) : 'your cat';
}
function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function giftOffer(ctx: PaywallCtx): PaywallOffer {
  return {
    trigger: 'gift_s1',
    offer: 'gift',
    sku: 'gift_cameo',
    title: 'Gift a cat owner',
    body: `A cameo ${price(BADCAT_SKUS.gift_cameo.cents)}, or 3 months of Club ${price(BADCAT_SKUS.gift_club_3m.cents)}. They pick their cat and day.`,
    cta: `Gift a cameo, ${price(BADCAT_SKUS.gift_cameo.cents)}`,
    secondary: { label: `Gift 3 months of Club, ${price(BADCAT_SKUS.gift_club_3m.cents)}`, sku: 'gift_club_3m' },
    abArm: ctx.abArm,
  };
}

/** Copy straight from GDD 9.2 with the cat's name and the next room's label. */
export function offerFor(trigger: PaywallTrigger, ctx: PaywallCtx): PaywallOffer {
  const name = cleanName(ctx.catName);
  const next = (ctx.nextDayLabel || 'tomorrow’s room').trim();
  const club = `${price(BADCAT_SKUS.club_monthly.cents)}/mo`;
  switch (trigger) {
    case 'post_share':
      return {
        trigger,
        offer: 'cameo',
        sku: 'cameo',
        title: 'Clip posted.',
        body: `Put ${name} in ${next} for everyone: ${price(BADCAT_SKUS.cameo.cents)}, or every week with Club.`,
        cta: `Cameo in ${next}, ${price(BADCAT_SKUS.cameo.cents)}`,
        secondary: { label: `Every week with Club, ${club}`, sku: 'club_monthly' },
        abArm: ctx.abArm,
      };
    case 'perfect_crime':
      return {
        trigger,
        offer: 'club',
        sku: 'club_monthly',
        title: 'PERFECT CRIME',
        body: `${cap(name)} belongs on the Most Wanted list. Join Club.`,
        cta: `Join Club, ${club}`,
        abArm: ctx.abArm,
      };
    case 'catmaker_saved':
      return {
        trigger,
        offer: 'club',
        sku: 'club_monthly',
        title: `${cap(name)} is saved`,
        body: 'Keep all your cats in Club: up to 5.',
        cta: `Join Club, ${club}`,
        abArm: ctx.abArm,
      };
    case 'streak_break': {
      const n = Math.max(1, Math.floor(ctx.streak ?? 1));
      return {
        trigger,
        offer: 'club',
        sku: 'club_monthly',
        title: 'Your streak breaks tonight',
        body: `Keep the ${n}-day streak: Club gives 3 Nine Lives a week.`,
        cta: `Join Club, ${club}`,
        abArm: ctx.abArm,
      };
    }
    case 'archive_old':
      return {
        trigger,
        offer: 'club',
        sku: 'club_monthly',
        title: 'Older rooms',
        body: 'The full archive and boss replays come with Club.',
        cta: `Join Club, ${club}`,
        abArm: ctx.abArm,
      };
    case 'gift_s1':
    default:
      return giftOffer(ctx);
  }
}

/**
 * The decision. `persistedShown` = a card was already recorded for this page session in the store
 * (markPaywallShown); it is OR-ed with ctx.shownThisSession.
 */
export function decidePaywall(ctx: PaywallCtx, persistedShown = false): PaywallOffer | null {
  try {
    if (!ctx || !PAYWALL_TRIGGERS.includes(ctx.trigger)) return null;
    if (!ctx.serverCheckout) return null;
    if (!(ctx.sessionIndex >= 2)) return null; // never in a player's first session
    if (ctx.shownThisSession || persistedShown) return null;
    const s1 = inS1(ctx.now);
    const alternate = ctx.sessionIndex % 2 === 0;
    const t = ctx.trigger;

    if (t === 'gift_s1') return s1 && ctx.afterShare ? giftOffer(ctx) : null;

    if (t === 'post_share' || t === 'perfect_crime') {
      if (!ctx.afterShare) return null; // never before the share sheet
      if (t === 'perfect_crime' && ctx.stamp !== undefined && ctx.stamp !== 'perfect') return null;
      const armTrigger: PaywallTrigger = ctx.abArm === 'B' ? 'perfect_crime' : 'post_share';
      if (t !== armTrigger) return null;
      if (s1 && alternate) return giftOffer(ctx); // gift replaces the Club card on alternate sessions
      if (ctx.club) return null;
      return offerFor(t, ctx);
    }

    if (ctx.club) return null;
    if (t === 'streak_break') {
      if (ctx.breaksTonight === false) return null;
      if (ctx.freezesLeft !== 0) return null;
      if (!((ctx.streak ?? 0) >= 2)) return null;
      return offerFor(t, ctx);
    }
    return offerFor(t, ctx); // catmaker_saved, archive_old
  } catch {
    return null;
  }
}
