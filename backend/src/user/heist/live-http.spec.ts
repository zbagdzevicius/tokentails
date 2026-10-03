import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { request as httpRequest } from 'http';
import { AddressInfo } from 'net';
import * as passport from 'passport';
import { Strategy } from 'passport-strategy';
import { ArticleRepository } from 'src/article/article.repository';
import { CatRepository } from 'src/cat/cat.repository';
import { CatService } from 'src/cat/cat.service';
import { CommentRepository } from 'src/comment/comment.repository';
import { GameRepository } from 'src/game/game.repository';
import { ImageRepository } from 'src/image/image.repository';
import { AppThrottlerGuard, DEFAULT_THROTTLE } from 'src/shared/guards/app-throttler.guard';
import { ErrorCode } from 'src/shared-contracts/errors';
import { OrderRepository } from 'src/web3/order.repository';
import { AppValidationPipe } from '../dto/live-game.dto';
import { UserController } from '../user.controller';
import { UserRepository } from '../user.repository';
import { UserService } from '../user.service';
import { FakeGames, FakeUsers } from './fake-live-store.helper-spec';
import { goldenLog, withRuns } from './heist-test-logs.helper-spec';
import { applyBodyParsers } from './live-body-limit';
import { heistReplayQueue, ReplayQueueFullException } from './replay-queue';

jest.mock('../user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * POST /user/catbassadors/live over real HTTP through Nest, wired like main.ts: the body parsers,
 * the global AppValidationPipe, the global AppThrottlerGuard, the route guards (AppAuthGuard via a
 * stand-in `appauth` passport strategy, the Heist per-IP bucket, the per-player bucket), the route
 * pipe and the handler. Repositories are the in-memory fakes. Supertest is not a dependency, so the
 * spec uses Node's HTTP client.
 */

/** `appauth` stand-in: `accesstoken: fb<userId>` signs in as that user; anything else is 401. */
class TestAppAuthStrategy extends Strategy {
    name = 'appauth';
    authenticate(req: any) {
        const token = String(req.headers.accesstoken || '');
        if (!token.startsWith('fb')) {
            return this.fail(401);
        }
        return this.success({ _id: token.slice(2), isGuest: false });
    }
}

const users = new FakeUsers();
const games = new FakeGames();

@Module({
    imports: [ThrottlerModule.forRoot([DEFAULT_THROTTLE])],
    controllers: [UserController],
    providers: [
        { provide: APP_GUARD, useClass: AppThrottlerGuard },
        { provide: UserRepository, useValue: users },
        { provide: GameRepository, useValue: games },
        { provide: ArticleRepository, useValue: {} },
        { provide: CommentRepository, useValue: {} },
        { provide: CatRepository, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: OrderRepository, useValue: {} },
        { provide: CatService, useValue: {} },
        { provide: ImageRepository, useValue: {} },
    ],
})
class LiveTestModule {}

function send(app: INestApplication, body: unknown, userId?: string) {
    const { port } = app.getHttpServer().address() as AddressInfo;
    const payload = JSON.stringify(body);
    return new Promise<{ status: number; body: any; headers: Record<string, unknown> }>((resolve, reject) => {
        const req = httpRequest(
            {
                host: '127.0.0.1',
                port,
                path: '/user/catbassadors/live',
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload),
                    ...(userId ? { accesstoken: `fb${userId}` } : {}),
                },
            },
            res => {
                let text = '';
                res.setEncoding('utf8');
                res.on('data', chunk => (text += chunk));
                res.on('end', () =>
                    resolve({ status: res.statusCode || 0, body: text ? JSON.parse(text) : null, headers: res.headers })
                );
            }
        );
        req.on('error', reject);
        req.end(payload);
    });
}

describe('POST /user/catbassadors/live over HTTP (main.ts wiring)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        passport.use('appauth', new TestAppAuthStrategy() as any);
        app = await NestFactory.create(LiveTestModule, { logger: false, rawBody: true });
        applyBodyParsers(app);
        app.useGlobalPipes(new AppValidationPipe({ transform: true }));
        await app.listen(0, '127.0.0.1');
    });

    afterAll(async () => {
        await app?.close();
    });

    it('accepts an existing-mode save exactly as before (201, totals, one row)', async () => {
        const userId = users.add();
        const before = games.rows.length;
        const response = await send(app, { type: 'MATCH_3', level: '1', points: 11, score: 1234, time: 50 }, userId);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ match3Count: 11, match3ScoreCount: 1234, catnipCount: 11 });
        expect(games.rows.length - before).toBe(1);
        expect(games.rows[games.rows.length - 1]).toMatchObject({
            type: 'MATCH_3',
            level: '1',
            points: 11,
            score: 1234,
            time: 50,
            platform: 'web',
        });
    });

    it('still answers 401 without a token and 400 for an unknown field', async () => {
        expect((await send(app, { type: 'MATCH_3', level: '1', points: 1, time: 1 })).status).toBe(401);
        const bad = await send(app, { type: 'MATCH_3', level: '1', points: 1, time: 1, tails: 5 }, users.add());
        expect(bad.status).toBe(400);
        expect(bad.body.message).toEqual(['property tails should not exist']);
        expect(bad.body.code).toBeUndefined();
    });

    it('saves a valid Heist replay with the server score, then 409s the same log from another account', async () => {
        const log = goldenLog('heist-07');
        const first = await send(app, { type: 'CATNIP_HEIST', points: 99999, replay: log }, users.add());
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({ levelId: 'heist-07', score: log.score });
        const again = await send(app, { type: 'CATNIP_HEIST', replay: log }, users.add());
        expect(again.status).toBe(409);
        expect(again.body.code).toBe(ErrorCode.HEIST_DUPLICATE);
    });

    const codedCases: [string, () => unknown, string][] = [
        ['wrong sim version', () => ({ ...goldenLog(), simVersion: 2 }), ErrorCode.HEIST_SIM_VERSION],
        ['wrong seed', () => ({ ...goldenLog(), seed: 9 }), ErrorCode.HEIST_REPLAY_INVALID],
        ['unknown cat', () => ({ ...goldenLog(), catIds: ['bob', 'zzz'] }), ErrorCode.HEIST_REPLAY_INVALID],
        [
            'trailing input',
            () => withRuns(goldenLog(), [...goldenLog().runs, [0, 0, 0, 3]]),
            ErrorCode.HEIST_TRAILING_INPUT,
        ],
        ['not won', () => withRuns(goldenLog(), goldenLog().runs.slice(0, 10)), ErrorCode.HEIST_NOT_WON],
    ];
    it.each(codedCases)('gives 400 %s with its F5.6 code in the body', async (_name, replay, code) => {
        const response = await send(app, { type: 'CATNIP_HEIST', replay: replay() }, users.add());
        expect(response.status).toBe(400);
        expect(response.body.code).toBe(code);
    });

    it('gives 429 with a Retry-After header when the replay queue is full', async () => {
        const spy = jest.spyOn(heistReplayQueue, 'run').mockImplementation(() => {
            throw new ReplayQueueFullException(2);
        });
        const response = await send(app, { type: 'CATNIP_HEIST', replay: goldenLog('heist-08') }, users.add());
        spy.mockRestore();
        expect(response.status).toBe(429);
        expect(response.headers['retry-after']).toBe('2');
    });
});
