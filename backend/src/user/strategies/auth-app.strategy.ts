import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { requestIp } from '../guest/ip-throttle';
import { ANONYMOUS_PROVIDER, UserService } from '../user.service';
import { AppAuthStrategy } from './auth.strategy';

@Injectable()
export class AuthStrategy extends PassportStrategy(AppAuthStrategy, 'appauth') {
    public constructor(private userService: UserService) {
        super({
            extractor: (request: any) => request.headers.accesstoken,
        });
    }

    /**
     * F5.2: an anonymous Firebase token (no email) resolves to a guest; every other provider needs
     * an email. `req` gives the client IP to the new-account throttle.
     */
    async validate(payload: any, req?: any): Promise<any> {
        if (!payload?.firebase) {
            throw new UnauthorizedException();
        }
        const anonymous = payload.firebase.sign_in_provider === ANONYMOUS_PROVIDER;
        if (!anonymous && (typeof payload.email !== 'string' || !payload.email.trim())) {
            throw new UnauthorizedException();
        }

        return this.userService.getFirebaseUser(payload, { ip: requestIp(req) });
    }
}
