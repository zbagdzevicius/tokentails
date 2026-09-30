import { ValidationPipe } from '@nestjs/common';
import { ArticleController } from 'src/article/article.controller';
import { BlessingController } from 'src/blessing/blessing.controller';
import { CategoryController } from 'src/category/category.controller';
import { ImageController } from 'src/image/image.controller';
import { QuestController } from 'src/quest/quest.controller';
import { TicketController } from 'src/ticket/ticket.controller';
import { UserController } from 'src/user/user.controller';
import { DefaultPerPage } from './constants';
import { BlessingSearchModel, pickSearchParams, SearchModel } from './validators';

// Never read a local env file: the spec must behave the same on a clean checkout and in CI.
jest.mock('dotenv', () => ({ config: jest.fn() }));
// Modules that create API clients or keys at import time; none of them run here.
jest.mock('src/shared/encryption.service', () => ({ EncryptionService: class {} }));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai.utils', () => ({}));
jest.mock('src/shared/utils/ai-avatar', () => ({}));
jest.mock('src/shared/utils/ai-portrait', () => ({}));
jest.mock('src/shared/utils/image.utils', () => ({}));
jest.mock('src/user/firebase-admin.module', () => ({ FirebaseAdminModule: class {} }));

const FORBIDDEN = ['searchObject', 'secondarySearchObject', 'projection', 'pipelineStages', 'populate', 'collation'];

// What an attacker posts: the documented paging fields plus raw repository options.
const HOSTILE_BODY = {
    page: 0,
    perPage: 10,
    pipelineStages: [{ $lookup: { from: 'users', pipeline: [], as: 'u' } }],
    searchObject: { email: { $exists: true } },
    secondarySearchObject: {},
    projection: 'email wallets',
    populate: [{ path: 'user', select: 'email' }],
    collation: { locale: 'en' },
};

async function viaGlobalPipe(metatype: any, body: Record<string, unknown>) {
    // The pipe main.ts installs: no whitelist, so the extra keys survive validation.
    return new ValidationPipe({ transform: true }).transform(body, { type: 'body', metatype });
}

function expectNoRawOptions(find: jest.Mock, expected: Record<string, unknown> = {}) {
    expect(find).toHaveBeenCalledTimes(1);
    const params = find.mock.calls[0][0];
    for (const [key, value] of Object.entries(expected)) {
        expect(params[key]).toEqual(value);
    }
    for (const key of FORBIDDEN.filter(k => !(k in expected))) {
        expect(params[key]).toBeUndefined();
    }
    expect(JSON.stringify(params)).not.toContain('$lookup');
}

describe('pickSearchParams', () => {
    it('keeps paging and sort, drops everything else', () => {
        expect(pickSearchParams({ ...HOSTILE_BODY, sort: { sortBy: 'name', isAscending: true } } as any)).toEqual({
            page: 0,
            perPage: 10,
            sort: { sortBy: 'name', isAscending: true },
        });
    });

    it('falls back to the SearchModel defaults for missing or odd values', () => {
        expect(pickSearchParams({ page: -1, perPage: 'x', sort: { sortBy: { $gt: 1 } } } as any)).toEqual({
            page: 0,
            perPage: DefaultPerPage,
            sort: { sortBy: 'createdAt', isAscending: false },
        });
        expect(pickSearchParams(undefined)).toEqual({
            page: 0,
            perPage: DefaultPerPage,
            sort: { sortBy: 'createdAt', isAscending: false },
        });
    });
});

describe('search routes ignore raw repository options in the body', () => {
    it('POST /image/search (public)', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };
        const params = await viaGlobalPipe(SearchModel, HOSTILE_BODY);

        await ImageController.prototype.search.call({ repository }, params);
        expectNoRawOptions(repository.find);
    });

    it('POST /category/search (public)', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };

        await CategoryController.prototype.search.call({ repository }, await viaGlobalPipe(SearchModel, HOSTILE_BODY));
        expectNoRawOptions(repository.find, { projection: '_id name createdAt articlesCount slug' });
    });

    it('POST /quest/search (public)', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };

        await QuestController.prototype.search.call({ repository }, await viaGlobalPipe(SearchModel, HOSTILE_BODY));
        expectNoRawOptions(repository.find, {
            projection: 'name link image tails',
            populate: [{ path: 'image', select: 'url' }],
        });
    });

    it('POST /article/search (public)', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };

        await ArticleController.prototype.search.call({ repository }, await viaGlobalPipe(SearchModel, HOSTILE_BODY));
        const params = repository.find.mock.calls[0][0];
        expect(params.pipelineStages).toBeUndefined();
        expect(params.searchObject).toEqual({});
        expect(params.secondarySearchObject).toBeNull();
        expect(params.collation).toBeUndefined();
        expect(params.projection).toBe('title excerpt createdAt featuredImage category slug isDisabled');
    });

    it('POST /blessing/search keeps the shelter filter the handler built', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };
        const userRepository = { findOne: jest.fn().mockResolvedValue({ shelter: 'shelter-1', permission: 1 }) };
        const params = await viaGlobalPipe(BlessingSearchModel, {
            ...HOSTILE_BODY,
            shelter: '64b7f0c2a1b2c3d4e5f60719',
        });

        await BlessingController.prototype.search.call({ repository, userRepository }, params, 'user-1');
        const found = repository.find.mock.calls[0][0];
        expect(found.secondarySearchObject.shelter.toString()).toBe('64b7f0c2a1b2c3d4e5f60719');
        expect(found.pipelineStages).toBeUndefined();
        expect(found.searchObject).toEqual({});
        expect(JSON.stringify(found.populate)).not.toContain('email');
    });

    it('POST /user/search (manager) keeps its projection', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };

        await UserController.prototype.search.call({ repository }, await viaGlobalPipe(SearchModel, HOSTILE_BODY));
        expectNoRawOptions(repository.find, { searchObject: {}, projection: 'name email streak permission' });
    });

    it('POST /ticket/search and /ticket/search/unanswered (manager)', async () => {
        const repository = { find: jest.fn().mockResolvedValue([]) };
        const params = await viaGlobalPipe(SearchModel, HOSTILE_BODY);

        await TicketController.prototype.search.call({ repository }, params);
        expectNoRawOptions(repository.find);

        repository.find.mockClear();
        await TicketController.prototype.searchUnanswered.call({ repository }, params);
        expectNoRawOptions(repository.find, {
            searchObject: { answer: '' },
            populate: [{ path: 'user', select: 'twitter email spent' }],
        });
    });
});
