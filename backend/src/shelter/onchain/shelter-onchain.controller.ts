import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpException,
    HttpStatus,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
    ValidateIf,
} from 'class-validator';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ImpactEligibilityService } from 'src/impact/eligibility.service';
import { EligibilityResult } from 'src/impact/eligibility';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { isUsableClientIp, requestIp } from 'src/user/guest/ip-throttle';
import { isProxyUntrusted } from 'src/user/heist/proxy-warning';
import { DonateMe, DonateResult, DonateStatus, ShelterDonateService } from './shelter-donate.service';
import { DONATION_SOURCES, DonationSource } from './shelter-onchain.schema';
import { CatCard, encodePaymentResponses, PaymentRequiredException, ShelterX402Service } from './shelter-x402.service';
import { ChainClaimStatus, ChainClaimView, ClaimView, ShelterClaimService } from './shelter-claim.service';
import { MatchStatusView, ShelterMatchService } from './shelter-match.service';
import { RelayResult, RelayStatusView, ShelterRelayService } from './shelter-relay.service';
import { MatchStatus } from './shelter-onchain.schema';
import { shelterConfigFor } from './shelter-onchain.config';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^\d{1,78}$/;

/** A donor's signed EIP-3009 authorization to the DonateRouter. Base units; no other keys. */
export class ShelterRelayDto {
    @IsInt()
    @Min(1)
    @Max(2 ** 40)
    chainId: number;

    @Matches(ADDRESS)
    from: string;

    @Matches(UINT)
    value: string;

    @Matches(UINT)
    validAfter: string;

    @Matches(UINT)
    validBefore: string;

    @Matches(/^0x[0-9a-fA-F]{64}$/)
    salt: string;

    @IsString()
    @Matches(/^tt:wallet:[0-9a-f]{8}$/)
    memo: string;

    /** router.recipientsHash(value) the donor signed over: the payout list is part of the signature. */
    @Matches(/^0x[0-9a-fA-F]{64}$/)
    recipients: string;

    /** 65-byte ECDSA, or a longer ERC-1271/6492 blob for smart wallets (capped). */
    @Matches(/^0x[0-9a-fA-F]{130,4096}$/)
    signature: string;
}

/**
 * A shelter naming its payout wallet with a personal_sign signature by that wallet. v1: `chainId` and the
 * one-chain message. v2: `chains` (or `allChains: true`) and the multi-chain message; `chainId` optional.
 */
export class ShelterClaimDto {
    @ValidateIf(o => o.chains === undefined && o.allChains === undefined)
    @IsInt()
    @Min(1)
    @Max(2 ** 40)
    chainId?: number;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(32)
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(2 ** 40, { each: true })
    chains?: number[];

    @IsOptional()
    @IsBoolean()
    allChains?: boolean;

    @Matches(ADDRESS)
    wallet: string;

    @Matches(/^0x[0-9a-fA-F]{130}$/)
    signature: string;
}

export class ShelterDonateDto {
    @IsIn(DONATION_SOURCES as unknown as string[])
    source: DonationSource;

    /** The network the treat is paid on (GET /shelter/donate/status `chains`). Omitted: the main chain. */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(2 ** 40)
    chainId?: number;
}

const donatePipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

/** Per-IP limits, tighter than the global 300 per minute. Shared with the spec. */
export const SHELTER_DONATE_THROTTLE = { limit: 10, ttl: 60000 };
export const SHELTER_STATUS_THROTTLE = { limit: 60, ttl: 60000 };
export const SHELTER_X402_THROTTLE = { limit: 30, ttl: 60000 };
/** Relayed wallet gifts and wallet claims: a few tries per minute per IP. */
export const SHELTER_RELAY_THROTTLE = { limit: 10, ttl: 60000 };
export const SHELTER_CLAIM_THROTTLE = { limit: 5, ttl: 60000 };
/**
 * POST /shelter/donate/guest (no account): per IP, tighter than the signed-in route. The once-a-day
 * rule (per hashed address) and the per-chain daily budget are the real bounds.
 */
