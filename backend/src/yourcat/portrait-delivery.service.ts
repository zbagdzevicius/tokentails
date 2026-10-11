import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { AiBudgetService } from 'src/ai-budget/ai-budget.service';
import { AiUsage, measuredOrFallback } from 'src/ai-budget/ai-cost';
import { sendOrderConfirmationEmail } from 'src/image/order-email';
import { ImageRepository } from 'src/image/image.repository';
import { ImageStyle } from 'src/image/image.schema';
import { PortraitCheckoutService } from 'src/image/portrait-checkout.service';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { ILeaseCollection, JOB_RUNS_COLLECTION, acquireLease, runLeased } from 'src/shared/jobs/lease';
import { generatePortraitForImage } from 'src/shared/utils/ai-portrait';
import { OrderRepository } from 'src/web3/order.repository';
import { OrderStatus } from 'src/web3/order.schema';
import { YourcatRepository } from './yourcat.repository';
import { MAX_DELIVERY_ATTEMPTS, ORIGINAL_RETENTION_MS, YourcatService } from './yourcat.service';

/*
 * Paid `/yourcat` HD portraits (bet #3, docs/plans/yourcat-v2.md section 6.5). No portrait is generated
 * before payment: the Stripe webhook completes the order and starts the delivery here, which paints from
 * the private original, emails the buyer and then shortens or ends the photo's retention. A sweeper
 * retries undelivered orders every 10 minutes, up to 3 attempts; then an alert email goes out.
 * Paid deliveries are not gated by the AI budget (the customer has paid); their spend is recorded.
 *
 * The email is tracked on its own (KI-11): `deliveryEmailAt` is set only when SendGrid accepted it. A
 * painted portrait whose email failed is not repainted; the sweeper retries only the email, up to
 * MAX_EMAIL_ATTEMPTS sends, and an alert goes out on the first failure and when the retries run out.
 */

export const DELIVERY_LEASE_MS = 15 * 60 * 1000;
export const DELIVERY_SWEEP_JOB = 'yourcat-portrait-delivery-sweep';
export const DELIVERY_SWEEP_LEASE_MS = 9 * 60 * 1000;
export const DELIVERY_SWEEP_DAYS = 7;

/** Email sends per paid portrait (the first one plus sweeper retries, at least one lease apart). */
export const MAX_EMAIL_ATTEMPTS = 5;

export type DeliveryOutcome = 'delivered' | 'email-failed' | 'already-delivered' | 'lease-held' | 'skipped' | 'failed';

/** Painted, but the email was tried, never accepted, and still has a send left. */
export const emailPending = (record: { deliveryEmailAt?: Date | null; deliveryEmailAttempts?: number | null }) =>
    !record.deliveryEmailAt &&
    (record.deliveryEmailAttempts || 0) >= 1 &&
    (record.deliveryEmailAttempts || 0) < MAX_EMAIL_ATTEMPTS;

@Injectable()
export class PortraitDeliveryService {
    private readonly logger = new Logger(PortraitDeliveryService.name);
    /** Clock and calls, replaceable in specs. */
    now: () => Date = () => new Date();
    io = { generatePortraitForImage, sendOrderConfirmationEmail };
    /** The last background delivery (specs await it). */
    lastDelivery: Promise<DeliveryOutcome> | null = null;

    constructor(
        private readonly yourcatRepository: YourcatRepository,
        private readonly yourcatService: YourcatService,
        private readonly orderRepository: OrderRepository,
        private readonly imageRepository: ImageRepository,
        private readonly budget: AiBudgetService,
        private readonly portraitCheckout: PortraitCheckoutService
    ) {}

    private jobRuns(): ILeaseCollection {
        return this.yourcatRepository.model.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection;
    }

    /** Not awaited by the webhook; errors stay in the log. */
    deliverInBackground(orderId: string | Types.ObjectId): void {
        this.lastDelivery = this.deliver(orderId).catch(error => {
            this.logger.error(`delivery of order ${orderId} failed: ${(error as Error)?.message}`);
            return 'failed' as DeliveryOutcome;
        });
    }

