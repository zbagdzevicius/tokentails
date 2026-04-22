import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class PipelineGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();

        return request.headers['mlaccesstoken'] === process.env.ML_ACCESS_TOKEN;
    }
}
