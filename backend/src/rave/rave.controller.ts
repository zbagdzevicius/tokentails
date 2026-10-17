import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    RawBodyRequest,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { raveCountryFromRequest } from './rave-country';
import { RaveCheckoutBody, RaveGeo, RaveService } from './rave.service';
import { RaveWebhookService } from './rave-webhook.service';

/*
 * Moon Rave checkout (cat-rave/CHECKOUT-SPEC.md section 4). Guest page, no login: public routes carry no
 * auth. They skip the global throttler (one site-wide bucket while TRUST_PROXY is unset) and count a
 * per-client-IP limit instead, like /yourcat and /badcat. Checkout routes answer 503 while
 * something they need is missing (GET /rave/status then says `enabled: false` with a reason); GET /rave/cats stays readable
 * so earlier orders keep their names. The webhook has its own gate (secret + signature). Admin routes need
 * AppAuthGuard + PermissionGuard. No route here writes a game score.
 */

const MINUTE = 60_000;
export const RAVE_THROTTLES: Record<string, ClientIpThrottleOptions> = {
    status: { limit: 60, ttl: MINUTE },
    checkout: { limit: 6, ttl: 10 * MINUTE },
    order: { limit: 30, ttl: MINUTE },
    usdcTx: { limit: 10, ttl: 10 * MINUTE },
    cats: { limit: 60, ttl: MINUTE },
    geo: { limit: 60, ttl: MINUTE },
    countries: { limit: 60, ttl: MINUTE },
};

@Controller('rave')
@SkipThrottle()
export class RaveController {
    constructor(
        private readonly rave: RaveService,
        private readonly webhooks: RaveWebhookService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    private throttle(name: keyof typeof RAVE_THROTTLES, req: any, res?: any) {
        return this.ipThrottler.consume(`RaveController.${name}`, req, RAVE_THROTTLES[name], res);
    }

    @Header('Cache-Control', 'public, max-age=30')
    @Get('status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('status', req, res);
        return this.rave.status();
    }

    @Post('checkout')
    async checkout(@Body() body: RaveCheckoutBody, @Req() req: any, @Res({ passthrough: true }) res: any) {
        this.rave.assertOpen();
        await this.throttle('checkout', req, res);
        return this.rave.checkout(body, new Date(), raveCountryFromRequest(req));
    }

    /** The visitor's IP country (rave-country.ts). Per visitor, so never cached by a shared cache. */
    @Header('Cache-Control', 'private, no-store')
    @Get('geo')
    async geo(@Req() req: any, @Res({ passthrough: true }) res: any): Promise<RaveGeo> {
        await this.throttle('geo', req, res);
        return { country: raveCountryFromRequest(req) };
    }

    /** Countries leaderboard: listed orders grouped by the buyer's country. Readable while checkout is off. */
    @Header('Cache-Control', 'public, max-age=15')
    @Get('countries')
    async countries(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('countries', req, res);
        return this.rave.listCountries();
    }

    @Header('Cache-Control', 'public, max-age=15')
    @Get('cats')
    async cats(@Query() query: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('cats', req, res);
        return this.rave.listCats(query || {});
    }

    @Header('Cache-Control', 'no-store')
    @Get('orders/:orderId')
    async order(@Param('orderId') orderId: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('order', req, res);
        return this.rave.getOrder(orderId);
    }

    @Post('orders/:orderId/usdc-tx')
    async usdcTx(
        @Param('orderId') orderId: string,
        @Body() body: { chainId?: unknown; txHash?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        this.rave.assertOpen();
        await this.throttle('usdcTx', req, res);
        return this.rave.reportUsdcTx(orderId, body);
    }

    @HttpCode(200)
    @Post('stripe/webhook')
    async webhook(@Req() req: RawBodyRequest<any>, @Headers('stripe-signature') signature: string) {
        const event = this.webhooks.verify(req.rawBody, signature);
        const outcome = await this.webhooks.handle(event);
        return { received: true, outcome };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Patch('orders/:orderId/moderation')
    async moderate(@Param('orderId') orderId: string, @Body() body: { hidden?: unknown }, @Req() req: any) {
        return this.rave.moderate(orderId, body?.hidden, req.user?._id ? String(req.user._id) : undefined);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('orders/:orderId/release')
    async release(@Param('orderId') orderId: string) {
        return this.rave.release(orderId);
    }
}