export const SHELTER_DONATE_GUEST_THROTTLE = { limit: 5, ttl: 60000 };
/** Per-user limit on POST /shelter/donate (plan G5 P4): one gift a day needs only a few tries. */
export const SHELTER_DONATE_USER_THROTTLE = { limit: 5, ttl: 60000 };

export type DonateMeResponse = DonateMe & { eligibility: EligibilityResult };

/** On-chain shelter gifts (ShelterSplit on Arc) and the x402 agent cat card. */
@Controller('shelter')
export class ShelterOnchainController {
    constructor(
        private donateService: ShelterDonateService,
        private x402Service: ShelterX402Service,
        private eligibility: ImpactEligibilityService,
        private relayService: ShelterRelayService,
        private matchService: ShelterMatchService,
        private claimService: ShelterClaimService
    ) {}

    /**
     * Public: a donor may have no account. The hot wallet submits the donor's signed authorization and
     * pays the gas; the USDC goes donor -> router -> ShelterSplit in that transaction.
     */
    @Throttle({ default: SHELTER_RELAY_THROTTLE })
    @HttpCode(200)
    @Post('relay')
    async relay(@Body(donatePipe) body: ShelterRelayDto, @Req() req: any): Promise<RelayResult> {
        return this.relayService.relay(body, req?.ip);
    }

    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('relay/:txHash')
    async relayStatus(@Param('txHash') txHash: string): Promise<RelayStatusView> {
        return this.relayService.status(txHash);
    }

    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('match/status')
    async matchStatus(@Query('chainId') chainId?: string): Promise<MatchStatusView> {
        // No chainId: the main chain. A chain the backend does not serve reads as "off" for that chain.
        if (chainId === undefined || chainId === '') {
            return this.matchService.status();
        }
        const config = shelterConfigFor(Number(chainId));
        if (!config) {
            const asked = Number(chainId);
            return {
                state: 'off',
                chainId: Number.isSafeInteger(asked) && asked > 0 ? asked : 0,
                relay: false,
                perGift: '0',
                dailyLeft: '0',
                poolLeft: '0',
            };
        }
        return this.matchService.status(new Date(), config);
    }

    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('match/by-donor/:txHash')
    async matchByDonor(
        @Param('txHash') txHash: string
    ): Promise<{ status: MatchStatus | 'none'; matchTxHash: string | null }> {
        return this.matchService.byDonor(txHash);
    }

    /** Public: the shelter proves the wallet with its signature; the rotation itself is manual. */
    @Throttle({ default: SHELTER_CLAIM_THROTTLE })
    @HttpCode(200)
    @Post('claim')
    async claim(@Body(donatePipe) body: ShelterClaimDto): Promise<{ status: string; chains?: ChainClaimStatus[] }> {
        return this.claimService.claim(body);
    }

    /** Every chain a claim can cover, each with its latest public claim (approved or rotated) or null. */
    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('claim/chains')
    async claimChains(): Promise<ChainClaimView[]> {
        return this.claimService.chainsView();
    }

    /** The latest claim, or a JSON `null` (an explicit body: Nest would send an empty one for null). */
    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('claim')
    async latestClaim(@Res() res: any): Promise<ClaimView | null> {
        const claim = await this.claimService.latest();
        res.json(claim);
        return claim;
    }

    /**
     * A registered account's treat, keyed by the account. Guests (anonymous Firebase users) are
     * refused by AppAuthGuard (no @AllowGuest) and use POST /shelter/donate/guest instead. Since Oct 8,
     * 2026 there is no account-age, email or saved-game rule (F7.5 instant treat is open).
     */
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(SHELTER_DONATE_USER_THROTTLE)
    @Throttle({ default: SHELTER_DONATE_THROTTLE })
    @HttpCode(200)
    @Post('donate')
    async donate(@AUTH_USER() user: IAuthUser, @Body(donatePipe) body: ShelterDonateDto): Promise<DonateResult> {
        // No chainId (or null): the main chain, the call exactly as before.
        return body.chainId === undefined || body.chainId === null
            ? this.donateService.donate(String(user._id), body.source)
            : this.donateService.donate(String(user._id), body.source, undefined, body.chainId);
    }

