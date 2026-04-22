import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserService } from '../user.service';
import { AppAuthStrategy } from './auth.strategy';

@Injectable()
export class AuthStrategy extends PassportStrategy(AppAuthStrategy, 'appauth') {
    public constructor(private userService: UserService) {
        super({
            extractor: (request: any) => request.headers.accesstoken,
        });
    }

    async validate(payload: any): Promise<any> {
        if (payload.firebase) {
            return this.userService.getFirebaseUser(payload);
        } else {
            return this.userService.getTelegramUser(payload);
        }
    }
}
