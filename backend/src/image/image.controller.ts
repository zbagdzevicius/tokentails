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
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { generateRandomNumber } from 'src/common/utils';
import { SearchModel } from 'src/common/validators';
import { IResponse, RESPONSES } from 'src/shared/constants/common';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { generatePortraitForImage } from 'src/shared/utils/ai-portrait';
import { getSlug } from 'src/shared/utils/content.utils';
import { uploadFileImage } from 'src/shared/utils/image.utils';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { UserService } from 'src/user/user.service';
import { OrderRepository } from 'src/web3/order.repository';
import { IOrder, OrderStatus, ProductType } from 'src/web3/order.schema';
import { ChainType } from 'src/web3/web3.model';
import Stripe from 'stripe';
import { CatService } from 'src/cat/cat.service';
import { IController } from '../shared/interfaces/controller.interface';
import { ImageRepository } from './image.repository';
import { IImage, Image, ImageStyle } from './image.schema';
import { ImageModel } from './image.validator';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-12-15.clover',
});

// Google Tag Manager types
type PurchaseParams = {
    event_id?: string; // order.image
    transaction_id?: string; // session.id
    item_id?: string; // order.id
    item_name?: string; // order.id
    value?: number; // currencyType.priceUsd
    currency?: string; // order.currencyType
    coupon?: string;
    payment_method?: string; // order.chainType
    user_id?: string; // order.user
};

// Event type definitions with discriminated unions
type TrackEventMap = {
    purchase: PurchaseParams;
};

// Send SendGrid email for order confirmation
async function sendOrderConfirmationEmail(email: string, aiUrl: string): Promise<void> {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!sendgridApiKey) {
        console.warn('SENDGRID_API_KEY not configured, skipping email send');
        return;
    }

    if (!email) {
        console.warn('No email address provided, skipping email send');
        return;
    }

    try {
        const emailData = {
            personalizations: [
                {
                    to: [{ email }],
                    subject: 'Your order is on its way!',
                },
            ],
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'hello@tokentails.com',
                name: 'TokenTails',
            },
            content: [
                {
                    type: 'text/html',
                    value: `
                        <html>
                            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                                    <h2 style="color: #4a5568;">Your order is on its way! 🎨</h2>
                                    <p>Thank you for your purchase! We're excited to share your pet portrait with you.</p>
                                    <p>Your Pet portrait is ready:</p>
                                    <div style="text-align: center; margin: 30px 0;">
                                        <img src="${aiUrl}" alt="Your Portrait" style="max-width: 100%; height: auto; border-radius: 8px;" />
                                    </div>
                                    <p>If you have any questions, please don't hesitate to contact us.</p>
                                    <p>While you're waiting, you can <a href="https://tokentails.com/game">see your pet</a> in our game as your playable character!</p>
                                    <p style="margin-top: 30px; color: #718096; font-size: 14px;">
                                        Best regards,<br />
                                        The TokenTails Team
                                    </p>
                                </div>
                            </body>
                        </html>
                    `,
                },
            ],
        };

        await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${sendgridApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailData),
        }).catch(error => {
            console.error('Error sending SendGrid email:', error);
        });
    } catch (error) {
        console.error('Error in sendOrderConfirmationEmail:', error);
        // Don't throw - we don't want to fail the webhook if email fails
    }
}

@Controller('image')
export class ImageController implements IController<Image> {
    httpService: any;
    constructor(
        private repository: ImageRepository,
        private orderRepository: OrderRepository,
        private userService: UserService,
        private userRepository: UserRepository,
        private catService: CatService
    ) {}
    slugs: () => Promise<string[]>;

    @Post('/search')
    async search(@Body() params: SearchModel): Promise<Image[]> {
        return this.repository.find({
            ...params,
        });
    }

