import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from 'src/web3/order.schema';
import { OrderStatus } from 'src/shared-contracts/enums';
import {
    AgeBand,
    isAgeBand,
    SPEND_CAP_CENTS,
    SPEND_WINDOW_MS,
    stricterBand,
    UNDER_16_MESSAGE,
} from './pawlegends.contracts';
import { PAWLEGENDS_ERRORS } from './pawlegends.errors';
import { isDeviceId, PawlegendsIdentity, PawlegendsStripeService } from './pawlegends-stripe.service';

/*
 * The Pawlegends guardrails on the Token Tails cat checkout (integration plan section 2, audit problem 2). When a
 * purchase starts from the game, both checkouts send `context: 'pawlegends'` with the player's age band and device
 * id; `POST /web3/create-payment` and `POST /payments/crypto/orders` then call `assert` before any PaymentIntent or
 * order exists. Other callers send no context and are unchanged.
 *
 * - The age band is required, kept with the device and the account (the stricter answer wins, so a later "18+"
 *   never unlocks an earlier "Under 16").
 * - Under 16 cannot buy (403 `PAWLEGENDS_UNDER_16`, the guardian line).
 * - The rolling 30-day cap of the band (€30 at 16-17, €200 at 18+, USD at €1 = $1) counts the player's completed
 *   Token Tails orders of the window plus any Pawlegends `pl_*` purchases of the device or account; a purchase that
 *   would pass it is refused (403 `PAWLEGENDS_SPEND_CAP`).
 */

export const PAWLEGENDS_PURCHASE_CONTEXT = 'pawlegends';

export interface PawlegendsPurchaseContext {
    context?: unknown;
    ageBand?: unknown;
    deviceId?: unknown;
}

/** True when a checkout body asks for the Pawlegends checks. */
export const isPawlegendsContext = (body: PawlegendsPurchaseContext | null | undefined): boolean =>
    !!body && body.context === PAWLEGENDS_PURCHASE_CONTEXT;

@Injectable()
export class PawlegendsCheckoutGuard {
    now: () => Date = () => new Date();

    constructor(
        private readonly stripe: PawlegendsStripeService,
        @InjectModel(Order.name) private readonly orders: Model<OrderDocument>
    ) {}

    /** Completed Token Tails orders of the account in the spend window, in cents (`priceUsd`, USD at €1 = $1). */
    async orderSpentCents(userId: string): Promise<number> {
        if (!Types.ObjectId.isValid(userId)) return 0;
        const since = new Date(this.now().getTime() - SPEND_WINDOW_MS);
        const rows = (await this.orders
            .find(
                { user: new Types.ObjectId(userId), status: OrderStatus.COMPLETE, createdAt: { $gt: since } },
                { priceUsd: 1 }
            )
            .lean()) as any[];
        return rows.reduce((sum, row) => {
            // `price` is in the paid currency (XLM for Stellar orders): only `priceUsd` counts.
            const usd = Number(row.priceUsd);
            return sum + (Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : 0);
        }, 0);
    }

    /**
     * Throws 400 without an age band, 403 under 16 or over the cap. Returns the band used (the strictest stored
     * one) and the cap left after this purchase.
     */
    async assert(
        input: { userId: string; cents: number } & PawlegendsPurchaseContext
    ): Promise<{ band: AgeBand; capLeftCents: number }> {
        if (!isAgeBand(input.ageBand)) throw PAWLEGENDS_ERRORS.invalid('ageBand is required');
        const identity: PawlegendsIdentity = {
            accountId: String(input.userId),
            deviceId: isDeviceId(input.deviceId) ? input.deviceId : null,
        };
        await this.stripe.rememberBand(identity, input.ageBand);
        const band = stricterBand(await this.stripe.storedBand(identity), input.ageBand)!;
        if (band === 'under16') throw PAWLEGENDS_ERRORS.underAge(UNDER_16_MESSAGE);
        const spent = (await this.stripe.spentCents(identity)) + (await this.orderSpentCents(String(input.userId)));
        const capLeft = SPEND_CAP_CENTS[band] - spent;
        if (input.cents > capLeft) throw PAWLEGENDS_ERRORS.spendCap();
        return { band, capLeftCents: capLeft - input.cents };
    }
}
