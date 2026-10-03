import { BadRequestException, Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { pickSearchParams, SearchModel } from 'src/common/validators';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { Ticket } from 'src/ticket/ticket.schema';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { IController } from '../shared/interfaces/controller.interface';
import { TicketRepository } from './ticket.repository';
import { UserRepository } from 'src/user/user.repository';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';

@Controller('ticket')
export class TicketController implements IController<Ticket> {
    constructor(private repository: TicketRepository, private userRepository: UserRepository) {}

    async findOne(@Param('_id') _id: string): Promise<Ticket> {
        return this.repository.findOne({
            searchObject: { _id },
        });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('search')
    async search(@Body() params: SearchModel): Promise<Ticket[]> {
        return this.repository.find({
            ...pickSearchParams(params),
            perPage: params.perPage || 100,
        });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('search/unanswered')
    async searchUnanswered(@Body() params: SearchModel): Promise<Ticket[]> {
        return this.repository.find({
            searchObject: { answer: '' },
            ...pickSearchParams(params),
            perPage: params.perPage || 100,
            populate: [{ path: 'user', select: 'twitter email spent' }],
        });
    }

    @UseGuards(AppAuthGuard)
    @Get()
    async getUserTickets(@USER_ID() userId: string): Promise<Ticket[]> {
        return this.repository.find({
            searchObject: { user: userId },
        });
    }

    @UseGuards(AppAuthGuard)
    @Post('')
    async create(@Body() object: Ticket, @USER_ID() userId: Types.ObjectId): Promise<Ticket> {
        const doesTodayTicketExist = await this.repository.findOne({
            searchObject: {
                user: userId,
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        });
        if (doesTodayTicketExist) {
            throw new BadRequestException('You have already created a ticket today');
        }
        return this.repository.create({ message: object.message, user: userId, answer: '' });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Put(':id')
    async update(@Param('id') id: string, @Body() object: Ticket): Promise<Ticket> {
        return this.repository.update(id, { answer: object.answer });
    }

    async delete(): Promise<any> {
        throw Error('not implemented');
    }
}
