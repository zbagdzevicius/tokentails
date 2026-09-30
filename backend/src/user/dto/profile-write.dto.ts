import { ValidationPipe } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { PERMISSION_LEVEL } from '../models/user.model';

/**
 * Body of the manager-only `POST /user/profile` and `PUT /user/profile/:id`.
 *
 * These are the only fields the CMS user form sends (cms/pages/users/[id].tsx). Anything else,
 * such as `tails`, `wallets` or a Mongo operator like `$set`, is rejected by `profileWritePipe`
 * so the raw body can no longer mass-assign arbitrary user fields.
 */
export class ProfileWriteDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsString()
    discount?: string;

    // The CMS sends '' when no shelter is picked yet and the shelter id otherwise.
    @IsOptional()
    @IsString()
    shelter?: string;

    // The CMS sends '' while the number field is empty.
    @IsOptional()
    @ValidateIf((_object, value) => value !== '')
    @IsInt()
    @Min(0)
    @Max(PERMISSION_LEVEL.ADMIN)
    permission?: number | '';
}

/**
 * Route-level pipe for the profile write routes. The global pipe in main.ts cannot use
 * `whitelist` because most request bodies are undecorated Mongoose schema classes, which
 * `whitelist` would strip to `{}`.
 */
export const profileWritePipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});
