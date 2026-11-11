import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { REPORT_LIMITS } from './report.contracts';
import { ReportService } from './report.service';

/*
 * PvP reports (SOCIAL-RANKED.md §8.3, §8.5). Players (guests too: they sit in PvP on guest accounts) file a report;
 * moderators (PermissionGuard level 2) list, inspect and resolve. No route writes a score.
 */

const userOf = (req: any): { id: string; guest: boolean } | null => {
    const id = req?.user?._id ?? req?.user?.id;
    if (!id || req?.user?.transient) return null;
    return { id: String(id), guest: !!req.user.isGuest };
};

@Controller('pawlegends')
@SkipThrottle()
export class PawlegendsReportsController {
    constructor(private readonly reports: ReportService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    /** `{room, slot, reason, note?, tick?}` → 201 `{ok}` new, 200 `{ok, already}` repeat. */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Post('reports')
    async report(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume(
            'PawlegendsReportsController.report',
            req,
            { limit: REPORT_LIMITS.ipLimit, ttl: REPORT_LIMITS.ipTtlMs },
            res
        );
        const user = userOf(req);
        if (!user) {
            res?.status?.(401);
            return { ok: false };
        }
        const { created } = await this.reports.report(user, body || {});
        res?.status?.(created ? 201 : 200);
        return created ? { ok: true } : { ok: true, already: true };
    }

    /** A moderator warn, shown once at the next title visit. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('reports/notice')
    async notice(@Req() req: any) {
        const user = userOf(req);
        return { warn: user ? await this.reports.takeWarn(user.id) : false };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('admin/reports')
    list(@Query() query: Record<string, unknown>) {
        return this.reports.list(query || {});
    }

    // before admin/reports/:accountId
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('admin/reports/stats')
    stats(@Query('days') days?: string) {
        return this.reports.stats(days);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('admin/reports/:accountId')
    detail(@Param('accountId') accountId: string) {
        return this.reports.detail(accountId);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @HttpCode(200)
    @Post('admin/reports/:accountId/resolve')
    resolve(@Param('accountId') accountId: string, @Body() body: Record<string, unknown>, @Req() req: any) {
        return this.reports.resolve(accountId, userOf(req)?.id ?? 'unknown', body || {});
    }
}
