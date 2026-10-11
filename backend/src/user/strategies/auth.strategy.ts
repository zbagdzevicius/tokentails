import { HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Request } from 'express';
import * as admin from 'firebase-admin';
import { Strategy } from 'passport-strategy';
import { FIREBASE_AUTH, UNAUTHORIZED } from './constants';
import { AppAuthStrategyOptions } from './interface';

export enum AuthStrategyType {
    fb = 'fb',
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

    // `req` is passed on so the app strategy can read the client IP (NewAccountThrottle, F5.2).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async validate(payload: any, _req?: Request): Promise<any> {
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
        if (id !== AuthStrategyType.fb) {
            this.fail(UNAUTHORIZED, 401);

            return;
        }
        await this.authFB(token, req);
    }

    // Every path below ends the request with exactly one of success(), fail() or error().
    private async authFB(idToken: string, req?: Request): Promise<void> {
        if (!idToken) {
            this.fail(UNAUTHORIZED, 401);

            return;
        }

        let auth: admin.auth.Auth;
        try {
            auth = admin.auth();
        } catch (e) {
            // Firebase Admin is not initialised: a server problem, so log it.
            this.logger.error(e);
            this.fail(e, 401);

            return;
        }

        let decodedIdToken: admin.auth.DecodedIdToken;
        try {
            decodedIdToken = await auth.verifyIdToken(idToken, this.checkRevoked);
        } catch (err) {
            this.fail({ err }, 401);

            return;
        }

        await this.validateDecodedIdToken(decodedIdToken, req);
    }

    private async validateDecodedIdToken(decodedIdToken: admin.auth.DecodedIdToken, req?: Request): Promise<void> {
        let result: any;
        try {
            result = await this.validate(decodedIdToken, req);
        } catch (err) {
            // A deliberate HTTP answer (403 EMAIL_UNVERIFIED, 409 ACCOUNT_CONFLICT, 429 NewAccountThrottle,
            // a 401 for a token without an email or a deleted account) reaches AppAuthGuard.handleRequest
            // unchanged, logged with the uid so a player's report can be traced. Anything else is a
            // server fault (database, starter cat, merge): logged in full and answered 500, not 401.
            if (err instanceof HttpException) {
                this.logger.warn(`auth refused uid=${decodedIdToken?.uid}: ${err.getStatus()} ${err.message}`);
                this.error(err);

                return;
            }
            this.logger.error(`auth failed uid=${decodedIdToken?.uid}`, err instanceof Error ? err.stack : String(err));
            this.error(new InternalServerErrorException());

            return;
        }

        if (result) {
            this.success(result, result);

            return;
        }

        this.fail(UNAUTHORIZED, 401);
    }
}
