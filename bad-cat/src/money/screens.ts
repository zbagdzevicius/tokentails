/**
 * Money screens (DOM, no framework): Club sheet, Thanks, Redeem, Restore, Cameo flow, Gift flow, Shop, Brand
 * page and the small paywall Offer card. Portrait first, 44 px targets, warm and honest copy: renewal terms are
 * always stated, cancel is two taps in the Stripe portal, nothing is pre-ticked, nothing blocks play.
 * Offline (no API URL, the server unreachable, or checkout not ready) every mount shows a polite "Coming soon" card.
 * Every mount returns an unmount function and never throws.
 */
import './money.css';
import {
  BADCAT_SKUS,
  FOUNDING_CAP,
  type BadcatServerStatus,
  type BadcatSku,
  type BrandProps,
  type CameoFlowProps,
  type CatSpec,
  type CheckoutCompletion,
  type ClubSheetProps,
  type GiftFlowProps,
  type OfferCardProps,
  type RedeemProps,
  type RestoreProps,
  type ShopProps,
  type ThanksProps,
  type Unmount,
} from '../types';
import { btn, copyText, h, toast } from '../ui/dom';
import { encodeCat } from '../codec';
import { ownsCosmetic } from '../platform/entitlements';
import { COSMETICS } from '../types';
import { priceLabel, type MoneyCore } from './core';

// ----- local prop adapters (change requests filed in FULL-PLAN.md) -----
export type RedeemPropsX = RedeemProps & { todayNo?: number; dayLabel?(dayNo: number): string };
export type OfferCardPropsX = OfferCardProps & { onSecondary?(sku: BadcatSku): void };
export type ThanksPropsX = ThanksProps & { dayLabel?(dayNo: number): string };

/** Day #1 (2026-11-16) is a Monday: weekday 0 = Mon .. 4 = Fri, 5 = Sat. */
export function weekdayOf(dayNo: number): number {
  return ((((Math.trunc(dayNo) - 1) % 7) + 7) % 7);
}
export function isFriday(dayNo: number): boolean {
  return weekdayOf(dayNo) === 4;
}
export function upcomingDays(todayNo: number, n = 14, fridaysOnly = false): number[] {
  const out: number[] = [];
  for (let d = Math.trunc(todayNo) + 1; d <= Math.trunc(todayNo) + n; d++) if (!fridaysOnly || isFriday(d)) out.push(d);
  return out;
}

const ERRORS: Record<string, string> = {
  offline: 'This needs a connection. Your game is safe; try again in a moment.',
  network: 'We could not reach the server. Check the connection and try again.',
  unavailable: 'This is not open yet. Coming soon!',
  email: 'That email does not look right.',
  code: 'That code does not look right.',
  server: 'Something went wrong on our side. Nothing was charged. Try again in a moment.',
  pending: 'Stripe is still confirming. Give it a minute, then use Restore purchases.',
  no_purchase: 'No purchase found on this browser yet. Use Restore purchases with your receipt email.',
  unknown_code: 'We could not find that gift code. Check it and try again.',
  already_redeemed: 'This gift code was already redeemed.',
  refunded: 'This gift was refunded, so the code no longer works.',
};
export function errorText(code?: string): string {
  return (code && ERRORS[code]) || ERRORS.server;
}

function root(host: HTMLElement, kind: string, cls = 'bc-screen bm-screen'): { el: HTMLElement; unmount: Unmount; alive(): boolean } {
  const el = h('div', { class: cls, 'data-bm-screen': kind });
  let alive = true;
  try {
    host.appendChild(el);
  } catch {
    /* host gone */
  }
  return {
    el,
    alive: () => alive,
    unmount: () => {
      alive = false;
      try {
        el.remove();
      } catch {
        /* ignore */
      }
    },
  };
}

function fill(el: HTMLElement, ...children: (Node | null | undefined | false)[]): void {
  el.replaceChildren(...children.filter((c): c is Node => !!c));
}

function header(title: string, onClose: () => void, closeLabel = 'Close'): HTMLElement {
  return h('div', { class: 'bc-head bm-head' }, h('h2', {}, title), tag(btn(closeLabel, onClose, 'bc-link bm-close'), 'close'));
}
function tag(b: HTMLElement, id: string): HTMLElement {
  b.setAttribute('data-bm', id);
  return b;
}

function comingSoon(el: HTMLElement, title: string, onClose: () => void): void {
  el.replaceChildren(
    header(title, onClose),
    h(
      'div',
      { class: 'bc-card bm-soon', 'data-bm': 'coming-soon' },
      h('div', { class: 'bm-soon-cat', 'aria-hidden': 'true' }, '\u{1F408}‍⬛'),
      h('h3', {}, 'Coming soon'),
      h('p', { class: 'bc-muted' }, 'The cat is still knocking this one off the shelf. Every room stays free to play in the meantime.'),
      tag(btn('Back to the chaos', onClose, 'bc-cta bc-cta-soft'), 'soon-close'),
    ),
  );
}

