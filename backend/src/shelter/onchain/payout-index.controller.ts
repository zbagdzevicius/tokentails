import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
    parsePayoutsQuery,
    PAYOUTS_CACHE_CONTROL,
    PublicPayouts,
    ShelterPayoutIndexService,
} from './payout-index.service';

/** Per IP: a page view makes one or two calls; a CDN or the 30 s cache answers the rest. */
export const SHELTER_PAYOUTS_THROTTLE = { limit: 60, ttl: 60000 };

/**
 * GET /shelter/payouts: the indexed ShelterSplit payouts (public on-chain events), for the payouts
 * page, the Heist modal and the shelter-rail widget. Read only, no account. Registered before
 * ShelterController, whose GET /shelter/:id would otherwise answer it.
 */
@Controller('shelter')
export class ShelterPayoutsController {
    constructor(private index: ShelterPayoutIndexService) {}

    @Throttle({ default: SHELTER_PAYOUTS_THROTTLE })
    @Get('payouts')
    async payouts(@Query() raw: Record<string, unknown>, @Res({ passthrough: true }) res: any): Promise<PublicPayouts> {
        const query = parsePayoutsQuery(raw || {});
        if (typeof query === 'string') {
            throw new BadRequestException(query);
        }
        const body = await this.index.list(query);
        res?.setHeader?.('Cache-Control', PAYOUTS_CACHE_CONTROL);
        // Public chain data, read without credentials: any site (the shelter-rail widget is embedded
        // anywhere) may read it. The app-wide CORS answer wins when it already allowed the origin.
        if (!res?.getHeader?.('Access-Control-Allow-Origin')) {
            res?.setHeader?.('Access-Control-Allow-Origin', '*');
        }
        return body;
    }
}
