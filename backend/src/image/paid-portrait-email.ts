import Stripe from 'stripe';
import { sendOrderConfirmationEmail } from './order-email';

/*
 * The order email of a paid `/portrait` 4K (CR1-03, CR2-01, CR2-05), shared by every path that delivers
 * one: the Stripe webhook and the GET /image/:id late publish (image.controller.ts), and the card and
 * Stellar confirms (web3.controller.ts). Exactly one of them delivers an order: the caller whose
 * `deliverPaidPortraitUrl` answered `deliver: true` (src/shared/utils/paid-portrait.ts).
 *
 * Kept apart from image.controller.ts so web3.controller.ts can use it without loading the image routes.
 */

/** Anything that can send an operator alert (`AiBudgetService.alert`). */
export interface PortraitAlerter {
    alert: (subject: string, text: string) => Promise<unknown>;
}

/** A Stripe Checkout Session id (`cs_test_...` / `cs_live_...`); card-confirm orders store a `pi_` id. */
export const isCheckoutSessionId = (value: unknown): value is string =>
    typeof value === 'string' && /^cs_[A-Za-z0-9_]+$/.test(value);

/**
 * The email Checkout collected for an order whose `hash` is its Checkout Session id: a guest buyer, or an
 * account without an email. Null for any other hash (a payment intent, a Stellar tx) or when Stripe
 * cannot be read. Same rule as `PortraitDeliveryService.checkoutEmail` (the `/yourcat` delivery).
 */
export async function checkoutSessionEmail(
    stripe: Pick<Stripe, 'checkout'> | null | undefined,
    hash: unknown
): Promise<string | null> {
    if (!stripe || !isCheckoutSessionId(hash)) {
        return null;
    }
    try {
        const session = await stripe.checkout.sessions.retrieve(hash);
        return session?.customer_details?.email || null;
    } catch (error) {
        console.warn(`Checkout email not readable: ${(error as Error)?.message}`);
        return null;
    }
}

/**
 * One alert email for a paid `/portrait` order that was not delivered. The body names the order id only:
 * no address, no URL. Never throws.
 */
export async function alertPortraitNotDelivered(
    budget: PortraitAlerter | null | undefined,
    orderId: unknown,
    why: 'publish' | 'email'
): Promise<void> {
    const id = String(orderId);
    try {
        if (why === 'publish') {
            await budget?.alert(
                `Paid portrait not delivered (order ${id})`,
                `The paid /portrait 4K for order ${id} could not be made public, so no email or cat was sent. ` +
                    'GET /image/:id retries the copy and then delivers; if the buyer does not open it, deliver it by hand or refund it.'
            );
        } else {
            await budget?.alert(
                `Paid portrait published but not emailed (order ${id})`,
                `The paid /portrait 4K for order ${id} is public, but its email has no address or was not accepted by SendGrid. ` +
                    'Send the portrait link to the buyer by hand.'
            );
        }
    } catch (error) {
        console.error(`Could not send the delivery alert for order ${id}:`, (error as Error)?.message);
    }
}

/**
 * Sends the order email with the public portrait URL; on no address or a refused send, the
 * "published but not emailed" alert. Resolves whether SendGrid accepted it. Never throws.
 */
export async function emailPaidPortrait(
    address: string | null | undefined,
    url: string,
    budget: PortraitAlerter | null | undefined,
    orderId: unknown
): Promise<boolean> {
    let sent = false;
    if (address) {
        try {
            sent = await sendOrderConfirmationEmail(address, url);
        } catch (error) {
            console.error(`Order email for order ${String(orderId)} threw:`, (error as Error)?.message);
        }
    }
    if (!sent) {
        console.warn(`Order email not sent for order ${String(orderId)}`);
        await alertPortraitNotDelivered(budget, orderId, 'email');
    }
    return sent;
}