function input(attrs: Record<string, string>, id: string): HTMLInputElement {
  const i = h('input', { class: 'bm-input', ...attrs });
  i.setAttribute('data-bm', id);
  return i;
}
function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'bm-field' }, h('span', { class: 'bm-label' }, label), control, hint ? h('span', { class: 'bm-hint' }, hint) : null);
}
function note(text: string, cls = 'bm-note'): HTMLElement {
  return h('p', { class: cls }, text);
}

/** Segmented choice (radio semantics, aria-pressed buttons). */
function choice<T extends string | number>(
  label: string,
  options: { value: T; text: string; sub?: string }[],
  initial: T | null,
  onPick: (v: T) => void,
  id: string,
): { el: HTMLElement; value(): T | null } {
  let cur: T | null = initial;
  const wrap = h('div', { class: 'bm-choice', role: 'radiogroup', 'aria-label': label, 'data-bm': id });
  const buttons: HTMLButtonElement[] = [];
  const paint = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === cur)));
  options.forEach((o) => {
    const b = h('button', { type: 'button', class: 'bm-opt', role: 'radio', 'data-value': String(o.value) }, h('span', { class: 'bm-opt-main' }, o.text), o.sub ? h('span', { class: 'bm-opt-sub' }, o.sub) : null);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      cur = o.value;
      paint();
      onPick(o.value);
    });
    buttons.push(b);
    wrap.appendChild(b);
  });
  paint();
  return { el: wrap, value: () => cur };
}

