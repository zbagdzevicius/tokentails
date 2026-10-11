import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    RawBodyRequest,
    Req,
    UploadedFile,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { AiBudgetService, AiTicket } from 'src/ai-budget/ai-budget.service';
import { AiUsage, measuredOrFallback } from 'src/ai-budget/ai-cost';
import { AiUploadGate } from 'src/ai-budget/ai-upload-gate';
import { generateRandomNumber } from 'src/common/utils';
import { pickSearchParams, SearchModel } from 'src/common/validators';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { guestForbidden } from 'src/common/guards/auth-errors';
import { IResponse, RESPONSES } from 'src/shared/constants/common';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { ClientIpThrottle, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { PhotoUploadExceptionFilter, mapPhotoUploadError } from 'src/shared/photo-upload.filter';
import { generatePortraitForImage } from 'src/shared/utils/ai-portrait';
import { uploadFile } from 'src/shared/utils/aws.utils';
import { getSlug } from 'src/shared/utils/content.utils';
import { uploadFileImage } from 'src/shared/utils/image.utils';
import { PHOTO_MULTER_OPTIONS, sanitizePhoto } from 'src/shared/utils/photo-upload';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { UserService } from 'src/user/user.service';
import { PortraitDeliveryService } from 'src/yourcat/portrait-delivery.service';
import { YOURCAT_ERRORS } from 'src/yourcat/yourcat.errors';
import { OrderRepository } from 'src/web3/order.repository';
import { IOrder, OrderStatus, ProductType } from 'src/web3/order.schema';
import { spendIncrement } from 'src/web3/spend';
import Stripe from 'stripe';
import { CatService } from 'src/cat/cat.service';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { IController } from '../shared/interfaces/controller.interface';
import { ImageRepository } from './image.repository';
import { IImage, Image, ImageStyle } from './image.schema';
import { ImageModel } from './image.validator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { sendOrderConfirmationEmail } from './order-email';
import { PortraitCheckoutService } from './portrait-checkout.service';

/** Bet #3: the portrait preview and its regenerate, per minute (they share the daily `portrait-preview` caps). */
export const PORTRAIT_PREVIEW_THROTTLE = { ip: { limit: 10, ttl: 60000 }, user: { limit: 5, ttl: 60000 } };

export const portraitPreviewEnabled = (env: NodeJS.ProcessEnv = process.env) =>
    env.PORTRAIT_PREVIEW_ENABLED !== 'false';

/** Fields a caller may never write on an image (bet #3): who owns it and where it came from. */
const PROTECTED_IMAGE_FIELDS = ['owner', 'source'] as const;

function withoutFields<T extends Record<string, any>>(body: T, fields: readonly string[]): T {
    const copy: Record<string, any> = { ...(body || {}) };
    for (const field of fields) {
        delete copy[field];
    }
    return copy as T;
}

/** `GET /image/:id` and the search never serve the private `/yourcat` portrait records. */
export const NOT_YOURCAT_IMAGE = Object.freeze({ source: { $ne: 'yourcat' } });

export const ORDER_STATUS_PROJECTION = '_id status entityType id image price';

/** USD paid for a verified portrait checkout: the stored `priceUsd`, else Stripe's USD total. */
export function paidUsd(
    order: { priceUsd?: number | null },
    session: { amount_total?: number | null; currency?: string | null }
): number {
    if (typeof order.priceUsd === 'number' && Number.isFinite(order.priceUsd) && order.priceUsd > 0) {
        return order.priceUsd;
    }
    if ((session.currency || '').toLowerCase() === 'usd' && typeof session.amount_total === 'number') {
        return session.amount_total / 100;
    }
    return 0;
}

@Controller('image')
export class ImageController implements IController<Image> {
    httpService: any;
    constructor(
        private repository: ImageRepository,
        private orderRepository: OrderRepository,
        private userService: UserService,
        private userRepository: UserRepository,
        private catService: CatService,
        private stripePayments: StripePaymentService,
        private portraitCheckout?: PortraitCheckoutService,
        private gate?: AiUploadGate,
        private budget?: AiBudgetService,
        private portraitDelivery?: PortraitDeliveryService
    ) {}
    slugs: () => Promise<string[]>;

    // Editors only (bet #3): it listed every image, preview photos and paid 4K portraits included, to anyone.
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('/search')
    async search(@Body() params: SearchModel): Promise<Image[]> {
        return this.repository.find({
            ...pickSearchParams(params),
            searchObject: { ...NOT_YOURCAT_IMAGE },
        });
    }

    @Get(':id')
    async findOne(@Param('id') _id: string): Promise<Image> {
        const image = await this.repository.findOne({
            searchObject: { _id, ...NOT_YOURCAT_IMAGE },
        });
        if (!image) {
            throw new NotFoundException('Image not found');
        }
        return image;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Delete(':id')
    async delete(@Param('id') _id: string): Promise<IResponse> {
        const existingRecord: Image = await this.repository.findOne({
            searchObject: { _id },
        });
        if (!existingRecord) {
            throw new NotFoundException();
        }
        const id = existingRecord!._id?.toString();

        await this.repository.delete(id);
        return RESPONSES.success;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Put(':id')
    async update(@Param('id') _id: string, @Body() body: ImageModel) {
        const existingArticle = await this.repository.findOne({
            searchObject: { _id },
        });

        if (!existingArticle) {
            throw new NotFoundException();
        }

        // `url` and `aiUrl` stay editable for editors; `loadImageBytes` refuses private URLs on images
        // that are not `source: 'yourcat'`, so an edited URL cannot reach a private original.
        return this.repository.update(existingArticle._id, { ...withoutFields(body as any, PROTECTED_IMAGE_FIELDS) });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(0))
    @Post('')
    @UseInterceptors(FileInterceptor('file'))
    async create(@Body() entity: IImage, @UploadedFile() file: any) {
        let url = '';
        try {
            url = await uploadFileImage(file.buffer, getSlug(generateRandomNumber().toString()));
        } catch {
            throw new BadRequestException('Image with this filename EXISTS');
        }

        try {
            // `url` comes from the upload; the caller never sets `aiUrl`, `owner` or `source`.
            const fields = withoutFields(entity as any, [...PROTECTED_IMAGE_FIELDS, 'aiUrl']);
            const image = await this.repository.create({ ...fields, url });
            return image;
        } catch (e) {
            console.error(e);
            throw new BadRequestException('Image Validation failed, check your title and caption');
        }
    }

    /**
     * Upload plus synchronous 4K portrait generation (a paid AI call). Guests allowed (bet #3), under the
     * `portrait-preview` caps of `AiUploadGate` (per IP, per user, failures, the €3 preview sub-cap of
     * the daily budget). The photo is sanitized (EXIF stripped) and stored under an unguessable name.
     * Known issue: the response still contains `aiUrl` before payment (docs/BACKEND.md).
     */
    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @SkipThrottle()
    @UserThrottle(PORTRAIT_PREVIEW_THROTTLE.user)
    @ClientIpThrottle(PORTRAIT_PREVIEW_THROTTLE.ip)
    @UseFilters(PhotoUploadExceptionFilter)
    @Post('/portrait')
    @UseInterceptors(FileInterceptor('file', PHOTO_MULTER_OPTIONS))
    async createPortrait(
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Body() body: { name?: string; isTemporary?: string; style?: ImageStyle },
        @UploadedFile() file: any
    ): Promise<IImage> {
        if (!portraitPreviewEnabled()) {
            throw YOURCAT_ERRORS.portraitDisabled();
        }
        if (!file?.buffer?.length) {
            throw YOURCAT_ERRORS.fileRequired();
        }
        const ticket = await this.previewGate().admit(req, user, 'portrait-preview');

        let url = '';
        try {
            const photo = await sanitizePhoto(file.buffer);
            const filename = `${uuid()}.webp`;
            await uploadFile(filename, photo.data, 'webp');
            url = `${process.env.DO_SPACES_CDN}/${filename}`;
        } catch (e) {
            await this.previewGate().refuseBeforeAi(ticket);
            const mapped = mapPhotoUploadError(e);
            if (mapped) {
                throw mapped;
            }
            console.error('Error uploading file:', e);
            throw new BadRequestException('Failed to upload the photo, please try again');
        }

        let image: any;
        try {
            image = await this.repository.create({
                url,
                name: body?.name || '',
                isTemporary: body?.isTemporary === 'true',
                style: body?.style || ImageStyle.HIGHNESS,
                owner: new Types.ObjectId(String(user._id)),
                source: 'portrait',
            });
        } catch (e) {
            await this.previewGate().release(ticket);
            await this.previewGate().cancel(ticket);
            console.error('Error creating portrait:', e);
            throw new BadRequestException('Failed to create portrait, please try again');
        }
        return this.paintPreview(String(image._id), body?.style || ImageStyle.HIGHNESS, ticket, 'creating');
    }

    // Each call is a paid 4K generation, under the same caps as POST /image/portrait (bet #3).
    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @SkipThrottle()
    @UserThrottle(PORTRAIT_PREVIEW_THROTTLE.user)
    @ClientIpThrottle(PORTRAIT_PREVIEW_THROTTLE.ip)
    @Put('/portrait/:id/regenerate')
    async regeneratePortrait(
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Param('id') id: string,
        @Body() body: { style?: ImageStyle }
    ): Promise<IImage> {
        if (!portraitPreviewEnabled()) {
            throw YOURCAT_ERRORS.portraitDisabled();
        }
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException(`Image with id ${id} not found`);
        }
        const existingImage: any = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
        });

        // A /yourcat portrait record is painted only after payment; another owner's image is not ours.
        if (
            !existingImage ||
            existingImage.source === 'yourcat' ||
            (existingImage.owner && String(existingImage.owner) !== String(user?._id))
        ) {
            throw new NotFoundException(`Image with id ${id} not found`);
        }
        // Guests regenerate only images they own; legacy images without an owner stay registered-only.
        if (!existingImage.owner && (user?.isGuest || user?.transient)) {
            throw guestForbidden();
        }

        if (!existingImage.url) {
            throw new BadRequestException(`Image with id ${id} has no URL`);
        }
        // A delivered product: regenerating would replace it (and spend another 4K generation).
        const paid = await this.orderRepository.model.exists({
            image: existingImage._id,
            entityType: EntityType.IMAGE,
            status: OrderStatus.COMPLETE,
        });
        if (paid) {
            throw YOURCAT_ERRORS.portraitExists();
        }

        const ticket = await this.previewGate().admit(req, user, 'portrait-preview');
        return this.paintPreview(id, body?.style || existingImage.style || ImageStyle.HIGHNESS, ticket, 'regenerating');
    }

    private previewGate(): AiUploadGate {
        if (!this.gate) {
            throw new Error('AiUploadGate is not configured');
        }
        return this.gate;
    }

    /** Generates the preview, settles its measured cost and returns the updated image. */
    private async paintPreview(
        imageId: string,
        style: ImageStyle,
        ticket: AiTicket,
        action: 'creating' | 'regenerating'
    ): Promise<IImage> {
        const usages: AiUsage[] = [];
        try {
            // Generate the portrait and update aiUrl
            await generatePortraitForImage(imageId, this.repository, style, { onUsage: usage => usages.push(usage) });
        } catch (e) {
            // The AI provider's error text stays in the server log. The provider may still bill.
            await this.settlePreview(ticket, usages, false);
            console.error(`Error ${action} portrait:`, e);
            throw new BadRequestException(
                `Failed to ${action === 'creating' ? 'create' : 'regenerate'} portrait, please try again`
            );
        }
        await this.settlePreview(ticket, usages, true);

        // Fetch the updated image with aiUrl
        const updatedImage = await this.repository.findOne({
            searchObject: { _id: imageId },
        });

        return updatedImage as IImage;
    }

    private async settlePreview(ticket: AiTicket, usages: AiUsage[], done: boolean): Promise<void> {
        try {
            const cost = measuredOrFallback(usages, { kind: 'image', imageSize: '4K' });
            await this.previewGate().settle(ticket, cost);
            if (this.budget) {
                if (done) {
                    await this.budget.count('previewsDone', ticket.day);
                }
                await this.budget.noteCost('portrait-preview', ticket.day, cost);
                await this.budget.checkBudgetAlerts(ticket.day);
            }
        } catch (error) {
            console.error('Error settling the preview cost:', error);
        }
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('/create-checkout-session')
    async createCheckoutSession(
        @Body()
        body: {
            amount?: number; // ignored: the price comes from the server price table
            productType: ProductType;
            imageId?: string;
            userId?: string;
            email?: string;
        }
    ): Promise<{ url: string }> {
        return this.checkout(body);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @UseGuards(AppAuthGuard)
    @Post('/create-checkout-session-signed')
    async createCheckoutSessionSigned(
        @USER_ID() signedUserId: string,
        @Body()
        body: {
            amount?: number; // ignored: the price comes from the server price table
            productType: ProductType;
            imageId?: string;
        }
    ): Promise<{ url: string }> {
        return this.checkout({ ...body, userId: signedUserId }, String(signedUserId));
    }

    /**
     * The legacy portrait checkout. `callerId` is set by the signed route only: then an image owned by
     * someone else is refused. Known bug: the unsigned route still accepts any `userId` (docs/BACKEND.md).
     */
    private async checkout(
        body: { productType: ProductType; imageId?: string; userId?: string; email?: string },
        callerId?: string
    ): Promise<{ url: string }> {
        const { productType, imageId, userId, email } = body;
        // Validates productType before any user is looked up or created.
        this.stripePayments.portraitCheckoutAmountCents(productType);

        let resolvedUserId: string | undefined = undefined;

        if (userId) {
            if (!Types.ObjectId.isValid(userId)) {
                throw new BadRequestException('Invalid userId');
            }
            const existingUser = await this.userRepository.findOne({
                searchObject: { _id: userId },
                projection: '_id',
            });
            if (!existingUser) {
                throw new BadRequestException('User not found');
            }
            resolvedUserId = existingUser._id.toString();
        } else if (email?.trim()) {
            // Lowercased on write (F5.1); the lookup also matches a legacy mixed-case email, so a
            // buyer who signed in before is not given a second account (known bug, fixed in 2a).
            const emailLower = email.trim().toLowerCase();
            const user = await this.userService.findByEmail(email);
            resolvedUserId = user?._id.toString();
            if (!user) {
                // A locked starter and no onboarding (createUser). The buyer's later verified sign-in
                // binds its Firebase uid to this account (F5.2 step 2).
                const newUser = await this.userService.createUser({
                    email: emailLower,
                });
                resolvedUserId = newUser._id.toString();
            }
        } else {
            throw new BadRequestException('Signed userId or email is required');
        }

        // If imageId is provided, verify it exists
        let imageObjectId: Types.ObjectId | undefined;
        if (imageId) {
            const imageRecord: any = Types.ObjectId.isValid(imageId)
                ? await this.repository.findOne({
                      searchObject: { _id: new Types.ObjectId(imageId) },
                  })
                : null;
            if (!imageRecord) {
                throw new BadRequestException('Image not found');
            }
            // `/yourcat` portraits are bought only through /yourcat: their delivery paints from the private original.
            if (imageRecord.source === 'yourcat') {
                throw new NotFoundException('Image not found');
            }
            if (callerId && imageRecord.owner && String(imageRecord.owner) !== callerId) {
                throw new NotFoundException('Image not found');
            }
            imageObjectId = new Types.ObjectId(imageId);
        }

        const orderId = new Types.ObjectId();
        const domain = process.env.MAIN_FE_DOMAIN || 'http://localhost:3000';
        try {
            const result = await this.checkoutService().create({
                productType,
                image: imageObjectId,
                userId: resolvedUserId as string,
                successUrl: `${domain}/portrait?image_id=${imageId}&_id=${orderId.toString()}`,
                cancelUrl: `${domain}/portrait?image_id=${imageId}`,
                orderId,
            });
            return { url: result.url };
        } catch (error) {
            console.error('Error creating Stripe checkout session:', error);
            throw new BadRequestException('Failed to create checkout session');
        }
    }

    private checkoutService(): PortraitCheckoutService {
        if (!this.portraitCheckout) {
            throw new Error('PortraitCheckoutService is not configured');
        }
        return this.portraitCheckout;
    }

    // Stripe retries deliveries from a small set of IPs; signature verification protects this route.
    @SkipThrottle()
    @Post('/webhook')
    async handleStripeWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('stripe-signature') signature: string
    ): Promise<{ received: boolean }> {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new BadRequestException('Stripe webhook secret not configured');
        }

        if (!signature) {
            throw new BadRequestException('Stripe signature header is required');
        }

        // Get raw body - it might be a Buffer or string
        const rawBody: Buffer | string | undefined = req.rawBody;

        // If rawBody is not available, try to get it from the request body
        if (!rawBody && (req as any).body) {
            // If body exists but rawBody doesn't, the middleware might have parsed it
            // We need the raw buffer for signature verification
            console.error('Raw body not available - middleware may have parsed it');
            throw new BadRequestException('Raw body is required for webhook verification');
        }

        if (!rawBody) {
            console.error('No raw body found in request');
            throw new BadRequestException('Raw body is required for webhook verification');
        }

        // Ensure rawBody is a Buffer for Stripe verification
        const rawBodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

        let event: Stripe.Event;

        try {
            // Verify webhook signature
            event = this.stripePayments.stripe.webhooks.constructEvent(rawBodyBuffer, signature, webhookSecret);
        } catch (err) {
            console.error('Webhook signature verification failed:', err);
            throw new BadRequestException('Invalid webhook signature');
        }

        // Handle the checkout.session.completed event
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;

            try {
                // Find order by hash (session.id) with populated user and image
                const order = await this.orderRepository.findOne({
                    searchObject: { hash: session.id },
                    populate: [
                        { path: 'user', select: 'email' },
                        { path: 'image', select: 'url aiUrl source name style' },
                    ],
                });

                if (!order) {
                    console.error(`Order not found for session: ${session.id}`);
                    return { received: true };
                }

                if (order.status === OrderStatus.COMPLETE) {
                    console.log(`Order ${order._id} already completed for session ${session.id}`);
                    return { received: true };
                }

                // Paid, in the order's currency, and at least the price stored on the order
                const rejection = this.stripePayments.checkPaidCheckoutSession(session, order);
                if (rejection) {
                    console.error(`Not granting order ${order._id}: ${rejection}`);
                    return { received: true };
                }

                // Atomic PENDING -> COMPLETE: a redelivered or concurrent webhook grants nothing
                const completed = await this.stripePayments.completePendingOrder(order._id);
                if (!completed) {
                    console.log(`Order ${order._id} already completed for session ${session.id}`);
                    return { received: true };
                }

                console.log(`Order ${order._id} marked as COMPLETE for session ${session.id}`);

                const populatedUser = order.user as { _id?: Types.ObjectId; email?: string } | undefined;
                const userId = populatedUser?._id?.toString() ?? order.user?.toString();
                if (userId) {
                    // USD only (G4): the order's stored USD figure (`priceUsd`; for an EUR card order the
                    // stats conversion of its euro price), else the USD amount Stripe charged
                    // (checkPaidCheckoutSession verified the currency). Never `order.price`, which can be
                    // in another currency.
                    const pricePaid = paidUsd(order, session);
                    await this.userRepository.update(userId, {
                        $inc: {
                            ...spendIncrement(pricePaid),
                            portraitPurchases: 1,
                            monthPortraitPurchases: 1,
                        },
                    });
                }

                const paidImage = order.image as { _id?: Types.ObjectId; aiUrl?: string; source?: string } | undefined;
                await this.budget?.count('portraitsPaid');

                // A paid /yourcat portrait: painted only now, from the private original, then emailed by the
                // delivery service. The player already has their cat, so no blessing or second cat.
                if (paidImage?.source === 'yourcat') {
                    await this.budget?.count('yourcatPortraitsPaid');
                    if (this.portraitDelivery) {
                        this.portraitDelivery.deliverInBackground(order._id);
                    } else {
                        console.error(`No delivery service for paid /yourcat order ${order._id}`);
                    }
                    return { received: true };
                }

                // Send order confirmation email with aiUrl: the account's email, else the one Checkout collected.
                const recipient = (order.user as any)?.email || session.customer_details?.email;
                if (recipient && paidImage?.aiUrl) {
                    await sendOrderConfirmationEmail(recipient, paidImage.aiUrl);
                } else {
                    console.warn(`Cannot send email: missing user email or image aiUrl for order ${order._id}`);
                }

                // Create blessing + cat for the purchaser (fire-and-forget, must not break order flow)
                try {
                    const aiUrl = paidImage?.aiUrl;
                    if (aiUrl && userId) {
                        await this.catService.createBlessingWithCat(userId, aiUrl);
                        console.log(`Blessing + cat created for user ${userId}, order ${order._id}`);
                    } else {
                        console.warn(`Skipping cat creation: missing aiUrl or userId for order ${order._id}`);
                    }
                } catch (catError) {
                    console.error(`Failed to create blessing/cat for order ${order._id}:`, catError);
                }
            } catch (error) {
                console.error('Error processing webhook:', error);
                // Don't throw error to prevent Stripe from retrying
                return { received: true };
            }
        }

        return { received: true };
    }

    @Get('/order/status')
    async getOrderStatus(@Query('_id') _id: string): Promise<Partial<IOrder>> {
        if (!_id) {
            throw new BadRequestException('_id parameter is required');
        }

        if (!Types.ObjectId.isValid(_id)) {
            throw new BadRequestException('Invalid _id');
        }
        // Public route polled by the portrait checkout page, which reads status, id and price only.
        // No user, wallet, payment hash or discount code leaves the server.
        const order = await this.orderRepository.findOne({
            searchObject: { _id: new Types.ObjectId(_id) },
            projection: ORDER_STATUS_PROJECTION,
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return order;
    }
}
