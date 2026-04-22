import { CanActivate, ExecutionContext, mixin } from '@nestjs/common';

export const PermissionGuard: any = (permission: number) => {
    class PermissionGuardMixin implements CanActivate {
        canActivate(context: ExecutionContext) {
            const request = context.switchToHttp().getRequest();
            const user = request.user;
            return user.permission >= permission;
        }
    }

    return mixin(PermissionGuardMixin);
};
