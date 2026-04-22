import { Body, Controller, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { getSlug } from 'src/shared/utils/content.utils';
import { Shelter } from 'src/shelter/shelter.schema';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserService } from 'src/user/user.service';
import { ShelterRepository } from './shelter.repository';

@Controller('shelter')
export class ShelterController {
    constructor(private repository: ShelterRepository, private userService: UserService) {}

    @UseGuards(AuthGuard('appauth'))
    @Get('')
    async find(): Promise<Shelter[]> {
        return this.repository.find({
            searchObject: {},
            projection: '-blessing -users',
            populate: [{ path: 'image', select: 'url' }],
        });
    }

    @UseGuards(AuthGuard('appauth'))
    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Shelter> {
        return this.repository.findOne({
            searchObject: { _id: id },
            projection: '-code',
            populate: [{ path: 'image', select: 'url' }],
        });
    }
    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('')
    async create(@Body() object: Shelter): Promise<Shelter> {
        const wallets = this.userService.generateWallets();
        return this.repository.create({ ...object, slug: getSlug(object.name), wallets });
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put(':id')
    async update(@Param('id') id: string, @Body() object: Shelter): Promise<Shelter> {
        const existingEntity = await this.repository.findOne({
            searchObject: { _id: id },
        });

        if (!existingEntity) {
            throw new NotFoundException();
        }
        return this.repository.update(existingEntity?._id, object);
    }
}
