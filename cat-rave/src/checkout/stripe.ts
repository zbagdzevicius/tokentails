/**
 * F-CHECKOUT: the Stripe Payment Element, lazy. `@stripe/stripe-js/pure` is imported only when a
 * buyer reaches the pay step, so no Stripe script loads at boot. Card, Apple Pay, Google Pay and Link
 * come from the PaymentIntent's automatic payment methods (server: allow_redirects 'never'), and
 * 3DS opens in Stripe's own in-page modal (`redirect: 'if_required'`). Nothing navigates away.
 */
import type { Appearance, Stripe, StripeElements, StripePaymentElement, StripePaymentElementChangeEvent } from '@stripe/stripe-js';

/** Dark neon in the rave palette (index.html --rave-*). */
export const RAVE_APPEARANCE: Appearance = Object.freeze({
  theme: 'night',
  variables: {
    colorPrimary: '#5dff8a',
    colorBackground: '#071d0e',
    colorText: '#eafff0',
    colorTextSecondary: 'rgba(234, 255, 240, 0.72)',
    colorTextPlaceholder: 'rgba(234, 255, 240, 0.4)',
    colorDanger: '#ff8fc4',
    colorSuccess: '#5dff8a',
    colorIcon: '#5dff8a',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: '16px',
    borderRadius: '14px',
    spacingUnit: '4px',
    focusBoxShadow: '0 0 0 3px rgba(93, 255, 138, 0.25)',
    focusOutline: 'none',
  },
  rules: {
    '.Input': { border: '1px solid rgba(93, 255, 138, 0.4)', backgroundColor: 'rgba(0, 0, 0, 0.35)', boxShadow: 'none' },
    '.Input:focus': { borderColor: '#5dff8a', boxShadow: '0 0 0 3px rgba(93, 255, 138, 0.22), 0 0 18px rgba(93, 255, 138, 0.25)' },
    '.Input--invalid': { borderColor: '#ff8fc4', boxShadow: '0 0 0 3px rgba(255, 95, 168, 0.18)' },
    '.Tab': { border: '1px solid rgba(93, 255, 138, 0.3)', backgroundColor: 'rgba(70, 255, 122, 0.06)', boxShadow: 'none' },
    '.Tab:hover': { borderColor: '#5dff8a', color: '#eafff0' },
    '.Tab--selected': { borderColor: '#ff5fa8', backgroundColor: 'rgba(255, 95, 168, 0.16)', boxShadow: '0 0 16px rgba(255, 95, 168, 0.35)' },
    '.Label': { color: 'rgba(234, 255, 240, 0.8)', fontWeight: '600' },
    '.Error': { color: '#ffb3d4' },
  },
}) as Appearance;

/** The same look keyed to the red light (Back on Track, SPEC.md 8.1): green accents become red. */
export function raveAppearance(light: 'green' | 'red'): Appearance {
  if (light === 'green') return RAVE_APPEARANCE;
  const json = JSON.stringify(RAVE_APPEARANCE)
    .replaceAll('#5dff8a', '#ff5d6a')
    .replaceAll('#eafff0', '#ffeef0')
    .replaceAll('#071d0e', '#1d070a')
    .replaceAll('93, 255, 138', '255, 93, 106')
    .replaceAll('70, 255, 122', '255, 70, 86')
    .replaceAll('234, 255, 240', '255, 238, 240');
  return JSON.parse(json) as Appearance;
}

/** The stage light now in force (main sets `data-light` on <html> on the swap bar). */
const currentLight = (): 'green' | 'red' => (typeof document !== 'undefined' && document.documentElement.dataset.light === 'red' ? 'red' : 'green');

const stripeByKey = new Map<string, Promise<Stripe | null>>();

