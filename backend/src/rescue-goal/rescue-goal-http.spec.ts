import { INestApplication, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { Types } from 'mongoose';
import * as passport from 'passport';
import { Strategy } from 'passport-strategy';
import { ShelterController } from 'src/shelter/shelter.controller';
import { ShelterRepository } from 'src/shelter/shelter.repository';
import { UserService } from 'src/user/user.service';
import { RescueGoalController } from './rescue-goal.controller';
import { RescueGoalPledgeService } from './rescue-goal-pledge.service';
import { RescueGoalService } from './rescue-goal.service';

/*
 * Rescue Goals routes through real Nest and Express routing (plan G5 acceptance "Route spec:
 * /shelter/:id still reaches ShelterController"). rescue-goal-routes.spec.ts checks the AppModule
 * route table; this one sends HTTP requests to a minimal app holding both controllers, registered in
 * AppModule's order, with the services stubbed and a stand-in `appauth` strategy.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));
// ShelterController only needs UserService as an injection token here; the real one reads secrets on load.
jest.mock('src/user/user.service', () => ({ UserService: class UserService {} }));

const PLAYER = { _id: new Types.ObjectId(), permission: 1, isGuest: false };
const MANAGER = { _id: new Types.ObjectId(), permission: 4, isGuest: false };
const GUEST = { _id: new Types.ObjectId(), permission: 1, isGuest: true };

/** Stands in for the Firebase `appauth` strategy: a fixed user per `accesstoken`. */
class StubAppAuth extends Strategy {
    readonly name = 'appauth';
    authenticate(req: any) {
        const user = { fbplayer: PLAYER, fbmanager: MANAGER, fbguest: GUEST }[req.headers.accesstoken as string];
        if (user) {
            this.success({ ...user });
        } else {
            this.fail(401);
        }
    }
}

const shelterRepository = { findOne: jest.fn(async ({ searchObject }) => ({ shelter: searchObject._id })) };
const goals = {
    myGives: jest.fn(async () => ({ handler: 'myGives' })),
    managerList: jest.fn(async () => [{ handler: 'managerList' }]),
    getPublic: jest.fn(async (id: string) => ({ handler: 'getPublic', id })),
    list: jest.fn(async () => [{ handler: 'list' }]),
};
const pledges = { pledge: jest.fn(async () => ({ handler: 'pledge' })) };

@Module({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
    controllers: [ShelterController, RescueGoalController],
    providers: [
        { provide: ShelterRepository, useValue: shelterRepository },
        { provide: UserService, useValue: {} },
        { provide: RescueGoalService, useValue: goals },
        { provide: RescueGoalPledgeService, useValue: pledges },
    ],
})
class RoutesTestModule {}

describe('Rescue Goals over HTTP', () => {
    let app: INestApplication;
    let base: string;

    beforeAll(async () => {
        passport.use('appauth', new StubAppAuth());
        app = await NestFactory.create(RoutesTestModule, { logger: false });
        await app.listen(0, '127.0.0.1');
        base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    });

    afterAll(async () => {
        await app?.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    const call = async (method: string, path: string, token?: string, body?: unknown) => {
        const res = await fetch(base + path, {
            method,
            headers: {
                ...(token ? { accesstoken: token } : {}),
                ...(body ? { 'content-type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
    };

    it('GET /shelter/:id still reaches ShelterController', async () => {
        const id = String(new Types.ObjectId());
        const res = await call('GET', `/shelter/${id}`, 'fbplayer');
        expect(res).toEqual({ status: 200, body: { shelter: id } });
        expect(shelterRepository.findOne).toHaveBeenCalledTimes(1);
        expect(goals.getPublic).not.toHaveBeenCalled();
    });

    it('GET /rescue-goals/pledges/me reaches myGives, not GET /rescue-goals/:id', async () => {
        const res = await call('GET', '/rescue-goals/pledges/me', 'fbplayer');
        expect(res).toEqual({ status: 200, body: { handler: 'myGives' } });
        expect(goals.myGives).toHaveBeenCalledWith(expect.objectContaining({ _id: PLAYER._id, isGuest: false }));
        expect(goals.getPublic).not.toHaveBeenCalled();
    });

    it('GET /rescue-goals/admin/goals reaches the manager list', async () => {
        expect(await call('GET', '/rescue-goals/admin/goals', 'fbmanager')).toEqual({
            status: 200,
            body: [{ handler: 'managerList' }],
        });
        expect((await call('GET', '/rescue-goals/admin/goals', 'fbplayer')).status).toBe(403);
        expect(goals.getPublic).not.toHaveBeenCalled();
    });

    it('GET /rescue-goals and /rescue-goals/:id are public', async () => {
        const id = String(new Types.ObjectId());
        expect(await call('GET', '/rescue-goals')).toEqual({ status: 200, body: [{ handler: 'list' }] });
        expect(await call('GET', `/rescue-goals/${id}`)).toEqual({ status: 200, body: { handler: 'getPublic', id } });
    });

    it('guests get 403 and no token gets 401 before the pledge handler runs', async () => {
        const id = String(new Types.ObjectId());
        const body = { amount: 100, pledgeId: '6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f' };
        expect((await call('POST', `/rescue-goals/${id}/pledge`, 'fbguest', body)).status).toBe(403);
        expect((await call('POST', `/rescue-goals/${id}/pledge`, undefined, body)).status).toBe(401);
        expect((await call('GET', '/rescue-goals/pledges/me')).status).toBe(401);
        expect(pledges.pledge).not.toHaveBeenCalled();
        expect(goals.myGives).not.toHaveBeenCalled();

        expect(await call('POST', `/rescue-goals/${id}/pledge`, 'fbplayer', body)).toEqual({
            status: 201,
            body: { handler: 'pledge' },
        });
    });
});
