import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { DonateResult, DonateStatus, ShelterDonateService } from './shelter-donate.service';
import { DONATION_SOURCES, DonationSource } from './shelter-onchain.schema';
import { CatCard, encodePaymentResponse, ShelterX402Service } from './shelter-x402.service';

export class ShelterDonateDto {
    @IsIn(DONATION_SOURCES as unknown as string[])
    source: DonationSource;
}

const donatePipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

/** Per-IP limits, tighter than the global 300 per minute. Shared with the spec. */
export const SHELTER_DONATE_THROTTLE = { limit: 10, ttl: 60000 };
export const SHELTER_STATUS_THROTTLE = { limit: 60, ttl: 60000 };
export const SHELTER_X402_THROTTLE = { limit: 30, ttl: 60000 };

/** On-chain shelter gifts (ShelterSplit on Arc) and the x402 agent cat card. */
@Controller('shelter')
export class ShelterOnchainController {
    constructor(private donateService: ShelterDonateService, private x402Service: ShelterX402Service) {}

    @UseGuards(AuthGuard('appauth'))
    @Throttle({ default: SHELTER_DONATE_THROTTLE })
    @HttpCode(200)
    @Post('donate')
    async donate(@USER_ID() userId: string, @Body(donatePipe) body: ShelterDonateDto): Promise<DonateResult> {
        return this.donateService.donate(String(userId), body.source);
    }

    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('donate/status')
    async donateStatus(): Promise<DonateStatus> {
        return this.donateService.status();
    }

    @Throttle({ default: SHELTER_X402_THROTTLE })
    @Get('agent/cat-card')
    async catCard(
        @Headers('x-payment') payment: string | undefined,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<CatCard> {
        const resource = `${req.protocol}://${req.get?.('host') || 'localhost'}${req.originalUrl || req.url}`;
        const { card, txHash } = await this.x402Service.catCard(payment, resource.split('?')[0]);
        res.setHeader('X-PAYMENT-RESPONSE', encodePaymentResponse(txHash));
        return card;
    }
}
