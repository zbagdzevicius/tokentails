import { ValidationPipe } from '@nestjs/common';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

/** Body of `POST /user/catbassadors/referral` (decision #12). */
export class ReferralDto {
    @IsMongoId()
    referrerId: string;
}

/** Body of `DELETE /user/me` (G9). The code comes from a fresh native Sign in with Apple prompt. */
export class DeleteAccountDto {
    @IsOptional()
    @IsString()
    @MaxLength(2048)
    appleAuthorizationCode?: string;
}

/** Strict pipe for the identity routes: unknown fields are rejected. */
export const guestBodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});
