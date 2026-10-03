import { ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { readdirSync, readFileSync, statSync } from 'fs';
import { Types } from 'mongoose';
import { join, relative } from 'path';
import { AppValidationPipe } from './user/dto/live-game.dto';
import { runGuestMerge } from './user/guest/guest-lifecycle';
import { FakeUsers } from './user/heist/fake-live-store.helper-spec';
import { goldenLog } from './user/heist/heist-test-logs.helper-spec';
import { UserController } from './user/user.controller';

jest.mock('./user/user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * One writer (CLAUDE.md, plan F6): game scores are saved only through POST /user/catbassadors/live.
 * - Only `/live` creates Game rows (its plain branch in UserController and its Heist replay branch
 *   in src/user/heist/heist-live.ts, which also deletes its own row if the progress write fails).
 * - Only the guest merge re-parents Game rows (`updateMany`, with a per-row fallback). Erasing a
 *   guest deletes its own rows (`deleteMany`), which writes no score.
 * - Only `/live` sets `lastPlayedAt`. The guest merge `$max`es the guest's existing value into the
 *   target (a carry-over of a play `/live` already recorded, not a new play); readers only read it.
 *
 * The static half scans every non-spec source file, so a second writer added anywhere fails here.
 * The runtime half drives the real handlers with GameRepository mocked.
 */

const SRC = __dirname;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            return name === 'vendor' || name === 'node_modules' ? [] : sourceFiles(path);
        }
        return name.endsWith('.ts') && !name.endsWith('spec.ts') ? [path] : [];
    });
}

/** Source without comments, so a doc comment that names a method is not a call. */
const code = (path: string) =>
    readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const FILES = sourceFiles(SRC).map(path => ({ file: relative(SRC, path).split('\\').join('/'), text: code(path) }));

