import { ENV_ON, raveHarness, T0 } from './rave.harness-spec';
import {
    checkRaveStripeAccount,
    noteRaveStripeError,
    RAVE_STRIPE_BROKEN_MS,
    raveStripeBroken,
    resetRaveStripeHealth,
} from './rave-stripe-health';

/* Card closes (reason `stripe`) when Stripe refuses the key or the publishable key is of another account. */

const PK =
    'pk_live_51SHsEzQ3sukDo4Y0X5vltjlHzKfBYESoXE31bKZFoucWBTWsch6HtjjDI8QhRrwyoHRdtOXUlWfP9O8dcf6ookVB00VDirS7H4';

describe('rave Stripe health', () => {
    beforeEach(() => resetRaveStripeHealth());

    it('an authentication or permission error closes card for 5 minutes; other errors do not', () => {
        noteRaveStripeError(new Error('card declined'), T0);
        expect(raveStripeBroken(PK, T0.getTime())).toBe(false);
        noteRaveStripeError({ type: 'StripeAuthenticationError' }, T0);
        expect(raveStripeBroken(PK, T0.getTime() + 1000)).toBe(true);
        expect(raveStripeBroken(PK, T0.getTime() + RAVE_STRIPE_BROKEN_MS + 1)).toBe(false);
    });

    it('closes card only on a clear account mismatch; an unreadable account never gates', async () => {
        const cfg = { secretKeyMode: 'live', publishableKey: PK };
        const same = { stripe: { accounts: { retrieve: jest.fn(async () => ({ id: 'acct_1SHsEzQ3sukDo4Y0' })) } } };
        await checkRaveStripeAccount(same, cfg, T0);
        expect(raveStripeBroken(PK, T0.getTime())).toBe(false);
        resetRaveStripeHealth();
        const other = { stripe: { accounts: { retrieve: jest.fn(async () => ({ id: 'acct_1TgpD4JwkPjwFxHM' })) } } };
        await checkRaveStripeAccount(other, cfg, T0);
        expect(raveStripeBroken(PK, T0.getTime())).toBe(true);
        // Cached for an hour.
        await checkRaveStripeAccount(other, cfg, new Date(T0.getTime() + 60_000));
        expect(other.stripe.accounts.retrieve).toHaveBeenCalledTimes(1);
        resetRaveStripeHealth();
        const denied = { stripe: { accounts: { retrieve: jest.fn(async () => Promise.reject(new Error('403'))) } } };
        await checkRaveStripeAccount(denied, cfg, T0);
        expect(raveStripeBroken(PK, T0.getTime())).toBe(false);
    });

    it('status shows card closed with reason stripe after Stripe refused the key', async () => {
        const h = raveHarness(ENV_ON);
        h.stripe.paymentIntents.create.mockRejectedValueOnce({ type: 'StripePermissionError', message: 'no' });
        await h.service.checkout({ cats: 1, method: 'card' }, T0).catch(() => undefined);
        const status = await h.service.status(T0);
        expect(status).toMatchObject({ card: false, cardReason: 'stripe' });
        resetRaveStripeHealth();
    });
});
