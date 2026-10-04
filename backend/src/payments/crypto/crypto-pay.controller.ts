import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { ConfirmBody, CreateOrderBody, CryptoCheckoutService } from './crypto-checkout.service';
import { CryptoShelterShareService } from './crypto-shelter-share.service';

export const CRYPTO_PAY_CONFIG_THROTTLE = { limit: 60, ttl: 60000 };
export const CRYPTO_PAY_CREATE_THROTTLE = { limit: 10, ttl: 60000 };
export const CRYPTO_PAY_CONFIRM_THROTTLE = { limit: 20, ttl: 60000 };

/** Crypto checkout: USDC and EURC on every integrated EVM chain (docs/API.md "Crypto checkout"). */
@Controller('payments/crypto')
export class CryptoPayController {
    constructor(private checkout: CryptoCheckoutService, private shelterShare: CryptoShelterShareService) {}

    @Throttle({ default: CRYPTO_PAY_CONFIG_THROTTLE })
    @Get('config')
    config() {
        return this.checkout.publicConfig();
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(CRYPTO_PAY_CREATE_THROTTLE)
    @Post('orders')
    @HttpCode(201)
    create(@USER_ID() userId: string, @Body() body: CreateOrderBody) {
        return this.checkout.createOrder(userId, body || {});
    }

    @UseGuards(AppAuthGuard)
    @Get('orders/:orderId')
    order(@USER_ID() userId: string, @Param('orderId') orderId: string) {
        return this.checkout.getOrder(userId, orderId);
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(CRYPTO_PAY_CONFIRM_THROTTLE)
    @Post('orders/:orderId/confirm')
    async confirm(
        @USER_ID() userId: string,
        @Param('orderId') orderId: string,
        @Body() body: ConfirmBody,
        @Res({ passthrough: true }) res: { status: (code: number) => unknown }
    ) {
        const result = await this.checkout.confirm(userId, orderId, body || {});
        res.status(result.httpStatus);
        return result.body;
    }

    /** Finishes paid orders whose grant never stored a result (it also runs every 5 minutes). */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Post('recover-grants')
    @HttpCode(200)
    recoverGrants() {
        return this.checkout.recoverStuckGrants();
    }

    /** Runs the shelter-share keeper once (it also runs every 5 minutes when enabled). */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Post('shelter-share/run')
    @HttpCode(200)
    runShelterShare() {
        return this.shelterShare.runOnce();
    }
}
