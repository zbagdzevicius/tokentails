import {
    Body,
    Controller,
    Delete,
    Get,
    Optional,
    Param,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { OUTCOME_IMAGE_MAX_BYTES } from './outcome-image';
import { OutcomeRedactionDto, OutcomeView, OutcomeWriteDto, ShelterOutcomeService } from './outcomes.service';
import { ImpactService } from './impact.service';
import { PawSettlementService } from './paws.service';
import {
    ImpactPayoutService,
    PayoutConfirmDto,
    PayoutSignatureDto,
    PayoutView,
    PayoutWriteDto,
    RECEIPT_MAX_BYTES,
    UploadedReceipt,
} from './payouts.service';

const pipe = (expectedType: any) =>
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, expectedType });

/** Write routes that carry a file are slower and rarer. */
export const IMPACT_UPLOAD_THROTTLE = { limit: 20, ttl: 60000 };

/**
 * Impact MANAGER and ADMIN routes (plan F7.3, G4 "Attestation", G11 outcomes):
 *
 * - payouts: drafts (MANAGER), confirmation by a shelter member who is not the author, EIP-191
 *   signatures after handover. Members are granted by an ADMIN through PUT /shelter/:id/members.
 * - outcomes/manage: drafting, the redaction pipeline, the redaction checkbox and the second-reviewer
 *   approval that publishes. The public list stays GET /impact/outcomes (ImpactController).
 * - paws: the ADMIN view of nightly settlements and an idempotent manual run.
 *
 * Every id in a path is a public id (`p-...`, `o-...`) or a UTC day.
 */
@Controller('impact')
export class ImpactAdminController {
    constructor(
        private payouts: ImpactPayoutService,
        private outcomes: ShelterOutcomeService,
        private paws: PawSettlementService,
        @Optional() private impact?: ImpactService
    ) {}

    // Payouts -------------------------------------------------------------------------------------