/** Runs an async CTA with a busy state; shows the error line on failure. */
async function busy(b: HTMLButtonElement, errLine: HTMLElement, run: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> {
  if (b.disabled) return false;
  const label = b.textContent ?? '';
  b.disabled = true;
  b.classList.add('is-busy');
  b.textContent = 'One moment…';
  errLine.textContent = '';
  let ok = false;
  try {
    const r = await run();
    ok = r.ok;
    if (!r.ok) errLine.textContent = errorText(r.error);
  } catch {
    errLine.textContent = errorText('server');
  }
  b.disabled = false;
  b.classList.remove('is-busy');
  b.textContent = label;
  return ok;
}
const errorLine = (): HTMLElement => h('p', { class: 'bm-error', role: 'alert', 'aria-live': 'polite', 'data-bm': 'error' });

function catLabel(c: CatSpec | undefined | null): string {
  const n = (c?.name || '').trim();
  return n ? n.slice(0, 12) : 'your cat';
}
function dayText(dayNo: number, label?: (d: number) => string): string {
  try {
    return label ? label(dayNo) : `Day #${dayNo}`;
  } catch {
    return `Day #${dayNo}`;
  }
}
function testModeNote(st: BadcatServerStatus | null): HTMLElement | null {
  return st?.testMode ? note('Test mode: Stripe test checkout, no real charge.', 'bm-note bm-test') : null;
}

// =============================================================================================
// Club sheet
// =============================================================================================

export const CLUB_PERKS: readonly string[] = [
  'A weekly cameo in other players’ rooms, with a seen counter',
  'A daily place on the fridge wall',
  'Named in the weekly Most Wanted credit',
  'A face decal on every one of your cats',
  'Club collar, 4 clip caption styles and an animated Rap Sheet card, all visible in clips',
  'Every past room plus the boss-room replay pack',
  'All 30 season tiers',
  '3 Nine Lives (streak freezes) a week',
  'Streamer layout with a dare QR code',
];

type ClubPlan = 'club_monthly' | 'club_annual' | 'founding';
export function renewalTerms(plan: ClubPlan): string {
  if (plan === 'club_monthly') return '$4.99 a month. Renews every month until you cancel. Cancel anytime in Settings → Manage Club; Club stays on until the paid month ends.';
  if (plan === 'club_annual') return '$39.99 a year. Renews every year until you cancel. Cancel anytime in Settings → Manage Club; Club stays on until the paid year ends.';
  return '$24.99 for the first year, then renews at $39.99 a year unless you cancel. Cancel anytime in Settings → Manage Club.';
}

export function mountClub(core: MoneyCore, host: HTMLElement, p: ClubSheetProps & { sku?: BadcatSku }): Unmount {
  const r = root(host, 'club');
  try {
    const close = () => p.onClose();
    if (!core.online || !p.status?.checkout) {
      comingSoon(r.el, 'Chaos Club', close);
      return r.unmount;
    }
    const name = (p.catName || '').trim().slice(0, 12) || 'your cat';
    if (p.entitlements?.club) {
      const err = errorLine();
      const manage = tag(
        btn('Manage or cancel', () => {
          void busy(manage as HTMLButtonElement, err, async () => {
            const res = await core.portal();
            if (res.url) core.navigate(res.url);
            return { ok: !!res.url, error: res.error };
          });
        }, 'bc-cta bc-cta-soft'),
        'portal',
      );
      fill(r.el, 
        header('Chaos Club', close),
        h('div', { class: 'bc-card bm-club-in' }, h('h3', {}, `${name} is in the Club \u{1F43E}`), note('Thank you. 10% of net goes to Pink Paw every month.'), manage, err),
      );
      return r.unmount;
    }
    const founding = (p.status.foundingLeft ?? 0) > 0;
    const pre: ClubPlan = p.sku === 'club_annual' || p.sku === 'founding' ? (p.sku === 'founding' && !founding ? 'club_annual' : p.sku) : 'club_monthly';
    let plan: ClubPlan = pre;
    const terms = note(renewalTerms(plan), 'bm-terms');
    const cta = tag(btn('', () => void go(), 'bc-cta bc-cta-big bc-cta-gold'), 'checkout') as HTMLButtonElement;
    const ctaLabel = () => (plan === 'club_monthly' ? 'Join Club, $4.99/mo' : plan === 'club_annual' ? 'Join Club, $39.99/yr' : 'Join as a Founding Bad Cat, $24.99');
    cta.textContent = ctaLabel();
    const opts: { value: ClubPlan; text: string; sub?: string }[] = [
      { value: 'club_monthly', text: '$4.99/mo', sub: 'Monthly' },
      { value: 'club_annual', text: '$39.99/yr', sub: '$3.33/mo, save 33%' },
    ];
    if (founding) opts.push({ value: 'founding', text: '$24.99', sub: 'Founding, first year' });
    const toggle = choice<ClubPlan>('Plan', opts, plan, (v) => {
      plan = v;
      terms.textContent = renewalTerms(v);
      cta.textContent = ctaLabel();
    }, 'plan');
    const email = input({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com (optional)' }, 'email');
    const err = errorLine();
    async function go(): Promise<void> {
      await busy(cta, err, () => core.checkout({ sku: plan, email: email.value.trim() || undefined, catName: p.catName || undefined, meta: { trigger: p.trigger, from_in_app: core.fromInApp } }));
    }
    const children: (HTMLElement | null)[] = [
      header('Chaos Club', close, 'Not now'),
      founding
        ? h('div', { class: 'bm-badge', 'data-bm': 'founding' }, `Founding Bad Cat: ${Math.min(FOUNDING_CAP, Math.max(0, p.status.foundingLeft ?? 0))} of ${FOUNDING_CAP} places left`)
        : null,
      h('p', { class: 'bm-line1' }, 'Your cat, featured: in other players’ rooms every week.'),
      h('p', { class: 'bm-line2' }, 'Keep all your cats: up to 5.'),
      h('ul', { class: 'bm-perks' }, ...CLUB_PERKS.map((t) => h('li', {}, t))),
      toggle.el,
      terms,
      field('Receipt email', email, 'Stripe always asks for one; it is how you restore Club in another browser.'),
      cta,
      err,
    ];
    if (p.inApp && core.env.isIOS) {
      const steps = h('ol', { class: 'bm-steps', hidden: true, 'data-bm': 'safari-steps' }, h('li', {}, 'Tap ••• at the top right'), h('li', {}, 'Choose “Open in browser”'), h('li', {}, 'Paste the link if Safari opens on the home page'));
      const apple = tag(
        btn('Pay with Apple Pay in Safari', () => {
          void copyText(core.safariPayLink(plan)).then((ok) => {
            steps.hidden = false;
            core.track('bc_inapp_handoff', { step: 'link_copied', purpose: 'pay' });
            toast(r.el, ok ? 'Link copied' : 'Open this page in Safari');
          });
        }, 'bc-cta bc-cta-soft'),
        'safari',
      );
      children.push(apple, steps);
    }
    children.push(
      note('Looks and spotlight only: every cat plays the same, and the watermark stays. 10% of net goes to Pink Paw.'),
      testModeNote(p.status),
    );
    fill(r.el, ...children);
  } catch {
    comingSoon(r.el, 'Chaos Club', () => p.onClose());
  }
  return r.unmount;
}

// =============================================================================================
// Thanks (Stripe return page)
// =============================================================================================

export function mountThanks(core: MoneyCore, host: HTMLElement, p: ThanksPropsX): Unmount {
  const r = root(host, 'thanks');
  const name = catLabel(p.cat);
  if (!core.online) {
    comingSoon(r.el, 'Thank you', () => p.onDone({ ok: false, error: 'offline' }));
    return r.unmount;
  }
  fill(r.el, 
    h('div', { class: 'bc-card bm-pending', 'data-bm': 'pending', 'aria-busy': 'true' }, h('div', { class: 'bm-spinner', 'aria-hidden': 'true' }), h('h3', {}, 'Confirming with Stripe…'), note(`${name} is pacing by the door. This takes a few seconds.`)),
  );
  void core.completeCheckout(p.sessionId).then((c) => {
    if (r.alive()) renderThanks(core, r.el, p, c, name);
  });
  return r.unmount;
}

function renderThanks(core: MoneyCore, el: HTMLElement, p: ThanksPropsX, c: CheckoutCompletion, name: string): void {
  const done = tag(btn('Back to the chaos', () => p.onDone(c), 'bc-cta'), 'done');
  if (!c.ok) {
    el.replaceChildren(h('div', { class: 'bc-card', 'data-bm': 'thanks-error' }, h('h3', {}, c.pending ? 'Almost there' : 'Hmm'), note(errorText(c.error ?? (c.pending ? 'pending' : 'server'))), done));
    return;
  }
  const parts: (HTMLElement | null)[] = [];
  const sku = c.sku;
  if (c.gift?.code) {
    const link = `${core.returnBase()}/redeem?code=${encodeURIComponent(c.gift.code)}`;
    const linkBox = h('input', { class: 'bm-input bm-link', readonly: true, value: link, 'aria-label': 'Gift link', 'data-bm': 'gift-link' });
    const copy = tag(btn('Copy gift link', () => void copyText(link).then((ok) => toast(el, ok ? 'Copied' : 'Long-press the link to copy')), 'bc-cta'), 'copy-gift');
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    const share =
      nav && typeof nav.share === 'function'
        ? tag(btn('Share', () => void nav.share({ title: 'A Bad Cat gift', text: 'A gift for your cat: redeem it here', url: link }).catch(() => undefined), 'bc-cta bc-cta-soft'), 'share-gift')
        : null;
    parts.push(
      h('h3', {}, 'Your gift is ready \u{1F381}'),
      note(c.gift.sku === 'gift_club_3m' ? 'Send this link: they pick their cat and get 3 months of Club. It never turns into a subscription without their own card.' : 'Send this link: they pick their cat, a photo and a day for the cameo.'),
      linkBox,
      copy,
      share,
    );
  } else if (sku === 'cameo' || sku === 'guest_star') {
    const day = typeof c.dayNo === 'number' ? dayText(c.dayNo, p.dayLabel) : 'the day you picked';
    parts.push(
      h('h3', {}, sku === 'guest_star' ? `${name} is a guest star on ${day} ⭐` : `${name} is in ${day} \u{1F43E}`),
      note(sku === 'guest_star' ? 'Players can pick your cat as their criminal next to the Pink Paw cat.' : 'Shown in at least 300 room loads. Post the cameo card so your friends can find her on the windowsill.'),
    );
    if (p.face && c.cameoId) {
      const err = errorLine();
      const up = tag(
        btn(`Add ${name}’s face (optional)`, () => {
          void busy(up as HTMLButtonElement, err, async () => {
            const blob = await p.face!();
            if (!blob) return { ok: true };
            const ok = await core.uploadFace(c.cameoId!, blob);
            if (ok) toast(el, 'Sent for a quick review');
            return ok ? { ok } : { ok, error: 'server' };
          });
        }, 'bc-cta bc-cta-soft'),
        'face',
      );
      parts.push(up, note('A person approves each face once. Until then the cameo shows your cat’s colours with the default face.'), err);
    }
    const err2 = errorLine();
    const club = tag(
      btn('Weekly cameo with Club, $4.99/mo', () => void busy(club as HTMLButtonElement, err2, () => core.checkout({ sku: 'club_monthly', catName: p.cat?.name, meta: { trigger: 'thanks', from_in_app: core.fromInApp } })), 'bc-link bm-upsell'),
      'club-upsell',
    );
    parts.push(club, err2);
  } else if (sku === 'collar_pinkpaw') {
    parts.push(h('h3', {}, 'Thank you \u{1F497}'), note(`${name}’s pink collar is on. 100% of net goes to Pink Paw; receipts are published monthly.`));
  } else if (sku === 'brand_shelf' || sku === 'sponsor_day' || sku === 'sponsor_week') {
    parts.push(h('h3', {}, 'Thank you!'), note('We place sponsored items by hand and reply to your receipt email within 2 business days. Every paid clip is labelled.'));
  } else if (sku && sku.startsWith('cosmetic_')) {
    parts.push(h('h3', {}, 'Looking sharp ✨'), note(`${name} can wear it now: open My Cat to put it on.`));
  } else {
    parts.push(
      h('h3', {}, `Welcome to the Chaos Club, ${name}! \u{1F43E}`),
      note('Your cat joins the weekly cameo pool and the fridge wall. Manage or cancel anytime in Settings.'),
    );
  }
  parts.push(done);
  el.replaceChildren(h('div', { class: 'bc-card bm-thanks', 'data-bm': 'thanks-ok' }, ...parts.filter((x): x is HTMLElement => !!x)));
}

// =============================================================================================
// Redeem
// =============================================================================================

export function mountRedeem(core: MoneyCore, host: HTMLElement, p: RedeemPropsX): Unmount {
  const r = root(host, 'redeem');
  if (!core.online) {
    comingSoon(r.el, 'Redeem a gift', () => p.onDone(null));
    return r.unmount;
  }
  const code = input({ type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: p.code ?? '', placeholder: 'Gift code' }, 'code');
  const email = input({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' }, 'email');
  const cats = (p.cats ?? []).slice(0, 5);
  const catPick = cats.length > 1 ? choice<number>('Cat', cats.map((c, i) => ({ value: i, text: catLabel(c) })), 0, () => undefined, 'cat') : null;
  const days = typeof p.todayNo === 'number' ? upcomingDays(p.todayNo, 14) : [];
  const dayPick = days.length ? choice<number>('Day', days.map((d) => ({ value: d, text: dayText(d, p.dayLabel) })), null, () => undefined, 'day') : null;
  const err = errorLine();
  const cta = tag(
    btn('Redeem', () => {
      void busy(cta as HTMLButtonElement, err, async () => {
        const cat = cats[catPick?.value() ?? 0];
        const res = await core.redeem({
          code: code.value.trim(),
          email: email.value.trim(),
          catCode: cat ? encodeCat(cat) : undefined,
          catName: cat?.name || undefined,
          dayNo: dayPick?.value() ?? undefined,
        });
        if (res.ok) p.onDone(res.entitlements ?? core.entitlements());
        return res;
      });
    }, 'bc-cta bc-cta-big'),
    'redeem',
  ) as HTMLButtonElement;
  fill(r.el, 
    header('Redeem a gift', () => p.onDone(null)),
    note('Someone thinks your cat deserves the spotlight. \u{1F381}'),
    field('Gift code', code),
    field('Your email', email, 'Club gifts live on this email, so you can restore them in any browser.'),
    ...(catPick ? [field('Which cat?', catPick.el)] : []),
    ...(dayPick ? [field('Cameo day (cameo gifts)', dayPick.el, 'Leave empty and we pick the next free day.')] : []),
    cta,
    err,
  );
  return r.unmount;
}

// =============================================================================================
// Restore purchases
// =============================================================================================

export function mountRestore(core: MoneyCore, host: HTMLElement, p: RestoreProps): Unmount {
  const r = root(host, 'restore');
  if (!core.online) {
    comingSoon(r.el, 'Restore purchases', p.onBack);
    return r.unmount;
  }
  if (p.token) {
    fill(r.el, h('div', { class: 'bc-card bm-pending', 'data-bm': 'pending' }, h('div', { class: 'bm-spinner', 'aria-hidden': 'true' }), h('h3', {}, 'Restoring…')));
    void core.verifyRestore(p.token).then((e) => {
      if (!r.alive()) return;
      if (e) {
        fill(r.el, h('div', { class: 'bc-card', 'data-bm': 'restored' }, h('h3', {}, e.club ? 'Club restored \u{1F43E}' : 'Purchases restored'), tag(btn('Continue', () => p.onDone(e), 'bc-cta'), 'done')));
      } else {
        fill(r.el, 
          header('Restore purchases', p.onBack, 'Back'),
          h('div', { class: 'bc-card', 'data-bm': 'restore-failed' }, note('That link has expired or was already used. Ask for a new one below.'), tag(btn('Try again', () => { r.unmount(); mountRestore(core, host, { ...p, token: undefined }); }, 'bc-cta'), 'retry')),
        );
      }
    });
    return () => r.unmount();
  }
  const email = input({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'Receipt email' }, 'email');
  const err = errorLine();
  const out = h('div', { class: 'bm-out', 'aria-live': 'polite' });
  const cta = tag(
    btn('Send me a link', () => {
      void busy(cta as HTMLButtonElement, err, async () => {
        const res = await core.restore(email.value);
        if (res.ok) {
          out.replaceChildren(
            h('div', { class: 'bc-card', 'data-bm': 'inbox' }, h('h3', {}, 'Check your inbox \u{1F4EC}'), note('If that email bought anything, a sign-in link is on its way. It works in any browser.')),
          );
          if (res.devLink) out.appendChild(h('a', { class: 'bc-link bm-dev', href: res.devLink, 'data-bm': 'dev-link' }, 'Dev: open the restore link'));
        }
        return res;
      });
    }, 'bc-cta'),
    'restore',
  ) as HTMLButtonElement;
  fill(r.el, 
    header('Restore purchases', p.onBack, 'Back'),
    note('Bought Club, a collar or a cosmetic on another browser? Enter the email from your Stripe receipt.'),
    field('Email', email),
    cta,
    err,
    out,
  );
  return r.unmount;
}

// =============================================================================================
// Cameo / guest star
// =============================================================================================

export function mountCameo(core: MoneyCore, host: HTMLElement, p: CameoFlowProps): Unmount {
  const r = root(host, 'cameo');
  const title = p.guestStar ? 'Guest star' : 'Cameo';
  if (!core.online || !p.status?.checkout || !p.status?.cameos) {
    comingSoon(r.el, title, p.onClose);
    return r.unmount;
  }
  const name = catLabel(p.cat);
  const sku: BadcatSku = p.guestStar ? 'guest_star' : 'cameo';
  const days = upcomingDays(p.todayNo, 14, p.guestStar);
  let day: number | null = days[0] ?? null;
  const pick = choice<number>('Day', days.map((d) => ({ value: d, text: dayText(d, p.dayLabel) })), day, (v) => (day = v), 'day');
  const face = p.status.faceUploads ? (h('input', { type: 'checkbox', 'data-bm': 'face-opt-in' }) as HTMLInputElement) : null;
  const email = input({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com (optional)' }, 'email');
  const err = errorLine();
  const cta = tag(
    btn(`${p.guestStar ? 'Book the Friday' : 'Book the cameo'}, ${priceLabel(sku)}`, () => {
      if (day === null) return;
      void busy(cta as HTMLButtonElement, err, () =>
        core.checkout({ sku, catCode: encodeCat(p.cat), catName: p.cat.name || undefined, dayNo: day!, faceOptIn: face?.checked || undefined, email: email.value.trim() || undefined, meta: { trigger: 'cameo_flow', from_in_app: core.fromInApp } }),
      );
    }, 'bc-cta bc-cta-big bc-cta-gold'),
    'checkout',
  ) as HTMLButtonElement;
  if (day === null) cta.disabled = true;
  fill(r.el, 
    header(title, p.onClose),
    h('p', { class: 'bm-line1' }, p.guestStar ? `${name}, playable criminal for a Friday.` : `${name}, featured in someone else’s room.`),
    note(
      p.guestStar
        ? 'On your Friday, players can pick your cat next to the Pink Paw cat; the briefing card names both.'
        : 'Your cat sits on a windowsill or shelf in the room you pick, guaranteed in at least 300 room loads. On a quiet day the cameo stays in the pool until it gets there.',
    ),
    field(p.guestStar ? 'Pick a Friday' : 'Pick a day', pick.el),
    face ? h('label', { class: 'bc-toggle bm-face' }, face, `Add ${name}’s face photo after paying (a person approves it first)`) : null,
    field('Receipt email', email),
    cta,
    err,
    note('A one-off purchase, no subscription. Every cat still plays the same.'),
    testModeNote(p.status),
  );
  return r.unmount;
}

// =============================================================================================
// Gifts
// =============================================================================================

export function mountGift(core: MoneyCore, host: HTMLElement, p: GiftFlowProps): Unmount {
  const r = root(host, 'gift');
  if (!core.online || !p.status?.checkout || !p.status?.gifts) {
    comingSoon(r.el, 'Gift a cat owner', p.onClose);
    return r.unmount;
  }
  let sku: BadcatSku = 'gift_cameo';
  const pick = choice<BadcatSku>(
    'Gift',
    [
      { value: 'gift_cameo', text: 'A cameo, $4.99', sub: 'Their cat in a room of their choice' },
      { value: 'gift_club_3m', text: '3 months of Club, $14.99', sub: 'One-off, never auto-renews' },
    ],
    sku,
    (v) => (sku = v),
    'gift-sku',
  );
  const forName = input({ type: 'text', maxlength: '40', placeholder: 'Their name (optional)' }, 'gift-for');
  const email = input({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'Your email (optional)' }, 'email');
  const err = errorLine();
  const cta = tag(
    btn('Buy the gift', () => {
      void busy(cta as HTMLButtonElement, err, () => core.checkout({ sku, giftFor: forName.value.trim() || undefined, email: email.value.trim() || undefined, meta: { trigger: 'gift_flow', from_in_app: core.fromInApp } }));
    }, 'bc-cta bc-cta-big bc-cta-gold'),
    'checkout',
  ) as HTMLButtonElement;
  fill(r.el, 
    header('Gift a cat owner \u{1F381}', p.onClose),
    pick.el,
    field('For', forName),
    field('Receipt email', email),
    note('You get a redeem link to send. They pick their own cat, photo and day. A Club gift never turns into a subscription without their own card.'),
    cta,
    err,
    testModeNote(p.status),
  );
  return r.unmount;
}

// =============================================================================================
// Shop (3 launch items + bundle + Pink Paw collar)
// =============================================================================================

export const SHOP_SKUS: readonly BadcatSku[] = [
  'cosmetic_collar',
  'cosmetic_hat',
  'cosmetic_trail',
  'cosmetic_bundle',
  // Phase 2 full store
  'cosmetic_collar_spiked',
  'cosmetic_hat_wizard',
  'cosmetic_trail_bubbles',
  'cosmetic_stamp_neon',
  'cosmetic_bundle2',
  'collar_pinkpaw',
];
/** The items a bundle unlocks. */
export const BUNDLE_ITEMS: Readonly<Partial<Record<BadcatSku, readonly BadcatSku[]>>> = {
  cosmetic_bundle: ['cosmetic_collar', 'cosmetic_hat', 'cosmetic_trail'],
  cosmetic_bundle2: ['cosmetic_collar_spiked', 'cosmetic_hat_wizard', 'cosmetic_trail_bubbles'],
};

function ownsSku(p: ShopProps, sku: BadcatSku): boolean {
  const e = p.entitlements;
  if (!e) return false;
  if (e.skus?.includes(sku)) return true;
  const bundle = BUNDLE_ITEMS[sku];
  if (bundle) return bundle.every((s) => ownsSku(p, s));
  const def = COSMETICS.find((c) => c.sku === sku);
  return def ? ownsCosmetic(e, def.slot, def.id) : false;
}

export function mountShop(core: MoneyCore, host: HTMLElement, p: ShopProps): Unmount {
  const r = root(host, 'shop');
  if (!core.online || !p.status?.checkout) {
    comingSoon(r.el, 'Cat shop', p.onClose);
    return r.unmount;
  }
  const err = errorLine();
  const cards = SHOP_SKUS.map((sku) => {
    const def = BADCAT_SKUS[sku];
    const owned = ownsSku(p, sku);
    const charity = sku === 'collar_pinkpaw';
    const blurb =
      sku === 'cosmetic_bundle'
        ? 'Bandana, Tiny crown and Glitter trail together.'
        : sku === 'cosmetic_bundle2'
          ? 'Spiked collar, Wizard hat and Bubble trail together.'
          : sku === 'cosmetic_stamp_neon'
            ? 'Your Rap Sheet and result cards get a glowing neon stamp.'
            : charity
          ? 'A pink collar with a paw tag, in every clip. A donation, not a perk.'
          : 'Visible on your cat in the game, cards and clips.';
    const b = tag(
      btn(owned ? 'Owned' : priceLabel(sku), () => {
        void busy(b as HTMLButtonElement, err, () => core.checkout({ sku, meta: { trigger: 'shop', from_in_app: core.fromInApp } }));
      }, owned ? 'bc-cta bc-cta-soft' : 'bc-cta', owned),
      `buy-${sku}`,
    );
    return h(
      'div',
      { class: `bc-card bm-item${charity ? ' bm-charity' : ''}`, 'data-sku': sku },
      h('div', { class: 'bm-item-row' }, h('div', { class: 'bm-item-text' }, h('h3', {}, def.label), h('p', { class: 'bm-hint' }, blurb), charity ? h('span', { class: 'bm-pill', 'data-bm': 'pinkpaw-label' }, '100% to Pink Paw') : null), b),
    );
  });
  fill(r.el, header('Cat shop', p.onClose), note('Looks only: every cat plays the same. 10% of net goes to Pink Paw.'), ...cards, err, testModeNote(p.status));
  return r.unmount;
}

// =============================================================================================
// Brand Shelf / sponsor page
// =============================================================================================

export function mountBrand(core: MoneyCore, host: HTMLElement, p: BrandProps & { dayLabel?(d: number): string }): Unmount {
  const r = root(host, 'brand');
  if (!core.online || !p.status?.checkout || !p.status?.brand) {
    comingSoon(r.el, 'For brands', p.onClose);
    return r.unmount;
  }
  let sku: BadcatSku = 'brand_shelf';
  const days = upcomingDays(p.todayNo, 14);
  let day: number | null = null;
  const dayWrap = h('div', { class: 'bm-daywrap', hidden: true });
  const renderDays = () => {
    const list = sku === 'sponsor_week' ? days.filter((d) => weekdayOf(d) === 5) : days;
    day = list[0] ?? null;
    const c = choice<number>('Day', list.map((d) => ({ value: d, text: sku === 'sponsor_week' ? `Week of ${dayText(d, p.dayLabel)}` : dayText(d, p.dayLabel) })), day, (v) => (day = v), 'day');
    dayWrap.replaceChildren(field(sku === 'sponsor_week' ? 'Saturday boss room' : 'Day', c.el));
    dayWrap.hidden = sku === 'brand_shelf';
  };
  const pick = choice<BadcatSku>(
    'Package',
    [
      { value: 'brand_shelf', text: 'Brand Shelf, $199/mo', sub: '4 clips a month, 20,000 views floor' },
      { value: 'sponsor_day', text: 'Sponsor a day, $99', sub: 'Your product as a prop in one daily room' },
      { value: 'sponsor_week', text: 'Sponsor a week, $499', sub: 'A themed Saturday boss room' },
    ],
    sku,
    (v) => {
      sku = v;
      renderDays();
    },
    'brand-sku',
  );
  renderDays();
  const bname = input({ type: 'text', maxlength: '80', placeholder: 'Brand name', required: 'true' }, 'brand-name');
  const burl = input({ type: 'url', maxlength: '200', placeholder: 'https://… (optional)' }, 'brand-url');
  const bnote = h('textarea', { class: 'bm-input bm-textarea', maxlength: '1000', rows: '3', placeholder: 'The product, the vibe, anything we should know', 'data-bm': 'brand-note' }) as HTMLTextAreaElement;
  const email = input({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@brand.com' }, 'email');
  const err = errorLine();
  const cta = tag(
    btn('Continue to checkout', () => {
      if (!bname.value.trim()) {
        err.textContent = 'Add your brand name first.';
        return;
      }
      void busy(cta as HTMLButtonElement, err, () =>
        core.checkout({
          sku,
          email: email.value.trim() || undefined,
          dayNo: sku === 'brand_shelf' ? undefined : (day ?? undefined),
          brand: { name: bname.value.trim(), url: burl.value.trim() || undefined, note: bnote.value.trim() || undefined },
          meta: { trigger: 'brand', from_in_app: core.fromInApp },
        }),
      );
    }, 'bc-cta bc-cta-big'),
    'checkout',
  ) as HTMLButtonElement;
  fill(r.el, 
    header('Bad Cat for brands', p.onClose),
    note('Put your pet product where cats knock it over. Placement is done by hand; we reply within 2 business days.'),
    pick.el,
    dayWrap,
    field('Brand', bname),
    field('Website', burl),
    field('Brief', bnote),
    field('Contact email', email),
    note('Brand Shelf renews monthly at $199 until you cancel in the Stripe portal. Every paid clip is labelled (paid partnership, #ad), and at most 1 in 5 posts is paid.', 'bm-terms'),
    cta,
    err,
    testModeNote(p.status),
  );
  return r.unmount;
}

// =============================================================================================
// Offer card (paywall moment): small, dismissable, never blocking
// =============================================================================================

export function mountOfferCard(core: MoneyCore, host: HTMLElement, p: OfferCardPropsX): Unmount {
  const r = root(host, 'offer', 'bm-offer');
  r.el.setAttribute('role', 'region');
  r.el.setAttribute('aria-label', 'Offer');
  if (!core.online || !p.offer) {
    fill(r.el, h('p', { class: 'bm-offer-body', 'data-bm': 'coming-soon' }, 'Coming soon'), tag(btn('×', () => p.onDismiss(), 'bm-x'), 'dismiss'));
    return r.unmount;
  }
  core.markPaywallShown(p.offer);
  const o = p.offer;
  const x = tag(btn('×', () => p.onDismiss(), 'bm-x'), 'dismiss');
  x.setAttribute('aria-label', 'No thanks');
  fill(r.el, 
    x,
    h('p', { class: 'bm-offer-title' }, o.title),
    h('p', { class: 'bm-offer-body' }, o.body),
    h(
      'div',
      { class: 'bm-offer-row' },
      tag(btn(o.cta, () => p.onAccept(), 'bc-cta bm-offer-cta'), 'accept'),
      o.secondary
        ? tag(btn(o.secondary.label, () => (p.onSecondary ? p.onSecondary(o.secondary!.sku) : p.onAccept()), 'bc-link bm-offer-2'), 'secondary')
        : null,
    ),
  );
  return r.unmount;
}
