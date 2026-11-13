import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { accountIdOf } from '../pawlegends-account-id';
import { PAWLEGENDS_ERRORS } from '../pawlegends.errors';
import { PawlegendsProgressService } from './progress.service';

/*
 * Account progress (gap plan P2 `rewards-cloud`): `GET /pawlegends/progress` reads, `POST /pawlegends/progress
 * {blob}` max-merges the client's cosmetic-progress blob and answers the same view. Guests with an account document
 * too (their `/live` saves earn the Welcome Path, mastery and the Lucky Treat). Neither route writes a score, counts a
 * match or draws a Lucky Treat: those happen only in `POST /user/catbassadors/live`.
 */

const MINUTE = 60_000;
/** The blob as a JSON string (the game's bridge sends flat string args) is at most this long. */
export const PROGRESS_BLOB_MAX = 30_000;

const needAccount = () =>
    new ForbiddenException({ statusCode: 403, code: 'need_account', message: 'Progress needs an account session' });

@Controller('pawlegends')
@SkipThrottle()
export class PawlegendsProgressController {
    constructor(
        private readonly progress: PawlegendsProgressService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('progress')
    async get(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsProgress.get', req, { limit: 60, ttl: MINUTE }, res);
        const id = accountIdOf(req);
        if (!id) throw needAccount();
        return this.progress.view(id);
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('progress')
    async post(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsProgress.post', req, { limit: 30, ttl: MINUTE }, res);
        const id = accountIdOf(req);
        if (!id) throw needAccount();
        return this.progress.sync(id, parseBlob(body?.blob));
    }
}

/** `blob`: an object, or its JSON string (at most PROGRESS_BLOB_MAX characters). */
export function parseBlob(v: unknown): unknown {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v !== 'string' || v.length > PROGRESS_BLOB_MAX) throw PAWLEGENDS_ERRORS.invalid('blob is required');
    try {
        return JSON.parse(v);
    } catch {
        throw PAWLEGENDS_ERRORS.invalid('blob is not JSON');
    }
}
