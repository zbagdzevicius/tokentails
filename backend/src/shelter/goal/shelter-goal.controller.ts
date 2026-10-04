import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ShelterGoalView } from 'src/shared-contracts/shelter-goal';
import { PublicShelterGallery, ShelterGalleryService } from './shelter-gallery.service';
import { ShelterGoalService } from './shelter-goal.service';

/** Per-IP limit for the two public reads (pages poll the goal once a minute). */
export const SHELTER_GOAL_THROTTLE = { limit: 60, ttl: 60000 };

const GOAL_ID = /^C-\d{3}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Public, no account: the campaign goal's count and the showcase shelter's cat gallery. */
@Controller('shelter')
export class ShelterGoalController {
    constructor(private goals: ShelterGoalService, private galleries: ShelterGalleryService) {}

    /** The USDC that came in to the campaign wallets (fact `id`), counted from the chain. */
    @Throttle({ default: SHELTER_GOAL_THROTTLE })
    @Get('goal/:id')
    async goal(@Param('id') id: string): Promise<ShelterGoalView> {
        if (!GOAL_ID.test(id || '')) throw new NotFoundException('No such goal');
        return this.goals.view(id);
    }

    /** Every showable cat of a showcase shelter, uncapped (GET /cat/sale stops at 200 per shelter). */
    @Throttle({ default: SHELTER_GOAL_THROTTLE })
    @Get(':slug/gallery')
    async gallery(@Param('slug') slug: string): Promise<PublicShelterGallery> {
        if (!SLUG.test(slug || '') || slug.length > 80) throw new NotFoundException('No gallery for this shelter');
        return this.galleries.gallery(slug);
    }
}