    @UseGuards(AppAuthGuard)
    @Get('payouts')
    async listPayouts(
        @AUTH_USER() user: IAuthUser,
        @Query('shelter') shelter?: string,
        @Query('status') status?: string
    ): Promise<PayoutView[]> {
        return this.payouts.list(user, { shelter, status });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Throttle({ default: IMPACT_UPLOAD_THROTTLE })
    @Post('payouts')
    @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: RECEIPT_MAX_BYTES } }))
    async createPayout(
        @Body(pipe(PayoutWriteDto)) body: PayoutWriteDto,
        @UploadedFile() receipt: UploadedReceipt,
        @AUTH_USER() user: IAuthUser
    ): Promise<PayoutView> {
        return this.payouts.createDraft(body, receipt, user);
    }

    @UseGuards(AppAuthGuard)
    @Get('payouts/:id')
    async getPayout(@Param('id') id: string, @AUTH_USER() user: IAuthUser): Promise<PayoutView> {
        return this.payouts.get(id, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Throttle({ default: IMPACT_UPLOAD_THROTTLE })
    @Put('payouts/:id')
    @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: RECEIPT_MAX_BYTES } }))
    async updatePayout(
        @Param('id') id: string,
        @Body(pipe(PayoutWriteDto)) body: PayoutWriteDto,
        @UploadedFile() receipt: UploadedReceipt,
        @AUTH_USER() user: IAuthUser
    ): Promise<PayoutView> {
        return this.payouts.updateDraft(id, body, receipt, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('payouts/:id/void')
    async voidPayout(@Param('id') id: string, @AUTH_USER() user: IAuthUser): Promise<PayoutView> {
        return this.payouts.voidPayout(id, user);
    }

    /** A shelter member (any permission level) who did not write the draft. */
    @UseGuards(AppAuthGuard)
    @Throttle({ default: IMPACT_UPLOAD_THROTTLE })
    @Post('payouts/:id/confirm')
    @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: RECEIPT_MAX_BYTES } }))
    async confirmPayout(
        @Param('id') id: string,
        @Body(pipe(PayoutConfirmDto)) body: PayoutConfirmDto,
        @UploadedFile() receipt: UploadedReceipt,
        @AUTH_USER() user: IAuthUser
    ): Promise<PayoutView> {
        return this.payouts.confirm(id, body, receipt, user);
    }

    @UseGuards(AppAuthGuard)
    @Throttle({ default: IMPACT_UPLOAD_THROTTLE })
    @Post('payouts/:id/signature')
    async signPayout(
        @Param('id') id: string,
        @Body(pipe(PayoutSignatureDto)) body: PayoutSignatureDto,
        @AUTH_USER() user: IAuthUser
    ): Promise<PayoutView> {
        return this.payouts.sign(id, body, user);
    }

    // Outcomes ------------------------------------------------------------------------------------

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('outcomes/manage')
    async listOutcomes(@AUTH_USER() user: IAuthUser, @Query('status') status?: string): Promise<OutcomeView[]> {
        return this.outcomes.list(user, { status });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('outcomes/manage')
    async createOutcome(
        @Body(pipe(OutcomeWriteDto)) body: OutcomeWriteDto,
        @AUTH_USER() user: IAuthUser
    ): Promise<OutcomeView> {
        return this.outcomes.create(body, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('outcomes/manage/:id')
    async getOutcome(@Param('id') id: string, @AUTH_USER() user: IAuthUser): Promise<OutcomeView> {
        return this.outcomes.get(id, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put('outcomes/manage/:id')
    async updateOutcome(
        @Param('id') id: string,
        @Body(pipe(OutcomeWriteDto)) body: OutcomeWriteDto,
        @AUTH_USER() user: IAuthUser
    ): Promise<OutcomeView> {
        return this.outcomes.update(id, body, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Throttle({ default: IMPACT_UPLOAD_THROTTLE })
    @Post('outcomes/manage/:id/image')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: OUTCOME_IMAGE_MAX_BYTES } }))
    async setOutcomeImage(
        @Param('id') id: string,
        @UploadedFile() file: { buffer?: Buffer },
        @Body('regions') regions: unknown,
        @AUTH_USER() user: IAuthUser
    ): Promise<OutcomeView> {
        return this.outcomes.setImage(id, file, regions, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Delete('outcomes/manage/:id/image')
    async removeOutcomeImage(@Param('id') id: string, @AUTH_USER() user: IAuthUser): Promise<OutcomeView> {
        return this.outcomes.removeImage(id, user);
    }

    /** The processed image for the reviewers' preview. Private: no CDN, no cache. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('outcomes/manage/:id/image')
    async outcomeImage(@Param('id') id: string, @Res() res: any) {
        const data = await this.outcomes.imageBytes(id);
        res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' });
        res.send(data);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put('outcomes/manage/:id/redaction')
    async setRedaction(
        @Param('id') id: string,
        @Body(pipe(OutcomeRedactionDto)) body: OutcomeRedactionDto,
        @AUTH_USER() user: IAuthUser
    ): Promise<OutcomeView> {
        return this.outcomes.setRedacted(id, body.redacted, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('outcomes/manage/:id/approve')
    async approveOutcome(@Param('id') id: string, @AUTH_USER() user: IAuthUser): Promise<OutcomeView> {
        return this.outcomes.approve(id, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('outcomes/manage/:id/unpublish')
    async unpublishOutcome(@Param('id') id: string, @AUTH_USER() user: IAuthUser): Promise<OutcomeView> {
        const view = await this.outcomes.unpublish(id, user);
        // Off the stored snapshots now, not at the next hourly build (a missed face cannot wait an hour).
        await this.impact?.withdrawOutcome(view.id);
        return view;
    }

    // Paws ----------------------------------------------------------------------------------------

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('paws/settlements')
    async pawSettlements() {
        return this.paws.adminList();
    }

    /** Idempotent: a settled day returns its row; `retry: true` only re-opens a send that certainly did not pay. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Post('paws/:day/settle')
    async settle(@Param('day') day: string, @Body() body: { retry?: boolean }) {
        const result = body?.retry === true ? await this.paws.retryFailed(day) : await this.paws.settleDay(day);
        return { outcome: result.outcome, settlement: this.paws.adminView(result.settlement) };
    }
}
