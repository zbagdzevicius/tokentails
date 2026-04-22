import { Controller, Get } from '@nestjs/common';
import { BlessingRepository } from './blessing/blessing.repository';
import { CatRepository } from './cat/cat.repository';
import { UserRepository } from './user/user.repository';
import { OrderRepository } from './web3/order.repository';
import { Cron, CronExpression } from '@nestjs/schedule';

type IDataRecord = Record<string, number>;

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
                count: await this.userRepository.model.count(),
                weekly: await this.userRepository.weeklyCount(),
            },
            cats: {
                count: await this.catRepository.model.count(),
                staked: await this.catRepository.model.count({ staked: { $ne: undefined } }),
            },
            blessings: {
                count: await this.blessingRepository.model.count(),
                weekly: await this.blessingRepository.weeklyCount(),
            },
            orders: {
                count: await this.orderRepository.model.count({ status: 'COMPLETE' }),
                weekly: await this.orderRepository.weeklyCount(),
            },
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
    }> {
        if (!this.counts) {
            await this.refreshCounts();
        }
        return this.counts!;
    }
}
