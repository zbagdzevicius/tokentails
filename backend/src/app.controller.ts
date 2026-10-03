import { Controller, Get } from '@nestjs/common';
import { BlessingRepository } from './blessing/blessing.repository';
import { CatRepository } from './cat/cat.repository';
import { UserRepository } from './user/user.repository';
import { OrderRepository } from './web3/order.repository';
import { Cron, CronExpression } from '@nestjs/schedule';
import { notGuestFilter } from './common/decorators/auth-user.decorator';

type IDataRecord = Record<string, number>;

/** Public traction counts (decision #13): guests and guest starter cats are excluded. */
export const NOT_GUEST_STARTER_FILTER = Object.freeze({ isGuestStarter: { $ne: true } });

@Controller()
export class AppController {
    counts: {
        users: {
            count: number;
            weekly: IDataRecord[];
        };
        cats: {
            count: number;
            staked: number;
        };
        blessings: {
            count: number;
            weekly: IDataRecord[];
        };
        orders: {
            count: number;
            weekly: IDataRecord[];
        };
        /** Persisted guest docs, reported apart from users (G1 `guestSessions`). */
        guestSessions: number;
    } | null = null;

    constructor(
        private blessingRepository: BlessingRepository,
        private catRepository: CatRepository,
        private userRepository: UserRepository,
        private orderRepository: OrderRepository
    ) {
        this.refreshCounts();
    }

    @Get()
    getHello(): string {
        return '1';
    }

    @Cron(CronExpression.EVERY_DAY_AT_10AM)
    async refreshCounts() {
        this.counts = {
            users: {
                count: await this.userRepository.model.count({ ...notGuestFilter() }),
                weekly: await this.userRepository.weeklyCount(),
            },
            cats: {
                count: await this.catRepository.model.count({ ...NOT_GUEST_STARTER_FILTER }),
                staked: await this.catRepository.model.count({
                    staked: { $ne: undefined },
                    ...NOT_GUEST_STARTER_FILTER,
                }),
            },
            blessings: {
                count: await this.blessingRepository.model.count(),
                weekly: await this.blessingRepository.weeklyCount(),
            },
            orders: {
                count: await this.orderRepository.model.count({ status: 'COMPLETE' }),
                weekly: await this.orderRepository.weeklyCount(),
            },
            guestSessions: await this.userRepository.model.count({ isGuest: true }),
        };
    }

    @Get('count')
    async getCounts(): Promise<{
        users: {
            count: number;
            weekly: IDataRecord[];
        };
        cats: {
            count: number;
            staked: number;
        };
        blessings: {
            count: number;
            weekly: IDataRecord[];
        };
        orders: {
            count: number;
            weekly: IDataRecord[];
        };
        guestSessions: number;
    }> {
        if (!this.counts) {
            await this.refreshCounts();
        }
        return this.counts!;
    }
}