const GAME_WRITE =
    /\b(gameRepository|gameModel|games)(\.model)?\.(create|insertMany|insert|save|updateOne|updateMany|update|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite|deleteOne|deleteMany|delete|findOneAndDelete|findByIdAndDelete)\(/g;

function gameWriteSites() {
    return FILES.flatMap(({ file, text }) =>
        Array.from(text.matchAll(GAME_WRITE)).map(match => `${file}: ${match[1]}${match[2] || ''}.${match[3]}`)
    ).sort();
}

/** The body of a method of `UserController`, from its decorator block to the next decorator. */
function methodBody(text: string, name: string): string {
    const start = text.indexOf(`async ${name}(`);
    const next = text.indexOf('\n    @', start);
    return text.slice(start, next === -1 ? undefined : next);
}

describe('one writer for game scores', () => {
    describe('static scan of src/', () => {
        it('finds Game row writes only in /live (both branches) and the guest merge', () => {
            expect(gameWriteSites()).toEqual(
                [
                    'user/user.controller.ts: gameRepository.create',
                    'user/heist/heist-live.ts: games.create',
                    'user/heist/heist-live.ts: games.delete',
                    'user/guest/guest-lifecycle.ts: games.updateMany',
                    'user/guest/guest-lifecycle.ts: games.updateOne',
                    'user/guest/guest-lifecycle.ts: games.deleteOne',
                    // Erasing guest progress (DELETE /user/guest, G9) and a promotion that has no
                    // merge slot (user.service.ts) delete a guest's own rows; neither writes a score.
                    'user/guest/guest-lifecycle.ts: games.deleteMany',
                    'user/user.service.ts: games.deleteMany',
                ].sort()
            );
        });

        it('has exactly one gameRepository.create in UserController, inside the /live handler', () => {
            const controller = FILES.find(({ file }) => file === 'user/user.controller.ts')!.text;
            expect(controller.match(/gameRepository\.create\(/g)).toHaveLength(1);
            expect(methodBody(controller, 'Tcatbassadors')).toContain('gameRepository.create(');
            expect(methodBody(controller, 'Tcatbassadors')).toContain('saveHeistRun(');
            expect(controller).toMatch(/@Post\('catbassadors\/live'\)\s*async Tcatbassadors\(/);
        });

        it('uses the guest merge as the only updateMany on Game rows', () => {
            const sites = gameWriteSites().filter(site => site.endsWith('.updateMany'));
            expect(sites).toEqual(['user/guest/guest-lifecycle.ts: games.updateMany']);
        });

        it('mentions lastPlayedAt only where it is declared, written by /live, carried by the merge, or read', () => {
            const mentions = FILES.filter(({ text }) => text.includes('lastPlayedAt'))
                .map(({ file }) => file)
                .sort();
            expect(mentions).toEqual(
                [
                    'impact/impact.service.ts', // reads: active30d
                    'user/guest/guest-lifecycle.ts', // merge: $max of the guest's existing value
                    'user/heist/heist-live.ts', // /live, Heist branch: $set
                    'user/user.controller.ts', // /live, plain branch: $set
                    'user/user.schema.ts', // declaration
                ].sort()
            );
            const controller = FILES.find(({ file }) => file === 'user/user.controller.ts')!.text;
            const outsideLive = controller.replace(methodBody(controller, 'Tcatbassadors'), '');
            expect(outsideLive).not.toContain('lastPlayedAt');
            const impact = FILES.find(({ file }) => file === 'impact/impact.service.ts')!.text;
            impact
                .split('\n')
                .filter(line => line.includes('lastPlayedAt'))
                .forEach(line => expect(line).toMatch(/lastPlayedAt: \{ \$(exists|gte)/));
            const merge = FILES.find(({ file }) => file === 'user/guest/guest-lifecycle.ts')!.text;
            expect(merge.match(/lastPlayedAt\s*=(?!=)/g)).toEqual(['lastPlayedAt =']);
            expect(merge).toMatch(/max\.lastPlayedAt = new Date\(guest\.lastPlayedAt\)/);
        });
    });

    describe('runtime, with GameRepository mocked', () => {
        const mockGames = () => ({
            create: jest.fn(async (row: any) => ({ ...row, _id: new Types.ObjectId() })),
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn(),
            insertMany: jest.fn(),
            update: jest.fn(),
            updateAll: jest.fn(),
            updateMany: jest.fn(),
            updateOne: jest.fn(),
            delete: jest.fn(),
            model: { updateMany: jest.fn(), updateOne: jest.fn(), create: jest.fn(), insertMany: jest.fn() },
        });

        async function live(games: any, users: FakeUsers, userId: string, body: Record<string, unknown>) {
            const controller = Object.create(UserController.prototype);
            controller.pawMatchLeaderboardCache = new Map();
            controller.repository = users;
            controller.gameRepository = games;
            const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, UserController, 'Tcatbassadors') || {};
            const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
            const metatype = Reflect.getMetadata('design:paramtypes', UserController.prototype, 'Tcatbassadors')[
                bodyArg.index
            ];
            let value: unknown = body;
            for (const pipe of [
                new AppValidationPipe({ transform: true }),
                ...(bodyArg.pipes || []),
            ] as ValidationPipe[]) {
                value = await pipe.transform(value, { type: 'body', metatype, data: undefined });
            }
            return controller.Tcatbassadors(userId, value, { res: { setHeader: jest.fn() } });
        }

        const writesOf = (games: ReturnType<typeof mockGames>) =>
            Object.entries(games)
                .flatMap(([name, fn]) =>
                    name === 'model'
                        ? Object.entries(fn as Record<string, jest.Mock>).map(
                              ([inner, mock]) => [`model.${inner}`, mock] as const
                          )
                        : [[name, fn] as const]
                )
                .filter(
                    ([name, mock]) => name !== 'findOne' && name !== 'find' && (mock as jest.Mock).mock.calls.length
                )
                .map(([name]) => name);

        it('a plain /live save creates one row and sets lastPlayedAt; nothing else writes Game rows', async () => {
            const games = mockGames();
            const users = new FakeUsers();
            const userId = users.add();
            await live(games, users, userId, { type: 'MATCH_3', level: '1', points: 3, time: 9, outcome: 'won' });
            expect(writesOf(games)).toEqual(['create']);
            expect(games.create).toHaveBeenCalledTimes(1);
            expect(users.get(userId).lastPlayedAt).toBeInstanceOf(Date);
        });

        it('a Heist /live save creates one row and sets lastPlayedAt', async () => {
            const games = mockGames();
            const users = new FakeUsers();
            const userId = users.add();
            await live(games, users, userId, { type: 'CATNIP_HEIST', replay: goldenLog('heist-02') });
            expect(writesOf(games)).toEqual(['create']);
            expect(users.get(userId).lastPlayedAt).toBeInstanceOf(Date);
        });

        it('a rejected /live save writes nothing and leaves lastPlayedAt unset', async () => {
            const games = mockGames();
            const users = new FakeUsers();
            const userId = users.add();
            await expect(
                live(games, users, userId, { type: 'MATCH_3', level: '1', points: 999, time: 1 })
            ).rejects.toThrow();
            await expect(
                live(games, users, userId, { type: 'CATNIP_HEIST', replay: { ...goldenLog('heist-02'), seed: 5 } })
            ).rejects.toThrow();
            expect(writesOf(games)).toEqual([]);
            expect(users.get(userId).lastPlayedAt).toBeUndefined();
        });

        it('the guest merge re-parents rows with updateMany and never creates one', async () => {
            const games = mockGames();
            games.model.updateMany.mockResolvedValue({ modifiedCount: 2 });
            const guestId = new Types.ObjectId();
            const targetId = new Types.ObjectId();
            const docs: Record<string, any> = {
                [String(guestId)]: {
                    _id: guestId,
                    isGuest: true,
                    mergedInto: targetId,
                    mergeState: 'started',
                    lastPlayedAt: new Date(),
                },
                [String(targetId)]: { _id: targetId, isGuest: false, cat: new Types.ObjectId() },
            };
            const userUpdates: any[] = [];
            const users = {
                findOne: jest.fn((filter: any) => ({ lean: async () => docs[String(filter._id)] || null })),
                updateOne: jest.fn(async (filter: any, update: any) => {
                    userUpdates.push(update);
                    const doc = docs[String(filter._id)];
                    if (doc && update.$set) Object.assign(doc, update.$set);
                    return { modifiedCount: doc ? 1 : 0 };
                }),
                deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
            };
            await runGuestMerge(
                {
                    users: users as any,
                    cats: {
                        deleteOne: jest.fn(),
                        updateMany: jest.fn(),
                        findOne: jest.fn(() => ({ lean: async () => null })),
                    } as any,
                    games: games.model as any,
                    firebase: { deleteUser: jest.fn(), revokeApple: jest.fn() } as any,
                    recomputeTotals: jest.fn(),
                } as any,
                docs[String(guestId)]
            ).catch(() => undefined);
            expect(games.model.updateMany).toHaveBeenCalledWith(
                { user: guestId },
                { $set: expect.objectContaining({ user: targetId }) }
            );
            expect(games.model.create).not.toHaveBeenCalled();
            expect(games.model.insertMany).not.toHaveBeenCalled();
            // The merge carries lastPlayedAt only with $max, never with $set.
            userUpdates.forEach(update => expect(update.$set || {}).not.toHaveProperty('lastPlayedAt'));
        });
    });
});
