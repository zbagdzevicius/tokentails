import { Controller, Get, Post } from '@nestjs/common';
import { Types } from 'mongoose';
import { ArticleRepository } from 'src/article/article.repository';
import { CategoryRepository } from 'src/category/category.repository';
import { ICategory } from 'src/category/category.schema';
import { IGenericSearchParams } from 'src/common/base.repository';
import { DefaultPerPage } from 'src/common/constants';
import { IFeedEntity } from './feed.model';

export const commentsSlicePipelineState = {
    $addFields: {
        comments: {
            $slice: ['$comments', 0, 1],
        },
    },
};

export const commentsPopulate = {
    path: 'comments',
    select: 'text likes entity user createdAt',
    populate: { path: 'user', select: 'name' },
};

@Controller('feed')
export class FeedController {
    categories: ICategory[];

    constructor(private articleRepository: ArticleRepository, private categoryRepository: CategoryRepository) {}

    private async setCategories() {
        if (this.categories?.length) {
            return;
        }
        await this.categoryRepository
            .find({ searchObject: {}, projection: 'slug' })
            .then(categories => (this.categories = categories));
    }

    private async preprocessParams(params?: IGenericSearchParams) {
        if (!params?.searchObject) {
            return;
        }
        if (params.searchObject.category) {
            if (Types.ObjectId.isValid(params.searchObject.category)) {
                params.searchObject.category = new Types.ObjectId(params.searchObject.category);
                return;
            }
            await this.setCategories();

            params.searchObject.category = this.categories.find(
                category => category.slug === params.searchObject.category
            )?._id;
        }
        if (params.searchObject.group) {
            if (Types.ObjectId.isValid(params.searchObject.group)) {
                params.searchObject.group = new Types.ObjectId(params.searchObject.group);
                return;
            }
        }
    }

    private async getArticles(size = DefaultPerPage - 2, params?: IGenericSearchParams) {
        await this.preprocessParams(params);
        const pipelineStages = [];
        const paramsExist = params?.page !== undefined;
        if (!paramsExist) {
            pipelineStages.push({ $sample: { size } });
        }
        pipelineStages.push(commentsSlicePipelineState);
        return this.articleRepository.find({
            searchObject: { ...(params?.searchObject || {}), isDisabled: false },
            page: paramsExist ? params?.page : undefined,
            sort: { sortBy: 'createdAt', isAscending: false },
            pipelineStages,
            projection: 'title slug featuredImage category excerpt createdAt comments',
            populate: [
                { path: 'category', select: 'slug name' },
                { path: 'featuredImage', select: 'url title caption' },
                commentsPopulate,
            ],
        });
    }

    @Post('search')
    async feed(): Promise<IFeedEntity[]> {
        return Promise.all([this.getArticles()]).then(responses => responses?.flat(1));
    }

    @Get('slugs')
    async slugs() {
        const [article] = await Promise.all([this.articleRepository.getSlugs(true, { featuredImage: 1, title: 1 })]);
        return {
            article,
        };
    }
}