/** Loads Stripe.js once per publishable key (the pure entry injects the script on first call). */
export function loadStripeLazy(publishableKey: string): Promise<Stripe | null> {
  let p = stripeByKey.get(publishableKey);
  if (!p) {
    p = import('@stripe/stripe-js/pure').then(({ loadStripe }) => loadStripe(publishableKey));
    p.catch(() => stripeByKey.delete(publishableKey));
    stripeByKey.set(publishableKey, p);
  }
  return p;
}

export type ConfirmOutcome =
  | { ok: true; status: 'succeeded' | 'processing'; paymentIntentId: string }
  | { ok: false; message: string; retry: boolean; declined?: boolean };

/** What to try next after a decline, so the message is never a dead end. */
export function declineNextStep(usdc: boolean): string {
  return usdc ? 'Try another card or Apple Pay / Google Pay, or switch to crypto (USDC on Arc).' : 'Try another card or Apple Pay / Google Pay.';
}

export interface MountedPayment {
  /** Confirms in place. Resolves after any 3DS challenge closes. */
  confirm(): Promise<ConfirmOutcome>;
  /** Moves keyboard focus into the Payment Element (after a decline). */
  focus(): void;
  destroy(): void;
}

export interface MountPaymentOptions {
  publishableKey: string;
  clientSecret: string;
  /** The Payment Element finished drawing (hide the skeleton). */
  onReady?: () => void;
  /** Whether the form is complete enough to pay (enables the Pay button). */
  onComplete?: (complete: boolean) => void;
  onLoadError?: (message: string) => void;
}

/** Mounts the Payment Element into `host`. Throws (with a buyer-facing message) if Stripe cannot load. */
export async function mountPaymentElement(host: HTMLElement, opts: MountPaymentOptions): Promise<MountedPayment> {
  const stripe = await loadStripeLazy(opts.publishableKey).catch(() => null);
  if (!stripe) throw new Error('Card payments could not load. Check your connection or turn off a blocker for js.stripe.com.');
  const elements: StripeElements = stripe.elements({ clientSecret: opts.clientSecret, appearance: raveAppearance(currentLight()), loader: 'auto' });
  const element: StripePaymentElement = elements.create('payment', {
    layout: { type: 'tabs', defaultCollapsed: false },
    wallets: { applePay: 'auto', googlePay: 'auto' },
    business: { name: 'Token Tails' },
  });
  element.on('ready', () => opts.onReady?.());
  element.on('change', (e: StripePaymentElementChangeEvent) => opts.onComplete?.(!!e.complete));
  element.on('loaderror', (e) => opts.onLoadError?.(e.error?.message || 'Card payments could not load.'));
  element.mount(host);
  let busy = false;
  return {
    async confirm() {
      if (busy) return { ok: false, message: 'Already paying…', retry: false };
      busy = true;
      try {
        const res = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          // Only used by a redirect-based method; the PaymentIntent allows none.
          confirmParams: { return_url: location.href.split('#')[0] },
        });
        if (res.error) {
          const t = res.error.type;
          // card_error / validation_error: the buyer can fix it and pay again with the same intent.
          const retry = t === 'card_error' || t === 'validation_error' || t === 'invalid_request_error';
          return { ok: false, message: res.error.message || 'The payment did not go through.', retry, declined: t === 'card_error' };
        }
        const pi = res.paymentIntent;
        if (pi && (pi.status === 'succeeded' || pi.status === 'processing')) return { ok: true, status: pi.status, paymentIntentId: pi.id };
        if (pi?.status === 'requires_payment_method') return { ok: false, message: 'The payment was declined.', retry: true, declined: true };
        return { ok: false, message: 'The payment is not finished. Try again.', retry: true };
      } catch {
        return { ok: false, message: 'Something went wrong while paying. Try again (a payment is only ever taken once).', retry: true };
      } finally {
        busy = false;
      }
    },
    focus() {
      try {
        element.focus();
      } catch {
        /* not mounted */
      }
    },
    destroy() {
      try {
        element.destroy();
      } catch {
        /* already gone */
      }
    },
  };
}
