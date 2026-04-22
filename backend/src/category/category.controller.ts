import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Category } from 'src/category/category.schema';
import { SearchModel } from 'src/common/validators';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { IController } from '../shared/interfaces/controller.interface';
import { getSlug } from '../shared/utils/content.utils';
import { CategoryRepository } from './category.repository';
import { IResponse, RESPONSES } from 'src/shared/constants/common';

@Controller('category')
export class CategoryController implements IController<Category> {
    constructor(private repository: CategoryRepository) {}

    @Post('search')
    public async search(@Body() params: SearchModel): Promise<Category[]> {
        return this.repository.find({
            ...params,
            projection: '_id name createdAt articlesCount slug',
        });
    }

    @Get('articles')
    public async getCategoriesLatestArticles() {
        return this.repository.find({
            searchObject: {},
            page: 0,
            perPage: 100,
            projection: '-_id name slug image articles',
            populate: [
                { path: 'image', select: 'url title caption' },
                {
                    path: 'articles',
                    select: 'title slug featuredImage category',
                    populate: [
                        { path: 'featuredImage', select: 'url title caption' },
                        { path: 'category', select: '-_id name slug' },
                    ],
                },
            ],
            pipelineStages: [
                {
                    $addFields: {
                        articles: {
                            $slice: ['$articles', 0, 5],
                        },
                    },
                },
            ],
        });
    }

    @Post(':slug/articles')
    public async categoryArticles(@Param('slug') slug: string, @Body() params: SearchModel) {
        const searchObject = slug === 'undefined' ? {} : { slug };

        const categories = await this.repository.find({
            searchObject,
            page: 0,
            perPage: 100,
            projection: '-_id articles',
            populate: [
                {
                    path: 'articles',
                    select: 'title slug featuredImage category',
                    populate: [
                        { path: 'featuredImage', select: 'url title caption' },
                        { path: 'category', select: '-_id name slug' },
                    ],
                },
            ],
            pipelineStages: [
                {
                    $addFields: {
                        articles: {
                            $slice: [
                                '$articles',
                                params.page! * params.perPage!,
                                params.page! * params.perPage! + params.perPage!,
                            ],
                        },
                    },
                },
            ],
        });

        return categories[0]?.articles;
    }

    @Get(':slug')
    public async findOne(@Param('slug') slug: string): Promise<Category> {
        return this.repository.findOne({
            searchObject: { slug },
            projection: 'name slug image description',
            populate: [{ path: 'image', select: 'url title caption' }],
        });
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('')
    public async create(@Body() object: Category): Promise<Category> {
        return this.repository.create({ ...object, slug: getSlug(object.name) });
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Put(':slug')
    public async update(@Param('slug') slug: string, @Body() object: Category): Promise<Category> {
        const existingEntity = await this.repository.findOne({
            searchObject: { slug },
        });

        if (!existingEntity) {
            throw new NotFoundException();
        }
        return this.repository.update(existingEntity?._id, object);
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Delete(':slug')
    public async delete(@Param('slug') slug: string): Promise<IResponse> {
        const entity = await this.repository.findOne({ searchObject: { slug }, projection: '_id' });
        if (!entity) {
            throw new NotFoundException();
        }

        await this.repository.delete(entity._id);
        return RESPONSES.success;
    }
}
