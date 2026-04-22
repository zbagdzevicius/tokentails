import { createParamDecorator, ExecutionContext, MethodNotAllowedException } from '@nestjs/common';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';

export interface JwtPayload {
    id: string;
    name: string;
    imageUrl: string;
    permission: PERMISSION_LEVEL;
    exp: number;
    iat: number;
}

export const USER_ID: any = createParamDecorator((data, ctx: ExecutionContext) => {
    const request: Request & any = ctx.switchToHttp().getRequest();
    if (!request.user) {
        throw new MethodNotAllowedException('user not found');
    }

    return request.user._id;
});

export const JWT_USER: any = createParamDecorator((data, ctx: ExecutionContext): JwtPayload => {
    const request: Request & any = ctx.switchToHttp().getRequest();
    if (!request.user) {
        throw new MethodNotAllowedException('user not found');
    }

    return request.user;
});
