import {
    Body,
    Controller,
    Get,
    Header,
    Param,
    Post,
    Put,
    Query,
    Res,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
    ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { CancelGoalDto, CreateGoalDto, DeliverGoalDto, PledgeDto, UpdateGoalDto } from './rescue-goal.dto';
import { RescueGoalPledgeService } from './rescue-goal-pledge.service';
import { GoalSurface, RECEIPT_MAX_BYTES, RescueGoalService, UploadedFileLike } from './rescue-goal.service';

const pipe = (expectedType: any) =>
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, expectedType });

/** P4 per-user throttle on gives (decision #44 sets the daily cap; this stops bursts). */
export const PLEDGE_USER_THROTTLE = { limit: 10, ttl: 60000 };
export const GOAL_UPLOAD_THROTTLE = { limit: 20, ttl: 60000 };

const surfaceOf = (value: unknown): GoalSurface => (value === 'app' ? 'app' : 'web');

/**
 * Rescue Goals (plan G5). Its own prefix, so nothing here can shadow ShelterController's
 * `/shelter/:id`. Inside the prefix every multi-segment path (`pledges/me`, `admin/goals`) has more
 * segments than `:id`, so `GET /rescue-goals/:id` never swallows them either (route spec).
 *
 * - Public: `GET /rescue-goals`, `GET /rescue-goals/:id` (`?surface=app` drops web-only fields).
 * - Registered players: `POST /rescue-goals/:id/pledge`, `GET /rescue-goals/pledges/me`. Guests get
 *   403 GUEST_FORBIDDEN from AppAuthGuard before any policy runs (F5.4); not on GUEST_ALLOW_LIST.
 * - MANAGER: create, edit, deliver (photo and receipt), cancel (refunds every give), and the
 *   manager views with funding, proof owner and the private receipt.
 */
@Controller('rescue-goals')
export class RescueGoalController {
    constructor(private readonly goals: RescueGoalService, private readonly pledges: RescueGoalPledgeService) {}

    @Get('')
    @Header('Cache-Control', 'public, max-age=30')
    async list(@Query('status') status?: string, @Query('limit') limit?: string, @Query('surface') surface?: string) {
        return this.goals.list({ status, limit }, surfaceOf(surface));
    }

    @UseGuards(AppAuthGuard)
    @Get('pledges/me')
    @Header('Cache-Control', 'private, no-store')
    async myGives(@AUTH_USER() user: IAuthUser) {
        return this.goals.myGives(user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('admin/goals')
    async managerList(@Query('status') status?: string, @Query('budgetMonth') budgetMonth?: string) {
        return this.goals.managerList({ status, budgetMonth });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('admin/goals/:id')
    async managerGet(@Param('id') id: string) {
        return this.goals.managerGet(id);
    }

    /** The private delivery receipt, for managers. No CDN, no cache. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('admin/goals/:id/receipt')
    async receipt(@Param('id') id: string, @Res() res: any) {
        const file = await this.goals.receipt(id);
        res.set({
            'Content-Type': file.mime,
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="receipt-${id}"`,
        });
        res.send(file.data);
    }

    @Get(':id')
    @Header('Cache-Control', 'public, max-age=30')
    async get(@Param('id') id: string, @Query('surface') surface?: string) {
        return this.goals.getPublic(id, surfaceOf(surface));
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(PLEDGE_USER_THROTTLE)
    @Post(':id/pledge')
    async pledge(@Param('id') id: string, @Body(pipe(PledgeDto)) body: PledgeDto, @AUTH_USER() user: IAuthUser) {
        return this.pledges.pledge(user, id, body);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('')
    async create(@Body(pipe(CreateGoalDto)) body: CreateGoalDto, @AUTH_USER() user: IAuthUser) {
        return this.goals.create(body, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put(':id')
    async update(@Param('id') id: string, @Body(pipe(UpdateGoalDto)) body: UpdateGoalDto) {
        return this.goals.update(id, body);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Throttle({ default: GOAL_UPLOAD_THROTTLE })
    @Post(':id/deliver')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'photo', maxCount: 1 },
                { name: 'receipt', maxCount: 1 },
            ],
            { limits: { fileSize: RECEIPT_MAX_BYTES } }
        )
    )
    async deliver(
        @Param('id') id: string,
        @Body(pipe(DeliverGoalDto)) body: DeliverGoalDto,
        @UploadedFiles() files: { photo?: UploadedFileLike[]; receipt?: UploadedFileLike[] },
        @AUTH_USER() user: IAuthUser
    ) {
        return this.goals.deliver(id, body, { photo: files?.photo?.[0], receipt: files?.receipt?.[0] }, user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post(':id/cancel')
    async cancel(
        @Param('id') id: string,
        @Body(pipe(CancelGoalDto)) body: CancelGoalDto,
        @AUTH_USER() user: IAuthUser
    ) {
        return this.goals.cancel(id, body.reason, user);
    }
}