    async deliver(orderId: string | Types.ObjectId): Promise<DeliveryOutcome> {
        const id = new Types.ObjectId(String(orderId));
        if (!(await acquireLease(this.jobRuns(), `portrait-delivery:${id}`, DELIVERY_LEASE_MS, this.now()))) {
            return 'lease-held';
        }
        const order: any = await this.orderRepository.model
            .findOne({ _id: id, status: OrderStatus.COMPLETE, entityType: EntityType.IMAGE })
            .populate([
                { path: 'user', select: 'email' },
                { path: 'image', select: 'url aiUrl source name style' },
            ])
            .lean();
        const image = order?.image;
        if (!order || !image?._id || image.source !== 'yourcat') {
            return 'skipped';
        }
        const record: any = await this.yourcatRepository.model.findOne({ portraitImage: image._id }).lean();
        if (image.aiUrl) {
            // Painted already: only an email that was tried and failed is sent again.
            return record && emailPending(record)
                ? this.sendEmail(order, record, image.aiUrl, String(id))
                : 'already-delivered';
        }
        if (!record) {
            return 'skipped';
        }
        if ((record.portraitAttempts || 0) >= MAX_DELIVERY_ATTEMPTS) {
            return 'failed';
        }

        const usages: AiUsage[] = [];
        let called = false;
        let aiUrl: string;
        try {
            called = true;
            aiUrl = await this.io.generatePortraitForImage(
                String(image._id),
                this.imageRepository,
                (image.style as ImageStyle) || ImageStyle.HIGHNESS,
                { onUsage: usage => usages.push(usage) }
            );
            await this.recordSpend(usages, called);
            await this.budget.count('portraitsDelivered');
            if (record.deleteOriginalAfterDelivery) {
                await this.yourcatService.deleteOriginal(record);
            } else {
                // The promised "redo once" window.
                await this.yourcatRepository.model.updateOne(
                    { _id: record._id },
                    { $set: { originalDeleteAfter: new Date(this.now().getTime() + ORIGINAL_RETENTION_MS) } }
                );
            }
        } catch (error) {
            await this.recordSpend(usages, called);
            this.logger.error(`portrait for order ${id} failed: ${(error as Error)?.message}`);
            const updated: any = await this.yourcatRepository.model
                .findOneAndUpdate({ _id: record._id }, { $inc: { portraitAttempts: 1 } }, { new: true })
                .lean();
            if ((updated?.portraitAttempts || 0) >= MAX_DELIVERY_ATTEMPTS) {
                await this.giveUp(updated || record, String(id));
            }
            return 'failed';
        }
        // Outside the try: a failed email never counts as a failed paint (the portrait is not repainted).
        return this.sendEmail(order, record, aiUrl, String(id));
    }

    /**
     * Claims one email send, then sends. `deliveryEmailAt` is set only when SendGrid accepted the email;
     * on a failure the sweeper sends it again until MAX_EMAIL_ATTEMPTS.
     */
    private async sendEmail(order: any, record: any, aiUrl: string, orderId: string): Promise<DeliveryOutcome> {
        const claimed: any = await this.yourcatRepository.model
            .findOneAndUpdate(
                { _id: record._id, deliveryEmailAt: null },
                { $inc: { deliveryEmailAttempts: 1 } },
                { new: true }
            )
            .lean();
        if (!claimed) {
            return 'already-delivered';
        }
        const address = order.user?.email || (await this.checkoutEmail(order.hash));
        let sent = false;
        try {
            sent = await this.io.sendOrderConfirmationEmail(address || '', aiUrl, {
                subject: `Your portrait of ${record.name} is ready`,
            });
        } catch (error) {
            this.logger.error(`portrait email for order ${orderId} threw: ${(error as Error)?.message}`);
        }
        if (sent) {
            await this.yourcatRepository.model.updateOne(
                { _id: record._id },
                { $set: { deliveryEmailAt: this.now() } }
            );
            return 'delivered';
        }

        const attempts = claimed.deliveryEmailAttempts || 1;
        // One per failed send (GET /yourcat/stats, the CMS /yourcat page); `count` never throws.
        await this.budget.count('portraitsEmailFailed');
        this.logger.error(
            `portraitsEmailFailed: paid portrait for order ${orderId} painted but not emailed (send ${attempts} of ${MAX_EMAIL_ATTEMPTS})`
        );
        const lastTry = attempts >= MAX_EMAIL_ATTEMPTS;
        if (attempts === 1 || lastTry) {
            await this.budget.alert(
                `Paid portrait painted but not emailed (order ${orderId})`,
                `The paid /yourcat portrait for order ${orderId} (record ${record._id}) is painted and shows on ` +
                    `tokentails.com/yourcat, but its email ${
                        address ? 'was not accepted by SendGrid' : 'has no address'
                    } (send ${attempts} of ${MAX_EMAIL_ATTEMPTS}). ` +
                    (lastTry
                        ? 'No more retries: send the portrait link to the buyer by hand.'
                        : 'The sweeper retries every 10 minutes.')
            );
        }
        return 'email-failed';
    }

