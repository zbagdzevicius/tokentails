import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ImpactEligibilityService } from 'src/impact/eligibility.service';
import { EligibilityResult } from 'src/impact/eligibility';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { DonateMe, DonateResult, DonateStatus, ShelterDonateService } from './shelter-donate.service';
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
/** Per-user limit on POST /shelter/donate (plan G5 P4): one gift a day needs only a few tries. */
export const SHELTER_DONATE_USER_THROTTLE = { limit: 5, ttl: 60000 };

export type DonateMeResponse = DonateMe & { eligibility: EligibilityResult };

/** On-chain shelter gifts (ShelterSplit on Arc) and the x402 agent cat card. */
@Controller('shelter')
export class ShelterOnchainController {
    constructor(
        private donateService: ShelterDonateService,
        private x402Service: ShelterX402Service,
        private eligibility: ImpactEligibilityService
    ) {}

    /**
     * Guests are refused by AppAuthGuard (no @AllowGuest) before the F7.5 instant-treat policy runs:
     * registered, email verified, account at least 24 h old, at least one saved game.
     */
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(SHELTER_DONATE_USER_THROTTLE)
    @Throttle({ default: SHELTER_DONATE_THROTTLE })
    @HttpCode(200)
    @Post('donate')
    async donate(@AUTH_USER() user: IAuthUser, @Body(donatePipe) body: ShelterDonateDto): Promise<DonateResult> {
        await this.eligibility.assertInstantTreat(user);
        return this.donateService.donate(String(user._id), body.source);
    }

    /** Public and user-free: rail state, today's budget and the confirmed community total. */
    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('donate/status')
    async donateStatus(): Promise<DonateStatus> {
        return this.donateService.status();
    }

    /** The caller's own treats and whether they may send one now. Registered accounts only. */
    @UseGuards(AppAuthGuard)
    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('donate/me')
    async donateMe(@AUTH_USER() user: IAuthUser): Promise<DonateMeResponse> {
        const [me, eligibility] = await Promise.all([
            this.donateService.me(String(user._id)),
            this.eligibility.instantTreat(user),
        ]);
        return { ...me, eligibility };
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
