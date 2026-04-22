import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types } from 'mongoose';
import { CategoryRepository } from 'src/category/category.repository';
import { Category } from 'src/category/category.schema';
import { DefaultPerPage } from 'src/common/constants';
import { SearchModel } from 'src/common/validators';
import { commentsPopulate } from 'src/feed/feed.controller';
import { RESPONSES } from 'src/shared/constants/common';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { getSlug } from 'src/shared/utils/content.utils';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { IController } from '../shared/interfaces/controller.interface';
import { ArticleRepository } from './article.repository';
import { Article, ArticleSearchModel } from './article.schema';

@Controller('article')
export class ArticleController implements IController<Article> {
    constructor(private repository: ArticleRepository, private categoryRepository: CategoryRepository) {}

    @Post('category/:category')
    public async getCategoryArticles(
        @Param('category') category: string,
        @Body() params: SearchModel
    ): Promise<Article[]> {
        const cat = await this.categoryRepository.findOne({ searchObject: { slug: category }, projection: '_id' });
        const searchObject = !category ? {} : { category: cat?._id };
        return this.repository.find({
            searchObject,
            pipelineStages: [{ $sort: { createdAt: -1 } }],
            projection: 'title slug featuredImage category excerpt createdAt isDisabled',
            populate: [{ path: 'category', select: 'slug name' }, { path: 'featuredImage' }],
            perPage: DefaultPerPage,
            page: params.page,
        });
    }

    @Post('latest')
    public async getLatestArticles(@Body() params: SearchModel): Promise<Article[]> {
        return this.repository.find({
            searchObject: {},
            pipelineStages: [{ $sort: { createdAt: -1 } }],
            projection: 'title slug featuredImage category excerpt createdAt',
            populate: [{ path: 'category', select: 'slug name' }, { path: 'featuredImage' }],
            perPage: DefaultPerPage,
            page: params.page,
        });
    }

    @Get('random')
    public async getRandomPosts(category?: Types.ObjectId): Promise<Article[]> {
        const searchObject = !category ? {} : { category };
        return this.repository.find({
            searchObject,
            pipelineStages: [{ $sample: { size: 25 } }],
            projection: 'title slug featuredImage category excerpt createdAt',
            populate: [{ path: 'category', select: 'slug name' }, { path: 'featuredImage' }],
        });
    }

    @Post('search')
    public async search(@Body() params: ArticleSearchModel): Promise<Article[]> {
        let secondarySearchObject: any = null;
        if (params.category) {
            secondarySearchObject = { category: new Types.ObjectId(params.category!) };
        }
        let searchObject: any = {};
        if (params.query?.length) {
            searchObject = {
                $search: {
                    index: 'articles',
                    autocomplete: {
                        query: params.query,
                        path: 'title',
                    },
                },
            };
        }

        return this.repository.find({
            searchObject,
            secondarySearchObject,
            ...params,
            populate: [{ path: 'category', select: '-_id name slug' }, { path: 'featuredImage' }],
            projection: 'title excerpt createdAt featuredImage category slug isDisabled',
        });
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Delete(':slug')
    public async delete(@Param('slug') slug: string) {
        const existingArticle: Article = await this.repository.findOne({
            searchObject: { slug },
            projection: 'category',
        });
        if (!existingArticle) {
            throw new NotFoundException();
        }

        const id = existingArticle._id?.toString();
        const existingCategory: Category = await this.categoryRepository.get(existingArticle.category);
        const indexOfArticle = existingCategory?.articles?.findIndex(article => article.toString() === id);
        if (indexOfArticle !== -1 && existingCategory) {
            existingCategory.articles.splice(indexOfArticle, 1);
            await this.categoryRepository.update(existingArticle.category.toString(), {
                ...existingCategory,
                articles: existingCategory.articles,
                articlesCount: existingCategory.articles.length,
            });
        }

        await this.repository.delete(id);
        return RESPONSES.success;
    }

    @Get(':slug')
    public async findOne(
        @Param('slug') slug: string,
        @Query('skipLinks') skipLinks: string
    ): Promise<{ article: Article; randomArticles: Article[] }> {
        const [article, randomArticles] = await Promise.all([
            this.repository.findOne({
                searchObject: { slug },
                populate: [
                    { path: 'category', select: 'name slug' },
                    { path: 'featuredImage' },
                    { path: 'images' },
                    commentsPopulate,
                ],
                projection: {
                    excerpt: 1,
                    title: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    category: 1,
                    content: 1,
                    featuredImage: 1,
                    images: 1,
                    slug: 1,
                    isDisabled: 1,
                    comments: { $slice: ['$comments', 0, 1] },
                },
            }),
            this.getRandomPosts().catch(() => []),
        ]);

        if (skipLinks === 'true') {
            return { article, randomArticles };
        }

        return { article, randomArticles };
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('')
    public async create(@Body() object: any): Promise<Article> {
        if (!object.category) {
            throw new BadRequestException('Category is required');
        }

        const existingCategory: Category = await this.categoryRepository.get(object.category);
        const slug = getSlug(object.title);
        const article: Article = await this.repository.create({
            ...object,
            category: new Types.ObjectId(object.category),
            featuredImage: new Types.ObjectId(object.featuredImage),
            slug,
        });
        try {
            const articles = existingCategory.articles?.length
                ? [article._id, ...existingCategory.articles]
                : [article._id];
            await this.categoryRepository.update(existingCategory._id!.toString(), {
                articles,
                articlesCount: articles.length,
            });
            return article;
        } catch (e) {
            await this.repository.delete(article._id);
            throw new BadRequestException('Article category update failed');
        }
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Put(':slug')
    public async update(@Param('slug') slug: string, @Body() object: Article) {
        const existingArticle = await this.repository.findOne({
            searchObject: { slug },
        });

        if (!existingArticle) {
            throw new NotFoundException();
        }

        if (object.category) {
            object.category = new Types.ObjectId(object.category);
            object.featuredImage = new Types.ObjectId(object.featuredImage);
        }

        return this.repository.update(existingArticle?._id, object);
    }
}
