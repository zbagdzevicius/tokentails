import { Controller, Headers, HttpCode, Post, Req, RawBodyRequest } from '@nestjs/common';
import { MotoredStripeService } from './motored-stripe.service';

/*
 * POST /shelter/motored/stripe: Motored's Stripe account webhook for one-off orders. Raw body, verified
 * with MOTORED_STRIPE_WEBHOOK_SECRET. 503 (MOTORED_WEBHOOK_UNAVAILABLE) without the secret, 400
 * (MOTORED_BAD_SIGNATURE) on a missing or wrong signature, 200 with { received, outcome } on success.
 */
@Controller('shelter/motored/stripe')
export class MotoredStripeController {
    constructor(private readonly webhooks: MotoredStripeService) {}

    @HttpCode(200)
    @Post()
    async webhook(@Req() req: RawBodyRequest<any>, @Headers('stripe-signature') signature: string) {
        const event = this.webhooks.verify(req.rawBody, signature);
        const outcome = await this.webhooks.handle(event);
        return { received: true, outcome };
    }
}
