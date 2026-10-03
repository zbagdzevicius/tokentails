import { Controller, Get, Optional, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ShelterDonateService } from 'src/shelter/onchain/shelter-donate.service';
import { EligibilityResult } from './eligibility';
import { ImpactEligibilityService } from './eligibility.service';
import { PublicImpact } from './impact-public';
import { ImpactHistoryPoint, ImpactService } from './impact.service';
import { PublicOutcomeItem, ShelterOutcomeService } from './outcomes.service';
import { PawSettlementService, PawsMe } from './paws.service';

export const IMPACT_PUBLIC_THROTTLE = { limit: 60, ttl: 60000 };

export interface ImpactMe {
    treats: {
        confirmedCount: number;
        onTheirWayCount: number;
        totalConfirmedWei: string;
        lastConfirmedAt: string | null;
    };
    instantTreat: EligibilityResult;
    /** Today's paw progress, lifetime paws, the latest settlement and the caller's Merkle proof (G4). */
    paws: PawsMe | null;
    /** Rescue Goal pledges land with G5 (task 5f). */
    pledge: null;
}

export interface ImpactOutcomes {
    published: number;
    items: PublicOutcomeItem[];
    asOf: string | null;
}

/**
 * Impact and truth data (plan F7.3). The public routes serve only the whitelisted snapshot shape;
 * `/impact/me` needs a registered account (guests get 403 GUEST_FORBIDDEN from AppAuthGuard).
 * The MANAGER and ADMIN payout, confirmation, signature, outcome and paw routes are in
 * ImpactAdminController; shelter members are granted through PUT /shelter/:id/members.
 */
@Controller('impact')
export class ImpactController {
    constructor(
        private impact: ImpactService,
        private donateService: ShelterDonateService,
        private eligibility: ImpactEligibilityService,
        @Optional() private paws?: PawSettlementService,
        @Optional() private outcomeService?: ShelterOutcomeService
    ) {}

    @Throttle({ default: IMPACT_PUBLIC_THROTTLE })
    @Get('')
    async latest(): Promise<PublicImpact> {
        return this.impact.latest();
    }

    @Throttle({ default: IMPACT_PUBLIC_THROTTLE })
    @Get('history')
    async history(@Query('days') days?: string): Promise<{ points: ImpactHistoryPoint[] }> {
        return { points: await this.impact.history(Number(days) || 30) };
    }

    @Throttle({ default: IMPACT_PUBLIC_THROTTLE })
    @Get('outcomes')
    async outcomes(): Promise<ImpactOutcomes> {
        if (this.outcomeService) {
            const live = await this.outcomeService.publicOutcomes();
            return { ...live, asOf: new Date().toISOString() };
        }
        const latest = await this.impact.latest();
        return {
            published: latest.outcomes.published,
            items: latest.outcomes.items as PublicOutcomeItem[],
            asOf: latest.asOf.mongo,
        };
    }

    @UseGuards(AppAuthGuard)
    @Throttle({ default: IMPACT_PUBLIC_THROTTLE })
    @Get('me')
    async me(@AUTH_USER() user: IAuthUser): Promise<ImpactMe> {
        const [treats, instantTreat, paws] = await Promise.all([
            this.donateService.me(String(user._id)),
            this.eligibility.instantTreat(user),
            this.paws ? this.paws.me(user) : Promise.resolve(null),
        ]);
        return {
            treats: {
                confirmedCount: treats.confirmedCount,
                onTheirWayCount: treats.onTheirWayCount,
                totalConfirmedWei: treats.totalConfirmedWei,
                lastConfirmedAt: treats.lastConfirmedAt,
            },
            instantTreat,
            paws,
            pledge: null,
        };
    }
}
