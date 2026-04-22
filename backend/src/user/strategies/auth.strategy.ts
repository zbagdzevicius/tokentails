import { Logger } from '@nestjs/common';
import { parse, validate } from '@telegram-apps/init-data-node';
import { Request } from 'express';
import * as admin from 'firebase-admin';
import { Strategy } from 'passport-strategy';
import { FIREBASE_AUTH, UNAUTHORIZED } from './constants';
import { AppAuthStrategyOptions } from './interface';

const token = process.env.IS_PROD
    ? '7272637596:AAFevpGvCz8FihNMVNHb9wKp7gWE2XNO1z8'
    : '7301750942:AAFIp86b_a6AB-6xyPwqAfVSm52lXn1-mHs';

export enum AuthStrategyType {
    fb = 'fb',
    tg = 'tg',
}

export class AppAuthStrategy extends Strategy {
    readonly name = FIREBASE_AUTH;
    private checkRevoked = false;

    constructor(
        options: AppAuthStrategyOptions,
        private extractor: (param: any) => string,
        private logger = new Logger(AppAuthStrategy.name)
    ) {
        super();

        if (!options.extractor) {
            throw new Error(
                '\n Extractor is not a function. You should provide an extractor. \n Read the docs: https://github.com/tfarras/nestjs-firebase-auth#readme'
            );
        }

        this.extractor = options.extractor;
        this.checkRevoked = !!options.checkRevoked;
    }

    async validate(payload: any): Promise<any> {
        return payload;
    }

    async authenticate(req: Request): Promise<void> {
        const idToken = this.extractor(req);
        if (!idToken?.length || idToken === 'null') {
            this.fail(UNAUTHORIZED, 401);

            return;
        }
        const id = idToken.slice(0, 2);
        const token = idToken.slice(2);
        if (id === AuthStrategyType.fb) {
            this.authFB(req, token);
        } else {
            await this.authTG(req, idToken);
        }
    }

    private async authTG(req: Request, idToken: string) {
        if (!idToken) {
            this.fail(UNAUTHORIZED, 401);

            return;
        }
        const parsed = parse(idToken);

        try {
            validate(idToken, token);

            await this.validateDecodedIdToken(parsed);
        } catch (e) {
            console.warn(e);
            this.fail(UNAUTHORIZED, 400);
        }
    }

    private authFB(req: Request, idToken: string) {
        if (!idToken) {
            this.fail(UNAUTHORIZED, 401);

            return;
        }

        try {
            admin
                .auth()
                .verifyIdToken(idToken, this.checkRevoked)
                .then(res => this.validateDecodedIdToken(res))
                .catch(err => {
                    this.fail({ err }, 401);
                });
        } catch (e) {
            this.logger.error(e);

            this.fail(e, 401);
        }
    }

    private async validateDecodedIdToken(decodedIdToken: any) {
        const result = await this.validate(decodedIdToken);

        if (result) {
            this.success(result, result);
        }

        this.fail(UNAUTHORIZED, 401);
    }
}
