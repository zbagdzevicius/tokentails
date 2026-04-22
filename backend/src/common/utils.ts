import { isNil, omitBy } from 'lodash';
import { Types } from 'mongoose';
import { ICat } from 'src/cat/cat.schema';

export function getCleanObject<T>(object: T): T {
    return omitBy(object as object, isNil) as T;
}

export function randomObjectFromArray<T>(items?: T[]): T | null {
    if (!items?.length) {
        return null;
    }
    return items[Math.floor(Math.random() * items.length)];
}

export function generateRandomNumber() {
    const randomNumber = Math.floor(Math.random() * 100000000000) + 100;
    const randomString = randomNumber;
    return randomString;
}

export const propsToIds = <T extends object>(object: T, keys: Array<keyof T>): T => {
    keys.forEach(key => {
        if (object[key]) {
            (object[key] as object) = new Types.ObjectId(object[key] as any);
        }
    });
    return object;
};

export function sum(numbers: number[]) {
    return numbers.reduce((partialSum, a) => partialSum + a, 0);
}

const date = 9;
export const getPhase = () => {
    // Use UTC date to ensure consistent date calculation globally
    const now = new Date();
    const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startDate = new Date(Date.UTC(2025, 5, date)); // June 9, 2025 in UTC

    // If now is before the start date, return phase 1
    if (nowUTC < startDate) {
        return 1;
    }

    // Calculate how many months have passed since the start date
    const monthsPassed =
        (nowUTC.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (nowUTC.getUTCMonth() - startDate.getUTCMonth());

    // Calculate how many 9th days have been passed
    // Add 1 because we start with phase 1
    let phaseCount = monthsPassed;

    // If we're past the 9th day in the current month, add one more phase
    if (nowUTC.getUTCDate() >= date) {
        phaseCount += 1;
    }

    return phaseCount;
};

export const dateUntilNearest9thDay = () => {
    const now = new Date();
    const currentDayUTC = now.getUTCDate();
    const currentMonthUTC = now.getUTCMonth();
    const currentYearUTC = now.getUTCFullYear();

    let nearest9thDay;

    if (currentDayUTC < 9) {
        // 9th day of current month in UTC
        nearest9thDay = new Date(Date.UTC(currentYearUTC, currentMonthUTC, date));
    } else {
        // 9th day of next month in UTC
        nearest9thDay = new Date(Date.UTC(currentYearUTC, currentMonthUTC + 1, date));
    }

    return nearest9thDay;
};

export const isLessThan2hoursLeft = () => {
    const now = new Date();
    const till9th = dateUntilNearest9thDay();
    const timeDifference = till9th.getTime() - now.getTime();
    return timeDifference > 0 && timeDifference < 2 * 60 * 60 * 1000;
};