    /**
     * A treat with no sign-in at all (Oct 8, 2026): no accesstoken needed. Once a UTC day per client
     * address (a daily salted hash, never the raw address), plus the per-chain daily budget and a
     * tight per-IP throttle. In production without TRUST_PROXY every caller shares the balancer's
     * address, so the route refuses rather than let one visitor use up everyone's treat.
     */
    @Throttle({ default: SHELTER_DONATE_GUEST_THROTTLE })
    @HttpCode(200)
    @Post('donate/guest')
    async donateGuest(@Body(donatePipe) body: ShelterDonateDto, @Req() req: any): Promise<DonateResult> {
        const ip = guestTreatIp(req);
        return body.chainId === undefined || body.chainId === null
            ? this.donateService.donateGuest(ip, body.source)
            : this.donateService.donateGuest(ip, body.source, undefined, body.chainId);
    }

    /** Today's treat for a caller without an account (same address key as POST donate/guest). */
    @Throttle({ default: SHELTER_STATUS_THROTTLE })
    @Get('donate/guest/me')
    async donateGuestMe(@Req() req: any): Promise<DonateMeResponse> {
        const [me, eligibility] = await Promise.all([
            this.donateService.meGuest(guestTreatIp(req)),
            this.eligibility.instantTreat(null),
        ]);
        return { ...me, eligibility };
    }

    /**
     * Public and user-free: rail state, today's budget and the confirmed community total, plus `chains`:
     * every network a treat can be sent on, each with its own state, coin and budget.
     */
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
        @Headers('payment-signature') paymentV2: string | undefined,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<CatCard> {
        const resource = x402ResourceUrl(req);
        try {
            // x402 v1 sends X-PAYMENT, v2 PAYMENT-SIGNATURE; both carry base64 JSON.
            const { card, txHash } = await this.x402Service.catCard(payment || paymentV2, resource);
            const responses = encodePaymentResponses(txHash);
            res.setHeader('X-PAYMENT-RESPONSE', responses.v1);
            res.setHeader('PAYMENT-RESPONSE', responses.v2);
            return card;
        } catch (error) {
            if (error instanceof PaymentRequiredException) {
                res.setHeader('PAYMENT-REQUIRED', error.paymentRequiredV2);
            }
            throw error;
        }
    }
}

/**
 * The client address a guest treat is keyed on. Refused with 503 when it cannot tell clients apart
 * in production (TRUST_PROXY unset, or a private/balancer address), so one visitor cannot spend
 * the shared key for everyone. Development keys on whatever address it sees.
 */
export function guestTreatIp(req: any, env: NodeJS.ProcessEnv = process.env): string {
    const ip = requestIp(req);
    if (env.NODE_ENV === 'production' && (isProxyUntrusted(env) || !isUsableClientIp(ip))) {
        throw new HttpException(
            {
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                message: 'Treats without an account are paused right now. Sign in to send one.',
            },
            HttpStatus.SERVICE_UNAVAILABLE
        );
    }
    return ip;
}

/**
 * The paid resource's URL for the 402 `resource` field, without the query string. Behind the TLS
 * proxy Express sees http, so the first X-Forwarded-Proto wins, and production is always https.
 */
export function x402ResourceUrl(req: any, env: NodeJS.ProcessEnv = process.env): string {
    const forwarded = String(req.headers?.['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    const proto =
        env.NODE_ENV === 'production'
            ? 'https'
            : forwarded === 'https' || forwarded === 'http'
            ? forwarded
            : req.protocol || 'http';
    const host = req.get?.('host') || 'localhost';
    return `${proto}://${host}${String(req.originalUrl || req.url || '').split('?')[0]}`;
}
