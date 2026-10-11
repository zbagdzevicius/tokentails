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
 */

export const DELIVERY_LEASE_MS = 15 * 60 * 1000;
export const DELIVERY_SWEEP_JOB = 'yourcat-portrait-delivery-sweep';
export const DELIVERY_SWEEP_LEASE_MS = 9 * 60 * 1000;
export const DELIVERY_SWEEP_DAYS = 7;

export type DeliveryOutcome = 'delivered' | 'already-delivered' | 'lease-held' | 'skipped' | 'failed';

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
        if (image.aiUrl) {
            return 'already-delivered';
        }
        const record: any = await this.yourcatRepository.model.findOne({ portraitImage: image._id }).lean();
        if (!record) {
            return 'skipped';
        }
        if ((record.portraitAttempts || 0) >= MAX_DELIVERY_ATTEMPTS) {
            return 'failed';
        }

        const usages: AiUsage[] = [];
        let called = false;
        try {
            called = true;
            const aiUrl = await this.io.generatePortraitForImage(
                String(image._id),
                this.imageRepository,
                (image.style as ImageStyle) || ImageStyle.HIGHNESS,
                { onUsage: usage => usages.push(usage) }
            );
            await this.recordSpend(usages, called);

            const email = order.user?.email || (await this.checkoutEmail(order.hash));
            await this.io.sendOrderConfirmationEmail(email || '', aiUrl, {
                subject: `Your portrait of ${record.name} is ready`,
            });
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
            return 'delivered';
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

    /** Retries paid `/yourcat` portraits that were not delivered (last 7 days, under 3 attempts). */
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
            if (order.image?.source !== 'yourcat' || order.image?.aiUrl) {
                continue;
            }
            const record: any = await this.yourcatRepository.model
                .findOne({ portraitImage: order.image._id }, { portraitAttempts: 1 })
                .lean();
            if (!record || (record.portraitAttempts || 0) >= MAX_DELIVERY_ATTEMPTS) {
                continue;
            }
            attempted += 1;
            await this.deliver(order._id);
        }
        return attempted;
    }
}
