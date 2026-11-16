import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { FlagsService } from './flags.service';

const MIN = 60_000;
const LIMITS: Record<'get' | 'set', ClientIpThrottleOptions> = {
    get: { limit: 30, ttl: MIN },
    set: { limit: 10, ttl: MIN },
};

/*
 * Country flags (docs/plans/moba/FLAGS.md). The flag is the ISO country Cloudflare puts on the request
 * (`cf-ipcountry`); the IP is never read for this, stored or logged. Guests too (their account id keys the row).
 */
@Controller('pawlegends/flag')
@SkipThrottle()
export class PawlegendsFlagsController {
    constructor(private readonly flags: FlagsService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    private account(req: any): string | null {
        const id = req?.user?._id ?? req?.user?.id;
        return id && !req?.user?.transient ? String(id) : null;
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Header('Cache-Control', 'private, no-store')
    @Get()
    async mine(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsFlags.get', req, LIMITS.get, res);
        return this.flags.mine(this.account(req), req?.headers?.['cf-ipcountry']);
    }

    /** `{hideFlag: boolean}`: hide (a neutral paw) or show the flag to other players. */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post()
    async set(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsFlags.set', req, LIMITS.set, res);
        const account = this.account(req);
        if (!account)
            throw new BadRequestException({ statusCode: 400, code: 'PAWLEGENDS_FLAG_ACCOUNT', message: 'No account' });
        if (typeof body?.hideFlag !== 'boolean')
            throw new BadRequestException({
                statusCode: 400,
                code: 'PAWLEGENDS_FLAG_INVALID',
                message: 'hideFlag must be a boolean',
            });
        return this.flags.setHidden(account, body.hideFlag, req?.headers?.['cf-ipcountry']);
    }
}