    @Get(':id')
    async findOne(@Param('id') _id: string): Promise<Image> {
        const image = await this.repository.findOne({
            searchObject: { _id },
        });
        if (!image) {
            throw new NotFoundException('Image not found');
        }
        return image;
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Put(':id')
    async update(@Param('id') _id: string, @Body() body: ImageModel) {
        const existingArticle = await this.repository.findOne({
            searchObject: { _id },
        });

        if (!existingArticle) {
            throw new NotFoundException();
        }

        return this.repository.update(existingArticle._id, { ...body });
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(0))
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
            const image = await this.repository.create({ ...entity, url });
            return image;
        } catch (e) {
            console.error(e);
            throw new BadRequestException('Image Validation failed, check your title and caption');
        }
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @UseGuards(ThrottlerGuard)
    @Post('/portrait')
    @UseInterceptors(FileInterceptor('file'))
    async createPortrait(
        @Body() body: { name?: string; isTemporary?: string; style?: ImageStyle },
        @UploadedFile() file: any
    ): Promise<IImage> {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        let url = '';
        try {
            url = await uploadFileImage(file.buffer, getSlug(generateRandomNumber().toString()));
        } catch (e) {
            console.error('Error uploading file:', e);
            throw new BadRequestException('Image with this filename EXISTS');
        }

        try {
            // Create the image record first
            const image = await this.repository.create({
                url,
                name: body.name || '',
                isTemporary: body.isTemporary === 'true',
                style: body.style || ImageStyle.HIGHNESS,
            });

            // Generate the portrait and update aiUrl
            await generatePortraitForImage(image._id.toString(), this.repository, body.style || ImageStyle.HIGHNESS);

            // Fetch the updated image with aiUrl
            const updatedImage = await this.repository.findOne({
                searchObject: { _id: image._id },
            });

            return updatedImage as IImage;
        } catch (e) {
            console.error('Error creating portrait:', e);
            throw new BadRequestException('Failed to create portrait: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    @Put('/portrait/:id/regenerate')
    async regeneratePortrait(@Param('id') id: string, @Body() body: { style?: ImageStyle }): Promise<IImage> {
        const existingImage = await this.repository.findOne({
            searchObject: { _id: id },
        });

        if (!existingImage) {
            throw new NotFoundException(`Image with id ${id} not found`);
        }

        if (!existingImage.url) {
            throw new BadRequestException(`Image with id ${id} has no URL`);
        }

        try {
            // Generate the portrait and update aiUrl
            await generatePortraitForImage(
                id,
                this.repository,
                body.style || existingImage.style || ImageStyle.HIGHNESS
            );

            // Fetch the updated image with aiUrl
            const updatedImage = await this.repository.findOne({
                searchObject: { _id: id },
            });

            return updatedImage as IImage;
        } catch (e) {
            console.error('Error regenerating portrait:', e);
            throw new BadRequestException(
                'Failed to regenerate portrait: ' + (e instanceof Error ? e.message : String(e))
            );
        }
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @UseGuards(ThrottlerGuard)
    @Post('/create-checkout-session')
    async createCheckoutSession(
        @Body()
        body: {
            amount: number; // in cents
            productType: ProductType;
            imageId?: string;
            userId?: string;
            email?: string;
        }
    ): Promise<{ url: string }> {
        const { amount, productType, imageId, userId, email } = body;

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
            const emailLower = email.trim().toLowerCase();
            const user = await this.userRepository.findOne({
                searchObject: { email: emailLower },
            });
            resolvedUserId = user?._id.toString();
            if (!user) {
                const newUser = await this.userService.createUser({
                    email: emailLower,
                });
                resolvedUserId = newUser._id.toString();
            }
        } else {
            throw new BadRequestException('Signed userId or email is required');
        }

        // Validate productType
        if (![ProductType.DIGITAL, ProductType.PRINT, ProductType.CANVAS].includes(productType)) {
            throw new BadRequestException('Invalid productType. Must be digital, print, or canvas');
        }

        // Validate amount
        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount must be greater than 0');
        }

        // If imageId is provided, verify it exists
        let imageObjectId: Types.ObjectId | undefined;
        if (imageId) {
            const imageRecord = await this.repository.findOne({
                searchObject: { _id: imageId },
            });
            if (!imageRecord) {
                throw new BadRequestException('Image not found');
            }
            imageObjectId = new Types.ObjectId(imageId);
        }

        // Determine if shipping is required
        const requiresShipping = productType === ProductType.PRINT || productType === ProductType.CANVAS;

        const odrerId = new Types.ObjectId();
        // Create base Stripe checkout session params
        const baseSessionParams: Stripe.Checkout.SessionCreateParams = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Portrait - ${productType.charAt(0).toUpperCase() + productType.slice(1)}`,
                            description: `Portrait ${productType === ProductType.DIGITAL ? 'download' : productType}`,
                        },
                        unit_amount: amount, // amount is already in cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${
                process.env.MAIN_FE_DOMAIN || 'http://localhost:3000'
            }/portrait?image_id=${imageId}&_id=${odrerId.toString()}`,
            cancel_url: `${process.env.MAIN_FE_DOMAIN || 'http://localhost:3000'}/portrait?image_id=${imageId}`,
            metadata: {
                userId: resolvedUserId || '',
                productType,
                image: imageId || '',
            },
        };

        // Configure shipping for print and canvas products
        if (requiresShipping) {
            // Collect phone number for shipping
            baseSessionParams.phone_number_collection = {
                enabled: true,
            };
            // Set shipping_address_collection with allowed countries:
            // - All American countries (North, Central, South America)
            // - Australia
            // - All European countries (except Russia, Ukraine, Belarus)
            baseSessionParams.shipping_address_collection = {
                allowed_countries: [
                    // North America
                    'US',
                    'CA',
                    'MX',
                    // Central America
                    'GT',
                    'BZ',
                    'SV',
                    'HN',
                    'NI',
                    'CR',
                    'PA',
                    // Caribbean
                    'JM',
                    'HT',
                    'DO',
                    'PR',
                    'TT',
                    'BB',
                    'BS',
                    'AG',
                    'GD',
                    'KN',
                    'LC',
                    'VC',
                    'DM',
                    'SR',
                    'GY',
                    'GF',
                    'GP',
                    'MQ',
                    'CW',
                    'AW',
                    'BQ',
                    'SX',
                    // South America
                    'BR',
                    'AR',
                    'CO',
                    'PE',
                    'VE',
                    'CL',
                    'EC',
                    'BO',
                    'PY',
                    'UY',
                    'FK',
                    // Australia
                    'AU',
                    'NZ',
                    // Europe (excluding Russia, Ukraine, Belarus)
                    'GB',
                    'IE',
                    'FR',
                    'DE',
                    'IT',
                    'ES',
                    'NL',
                    'BE',
                    'AT',
                    'CH',
                    'SE',
                    'NO',
                    'DK',
                    'FI',
                    'PL',
                    'CZ',
                    'PT',
                    'GR',
                    'HU',
                    'RO',
                    'BG',
                    'HR',
                    'SK',
                    'SI',
                    'EE',
                    'LV',
                    'LT',
                    'LU',
                    'MT',
                    'CY',
                    'IS',
                    'LI',
                    'MC',
                    'AD',
                    'SM',
                    'VA',
                    'AL',
                    'BA',
                    'ME',
                    'MK',
                    'RS',
                ],
            };
            baseSessionParams.shipping_options = [
                {
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: {
                            amount: 0, // Free shipping - adjust as needed
                            currency: 'usd',
                        },
                        display_name: 'Standard Shipping',
                        delivery_estimate: {
                            minimum: {
                                unit: 'business_day',
                                value: 3,
                            },
                            maximum: {
                                unit: 'business_day',
                                value: 12,
                            },
                        },
                    },
                },
            ];
        }

        const sessionParams = baseSessionParams;
        // For digital products, Stripe automatically collects email (no shipping needed)

        try {
            const session = await stripe.checkout.sessions.create(sessionParams);

            // Create order record with PENDING status
            await this.orderRepository.create({
                _id: odrerId,
                status: OrderStatus.PENDING,
                price: amount / 100, // Convert cents to dollars
                priceUsd: amount / 100,
                entityType: EntityType.IMAGE,
                chainType: ChainType.FIAT,
                currencyType: CurrencyType.USD,
                hash: session.id, // Store Stripe session ID in hash field
                id: productType as ProductType, // Store productType in id field
                image: imageObjectId, // Use image field instead of imageId
                user: new Types.ObjectId(resolvedUserId),
            });

            return { url: session.url || '' };
        } catch (error) {
            console.error('Error creating Stripe checkout session:', error);
            throw new BadRequestException('Failed to create checkout session');
        }
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @UseGuards(AuthGuard('appauth'), ThrottlerGuard)
    @Post('/create-checkout-session-signed')
    async createCheckoutSessionSigned(
        @USER_ID() signedUserId: string,
        @Body()
        body: {
            amount: number; // in cents
            productType: ProductType;
            imageId?: string;
        }
    ): Promise<{ url: string }> {
        return this.createCheckoutSession({
            ...body,
            userId: signedUserId,
        });
    }

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
            event = stripe.webhooks.constructEvent(rawBodyBuffer, signature, webhookSecret);
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
                        { path: 'image', select: 'url aiUrl' },
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

                // Update order status to COMPLETE
                await this.orderRepository.update(order._id.toString(), {
                    status: OrderStatus.COMPLETE,
                });

                console.log(`Order ${order._id} marked as COMPLETE for session ${session.id}`);

                const populatedUser = order.user as { _id?: Types.ObjectId; email?: string } | undefined;
                const userId = populatedUser?._id?.toString() ?? order.user?.toString();
                if (userId) {
                    const pricePaid = order.priceUsd || order.price || 0;
                    await this.userRepository.update(userId, {
                        $inc: {
                            spent: pricePaid,
                            monthSpent: pricePaid,
                            portraitPurchases: 1,
                            monthPortraitPurchases: 1,
                        },
                    });
                }

                // Send order confirmation email with aiUrl
                if (order.user && (order.user as any).email && order.image && (order.image as any).aiUrl) {
                    await sendOrderConfirmationEmail((order.user as any).email, (order.image as any).aiUrl);
                } else {
                    console.warn(`Cannot send email: missing user email or image aiUrl for order ${order._id}`);
                }

                // Create blessing + cat for the purchaser (fire-and-forget, must not break order flow)
                try {
                    const aiUrl = (order.image as any)?.aiUrl;
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

        const order = await this.orderRepository.findOne({
            searchObject: { _id },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return order;
    }
}