    /** The third failure: counted, one alert email per order, and the original deleted if asked. */
    private async giveUp(record: any, orderId: string): Promise<void> {
        await this.budget.count('portraitsDeliveryFailed');
        await this.budget.alert(
            `Paid portrait not delivered (order ${orderId})`,
            `The paid /yourcat portrait for order ${orderId} (record ${record._id}) failed ${MAX_DELIVERY_ATTEMPTS} times. ` +
                'Deliver it by hand through the internal CLI or refund it.'
        );
        if (record.deleteOriginalAfterDelivery) {
            await this.yourcatService.deleteOriginal(record);
        }
    }

    private async recordSpend(usages: AiUsage[], called: boolean): Promise<void> {
        if (!called) {
            return;
        }
        try {
            await this.budget.recordPaidSpend(measuredOrFallback(usages, { kind: 'image', imageSize: '4K' }));
        } catch (error) {
            this.logger.warn(`paid spend not recorded: ${(error as Error)?.message}`);
        }
        usages.length = 0;
    }

    /** The email Checkout collected, for a guest or an account without email. */
    private async checkoutEmail(sessionId?: string): Promise<string | null> {
        if (!sessionId) {
            return null;
        }
        try {
            const session = await this.portraitCheckout.stripe.checkout.sessions.retrieve(sessionId);
            return session.customer_details?.email || null;
        } catch (error) {
            this.logger.warn(`checkout email not readable: ${(error as Error)?.message}`);
            return null;
        }
    }

    /**
     * Retries paid `/yourcat` portraits that were not painted (last 7 days, under 3 attempts) and painted
     * ones whose email failed (under MAX_EMAIL_ATTEMPTS sends).
     */
    @Cron('*/10 * * * *')
    async sweep() {
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: DELIVERY_SWEEP_JOB,
            ttlMs: DELIVERY_SWEEP_LEASE_MS,
            logger: this.logger,
            run: () => this.sweepOnce(),
        });
    }

    async sweepOnce(): Promise<number> {
        const since = new Date(this.now().getTime() - DELIVERY_SWEEP_DAYS * 24 * 60 * 60 * 1000);
        const orders: any[] = await this.orderRepository.model
            .find(
                { status: OrderStatus.COMPLETE, entityType: EntityType.IMAGE, updatedAt: { $gte: since } },
                { _id: 1, image: 1 }
            )
            .populate([{ path: 'image', select: 'aiUrl source' }])
            .lean();
        let attempted = 0;
        for (const order of orders) {
            if (order.image?.source !== 'yourcat') {
                continue;
            }
            const record: any = await this.yourcatRepository.model
                .findOne(
                    { portraitImage: order.image._id },
                    { portraitAttempts: 1, deliveryEmailAt: 1, deliveryEmailAttempts: 1 }
                )
                .lean();
            if (!record) {
                continue;
            }
            // Painted: only a failed email is retried. Not painted: the paint, under 3 attempts.
            const due = order.image.aiUrl
                ? emailPending(record)
                : (record.portraitAttempts || 0) < MAX_DELIVERY_ATTEMPTS;
            if (!due) {
                continue;
            }
            attempted += 1;
            await this.deliver(order._id);
        }
        return attempted;
    }
}
